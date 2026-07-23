/**
 * Functional tests for the server-side Zoho layer (functions/zoho).
 * Native node:test + node:assert — zero dependencies. No network: the fetch
 * boundary is stubbed so we exercise real oauth+client+service code paths
 * (URL building, auth header, 401 retry, error normalization, token caching,
 * input validation) deterministically.
 *
 * Run: node --test functions/
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { getDataCentre, serviceBase, requireEnv, getOAuthConfig, redact } from "./config.mjs";
import { parseJson, ZohoError } from "./http.mjs";
import { getAccessToken, setTokenCache, exchangeAuthCode } from "./oauth.mjs";
import { zohoRequest } from "./client.mjs";
import * as crm from "./services/crm.mjs";
import * as flow from "./services/flow.mjs";
import { buildFieldPayload } from "./services/crm-settings.mjs";
import { patchEnv } from "./scripts/exchange-and-update.mjs";
import { resolveValues, planProvision, planRollback, executeProvision, executeRollback } from "./provision-crm.mjs";
import { planPipeline, discoverForecastIds, executePipeline } from "./provision-pipeline.mjs";
import { provisionChannels } from "./services/cliq.mjs";
import { planWatches, toWatchPayload } from "./services/notifications.mjs";

// Test-local fake credentials (never real).
process.env.ZOHO_DC = "in";
process.env.ZOHO_CLIENT_ID = "1000.testclientid";
process.env.ZOHO_CLIENT_SECRET = "test-secret";
process.env.ZOHO_REFRESH_TOKEN = "1000.testrefresh";

// ---- helpers -------------------------------------------------------------
function jsonRes(status, obj) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(obj ?? {}) };
}
function stubFetch(handler) {
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, opts) => handler(String(url), opts);
  return () => { globalThis.fetch = orig; };
}
function freshCache() {
  let e = { token: null, expiresAt: 0 };
  return { get: () => e, set: (t, ttl) => { e = { token: t, expiresAt: Date.now() + ttl }; }, clear: () => { e = { token: null, expiresAt: 0 }; } };
}
const isToken = (u) => u.includes("/oauth/v2/token");

// ---- config.mjs ----------------------------------------------------------
test("getDataCentre resolves known DCs and rejects unknown", () => {
  assert.equal(getDataCentre("in").accounts, "https://accounts.zoho.in");
  assert.equal(getDataCentre("us").api, "https://www.zohoapis.com");
  assert.equal(getDataCentre("eu").accounts, "https://accounts.zoho.eu");
  assert.throws(() => getDataCentre("xx"), /Unknown ZOHO_DC/);
});

test("serviceBase maps services to correct per-DC hosts", () => {
  assert.equal(serviceBase("crm", "in"), "https://www.zohoapis.in/crm/v7");
  assert.equal(serviceBase("mail", "in"), "https://mail.zoho.in/api");
  assert.equal(serviceBase("analytics", "in"), "https://analyticsapi.zoho.in/restapi/v2");
  assert.throws(() => serviceBase("nope", "in"), /No API base/);
});

test("serviceBase supports a CRM API version override (v8-only endpoints)", () => {
  assert.equal(serviceBase("crm", "in"), "https://www.zohoapis.in/crm/v7");
  assert.equal(serviceBase("crm", "in", "v8"), "https://www.zohoapis.in/crm/v8");
  // Non-CRM services ignore the version argument.
  assert.equal(serviceBase("mail", "in", "v8"), "https://mail.zoho.in/api");
});

test("zohoRequest honours apiVersion when building the URL", async () => {
  setTokenCache(freshCache());
  let seen = null;
  const restore = stubFetch((u) => {
    if (isToken(u)) return jsonRes(200, { access_token: "tok", expires_in: 3600 });
    seen = u;
    return jsonRes(200, { workflow_rules: [] });
  });
  try {
    await zohoRequest("crm", "/settings/automation/workflow_rules", { apiVersion: "v8" });
    assert.ok(seen.includes("/crm/v8/"), `expected v8 in URL, got ${seen}`);
    await zohoRequest("crm", "/Leads");
    assert.ok(seen.includes("/crm/v7/"), `expected v7 default, got ${seen}`);
  } finally { restore(); }
});

test("requireEnv names missing vars and never prints present values", () => {
  process.env.RQ_PRESENT = "supersecretvalue";
  try {
    assert.throws(
      () => requireEnv(["RQ_PRESENT", "RQ_MISSING_A", "RQ_MISSING_B"]),
      (err) => err.message.includes("RQ_MISSING_A") && err.message.includes("RQ_MISSING_B") && !err.message.includes("supersecretvalue")
    );
  } finally {
    delete process.env.RQ_PRESENT;
  }
});

test("getOAuthConfig returns creds when present", () => {
  const c = getOAuthConfig();
  assert.equal(c.clientId, "1000.testclientid");
  assert.equal(c.dc.accounts, "https://accounts.zoho.in");
});

test("redact masks token- and secret-shaped strings", () => {
  assert.ok(redact("1000.abcdef1234567890.tokentoken").includes("…"));
  assert.ok(!redact("client_secret=abc123xyz").includes("abc123xyz"));
});

// ---- http.mjs ------------------------------------------------------------
test("parseJson tolerates empty and invalid bodies", async () => {
  assert.deepEqual(await parseJson({ text: async () => "" }), {});
  assert.deepEqual(await parseJson({ text: async () => "{\"a\":1}" }), { a: 1 });
  assert.deepEqual(await parseJson({ text: async () => "not json" }), { raw: "not json" });
});

test("ZohoError carries status/code/service", () => {
  const e = new ZohoError("boom", { status: 400, code: "X", service: "crm" });
  assert.equal(e.name, "ZohoError");
  assert.equal(e.status, 400);
  assert.equal(e.service, "crm");
});

// ---- oauth.mjs -----------------------------------------------------------
test("getAccessToken caches and force-refreshes", async () => {
  setTokenCache(freshCache());
  let calls = 0;
  const restore = stubFetch((u) => (isToken(u) ? (calls++, jsonRes(200, { access_token: "tok" + calls, expires_in: 3600 })) : jsonRes(404, {})));
  try {
    assert.equal(await getAccessToken(), "tok1");
    assert.equal(await getAccessToken(), "tok1"); // cached, no 2nd token call
    assert.equal(calls, 1);
    assert.equal(await getAccessToken({ forceRefresh: true }), "tok2");
    assert.equal(calls, 2);
  } finally {
    restore();
  }
});

test("getAccessToken single-flights concurrent refreshes (no stampede)", async () => {
  setTokenCache(freshCache());
  let calls = 0;
  const restore = stubFetch(async (u) => {
    if (!isToken(u)) return jsonRes(404, {});
    calls++;
    await new Promise((r) => setTimeout(r, 20)); // hold the refresh open
    return jsonRes(200, { access_token: "tok", expires_in: 3600 });
  });
  try {
    const tokens = await Promise.all([getAccessToken(), getAccessToken(), getAccessToken(), getAccessToken(), getAccessToken()]);
    assert.ok(tokens.every((t) => t === "tok"));
    assert.equal(calls, 1); // five concurrent callers, ONE refresh request
  } finally {
    restore();
  }
});

test("getAccessToken surfaces refresh errors", async () => {
  setTokenCache(freshCache());
  const restore = stubFetch((u) => (isToken(u) ? jsonRes(400, { error: "invalid_client" }) : jsonRes(404, {})));
  try {
    await assert.rejects(() => getAccessToken(), /invalid_client/);
  } finally {
    restore();
  }
});

// ---- client.mjs ----------------------------------------------------------
test("zohoRequest transparently retries once on 401", async () => {
  setTokenCache(freshCache());
  let svc = 0;
  const restore = stubFetch((u) => {
    if (isToken(u)) return jsonRes(200, { access_token: "tok", expires_in: 3600 });
    if (u.includes("/crm/v7/Leads/1")) { svc++; return svc === 1 ? jsonRes(401, {}) : jsonRes(200, { data: [{ id: "1" }] }); }
    return jsonRes(404, {});
  });
  try {
    const out = await zohoRequest("crm", "/Leads/1");
    assert.equal(svc, 2); // retried after 401
    assert.equal(out.data[0].id, "1");
  } finally {
    restore();
  }
});

test("zohoRequest sets the Zoho oauth header and normalizes errors", async () => {
  setTokenCache(freshCache());
  let seenAuth = null;
  const restore = stubFetch((u, opts) => {
    if (isToken(u)) return jsonRes(200, { access_token: "tok", expires_in: 3600 });
    seenAuth = opts.headers.Authorization;
    return jsonRes(400, { code: "INVALID_DATA", message: "bad field" });
  });
  try {
    await assert.rejects(
      () => zohoRequest("crm", "/Leads"),
      (err) => err instanceof ZohoError && err.status === 400 && /bad field/.test(err.message)
    );
    assert.equal(seenAuth, "Zoho-oauthtoken tok");
  } finally {
    restore();
  }
});

// ---- services/crm.mjs ----------------------------------------------------
test("createOrUpdateLead requires Email or Phone", async () => {
  await assert.rejects(() => crm.createOrUpdateLead({ Last_Name: "X" }), /requires at least Email or Phone/);
});

test("createOrUpdateLead upserts with dedupe fields and returns action+id", async () => {
  setTokenCache(freshCache());
  let body = null;
  const restore = stubFetch((u, opts) => {
    if (isToken(u)) return jsonRes(200, { access_token: "tok", expires_in: 3600 });
    body = JSON.parse(opts.body);
    return jsonRes(200, { data: [{ action: "insert", details: { id: "555" }, status: "success" }] });
  });
  try {
    const out = await crm.createOrUpdateLead({ Last_Name: "Test", Email: "a@b.com" }, { source: "Website Form" });
    assert.equal(out.action, "insert");
    assert.equal(out.id, "555");
    assert.deepEqual(body.duplicate_check_fields, ["Email", "Phone"]);
    assert.equal(body.data[0].Lead_Source, "Website Form");
  } finally {
    restore();
  }
});

// ---- services/flow.mjs ---------------------------------------------------
// ---- .env patching (silent corruption here would be very bad) -----------
test("patchEnv replaces the key in place and preserves every other line", () => {
  const before = "# comment\nZOHO_DC=in\nZOHO_REFRESH_TOKEN=old.value\nZOHO_SCOPES=a,b\n";
  const after = patchEnv(before, "ZOHO_REFRESH_TOKEN", "new.value");
  assert.match(after, /^ZOHO_REFRESH_TOKEN=new\.value$/m);
  assert.ok(!after.includes("old.value"));
  assert.ok(after.includes("# comment"), "comments must survive");
  assert.ok(after.includes("ZOHO_DC=in") && after.includes("ZOHO_SCOPES=a,b"), "other keys must survive");
  assert.equal(after.split("\n").length, before.split("\n").length, "line count must not change");
});

test("patchEnv appends when the key is absent, without duplicating newlines", () => {
  const after = patchEnv("ZOHO_DC=in\n", "ZOHO_REFRESH_TOKEN", "v1");
  assert.equal(after, "ZOHO_DC=in\nZOHO_REFRESH_TOKEN=v1\n");
  assert.ok(!/\n\n/.test(after));
});

test("patchEnv does not match a key that is merely a prefix of another", () => {
  const before = "ZOHO_REFRESH_TOKEN_BACKUP=keep\nZOHO_REFRESH_TOKEN=old\n";
  const after = patchEnv(before, "ZOHO_REFRESH_TOKEN", "new");
  assert.ok(after.includes("ZOHO_REFRESH_TOKEN_BACKUP=keep"), "prefix-sharing key must not be clobbered");
  assert.match(after, /^ZOHO_REFRESH_TOKEN=new$/m);
});

// ---- provisioning: buildFieldPayload + resolveValues -------------------
test("buildFieldPayload maps picklist/text/phone correctly", () => {
  const pick = buildFieldPayload({ label: "Market", type: "picklist", values: ["India", "Nepal"] });
  assert.equal(pick.data_type, "picklist");
  assert.deepEqual(pick.pick_list_values, [
    { display_value: "India", actual_value: "India" },
    { display_value: "Nepal", actual_value: "Nepal" },
  ]);
  const text = buildFieldPayload({ label: "UTM Source", type: "text", length: 120 });
  assert.equal(text.data_type, "text");
  assert.equal(text.length, 120);
  const phone = buildFieldPayload({ label: "WhatsApp Number", type: "phone" });
  assert.equal(phone.data_type, "phone");
  assert.equal(phone.pick_list_values, undefined);
});

test("resolveValues pulls picklist values from tenant config (single source)", () => {
  const tenant = {
    lead_types: { active: ["Student"], future_ready: ["Parent"] },
    markets: { primary: ["India", "Nepal", "Pakistan"], secondary: ["Bhutan"] },
    destinations: { primary_europe: ["Italy"], secondary: ["Japan"] },
    service_packages: ["Initial Counselling"],
  };
  assert.deepEqual(resolveValues({ values_from: "lead_types" }, tenant), ["Student", "Parent"]);
  assert.deepEqual(resolveValues({ values_from: "markets" }, tenant), ["India", "Nepal", "Pakistan", "Bhutan", "Other"]);
  assert.deepEqual(resolveValues({ values_from: "destinations" }, tenant), ["Italy", "Japan", "Other"]);
  assert.deepEqual(resolveValues({ values: ["A", "B"] }, tenant), ["A", "B"]);
  assert.throws(() => resolveValues({ values_from: "nope" }, tenant), /Unknown values_from/);
});

// ---- oauth: auth-code exchange flow ------------------------------------
test("exchangeAuthCode returns tokens on success and throws on error", async () => {
  const opts = { clientId: "1000.x", clientSecret: "s", redirectUri: "https://r", dc: { accounts: "https://accounts.zoho.in" } };
  let ok = stubFetch((u) => (isToken(u) ? jsonRes(200, { access_token: "a", refresh_token: "1000.rt", scope: "ZohoCRM.settings.ALL" }) : jsonRes(404, {})));
  try {
    const json = await exchangeAuthCode("grant123", opts);
    assert.equal(json.refresh_token, "1000.rt");
  } finally { ok(); }
  await assert.rejects(() => exchangeAuthCode("", opts), /Missing authorization code/);
  const bad = stubFetch(() => jsonRes(400, { error: "invalid_code" }));
  try { await assert.rejects(() => exchangeAuthCode("expired", opts), /invalid_code/); } finally { bad(); }
});

// ---- provisioning engine: plan / execute / idempotency / retry / rollback
const SCHEMA = { modules: { Leads: [
  { label: "Lead Type", type: "picklist", values_from: "lead_types" },
  { label: "WhatsApp Number", type: "phone" },
  { label: "Assigned Counselor", type: "userlookup", manual: true, manual_reason: "user-lookup" },
] } };
const TENANT = { lead_types: { active: ["Student"], future_ready: ["Parent"] } };

test("planProvision is idempotent: creates missing, skips existing, flags manual", () => {
  const plan = planProvision(SCHEMA, TENANT, { Leads: [{ field_label: "WhatsApp Number", custom_field: true }] });
  const actions = Object.fromEntries(plan.Leads.map((i) => [i.label, i.action]));
  assert.equal(actions["Lead Type"], "create");
  assert.equal(actions["WhatsApp Number"], "skip"); // already exists
  assert.equal(actions["Assigned Counselor"], "manual");
});

test("executeProvision dry-run creates nothing", async () => {
  let calls = 0;
  const api = { createField: async () => (calls++, { ok: true }), getFields: async () => [] };
  const s = await executeProvision(planProvision(SCHEMA, TENANT, { Leads: [] }), api, { commit: false });
  assert.equal(calls, 0);
  assert.equal(s.wouldCreate, 2); // Lead Type + WhatsApp Number; Assigned Counselor is manual
});

test("executeProvision commit creates, verifies by read-back, and auto-retries transient failures", async () => {
  const created = [];
  let attempts = 0;
  const api = {
    createField: async (m, def) => {
      attempts++;
      if (def.label === "Lead Type" && attempts === 1) return { ok: false, code: "INTERNAL_ERROR" }; // transient → retry
      created.push({ field_label: def.label, custom_field: true, id: "id_" + def.label });
      return { ok: true, api_name: def.label.replace(/ /g, "_") };
    },
    getFields: async () => created,
  };
  const plan = planProvision(SCHEMA, TENANT, { Leads: [] });
  const s = await executeProvision(plan, api, { commit: true, tries: 3, delayMs: 0 });
  assert.equal(s.created, 2); // Lead Type (after retry) + WhatsApp Number
  assert.equal(s.manual, 1);
  assert.equal(s.failed, 0);
  assert.ok(attempts >= 3, "Lead Type retried at least once");
});

test("executeProvision reports permanent failure without infinite retry", async () => {
  const api = { createField: async () => ({ ok: false, code: "DUPLICATE_DATA", message: "exists" }), getFields: async () => [] };
  const s = await executeProvision(planProvision(SCHEMA, TENANT, { Leads: [] }), api, { commit: true, tries: 3, delayMs: 0 });
  assert.equal(s.failed, 2); // Lead Type + WhatsApp both permanent-fail, no retry storm
});

test("planRollback + executeRollback delete custom fields, skip absent/non-custom", async () => {
  const existing = { Leads: [
    { field_label: "Lead Type", custom_field: true, id: "id1" },
    { field_label: "WhatsApp Number", custom_field: true, id: "id2" },
  ] };
  const plan = planRollback(SCHEMA, existing);
  const deletes = plan.Leads.filter((i) => i.action === "delete").map((i) => i.id);
  assert.deepEqual(deletes.sort(), ["id1", "id2"]);
  const removed = [];
  const api = { deleteField: async (m, id) => (removed.push(id), { ok: true }) };
  const s = await executeRollback(plan, api, { commit: true, delayMs: 0 });
  assert.equal(s.deleted, 2);
  assert.deepEqual(removed.sort(), ["id1", "id2"]);
});

// ---- pipeline provisioning ------------------------------------------------
const PIPELINE = { module: "Deals", field: "Stage", stages: [
  { name: "New Inquiry", probability: 10, category: "Open", forecast: "Pipeline" },
  { name: "Closed Lost", probability: 0, category: "Closed Lost", forecast: "Omitted" },
] };
const LIVE_OPTS = [
  { id: "o1", display_value: "New Inquiry", actual_value: "Qualification", probability: 99, deal_category: "Open", forecast_category: { name: "Pipeline", id: "fc1" } },
  { id: "o2", display_value: "Legacy Stage", actual_value: "Legacy Stage", probability: 50, deal_category: "Open", forecast_category: { name: "Pipeline", id: "fc1" } },
  { id: "o3", display_value: "Closed Lost", actual_value: "Closed Lost", probability: 0, deal_category: "Closed Lost", forecast_category: { name: "Omitted", id: "fc3" } },
];

test("discoverForecastIds maps org-specific forecast category ids", () => {
  assert.deepEqual(discoverForecastIds(LIVE_OPTS), { Pipeline: "fc1", Omitted: "fc3" });
});

test("planPipeline preserves actual_value on rename and flags drift/orphans", () => {
  const { values, diff, orphans } = planPipeline(PIPELINE, LIVE_OPTS, { Pipeline: "fc1", Omitted: "fc3" });
  // Renamed option keeps its STORED value so historical records stay valid.
  assert.equal(values[0].actual_value, "Qualification");
  assert.equal(values[0].id, "o1");
  assert.equal(values[0].probability, 10);
  assert.equal(values[0].forecast_category.id, "fc1");
  assert.equal(diff.find((d) => d.stage === "New Inquiry").action, "update"); // probability drifted 99→10
  assert.equal(diff.find((d) => d.stage === "Closed Lost").action, "keep");
  assert.deepEqual(orphans, ["Legacy Stage"]);
});

test("planPipeline sends the COMPLETE set (atomic) — never a partial list", () => {
  const { values } = planPipeline(PIPELINE, LIVE_OPTS, { Pipeline: "fc1", Omitted: "fc3" });
  // Every configured stage must be present, else Zoho de-associates the omitted ones.
  assert.equal(values.length, PIPELINE.stages.length);
  assert.deepEqual(values.map((v) => v.display_value), ["New Inquiry", "Closed Lost"]);
  assert.deepEqual(values.map((v) => v.sequence_number), [1, 2]);
});

test("planPipeline creates new stages with deal_category + forecast id, and rejects unknown forecast", () => {
  const withNew = { ...PIPELINE, stages: [...PIPELINE.stages, { name: "Visa Filed", probability: 90, category: "Open", forecast: "Pipeline" }] };
  const { values, diff } = planPipeline(withNew, LIVE_OPTS, { Pipeline: "fc1", Omitted: "fc3" });
  const created = values.find((v) => v.display_value === "Visa Filed");
  assert.equal(created.id, undefined); // new option carries no id
  assert.equal(created.deal_category, "Open");
  assert.equal(created.forecast_category.id, "fc1");
  assert.equal(diff.find((d) => d.stage === "Visa Filed").action, "create");
  assert.throws(() => planPipeline({ ...PIPELINE, stages: [{ name: "X", probability: 1, category: "Open", forecast: "Nope" }] }, LIVE_OPTS, { Pipeline: "fc1" }), /No forecast category id/);
});

test("executePipeline is dry-run by default and commits atomically once", async () => {
  let calls = 0;
  const api = { updateField: async (_id, _m, vals) => (calls++, { ok: true, sent: vals.length }) };
  const { values } = planPipeline(PIPELINE, LIVE_OPTS, { Pipeline: "fc1", Omitted: "fc3" });
  const dry = await executePipeline("f1", values, api, { commit: false });
  assert.equal(calls, 0);
  assert.equal(dry.committed, false);
  const live = await executePipeline("f1", values, api, { commit: true });
  assert.equal(calls, 1); // ONE atomic call, not one per stage
  assert.equal(live.ok, true);
});

// ---- event subscriptions (ADR-006) ----------------------------------------
const EVENTS = {
  expiry_hours: 24,
  renewal_hours: 6,
  subscriptions: [
    { name: "speed-to-lead", channel_id: "1001", events: ["Leads.create"] },
    { name: "case-stage-change", channel_id: "1003", events: ["Deals.edit"] },
  ],
};
const URL_A = "https://api.richenquest.com/hook";
const HOUR = 3600_000;

test("planWatches requires an HTTPS notify_url", () => {
  assert.throws(() => planWatches(EVENTS, [], ""), /notify_url is required/);
  assert.throws(() => planWatches(EVENTS, [], "http://insecure.example/hook"), /must be HTTPS/);
});

test("planWatches creates only what is missing", () => {
  const live = [{ channel_id: "1001", events: ["Leads.create"], notify_url: URL_A, expiresAt: Date.now() + 20 * HOUR }];
  const { plan } = planWatches(EVENTS, live, URL_A);
  assert.equal(plan.find((p) => p.channel_id === "1001").action, "keep");
  assert.equal(plan.find((p) => p.channel_id === "1003").action, "create");
});

test("planWatches renews a channel about to expire (silent-failure guard)", () => {
  const now = Date.now();
  // Expires in 2h, inside the 6h renewal window → must renew BEFORE it lapses.
  const live = [{ channel_id: "1001", events: ["Leads.create"], notify_url: URL_A, expiresAt: now + 2 * HOUR }];
  const { plan } = planWatches(EVENTS, live, URL_A, now);
  const p = plan.find((x) => x.channel_id === "1001");
  assert.equal(p.action, "renew");
  assert.match(p.reason, /expires in/);
});

test("planWatches updates when events or notify_url drift", () => {
  const now = Date.now();
  const far = now + 20 * HOUR;
  const eventsDrift = planWatches(EVENTS, [{ channel_id: "1001", events: ["Leads.edit"], notify_url: URL_A, expiresAt: far }], URL_A, now);
  assert.equal(eventsDrift.plan.find((p) => p.channel_id === "1001").reason, "events changed");
  const urlDrift = planWatches(EVENTS, [{ channel_id: "1001", events: ["Leads.create"], notify_url: "https://old.example/hook", expiresAt: far }], URL_A, now);
  assert.equal(urlDrift.plan.find((p) => p.channel_id === "1001").reason, "notify_url changed");
});

test("planWatches reports undeclared live channels as drift", () => {
  const live = [{ channel_id: "9999", events: ["Contacts.create"], notify_url: URL_A, expiresAt: Date.now() + 20 * HOUR }];
  const { orphans } = planWatches(EVENTS, live, URL_A);
  assert.deepEqual(orphans, ["9999"]);
});

test("toWatchPayload embeds the caller-supplied token and requires one", () => {
  const p = toWatchPayload(EVENTS.subscriptions[0], URL_A, 24, "hmac-token-abc");
  assert.equal(p.channel_id, "1001");
  assert.equal(p.notify_url, URL_A);
  assert.deepEqual(p.events, ["Leads.create"]);
  assert.ok(Date.parse(p.channel_expiry) > Date.now(), "expiry must be in the future");
  assert.equal(p.token, "hmac-token-abc"); // unpredictable HMAC, not a name-derived string
  assert.throws(() => toWatchPayload(EVENTS.subscriptions[0], URL_A, 24), /requires a per-channel token/);
});

// ---- Cliq channel provisioning (duplicate-safety) -------------------------
test("provisionChannels ABORTS when channels cannot be listed (no blind creates)", async () => {
  setTokenCache(freshCache());
  const restore = stubFetch((u) => {
    if (isToken(u)) return jsonRes(200, { access_token: "tok", expires_in: 3600 });
    return jsonRes(401, { code: "oauthtoken_scope_invalid", message: "missing scope" });
  });
  try {
    // Cliq allows duplicate names and has no delete API — creating blind is unrecoverable.
    await assert.rejects(
      () => provisionChannels([{ name: "leads", description: "x" }], { commit: true }),
      (err) => /Refusing to create blind/.test(err.message) && err.code === "cliq_read_required"
    );
  } finally { restore(); }
});

test("provisionChannels creates only missing channels (case-insensitive, #-tolerant)", async () => {
  setTokenCache(freshCache());
  const created = [];
  const restore = stubFetch((u, opts) => {
    if (isToken(u)) return jsonRes(200, { access_token: "tok", expires_in: 3600 });
    if (opts?.method === "POST") {
      const body = JSON.parse(opts.body);
      created.push(body.name);
      return jsonRes(200, { name: `#${body.name}`, id: `CT_${body.name}` });
    }
    return jsonRes(200, { channels: [{ name: "#leads", id: "CT_1" }, { name: "Wins", id: "CT_2" }] });
  });
  try {
    const s = await provisionChannels(
      [{ name: "leads", description: "a" }, { name: "wins", description: "b" }, { name: "ops-alerts", description: "c" }],
      { commit: true }
    );
    assert.deepEqual(created, ["ops-alerts"]); // leads (#-prefixed) and wins (case) both matched
    assert.equal(s.created, 1);
    assert.equal(s.existing, 2);
  } finally { restore(); }
});

test("provisionChannels dry-run creates nothing", async () => {
  setTokenCache(freshCache());
  let posts = 0;
  const restore = stubFetch((u, opts) => {
    if (isToken(u)) return jsonRes(200, { access_token: "tok", expires_in: 3600 });
    if (opts?.method === "POST") { posts++; return jsonRes(200, {}); }
    return jsonRes(200, { channels: [] });
  });
  try {
    const s = await provisionChannels([{ name: "leads", description: "a" }], { commit: false });
    assert.equal(posts, 0);
    assert.equal(s.wouldCreate, 1);
  } finally { restore(); }
});

test("triggerFlow rejects non-Zoho / insecure URLs and accepts a valid webhook", async () => {
  await assert.rejects(() => flow.triggerFlow({}, "http://flow.zoho.in/x"), /https Zoho Flow/);
  await assert.rejects(() => flow.triggerFlow({}, "https://evil.com/x"), /https Zoho Flow/);
  await assert.rejects(() => flow.triggerFlow({}, "https://zoho.in.evil.com/x"), /https Zoho Flow/);

  const restore = stubFetch(() => jsonRes(200, { received: true }));
  try {
    const out = await flow.triggerFlow({ a: 1 }, "https://flow.zoho.in/webhook/abc");
    assert.equal(out.received, true);
  } finally {
    restore();
  }
});
