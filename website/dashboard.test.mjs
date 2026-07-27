/**
 * Student Dashboard — tests for everything that can be wrong without a browser.
 *
 * Scope, stated honestly: these cover the pure logic and the API client's
 * request/response contract. They do NOT cover rendering, and they do not prove
 * the dashboard works against a live Career Record API — nothing is deployed to
 * test against (docs/STATUS.md BL-1). What they do prove is that the client
 * speaks the contract in functions/record/api/endpoints.mjs, that session
 * handling refuses what it should, and that the derivations never invent data.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import {
  decodeClaims, expiresInMs, isExpired, looksLikeToken, sessionProblem,
  tokenFromFragment, fragmentWithoutToken, reasonText,
} from "./src/assets/js/app/session.js";
import { isAllowedApiOrigin, readSettings, resetPlatformConfig } from "./src/assets/js/app/config.js";
import { createRecordApi, ApiError } from "./src/assets/js/app/api.js";
import { parseRoute } from "./src/assets/js/app/router.js";
import {
  consentFromTimeline, evidenceIndex, pendingAcknowledgements, newSince,
  latestRecordedAt, buildNotifications, unreadCount, CONSENT_PURPOSES,
} from "./src/assets/js/app/derive.js";
import {
  eventLabel, eventGroup, actorLabel, formatDuration, relativeTime, evidenceKind, evidenceId, formatValue,
} from "./src/assets/js/app/format.js";

/* ─────────────────────────────────────────────────────────────── helpers ─── */

/** Build a token exactly as identity/auth.mjs does, so decoding is tested against the real shape. */
function makeToken(claims, secret = "x".repeat(32)) {
  const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const mac = createHmac("sha256", secret).update(body).digest("base64url");
  return `rq1.${body}.${mac}`;
}

const nowSec = () => Math.floor(Date.now() / 1000);

const subjectClaims = (over = {}) => ({
  v: 1,
  jti: "abc123",
  sub: "sub_test1",
  role: "subject",
  subject_id: "sub_test1",
  partner_id: null,
  scopes: [],
  iat: nowSec(),
  exp: nowSec() + 900,
  ...over,
});

const entry = (over = {}) => ({
  event_id: "evt_0000000001",
  type: "counselling.session_held",
  time: "2026-07-01T10:00:00.000Z",
  recorded: "2026-07-01T10:00:00.000Z",
  actor: { kind: "human", role: "counsellor", id: "usr_1" },
  authored_by_ai: false,
  evidence: [],
  decision: {},
  disclosure: null,
  acknowledgement: null,
  outcome: null,
  documents: [],
  follow_up: null,
  corrected: null,
  classification: "care_team",
  ...over,
});

/* ══════════════════════════════════════════════════════════════ session ═══ */

test("decodeClaims reads the claims a real issueToken() token carries", () => {
  const claims = subjectClaims();
  assert.deepEqual(decodeClaims(makeToken(claims)), claims);
});

test("decodeClaims returns null rather than throwing on anything malformed", () => {
  for (const bad of [null, undefined, "", "not-a-token", "rq1.only-two", "rq1.!!!.mac", 42]) {
    assert.equal(decodeClaims(bad), null, `expected null for ${JSON.stringify(bad)}`);
  }
});

test("decodeClaims handles unicode payloads without corrupting them", () => {
  const claims = subjectClaims({ sub: "sub_नमस्ते" });
  assert.equal(decodeClaims(makeToken(claims)).sub, "sub_नमस्ते");
});

test("looksLikeToken is structural only and does not accept another scheme", () => {
  assert.equal(looksLikeToken(makeToken(subjectClaims())), true);
  assert.equal(looksLikeToken("eyJhbGciOi.J9.abc"), false, "a JWT is not an rq1 token");
});

test("expiry is computed from exp in seconds", () => {
  const claims = subjectClaims({ exp: nowSec() + 60 });
  const remaining = expiresInMs(claims);
  assert.ok(remaining > 55_000 && remaining <= 60_000, `unexpected remaining ${remaining}`);
  assert.equal(isExpired(claims), false);
  assert.equal(isExpired(subjectClaims({ exp: nowSec() - 1 })), true);
  assert.equal(expiresInMs(null), 0, "no claims means no session");
});

test("sessionProblem refuses tokens the dashboard must not accept", () => {
  assert.equal(sessionProblem(subjectClaims()), null);
  assert.equal(sessionProblem(null), "malformed");
  assert.equal(sessionProblem(subjectClaims({ exp: nowSec() - 10 })), "expired");
  assert.equal(sessionProblem(subjectClaims({ role: "counsellor" })), "wrong_role");
  assert.equal(sessionProblem(subjectClaims({ role: "partner" })), "wrong_role");
  // A subject token with no record binding cannot be checked against anything.
  assert.equal(sessionProblem(subjectClaims({ subject_id: null })), "unbound");
});

test("a guardian token is accepted, since a guardian holds a dashboard session too", () => {
  assert.equal(sessionProblem(subjectClaims({ role: "guardian", subject_id: "sub_ward" })), null);
});

test("every refusal reason has wording written for a student", () => {
  for (const reason of ["absent", "expired", "malformed", "wrong_role", "unbound", "revoked"]) {
    const text = reasonText(reason);
    assert.ok(text.length > 20, `${reason} has no explanation`);
    assert.ok(!/token|claims|401/i.test(text), `${reason} leaks implementation wording: ${text}`);
  }
});

test("tokenFromFragment reads a token from both link shapes", () => {
  const token = makeToken(subjectClaims());
  assert.equal(tokenFromFragment(`#token=${encodeURIComponent(token)}`), token);
  assert.equal(tokenFromFragment(`#/record?token=${encodeURIComponent(token)}`), token);
  assert.equal(tokenFromFragment("#/timeline"), null);
  assert.equal(tokenFromFragment(""), null);
  assert.equal(tokenFromFragment("#token=garbage"), null, "a non-token value must not be adopted");
});

test("fragmentWithoutToken strips the credential but keeps the destination", () => {
  const token = makeToken(subjectClaims());
  assert.equal(fragmentWithoutToken(`#token=${token}`), "");
  assert.equal(fragmentWithoutToken(`#/record?token=${token}`), "#/record");
  assert.equal(fragmentWithoutToken("#/timeline"), "#/timeline");
});

/* ═══════════════════════════════════════════════════════════════ config ═══ */

test("isAllowedApiOrigin accepts https origins and loopback only", () => {
  assert.equal(isAllowedApiOrigin("https://api.richenquest.com"), true);
  assert.equal(isAllowedApiOrigin("http://localhost:8080"), true);
  assert.equal(isAllowedApiOrigin("http://127.0.0.1:8080"), true);
  assert.equal(isAllowedApiOrigin("http://api.richenquest.com"), false, "plaintext to a remote host");
  assert.equal(isAllowedApiOrigin("https://api.richenquest.com/v1"), false, "an endpoint, not an origin");
  assert.equal(isAllowedApiOrigin("https://api.example.com/?x=1"), false);
  assert.equal(isAllowedApiOrigin("javascript:alert(1)"), false);
  assert.equal(isAllowedApiOrigin(""), false);
  assert.equal(isAllowedApiOrigin(null), false);
});

test("readSettings treats an unset origin as 'not configured', never as a default", () => {
  resetPlatformConfig();
  const doc = { getElementById: () => ({ textContent: JSON.stringify({ recordApi: { baseUrl: "" } }) }) };
  const settings = readSettings(doc);
  assert.equal(settings.apiConfigured, false);
  assert.equal(settings.apiBaseUrl, "");
  assert.equal(settings.apiRejected, false, "empty is pending, not invalid");
});

test("readSettings distinguishes an invalid origin from an absent one", () => {
  resetPlatformConfig();
  const doc = { getElementById: () => ({ textContent: JSON.stringify({ recordApi: { baseUrl: "http://evil.example" } }) }) };
  const settings = readSettings(doc);
  assert.equal(settings.apiConfigured, false);
  assert.equal(settings.apiRejected, true);
});

test("readSettings normalises a trailing slash and applies defaults", () => {
  resetPlatformConfig();
  const doc = {
    getElementById: () => ({
      textContent: JSON.stringify({ recordApi: { baseUrl: "https://api.richenquest.com/", timeoutMs: "" } }),
    }),
  };
  const settings = readSettings(doc);
  assert.equal(settings.apiBaseUrl, "https://api.richenquest.com");
  assert.equal(settings.timeoutMs, 15_000, "a blank timeout falls back rather than becoming 0");
  assert.equal(settings.warnBeforeExpiryMs, 120_000);
  resetPlatformConfig();
});

/* ══════════════════════════════════════════════════════════════════ api ═══ */

function fakeResponse({ status = 200, body = {}, headers = {} } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k) => headers[k.toLowerCase()] ?? null },
    json: async () => body,
  };
}

function recordingFetch(responder) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return responder(calls.length, url, init);
  };
  return { calls, fetchImpl };
}

test("the client builds the paths the API actually publishes", async () => {
  const { calls, fetchImpl } = recordingFetch(() => fakeResponse({ body: { ok: true } }));
  const api = createRecordApi({ baseUrl: "https://api.test", getToken: () => "rq1.a.b", fetchImpl });

  await api.getRecord("sub_1");
  await api.getTimeline("sub_1");
  await api.getEvent("sub_1", "evt_9");
  await api.verifyRecord("sub_1");
  await api.appendEvent("sub_1", { type: "consent.given", payload: {} });
  await api.exportRecord("sub_1");

  assert.deepEqual(
    calls.map((c) => `${c.init.method} ${new URL(c.url).pathname}`),
    [
      "GET /v1/career-records/sub_1",
      "GET /v1/career-records/sub_1/timeline",
      "GET /v1/career-records/sub_1/events/evt_9",
      "GET /v1/career-records/sub_1/verify",
      "POST /v1/career-records/sub_1/events",
      "POST /v1/career-records/sub_1/export",
    ]
  );
});

test("the timeline as_of parameter is sent only when asked for", async () => {
  const { calls, fetchImpl } = recordingFetch(() => fakeResponse({ body: {} }));
  const api = createRecordApi({ baseUrl: "https://api.test", getToken: () => "t", fetchImpl });

  await api.getTimeline("sub_1");
  assert.equal(new URL(calls[0].url).searchParams.has("as_of"), false);

  await api.getTimeline("sub_1", { asOf: "2026-01-01T00:00:00.000Z" });
  assert.equal(new URL(calls[1].url).searchParams.get("as_of"), "2026-01-01T00:00:00.000Z");
});

test("record ids are encoded, so a crafted id cannot escape the path", async () => {
  const { calls, fetchImpl } = recordingFetch(() => fakeResponse({ body: {} }));
  const api = createRecordApi({ baseUrl: "https://api.test", getToken: () => "t", fetchImpl });

  await api.getRecord("sub_1/../../admin");
  assert.equal(new URL(calls[0].url).pathname, "/v1/career-records/sub_1%2F..%2F..%2Fadmin");
});

test("only headers the API's CORS policy allows are sent", async () => {
  const { calls, fetchImpl } = recordingFetch(() => fakeResponse({ body: {} }));
  const api = createRecordApi({ baseUrl: "https://api.test", getToken: () => "rq1.tok", fetchImpl });

  await api.appendEvent("sub_1", { type: "consent.given", payload: {} });
  const headers = calls[0].init.headers;

  assert.equal(headers.authorization, "Bearer rq1.tok");
  assert.equal(headers["content-type"], "application/json");
  // security.mjs corsHeaders() allows: content-type, authorization, x-correlation-id,
  // x-csrf-token, traceparent. An idempotency-key HEADER would fail preflight —
  // the append endpoint takes idempotency_key in the BODY instead.
  assert.equal(headers["idempotency-key"], undefined);
  for (const name of Object.keys(headers)) {
    assert.ok(
      ["accept", "authorization", "content-type", "x-correlation-id", "traceparent"].includes(name),
      `header "${name}" is not in the API's allowed set`
    );
  }
});

test("cookies are never attached — authentication is the bearer token alone", async () => {
  const { calls, fetchImpl } = recordingFetch(() => fakeResponse({ body: {} }));
  const api = createRecordApi({ baseUrl: "https://api.test", getToken: () => "t", fetchImpl });
  await api.getRecord("sub_1");
  assert.equal(calls[0].init.credentials, "omit");
  assert.equal(calls[0].init.redirect, "error", "a redirect could send the token to another origin");
});

test("an API error is surfaced with its code, and 401 ends the session", async () => {
  let unauthorised = 0;
  const { fetchImpl } = recordingFetch(() =>
    fakeResponse({ status: 401, body: { error: { code: "TOKEN_EXPIRED", message: "token has expired", retryable: false } } })
  );
  const api = createRecordApi({
    baseUrl: "https://api.test",
    getToken: () => "t",
    fetchImpl,
    onUnauthorized: () => { unauthorised += 1; },
  });

  await assert.rejects(() => api.getRecord("sub_1"), (err) => {
    assert.ok(err instanceof ApiError);
    assert.equal(err.code, "TOKEN_EXPIRED");
    assert.equal(err.status, 401);
    return true;
  });
  assert.equal(unauthorised, 1, "the app must be told to re-gate");
});

test("a write is never retried automatically", async () => {
  const { calls, fetchImpl } = recordingFetch(() =>
    fakeResponse({ status: 429, body: { error: { code: "RATE_LIMITED", message: "slow down", retryable: true } }, headers: { "retry-after": "0" } })
  );
  const api = createRecordApi({ baseUrl: "https://api.test", getToken: () => "t", fetchImpl });

  await assert.rejects(() => api.appendEvent("sub_1", { type: "consent.given", payload: {} }));
  assert.equal(calls.length, 1, "retrying a write is how a record gains duplicate entries");
});

test("a rate-limited read retries once, then gives up", async () => {
  const { calls, fetchImpl } = recordingFetch((n) =>
    n === 1
      ? fakeResponse({ status: 429, body: { error: { code: "RATE_LIMITED", message: "", retryable: true } }, headers: { "retry-after": "0" } })
      : fakeResponse({ body: { subject_id: "sub_1" } })
  );
  const api = createRecordApi({ baseUrl: "https://api.test", getToken: () => "t", fetchImpl });

  assert.deepEqual(await api.getRecord("sub_1"), { subject_id: "sub_1" });
  assert.equal(calls.length, 2);
});

test("a dead network and a timeout are reported as different problems", async () => {
  const offline = createRecordApi({
    baseUrl: "https://api.test",
    getToken: () => "t",
    fetchImpl: async () => { throw new TypeError("Failed to fetch"); },
  });
  await assert.rejects(() => offline.getRecord("sub_1"), (err) => err.code === "OFFLINE" && err.retryable);

  const aborted = createRecordApi({
    baseUrl: "https://api.test",
    getToken: () => "t",
    fetchImpl: async () => { const e = new Error("aborted"); e.name = "AbortError"; throw e; },
  });
  await assert.rejects(() => aborted.getRecord("sub_1"), (err) => err.code === "TIMEOUT");
});

test("error wording shown to a student never exposes internals", () => {
  const err = new ApiError("INTERNAL", "pg: relation \"events\" does not exist", { status: 500 });
  assert.equal(err.userMessage, "The record service is having a problem. Nothing was changed.");
  assert.ok(!err.userMessage.includes("pg:"));
});

/* ═══════════════════════════════════════════════════════════════ router ═══ */

test("parseRoute understands sections, ids and query parameters", () => {
  assert.deepEqual(parseRoute("#/timeline"), { name: "timeline", params: {} });
  assert.deepEqual(parseRoute(""), { name: "timeline", params: {} });
  assert.deepEqual(parseRoute("#token=abc"), { name: "timeline", params: {} }, "a credential fragment is not a route");
  assert.deepEqual(parseRoute("#/settings"), { name: "settings", params: {} });
  assert.deepEqual(parseRoute("#/timeline?focus=evt_1"), { name: "timeline", params: { focus: "evt_1" } });
  assert.deepEqual(parseRoute("#/timeline/evt_9"), { name: "timeline", params: { id: "evt_9" } });
});

/* ══════════════════════════════════════════════════════════════ derive ═══ */

test("consent folds forward, and an empty withdrawal withdraws everything", () => {
  const entries = [
    entry({ event_id: "e1", type: "consent.given", recorded: "2026-01-01T00:00:00Z", time: "2026-01-01T00:00:00Z", decision: { purposes: ["advisory", "marketing"] } }),
    entry({ event_id: "e2", type: "consent.withdrawn", recorded: "2026-02-01T00:00:00Z", time: "2026-02-01T00:00:00Z", decision: { purposes: ["marketing"] } }),
  ];
  const state = consentFromTimeline(entries);
  assert.deepEqual(state.granted, ["advisory"]);
  assert.equal(state.purposes.marketing.granted, false);
  assert.equal(state.purposes.marketing.withdrawn_at, "2026-02-01T00:00:00Z");

  const all = consentFromTimeline([
    ...entries,
    entry({ event_id: "e3", type: "consent.withdrawn", recorded: "2026-03-01T00:00:00Z", decision: {} }),
  ]);
  assert.deepEqual(all.granted, [], "an empty purpose list withdraws everything, as the server reads it");
});

test("consent is folded in recorded order, not the order it arrived in the array", () => {
  const state = consentFromTimeline([
    entry({ event_id: "e2", type: "consent.withdrawn", recorded: "2026-02-01T00:00:00Z", decision: { purposes: ["advisory"] } }),
    entry({ event_id: "e1", type: "consent.given", recorded: "2026-01-01T00:00:00Z", decision: { purposes: ["advisory"] } }),
  ]);
  assert.deepEqual(state.granted, [], "the later withdrawal must win");
});

test("consent state is 'unknown' rather than 'nothing granted' when no consent events are visible", () => {
  assert.equal(consentFromTimeline([]).known, false);
});

test("every purpose the API accepts is offered in the UI list", () => {
  // Mirrors identity/consent.mjs PURPOSES; drift here silently hides a right.
  assert.deepEqual(
    CONSENT_PURPOSES.map((p) => p.id).sort(),
    ["advisory", "ai_assistance", "document_handling", "marketing", "partner_sharing"]
  );
});

test("the evidence index groups citations by reference, most-cited first", () => {
  const entries = [
    entry({ event_id: "e1", evidence: [{ ref: "claim:c1", kind: "claim" }, { ref: "doc:d1", kind: "doc" }] }),
    entry({ event_id: "e2", evidence: [{ ref: "claim:c1", kind: "claim" }] }),
  ];
  const index = evidenceIndex(entries);
  assert.equal(index.length, 2);
  assert.equal(index[0].ref, "claim:c1");
  assert.equal(index[0].citations.length, 2);
  assert.deepEqual(index[0].citations.map((c) => c.event_id), ["e1", "e2"]);
});

test("the evidence index invents nothing when there is no evidence", () => {
  assert.deepEqual(evidenceIndex([entry({ evidence: [] })]), []);
  assert.deepEqual(evidenceIndex([]), []);
});

test("a recommendation stops being outstanding once acknowledged, corrected or withdrawn", () => {
  const open = entry({ event_id: "r1", type: "recommendation.issued" });
  assert.equal(pendingAcknowledgements([open]).length, 1);

  assert.equal(
    pendingAcknowledgements([entry({ event_id: "r1", type: "recommendation.issued", acknowledgement: { at: "2026-01-01T00:00:00Z" } })]).length,
    0
  );
  assert.equal(
    pendingAcknowledgements([entry({ event_id: "r1", type: "recommendation.issued", corrected: { by: "r2", at: "2026-01-01T00:00:00Z" } })]).length,
    0
  );
  assert.equal(
    pendingAcknowledgements([open, entry({ event_id: "w1", type: "recommendation.withdrawn", decision: { recommendation_event: "r1" } })]).length,
    0,
    "chasing a response to withdrawn advice would be a bug with real consequences"
  );
});

test("newSince uses recorded_at and returns newest first", () => {
  const entries = [
    entry({ event_id: "old", recorded: "2026-01-01T00:00:00Z" }),
    entry({ event_id: "mid", recorded: "2026-06-01T00:00:00Z" }),
    entry({ event_id: "new", recorded: "2026-07-01T00:00:00Z" }),
  ];
  assert.deepEqual(newSince(entries, "2026-05-01T00:00:00Z").map((e) => e.event_id), ["new", "mid"]);
  assert.deepEqual(newSince(entries, null), [], "with no marker, nothing is 'new'");
  assert.deepEqual(newSince(entries, "not-a-date"), []);
  assert.equal(latestRecordedAt(entries), "2026-07-01T00:00:00Z");
});

test("a failed integrity check outranks everything else in the updates list", () => {
  const items = buildNotifications({
    entries: [entry({ event_id: "r1", type: "recommendation.issued", recorded: "2026-07-01T00:00:00Z" })],
    verification: { verified: false, failures: [{ event_id: "e1", reason: "hash mismatch" }] },
    lastSeen: "2026-01-01T00:00:00Z",
    withheld: 2,
  });
  assert.equal(items[0].kind, "integrity");
  assert.equal(items[0].severity, "alert");
  assert.equal(items[1].kind, "action", "an outstanding recommendation comes next");
  assert.ok(items.some((i) => i.kind === "withheld"), "a partial view is always disclosed");
});

test("a verified record raises no integrity alert", () => {
  const items = buildNotifications({ entries: [], verification: { verified: true, failures: [] } });
  assert.equal(items.filter((i) => i.kind === "integrity").length, 0);
});

test("the nav badge counts things that are new or need an action, not disclosures", () => {
  const items = buildNotifications({
    entries: [entry({ event_id: "n1", recorded: "2026-07-01T00:00:00Z" })],
    lastSeen: "2026-01-01T00:00:00Z",
    withheld: 5,
  });
  assert.equal(unreadCount(items), 1, "the withheld notice is information, not an unread item");
});

/* ══════════════════════════════════════════════════════════════ format ═══ */

test("every event type the API can write has a student-facing label", async () => {
  // Read the server's registry directly so a new type cannot ship unlabelled.
  const { TYPE_CLASSIFICATION } = await import("../functions/record/policy.mjs");
  const unlabelled = Object.keys(TYPE_CLASSIFICATION).filter((type) => eventLabel(type) === type.replace(/[._]/g, " "));
  assert.deepEqual(unlabelled, [], `these event types have no label: ${unlabelled.join(", ")}`);
});

test("an unknown event type degrades to something readable rather than blank", () => {
  assert.equal(eventLabel("something.new"), "something new");
  assert.equal(eventLabel(undefined), "Unknown entry");
});

test("event groups drive the timeline filters, and every filter can match", () => {
  assert.equal(eventGroup("visa.refused"), "visa");
  assert.equal(eventGroup("recommendation.issued"), "guidance");
  assert.equal(eventGroup("ai.suggestion_generated"), "guidance");
  assert.equal(eventGroup("mystery.thing"), "other");
});

test("automated authorship is labelled as such, never as a person", () => {
  assert.equal(actorLabel({ kind: "ai", role: "ai_service" }), "automated assistance");
  assert.equal(actorLabel({ kind: "human", role: "counsellor" }), "your counsellor");
  assert.equal(actorLabel({ kind: "human", role: "subject" }), "you");
});

test("durations and relative times read plainly", () => {
  assert.equal(formatDuration(0), "expired");
  assert.equal(formatDuration(-1), "expired");
  assert.equal(formatDuration(45_000), "45s");
  assert.equal(formatDuration(125_000), "2m 05s");
  const now = Date.parse("2026-07-10T00:00:00Z");
  assert.equal(relativeTime("2026-07-09T00:00:00Z", now), "1 day ago");
  assert.equal(relativeTime("2026-07-03T00:00:00Z", now), "1 week ago");
});

test("evidence kinds state honestly whether this deployment can resolve them", () => {
  assert.equal(evidenceKind("claim:c1").resolvable, true, "claims resolve against the register");
  assert.equal(evidenceKind("doc:d1").resolvable, false, "no document service exists yet");
  assert.equal(evidenceKind("dest:italy").resolvable, false);
  assert.equal(evidenceId("claim:c1@v2"), "c1", "a version suffix is not part of the id");
});

test("payload values render fully rather than being silently dropped", () => {
  assert.equal(formatValue(null), "—");
  assert.equal(formatValue(false), "No");
  assert.equal(formatValue(["a", "b"]), "a, b");
  assert.equal(formatValue({ option: "dest:italy", rank: 1 }), "Option: dest:italy; Rank: 1");
});
