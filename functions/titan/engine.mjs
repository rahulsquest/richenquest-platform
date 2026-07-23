/**
 * Titan Automation Engine — the dispatcher.
 *
 * Receives a CRM change notification (or a reconciliation-sourced event),
 * applies every safety guard, and routes to a business-logic handler.
 *
 * Guard order is deliberate and each guard maps to a risk in the architecture
 * review (docs/architecture/titan-event-architecture-review.md §Phase 3):
 *
 *   1. authenticate   — token + channel_id          → R7 forged/replayed events
 *   2. resolve tenant — channel_id → tenant          → R11 cross-tenant leakage
 *   3. deduplicate    — idempotency key, fail-closed → R2 duplicate delivery
 *   4. hydrate        — re-fetch from CRM            → R7 (payload carries IDs only,
 *                                                       so forged data cannot enter)
 *   5. loop-break     — skip our own writes          → R9 infinite update loop
 *   6. dispatch       — handler + retry + dead-letter→ R10 partial failure
 *
 * The engine never trusts the notification body for anything except identity.
 * All field data comes from an authenticated CRM read.
 */

import { idempotencyKey, recordVersionKey } from "./store.mjs";
import { retryAsync } from "../zoho/http.mjs";

export const OUTCOMES = {
  PROCESSED: "processed",
  DUPLICATE: "duplicate",
  LOOP_BREAK: "loop_break",
  DEFERRED: "deferred",
  REJECTED: "rejected",
  NO_HANDLER: "no_handler",
  FAILED: "failed",
};

const DEFAULT_TTL_MS = 7 * 24 * 3600_000; // 7 days — comfortably longer than any retry window

/**
 * @param {object} deps
 * @param {TitanStore} deps.store
 * @param {(module:string,id:string)=>Promise<object|null>} deps.fetchRecord  authenticated CRM read
 * @param {Record<string,Function>} deps.handlers   handler name → async (record, ctx) => any
 * @param {object} deps.subscriptions               config/automation-events.json
 * @param {string} deps.automationUserId            CRM user id our writes run as (loop-breaker)
 * @param {object} deps.logger
 * @param {object} deps.metrics
 */
export function createEngine({ store, fetchRecord, handlers, subscriptions, automationUserId, logger, metrics, ttlMs = DEFAULT_TTL_MS, tries = 3, delayMs = 300 }) {
  // channel_id → subscription. Built once; the authority for tenant + handler.
  const byChannel = new Map(subscriptions.subscriptions.map((s) => [String(s.channel_id), s]));

  /**
   * Handle one notification.
   * @param {object} notification  Zoho callback body
   * @param {{source?:"event"|"reconciliation"}} [opts]
   */
  async function handle(notification, { source = "event" } = {}) {
    const started = Date.now();
    const { module, ids = [], operation, channel_id, token, server_time } = notification ?? {};
    const log = logger.child({ channel_id, module, operation, source });

    // ── 1. authenticate ────────────────────────────────────────────────────
    const sub = byChannel.get(String(channel_id));
    if (!sub) {
      // An unknown channel is either drift or a forged request. Never process.
      log.warn("rejected: unknown channel_id");
      metrics.inc("engine.rejected", 1, { reason: "unknown_channel" });
      return { outcome: OUTCOMES.REJECTED, reason: "unknown_channel" };
    }
    // Reconciliation-sourced events are internally generated and carry no token.
    if (source === "event" && !constantTimeEqual(String(token ?? ""), expectedToken(sub))) {
      log.warn("rejected: token mismatch");
      metrics.inc("engine.rejected", 1, { reason: "bad_token" });
      return { outcome: OUTCOMES.REJECTED, reason: "bad_token" };
    }

    const results = [];
    for (const id of ids) {
      results.push(await handleOne({ sub, module, id, operation, server_time, source, log }));
    }
    metrics.time("engine.batch_ms", Date.now() - started);
    return { outcome: results.length === 1 ? results[0].outcome : OUTCOMES.PROCESSED, results };
  }

  async function handleOne({ sub, module, id, operation, server_time, source, log }) {
    const l = log.child({ record_id: id });
    const deliveryKey = idempotencyKey({ module, id, operation, server_time });

    // ── 3a. deduplicate — DELIVERY pre-check (cheap, no API call) ──────────
    // Catches literal redelivery of the same callback before we spend a read.
    try {
      if (await store.seen(deliveryKey)) {
        l.info("skipped: duplicate delivery");
        metrics.inc("engine.duplicate", 1, { stage: "delivery" });
        return { outcome: OUTCOMES.DUPLICATE, id };
      }
    } catch (err) {
      // Store unavailable. Defer rather than risk a duplicate side effect —
      // reconciliation will pick this record up on its next sweep.
      l.error("deferred: idempotency store unavailable", { error: err.message });
      metrics.inc("engine.deferred", 1, { reason: "store_unavailable" });
      return { outcome: OUTCOMES.DEFERRED, id, reason: "store_unavailable" };
    }

    // ── 4. hydrate from CRM (authoritative) ────────────────────────────────
    let record;
    try {
      record = await retryAsync(() => fetchRecord(module, id), { tries, delayMs });
    } catch (err) {
      l.error("failed: hydrate", { error: err.message });
      metrics.inc("engine.failed", 1, { stage: "hydrate" });
      await safeDeadLetter({ module, id, operation, stage: "hydrate", error: err.message }, l);
      return { outcome: OUTCOMES.FAILED, id, stage: "hydrate" };
    }
    if (!record) {
      // Deleted between event and fetch — legitimate, not an error.
      l.info("skipped: record no longer exists");
      metrics.inc("engine.vanished");
      await store.remember(deliveryKey, ttlMs);
      return { outcome: OUTCOMES.PROCESSED, id, note: "vanished" };
    }

    // ── 4b. deduplicate — RECORD-VERSION check (authoritative) ─────────────
    // Both the event path and reconciliation compute this identically from the
    // record itself, so work done by one is visible to the other. Without it,
    // reconciliation re-processes event-handled records and over-reports the
    // `missed` delivery-loss metric.
    const versionKey = recordVersionKey({ module, id, modifiedTime: record.Modified_Time ?? record.modified_time });
    if (versionKey) {
      try {
        if (await store.seen(versionKey)) {
          l.info("skipped: duplicate record version");
          metrics.inc("engine.duplicate", 1, { stage: "version" });
          await store.remember(deliveryKey, ttlMs);
          return { outcome: OUTCOMES.DUPLICATE, id };
        }
      } catch (err) {
        l.error("deferred: idempotency store unavailable", { error: err.message });
        metrics.inc("engine.deferred", 1, { reason: "store_unavailable" });
        return { outcome: OUTCOMES.DEFERRED, id, reason: "store_unavailable" };
      }
    } else {
      // Degraded: no version to key on, so cross-path dedupe is unavailable for
      // this record and reconciliation may redo it. Surfaced, never silent.
      l.warn("record has no Modified_Time — cross-path dedupe unavailable");
      metrics.inc("engine.no_version_key");
    }

    // ── 5. loop-breaker ────────────────────────────────────────────────────
    if (isOurOwnWrite(record, automationUserId)) {
      l.debug("skipped: our own write (loop-breaker)");
      metrics.inc("engine.loop_break");
      await store.remember(deliveryKey, ttlMs);
      if (versionKey) await store.remember(versionKey, ttlMs);
      return { outcome: OUTCOMES.LOOP_BREAK, id };
    }

    // ── 6. dispatch ────────────────────────────────────────────────────────
    const handler = handlers[sub.handler];
    if (!handler) {
      // Fail loudly: a declared-but-missing handler silently discards business
      // events, which is exactly the failure mode CI validation exists to stop.
      l.error("failed: no handler registered", { handler: sub.handler });
      metrics.inc("engine.no_handler");
      await safeDeadLetter({ module, id, operation, stage: "dispatch", error: `no handler "${sub.handler}"` }, l);
      return { outcome: OUTCOMES.NO_HANDLER, id, handler: sub.handler };
    }

    const t0 = Date.now();
    try {
      const out = await retryAsync(() => handler(record, { module, id, operation, subscription: sub, logger: l }), { tries, delayMs });
      await store.remember(deliveryKey, ttlMs);
      if (versionKey) await store.remember(versionKey, ttlMs);
      metrics.time("handler.ms", Date.now() - t0);
      metrics.inc("engine.processed", 1, { handler: sub.handler });
      l.info("processed", { handler: sub.handler, ms: Date.now() - t0 });
      return { outcome: OUTCOMES.PROCESSED, id, result: out };
    } catch (err) {
      // Do NOT remember the key: an unprocessed event must remain eligible for
      // reconciliation to retry later.
      l.error("failed: handler", { handler: sub.handler, error: err.message });
      metrics.inc("engine.failed", 1, { stage: "handler", handler: sub.handler });
      await safeDeadLetter({ module, id, operation, stage: "handler", handler: sub.handler, error: err.message }, l);
      return { outcome: OUTCOMES.FAILED, id, stage: "handler" };
    }
  }

  async function safeDeadLetter(entry, l) {
    try { await store.deadLetter(entry); }
    catch (err) { l.error("dead-letter write failed — event may be lost", { error: err.message }); }
  }

  return { handle, _byChannel: byChannel };
}

/** Token echoed by Zoho; must match what the provisioner set. ≤50 chars (Zoho limit). */
export function expectedToken(sub) {
  return `rq-${sub.name}`.slice(0, 50);
}

/** Timing-safe string compare — avoids leaking the token via response timing. */
export function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Loop-breaker (R9). A record last modified by the automation user is our own
 * write echoing back; processing it would trigger another write, and so on
 * until API credits are exhausted.
 */
export function isOurOwnWrite(record, automationUserId) {
  if (!automationUserId) return false;
  const modifier = record?.Modified_By?.id ?? record?.modified_by?.id;
  return String(modifier ?? "") === String(automationUserId);
}
