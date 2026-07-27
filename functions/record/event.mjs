/**
 * Career Record — event envelope, canonicalisation and hash chaining.
 *
 * Architecture: docs/25-career-record-architecture.md §2, §5.
 *
 * Everything in this file exists to make one sentence true: RichenQuest cannot
 * alter its own history undetectably. Zero dependencies — node:crypto only —
 * because a verifier a student runs in 2036 must not need a package registry.
 */

import { createHash, randomBytes } from "node:crypto";

/* ------------------------------------------------------------------ ULID --- */

const B32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford: no I, L, O, U

/**
 * ULID: 48-bit millisecond timestamp + 80 bits of randomness, base32.
 * Chosen over UUIDv4 because event ids sort chronologically, so the log is
 * range-scannable without a secondary index (§2.1).
 */
export function ulid(now = Date.now(), rnd = randomBytes(10)) {
  let time = "";
  let t = now;
  for (let i = 9; i >= 0; i--) {
    time = B32[t % 32] + time;
    t = Math.floor(t / 32);
  }
  let rand = "";
  // 80 bits → 16 base32 characters, taken 5 bits at a time.
  let bits = 0n;
  for (const b of rnd) bits = (bits << 8n) | BigInt(b);
  for (let i = 0; i < 16; i++) {
    rand = B32[Number(bits & 31n)] + rand;
    bits >>= 5n;
  }
  return time + rand;
}

/* --------------------------------------------------- canonicalisation ----- */

/**
 * Deterministic JSON: keys sorted at every depth, no insignificant whitespace,
 * explicit nulls preserved. Two systems must derive byte-identical input for the
 * same event or the chain is worthless, so this is deliberately strict and
 * boring. Arrays keep their order — order is meaning.
 */
export function canonicalise(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return "[" + value.map(canonicalise).join(",") + "]";
  const keys = Object.keys(value).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalise(value[k])).join(",") + "}";
}

/** The hash of an event is over the whole envelope EXCEPT the hash field. */
export function hashEvent(event) {
  const { hash: _ignored, ...rest } = event;
  return "sha256:" + createHash("sha256").update(canonicalise(rest), "utf8").digest("hex");
}

export function sha256(buf) {
  return "sha256:" + createHash("sha256").update(buf).digest("hex");
}

/* ---------------------------------------------------------- envelope ----- */

export const ACTOR_KINDS = Object.freeze(["human", "ai", "system", "partner"]);
export const CLASSIFICATIONS = Object.freeze([
  "public",
  "subject",
  "care_team",
  "partner_shareable",
  "restricted",
  "internal",
]);

/**
 * Build a sealed event. `seq` and `prev_hash` come from the log head, so an
 * event cannot be constructed in isolation and inserted later — its position in
 * the chain is part of what is hashed.
 */
export function makeEvent({
  subjectId,
  seq,
  type,
  schemaVersion = 1,
  occurredAt,
  recordedAt = new Date().toISOString(),
  actor,
  evidence = [],
  disclosure = null,
  payload = {},
  classification,
  corrects = null,
  causedBy = null,
  prevHash = null,
  eventId = ulid(),
}) {
  const event = {
    event_id: eventId,
    subject_id: subjectId,
    seq,
    type,
    schema_version: schemaVersion,
    occurred_at: occurredAt ?? recordedAt,
    recorded_at: recordedAt,
    actor,
    evidence,
    disclosure,
    payload,
    classification,
    corrects,
    caused_by: causedBy,
    prev_hash: prevHash,
  };
  return { ...event, hash: hashEvent(event) };
}

/* ------------------------------------------------------ chain verify ----- */

/**
 * Verify an ordered run of events for one subject.
 *
 * Returns { ok, failures[] } rather than throwing: an auditor needs the full
 * list of what is wrong, not the first problem.
 */
export function verifyChain(events) {
  const failures = [];
  let expectedSeq = null;
  let expectedPrev = null;

  events.forEach((e, i) => {
    const recomputed = hashEvent(e);
    if (recomputed !== e.hash) {
      failures.push({
        at: i,
        event_id: e.event_id,
        reason: "hash mismatch — this event's contents have been altered since it was written",
      });
    }
    if (expectedSeq !== null && e.seq !== expectedSeq) {
      failures.push({
        at: i,
        event_id: e.event_id,
        reason: `sequence break — expected seq ${expectedSeq}, found ${e.seq} (an event is missing or reordered)`,
      });
    }
    if (expectedPrev !== null && e.prev_hash !== expectedPrev) {
      failures.push({
        at: i,
        event_id: e.event_id,
        reason: "chain break — prev_hash does not match the preceding event",
      });
    }
    expectedSeq = e.seq + 1;
    expectedPrev = e.hash;
  });

  return { ok: failures.length === 0, failures, head: events.at(-1)?.hash ?? null, count: events.length };
}
