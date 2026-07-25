/**
 * Platform — security headers, CORS, CSRF, cookies, distributed rate limiting.
 *
 * Defaults are the strict ones. Every relaxation has to be asked for explicitly at
 * a call site, where it is visible in review, rather than being a permissive
 * default nobody notices.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { RateLimitError } from "./errors.mjs";

/* ------------------------------------------------------------- headers --- */

/**
 * Response headers for every API response.
 *
 * The API returns JSON only, so the CSP is maximally restrictive: nothing may be
 * loaded or executed from an API response. `frame-ancestors 'none'` and
 * `X-Frame-Options: DENY` are both set because older browsers honour only the latter.
 */
export function securityHeaders({ hsts = true, isApi = true } = {}) {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer",
    "cross-origin-opener-policy": "same-origin",
    "cross-origin-resource-policy": "same-origin",
    "permissions-policy": "geolocation=(), camera=(), microphone=(), payment=()",
    // Responses contain personal data: no shared cache may ever hold them.
    "cache-control": "no-store, no-cache, must-revalidate, private",
    pragma: "no-cache",
  };

  headers["content-security-policy"] = isApi
    ? "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
    : "default-src 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'";

  if (hsts) headers["strict-transport-security"] = "max-age=63072000; includeSubDomains; preload";

  return headers;
}

/* ---------------------------------------------------------------- CORS --- */

/**
 * Strict allowlist CORS.
 *
 * No wildcard is possible: credentialed requests plus `*` is forbidden by the
 * spec anyway, and an API holding passports has no business being callable from
 * arbitrary origins. An unknown origin gets no CORS headers at all — the browser
 * then blocks it, which is the correct outcome.
 */
export function corsHeaders(origin, { allowed = [], methods = ["GET", "POST", "OPTIONS"], maxAge = 600 } = {}) {
  if (!origin || !allowed.includes(origin)) return {};
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-credentials": "true",
    "access-control-allow-methods": methods.join(", "),
    "access-control-allow-headers": "content-type, authorization, x-correlation-id, x-csrf-token, traceparent",
    "access-control-expose-headers": "x-correlation-id, x-request-id, retry-after",
    "access-control-max-age": String(maxAge),
    vary: "origin",
  };
}

/* ---------------------------------------------------------------- CSRF --- */

const CSRF_SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Signed double-submit CSRF token.
 *
 * The token is bound to the session id, so a valid token from one session cannot
 * be replayed into another — the weakness of the naive double-submit pattern,
 * where any attacker-set cookie value is accepted as long as it matches the header.
 */
export function issueCsrfToken(sessionId, secret) {
  const nonce = randomBytes(16).toString("base64url");
  const mac = createHmac("sha256", secret).update(`${sessionId}.${nonce}`).digest("base64url");
  return `${nonce}.${mac}`;
}

export function verifyCsrf({ method, headerToken, cookieToken, sessionId, secret }) {
  if (CSRF_SAFE_METHODS.has(method.toUpperCase())) return true;
  if (!headerToken || !cookieToken) return false;

  const a = Buffer.from(String(headerToken));
  const b = Buffer.from(String(cookieToken));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;

  const [nonce, mac] = String(headerToken).split(".");
  if (!nonce || !mac) return false;

  const expected = createHmac("sha256", secret).update(`${sessionId}.${nonce}`).digest("base64url");
  const em = Buffer.from(expected);
  const gm = Buffer.from(mac);
  return em.length === gm.length && timingSafeEqual(em, gm);
}

/* ------------------------------------------------------------- cookies --- */

/**
 * Session cookie. `__Host-` prefix forces HTTPS, host-only scope and path `/`,
 * which makes subdomain takeover unable to set or read it.
 */
export function sessionCookie(value, { maxAgeSeconds = 900, name = "__Host-rq_session" } = {}) {
  return [
    `${name}=${value}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
    `Max-Age=${maxAgeSeconds}`,
  ].join("; ");
}

/** CSRF cookie must be readable by the page's JS to be echoed back, so no HttpOnly. */
export function csrfCookie(value, { maxAgeSeconds = 900, name = "__Host-rq_csrf" } = {}) {
  return [`${name}=${value}`, "Path=/", "Secure", "SameSite=Strict", `Max-Age=${maxAgeSeconds}`].join("; ");
}

export function clearCookie(name) {
  return `${name}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export function parseCookies(header) {
  const out = {};
  if (typeof header !== "string") return out;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

/* ----------------------------------------------------------- bearer -------- */

export function bearerToken(authorizationHeader) {
  if (typeof authorizationHeader !== "string") return null;
  const m = /^Bearer\s+(\S+)$/i.exec(authorizationHeader.trim());
  return m ? m[1] : null;
}

/* -------------------------------------------------------- rate limiting --- */

/**
 * Rate limiter over a pluggable counter store.
 *
 * This replaces the in-process limiter in identity/auth.mjs, which was recorded as
 * debt in the previous cycle: it was correct for one instance and WRONG across a
 * serverless fleet, where each instance would allow the full quota. The store
 * interface below is satisfiable by Redis (INCR + EXPIRE), the Catalyst Data Store,
 * or the in-memory default for tests and single-instance runs.
 */

/**
 * @typedef {{ incrementAndGet(key: string, windowMs: number): Promise<{count:number, resetAt:number}> }} CounterStore
 */

export function memoryCounterStore({ now = () => Date.now() } = {}) {
  const buckets = new Map();
  return {
    async incrementAndGet(key, windowMs) {
      const t = now();
      const windowStart = Math.floor(t / windowMs) * windowMs;
      const existing = buckets.get(key);
      if (!existing || existing.windowStart !== windowStart) {
        buckets.set(key, { windowStart, count: 1 });
        return { count: 1, resetAt: windowStart + windowMs };
      }
      existing.count += 1;
      return { count: existing.count, resetAt: windowStart + windowMs };
    },
    sweep() {
      const cutoff = Math.floor(now() / 60_000) * 60_000;
      for (const [k, b] of buckets) if (b.windowStart < cutoff) buckets.delete(k);
      return buckets.size;
    },
    size: () => buckets.size,
  };
}

/**
 * Tiered limits. Anonymous callers are held far tighter than authenticated ones,
 * and writes tighter than reads, because an append is expensive and permanent.
 */
export const RATE_TIERS = Object.freeze({
  anonymous: { limit: 20, windowMs: 60_000 },
  authenticated: { limit: 120, windowMs: 60_000 },
  write: { limit: 30, windowMs: 60_000 },
  partner: { limit: 300, windowMs: 60_000 },
});

export function createRateLimiter(store = memoryCounterStore(), { now = () => Date.now() } = {}) {
  return {
    /**
     * @param {string} identity  actor id, or hashed IP when unauthenticated
     * @param {keyof RATE_TIERS} tier
     * @throws {RateLimitError}
     */
    async enforce(identity, tier = "authenticated", { route = "unknown" } = {}) {
      const cfg = RATE_TIERS[tier] ?? RATE_TIERS.authenticated;
      const key = `rl:${tier}:${route}:${identity}`;
      const { count, resetAt } = await store.incrementAndGet(key, cfg.windowMs);
      if (count > cfg.limit) {
        throw new RateLimitError({ retryAfterMs: Math.max(0, resetAt - now()) });
      }
      return { remaining: cfg.limit - count, resetAt };
    },
  };
}

/** Hash an IP for use as a rate-limit key. Never store or log the raw address. */
export function ipKey(ip) {
  if (!ip) return "unknown";
  return createHmac("sha256", "richenquest.ratelimit.ip.v1").update(ip).digest("hex").slice(0, 24);
}
