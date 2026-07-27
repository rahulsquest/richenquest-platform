/**
 * Zoho configuration + data-centre resolution. Server-side only.
 *
 * Reads everything from process.env — NEVER from a file it loads itself, so the
 * same code works locally (`node --env-file=.env …`) and inside a Catalyst
 * function (env injected by the platform). No secret is ever hard-coded or logged.
 *
 * The data centre MUST match where the API-console application was created:
 *   api-console.zoho.in  → "in"   ·  api-console.zoho.com → "us"
 *   api-console.zoho.eu  → "eu"   ·  .com.au → "au" · .jp → "jp" · zohocloud.ca → "ca"
 * RichenQuest uses Zoho One India DC (File 00), so the default is "in".
 */

/** Per-DC hosts. Accounts host issues tokens; each service has its own API host. */
const DATA_CENTERS = {
  us: { accounts: "https://accounts.zoho.com",     api: "https://www.zohoapis.com",     analytics: "https://analyticsapi.zoho.com",     mail: "https://mail.zoho.com",     salesiq: "https://salesiq.zoho.com" },
  eu: { accounts: "https://accounts.zoho.eu",      api: "https://www.zohoapis.eu",      analytics: "https://analyticsapi.zoho.eu",      mail: "https://mail.zoho.eu",      salesiq: "https://salesiq.zoho.eu" },
  in: { accounts: "https://accounts.zoho.in",      api: "https://www.zohoapis.in",      analytics: "https://analyticsapi.zoho.in",      mail: "https://mail.zoho.in",      salesiq: "https://salesiq.zoho.in" },
  au: { accounts: "https://accounts.zoho.com.au",  api: "https://www.zohoapis.com.au",  analytics: "https://analyticsapi.zoho.com.au",  mail: "https://mail.zoho.com.au",  salesiq: "https://salesiq.zoho.com.au" },
  jp: { accounts: "https://accounts.zoho.jp",      api: "https://www.zohoapis.jp",      analytics: "https://analyticsapi.zoho.jp",      mail: "https://mail.zoho.jp",      salesiq: "https://salesiq.zoho.jp" },
  ca: { accounts: "https://accounts.zohocloud.ca", api: "https://www.zohoapis.ca",      analytics: "https://analyticsapi.zohocloud.ca", mail: "https://mail.zohocloud.ca", salesiq: "https://salesiq.zohocloud.ca" },
};

export const DEFAULT_DC = "in";

export function getDataCentre(code = process.env.ZOHO_DC || DEFAULT_DC) {
  const dc = DATA_CENTERS[String(code).toLowerCase()];
  if (!dc) {
    throw new Error(
      `Unknown ZOHO_DC "${code}". Use one of: ${Object.keys(DATA_CENTERS).join(", ")}.`
    );
  }
  return dc;
}

/**
 * Per-service API base URLs for the current DC. CRM is high-confidence; the
 * others are the documented bases but should be confirmed against Zoho's
 * current API reference before first live call (noted in docs/14 §11).
 */
export const DEFAULT_CRM_VERSION = "v7";

/**
 * @param {string} service
 * @param {string} [code]     data-centre code
 * @param {string} [version]  CRM API version ("v7" default, "v8" for endpoints
 *   only present in v8 — e.g. /settings/automation/workflow_rules, which
 *   returns API_NOT_SUPPORTED{supported_version:8} on v7).
 */
export function serviceBase(service, code, version) {
  const dc = getDataCentre(code);
  switch (service) {
    case "crm":       return `${dc.api}/crm/${version ?? DEFAULT_CRM_VERSION}`;
    case "bookings":  return `${dc.api}/bookings/v1`;
    case "forms":     return `${dc.api}/forms/api/v1`;
    case "mail":      return `${dc.mail}/api`;
    case "analytics": return `${dc.analytics}/restapi/v2`;
    case "salesiq":   return `${dc.salesiq}/api/v2`;
    default:
      throw new Error(`No API base for service "${service}".`);
  }
}

/** Throws a single clear error naming any MISSING vars — never prints values. */
export function requireEnv(keys) {
  const missing = keys.filter((k) => !process.env[k] || process.env[k].trim() === "");
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(", ")}. ` +
        `See .env.example and docs/14-zoho-integration.md §10.`
    );
  }
}

/** OAuth credentials for token operations. Presence-checked, never logged. */
export function getOAuthConfig() {
  requireEnv(["ZOHO_CLIENT_ID", "ZOHO_CLIENT_SECRET", "ZOHO_REFRESH_TOKEN"]);
  return {
    clientId: process.env.ZOHO_CLIENT_ID,
    clientSecret: process.env.ZOHO_CLIENT_SECRET,
    refreshToken: process.env.ZOHO_REFRESH_TOKEN,
    dc: getDataCentre(),
  };
}

/** Redacts anything token/secret-shaped so it is safe to include in logs. */
export function redact(value) {
  if (value == null) return value;
  const s = String(value);
  return s.replace(/(1000\.[a-z0-9]{6})[a-z0-9.]+/gi, "$1…").replace(/(client_secret=)[^&\s]+/gi, "$1…");
}
