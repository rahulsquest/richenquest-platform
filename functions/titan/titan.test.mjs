/**
 * Titan automation engine tests — native node:test, zero dependencies.
 * Every guard in the engine maps to a risk in the architecture review; each
 * has a test here so a regression re-opens a known production risk loudly.
 *
 * Run: node --test functions/
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { createLogger, createMetrics, scrub } from "./logger.mjs";
import { memoryStore, idempotencyKey, recordVersionKey } from "./store.mjs";
import { createEngine, OUTCOMES, constantTimeEqual, isOurOwnWrite, expectedToken } from "./engine.mjs";
import { createReconciler, buildQuery, planWindow, toZohoDateTime } from "./reconcile.mjs";
import { resolveAssignment, isStudentLead, onLeadCreate } from "./handlers/on-lead-create.mjs";

// ---- fixtures -------------------------------------------------------------
const SUBS = {
  subscriptions: [
    { name: "speed-to-lead", channel_id: "1001", events: ["Leads.create"], handler: "onLeadCreate" },
    { name: "case-stage-change", channel_id: "1003", events: ["Deals.edit"], handler: "onCaseEdit" },
  ],
};
const AUTOMATION_USER = "auto-999";
const silent = () => createLogger({ level: "error", sink: () => {} });

function harness({ record = { id: "L1", Modified_By: { id: "human-1" }, Modified_Time: "2026-07-20T10:00:00.000Z" }, handlers = {}, store = memoryStore() } = {}) {
  const calls = [];
  const metrics = createMetrics();
  const engine = createEngine({
    store,
    fetchRecord: async (m, id) => (typeof record === "function" ? record(m, id) : record),
    handlers: { onLeadCreate: async (r, c) => { calls.push({ r, c }); return "ok"; }, ...handlers },
    subscriptions: SUBS,
    automationUserId: AUTOMATION_USER,
    logger: silent(),
    metrics,
    delayMs: 0,
  });
  return { engine, calls, metrics, store };
}
const evt = (over = {}) => ({ module: "Leads", ids: ["L1"], operation: "create", channel_id: "1001", token: "rq-speed-to-lead", server_time: 1000, ...over });

// ---- logger ---------------------------------------------------------------
test("logger scrubs PII at every depth and never emits it", () => {
  const out = [];
  const log = createLogger({ sink: (l) => out.push(l), clock: () => "T" });
  log.info("lead", { Email: "a@b.com", nested: { Last_Name: "Kumar", id: "L1" }, list: [{ Phone: "+91" }] });
  const line = out[0];
  assert.ok(!line.includes("a@b.com"), "email leaked");
  assert.ok(!line.includes("Kumar"), "name leaked");
  assert.ok(!line.includes("+91"), "phone leaked");
  assert.ok(line.includes("L1"), "record id should be kept — it is how incidents are traced");
});

test("scrub is depth-capped so a pathological object cannot hang logging", () => {
  const deep = {}; let cur = deep;
  for (let i = 0; i < 50; i++) { cur.next = { Email: "x@y.z" }; cur = cur.next; }
  assert.doesNotThrow(() => scrub(deep));
});

test("metrics snapshot reports counters and p95", () => {
  const m = createMetrics();
  m.inc("a"); m.inc("a"); m.time("t", 10); m.time("t", 100);
  const s = m.snapshot();
  assert.equal(s.counters.a, 2);
  assert.equal(s.timers.t.count, 2);
  assert.equal(s.timers.t.max, 100);
});

// ---- engine guards --------------------------------------------------------
test("R7: rejects unknown channel_id (forged or drifted)", async () => {
  const { engine } = harness();
  const r = await engine.handle(evt({ channel_id: "9999" }));
  assert.equal(r.outcome, OUTCOMES.REJECTED);
  assert.equal(r.reason, "unknown_channel");
});

test("R7: rejects token mismatch", async () => {
  const { engine, calls } = harness();
  const r = await engine.handle(evt({ token: "wrong" }));
  assert.equal(r.outcome, OUTCOMES.REJECTED);
  assert.equal(calls.length, 0, "handler must not run on a bad token");
});

test("constantTimeEqual compares safely and correctly", () => {
  assert.ok(constantTimeEqual("abc", "abc"));
  assert.ok(!constantTimeEqual("abc", "abd"));
  assert.ok(!constantTimeEqual("abc", "abcd"));
});

test("expectedToken respects Zoho's 50-char token limit", () => {
  const t = expectedToken({ name: "x".repeat(90) });
  assert.ok(t.length <= 50, `token ${t.length} chars exceeds Zoho's 50-char maximum`);
});

test("R2: duplicate delivery is processed exactly once", async () => {
  const { engine, calls } = harness();
  await engine.handle(evt());
  await engine.handle(evt()); // identical event redelivered
  assert.equal(calls.length, 1, "handler ran twice for one logical event");
});

test("R2/R12: store failure DEFERS (fail-closed) rather than risking a duplicate", async () => {
  const broken = { ...memoryStore(), seen: async () => { throw new Error("store down"); } };
  const { engine, calls } = harness({ store: broken });
  const r = await engine.handle(evt());
  assert.equal(r.results[0].outcome, OUTCOMES.DEFERRED);
  assert.equal(calls.length, 0, "must NOT process without an idempotency check");
});

test("R9: loop-breaker skips our own writes", async () => {
  const { engine, calls } = harness({ record: { id: "L1", Modified_By: { id: AUTOMATION_USER } } });
  const r = await engine.handle(evt());
  assert.equal(r.results[0].outcome, OUTCOMES.LOOP_BREAK);
  assert.equal(calls.length, 0);
});

test("isOurOwnWrite tolerates both field spellings and a missing user id", () => {
  assert.ok(isOurOwnWrite({ Modified_By: { id: "u1" } }, "u1"));
  assert.ok(isOurOwnWrite({ modified_by: { id: "u1" } }, "u1"));
  assert.ok(!isOurOwnWrite({ Modified_By: { id: "u2" } }, "u1"));
  assert.ok(!isOurOwnWrite({ Modified_By: { id: "u1" } }, null));
});

test("R7: engine never trusts payload data — it re-hydrates from CRM", async () => {
  let fetched = false;
  const { engine, calls } = harness({ record: () => { fetched = true; return { id: "L1", Trusted: "from-crm" }; } });
  await engine.handle({ ...evt(), Injected: "from-attacker" });
  assert.ok(fetched, "must fetch from CRM");
  assert.equal(calls[0].r.Trusted, "from-crm");
  assert.equal(calls[0].r.Injected, undefined, "attacker-supplied field must never reach the handler");
});

test("vanished record is not an error and is not retried forever", async () => {
  const { engine } = harness({ record: async () => null });
  const r = await engine.handle(evt());
  assert.equal(r.results[0].outcome, OUTCOMES.PROCESSED);
  assert.equal(r.results[0].note, "vanished");
});

test("R10: handler failure dead-letters and does NOT mark the event done", async () => {
  const store = memoryStore();
  const { engine } = harness({ store, handlers: { onLeadCreate: async () => { throw new Error("boom"); } } });
  const r = await engine.handle(evt());
  assert.equal(r.results[0].outcome, OUTCOMES.FAILED);
  assert.equal((await store.listDeadLetters()).length, 1);
  // Neither key may be set, so reconciliation stays free to retry it later.
  assert.equal(await store.seen(idempotencyKey({ module: "Leads", id: "L1", operation: "create", server_time: 1000 })), false);
  assert.equal(await store.seen(recordVersionKey({ module: "Leads", id: "L1", modifiedTime: "2026-07-20T10:00:00.000Z" })), false);
});

test("cross-path dedupe: reconciliation must NOT re-process an event-handled record", async () => {
  // Regression guard. The event path keys on the notification's server_time,
  // reconciliation on the record's Modified_Time — those never match, so a
  // delivery-only key let reconciliation redo the work and over-report the
  // `missed` delivery-loss SLI the architecture depends on.
  const store = memoryStore();
  const { engine, calls } = harness({ store });
  await engine.handle(evt({ server_time: 999999 })); // event path, unrelated server_time
  assert.equal(calls.length, 1);
  // Same record version arriving via reconciliation (different server_time).
  const r = await engine.handle(
    { module: "Leads", ids: ["L1"], operation: "edit", channel_id: "1001", server_time: "2026-07-20T10:00:00.000Z" },
    { source: "reconciliation" }
  );
  assert.equal(r.results[0].outcome, OUTCOMES.DUPLICATE);
  assert.equal(calls.length, 1, "handler must not run twice for one record version");
});

test("declared-but-missing handler fails loudly, never silently", async () => {
  const { engine, store } = harness();
  const r = await engine.handle(evt({ channel_id: "1003", token: "rq-case-stage-change", module: "Deals" }));
  assert.equal(r.results[0].outcome, OUTCOMES.NO_HANDLER);
  assert.equal((await store.listDeadLetters()).length, 1);
});

test("engine processes every id in a batched notification", async () => {
  const { engine, calls } = harness({ record: (m, id) => ({ id, Modified_By: { id: "human-1" } }) });
  await engine.handle(evt({ ids: ["L1", "L2", "L3"] }));
  assert.equal(calls.length, 3);
});

// ---- reconciliation -------------------------------------------------------
test("toZohoDateTime emits the offset format COQL requires (no millis, explicit offset)", () => {
  // Regression: .toISOString() output (…Z, with millis) is rejected by COQL as
  // "value given seems to be invalid for the column".
  const s = toZohoDateTime(Date.parse("2026-07-16T12:32:00.501Z"), 330);
  assert.match(s, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+05:30$/);
  assert.ok(!s.includes("."), "must not contain milliseconds");
  assert.ok(!s.endsWith("Z"), "must not be Z/UTC form");
  // 12:32:00 UTC + 05:30 = 18:02:00 IST
  assert.equal(s, "2026-07-16T18:02:00+05:30");
});

test("planWindow formats sinceIso as a Zoho datetime literal", () => {
  const { sinceIso } = planWindow(Date.parse("2026-07-20T00:00:00.000Z"), Date.parse("2026-07-20T01:00:00.000Z"));
  assert.match(sinceIso, /\+05:30$/);
  assert.ok(!sinceIso.includes("."));
});

test("planWindow bounds the first run and overlaps subsequent ones", () => {
  const now = 1_000_000_000;
  const first = planWindow(null, now);
  assert.ok(now - first.sinceMs <= 7 * 24 * 3600_000, "first run must be bounded, not all history");
  const next = planWindow(now - 1000, now);
  assert.ok(next.sinceMs < now - 1000, "must overlap to avoid a gap between sweeps");
});

test("buildQuery is ordered and paged (deterministic sweeps)", () => {
  const q = buildQuery("Leads", "2026-07-01T00:00:00.000Z", { limit: 50, offset: 100 });
  assert.match(q, /from Leads/);
  assert.match(q, /order by Modified_Time asc/);
  assert.match(q, /limit 100,50/);
});

test("reconciler counts MISSED records — the delivery-loss SLI", async () => {
  const store = memoryStore();
  const MT = { L1: "2026-07-20T10:00:00.000Z", L2: "2026-07-20T11:00:00.000Z" };
  const { engine, calls } = harness({ store, record: (m, id) => ({ id, Modified_By: { id: "human-1" }, Modified_Time: MT[id] }) });
  // L1 already handled by the event path; L2 was never delivered.
  await engine.handle(evt({ ids: ["L1"], server_time: "2026-07-20T10:00:00.000Z" }));
  calls.length = 0;

  const rec = createReconciler({
    // Module-aware: the sweep queries each watched module in turn, so a mock
    // that ignores the module double-counts across Leads and Deals.
    query: async (coql) => coql.includes("from Leads")
      ? { data: [
          { id: "L1", Modified_Time: "2026-07-20T10:00:00.000Z" },
          { id: "L2", Modified_Time: "2026-07-20T11:00:00.000Z" },
        ], info: { more_records: false } }
      : { data: [], info: { more_records: false } },
    engine, store, subscriptions: SUBS, logger: silent(), metrics: createMetrics(),
  });
  const s = await rec.sweep();
  assert.equal(s.duplicates, 1, "L1 was already handled by the event path");
  assert.equal(s.missed, 1, "L2 was missed by the event path and must be counted");
  assert.equal(calls.length, 1, "only the missed record is processed");
});

test("reconciler dry-run detects gaps without processing them", async () => {
  const { engine, calls } = harness();
  const rec = createReconciler({
    query: async (coql) => coql.includes("from Leads")
      ? { data: [{ id: "L9", Modified_Time: "2026-07-20T10:00:00.000Z" }], info: { more_records: false } }
      : { data: [], info: { more_records: false } },
    engine, store: memoryStore(), subscriptions: SUBS, logger: silent(), metrics: createMetrics(),
  });
  const s = await rec.sweep({ dryRun: true });
  assert.equal(s.missed, 1);
  assert.equal(calls.length, 0, "dry-run must not process");
});

test("checkpoint does NOT advance when the sweep had failures (gaps are worse than repeats)", async () => {
  const store = memoryStore();
  const { engine } = harness({ store, handlers: { onLeadCreate: async () => { throw new Error("fail"); } } });
  const rec = createReconciler({
    query: async () => ({ data: [{ id: "L5", Modified_Time: "2026-07-20T10:00:00.000Z" }], info: { more_records: false } }),
    engine, store, subscriptions: SUBS, logger: silent(), metrics: createMetrics(),
  });
  await rec.sweep();
  assert.equal(await store.getCheckpoint("reconcile:Leads"), null, "checkpoint must not advance past a failure");
});

test("checkpoint advances to the high-water mark on a clean sweep", async () => {
  const store = memoryStore();
  const { engine } = harness({ store, record: (m, id) => ({ id, Modified_By: { id: "human-1" } }) });
  const rec = createReconciler({
    query: async () => ({ data: [{ id: "L7", Modified_Time: "2026-07-20T12:00:00.000Z" }], info: { more_records: false } }),
    engine, store, subscriptions: SUBS, logger: silent(), metrics: createMetrics(),
  });
  await rec.sweep();
  assert.equal(await store.getCheckpoint("reconcile:Leads"), Date.parse("2026-07-20T12:00:00.000Z"));
});

// ---- handler --------------------------------------------------------------
test("resolveAssignment prefers market routing over the default owner (OI-4 config)", () => {
  const tenant = { assignment_engine: { v1_default_PROPOSED: { Student: {
    default_owner: "Kunal", by_market: { Pakistan: "Tahir" } } } } };
  assert.equal(resolveAssignment({ Market: "Pakistan" }, tenant).owner, "Tahir");
  assert.equal(resolveAssignment({ Market: "India" }, tenant).owner, "Kunal");
  assert.equal(resolveAssignment({}, { assignment_engine: {} }), null);
});

test("isStudentLead gates non-student types but fails OPEN on a missing type", () => {
  assert.ok(isStudentLead({ Lead_Type: "Student" }));
  assert.ok(isStudentLead({}), "absent type must be treated as Student — never silently drop a real lead");
  assert.ok(!isStudentLead({ Lead_Type: "University" }));
});

test("onLeadCreate is idempotent: never reassigns an already-owned lead", async () => {
  const updates = [];
  const deps = { tenant: { assignment_engine: { v1_default_PROPOSED: { Student: { default_owner: "Kunal" } } } },
    crm: { updateLead: async (id, f) => updates.push({ id, f }) } };
  const ctx = { id: "L1", logger: silent(), deps };
  const r = await onLeadCreate({ Owner: { id: "human-7" } }, ctx);
  assert.equal(r.action, "skipped");
  assert.equal(updates.length, 0, "must never take a lead away from its owner");
});

test("onLeadCreate assigns and alerts on a fresh student lead", async () => {
  const updates = [], posts = [];
  const deps = {
    tenant: { assignment_engine: { v1_default_PROPOSED: { Student: { default_owner: "Kunal", by_market: { Pakistan: "Tahir" } } } } },
    crm: { updateLead: async (id, f) => updates.push({ id, f }) },
    cliq: { post: async (ch, msg) => posts.push({ ch, msg }) },
  };
  const r = await onLeadCreate({ Market: "Pakistan" }, { id: "L1", logger: silent(), deps });
  assert.equal(r.action, "assigned");
  assert.equal(r.owner, "Tahir");
  assert.equal(updates.length, 1);
  assert.equal(posts[0].ch, "leads");
  assert.ok(!posts[0].msg.includes("@"), "alert must not leak an email address");
});
