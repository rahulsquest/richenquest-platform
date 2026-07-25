/**
 * Authentication & Identity — session tokens, actor resolution, rate limiting.
 *
 * Architecture: docs/25-career-record-architecture.md §3, §9, §11.2.
 *
 * SCOPE — deliberately narrow
 * This module verifies WHO is calling and resolves them to an actor the write path
 * can authorise. It does NOT store passwords and does not implement a credential
 * flow. Identity proofing belongs to an identity provider (Zoho OAuth already
 * exists in this stack for staff; students get a magic-link/OIDC flow later).
 * Holding password hashes here would add the single highest-consequence liability
 * in the system for no architectural gain.
 *
 * TOKENS
 * Stateless, HMAC-SHA256 signed, short-lived, scope-bound. Chosen over an opaque
 * session table because the Career Record API is called from four interfaces and
 * a shared session store becomes a coupling point and a single point of failure.
 * Revocation before expiry is handled by a deny-list keyed on token id (jti), so
 * "log out everywhere" is possible without a lookup on the happy path.
 *
 * VERIFICATION STATUS: unit-tested. NOT integration-tested against a real IdP.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const ALGO = "sha256";
const DEFAULT_TTL_SECONDS = 900; // 15 minutes; refresh belongs to the IdP
const MAX_TTL_SECONDS = 86_400;

export const ROLES = Object.freeze([
  "subject",
  "guardian",
  "counsellor",
  "administrator",
  "partner",
  "auditor",
  "ai_service",
]);

export class AuthError extends Error {
  constructor(code, message, status = 401) {
    super(message);
    this.code = code;
    this.status = status;
    this.name = "AuthError";
  }
}

const b64u = (buf) => Buffer.from(buf).toString("base64url");
const unb64u = (s) => Buffer.from(s, "base64url");

function sign(payloadB64, secret) {
  return createHmac(ALGO, secret).update(payloadB64).digest("base64url");
}

function constantEquals(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  // Length is compared first because timingSafeEqual throws on a mismatch. Token
  // length is not secret, so this leaks nothing useful.
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/* ---------------------------------------------------------- issue/verify --- */

/**
 * Issue a session token.
 *
 * @param {object} claims { sub, role, subject_id?, scopes?, partner_id? }
 * @param {string} secret HMAC key (≥32 bytes)
 */
export function issueToken(claims, secret, { ttlSeconds = DEFAULT_TTL_SECONDS, now = Date.now() } = {}) {
  if (!secret || Buffer.from(secret).length < 32) {
    throw new AuthError("WEAK_SECRET", "signing secret must be at least 32 bytes", 500);
  }
  if (!ROLES.includes(claims.role)) throw new AuthError("BAD_ROLE", `unknown role "${claims.role}"`, 400);
  if (!claims.sub) throw new AuthError("NO_SUBJECT", "token must identify the caller (sub)", 400);
  if (ttlSeconds > MAX_TTL_SECONDS) {
    throw new AuthError("TTL_TOO_LONG", `ttl exceeds the ${MAX_TTL_SECONDS}s maximum`, 400);
  }

  // A subject token must name the record it may touch, or authorisation has
  // nothing to compare against and a bug becomes a cross-account read.
  if (claims.role === "subject" && !claims.subject_id) {
    throw new AuthError("NO_RECORD_BINDING", "a subject token must carry subject_id", 400);
  }
  if (claims.role === "partner" && !claims.partner_id) {
    throw new AuthError("NO_PARTNER_BINDING", "a partner token must carry partner_id", 400);
  }

  const iat = Math.floor(now / 1000);
  const payload = {
    v: 1,
    jti: randomBytes(12).toString("base64url"),
    sub: claims.sub,
    role: claims.role,
    subject_id: claims.subject_id ?? null,
    partner_id: claims.partner_id ?? null,
    scopes: claims.scopes ?? [],
    iat,
    exp: iat + ttlSeconds,
  };
  const body = b64u(JSON.stringify(payload));
  return { token: `rq1.${body}.${sign(body, secret)}`, claims: payload };
}

/**
 * Verify a token and return its claims.
 *
 * Order matters: signature is checked BEFORE the payload is trusted for anything,
 * including expiry. Reading claims from an unverified token is how "expired token"
 * checks get bypassed with a forged exp.
 */
export function verifyToken(token, secret, { now = Date.now(), revoked = new Set(), clockSkewSeconds = 30 } = {}) {
  if (typeof token !== "string" || !token.startsWith("rq1.")) {
    throw new AuthError("MALFORMED_TOKEN", "token is missing or not a RichenQuest session token");
  }
  const parts = token.split(".");
  if (parts.length !== 3) throw new AuthError("MALFORMED_TOKEN", "token structure is invalid");

  const [, body, mac] = parts;
  if (!constantEquals(mac, sign(body, secret))) {
    throw new AuthError("BAD_SIGNATURE", "token signature does not verify");
  }

  let claims;
  try {
    claims = JSON.parse(unb64u(body).toString("utf8"));
  } catch {
    throw new AuthError("MALFORMED_TOKEN", "token payload is not valid JSON");
  }

  const nowSec = Math.floor(now / 1000);
  if (claims.exp === undefined || nowSec > claims.exp + clockSkewSeconds) {
    throw new AuthError("TOKEN_EXPIRED", "token has expired");
  }
  if (claims.iat !== undefined && claims.iat > nowSec + clockSkewSeconds) {
    throw new AuthError("TOKEN_NOT_YET_VALID", "token was issued in the future");
  }
  if (revoked.has(claims.jti)) throw new AuthError("TOKEN_REVOKED", "token has been revoked");
  if (!ROLES.includes(claims.role)) throw new AuthError("BAD_ROLE", "token carries an unknown role", 403);

  return claims;
}

/**
 * Resolve verified claims into the viewer shape the permission layer consumes.
 * Kept separate from verifyToken so authentication and authorisation stay distinct:
 * a valid token says who you are, never what you may see.
 */
export function resolveActor(claims, { grants = [], assignedSubjects = [], wards = [] } = {}) {
  const actorKind =
    claims.role === "ai_service" ? "ai" : claims.role === "partner" ? "partner" : "human";

  return {
    actor: { kind: actorKind, id: claims.sub, role: claims.role },
    viewer: {
      role: claims.role,
      id: claims.role === "partner" ? claims.partner_id : claims.sub,
      subjectId: claims.subject_id ?? null,
      grants,
      assignedSubjects,
      wards,
    },
    scopes: claims.scopes ?? [],
    token_id: claims.jti,
  };
}

/**
 * Assert the caller may act on this record at all — a cheap pre-check before the
 * per-event permission pass. Defence in depth: a subject token bound to record A
 * must not reach record B's events even if a projection filter is later buggy.
 */
export function assertRecordAccess(claims, subjectId) {
  if (claims.role === "subject" && claims.subject_id !== subjectId) {
    throw new AuthError("WRONG_RECORD", "this token is bound to a different record", 403);
  }
  if (claims.role === "guardian" && !(claims.scopes ?? []).includes(`ward:${subjectId}`)) {
    throw new AuthError("NOT_GUARDIAN_OF", "this token is not scoped to that record", 403);
  }
  return true;
}

/* ------------------------------------------------------------ rate limit --- */

/**
 * Fixed-window rate limiter.
 *
 * Chosen for auditability over a sliding window: an operator can reason about
 * "60 per minute" precisely, and the boundary burst it allows (up to 2× at a
 * window edge) is acceptable for an advisory API and is documented rather than
 * hidden. Swap for a token bucket if that ever stops being true.
 *
 * In-process only — correct for a single instance, NOT across a serverless fleet.
 * Recorded as debt: see the follow-up note in the module docs.
 */
export function rateLimiter({ limit = 60, windowMs = 60_000, now = () => Date.now() } = {}) {
  const buckets = new Map();

  return {
    /** @returns {{allowed:boolean, remaining:number, retryAfterMs:number}} */
    check(key) {
      const t = now();
      const windowStart = Math.floor(t / windowMs) * windowMs;
      const bucket = buckets.get(key);

      if (!bucket || bucket.windowStart !== windowStart) {
        buckets.set(key, { windowStart, count: 1 });
        return { allowed: true, remaining: limit - 1, retryAfterMs: 0 };
      }
      if (bucket.count >= limit) {
        return { allowed: false, remaining: 0, retryAfterMs: windowStart + windowMs - t };
      }
      bucket.count += 1;
      return { allowed: true, remaining: limit - bucket.count, retryAfterMs: 0 };
    },

    /** Periodic cleanup so the map cannot grow without bound. */
    sweep() {
      const cutoff = Math.floor(now() / windowMs) * windowMs;
      for (const [k, b] of buckets) if (b.windowStart < cutoff) buckets.delete(k);
      return buckets.size;
    },

    size: () => buckets.size,
  };
}

/* --------------------------------------------------------------- logging --- */

/**
 * Structured auth log line. PII never appears: identifiers only, never names,
 * emails or token contents. A log that leaks what the vault protects is worse
 * than no log.
 */
export function authLogLine({ outcome, code = null, role = null, actorId = null, subjectId = null, route, ip = null }) {
  return JSON.stringify({
    ts: new Date().toISOString(),
    kind: "auth",
    outcome,
    code,
    route,
    role,
    actor_id: actorId,
    subject_id: subjectId,
    // Hashed, not stored: enough to correlate abuse, not enough to identify a person.
    ip_hash: ip ? createHmac(ALGO, "richenquest.log.iphash.v1").update(ip).digest("hex").slice(0, 16) : null,
  });
}

export { DEFAULT_TTL_SECONDS, MAX_TTL_SECONDS };
