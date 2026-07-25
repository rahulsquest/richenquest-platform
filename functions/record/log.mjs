/**
 * Career Record — the write path and the storage port.
 *
 * Architecture: docs/25-career-record-architecture.md §1, §10.
 *
 * The append function here is the ONLY way an event enters the system. No
 * interface writes storage directly; that is what makes the invariants in
 * policy.mjs unbypassable rather than merely documented.
 *
 * The store is a port with four methods. Catalyst Data Store backs it today and
 * will not in 2036 — and that is fine, because an append-only log migrates by
 * replay rather than by migration. That is the single strongest reason to be
 * event-sourced here.
 */

import { makeEvent, hashEvent, verifyChain } from "./event.mjs";
import { assertInvariants, TYPE_CLASSIFICATION, InvariantViolation } from "./policy.mjs";

/* ------------------------------------------------------- storage port ---- */

/**
 * @typedef {{
 *   append(subjectId: string, event: object, opts: {expectedSeq:number, idempotencyKey?:string}): Promise<object>,
 *   read(subjectId: string, opts?: {fromSeq?:number, toSeq?:number}): Promise<object[]>,
 *   head(subjectId: string): Promise<object|null>,
 *   scanAll(opts?: {fromEventId?:string}): Promise<object[]>
 * }} EventStore
 */

/**
 * In-memory store. Used by tests and by the export verifier; also the reference
 * implementation that any real adapter must behave identically to.
 */
export function memoryStore() {
  /** @type {Map<string, object[]>} */
  const bySubject = new Map();
  /** idempotency_key → event, so a retried append returns the original. */
  const seen = new Map();

  return {
    async append(subjectId, event, { expectedSeq, idempotencyKey } = {}) {
      if (idempotencyKey && seen.has(idempotencyKey)) return seen.get(idempotencyKey);

      const log = bySubject.get(subjectId) ?? [];
      const head = log.at(-1) ?? null;
      const actualSeq = head ? head.seq + 1 : 1;

      // Compare-and-set. No last-write-wins anywhere in this system.
      if (expectedSeq !== undefined && expectedSeq !== actualSeq) {
        const err = new Error(
          `conflict: expected seq ${expectedSeq} but the chain head is at ${head?.seq ?? 0} — re-read and retry`
        );
        err.code = "SEQ_CONFLICT";
        err.currentSeq = head?.seq ?? 0;
        throw err;
      }

      log.push(event);
      bySubject.set(subjectId, log);
      if (idempotencyKey) seen.set(idempotencyKey, event);
      return event;
    },

    async read(subjectId, { fromSeq = 1, toSeq = Infinity } = {}) {
      return (bySubject.get(subjectId) ?? []).filter((e) => e.seq >= fromSeq && e.seq <= toSeq);
    },

    async head(subjectId) {
      return (bySubject.get(subjectId) ?? []).at(-1) ?? null;
    },

    async scanAll({ fromEventId = "" } = {}) {
      return [...bySubject.values()]
        .flat()
        .filter((e) => e.event_id > fromEventId)
        .sort((a, b) => (a.event_id < b.event_id ? -1 : 1));
    },

    /** Test-only seam: lets a test simulate tampering that a real store forbids. */
    _raw: bySubject,
  };
}

/* ----------------------------------------------------------- the write --- */

/**
 * Append one event. The whole write path, in order:
 *   1. resolve classification (default deny for unregistered types)
 *   2. read the chain head
 *   3. seal the envelope (position in the chain is part of what is hashed)
 *   4. assert every invariant
 *   5. append with compare-and-set
 *
 * Note the ordering: the event is hashed BEFORE invariants are checked, so the
 * thing we validate is byte-identical to the thing we store.
 */
export async function appendEvent(store, input, ctx = {}) {
  const { subjectId, type } = input;
  if (!subjectId) throw new InvariantViolation("I0", "subjectId is required");

  const classification = input.classification ?? TYPE_CLASSIFICATION[type];
  if (!classification) {
    throw new InvariantViolation(
      "I11",
      `unknown event type "${type}" — register it in TYPE_CLASSIFICATION with a classification first (default deny)`
    );
  }

  const head = await store.head(subjectId);
  const event = makeEvent({
    ...input,
    classification,
    seq: head ? head.seq + 1 : 1,
    prevHash: head ? head.hash : null,
  });

  assertInvariants(event, { head, subject: ctx.subject ?? {} });

  return store.append(subjectId, event, {
    expectedSeq: event.seq,
    idempotencyKey: input.idempotencyKey,
  });
}

/**
 * Record a correction. Deliberately a separate function from appendEvent so that
 * "correcting" is never something that happens by passing an extra flag: it is an
 * explicit act that produces an explicit event, and the original remains readable
 * forever (§2.2).
 */
export async function appendCorrection(store, { subjectId, corrects, type, actor, payload, reason }, ctx = {}) {
  const prior = (await store.read(subjectId)).find((e) => e.event_id === corrects);
  if (!prior) {
    throw new InvariantViolation("I6", `cannot correct ${corrects}: no such event for this subject`);
  }
  return appendEvent(
    store,
    {
      subjectId,
      type,
      actor,
      corrects,
      causedBy: corrects,
      evidence: prior.evidence,
      disclosure: prior.disclosure,
      payload: { ...payload, correction_reason: reason, corrected_type: prior.type },
    },
    ctx
  );
}

/* -------------------------------------------------------- verification --- */

/** Verify a subject's whole chain. */
export async function verifySubject(store, subjectId) {
  return verifyChain(await store.read(subjectId));
}

/**
 * Write a checkpoint recording the current chain head, so a verifier can start
 * from the last trusted digest instead of genesis (§5.2, §12.1).
 */
export async function writeCheckpoint(store, subjectId, actor = { kind: "system", id: "checkpointer", role: "administrator" }) {
  const head = await store.head(subjectId);
  return appendEvent(store, {
    subjectId,
    type: "record.checkpoint_written",
    actor,
    payload: { chain_head: head?.hash ?? null, events_at_checkpoint: head?.seq ?? 0 },
  });
}

export { hashEvent, verifyChain };
