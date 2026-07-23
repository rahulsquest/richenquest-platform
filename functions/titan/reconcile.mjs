/**
 * Reconciliation Engine — the correctness authority (ADR-006 as amended).
 *
 * Zoho does not document delivery guarantees, retry, duplicate or ordering
 * behaviour for actions/watch (architecture review, Phase 2 items 7-10). The
 * system is therefore NOT correct because events arrive; it is correct because
 * this sweep runs. Events supply latency, reconciliation supplies correctness.
 *
 * Mechanism: every N minutes, COQL-query each watched module for records whose
 * Modified_Time is newer than the last successful checkpoint, and feed anything
 * unseen through the same engine the event path uses. Idempotency in the engine
 * means a record already handled by an event is skipped cheaply.
 *
 * ── Checkpoint safety ──────────────────────────────────────────────────────
 * The checkpoint advances ONLY after a fully successful sweep, and only to the
 * high-water mark actually processed. A crash mid-sweep re-processes rather
 * than skips: at-least-once is recoverable (idempotency absorbs it), whereas
 * skipping loses a student's lead permanently.
 *
 * ── The metric that matters ────────────────────────────────────────────────
 * `missed` counts records this sweep found that the event path never delivered.
 * Sustained missed > 0 is the empirical measurement of Zoho's undocumented
 * delivery loss, and is the evidence that decides whether the native fallback
 * is ever retired (roadmap Stage 5).
 */

import { recordVersionKey } from "./store.mjs";

/** Overlap re-scanned each sweep so a record modified during the previous
 *  sweep's execution window cannot slip between checkpoints. */
const DEFAULT_OVERLAP_MS = 60_000;

/** India DC (Asia/Kolkata) has a fixed +05:30 offset and no DST. */
const DEFAULT_OFFSET_MIN = 330;

/**
 * Format an epoch-ms as a Zoho-CRM datetime literal: `YYYY-MM-DDTHH:mm:ss±HH:MM`.
 * Zoho COQL rejects `.toISOString()` output — it wants an explicit timezone
 * offset and no milliseconds ("value given seems to be invalid for the column"
 * otherwise). Exported because this format bug is subtle and worth pinning.
 */
export function toZohoDateTime(ms, offsetMinutes = DEFAULT_OFFSET_MIN) {
  const shifted = new Date(ms + offsetMinutes * 60_000);
  const p = (n) => String(n).padStart(2, "0");
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const oh = Math.floor(Math.abs(offsetMinutes) / 60);
  const om = Math.abs(offsetMinutes) % 60;
  return `${shifted.getUTCFullYear()}-${p(shifted.getUTCMonth() + 1)}-${p(shifted.getUTCDate())}` +
    `T${p(shifted.getUTCHours())}:${p(shifted.getUTCMinutes())}:${p(shifted.getUTCSeconds())}${sign}${p(oh)}:${p(om)}`;
}

/** Zoho module api_names are identifiers; anything else is a config error or
 *  an injection attempt into the COQL string. */
const MODULE_NAME = /^[A-Za-z][A-Za-z0-9_]*$/;

/** PURE: build the COQL for one module. Exported for testing. */
export function buildQuery(module, sinceIso, { limit = 200, offset = 0 } = {}) {
  // Guard the only two interpolated values. `module` comes from config and
  // `sinceIso` from toZohoDateTime (digits/`:+-T` only), but validating here
  // means a bad config can never smuggle a COQL fragment into the query.
  if (!MODULE_NAME.test(module)) throw new Error(`Invalid module name for COQL: "${module}"`);
  if (!/^[0-9T:+\-.]+$/.test(sinceIso)) throw new Error(`Invalid datetime for COQL: "${sinceIso}"`);
  // COQL requires an explicit field list; id + Modified_Time is all the engine
  // needs, because the engine re-hydrates the full record anyway.
  return `select id, Modified_Time from ${module} where Modified_Time > '${sinceIso}' order by Modified_Time asc limit ${offset},${limit}`;
}

/** PURE: decide the window to scan. */
export function planWindow(checkpoint, now, { overlapMs = DEFAULT_OVERLAP_MS, maxLookbackMs = 7 * 24 * 3600_000, offsetMinutes = DEFAULT_OFFSET_MIN } = {}) {
  // First run (no checkpoint): look back a bounded amount rather than all of
  // history, so an initial deploy cannot stampede the API.
  const since = checkpoint == null ? now - maxLookbackMs : Math.max(checkpoint - overlapMs, now - maxLookbackMs);
  return { sinceMs: since, sinceIso: toZohoDateTime(since, offsetMinutes) };
}

/**
 * @param {object} deps
 * @param {(coql:string)=>Promise<{data:Array,info?:object}>} deps.query  COQL executor
 * @param {object} deps.engine   createEngine() result
 * @param {TitanStore} deps.store
 * @param {object} deps.subscriptions  config/automation-events.json
 * @param {object} deps.logger
 * @param {object} deps.metrics
 */
export function createReconciler({ query, engine, store, subscriptions, logger, metrics, clock = Date.now, pageLimit = 200, maxPages = 25 }) {
  // Modules we care about, each mapped to a representative subscription so the
  // engine can resolve a channel/handler for reconciliation-sourced events.
  const moduleSubs = new Map();
  for (const s of subscriptions.subscriptions) {
    for (const ev of s.events) {
      const [mod, op] = String(ev).split(".");
      // Prefer an "edit" subscription: reconciliation detects modifications,
      // which includes creates (a created record has a Modified_Time too).
      const existing = moduleSubs.get(mod);
      if (!existing || (op === "edit" && existing.op !== "edit")) moduleSubs.set(mod, { sub: s, op });
    }
  }

  async function sweep({ dryRun = false } = {}) {
    const now = clock();
    const summary = { modules: {}, scanned: 0, missed: 0, duplicates: 0, failed: 0, dryRun };

    for (const [module, { sub }] of moduleSubs) {
      const cpName = `reconcile:${module}`;
      const checkpoint = await store.getCheckpoint(cpName);
      const { sinceMs, sinceIso } = planWindow(checkpoint, now);
      const log = logger.child({ module, since: sinceIso, dryRun });

      let offset = 0, pages = 0, scanned = 0, missed = 0, duplicates = 0, failed = 0;
      let highWater = sinceMs;

      try {
        for (;;) {
          const coql = buildQuery(module, sinceIso, { limit: pageLimit, offset });
          const res = await query(coql);
          const rows = res?.data ?? [];
          if (rows.length === 0) break;

          for (const row of rows) {
            scanned++;
            const modifiedMs = Date.parse(row.Modified_Time);
            if (Number.isFinite(modifiedMs)) highWater = Math.max(highWater, modifiedMs);

            // Was this already handled by the event path? The record-version
            // key is computed identically by both paths (see store.mjs).
            const key = recordVersionKey({ module, id: row.id, modifiedTime: row.Modified_Time });
            let already;
            try { already = await store.seen(key); }
            catch (err) { log.error("sweep aborted: store unavailable", { error: err.message }); throw err; }

            if (already) { duplicates++; continue; }

            missed++; // the event path did not deliver this — the key SLI
            if (dryRun) continue;

            const out = await engine.handle(
              { module, ids: [row.id], operation: "edit", channel_id: sub.channel_id, server_time: row.Modified_Time },
              { source: "reconciliation" }
            );
            if (out.outcome === "failed" || out.outcome === "no_handler") failed++;
          }

          if (!res?.info?.more_records) break;
          offset += pageLimit;
          if (++pages >= maxPages) { log.warn("sweep truncated at max pages", { maxPages }); break; }
        }

        // Advance the checkpoint ONLY on a clean sweep, and only to what we
        // actually processed. On failure we deliberately leave it behind so the
        // next sweep re-scans — duplicates are absorbed, gaps are not.
        if (!dryRun && failed === 0) await store.setCheckpoint(cpName, highWater);

        summary.modules[module] = { scanned, missed, duplicates, failed, checkpointAdvanced: !dryRun && failed === 0 };
        summary.scanned += scanned; summary.missed += missed; summary.duplicates += duplicates; summary.failed += failed;

        metrics.inc("reconcile.scanned", scanned, { module });
        metrics.inc("reconcile.missed", missed, { module });   // ← the SLI
        metrics.inc("reconcile.failed", failed, { module });
        log.info("sweep complete", { scanned, missed, duplicates, failed });
      } catch (err) {
        summary.modules[module] = { error: err.message };
        summary.failed++;
        metrics.inc("reconcile.error", 1, { module });
        log.error("sweep failed", { error: err.message });
      }
    }

    // A sustained non-zero `missed` is the empirical proof that events alone
    // are insufficient — surface it loudly rather than burying it in a counter.
    if (summary.missed > 0) {
      logger.warn("event path missed records — reconciliation closed the gap", { missed: summary.missed });
    }
    return summary;
  }

  return { sweep, _modules: [...moduleSubs.keys()] };
}
