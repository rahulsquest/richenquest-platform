/**
 * Zoho OAuth token manager — production access-token lifecycle.
 *
 * The refresh token (long-lived, in .env / Catalyst env) is exchanged for a
 * short-lived access token, which is cached in memory until shortly before it
 * expires, then transparently refreshed. Callers never think about tokens.
 *
 * A pluggable cache is supported so a Catalyst function can share tokens across
 * invocations (e.g. Catalyst Cache); the default is per-process memory, which
 * is correct and safe — worst case is one extra refresh on a cold start.
 */

import { getOAuthConfig, getDataCentre, redact } from "./config.mjs";
import { fetchWithTimeout, parseJson, ZohoError } from "./http.mjs";

const EXPIRY_BUFFER_MS = 60_000; // refresh a minute early to avoid edge races

function memoryCache() {
  let entry = { token: null, expiresAt: 0 };
  return {
    get: () => entry,
    set: (token, ttlMs) => {
      entry = { token, expiresAt: Date.now() + ttlMs };
    },
    clear: () => {
      entry = { token: null, expiresAt: 0 };
    },
  };
}

let cache = memoryCache();

/** Swap in a custom cache (must implement get/set/clear). */
export function setTokenCache(custom) {
  cache = custom;
}

/**
 * Returns a valid access token, refreshing when needed.
 * @param {{forceRefresh?: boolean}} [opts]
 */
export async function getAccessToken({ forceRefresh = false } = {}) {
  const now = Date.now();
  const current = cache.get();
  if (!forceRefresh && current.token && now < current.expiresAt - EXPIRY_BUFFER_MS) {
    return current.token;
  }

  const { clientId, clientSecret, refreshToken, dc } = getOAuthConfig();
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });

  const res = await fetchWithTimeout(`${dc.accounts}/oauth/v2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await parseJson(res);

  if (!res.ok || json.error) {
    // json.error is a short code like "invalid_client" — safe to surface.
    throw new ZohoError(`Token refresh failed: ${json.error || res.status}`, {
      status: res.status,
      code: json.error || "refresh_failed",
    });
  }

  const ttlMs = (Number(json.expires_in) || 3600) * 1000;
  cache.set(json.access_token, ttlMs);
  return json.access_token;
}

/**
 * Exchange a one-time authorization CODE for tokens (the token-exchange flow used
 * by exchange-code.mjs). Testable (fetch is stubbable). Returns the token JSON
 * (incl. refresh_token) or throws with the error code.
 */
export async function exchangeAuthCode(code, { clientId, clientSecret, redirectUri, dc } = {}) {
  const cfg = {
    clientId: clientId ?? process.env.ZOHO_CLIENT_ID,
    clientSecret: clientSecret ?? process.env.ZOHO_CLIENT_SECRET,
    redirectUri: redirectUri ?? process.env.ZOHO_REDIRECT_URI,
    dc: dc ?? getDataCentre(),
  };
  if (!code) throw new ZohoError("Missing authorization code", { code: "missing_code" });
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uri: cfg.redirectUri,
    code,
  });
  const res = await fetchWithTimeout(`${cfg.dc.accounts}/oauth/v2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await parseJson(res);
  if (!res.ok || json.error) {
    throw new ZohoError(`Auth-code exchange failed: ${json.error || res.status}`, { status: res.status, code: json.error || "exchange_failed" });
  }
  return json;
}

/** Forces a refresh and reports success without ever printing the token. */
export async function verifyToken() {
  const token = await getAccessToken({ forceRefresh: true });
  const { expiresAt } = cache.get();
  return {
    ok: true,
    tokenPreview: redact(token),
    expiresInSeconds: Math.round((expiresAt - Date.now()) / 1000),
  };
}
