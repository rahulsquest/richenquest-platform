/**
 * Lead intake core. Every rule the public endpoint enforces is exercised here,
 * with no Express, no Catalyst SDK and no live CRM — the CRM is a spy, so a test
 * run never touches the real org.
 *
 * Run: node --test functions/catalyst/lead-intake-core.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  createLeadIntakeCore, createMemoryStore, validateLead, toCrmLead, sanitize, splitName,
  ALLOWED_ORIGIN, MAX_BODY_BYTES, RATE_LIMIT_MAX, MIN_FILL_MS, MAX_FORM_AGE_MS,
  DUPLICATE_WINDOW_MS, CRM_SOURCE_DETAIL,
} from "./lead-intake-core.mjs";

const T0 = 1_800_000_000_000;
const quiet = { info() {}, warn() {}, error() {} };

/** A submission a real person would produce, filled at a human speed. */
const goodBody = (over = {}) => ({
  name: "Ada Lovelace",
  email: "ada@example.com",
  phone: "+91 98765 43210",
  destination: "Germany",
  level: "Master's",
  message: "Interested in CS for Sep 2027.",
  ts: T0 - 30_000,
  ...over,
});

function harness({ crm, now = () => T0, store } = {}) {
  const calls = [];
  const createOrUpdateLead = crm ?? (async (fields, opts) => {
    calls.push({ fields, opts });
    return { action: "insert", id: "LEAD1" };
  });
  const spy = crm ? calls : calls;
  const core = createLeadIntakeCore({
    createOrUpdateLead: crm ? async (f, o) => { calls.push({ fields: f, opts: o }); return crm(f, o); } : createOrUpdateLead,
    now, store: store ?? createMemoryStore(), logger: quiet,
    newRequestId: () => "req_test",
  });
  const call = async (over = {}) => {
    let out = null;
    await core({
      method: "POST", origin: ALLOWED_ORIGIN, clientKey: "1.1.1.1",
      rawBody: JSON.stringify(goodBody()), ...over,
      respond: (status, body, headers) => { out = { status, body, headers }; },
    });
    return out;
  };
  return { call, calls: spy, core };
}

/* ------------------------------------------------------------- sanitising --- */

test("sanitize strips control characters, collapses whitespace and clamps length", () => {
  assert.equal(sanitize("  Ada\x00\x07  Lovelace \n", 100), "Ada Lovelace");
  assert.equal(sanitize("a".repeat(50), 10), "a".repeat(10));
  assert.equal(sanitize(undefined, 10), "");
  assert.equal(sanitize(12345, 10), "", "non-strings must not leak through as objects");
  // Hyphens and plus signs are ORDINARY characters and must survive.
  assert.equal(sanitize("+91 98765-43210", 32), "+91 98765-43210");
});

test("splitName keeps Last_Name populated, because CRM makes it mandatory", () => {
  assert.deepEqual(splitName("Ada Lovelace"), { first: "Ada", last: "Lovelace" });
  assert.deepEqual(splitName("Ada Byron King Lovelace"), { first: "Ada Byron King", last: "Lovelace" });
  assert.deepEqual(splitName("Prince"), { first: "", last: "Prince" }, "a single word becomes the LAST name");
});

/* ------------------------------------------------------------- validation --- */

test("validation rejects a malformed email", () => {
  for (const email of ["notanemail", "a@b", "a b@c.com", "@example.com", "ada@", ""]) {
    const r = validateLead({ ...goodBody(), email });
    assert.equal(r.ok, false, `"${email}" must be rejected`);
    assert.ok(r.errors.some((e) => e.field === "email"));
  }
});

test("validation accepts real-world email and phone shapes", () => {
  for (const email of ["ada@example.com", "ada.lovelace+tag@sub.example.co.uk"]) {
    assert.equal(validateLead({ ...goodBody(), email }).ok, true, email);
  }
  for (const phone of ["+91 98765 43210", "+91-98765-43210", "(020) 7946 0958", "9876543210"]) {
    assert.equal(validateLead({ ...goodBody(), phone }).ok, true, phone);
  }
});

test("validation rejects a malformed phone", () => {
  for (const phone of ["", "12345", "abcdefgh", "+1234567890123456789"]) {
    const r = validateLead({ ...goodBody(), phone });
    assert.equal(r.ok, false, `"${phone}" must be rejected`);
    assert.ok(r.errors.some((e) => e.field === "phone"));
  }
});

test("validation rejects an empty or one-character name", () => {
  for (const name of ["", " ", "A"]) {
    assert.equal(validateLead({ ...goodBody(), name }).ok, false);
  }
});

test("validation reports EVERY bad field at once, not just the first", () => {
  const r = validateLead({ name: "", email: "bad", phone: "1" });
  assert.equal(r.ok, false);
  assert.deepEqual(r.errors.map((e) => e.field).sort(), ["email", "name", "phone"]);
});

/* ---------------------------------------------------------------- mapping --- */

test("CRM mapping sends only picklist values the live org actually has", () => {
  const f = toCrmLead(validateLead(goodBody()).value);
  assert.equal(f.Last_Name, "Lovelace");
  assert.equal(f.First_Name, "Ada");
  assert.equal(f.Email, "ada@example.com");
  assert.equal(f.Phone, "+919876543210");
  assert.deepEqual(f.Interested_Country, ["Germany"]);
  assert.equal(f.Interested_Level, "Master's");
  assert.equal(f.Lead_Source_Detail, CRM_SOURCE_DETAIL);
});

test("a destination absent from the CRM picklist becomes Other and is preserved verbatim", () => {
  // Austria is offered by the live form and is NOT in Interested_Country.
  const f = toCrmLead(validateLead(goodBody({ destination: "Austria" })).value);
  assert.deepEqual(f.Interested_Country, ["Other"], "an unmatched value must never be sent raw");
  assert.match(f.Description, /Preferred destination \(as submitted\): Austria/,
    "the real answer must survive in Description or the counsellor loses it");
});

test("'Diploma / Other' — the live form's value — maps to Other, not to a rejected string", () => {
  const f = toCrmLead(validateLead(goodBody({ level: "Diploma / Other" })).value);
  assert.equal(f.Interested_Level, "Other");
  assert.match(f.Description, /Study level \(as submitted\): Diploma \/ Other/);
});

test("Lead_Source is omitted entirely — the org's picklist has no 'Website'", () => {
  const f = toCrmLead(validateLead(goodBody()).value);
  assert.equal(f.Lead_Source, undefined);
  // The wire format is what matters: an undefined key must not be serialised.
  assert.equal("Lead_Source" in JSON.parse(JSON.stringify(f)), false,
    "sending an out-of-picklist Lead_Source risks INVALID_DATA and a lost lead");
});

test("empty optional fields are omitted rather than sent blank", () => {
  const f = toCrmLead(validateLead(goodBody({ destination: "", level: "", message: "" })).value);
  assert.equal("Interested_Country" in f, false);
  assert.equal("Interested_Level" in f, false);
  assert.match(f.Description, /Submitted via the richenquest.com website form/);
});

/* ------------------------------------------------------------------- HTTP --- */

test("only POST is accepted; OPTIONS and other verbs are refused", async () => {
  const { call, calls } = harness();
  assert.equal((await call({ method: "OPTIONS" })).status, 204);
  for (const method of ["GET", "PUT", "DELETE", "PATCH"]) {
    assert.equal((await call({ method })).status, 405, method);
  }
  assert.equal(calls.length, 0, "no verb other than POST may reach the CRM");
});

test("the origin allowlist admits the live site and refuses everything else", async () => {
  const { call, calls } = harness();
  assert.equal((await call()).status, 201);

  for (const origin of ["https://evil.example", "http://www.richenquest.com", "https://richenquest.com", ""]) {
    const res = await call({ origin });
    assert.equal(res.status, 403, `origin "${origin}" must be refused`);
  }
  assert.equal(calls.length, 1, "only the approved origin reached the CRM");
});

test("the core emits NO CORS headers — the Catalyst platform owns them", async () => {
  // Setting them here too produced TWO Access-Control-Allow-Origin headers on
  // every response, which browsers reject outright. Verified live: the platform
  // already returns exactly one for the allowlisted origin.
  const { call } = harness();
  for (const res of [await call(), await call({ method: "OPTIONS" }), await call({ method: "GET" }),
    await call({ rawBody: JSON.stringify(goodBody({ email: "bad" })) })]) {
    const keys = Object.keys(res.headers).map((k) => k.toLowerCase());
    assert.equal(keys.some((k) => k.startsWith("access-control-")), false,
      `a duplicate CORS header breaks the browser integration (saw: ${keys.join(", ")})`);
  }
});

test("an oversized payload is refused before it is parsed", async () => {
  const { call, calls } = harness();
  const res = await call({ rawBody: JSON.stringify(goodBody({ message: "x".repeat(MAX_BODY_BYTES) })) });
  assert.equal(res.status, 413);
  assert.equal(calls.length, 0);
});

test("malformed JSON and non-object bodies are refused", async () => {
  const { call } = harness();
  assert.equal((await call({ rawBody: "{not json" })).status, 400);
  assert.equal((await call({ rawBody: "[1,2,3]" })).status, 400);
  assert.equal((await call({ rawBody: '"a string"' })).status, 400);
});

test("a validation failure returns 422 with per-field issues and calls no CRM", async () => {
  const { call, calls } = harness();
  const res = await call({ rawBody: JSON.stringify(goodBody({ email: "nope" })) });
  assert.equal(res.status, 422);
  assert.equal(res.body.error, "validation_failed");
  assert.ok(res.body.issues.some((i) => i.field === "email"));
  assert.equal(calls.length, 0);
});

test("every response carries a request id", async () => {
  const { call } = harness();
  for (const res of [await call(), await call({ rawBody: "{bad" }), await call({ method: "GET" })]) {
    assert.ok(res.body.request_id, "a request id is what makes a report traceable");
  }
});

/* --------------------------------------------------------- spam protection --- */

test("a filled honeypot is silently accepted and never reaches the CRM", async () => {
  const { call, calls } = harness();
  const res = await call({ rawBody: JSON.stringify(goodBody({ website: "http://spam.example" })) });
  assert.equal(res.status, 200, "the bot must believe it succeeded");
  assert.equal(res.body.ok, true);
  assert.equal(calls.length, 0, "nothing may reach the CRM");
});

test("a form submitted faster than a human can type is dropped", async () => {
  const { call, calls } = harness();
  const res = await call({ rawBody: JSON.stringify(goodBody({ ts: T0 - (MIN_FILL_MS - 1) })) });
  assert.equal(res.status, 200);
  assert.equal(calls.length, 0);
});

test("a missing or stale timestamp is refused", async () => {
  const { call } = harness();
  assert.equal((await call({ rawBody: JSON.stringify(goodBody({ ts: undefined })) })).status, 400);
  assert.equal((await call({ rawBody: JSON.stringify(goodBody({ ts: "abc" })) })).status, 400);
  const stale = await call({ rawBody: JSON.stringify(goodBody({ ts: T0 - MAX_FORM_AGE_MS - 1 })) });
  assert.equal(stale.status, 400);
  assert.equal(stale.body.error, "stale_form");
});

test("rate limiting stops a burst from one client and reports Retry-After", async () => {
  const { call, calls } = harness();
  for (let i = 0; i < RATE_LIMIT_MAX; i++) {
    // Vary the address so each passes the duplicate window and only the rate
    // limit can be what stops the next one.
    const res = await call({ rawBody: JSON.stringify(goodBody({ email: `a${i}@example.com` })) });
    assert.equal(res.status, 201, `submission ${i + 1} should succeed`);
  }
  const blocked = await call({ rawBody: JSON.stringify(goodBody({ email: "over@example.com" })) });
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers["Retry-After"], "60");
  assert.equal(calls.length, RATE_LIMIT_MAX, "the blocked request must not reach the CRM");
});

test("rate limiting is per client, so one abuser cannot lock out everyone", async () => {
  const store = createMemoryStore();
  const { call } = harness({ store });
  for (let i = 0; i < RATE_LIMIT_MAX + 2; i++) {
    await call({ clientKey: "9.9.9.9", rawBody: JSON.stringify(goodBody({ email: `x${i}@example.com` })) });
  }
  const other = await call({ clientKey: "2.2.2.2", rawBody: JSON.stringify(goodBody({ email: "real@example.com" })) });
  assert.equal(other.status, 201, "a different visitor must still get through");
});

/* ---------------------------------------------------- duplicate submission --- */

test("a repeat submission inside the window creates exactly one CRM lead", async () => {
  const { call, calls } = harness();
  assert.equal((await call()).status, 201);
  const again = await call();
  assert.equal(again.status, 200);
  assert.equal(again.body.duplicate, true);
  assert.equal(calls.length, 1, "the second submission must not create a second lead");
});

test("the duplicate window expires, so a later genuine enquiry is accepted", async () => {
  let t = T0;
  const store = createMemoryStore();
  const { call, calls } = harness({ store, now: () => t });
  await call();
  t += DUPLICATE_WINDOW_MS + 1;
  const later = await call({ rawBody: JSON.stringify(goodBody({ ts: t - 30_000 })) });
  assert.equal(later.status, 201);
  assert.equal(calls.length, 2);
});

test("different people are never treated as duplicates of each other", async () => {
  const { call, calls } = harness();
  await call();
  const other = await call({ rawBody: JSON.stringify(goodBody({ email: "grace@example.com", phone: "+91 90000 00001" })) });
  assert.equal(other.status, 201);
  assert.equal(calls.length, 2);
});

/* ---------------------------------------------------------------- CRM path --- */

test("a successful submission upserts once, with the deduplicating CRM call", async () => {
  const { call, calls } = harness();
  const res = await call();
  assert.equal(res.status, 201);
  assert.equal(res.body.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].opts.source, CRM_SOURCE_DETAIL);
  assert.equal(calls[0].fields.Email, "ada@example.com");
});

test("a CRM outage returns 502 — never a false 'received' to the student", async () => {
  const { call } = harness({ crm: async () => { throw new Error("Zoho 500"); } });
  const res = await call();
  assert.equal(res.status, 502);
  assert.equal(res.body.error, "crm_unavailable");
  assert.equal(res.body.ok, undefined, "a failure must not look like a success");
});

test("a CRM failure is not remembered as a duplicate, so a retry can succeed", async () => {
  let fail = true;
  const store = createMemoryStore();
  const { call } = harness({ store, crm: async () => { if (fail) throw new Error("transient"); return { action: "insert", id: "L2" }; } });
  assert.equal((await call()).status, 502);
  fail = false;
  assert.equal((await call()).status, 201, "the student's retry must be able to get through");
});

test("no secret and no personal data appears in any response body", async () => {
  const { call } = harness({ crm: async () => { throw new Error("token=SECRET_abc123 host=db.internal"); } });
  const res = await call();
  const serialised = JSON.stringify(res.body);
  assert.equal(serialised.includes("SECRET_abc123"), false, "an upstream error must never be echoed to the caller");
  assert.equal(serialised.includes("db.internal"), false);
  assert.equal(serialised.includes("ada@example.com"), false);
});
