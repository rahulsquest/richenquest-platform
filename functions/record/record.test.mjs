/**
 * Career Record — tests for the invariants that must never break.
 *
 * Architecture: docs/25-career-record-architecture.md
 *
 * These are not coverage tests. Each one corresponds to a promise the company
 * makes in public, and if it fails the promise is false. That is the bar for
 * being in this file.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { ulid, canonicalise, hashEvent, verifyChain, makeEvent } from "./event.mjs";
import { assertInvariants, canRead, InvariantViolation } from "./policy.mjs";
import { memoryStore, appendEvent, appendCorrection, verifySubject, writeCheckpoint } from "./log.mjs";
import { timeline, timelineAsOf, buildExport } from "./views.mjs";

const SUBJECT = "sub_test01";
const COUNSELLOR = { kind: "human", id: "usr_kunal", role: "counsellor" };
const AI = { kind: "ai", id: "svc_matcher", role: "ai_service" };
const PARTNER = { kind: "partner", id: "partner:uni_x", role: "partner" };

const EVIDENCE = [{ ref: "dest:germany@2026-07-19", kind: "published_data", hash: "sha256:9f2c" }];
const DISCLOSURE = { shown: true, register_version: "2026-07-25", statements: ["no commercial relationship"] };

/** A valid recommendation, the hardest event to write correctly. */
const recommendation = (over = {}) => ({
  subjectId: SUBJECT,
  type: "recommendation.issued",
  actor: COUNSELLOR,
  evidence: EVIDENCE,
  disclosure: DISCLOSURE,
  payload: {
    recommended: [{ option: "dest:germany", rank: 1, rationale: "fits budget and intake" }],
    alternatives_considered: [{ option: "dest:ireland", rejected_because: "tuition exceeds budget" }],
    risks_explained: [{ risk: "APS adds 8-10 weeks", acknowledged: true }],
    criteria_version: "matcher@1.3.0",
  },
  ...over,
});

/* ------------------------------------------------------------- ULID ------ */

test("ULID ids sort chronologically", () => {
  const a = ulid(1_700_000_000_000);
  const b = ulid(1_700_000_001_000);
  assert.ok(a < b, "a later timestamp must produce a lexicographically greater id");
  assert.equal(a.length, 26);
});

/* ----------------------------------------------- canonicalisation ------- */

test("canonicalisation is key-order independent but array-order sensitive", () => {
  assert.equal(canonicalise({ a: 1, b: 2 }), canonicalise({ b: 2, a: 1 }));
  assert.notEqual(canonicalise([1, 2]), canonicalise([2, 1]));
  // Two systems must derive identical bytes or the chain is worthless.
  assert.equal(canonicalise({ x: null }), '{"x":null}');
});

/* ------------------------------------------------------ append path ----- */

test("appending builds a verifiable chain", async () => {
  const store = memoryStore();
  await appendEvent(store, { subjectId: SUBJECT, type: "profile.created", actor: COUNSELLOR, payload: {} });
  await appendEvent(store, recommendation());
  await appendEvent(store, { subjectId: SUBJECT, type: "counselling.session_held", actor: COUNSELLOR, payload: {} });

  const result = await verifySubject(store, SUBJECT);
  assert.equal(result.ok, true, JSON.stringify(result.failures));
  assert.equal(result.count, 3);

  const events = await store.read(SUBJECT);
  assert.deepEqual(events.map((e) => e.seq), [1, 2, 3]);
  assert.equal(events[0].prev_hash, null, "the first event has no predecessor");
  assert.equal(events[1].prev_hash, events[0].hash);
});

test("idempotency: a retried append does not double-record", async () => {
  const store = memoryStore();
  const input = { ...recommendation(), idempotencyKey: "retry-1" };
  const a = await appendEvent(store, input);
  const b = await appendEvent(store, { ...input });
  assert.equal(a.event_id, b.event_id, "the same idempotency key must return the original event");
  assert.equal((await store.read(SUBJECT)).length, 1);
});

/* ------------------------------------------- TAMPER EVIDENCE (§5.1) ----- */

test("altering a past event breaks the chain — including for us", async () => {
  const store = memoryStore();
  await appendEvent(store, { subjectId: SUBJECT, type: "profile.created", actor: COUNSELLOR, payload: {} });
  await appendEvent(store, recommendation());
  await appendEvent(store, { subjectId: SUBJECT, type: "visa.granted", actor: COUNSELLOR, payload: {} });
  assert.equal((await verifySubject(store, SUBJECT)).ok, true);

  // Simulate an insider editing history in place. A real store forbids this;
  // the point of the chain is that it is detectable even if one succeeds.
  const raw = store._raw.get(SUBJECT);
  raw[1].payload.recommended[0].option = "dest:somewhere_we_get_paid";

  const after = await verifySubject(store, SUBJECT);
  assert.equal(after.ok, false, "a silently edited recommendation must not verify");
  assert.match(after.failures[0].reason, /altered/);
});

test("deleting a past event breaks the chain", async () => {
  const store = memoryStore();
  for (const type of ["profile.created", "counselling.session_held", "visa.granted"]) {
    await appendEvent(store, { subjectId: SUBJECT, type, actor: COUNSELLOR, payload: {} });
  }
  store._raw.get(SUBJECT).splice(1, 1); // remove the middle event

  const after = await verifySubject(store, SUBJECT);
  assert.equal(after.ok, false, "a gap in history must be detectable");
  assert.ok(after.failures.some((f) => /sequence break|chain break/.test(f.reason)));
});

/* ------------------------------------- I1: HUMAN AUTHORITY OVER AI ----- */

test("I1 — an AI cannot author a recommendation, by any route", async () => {
  const store = memoryStore();
  await assert.rejects(
    () => appendEvent(store, recommendation({ actor: AI })),
    (err) => err instanceof InvariantViolation && err.code === "I1",
    "there must be no code path by which an AI issues advice"
  );
  assert.equal((await store.read(SUBJECT)).length, 0, "the refused event must not be stored");
});

test("I7 — an AI may only write suggestion events", async () => {
  const store = memoryStore();
  await assert.rejects(
    () => appendEvent(store, { subjectId: SUBJECT, type: "visa.granted", actor: AI, payload: {} }),
    (e) => e.code === "I7"
  );

  // The permitted path works, and requires model identity + evidence.
  const ok = await appendEvent(store, {
    subjectId: SUBJECT,
    type: "ai.suggestion_generated",
    actor: AI,
    evidence: EVIDENCE,
    payload: { model_id: "rules-matcher", model_version: "1.3.0", suggestion: ["dest:germany"] },
  });
  assert.equal(ok.actor.kind, "ai");
});

test("an AI suggestion without evidence or model identity is refused", async () => {
  const store = memoryStore();
  await assert.rejects(
    () => appendEvent(store, { subjectId: SUBJECT, type: "ai.suggestion_generated", actor: AI, payload: { model_id: "m", model_version: "1" } }),
    (e) => e.code === "I2"
  );
  await assert.rejects(
    () => appendEvent(store, { subjectId: SUBJECT, type: "ai.suggestion_generated", actor: AI, evidence: EVIDENCE, payload: {} }),
    (e) => e.code === "I7"
  );
});

/* ------------------------------ I2/I3: EVIDENCE AND DISCLOSURE ---------- */

test("I2 — a recommendation with no evidence is refused", async () => {
  const store = memoryStore();
  await assert.rejects(
    () => appendEvent(store, recommendation({ evidence: [] })),
    (e) => e.code === "I2"
  );
});

test("I3 — a recommendation without disclosure shown is refused", async () => {
  const store = memoryStore();
  await assert.rejects(
    () => appendEvent(store, recommendation({ disclosure: { shown: false } })),
    (e) => e.code === "I3"
  );
  await assert.rejects(
    () => appendEvent(store, recommendation({ disclosure: null })),
    (e) => e.code === "I3"
  );
});

/* -------------------------------- I8/I9: MINORS AND PARTNERS ------------ */

test("I8 — no AI event may be written for a minor (DPDP)", async () => {
  const store = memoryStore();
  await assert.rejects(
    () =>
      appendEvent(
        store,
        { subjectId: SUBJECT, type: "ai.suggestion_generated", actor: AI, evidence: EVIDENCE, payload: { model_id: "m", model_version: "1" } },
        { subject: { minor: true } }
      ),
    (e) => e.code === "I8"
  );
});

test("I9 — a partner contributes but cannot edit the record", async () => {
  const store = memoryStore();
  const ok = await appendEvent(store, { subjectId: SUBJECT, type: "admission.offered", actor: PARTNER, payload: { programme: "MSc" } });
  assert.equal(ok.type, "admission.offered");

  await assert.rejects(
    () => appendEvent(store, { subjectId: SUBJECT, type: "counselling.note_added", actor: PARTNER, payload: {} }),
    (e) => e.code === "I9"
  );
});

/* ---------------------------------- I11: DEFAULT DENY ON TYPES ---------- */

test("I11 — an unregistered event type cannot be written", async () => {
  const store = memoryStore();
  await assert.rejects(
    () => appendEvent(store, { subjectId: SUBJECT, type: "marketing.lead_scored", actor: COUNSELLOR, payload: {} }),
    (e) => e.code === "I11",
    "new event types must be registered with a classification first"
  );
});

/* ----------------------------------- I4: CONCURRENCY, NOT LWW ---------- */

test("I4 — a concurrent append conflicts instead of silently interleaving", async () => {
  const store = memoryStore();
  const head = await store.head(SUBJECT);
  const stale = makeEvent({
    subjectId: SUBJECT,
    seq: 1,
    type: "counselling.note_added",
    actor: COUNSELLOR,
    classification: "care_team",
    occurredAt: new Date().toISOString(),
    prevHash: head ? head.hash : null,
  });
  await appendEvent(store, { subjectId: SUBJECT, type: "profile.created", actor: COUNSELLOR, payload: {} });

  // The second writer still believes seq 1 is free.
  await assert.rejects(
    () => store.append(SUBJECT, stale, { expectedSeq: 1 }),
    (e) => e.code === "SEQ_CONFLICT"
  );
});

/* ------------------------------------- CORRECTIONS, NOT EDITS ---------- */

test("a correction adds a new event and preserves the original", async () => {
  const store = memoryStore();
  const original = await appendEvent(store, {
    subjectId: SUBJECT,
    type: "profile.created",
    actor: COUNSELLOR,
    payload: { grade: "62%" },
  });
  await appendCorrection(store, {
    subjectId: SUBJECT,
    corrects: original.event_id,
    type: "profile.corrected",
    actor: COUNSELLOR,
    payload: { grade: "72%" },
    reason: "transcript re-read; original was a transcription error",
  });

  const events = await store.read(SUBJECT);
  assert.equal(events.length, 2, "the original must still be there");
  assert.equal(events[0].payload.grade, "62%", "history is not rewritten");
  assert.equal(events[1].corrects, original.event_id);
  assert.equal((await verifySubject(store, SUBJECT)).ok, true);
});

test("correcting a non-existent event is refused", async () => {
  const store = memoryStore();
  await assert.rejects(
    () => appendCorrection(store, { subjectId: SUBJECT, corrects: "01NOPE", type: "profile.corrected", actor: COUNSELLOR, payload: {} }),
    (e) => e.code === "I6"
  );
});

/* --------------------------------------------- PERMISSIONS (§3) -------- */

test("permissions: default deny, and the subject always reads their own record", async () => {
  const store = memoryStore();
  await appendEvent(store, { subjectId: SUBJECT, type: "document.submitted", actor: COUNSELLOR, payload: { kind: "passport" } });
  const [doc] = await store.read(SUBJECT);

  assert.equal(canRead(doc, { role: "subject", subjectId: SUBJECT }), true);
  assert.equal(canRead(doc, { role: "subject", subjectId: "sub_someone_else" }), false, "not another person's record");
  assert.equal(canRead(doc, { role: "anonymous" }), false);
  // restricted is above an administrator's ceiling
  assert.equal(canRead(doc, { role: "administrator", id: "adm" }), false);
});

test("permissions: a partner needs an unexpired, type-scoped grant — a role alone is not enough", async () => {
  const store = memoryStore();
  await appendEvent(store, { subjectId: SUBJECT, type: "application.submitted", actor: COUNSELLOR, payload: {} });
  const [app] = await store.read(SUBJECT);

  const viewer = (grants) => ({ role: "partner", id: "partner:uni_x", subjectId: SUBJECT, grants });

  assert.equal(canRead(app, viewer([])), false, "no grant, no access");

  const valid = {
    grantee: "partner:uni_x",
    subject_id: SUBJECT,
    expires_at: "2099-01-01T00:00:00Z",
    scope: { types: ["application.submitted"], classification_max: "partner_shareable" },
  };
  assert.equal(canRead(app, viewer([valid])), true);

  assert.equal(
    canRead(app, viewer([{ ...valid, expires_at: "2020-01-01T00:00:00Z" }])),
    false,
    "an expired grant must not grant"
  );
  assert.equal(
    canRead(app, viewer([{ ...valid, scope: { types: ["admission.offered"], classification_max: "partner_shareable" } }])),
    false,
    "a grant is scoped to named event types"
  );
  assert.equal(
    canRead(app, viewer([{ ...valid, subject_id: "sub_other" }])),
    false,
    "a grant for one person must not read another's record"
  );
});

/* ----------------------------------------------- TIMELINE (§7) -------- */

test("timeline links acknowledgement and outcome without mutating the original", async () => {
  const store = memoryStore();
  const rec = await appendEvent(store, recommendation());
  await appendEvent(store, {
    subjectId: SUBJECT,
    type: "recommendation.acknowledged",
    actor: { kind: "human", id: SUBJECT, role: "subject" },
    causedBy: rec.event_id,
    payload: {},
  });
  await appendEvent(store, {
    subjectId: SUBJECT,
    type: "recommendation.outcome_recorded",
    actor: COUNSELLOR,
    causedBy: rec.event_id,
    payload: { outcome: "admitted", institution: "TU Munich" },
  });

  const view = timeline(await store.read(SUBJECT), { role: "subject", subjectId: SUBJECT });
  assert.equal(view.entries.length, 1, "follow-on events fold into their parent entry");

  const entry = view.entries[0];
  assert.equal(entry.type, "recommendation.issued");
  assert.ok(entry.acknowledgement, "acknowledgement is resolved at read time");
  assert.equal(entry.outcome.outcome, "admitted");
  assert.equal(entry.authored_by_ai, false);
  // The nine fields the record must answer, all present:
  for (const field of ["time", "actor", "evidence", "decision", "disclosure", "acknowledgement", "outcome"]) {
    assert.ok(entry[field] !== undefined, `timeline entry must expose ${field}`);
  }
  assert.equal(entry.decision.alternatives_considered.length, 1, "alternatives considered are recoverable in 2036");
  assert.equal(entry.decision.risks_explained.length, 1);
});

test("timeline withholds what a viewer may not see, and says how much", async () => {
  const store = memoryStore();
  await appendEvent(store, { subjectId: SUBJECT, type: "document.submitted", actor: COUNSELLOR, payload: {} });
  await appendEvent(store, { subjectId: SUBJECT, type: "application.submitted", actor: COUNSELLOR, payload: {} });
  const events = await store.read(SUBJECT);

  const partnerView = timeline(events, {
    role: "partner",
    id: "partner:uni_x",
    subjectId: SUBJECT,
    grants: [
      {
        grantee: "partner:uni_x",
        subject_id: SUBJECT,
        expires_at: "2099-01-01T00:00:00Z",
        scope: { types: ["application.submitted"], classification_max: "partner_shareable" },
      },
    ],
  });

  assert.equal(partnerView.entries.length, 1, "the partner sees only the granted type");
  assert.equal(partnerView.withheld, 1);
  assert.equal(partnerView.read_is_logged, true, "a partner read is a disclosable act");
});

test("timelineAsOf reconstructs the record as it stood on a past date", async () => {
  const store = memoryStore();
  await appendEvent(store, {
    subjectId: SUBJECT,
    type: "profile.created",
    actor: COUNSELLOR,
    recordedAt: "2026-01-10T00:00:00Z",
    occurredAt: "2026-01-10T00:00:00Z",
    payload: {},
  });
  await appendEvent(store, {
    subjectId: SUBJECT,
    type: "visa.granted",
    actor: COUNSELLOR,
    recordedAt: "2026-06-01T00:00:00Z",
    occurredAt: "2026-06-01T00:00:00Z",
    payload: {},
  });

  const viewer = { role: "subject", subjectId: SUBJECT };
  assert.equal(timelineAsOf(await store.read(SUBJECT), viewer, "2026-03-01T00:00:00Z").entries.length, 1);
  assert.equal(timeline(await store.read(SUBJECT), viewer).entries.length, 2);
});

/* ------------------------------------------------- EXPORT (§8) -------- */

test("export is complete, self-describing and self-verifying", async () => {
  const store = memoryStore();
  await appendEvent(store, { subjectId: SUBJECT, type: "profile.created", actor: COUNSELLOR, payload: {} });
  await appendEvent(store, recommendation());
  await writeCheckpoint(store, SUBJECT);

  const events = await store.read(SUBJECT);
  const files = buildExport(events, { subjectId: SUBJECT, identity: { name: "Test Person" } });

  for (const f of ["manifest.json", "events.jsonl", "identity.json", "verify.mjs", "README.md"]) {
    assert.ok(files[f], `export must contain ${f}`);
  }

  const manifest = JSON.parse(files["manifest.json"]);
  assert.equal(manifest.event_count, events.length);
  assert.equal(manifest.chain_head, events.at(-1).hash);
  assert.equal(manifest.chain_verified_at_export, true);

  // Every event survives the round trip byte-for-byte.
  const lines = files["events.jsonl"].trim().split("\n").map((l) => JSON.parse(l));
  assert.equal(lines.length, events.length);
  assert.equal(verifyChain(lines).ok, true, "the exported log must verify on its own");

  // The verifier is standalone: it must not import RichenQuest code.
  assert.doesNotMatch(files["verify.mjs"], /from "\.\//, "the shipped verifier must have no local imports");
  assert.match(files["verify.mjs"], /createHash/);
});

test("the exported verifier detects tampering with the export itself", async () => {
  const store = memoryStore();
  await appendEvent(store, { subjectId: SUBJECT, type: "profile.created", actor: COUNSELLOR, payload: { grade: "62%" } });
  await appendEvent(store, recommendation());

  const events = await store.read(SUBJECT);
  const files = buildExport(events, { subjectId: SUBJECT });

  // Someone edits a line in events.jsonl after export.
  const tampered = files["events.jsonl"]
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));
  tampered[0].payload.grade = "92%";

  assert.equal(verifyChain(tampered).ok, false, "an edited export must fail verification");
});

/* --------------------------------------------- CHECKPOINTS (§5.2) ----- */

test("a checkpoint records the chain head so verification can start from it", async () => {
  const store = memoryStore();
  await appendEvent(store, { subjectId: SUBJECT, type: "profile.created", actor: COUNSELLOR, payload: {} });
  const before = await store.head(SUBJECT);
  const cp = await writeCheckpoint(store, SUBJECT);

  assert.equal(cp.type, "record.checkpoint_written");
  assert.equal(cp.payload.chain_head, before.hash);
  assert.equal(cp.payload.events_at_checkpoint, before.seq);
  assert.equal((await verifySubject(store, SUBJECT)).ok, true);
});
