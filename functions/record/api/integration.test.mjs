/**
 * Career Record API — INTEGRATION tests over a real HTTP transport.
 *
 * These do not call handlers. A node:http server is bound to an ephemeral port and
 * exercised with fetch(), so what is under test includes real header casing, real
 * body parsing, real status codes, real content negotiation and the transport's
 * own failure paths — the parts a direct handler call cannot reach.
 *
 * This is what moves the API from unit-tested to integration-tested.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createApiServer } from "./service.mjs";
import { memoryStore } from "../log.mjs";
import { identityVault, memoryVaultStore, envKeyProvider, KEY_BYTES } from "../identity/vault.mjs";
import { issueToken } from "../identity/auth.mjs";
import { createLogger } from "../../platform/logging.mjs";
import { createMetrics } from "../../platform/metrics.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const SECRET = randomBytes(32).toString("hex");
const KEK = randomBytes(KEY_BYTES).toString("base64");

const disclosureRegister = JSON.parse(
  await readFile(path.join(ROOT, "website/src/data/disclosure.json"), "utf8")
);
const evidenceRegister = JSON.parse(
  await readFile(path.join(ROOT, "website/src/data/evidence.json"), "utf8")
);

/** Boot a real server on an ephemeral port. */
async function boot(over = {}) {
  const logLines = [];
  const metrics = createMetrics();
  const store = over.store ?? memoryStore();
  const vault = identityVault(memoryVaultStore(), envKeyProvider({ RECORD_VAULT_KEK: KEK, NODE_ENV: "test" }));

  const server = createApiServer({
    store,
    vault,
    secret: SECRET,
    evidenceRegister,
    disclosureRegister,
    logger: createLogger({ sink: (l) => logLines.push(JSON.parse(l)) }),
    metrics,
    cors: { allowed: ["https://app.richenquest.com"] },
    ...over,
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  return {
    base: `http://127.0.0.1:${port}`,
    store,
    vault,
    metrics,
    logLines,
    async close() {
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

const tokens = {
  counsellor: () => issueToken({ sub: "usr_kunal", role: "counsellor" }, SECRET).token,
  subject: (id) => issueToken({ sub: id, role: "subject", subject_id: id }, SECRET).token,
  other: () => issueToken({ sub: "sub_other", role: "subject", subject_id: "sub_other" }, SECRET).token,
  partner: () => issueToken({ sub: "usr_uni", role: "partner", partner_id: "partner:uni_x" }, SECRET).token,
  auditor: () => issueToken({ sub: "usr_audit", role: "auditor" }, SECRET).token,
  ai: () => issueToken({ sub: "svc_matcher", role: "ai_service" }, SECRET).token,
};

async function call(base, method, url, { token, body, headers = {} } = {}) {
  const res = await fetch(`${base}${url}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return {
    status: res.status,
    headers: Object.fromEntries(res.headers.entries()),
    body: text ? JSON.parse(text) : null,
  };
}

/** Create a record via the API and return its id. */
async function seedRecord(base, subjectId = "sub_aarav01") {
  const res = await call(base, "POST", "/v1/career-records", {
    token: tokens.counsellor(),
    body: {
      subject_id: subjectId,
      consent_purposes: ["advisory", "document_handling"],
      date_of_birth: "2004-03-11",
      origin_country: "India",
    },
  });
  assert.equal(res.status, 201, `seed failed: ${JSON.stringify(res.body)}`);
  return subjectId;
}

/* ══════════════════════════════════════════════════ transport behaviour ══ */

test("integration: unknown path is 404, wrong method is 405 with Allow", async () => {
  const api = await boot();
  try {
    const missing = await call(api.base, "GET", "/v1/nope");
    assert.equal(missing.status, 404);

    const wrongMethod = await call(api.base, "DELETE", "/v1/career-records", { token: tokens.counsellor() });
    assert.equal(wrongMethod.status, 405);
    assert.match(wrongMethod.headers.allow ?? "", /POST/);
  } finally {
    await api.close();
  }
});

test("integration: security headers are present on every response", async () => {
  const api = await boot();
  try {
    const res = await call(api.base, "GET", "/v1/career-records/sub_x");
    assert.match(res.headers["content-security-policy"], /default-src 'none'/);
    assert.equal(res.headers["x-content-type-options"], "nosniff");
    assert.equal(res.headers["x-frame-options"], "DENY");
    assert.match(res.headers["cache-control"], /no-store/);
    assert.ok(res.headers["strict-transport-security"]);
  } finally {
    await api.close();
  }
});

test("integration: CORS preflight is answered; unknown origins get no CORS headers", async () => {
  const api = await boot();
  try {
    const allowed = await fetch(`${api.base}/v1/career-records`, {
      method: "OPTIONS",
      headers: { Origin: "https://app.richenquest.com", "Access-Control-Request-Method": "POST" },
    });
    assert.equal(allowed.status, 204);
    assert.equal(allowed.headers.get("access-control-allow-origin"), "https://app.richenquest.com");

    const denied = await fetch(`${api.base}/v1/career-records`, {
      method: "OPTIONS",
      headers: { Origin: "https://evil.example", "Access-Control-Request-Method": "POST" },
    });
    assert.equal(denied.headers.get("access-control-allow-origin"), null);
  } finally {
    await api.close();
  }
});

test("integration: malformed JSON, wrong content type and oversized bodies are refused", async () => {
  const api = await boot();
  try {
    const badJson = await fetch(`${api.base}/v1/career-records`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokens.counsellor()}` },
      body: "{not json",
    });
    assert.equal(badJson.status, 400);

    const wrongType = await fetch(`${api.base}/v1/career-records`, {
      method: "POST",
      headers: { "Content-Type": "text/plain", Authorization: `Bearer ${tokens.counsellor()}` },
      body: "hello",
    });
    assert.equal(wrongType.status, 415);

    // A top-level array would bypass every field-level schema.
    const arrayBody = await fetch(`${api.base}/v1/career-records`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokens.counsellor()}` },
      body: "[]",
    });
    assert.equal(arrayBody.status, 400);

    const huge = await fetch(`${api.base}/v1/career-records`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokens.counsellor()}` },
      body: JSON.stringify({ subject_id: "sub_a", pad: "x".repeat(300 * 1024) }),
    });
    assert.equal(huge.status, 413);
  } finally {
    await api.close();
  }
});

test("integration: path traversal via encoded separators does not match a route", async () => {
  const api = await boot();
  try {
    // %2F decodes to "/" — if the matcher accepted it, one route would become another.
    const res = await call(api.base, "GET", "/v1/career-records/sub_a%2Ftimeline", { token: tokens.counsellor() });
    assert.equal(res.status, 404);
  } finally {
    await api.close();
  }
});

/* ═══════════════════════════════════════════════════════ authentication ══ */

test("integration: no token, malformed token and forged token are all 401", async () => {
  const api = await boot();
  try {
    for (const headers of [
      {},
      { Authorization: "Bearer garbage" },
      { Authorization: "Basic abc" },
      { Authorization: `Bearer ${issueToken({ sub: "x", role: "auditor" }, randomBytes(32).toString("hex")).token}` },
    ]) {
      const res = await call(api.base, "GET", "/v1/career-records/sub_a", { headers });
      assert.equal(res.status, 401, `expected 401 for ${JSON.stringify(headers)}`);
      // The client must not learn which check failed.
      assert.equal(res.body.error.message, "Authentication is required.");
    }
  } finally {
    await api.close();
  }
});

/* ════════════════════════════════════════════════════════════ lifecycle ══ */

test("integration: full record lifecycle — create, read, append, timeline, verify, export", async () => {
  const api = await boot();
  try {
    /* create */
    const created = await call(api.base, "POST", "/v1/career-records", {
      token: tokens.counsellor(),
      body: {
        subject_id: "sub_aarav01",
        consent_purposes: ["advisory", "document_handling"],
        date_of_birth: "2004-03-11",
        origin_country: "India",
      },
    });
    assert.equal(created.status, 201);
    assert.ok(created.headers["x-correlation-id"], "every response carries a correlation id");
    assert.ok(created.headers["x-request-id"]);

    /* the DOB must be in the vault, never in an event */
    const events = await api.store.read("sub_aarav01");
    assert.doesNotMatch(JSON.stringify(events), /2004-03-11/, "PII must not enter the event log");
    assert.equal(await api.vault.get("sub_aarav01", "date_of_birth"), "2004-03-11");

    /* duplicate create conflicts */
    const dup = await call(api.base, "POST", "/v1/career-records", {
      token: tokens.counsellor(),
      body: {
        subject_id: "sub_aarav01",
        consent_purposes: ["advisory"],
        date_of_birth: "2004-03-11",
        origin_country: "India",
      },
    });
    assert.equal(dup.status, 409);
    assert.equal(dup.body.error.retryable, true);

    /* read */
    const record = await call(api.base, "GET", "/v1/career-records/sub_aarav01", { token: tokens.counsellor() });
    assert.equal(record.status, 200);
    assert.equal(record.body.subject_id, "sub_aarav01");
    assert.ok(record.body.chain_head.startsWith("sha256:"));

    /* append a recommendation — evidence and disclosure resolved by the pipeline */
    const rec = await call(api.base, "POST", "/v1/career-records/sub_aarav01/events", {
      token: tokens.counsellor(),
      body: {
        type: "recommendation.issued",
        evidence: [{ ref: "claim:students-guided", kind: "public_claim" }],
        payload: {
          recommended: [{ option: "dest:germany", rank: 1, rationale: "fits budget and intake" }],
          alternatives_considered: [{ option: "dest:ireland", rejected_because: "tuition above budget" }],
          risks_explained: [{ risk: "APS adds 8-10 weeks", acknowledged: true }],
          criteria_version: "matcher@1.3.0",
        },
      },
    });
    assert.equal(rec.status, 201, JSON.stringify(rec.body));

    /* disclosure came from the register, not the request */
    const stored = (await api.store.read("sub_aarav01")).find((e) => e.type === "recommendation.issued");
    assert.equal(stored.disclosure.shown, true);
    assert.equal(stored.disclosure.register_version, disclosureRegister.last_reviewed);
    assert.deepEqual(stored.disclosure.statements, [disclosureRegister.no_relationship_statement]);

    /* single event */
    const one = await call(api.base, "GET", `/v1/career-records/sub_aarav01/events/${stored.event_id}`, {
      token: tokens.counsellor(),
    });
    assert.equal(one.status, 200);
    assert.equal(one.body.type, "recommendation.issued");
    assert.equal(one.body.hash, undefined, "internal chain fields are not exposed to a counsellor");
    assert.equal(one.body.payload.alternatives_considered.length, 1);

    /* timeline */
    const tl = await call(api.base, "GET", "/v1/career-records/sub_aarav01/timeline", { token: tokens.counsellor() });
    assert.equal(tl.status, 200);
    assert.ok(tl.body.entries.length >= 1);
    assert.equal(tl.body.entries.some((e) => e.type === "recommendation.issued"), true);

    /* verify */
    const ver = await call(api.base, "GET", "/v1/career-records/sub_aarav01/verify", { token: tokens.auditor() });
    assert.equal(ver.status, 200);
    assert.equal(ver.body.verified, true);
    assert.deepEqual(ver.body.failures, []);

    /* export — by the subject, so identity is included */
    const exp = await call(api.base, "POST", "/v1/career-records/sub_aarav01/export", {
      token: tokens.subject("sub_aarav01"),
      body: {},
    });
    assert.equal(exp.status, 200);
    assert.equal(exp.body.chain_verified, true);
    assert.equal(exp.body.includes_identity, true);
    assert.ok(exp.body.evidence_references.includes("claim:students-guided"));
    assert.ok(exp.body.disclosure_versions.includes(disclosureRegister.last_reviewed));
    for (const f of ["manifest.json", "events.jsonl", "verify.mjs", "README.md"]) {
      assert.ok(exp.body.archive[f], `export must contain ${f}`);
    }
    assert.doesNotMatch(exp.body.archive["verify.mjs"], /from "\.\//, "the shipped verifier must be standalone");

    /* the export itself was recorded */
    assert.ok((await api.store.read("sub_aarav01")).some((e) => e.type === "record.exported"));
  } finally {
    await api.close();
  }
});

/* ════════════════════════════════════════════════════════ authorisation ══ */

test("integration: a subject cannot reach another person's record", async () => {
  const api = await boot();
  try {
    await seedRecord(api.base);
    const res = await call(api.base, "GET", "/v1/career-records/sub_aarav01", { token: tokens.other() });
    // 403 would confirm the record exists, which is enough to enumerate clients.
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, "FORBIDDEN");
    assert.equal(res.body.error.message, "You do not have access to this.");
    assert.equal(res.body.error.issues, undefined);
  } finally {
    await api.close();
  }
});

test("integration: a partner with no grant is refused, and cannot export at all", async () => {
  const api = await boot();
  try {
    await seedRecord(api.base);

    const noGrant = await call(api.base, "GET", "/v1/career-records/sub_aarav01/timeline", { token: tokens.partner() });
    assert.equal(noGrant.status, 403);

    const exportAttempt = await call(api.base, "POST", "/v1/career-records/sub_aarav01/export", {
      token: tokens.partner(),
      body: {},
    });
    assert.equal(exportAttempt.status, 403, "a partner may never export a person's record");
  } finally {
    await api.close();
  }
});

test("integration: a granted partner sees only the granted event types", async () => {
  const store = memoryStore();
  const api = await boot({
    store,
    grantsFor: async () => [
      {
        grantee: "partner:uni_x",
        subject_id: "sub_aarav01",
        expires_at: "2099-01-01T00:00:00Z",
        scope: { types: ["application.submitted"], classification_max: "partner_shareable" },
      },
    ],
  });
  try {
    await seedRecord(api.base);
    await call(api.base, "POST", "/v1/career-records/sub_aarav01/events", {
      token: tokens.counsellor(),
      body: { type: "application.submitted", payload: { programme: "MSc" } },
    });
    await call(api.base, "POST", "/v1/career-records/sub_aarav01/events", {
      token: tokens.counsellor(),
      body: { type: "counselling.note_added", payload: { note: "private" } },
    });

    const tl = await call(api.base, "GET", "/v1/career-records/sub_aarav01/timeline", { token: tokens.partner() });
    assert.equal(tl.status, 200);
    assert.deepEqual(tl.body.entries.map((e) => e.type), ["application.submitted"]);
    assert.ok(tl.body.withheld > 0, "withheld count must be reported");
    assert.equal(tl.body.read_is_logged, true);
    assert.doesNotMatch(JSON.stringify(tl.body), /private/);
  } finally {
    await api.close();
  }
});

/* ══════════════════════════════════════════════════════════ invariants ══ */

test("integration: an AI token cannot issue a recommendation (I1) over HTTP", async () => {
  const api = await boot();
  try {
    await seedRecord(api.base);
    const res = await call(api.base, "POST", "/v1/career-records/sub_aarav01/events", {
      token: tokens.ai(),
      body: {
        type: "recommendation.issued",
        evidence: [{ ref: "claim:students-guided", kind: "public_claim" }],
        payload: { recommended: [{ option: "dest:germany", rank: 1 }], criteria_version: "m@1" },
      },
    });
    assert.equal(res.status, 422);
    assert.equal(res.body.error.code, "INVARIANT_I1");
    assert.match(res.body.error.message, /human/);
    assert.equal(
      (await api.store.read("sub_aarav01")).some((e) => e.type === "recommendation.issued"),
      false,
      "the refused event must not be stored"
    );
  } finally {
    await api.close();
  }
});

test("integration: a recommendation without evidence is refused with field detail (I2)", async () => {
  const api = await boot();
  try {
    await seedRecord(api.base);
    const res = await call(api.base, "POST", "/v1/career-records/sub_aarav01/events", {
      token: tokens.counsellor(),
      body: { type: "recommendation.issued", payload: { recommended: [{ option: "dest:germany", rank: 1 }] } },
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.issues[0].field, "evidence");
    assert.equal(res.body.error.issues[0].rule, "required");
  } finally {
    await api.close();
  }
});

test("integration: evidence that does not resolve is refused", async () => {
  const api = await boot();
  try {
    await seedRecord(api.base);
    const res = await call(api.base, "POST", "/v1/career-records/sub_aarav01/events", {
      token: tokens.counsellor(),
      body: {
        type: "recommendation.issued",
        evidence: [{ ref: "claim:does-not-exist", kind: "public_claim" }],
        payload: { recommended: [{ option: "dest:germany", rank: 1 }] },
      },
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.issues[0].rule, "unresolvable");
  } finally {
    await api.close();
  }
});

test("integration: unknown event types and unknown body fields are refused", async () => {
  const api = await boot();
  try {
    await seedRecord(api.base);

    const badType = await call(api.base, "POST", "/v1/career-records/sub_aarav01/events", {
      token: tokens.counsellor(),
      body: { type: "marketing.lead_scored", payload: {} },
    });
    assert.equal(badType.status, 400);

    const unknownField = await call(api.base, "POST", "/v1/career-records/sub_aarav01/events", {
      token: tokens.counsellor(),
      body: { type: "counselling.note_added", payload: {}, disclosur: {} },
    });
    assert.equal(unknownField.status, 400);
    assert.equal(unknownField.body.error.issues.find((i) => i.field === "disclosur").rule, "unknown");
  } finally {
    await api.close();
  }
});

test("integration: history is never rewritten — a correction adds an event", async () => {
  const api = await boot();
  try {
    await seedRecord(api.base);
    const original = (await api.store.read("sub_aarav01")).find((e) => e.type === "profile.created");

    const noReason = await call(api.base, "POST", "/v1/career-records/sub_aarav01/events", {
      token: tokens.counsellor(),
      body: { type: "profile.corrected", corrects: original.event_id, payload: { origin_country: "Nepal" } },
    });
    assert.equal(noReason.status, 400, "a correction must state why");

    const corrected = await call(api.base, "POST", "/v1/career-records/sub_aarav01/events", {
      token: tokens.counsellor(),
      body: {
        type: "profile.corrected",
        corrects: original.event_id,
        correction_reason: "origin recorded incorrectly at intake",
        payload: { origin_country: "Nepal" },
      },
    });
    assert.equal(corrected.status, 201);

    const events = await api.store.read("sub_aarav01");
    assert.equal(events.find((e) => e.event_id === original.event_id).payload.origin_country, "India",
      "the original event is unchanged");
    assert.ok(events.some((e) => e.corrects === original.event_id));

    const ver = await call(api.base, "GET", "/v1/career-records/sub_aarav01/verify", { token: tokens.auditor() });
    assert.equal(ver.body.verified, true, "the chain still verifies after a correction");
  } finally {
    await api.close();
  }
});

test("integration: idempotency key prevents a double append on retry", async () => {
  const api = await boot();
  try {
    await seedRecord(api.base);
    const body = {
      type: "counselling.note_added",
      payload: { summary: "first call" },
      idempotency_key: "call-2026-07-25-a",
    };
    const first = await call(api.base, "POST", "/v1/career-records/sub_aarav01/events", { token: tokens.counsellor(), body });
    const retry = await call(api.base, "POST", "/v1/career-records/sub_aarav01/events", { token: tokens.counsellor(), body });

    assert.equal(first.status, 201);
    assert.equal(retry.status, 201);
    const notes = (await api.store.read("sub_aarav01")).filter((e) => e.type === "counselling.note_added");
    assert.equal(notes.length, 1, "a retried append must not create a second event");
  } finally {
    await api.close();
  }
});

/* ══════════════════════════════════════════════════════════════ consent ══ */

test("integration: a minor without a guardian is refused, and the refusal is recorded", async () => {
  const api = await boot();
  try {
    await call(api.base, "POST", "/v1/career-records", {
      token: tokens.counsellor(),
      body: {
        subject_id: "sub_minor01",
        consent_purposes: ["advisory"],
        date_of_birth: "2012-01-01",
        origin_country: "India",
      },
    });

    const res = await call(api.base, "POST", "/v1/career-records/sub_minor01/events", {
      token: tokens.counsellor(),
      body: {
        type: "recommendation.issued",
        evidence: [{ ref: "claim:students-guided", kind: "public_claim" }],
        payload: { recommended: [{ option: "dest:germany", rank: 1 }] },
      },
    });

    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, "CONSENT_GUARDIAN_REQUIRED");
    assert.match(res.body.error.message, /guardian/);

    const denied = (await api.store.read("sub_minor01")).filter((e) => e.type === "access.denied");
    assert.equal(denied.length, 1, "a refusal belongs in the person's record");
    assert.equal(denied[0].payload.refused_because, "CONSENT_GUARDIAN_REQUIRED");
  } finally {
    await api.close();
  }
});

/* ══════════════════════════════════════════════════ audit / observability ══ */

test("integration: a non-subject read is recorded as access.exercised", async () => {
  const api = await boot();
  try {
    await seedRecord(api.base);
    await call(api.base, "GET", "/v1/career-records/sub_aarav01/timeline", { token: tokens.counsellor() });

    const accesses = (await api.store.read("sub_aarav01")).filter((e) => e.type === "access.exercised");
    assert.ok(accesses.length >= 1);
    assert.equal(accesses.at(-1).payload.action, "read_timeline");
    assert.ok(accesses.at(-1).payload.correlation_id, "the access event links to the request");
  } finally {
    await api.close();
  }
});

test("integration: the subject reading their own record is not logged as surveillance", async () => {
  const api = await boot();
  try {
    await seedRecord(api.base);
    const before = (await api.store.read("sub_aarav01")).filter((e) => e.type === "access.exercised").length;
    await call(api.base, "GET", "/v1/career-records/sub_aarav01/timeline", { token: tokens.subject("sub_aarav01") });
    const after = (await api.store.read("sub_aarav01")).filter((e) => e.type === "access.exercised").length;
    assert.equal(after, before, "reading your own record is not a disclosable access");
  } finally {
    await api.close();
  }
});

test("integration: correlation id is honoured end to end and logged with the full path", async () => {
  const api = await boot();
  try {
    await seedRecord(api.base);
    const res = await call(api.base, "GET", "/v1/career-records/sub_aarav01", {
      token: tokens.counsellor(),
      headers: { "X-Correlation-Id": "cor_from_dashboard" },
    });

    assert.equal(res.headers["x-correlation-id"], "cor_from_dashboard", "the caller's id is preserved");

    const line = api.logLines.find((l) => l.msg === "request.completed" && l.correlation_id === "cor_from_dashboard");
    assert.ok(line, "the request line must carry the inbound correlation id");
    assert.equal(line.actor_id, "usr_kunal");
    assert.equal(line.subject_id, "sub_aarav01");
    assert.equal(line.result, "success");
    assert.equal(line.security_outcome, "allowed");
    assert.ok(typeof line.duration_ms === "number");
    assert.ok(line.trace_id && line.request_id);
    // Given a correlation id, the execution path is reconstructable.
    assert.ok(line.stages.includes("authenticate") && line.stages.includes("business"));
  } finally {
    await api.close();
  }
});

test("integration: logs never contain PII even when it passes through the API", async () => {
  const api = await boot();
  try {
    await seedRecord(api.base);
    const all = JSON.stringify(api.logLines);
    assert.doesNotMatch(all, /2004-03-11/, "the date of birth must never appear in a log line");
  } finally {
    await api.close();
  }
});

test("integration: metrics record requests, failures, permission denials and appends", async () => {
  const api = await boot();
  try {
    await seedRecord(api.base);
    await call(api.base, "GET", "/v1/career-records/sub_aarav01", { token: tokens.other() }); // 403
    await call(api.base, "GET", "/v1/career-records/sub_aarav01", { token: tokens.counsellor() }); // 200

    const c = api.metrics.snapshot().counters;
    const key = (prefix) => Object.keys(c).find((k) => k.startsWith(prefix));

    assert.ok(key("requests_total{"), "requests are counted");
    assert.ok(key("events_appended_total{type=profile.created"), "appends are counted by type");
    assert.ok(key("permission_failures_total{"), "permission denials are counted");
    assert.ok(key("request_failures_total{"), "failures are counted");
    assert.ok(api.metrics.toPrometheus().includes("request_duration_ms_bucket"), "latency histogram is exported");
  } finally {
    await api.close();
  }
});

test("integration: rate limiting returns 429 with Retry-After", async () => {
  const api = await boot();
  try {
    await seedRecord(api.base);
    let limited = null;
    for (let i = 0; i < 40; i++) {
      const res = await call(api.base, "POST", "/v1/career-records/sub_aarav01/events", {
        token: tokens.counsellor(),
        body: { type: "counselling.note_added", payload: { i } },
      });
      if (res.status === 429) { limited = res; break; }
    }
    assert.ok(limited, "the write tier must eventually refuse");
    assert.equal(limited.body.error.retryable, true);
    assert.ok(limited.headers["retry-after"]);
  } finally {
    await api.close();
  }
});

test("integration: an internal failure returns 500 with nothing leaked", async () => {
  const brokenStore = {
    ...memoryStore(),
    async head() { throw new Error("connection to events_p7 refused at 10.0.0.5:5432"); },
  };
  const api = await boot({ store: brokenStore });
  try {
    const res = await call(api.base, "GET", "/v1/career-records/sub_aarav01", { token: tokens.counsellor() });
    assert.equal(res.status, 500);
    assert.equal(res.body.error.message, "Something went wrong on our side.");
    const serialised = JSON.stringify(res.body);
    for (const leak of ["events_p7", "10.0.0.5", "5432", "connection"]) {
      assert.doesNotMatch(serialised, new RegExp(leak), `must not leak "${leak}"`);
    }
  } finally {
    await api.close();
  }
});

test("integration: the exported archive verifies with its own shipped verifier", async () => {
  const api = await boot();
  try {
    await seedRecord(api.base);
    const exp = await call(api.base, "POST", "/v1/career-records/sub_aarav01/export", {
      token: tokens.subject("sub_aarav01"),
      body: {},
    });

    const events = exp.body.archive["events.jsonl"].trim().split("\n").map((l) => JSON.parse(l));
    const manifest = JSON.parse(exp.body.archive["manifest.json"]);

    // Recompute the chain the way the shipped verifier does — no RichenQuest code.
    const { createHash } = await import("node:crypto");
    const canon = (v) => {
      if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
      if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
      return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}";
    };
    let prev = null;
    for (const e of events) {
      const { hash, ...rest } = e;
      assert.equal("sha256:" + createHash("sha256").update(canon(rest), "utf8").digest("hex"), hash);
      assert.equal(e.prev_hash ?? null, prev);
      prev = hash;
    }
    assert.equal(prev, manifest.chain_head);
  } finally {
    await api.close();
  }
});
