/**
 * Zoho CRM change-notification (watch) client — ADR-006.
 *
 * CRM pushes record events to our HTTPS endpoint; our code owns the behaviour.
 * This replaces console-configured workflow rules as the automation mechanism,
 * because workflow rules cannot be provisioned via API (see
 * docs/automation-specs/AM0.4-automation-proofs.md §2).
 *
 * Scope required: ZohoCRM.notifications.ALL
 * API version: v8 (endpoint exists on v7 too; v8 is the documented surface).
 *
 * ⚠️ Channels EXPIRE. A lapsed channel stops automation silently — there is no
 * error, events simply stop arriving. Renewal is mandatory; see
 * `planRenewals()` and config/automation-events.json → renewal_hours.
 */

import { zohoRequest } from "../client.mjs";

const API_VERSION = "v8";

/** List active notification channels. Returns [] when none exist (HTTP 204). */
export async function listWatches() {
  const json = await zohoRequest("crm", "/actions/watch", { apiVersion: API_VERSION });
  return (json.watch ?? []).map((w) => ({
    channel_id: String(w.channel_id),
    events: w.events ?? [],
    notify_url: w.notify_url,
    // Zoho returns ISO-8601 with offset; keep the raw string for evidence and
    // a parsed timestamp for expiry maths.
    expiry: w.channel_expiry,
    expiresAt: w.channel_expiry ? Date.parse(w.channel_expiry) : null,
  }));
}

/** Subscribe or re-subscribe channels. `watches` is the full desired payload. */
export async function createWatches(watches) {
  const json = await zohoRequest("crm", "/actions/watch", {
    method: "POST", apiVersion: API_VERSION, body: { watch: watches },
  });
  return (json.watch ?? []).map((r) => ({ ok: r.status === "success", code: r.code, id: r.details?.channel_id }));
}

/** Remove channels by id — the rollback path for a bad subscription. */
export async function deleteWatches(channelIds) {
  const json = await zohoRequest("crm", "/actions/watch", {
    method: "DELETE", apiVersion: API_VERSION, query: { channel_ids: channelIds.join(",") },
  });
  return (json.watch ?? []).map((r) => ({ ok: r.status === "success", code: r.code }));
}

/**
 * PURE. Compute the exact delta between desired subscriptions and live channels.
 * Returns only what must change — never a blanket re-subscribe.
 *
 * @param {object} config   config/automation-events.json
 * @param {Array}  live     result of listWatches()
 * @param {string} notifyUrl  environment-specific endpoint
 * @param {number} now      epoch ms (injectable for deterministic tests)
 */
export function planWatches(config, live, notifyUrl, now = Date.now()) {
  if (!notifyUrl) throw new Error("notify_url is required (set ZOHO_NOTIFY_URL).");
  if (!/^https:\/\//.test(notifyUrl)) throw new Error(`notify_url must be HTTPS, got "${notifyUrl}".`);

  const byId = new Map(live.map((w) => [String(w.channel_id), w]));
  const renewalMs = (config.renewal_hours ?? 6) * 3600_000;
  const plan = [];

  for (const sub of config.subscriptions) {
    const id = String(sub.channel_id);
    const cur = byId.get(id);
    const events = [...sub.events].sort();

    if (!cur) { plan.push({ ...sub, action: "create", reason: "not subscribed" }); continue; }

    const eventsDiffer = JSON.stringify([...cur.events].sort()) !== JSON.stringify(events);
    const urlDiffers = cur.notify_url !== notifyUrl;
    // Renew when the channel would lapse before the next renewal window.
    const expiringSoon = cur.expiresAt != null && cur.expiresAt - now < renewalMs;

    if (eventsDiffer || urlDiffers) {
      plan.push({ ...sub, action: "update", reason: eventsDiffer ? "events changed" : "notify_url changed" });
    } else if (expiringSoon) {
      plan.push({ ...sub, action: "renew", reason: `expires in ${Math.round((cur.expiresAt - now) / 60000)}min` });
    } else {
      plan.push({ ...sub, action: "keep" });
    }
  }

  // Channels live in CRM that our config does not declare = undocumented drift.
  const declared = new Set(config.subscriptions.map((s) => String(s.channel_id)));
  const orphans = live.filter((w) => !declared.has(String(w.channel_id))).map((w) => w.channel_id);

  return { plan, orphans };
}

/** Build the API payload for one planned subscription. */
export function toWatchPayload(sub, notifyUrl, expiryHours) {
  return {
    channel_id: String(sub.channel_id),
    events: sub.events,
    notify_url: notifyUrl,
    channel_expiry: new Date(Date.now() + expiryHours * 3600_000).toISOString(),
    // Echoed back by Zoho on every delivery so the handler can authenticate it.
    token: `rq-${sub.name}`,
  };
}
