/**
 * Zoho Flow trigger — fire a Flow via its incoming-webhook URL.
 *
 * HONEST SCOPE: Zoho Flow has no REST CRUD API you "call" like CRM. Flows are
 * TRIGGERED — either by Zoho app events (configured inside Flow, no code) or by
 * an incoming webhook. This helper posts a JSON payload to a Flow webhook URL,
 * which is how a Catalyst function hands work to Flow.
 *
 * The webhook URL is NOT a secret in the OAuth sense, but it is capability-
 * bearing, so it lives in env (ZOHO_FLOW_WEBHOOK_URL) and is host-validated —
 * never hard-coded. No OAuth token is used or needed for webhook triggering.
 */

import { fetchWithTimeout, parseJson, ZohoError } from "../http.mjs";

const FLOW_HOST = /(^|\.)zoho(flow)?\.(com|in|eu|com\.au|jp)$|(^|\.)zohocloud\.ca$|(^|\.)zapikey/i;

function assertFlowUrl(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    throw new Error("ZOHO_FLOW_WEBHOOK_URL is not a valid URL.");
  }
  if (u.protocol !== "https:" || !FLOW_HOST.test(u.hostname)) {
    throw new Error("ZOHO_FLOW_WEBHOOK_URL must be an https Zoho Flow webhook URL.");
  }
  return u.toString();
}

/**
 * Trigger a Flow with a JSON payload.
 * @param {object} payload
 * @param {string} [webhookUrl]  defaults to process.env.ZOHO_FLOW_WEBHOOK_URL
 */
export async function triggerFlow(payload, webhookUrl = process.env.ZOHO_FLOW_WEBHOOK_URL) {
  if (!webhookUrl) throw new Error("No Flow webhook URL (set ZOHO_FLOW_WEBHOOK_URL).");
  const url = assertFlowUrl(webhookUrl);
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload ?? {}),
  });
  const json = await parseJson(res);
  if (!res.ok) {
    throw new ZohoError(`Flow trigger failed: ${res.status}`, { status: res.status, service: "flow" });
  }
  return json;
}
