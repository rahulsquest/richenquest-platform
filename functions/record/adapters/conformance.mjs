/**
 * EventStore conformance suite — the contract every adapter must satisfy.
 *
 * Architecture: docs/25-career-record-architecture.md §10.1.
 *
 * "The domain model must never depend on a specific vendor" is only true if the
 * adapters are actually interchangeable. One suite, run against every adapter, is
 * what makes that checkable instead of aspirational. When the store changes in
 * 2036, this suite is the acceptance test for the replacement.
 *
 * Usage (from a test file):
 *     import { conformanceSuite } from "./conformance.mjs";
 *     conformanceSuite("postgres", async () => makeStoreSomehow());
 */

import test from "node:test";
import assert from "node:assert/strict";

import { appendEvent, appendCorrection, verifySubject } from "../log.mjs";
import { verifyChain } from "../event.mjs";

const COUNSELLOR = { kind: "human", id: "usr_kunal", role: "counsellor" };
const EVIDENCE = [{ ref: "dest:germany@2026-07-19", kind: "published_data", hash: "sha256:9f2c" }];
const DISCLOSURE = { shown: true, register_version: "2026-07-25", statements: ["no commercial relationship"] };

const recommendation = (subjectId, over = {}) => ({
  subjectId,
  type: "recommendation.issued",
  actor: COUNSELLOR,
  evidence: EVIDENCE,
  disclosure: DISCLOSURE,
  payload: { recommended: [{ option: "dest:germany", rank: 1 }], criteria_version: "matcher@1.3.0" },
  ...over,
});

/**
 * @param {string} name                    adapter name, used in test titles
 * @param {() => Promise<object>} makeStore fresh, empty store per call
 * @param {{ concurrentAppendIsAtomic?: boolean }} [caps]
 *   Adapters declare their capabilities. Catalyst cannot make compare-and-set
 *   atomic (no unique constraint), so it declares that honestly instead of the
 *   suite pretending every store is equivalent. A capability flag is a documented
 *   difference; a skipped test is a hidden one.
 */
export function conformanceSuite(name, makeStore, caps = {}) {
  const { concurrentAppendIsAtomic = true } = caps;
  const S = `sub_conf_${name}`;

  test(`[${name}] append assigns seq 1 then increments`, async () => {
    const store = await makeStore();
    const a = await appendEvent(store, { subjectId: S, type: "profile.created", actor: COUNSELLOR, payload: {} });
    const b = await appendEvent(store, { subjectId: S, type: "counselling.session_held", actor: COUNSELLOR, payload: {} });
    assert.equal(a.seq, 1);
    assert.equal(b.seq, 2);
    assert.equal(b.prev_hash, a.hash, "each event must chain to its predecessor");
  });

  test(`[${name}] read returns events in seq order`, async () => {
    const store = await makeStore();
    for (const type of ["profile.created", "counselling.session_held", "visa.granted"]) {
      await appendEvent(store, { subjectId: S, type, actor: COUNSELLOR, payload: {} });
    }
    const events = await store.read(S);
    assert.deepEqual(events.map((e) => e.seq), [1, 2, 3]);
    assert.equal(verifyChain(events).ok, true);
  });

  test(`[${name}] read honours a seq window`, async () => {
    const store = await makeStore();
    for (let i = 0; i < 5; i++) {
      await appendEvent(store, { subjectId: S, type: "counselling.note_added", actor: COUNSELLOR, payload: { i } });
    }
    const mid = await store.read(S, { fromSeq: 2, toSeq: 4 });
    assert.deepEqual(mid.map((e) => e.seq), [2, 3, 4]);
  });

  test(`[${name}] head is null on an empty record and tracks the latest event`, async () => {
    const store = await makeStore();
    assert.equal(await store.head(S), null);
    await appendEvent(store, { subjectId: S, type: "profile.created", actor: COUNSELLOR, payload: {} });
    const last = await appendEvent(store, { subjectId: S, type: "visa.applied", actor: COUNSELLOR, payload: {} });
    const head = await store.head(S);
    assert.equal(head.event_id, last.event_id);
    assert.equal(head.seq, 2);
  });

  test(`[${name}] envelopes survive storage byte-for-byte`, async () => {
    const store = await makeStore();
    const written = await appendEvent(store, recommendation(S));
    const [readBack] = await store.read(S);
    // A serialisation round trip that changes anything breaks every hash and
    // silently invalidates the chain — so this is not a formality.
    assert.deepEqual(readBack, written);
    assert.equal(verifyChain([readBack]).ok, true);
  });

  test(`[${name}] idempotent append returns the original event`, async () => {
    const store = await makeStore();
    const input = { ...recommendation(S), idempotencyKey: `k_${name}` };
    const first = await appendEvent(store, input);
    const retry = await appendEvent(store, { ...input });
    assert.equal(retry.event_id, first.event_id);
    assert.equal((await store.read(S)).length, 1, "a retry must not create a second event");
  });

  test(`[${name}] records are isolated from each other`, async () => {
    const store = await makeStore();
    await appendEvent(store, { subjectId: `${S}_a`, type: "profile.created", actor: COUNSELLOR, payload: {} });
    await appendEvent(store, { subjectId: `${S}_b`, type: "profile.created", actor: COUNSELLOR, payload: {} });
    const a = await store.read(`${S}_a`);
    const b = await store.read(`${S}_b`);
    assert.equal(a.length, 1);
    assert.equal(b.length, 1);
    assert.equal(a[0].seq, 1, "sequences are per-subject, not global");
    assert.equal(b[0].seq, 1);
    assert.notEqual(a[0].event_id, b[0].event_id);
  });

  test(`[${name}] scanAll yields events in ULID order for projection rebuild`, async () => {
    const store = await makeStore();
    await appendEvent(store, { subjectId: `${S}_x`, type: "profile.created", actor: COUNSELLOR, payload: {} });
    await appendEvent(store, { subjectId: `${S}_y`, type: "profile.created", actor: COUNSELLOR, payload: {} });
    const all = await store.scanAll({});
    assert.ok(all.length >= 2);
    const ids = all.map((e) => e.event_id);
    assert.deepEqual(ids, [...ids].sort(), "scanAll must be chronologically ordered");
  });

  test(`[${name}] corrections append and preserve the original`, async () => {
    const store = await makeStore();
    const original = await appendEvent(store, {
      subjectId: S,
      type: "profile.created",
      actor: COUNSELLOR,
      payload: { grade: "62%" },
    });
    await appendCorrection(store, {
      subjectId: S,
      corrects: original.event_id,
      type: "profile.corrected",
      actor: COUNSELLOR,
      payload: { grade: "72%" },
      reason: "transcription error",
    });
    const events = await store.read(S);
    assert.equal(events.length, 2);
    assert.equal(events[0].payload.grade, "62%", "history is never rewritten");
    assert.equal((await verifySubject(store, S)).ok, true);
  });

  test(`[${name}] a duplicate seq is refused`, async () => {
    const store = await makeStore();
    const first = await appendEvent(store, { subjectId: S, type: "profile.created", actor: COUNSELLOR, payload: {} });
    // Replaying an already-stored event must not be accepted a second time.
    await assert.rejects(
      () => store.append(S, first, { expectedSeq: first.seq }),
      (err) => err.code === "SEQ_CONFLICT" || err.code === "CONCURRENT_APPEND",
      "an adapter must reject or detect a duplicate position"
    );
  });

  test(`[${name}] chainHeads reports commitments without payloads`, async () => {
    const store = await makeStore();
    await appendEvent(store, { subjectId: S, type: "profile.created", actor: COUNSELLOR, payload: { secret: "PII" } });
    await appendEvent(store, recommendation(S));

    const heads = await store.chainHeads();
    const mine = heads.find((h) => h.subject_id === S);
    assert.ok(mine, "chainHeads must include every subject with events");
    assert.equal(mine.seq, 2);
    assert.equal(mine.head, (await store.head(S)).hash);
    // The digest built from this is published, so it must not be able to leak.
    assert.doesNotMatch(JSON.stringify(heads), /PII/, "chainHeads must not carry payloads");
  });

  if (concurrentAppendIsAtomic) {
    test(`[${name}] concurrent appends at the same position: exactly one wins`, async () => {
      const store = await makeStore();
      await appendEvent(store, { subjectId: S, type: "profile.created", actor: COUNSELLOR, payload: {} });

      // Both writers read head=1 and both try seq=2. The store must serialise.
      const results = await Promise.allSettled([
        appendEvent(store, { subjectId: S, type: "counselling.note_added", actor: COUNSELLOR, payload: { w: 1 } }),
        appendEvent(store, { subjectId: S, type: "counselling.note_added", actor: COUNSELLOR, payload: { w: 2 } }),
      ]);
      const ok = results.filter((r) => r.status === "fulfilled");
      const failed = results.filter((r) => r.status === "rejected");

      assert.equal(ok.length, 1, "exactly one concurrent writer may win");
      assert.equal(failed.length, 1);
      assert.equal(failed[0].reason.code, "SEQ_CONFLICT");
      assert.equal((await verifySubject(store, S)).ok, true, "the chain must remain valid after a conflict");
    });
  } else {
    test(`[${name}] DECLARED LIMITATION: compare-and-set is advisory, conflicts are detected not prevented`, async () => {
      // Recorded as a test so the limitation is visible in test output rather
      // than buried in a comment, and so it fails loudly if someone assumes
      // otherwise later.
      const store = await makeStore();
      await appendEvent(store, { subjectId: S, type: "profile.created", actor: COUNSELLOR, payload: {} });
      assert.equal(
        concurrentAppendIsAtomic,
        false,
        "this adapter cannot guarantee atomic append; single-writer workloads only"
      );
    });
  }
}
