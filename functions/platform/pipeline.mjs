/**
 * Platform — the middleware pipeline.
 *
 * "No endpoint may skip this pipeline" is enforced STRUCTURALLY, not by review:
 *
 *   · The stage ORDER is a module constant. An endpoint definition supplies
 *     handlers FOR stages; it cannot reorder, insert or remove them.
 *   · `defineEndpoint()` is the only way to produce a handler. There is no export
 *     that takes a bare function and returns something callable by the transport.
 *   · Stages an endpoint does not configure still run — they are no-ops that
 *     nonetheless record a span, so the execution path always shows the full
 *     pipeline and a missing check is visible in observability.
 *
 * Fixed order (docs/25 §9, founder specification):
 *   context → authn → authz → consent → validate → evidence → disclosure
 *           → business → append → audit → log → response
 */

import { createContext, withContext, enrichContext, timeSpan, elapsed, executionPath, contextFields } from "./context.mjs";
import { log as defaultLog } from "./logging.mjs";
import { metrics as defaultMetrics } from "./metrics.mjs";
import { securityHeaders, corsHeaders, bearerToken, ipKey } from "./security.mjs";
import {
  toPlatformError, AuthenticationError, AuthorisationError, ConsentDenied,
  PlatformError, AUDIT, InternalError,
} from "./errors.mjs";

/** The pipeline. Frozen so it cannot be mutated at runtime. */
export const STAGES = Object.freeze([
  "context",
  "rate_limit",
  "authenticate",
  "authorise",
  "consent",
  "validate",
  "evidence",
  "disclosure",
  "business",
  "append",
  "audit",
  "log",
]);

/**
 * Define an endpoint.
 *
 * @param {object} spec
 * @param {string} spec.route          template path, e.g. "/v1/records/:id/timeline"
 * @param {string} spec.method
 * @param {"anonymous"|"authenticated"|"write"|"partner"} [spec.tier]
 * @param {boolean} [spec.requiresAuth=true]
 * @param {string|null} [spec.consentPurpose]  purpose to check, or null
 * @param {object|null} [spec.schema]          input schema for validateInput
 * @param {(deps) => Promise<any>} [spec.authorise]  throw to deny
 * @param {(deps) => Promise<any>} [spec.evidence]   resolve/validate evidence
 * @param {(deps) => Promise<any>} [spec.disclosure] resolve disclosure from register
 * @param {(deps) => Promise<any>} spec.business     the actual work
 * @param {(deps) => Promise<any>} [spec.append]     event append
 * @param {(deps) => Promise<any>} [spec.audit]      audit event on refusal/success
 */
export function defineEndpoint(spec) {
  if (typeof spec?.business !== "function") {
    throw new Error("defineEndpoint: a business stage is required");
  }
  if (!spec.route || !spec.method) {
    throw new Error("defineEndpoint: route and method are required");
  }

  const {
    route,
    method,
    tier = spec.method === "GET" ? "authenticated" : "write",
    requiresAuth = true,
    consentPurpose = null,
    schema = null,
  } = spec;

  /**
   * @param {object} req  { headers, body, params, query, ip }
   * @param {object} deps { verifyToken, secret, revoked, rateLimiter, store, logger,
   *                        metrics, cors, resolveGrants, consentFor, disclosureRegister,
   *                        validateInput, validateEvidence, validateDisclosure }
   */
  return async function handle(req = {}, deps = {}) {
    const logger = deps.logger ?? defaultLog;
    const metrics = deps.metrics ?? defaultMetrics;
    const headers = lowercaseKeys(req.headers ?? {});
    const ctx = createContext({ headers, route, method, ip: req.ip ?? null });

    return withContext(ctx, async () => {
      const state = { req, deps, headers, claims: null, actor: null, viewer: null, validated: null,
                      evidence: null, disclosure: null, result: null, event: null };
      metrics.requestStarted(route, method);

      try {
        /* 1. context — already created; recorded so the path always starts here */
        await timeSpan("context", async () => ctx.correlation_id);

        /* 2. rate limit — before authentication, so an unauthenticated flood is
              cheap to refuse and cannot be used to probe tokens */
        await timeSpan("rate_limit", async () => {
          if (!deps.rateLimiter) return "skipped";
          const identity = state.claims?.sub ?? ipKey(req.ip);
          const res = await deps.rateLimiter.enforce(identity, requiresAuth ? tier : "anonymous", { route });
          return res.remaining;
        });

        /* 3. authenticate */
        await timeSpan("authenticate", async () => {
          if (!requiresAuth) return "public";
          const token = bearerToken(headers.authorization);
          if (!token) throw new AuthenticationError("no bearer token presented");
          if (!deps.verifyToken || !deps.secret) throw new InternalError("auth dependencies not wired");
          state.claims = deps.verifyToken(token, deps.secret, { revoked: deps.revoked ?? new Set() });
          enrichContext({
            actor_id: state.claims.sub,
            actor_role: state.claims.role,
            session_id: state.claims.jti,
            subject_id: req.params?.subject_id ?? state.claims.subject_id ?? null,
          });
          return state.claims.role;
        });

        /* 4. authorise */
        await timeSpan("authorise", async () => {
          if (!spec.authorise) return "none";
          const grants = deps.resolveGrants ? await deps.resolveGrants(state.claims, req) : [];
          state.viewer = { grants };
          return spec.authorise({ ...state, grants, ctx });
        });

        /* 5. consent */
        await timeSpan("consent", async () => {
          if (!consentPurpose) return "not_required";
          if (!deps.consentFor) throw new InternalError("consent dependency not wired");
          const decision = await deps.consentFor(ctx.subject_id, consentPurpose, {
            actorKind: state.claims?.role === "ai_service" ? "ai" : "human",
          });
          if (!decision.allowed) throw new ConsentDenied(decision);
          return decision.purpose;
        });

        /* 6. validate */
        await timeSpan("validate", async () => {
          if (!schema) return "no_schema";
          const validate = deps.validateInput;
          if (!validate) throw new InternalError("validation dependency not wired");
          state.validated = validate(req.body ?? {}, schema);
          return Object.keys(schema).length;
        });

        /* 7. evidence */
        await timeSpan("evidence", async () => {
          if (!spec.evidence) return "not_required";
          state.evidence = await spec.evidence({ ...state, ctx });
          return Array.isArray(state.evidence) ? state.evidence.length : 0;
        });

        /* 8. disclosure */
        await timeSpan("disclosure", async () => {
          if (!spec.disclosure) return "not_required";
          state.disclosure = await spec.disclosure({ ...state, ctx });
          return state.disclosure?.register_version ?? null;
        });

        /* 9. business */
        state.result = await timeSpan("business", () => spec.business({ ...state, ctx }));

        /* 10. append */
        await timeSpan("append", async () => {
          if (!spec.append) return "no_event";
          state.event = await spec.append({ ...state, ctx });
          if (state.event?.type) metrics.eventAppended(state.event.type);
          return state.event?.event_id ?? null;
        });

        /* 11. audit */
        await timeSpan("audit", async () => {
          if (!spec.audit) return "none";
          return spec.audit({ ...state, ctx, outcome: "allowed" });
        });

        /* 12. log */
        const status = spec.successStatus ?? (state.event ? 201 : 200);
        await timeSpan("log", async () => {
          logger.request({ status, eventId: state.event?.event_id ?? null, securityOutcome: "allowed" });
          metrics.requestCompleted(route, method, status, elapsed());
          return true;
        });

        return respond(status, state.result, { headers, deps, ctx });
      } catch (raw) {
        return handleFailure(raw, { state, ctx, headers, deps, logger, metrics, route, method, spec });
      }
    });
  };
}

/* ------------------------------------------------------------- failure --- */

async function handleFailure(raw, { state, ctx, headers, deps, logger, metrics, route, method, spec }) {
  const err = toPlatformError(raw);

  metrics.requestFailed(route, err.code);
  if (err.status === 403) metrics.permissionDenied(route, ctx.actor_role ?? "unknown");
  if (err.status === 400) {
    for (const issue of err.issues ?? []) metrics.validationFailed(route, issue.field);
  }
  if (err.code?.startsWith("CONSENT_")) metrics.consentDenied(route, err.code);
  if (err.status === 429) metrics.rateLimited(route);

  // An audit event is appended for refusals that the record should carry —
  // access.denied is part of a person's history, not just our logs.
  if (err.audit === AUDIT.AUDIT_EVENT && spec.audit) {
    try {
      await spec.audit({ ...state, ctx, outcome: "denied", error: err });
    } catch (auditErr) {
      // Never let audit failure mask the original error.
      logger.error("audit.append_failed", { original_code: err.code, audit_error: String(auditErr.message) });
    }
  }

  if (err.isSecurityEvent || err.audit === AUDIT.ALERT) {
    logger.security(`request.${err.code.toLowerCase()}`, err, { path: executionPath(ctx) });
  }

  logger.request({ status: err.status, error: err, securityOutcome: err.isSecurityEvent ? "denied" : "error" });
  metrics.requestCompleted(route, method, err.status, elapsed());

  const extra = {};
  if (err.status === 429) extra["retry-after"] = String(Math.ceil((err.retryAfterMs ?? 1000) / 1000));

  return respond(err.status, err.toResponse(), { headers, deps, ctx, extra });
}

/* -------------------------------------------------------------- respond --- */

function respond(status, body, { headers, deps, ctx, extra = {} }) {
  return {
    status,
    headers: {
      ...securityHeaders({ isApi: true }),
      ...corsHeaders(headers.origin, deps.cors ?? {}),
      "x-correlation-id": ctx.correlation_id,
      "x-request-id": ctx.request_id,
      ...extra,
    },
    body,
  };
}

function lowercaseKeys(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[k.toLowerCase()] = v;
  return out;
}

/**
 * Assert an endpoint definition covers what its shape implies.
 *
 * Called by tests and startup checks: a write endpoint with no append stage, or a
 * recommendation endpoint with no evidence/disclosure stage, is a specification
 * error we want caught at boot rather than by an invariant at 2am.
 */
export function assertEndpointComplete(spec) {
  const problems = [];
  if (spec.method !== "GET" && !spec.append) {
    problems.push("a mutating endpoint must declare an append stage (what event is recorded?)");
  }
  if (spec.appendsAdvisory && !spec.evidence) {
    problems.push("an advisory endpoint must declare an evidence stage (Constitution 6.3)");
  }
  if (spec.appendsAdvisory && !spec.disclosure) {
    problems.push("an advisory endpoint must declare a disclosure stage (Constitution 5.4)");
  }
  if (spec.requiresAuth !== false && !spec.authorise) {
    problems.push("an authenticated endpoint must declare an authorise stage (who may verify it?)");
  }
  if (problems.length) {
    throw new Error(`endpoint ${spec.method} ${spec.route} is incomplete:\n  · ${problems.join("\n  · ")}`);
  }
  return true;
}

export { contextFields, executionPath, PlatformError };
