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
import { getAccessToken, setTokenCache } from "./oauth.mjs";
import { zohoRequest } from "./client.mjs";
import * as crm from "./services/crm.mjs";
import * as flow from "./services/flow.mjs";
import { buildFieldPayload } from "./services/crm-settings.mjs";
import { resolveValues } from "./provision-crm.mjs";

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
