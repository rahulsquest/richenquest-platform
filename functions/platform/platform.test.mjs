/**
 * Platform foundation tests.
 *
 * The properties under test are the ones that make the foundation mandatory
 * rather than advisory: the pipeline cannot be reordered or skipped, errors cannot
 * leak internals to a client, logs cannot leak PII, and metric labels cannot be
 * unbounded.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

import {
  PlatformError, ValidationError, AuthenticationError, AuthorisationError,
  NotFoundError, ConsentDenied, ConflictError, InvariantError, RateLimitError,
  InternalError, toPlatformError, SECURITY, AUDIT,
} from "./errors.mjs";
import {
  createContext, withContext, currentContext, enrichContext, span, timeSpan,
  contextFields, executionPath, parseTraceparent, toTraceparent, outboundHeaders,
} from "./context.mjs";
import { createLogger, redact } from "./logging.mjs";
import { t, validateInput, validateEvidence, validateDisclosure, validateRules, rule } from "./validate.mjs";
import { createMetrics, sanitiseLabel } from "./metrics.mjs";
import {
  securityHeaders, corsHeaders, issueCsrfToken, verifyCsrf, sessionCookie, csrfCookie,
  parseCookies, bearerToken, createRateLimiter, memoryCounterStore, ipKey, RATE_TIERS,
} from "./security.mjs";
import { defineEndpoint, STAGES, assertEndpointComplete } from "./pipeline.mjs";
import { issueToken, verifyToken } from "../record/identity/auth.mjs";

const SECRET = randomBytes(32).toString("hex");
const sink = () => { const lines = []; return { lines, write: (l) => lines.push(JSON.parse(l)) }; };

/* ═══════════════════════════════════════════════════════════ ERRORS ═════ */

test("errors: client responses never contain internal detail", () => {
  const err = new InternalError("Postgres: relation \"events\" does not exist at /db/pg.mjs:42");
  const body = err.toResponse();

  assert.equal(body.error.code, "INTERNAL");
  assert.equal(body.error.message, "Something went wrong on our side.");
  const serialised = JSON.stringify(body);
  for (const leak of ["Postgres", "relation", "pg.mjs", "42"]) {
    assert.doesNotMatch(serialised, new RegExp(leak), `client response must not leak "${leak}"`);
  }
  // The detail is still available internally.
  assert.match(err.toLog().message, /Postgres/);
  assert.ok(err.toLog().stack);
});

test("errors: authentication failures do not reveal which check failed", () => {
  for (const code of ["BAD_SIGNATURE", "TOKEN_EXPIRED", "TOKEN_REVOKED"]) {
    const err = new AuthenticationError(`internal: ${code}`, code);
    assert.equal(err.toResponse().error.message, "Authentication is required.",
      "the client must not learn whether they hold a real token");
    assert.equal(err.security, SECURITY.SECURITY_EVENT);
  }
});

test("errors: a concealing 404 is used instead of 403 to prevent enumeration", () => {
  const err = new NotFoundError("record", { concealing: "cross-subject access attempt" });
  assert.equal(err.status, 404, "confirming existence would let an attacker enumerate clients");
  assert.equal(err.toResponse().error.message, "Not found.");
  assert.equal(err.security, SECURITY.SECURITY_EVENT);
  assert.equal(err.audit, AUDIT.AUDIT_EVENT);
  assert.match(err.toLog().message, /concealing/);
});

test("errors: validation issues reach the client, consent reasons are explained", () => {
  const v = new ValidationError([{ field: "evidence", rule: "required", message: "at least one reference is required" }]);
  assert.equal(v.status, 400);
  assert.equal(v.toResponse().error.issues.length, 1, "field feedback is the value of a 400");

  const c = new ConsentDenied({ code: "GUARDIAN_REQUIRED", purpose: "advisory", reason: "subject is a minor and no verified guardian is linked" });
  assert.equal(c.status, 403);
  assert.match(c.toResponse().error.message, /guardian/, "a person must be able to fix their own consent");
});

test("errors: retryable flags match reality", () => {
  assert.equal(new ConflictError("seq clash").retryable, true);
  assert.equal(new RateLimitError({ retryAfterMs: 500 }).retryable, true);
  assert.equal(new InternalError("boom").retryable, true);
  assert.equal(new ValidationError([{ field: "x", rule: "y", message: "z" }]).retryable, false);
  assert.equal(new AuthorisationError("nope").retryable, false);
});

test("errors: domain errors from other modules are mapped, never leaked raw", () => {
  const mapped = [
    [{ code: "SEQ_CONFLICT", message: "clash", currentSeq: 4 }, 409, "CONFLICT"],
    [{ name: "InvariantViolation", code: "I3", message: "disclosure required" }, 422, "INVARIANT_I3"],
    [{ name: "AuthError", code: "TOKEN_EXPIRED", message: "expired", status: 401 }, 401, "TOKEN_EXPIRED"],
    [{ name: "AuthError", code: "WRONG_RECORD", message: "nope", status: 403 }, 403, "FORBIDDEN"],
    [{ name: "SubjectErased", message: "erased" }, 404, "NOT_FOUND"],
    [{ name: "VaultError", code: "DECRYPT_FAILED", message: "bad tag" }, 500, "INTERNAL"],
  ];
  for (const [raw, status, code] of mapped) {
    const err = toPlatformError(raw);
    assert.ok(err instanceof PlatformError, `${code} must map to a PlatformError`);
    assert.equal(err.status, status);
    assert.equal(err.code, code);
  }
  // Anything unrecognised becomes a 500 with no detail exposed.
  const unknown = toPlatformError(new Error("some library exploded with /etc/passwd"));
  assert.equal(unknown.status, 500);
  assert.doesNotMatch(JSON.stringify(unknown.toResponse()), /passwd/);
});

/* ══════════════════════════════════════════════════════════ CONTEXT ═════ */

test("context: available anywhere in the async subtree without being threaded", async () => {
  const ctx = createContext({ route: "/v1/test", method: "GET" });
  await withContext(ctx, async () => {
    const deep = async () => {
      await new Promise((r) => setTimeout(r, 1));
      return currentContext();
    };
    const seen = await deep();
    assert.equal(seen.correlation_id, ctx.correlation_id, "context survives awaits and nested calls");
  });
  assert.equal(currentContext(), null, "context does not leak outside the request");
});

test("context: correlation id is inherited, request id never is", () => {
  const ctx = createContext({ headers: { "x-correlation-id": "cor_upstream" }, route: "/x" });
  assert.equal(ctx.correlation_id, "cor_upstream");
  assert.match(ctx.request_id, /^req_/);
  assert.notEqual(ctx.request_id, "cor_upstream");
});

test("context: traceparent is parsed, propagated, and malformed values are ignored", () => {
  const parsed = parseTraceparent("00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01");
  assert.equal(parsed.traceId, "4bf92f3577b34da6a3ce929d0e0e4736");
  assert.equal(parsed.parentSpanId, "00f067aa0ba902b7");

  for (const bad of ["garbage", "", null, `00-${"0".repeat(32)}-00f067aa0ba902b7-01`]) {
    assert.equal(parseTraceparent(bad), null, "a broken upstream header must not fail the request");
  }

  const ctx = createContext({ headers: { traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01" } });
  assert.equal(ctx.trace_id, "4bf92f3577b34da6a3ce929d0e0e4736", "we join the caller's trace");
  assert.match(toTraceparent(ctx), /^00-4bf92f3577b34da6a3ce929d0e0e4736-[0-9a-f]{16}-01$/);
});

test("context: enrichment is immutable and observable", async () => {
  await withContext(createContext({ route: "/x" }), async () => {
    const before = currentContext();
    enrichContext({ actor_id: "usr_k", actor_role: "counsellor", subject_id: "sub_a" });
    const after = currentContext();

    assert.equal(before.actor_id, null, "the original context object is not mutated");
    assert.equal(after.actor_id, "usr_k");
    assert.equal(contextFields().subject_id, "sub_a");
    assert.throws(() => { after.actor_id = "someone_else"; }, TypeError, "context must be frozen");
  });
});

test("context: execution path reconstructs the full journey and names the failure", async () => {
  await withContext(createContext({ route: "/v1/records/:id/events", method: "POST" }), async () => {
    await timeSpan("authenticate", async () => "ok");
    await timeSpan("authorise", async () => "ok");
    await assert.rejects(() =>
      timeSpan("consent", async () => { const e = new Error("denied"); e.code = "GUARDIAN_REQUIRED"; throw e; })
    );

    const path = executionPath();
    assert.deepEqual(path.stages.map((s) => s.name), ["authenticate", "authorise", "consent"]);
    assert.equal(path.failed_at, "consent", "given a correlation id we can say exactly where it stopped");
    assert.equal(path.stages.at(-1).error, "GUARDIAN_REQUIRED");
    assert.ok(path.total_ms >= 0);
  });
});

test("context: outbound headers let a downstream service join the trace", async () => {
  await withContext(createContext({ route: "/x" }), async () => {
    const h = outboundHeaders();
    assert.equal(h["x-correlation-id"], currentContext().correlation_id);
    assert.match(h.traceparent, /^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
  });
});

/* ══════════════════════════════════════════════════════════ LOGGING ═════ */

test("logging: PII is redacted by key at any depth", () => {
  const out = redact({
    legal_name: "Aarav Kumar",
    nested: { passport: "X1234567", deeper: { email: "a@b.com", ok: "keep" } },
    envelope: "{...}",
    safe_field: "visible",
  });
  assert.equal(out.legal_name, "[redacted]");
  assert.equal(out.nested.passport, "[redacted]");
  assert.equal(out.nested.deeper.email, "[redacted]");
  assert.equal(out.envelope, "[redacted]");
  assert.equal(out.safe_field, "visible", "non-sensitive fields must remain debuggable");
});

test("logging: PII is redacted by value shape even under an innocent key", () => {
  const out = redact({
    note: "ignored by key anyway",
    message: "contact aarav@example.com or +91 9876543210 with token rq1.abc.def",
  });
  assert.doesNotMatch(out.message, /aarav@example\.com/);
  assert.doesNotMatch(out.message, /9876543210/);
  assert.doesNotMatch(out.message, /rq1\.abc\.def/);
  assert.match(out.message, /\[redacted:email\]/);
});

test("logging: every line is JSON and carries context identifiers", async () => {
  const s = sink();
  const logger = createLogger({ sink: s.write });
  await withContext(createContext({ route: "/v1/records/:id", method: "GET" }), async () => {
    enrichContext({ actor_id: "usr_k", actor_role: "counsellor", subject_id: "sub_a" });
    logger.info("something.happened", { count: 3 });
  });

  const [line] = s.lines;
  assert.equal(line.msg, "something.happened");
  assert.equal(line.actor_id, "usr_k");
  assert.equal(line.subject_id, "sub_a");
  assert.equal(line.route, "/v1/records/:id");
  assert.ok(line.correlation_id && line.request_id && line.trace_id);
  assert.ok(line.ts && line.level === "info");
});

test("logging: the request line records duration, result and security outcome", async () => {
  const s = sink();
  const logger = createLogger({ sink: s.write });
  await withContext(createContext({ route: "/v1/x", method: "POST" }), async () => {
    await timeSpan("authenticate", async () => "ok");
    logger.request({ status: 201, eventId: "01EVENT", securityOutcome: "allowed" });
  });
  const [line] = s.lines;
  assert.equal(line.status, 201);
  assert.equal(line.result, "success");
  assert.equal(line.security_outcome, "allowed");
  assert.equal(line.event_id, "01EVENT");
  assert.deepEqual(line.stages, ["authenticate"]);
  assert.ok(typeof line.duration_ms === "number");
});

test("logging: below-threshold levels are dropped", () => {
  const s = sink();
  const logger = createLogger({ sink: s.write, level: "warn" });
  logger.debug("no");
  logger.info("no");
  logger.warn("yes");
  assert.equal(s.lines.length, 1);
});

/* ═══════════════════════════════════════════════════════ VALIDATION ═════ */

test("validation: unknown fields are rejected, not silently ignored", () => {
  const schema = { subject_id: t.subjectId(), note: t.optional(t.string({ max: 100 })) };
  assert.doesNotThrow(() => validateInput({ subject_id: "sub_abc" }, schema));

  // A misspelled "disclosure" must not slip through and produce an event without one.
  try {
    validateInput({ subject_id: "sub_abc", disclosur: {} }, schema);
    assert.fail("should have thrown");
  } catch (err) {
    assert.ok(err instanceof ValidationError);
    assert.equal(err.issues[0].rule, "unknown");
    assert.equal(err.issues[0].field, "disclosur");
  }
});

test("validation: messages never echo the submitted value", () => {
  try {
    validateInput({ subject_id: "aarav@example.com" }, { subject_id: t.subjectId() });
    assert.fail("should have thrown");
  } catch (err) {
    const serialised = JSON.stringify(err.toResponse());
    assert.doesNotMatch(serialised, /aarav@example\.com/,
      "a 400 that echoes the input turns validation into a data leak");
  }
});

test("validation: type helpers behave at their boundaries", () => {
  assert.equal(t.integer({ min: 1 })(0), "must be at least 1");
  assert.equal(t.integer()(1.5), "must be an integer");
  assert.equal(t.string({ enum: ["a", "b"] })("c"), "must be one of: a, b");
  assert.equal(t.pastOrNow()(new Date(Date.now() + 600_000).toISOString()), "must not be in the future");
  assert.equal(t.pastOrNow()(new Date().toISOString()), null);
  assert.equal(t.reference()("dest:germany@2026-07-19"), null);
  assert.equal(t.reference()("nonsense"), "must be a reference like kind:id or kind:id@version");
  assert.equal(t.optional(t.string())(undefined), null);
  assert.equal(t.array(t.string({ min: 1 }), { min: 1 })([]), "must contain at least 1 item(s)");
});

test("validation: evidence must resolve, and a stale pinned hash is caught", async () => {
  const good = [{ ref: "dest:germany@2026-07-19", kind: "published_data", hash: "sha256:aaa" }];
  const resolver = async (ref) => (ref.startsWith("dest:") ? { hash: "sha256:aaa" } : null);

  assert.deepEqual(await validateEvidence(good, { resolver }), good);

  await assert.rejects(() => validateEvidence([], { required: true }), (e) => e.issues[0].rule === "required");

  await assert.rejects(
    () => validateEvidence([{ ref: "claim:ghost", kind: "public_claim" }], { resolver }),
    (e) => e.issues[0].rule === "unresolvable",
    "evidence pointing at nothing is worse than none — it looks like diligence"
  );

  await assert.rejects(
    () => validateEvidence([{ ref: "dest:germany@2026-07-19", kind: "published_data", hash: "sha256:old" }], { resolver }),
    (e) => e.issues[0].rule === "stale"
  );
});

test("validation: disclosure must come from the register, not be hand-written", () => {
  const register = {
    last_reviewed: "2026-07-25",
    relationships: [],
    no_relationship_statement: "We hold no commercial relationship with this destination or any institution in it.",
    relationship_statement_prefix: "Disclosure: we hold a commercial relationship with",
  };
  const valid = { shown: true, register_version: "2026-07-25", statements: [register.no_relationship_statement] };
  assert.deepEqual(validateDisclosure(valid, { register }), valid);

  assert.throws(() => validateDisclosure({ ...valid, shown: false }, { register }), (e) => e.issues[0].rule === "must_be_true");
  assert.throws(() => validateDisclosure({ ...valid, register_version: "2020-01-01" }, { register }), (e) => e.issues[0].rule === "stale");
  assert.throws(
    () => validateDisclosure({ ...valid, statements: ["We are definitely independent, trust us."] }, { register }),
    (e) => e.issues[0].rule === "not_from_register",
    "disclosure text must not drift from the register"
  );
  assert.throws(() => validateDisclosure(null, { required: true }), (e) => e.issues[0].rule === "required");
});

test("validation: business rules report every failure at once", () => {
  try {
    validateRules({ b: 1, c: 1 }, [rule.required("a"), rule.mutuallyExclusive("b", "c")]);
    assert.fail("should have thrown");
  } catch (err) {
    assert.equal(err.issues.length, 2, "one round trip, all problems");
  }
});

/* ══════════════════════════════════════════════════════════ METRICS ═════ */

test("metrics: counters, histograms and Prometheus output", () => {
  const m = createMetrics();
  m.requestStarted("/v1/x", "GET");
  m.requestStarted("/v1/x", "GET");
  m.requestCompleted("/v1/x", "GET", 200, 42);
  m.permissionDenied("/v1/x", "partner");
  m.eventAppended("recommendation.issued");
  m.recommendationIssued(true);

  const snap = m.snapshot();
  assert.equal(snap.counters['requests_total{method=GET,route=/v1/x}'], 2);
  assert.equal(snap.counters['permission_failures_total{role=partner,route=/v1/x}'], 1);
  assert.equal(snap.counters['recommendations_total{ai_assisted=true}'], 1);

  const text = m.toPrometheus();
  assert.match(text, /request_duration_ms_bucket\{.*le="50"\} 1/);
  assert.match(text, /request_duration_ms_count\{.*\} 1/);
});

test("metrics: unbounded label values are refused to protect cardinality", () => {
  const m = createMetrics();
  // A subject id as a label would create one time series per person and leak
  // who our clients are.
  assert.throws(() => m.increment("x", { subject: "sub_a b c!" }), /not a bounded label value/);
  assert.doesNotThrow(() => m.increment("x", { route: "/v1/records/:id" }));
});

/* ═════════════════════════════════════════════════════════ SECURITY ═════ */

test("security: default headers are strict and responses are never cached", () => {
  const h = securityHeaders();
  assert.equal(h["x-content-type-options"], "nosniff");
  assert.equal(h["x-frame-options"], "DENY");
  assert.match(h["content-security-policy"], /default-src 'none'/);
  assert.match(h["content-security-policy"], /frame-ancestors 'none'/);
  assert.match(h["cache-control"], /no-store/);
  assert.match(h["strict-transport-security"], /max-age=63072000/);
  assert.equal(h["referrer-policy"], "no-referrer");
});

test("security: CORS is allowlist-only, with no wildcard path", () => {
  const opts = { allowed: ["https://app.richenquest.com"] };
  assert.deepEqual(corsHeaders("https://evil.example", opts), {}, "an unknown origin gets no CORS headers at all");
  assert.deepEqual(corsHeaders(undefined, opts), {});
  const ok = corsHeaders("https://app.richenquest.com", opts);
  assert.equal(ok["access-control-allow-origin"], "https://app.richenquest.com");
  assert.equal(ok["access-control-allow-credentials"], "true");
  assert.notEqual(ok["access-control-allow-origin"], "*");
});

test("security: CSRF token is session-bound so it cannot be replayed", () => {
  const token = issueCsrfToken("sess_a", SECRET);
  assert.equal(verifyCsrf({ method: "POST", headerToken: token, cookieToken: token, sessionId: "sess_a", secret: SECRET }), true);

  // Same token, different session: the naive double-submit weakness, closed.
  assert.equal(verifyCsrf({ method: "POST", headerToken: token, cookieToken: token, sessionId: "sess_b", secret: SECRET }), false);
  // Attacker sets both cookie and header to a value they chose.
  assert.equal(verifyCsrf({ method: "POST", headerToken: "x.y", cookieToken: "x.y", sessionId: "sess_a", secret: SECRET }), false);
  // Mismatched pair.
  assert.equal(verifyCsrf({ method: "POST", headerToken: token, cookieToken: "other", sessionId: "sess_a", secret: SECRET }), false);
  // Safe methods are exempt.
  assert.equal(verifyCsrf({ method: "GET", sessionId: "sess_a", secret: SECRET }), true);
});

test("security: cookies are __Host- prefixed, HttpOnly where possible, SameSite=Strict", () => {
  const s = sessionCookie("abc");
  assert.match(s, /^__Host-rq_session=abc/);
  assert.match(s, /HttpOnly/);
  assert.match(s, /Secure/);
  assert.match(s, /SameSite=Strict/);

  // CSRF cookie must be JS-readable to be echoed, so no HttpOnly — deliberate.
  const c = csrfCookie("t");
  assert.doesNotMatch(c, /HttpOnly/);
  assert.match(c, /Secure/);

  assert.deepEqual(parseCookies("a=1; b=2"), { a: "1", b: "2" });
  assert.equal(bearerToken("Bearer abc.def"), "abc.def");
  assert.equal(bearerToken("Basic abc"), null);
});

test("security: rate limiting works over a pluggable store (fixes the in-process debt)", async () => {
  let now = 1_000_000;
  const store = memoryCounterStore({ now: () => now });
  const rl = createRateLimiter(store, { now: () => now });

  for (let i = 0; i < RATE_TIERS.write.limit; i++) {
    await rl.enforce("usr_k", "write", { route: "/v1/x" });
  }
  await assert.rejects(
    () => rl.enforce("usr_k", "write", { route: "/v1/x" }),
    (e) => e.code === "RATE_LIMITED" && e.retryable === true
  );

  // Limits are per identity, per tier and per route.
  await assert.doesNotReject(() => rl.enforce("usr_other", "write", { route: "/v1/x" }));
  await assert.doesNotReject(() => rl.enforce("usr_k", "write", { route: "/v1/other" }));

  now += 60_000;
  await assert.doesNotReject(() => rl.enforce("usr_k", "write", { route: "/v1/x" }));

  assert.notEqual(ipKey("203.0.113.7"), "203.0.113.7", "raw IPs are never used as keys");
});

/* ═════════════════════════════════════════════════════════ PIPELINE ═════ */

function endpointDeps(over = {}) {
  return {
    verifyToken,
    secret: SECRET,
    rateLimiter: createRateLimiter(memoryCounterStore()),
    validateInput,
    logger: createLogger({ sink: () => {} }),
    metrics: createMetrics(),
    ...over,
  };
}

test("pipeline: the stage order is fixed and cannot be redefined by an endpoint", async () => {
  assert.deepEqual(STAGES, [
    "context", "rate_limit", "authenticate", "authorise", "consent",
    "validate", "evidence", "disclosure", "business", "append", "audit", "log",
  ]);
  assert.throws(() => { STAGES.push("skip_auth"); }, TypeError, "the pipeline must be immutable");

  // An endpoint that tries to supply its own order is ignored — order is not an input.
  const handler = defineEndpoint({
    route: "/v1/t", method: "GET", requiresAuth: false,
    stages: ["business"], // ignored on purpose
    business: async () => ({ ok: true }),
  });
  const res = await handler({}, endpointDeps());
  assert.equal(res.status, 200);
});

test("pipeline: every stage is recorded even when an endpoint does not configure it", async () => {
  let path = null;
  const handler = defineEndpoint({
    route: "/v1/t", method: "GET", requiresAuth: false,
    business: async ({ ctx }) => { path = executionPath(ctx); return { ok: true }; },
  });
  await handler({}, endpointDeps());

  // A missing check must be visible in observability, not invisible.
  for (const stage of ["context", "rate_limit", "authenticate", "authorise", "consent", "validate", "evidence", "disclosure"]) {
    assert.ok(path.stages.some((s) => s.name === stage), `stage ${stage} must appear in the execution path`);
  }
});

test("pipeline: defineEndpoint is the only way to build a handler", () => {
  assert.throws(() => defineEndpoint({ route: "/x", method: "GET" }), /business stage is required/);
  assert.throws(() => defineEndpoint({ business: async () => {} }), /route and method are required/);
});

test("pipeline: unauthenticated requests are refused before business logic runs", async () => {
  let ran = false;
  const handler = defineEndpoint({
    route: "/v1/secure", method: "GET",
    authorise: async () => true,
    business: async () => { ran = true; return {}; },
  });

  const res = await handler({ headers: {} }, endpointDeps());
  assert.equal(res.status, 401);
  assert.equal(ran, false, "business logic must never run for an unauthenticated caller");
  assert.equal(res.body.error.message, "Authentication is required.");
});

test("pipeline: authorisation failure short-circuits and returns no data", async () => {
  const { token } = issueToken({ sub: "sub_a", role: "subject", subject_id: "sub_a" }, SECRET);
  let ran = false;
  const handler = defineEndpoint({
    route: "/v1/records/:subject_id", method: "GET",
    authorise: async () => { throw new AuthorisationError("not your record", { subjectId: "sub_b" }); },
    business: async () => { ran = true; return { secret: "should never appear" }; },
  });

  const res = await handler({ headers: { authorization: `Bearer ${token}` }, params: { subject_id: "sub_b" } }, endpointDeps());
  assert.equal(res.status, 403);
  assert.equal(ran, false);
  assert.doesNotMatch(JSON.stringify(res.body), /should never appear/);
});

test("pipeline: consent denial is returned with its reason and audited", async () => {
  const { token } = issueToken({ sub: "usr_k", role: "counsellor" }, SECRET);
  const audits = [];
  const handler = defineEndpoint({
    route: "/v1/records/:subject_id/recommendations", method: "POST",
    consentPurpose: "advisory",
    authorise: async () => true,
    business: async () => ({ ok: true }),
    append: async () => ({ event_id: "01X", type: "recommendation.issued" }),
    audit: async ({ outcome, error }) => { audits.push({ outcome, code: error?.code }); },
  });

  const res = await handler(
    { headers: { authorization: `Bearer ${token}` }, params: { subject_id: "sub_m" }, body: {} },
    endpointDeps({
      consentFor: async () => ({ allowed: false, code: "GUARDIAN_REQUIRED", purpose: "advisory", reason: "subject is a minor and no verified guardian is linked" }),
    })
  );

  assert.equal(res.status, 403);
  assert.match(res.body.error.message, /guardian/);
  assert.deepEqual(audits, [{ outcome: "denied", code: "CONSENT_GUARDIAN_REQUIRED" }],
    "a refusal belongs in the person's record, not only in our logs");
});

test("pipeline: a successful write runs every stage and returns 201 with the event", async () => {
  const { token } = issueToken({ sub: "usr_k", role: "counsellor" }, SECRET);
  const order = [];
  const handler = defineEndpoint({
    route: "/v1/records/:subject_id/events", method: "POST",
    schema: { note: t.string({ min: 1, max: 100 }) },
    authorise: async () => { order.push("authorise"); return true; },
    evidence: async () => { order.push("evidence"); return [{ ref: "dest:germany@2026-07-19", kind: "published_data" }]; },
    disclosure: async () => { order.push("disclosure"); return { shown: true, register_version: "2026-07-25", statements: ["none"] }; },
    business: async ({ validated }) => { order.push("business"); return { note: validated.note }; },
    append: async () => { order.push("append"); return { event_id: "01EVENT", type: "counselling.note_added" }; },
    audit: async () => { order.push("audit"); },
  });

  const deps = endpointDeps();
  const res = await handler(
    { headers: { authorization: `Bearer ${token}` }, params: { subject_id: "sub_a" }, body: { note: "spoke with the family" } },
    deps
  );

  assert.equal(res.status, 201);
  assert.deepEqual(order, ["authorise", "evidence", "disclosure", "business", "append", "audit"],
    "stages must run in the declared pipeline order");
  assert.equal(deps.metrics.snapshot().counters['events_appended_total{type=counselling.note_added}'], 1);
  assert.equal(res.headers["x-correlation-id"].startsWith("cor_"), true);
  assert.match(res.headers["content-security-policy"], /default-src 'none'/);
});

test("pipeline: validation failure returns field issues without reaching business", async () => {
  const { token } = issueToken({ sub: "usr_k", role: "counsellor" }, SECRET);
  let ran = false;
  const handler = defineEndpoint({
    route: "/v1/t", method: "POST",
    schema: { note: t.string({ min: 5 }) },
    authorise: async () => true,
    business: async () => { ran = true; return {}; },
    append: async () => ({ event_id: "x", type: "counselling.note_added" }),
  });

  const deps = endpointDeps();
  const res = await handler({ headers: { authorization: `Bearer ${token}` }, body: { note: "hi" } }, deps);
  assert.equal(res.status, 400);
  assert.equal(ran, false);
  assert.equal(res.body.error.issues[0].field, "note");
  assert.ok(deps.metrics.snapshot().counters['validation_failures_total{field=note,route=/v1/t}']);
});

test("pipeline: an internal failure returns 500 with nothing leaked", async () => {
  const { token } = issueToken({ sub: "usr_k", role: "counsellor" }, SECRET);
  const handler = defineEndpoint({
    route: "/v1/t", method: "GET",
    authorise: async () => true,
    business: async () => { throw new Error("SELECT * FROM events WHERE subject_id='sub_secret'"); },
  });
  const res = await handler({ headers: { authorization: `Bearer ${token}` } }, endpointDeps());

  assert.equal(res.status, 500);
  assert.doesNotMatch(JSON.stringify(res.body), /SELECT|sub_secret/);
  assert.equal(res.body.error.retryable, true);
});

test("pipeline: rate limiting is applied before authentication", async () => {
  const store = memoryCounterStore();
  const rl = createRateLimiter(store);
  const handler = defineEndpoint({
    route: "/v1/public", method: "GET", requiresAuth: false,
    business: async () => ({ ok: true }),
  });

  const deps = endpointDeps({ rateLimiter: rl });
  let limited = null;
  for (let i = 0; i < RATE_TIERS.anonymous.limit + 1; i++) {
    const res = await handler({ headers: {}, ip: "203.0.113.9" }, deps);
    if (res.status === 429) { limited = res; break; }
  }
  assert.ok(limited, "an unauthenticated flood must be refused");
  assert.ok(limited.headers["retry-after"], "429 must tell the caller when to retry");
});

test("pipeline: an audit failure never masks the original error", async () => {
  const { token } = issueToken({ sub: "usr_k", role: "counsellor" }, SECRET);
  const handler = defineEndpoint({
    route: "/v1/t", method: "POST",
    authorise: async () => { throw new AuthorisationError("denied"); },
    business: async () => ({}),
    append: async () => ({ event_id: "x", type: "counselling.note_added" }),
    audit: async () => { throw new Error("audit store unreachable"); },
  });
  const res = await handler({ headers: { authorization: `Bearer ${token}` }, body: {} }, endpointDeps());
  assert.equal(res.status, 403, "the caller still sees the real reason");
  assert.equal(res.body.error.code, "FORBIDDEN");
});

test("assertEndpointComplete catches specification gaps at boot", () => {
  assert.throws(
    () => assertEndpointComplete({ route: "/x", method: "POST", authorise: () => {} }),
    /must declare an append stage/
  );
  assert.throws(
    () => assertEndpointComplete({ route: "/x", method: "POST", append: () => {}, authorise: () => {}, appendsAdvisory: true }),
    /must declare an evidence stage/
  );
  assert.throws(
    () => assertEndpointComplete({ route: "/x", method: "GET" }),
    /must declare an authorise stage/
  );
  assert.equal(
    assertEndpointComplete({
      route: "/x", method: "POST", appendsAdvisory: true,
      authorise: () => {}, evidence: () => {}, disclosure: () => {}, append: () => {},
    }),
    true
  );
});

/* ═════════════════════════════════════════════════════════ REGRESSIONS ═══ */

test("regression: context enrichment survives across pipeline stages", async () => {
  // enterWith() inside a nested async callback did not propagate to the caller's
  // continuation, so subject_id set during authenticate was null by the consent
  // stage — every write returned CONSENT_NO_SUBJECT.
  await withContext(createContext({ route: "/x" }), async () => {
    await timeSpan("authenticate", async () => {
      enrichContext({ subject_id: "sub_a", actor_id: "usr_k" });
      return "ok";
    });
    await timeSpan("later_stage", async () => {
      assert.equal(currentContext().subject_id, "sub_a", "enrichment must be visible to later stages");
      assert.equal(currentContext().actor_id, "usr_k");
      return "ok";
    });
  });
});

test("regression: a data-derived metric label is sanitised, not rejected", () => {
  // `evidence[0].ref` contains characters the strict label guard rejects. Throwing
  // crashed the error handler and turned a clean 400 into a 500.
  const m = createMetrics();
  assert.doesNotThrow(() => m.validationFailed("/v1/x", "evidence[0].ref"));
  assert.doesNotThrow(() => m.validationFailed("/v1/x", "weird field!name"));
  assert.equal(sanitiseLabel("evidence[0].ref"), "evidence.ref");
  assert.equal(sanitiseLabel("evidence[7].ref"), "evidence.ref", "indices must not create separate series");
  assert.equal(sanitiseLabel(""), "unknown");
  // The strict guard still protects hand-written labels.
  assert.throws(() => m.increment("x", { role: "not a role!" }), /not a bounded label value/);
});

test("regression: telemetry failure cannot break error handling", async () => {
  const { token } = issueToken({ sub: "usr_k", role: "counsellor" }, SECRET);
  const brokenMetrics = {
    ...createMetrics(),
    requestFailed() { throw new Error("metrics backend unreachable"); },
  };
  const handler = defineEndpoint({
    route: "/v1/t", method: "POST",
    schema: { note: t.string({ min: 5 }) },
    authorise: async () => true,
    business: async () => ({}),
    append: async () => ({ event_id: "x", type: "counselling.note_added" }),
  });

  const res = await handler(
    { headers: { authorization: `Bearer ${token}` }, body: { note: "hi" } },
    endpointDeps({ metrics: brokenMetrics })
  );
  assert.equal(res.status, 400, "the caller still gets the real error");
  assert.equal(res.body.error.issues[0].field, "note");
});

test("regression: grants reach the business stage, not only authorise", async () => {
  // Passing grants only to authorise left business with undefined, which produced
  // an EMPTY projection instead of a refusal — a silent failure that looks like
  // "this person has no history".
  const { token } = issueToken({ sub: "u", role: "partner", partner_id: "partner:x" }, SECRET);
  let seen = "unset";
  const handler = defineEndpoint({
    route: "/v1/t", method: "GET",
    authorise: async () => true,
    business: async ({ grants }) => { seen = grants; return {}; },
  });
  await handler(
    { headers: { authorization: `Bearer ${token}` } },
    endpointDeps({ resolveGrants: async () => [{ grantee: "partner:x" }] })
  );
  assert.ok(Array.isArray(seen) && seen.length === 1, "business must receive resolved grants");
});
