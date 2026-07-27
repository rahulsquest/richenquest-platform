/**
 * Dashboard configuration reader.
 *
 * Config is published as inert JSON by components/platform-config.html, sourced
 * from data/platform.json. Nothing here hard-codes an origin.
 *
 * An unset base_url is a first-class state, not an error: the dashboard renders
 * its "not configured" gate and issues no requests. It must never fall back to
 * sample data — a student cannot tell invented history from real history, and a
 * record they cannot trust is worse than no dashboard.
 */

let cached = null;

/** Raw config object; {} when absent or malformed. */
export function getPlatformConfig(doc = globalThis.document) {
  if (cached) return cached;
  const node = doc?.getElementById?.("rq-platform");
  if (!node) return (cached = {});
  try {
    cached = JSON.parse(node.textContent) ?? {};
  } catch {
    cached = {};
  }
  return cached;
}

/** Test seam: drop the memoised config. */
export function resetPlatformConfig() {
  cached = null;
}

/**
 * Defence in depth. Config is repo-controlled, but a misconfiguration must not
 * become the thing that ships session tokens to an attacker-chosen origin.
 * https only, except loopback for local development.
 */
export function isAllowedApiOrigin(value) {
  if (!value) return false;
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol === "http:" && loopback) return true;
  if (url.protocol !== "https:") return false;
  // A base that already carries a path, query or fragment means someone has
  // configured an endpoint rather than an origin; the client builds its own
  // paths, so accepting it would silently produce wrong URLs.
  return url.pathname === "/" && !url.search && !url.hash;
}

const toInt = (value, fallback) => {
  const n = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

/** Normalised settings the app actually consumes. */
export function readSettings(doc = globalThis.document) {
  const cfg = getPlatformConfig(doc);
  const rawBase = String(cfg.recordApi?.baseUrl ?? "").trim().replace(/\/+$/, "");
  // The operations console talks to a different service from the student
  // dashboard, so it gets its own origin. They may be the same host in
  // production; nothing here assumes it.
  const rawOps = String(cfg.opsApi?.baseUrl ?? "").trim().replace(/\/+$/, "");

  return {
    apiBaseUrl: isAllowedApiOrigin(rawBase) ? rawBase : "",
    apiConfigured: isAllowedApiOrigin(rawBase),
    // A configured-but-rejected origin is a build mistake worth surfacing rather
    // than treating identically to "not configured yet".
    apiRejected: rawBase !== "" && !isAllowedApiOrigin(rawBase),

    opsBaseUrl: isAllowedApiOrigin(rawOps) ? rawOps : "",
    opsConfigured: isAllowedApiOrigin(rawOps),
    opsRejected: rawOps !== "" && !isAllowedApiOrigin(rawOps),

    timeoutMs: toInt(cfg.recordApi?.timeoutMs, 15_000),
    signInUrl: String(cfg.session?.signInUrl ?? "/contact/"),
    warnBeforeExpiryMs: toInt(cfg.session?.warnBeforeExpirySeconds, 120) * 1000,
  };
}
