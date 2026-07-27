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
import { createEngine, OUTCOMES, constantTimeEqual, isOurOwnWrite } from "./engine.mjs";
import { channelToken } from "./webhook-auth.mjs";
import { createReconciler, buildQuery, planWindow, toZohoDateTime } from "./reconcile.mjs";
import { resolveAssignment, isStudentLead, onLeadCreate } from "./handlers/on-lead-create.mjs";
import { parseZohoNotification } from "../catalyst/parse-notification.mjs";

// ---- fixtures -------------------------------------------------------------
const SUBS = {
  subscriptions: [
    { name: "speed-to-lead", channel_id: "1001", events: ["Leads.create"], handler: "onLeadCreate" },
    { name: "case-stage-change", channel_id: "1003", events: ["Deals.edit"], handler: "onCaseEdit" },
  ],
};
const AUTOMATION_USER = "auto-999";
const WEBHOOK_SECRET = "test-secret-please-ignore";
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
    webhookSecret: WEBHOOK_SECRET,
    logger: silent(),
    metrics,
    delayMs: 0,
  });
  return { engine, calls, metrics, store };
}
// A valid event carries the HMAC token the provisioner would have set.
const evt = (over = {}) => ({ module: "Leads", ids: ["L1"], operation: "create", channel_id: "1001", token: channelToken("1001", WEBHOOK_SECRET), server_time: 1000, ...over });

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

test("channelToken is unpredictable, deterministic, and within Zoho's 50-char limit", () => {
  const a = channelToken("1001", WEBHOOK_SECRET);
  assert.ok(a.length <= 50, `token ${a.length} chars exceeds Zoho's 50-char maximum`);
  assert.equal(a, channelToken("1001", WEBHOOK_SECRET), "must be deterministic for verification");
  assert.notEqual(a, channelToken("1002", WEBHOOK_SECRET), "different channels get different tokens");
  assert.notEqual(a, channelToken("1001", "other-secret"), "depends on the secret");
  // The old scheme was `rq-<name>` — a name-derived guess must NOT authenticate.
  assert.notEqual(a, "rq-speed-to-lead");
  assert.throws(() => channelToken("1001", ""), /required/);
});

test("R7: a predictable name-derived token is now rejected (regression: forgeable token)", async () => {
  const { engine, calls } = harness();
  const r = await engine.handle(evt({ token: "rq-speed-to-lead" }));
  assert.equal(r.outcome, OUTCOMES.REJECTED);
  assert.equal(r.reason, "bad_token");
  assert.equal(calls.length, 0);
});

test("engine refuses to authenticate when no webhook secret is configured", async () => {
  const engine = createEngine({
    store: memoryStore(), fetchRecord: async () => ({ id: "L1" }),
    handlers: { onLeadCreate: async () => "ok" }, subscriptions: SUBS,
    automationUserId: AUTOMATION_USER, webhookSecret: "", logger: silent(), metrics: createMetrics(),
  });
  const r = await engine.handle({ module: "Leads", ids: ["L1"], operation: "create", channel_id: "1001", token: "anything", server_time: 1 });
  assert.equal(r.reason, "no_secret", "must fail closed, never accept blindly");
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
  const r = await engine.handle(evt({ channel_id: "1003", token: channelToken("1003", WEBHOOK_SECRET), module: "Deals" }));
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
  const q = buildQuery("Leads", "2026-07-01T00:00:00+05:30", { limit: 50, offset: 100 });
  assert.match(q, /from Leads/);
  assert.match(q, /order by Modified_Time asc/);
  assert.match(q, /limit 100,50/);
});

test("buildQuery rejects injection in the module name and a bad datetime", () => {
  assert.throws(() => buildQuery("Leads; drop", "2026-07-01T00:00:00+05:30"), /Invalid module/);
  assert.throws(() => buildQuery("Leads", "2026-07-01T00:00:00.000Z' or '1'='1"), /Invalid datetime/);
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

  // Relative to now, deliberately, and derived ONCE so the mock and the
  // assertion cannot disagree.
  //
  // planWindow() floors the scan window at `now - maxLookbackMs` (7 days) and
  // sweep() seeds its high-water mark from that floor, raising it only for
  // records modified later. A pinned Modified_Time therefore stops being inside
  // the window once it ages past the lookback: the checkpoint settles on the
  // floor rather than the record, and the assertion fails. This test did exactly
  // that, seven days after the date it was written against — a clean sweep is
  // still correct, the fixture had simply expired.
  const modifiedIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const rec = createReconciler({
    query: async () => ({ data: [{ id: "L7", Modified_Time: modifiedIso }], info: { more_records: false } }),
    engine, store, subscriptions: SUBS, logger: silent(), metrics: createMetrics(),
  });
  await rec.sweep();
  assert.equal(await store.getCheckpoint("reconcile:Leads"), Date.parse(modifiedIso));
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

test("onLeadCreate skips non-student leads (multi-type guard)", async () => {
  const notes = [];
  const deps = { tenant: { assignment_engine: { v1_default_PROPOSED: { Student: { default_owner: "Kunal" } } } },
    crm: { addNote: async (...a) => notes.push(a) } };
  const r = await onLeadCreate({ Lead_Type: "University" }, { module: "Leads", id: "L1", logger: silent(), deps });
  assert.equal(r.action, "skipped");
  assert.equal(r.reason, "non_student");
  assert.equal(notes.length, 0, "no side effect for a non-student lead");
});

test("onLeadCreate routes a student lead: adds an audit note and posts to #leads", async () => {
  const notes = [], posts = [];
  const deps = {
    tenant: { assignment_engine: { v1_default_PROPOSED: { Student: { default_owner: "Kunal", by_market: { Pakistan: "Tahir" } } } } },
    crm: { addNote: async (m, id, title, content) => notes.push({ m, id, title, content }) },
    cliq: { post: async (ch, msg) => posts.push({ ch, msg }) },
  };
  const r = await onLeadCreate({ Market: "Pakistan" }, { module: "Leads", id: "L1", logger: silent(), deps });
  assert.equal(r.action, "routed");
  assert.equal(r.owner, "Tahir");
  assert.equal(notes.length, 1);
  assert.equal(notes[0].m, "Leads");
  assert.match(notes[0].content, /Tahir/);
  assert.equal(posts[0].ch, "leads");
  assert.ok(!posts[0].msg.includes("@"), "alert must not leak an email address");
});

// ---- Catalyst notification parser (pure, testable pre-platform) -----------
test("parseZohoNotification maps insert/update/delete to create/edit/delete", () => {
  const base = { module: "Leads", ids: ["1"], channel_id: 1001, token: "t", server_time: 5 };
  assert.equal(parseZohoNotification({ ...base, operation: "insert" }).notification.operation, "create");
  assert.equal(parseZohoNotification({ ...base, operation: "update" }).notification.operation, "edit");
  assert.equal(parseZohoNotification({ ...base, operation: "delete" }).notification.operation, "delete");
});

test("parseZohoNotification coerces channel_id/ids/token to strings", () => {
  const p = parseZohoNotification({ module: "Leads", ids: [123, 456], operation: "insert", channel_id: 1001, token: 99, server_time: 5 });
  assert.equal(p.ok, true);
  assert.deepEqual(p.notification.ids, ["123", "456"]);
  assert.equal(p.notification.channel_id, "1001");
  assert.equal(p.notification.token, "99");
});

test("parseZohoNotification rejects malformed bodies with a reason (acked, never retried)", () => {
  assert.equal(parseZohoNotification(null).reason, "empty_body");
  assert.equal(parseZohoNotification({ ids: ["1"], operation: "insert", channel_id: 1 }).reason, "missing_module");
  assert.equal(parseZohoNotification({ module: "Leads", operation: "insert", channel_id: 1 }).reason, "missing_ids");
  assert.equal(parseZohoNotification({ module: "Leads", ids: ["1"], channel_id: 1 }).reason, "unknown_operation:undefined");
  assert.match(parseZohoNotification({ module: "Leads", ids: ["1"], operation: "insert" }).reason, /missing_channel_id/);
});
