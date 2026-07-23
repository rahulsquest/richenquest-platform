/**
 * Generic authenticated Zoho API request — the shared engine every service
 * client uses. Handles: per-DC/per-service base URL, OAuth header, query
 * building, JSON in/out, a one-time transparent retry on 401 (token rotated
 * server-side), and normalized errors. Never logs tokens.
 */

import { serviceBase } from "./config.mjs";
import { getAccessToken } from "./oauth.mjs";
import { fetchWithTimeout, parseJson, ZohoError } from "./http.mjs";

/**
 * @param {string} service  one of: crm, bookings, forms, mail, analytics, salesiq
 * @param {string} path     path under the service base, e.g. "/Leads/upsert"
 * @param {object} [opts]   { method, query, body, headers, form, raw }
 *   - body: JSON-serialized unless `form` (URLSearchParams) is given
 *   - raw:  return the Response instead of parsed JSON (for exports/downloads)
 *   - apiVersion: CRM API version override, e.g. "v8" for workflow-rule
 *     endpoints that do not exist on v7
 */
export async function zohoRequest(service, path, opts = {}) {
  const { method = "GET", query, body, form, headers = {}, raw = false, apiVersion } = opts;
  const base = serviceBase(service, undefined, apiVersion);
  const url = new URL(base + path);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, v);
    }
  }

  const send = async (token) => {
    const finalHeaders = { Authorization: `Zoho-oauthtoken ${token}`, ...headers };
    let payload;
    if (form) {
      finalHeaders["content-type"] = "application/x-www-form-urlencoded";
      payload = form instanceof URLSearchParams ? form : new URLSearchParams(form);
    } else if (body !== undefined) {
      finalHeaders["content-type"] = finalHeaders["content-type"] || "application/json";
      payload = typeof body === "string" ? body : JSON.stringify(body);
    }
    return fetchWithTimeout(url.toString(), { method, headers: finalHeaders, body: payload });
  };

  let token = await getAccessToken();
  let res = await send(token);
  if (res.status === 401) {
    token = await getAccessToken({ forceRefresh: true });
    res = await send(token);
  }

  if (raw) {
    if (!res.ok) throw new ZohoError(`${service} ${method} ${path} → ${res.status}`, { status: res.status, service });
    return res;
  }

  const json = await parseJson(res);
  if (!res.ok) {
    const code = json.code || json.error || `http_${res.status}`;
    const message = json.message || json.raw || `${service} request failed`;
    throw new ZohoError(`${service} ${method} ${path}: ${message}`, { status: res.status, code, service });
  }
  return json;
}
