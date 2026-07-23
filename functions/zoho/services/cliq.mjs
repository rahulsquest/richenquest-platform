/**
 * Zoho Cliq client — channels + webhook posting.
 *
 * Cliq is where the automation layer talks to humans: workflow heartbeats
 * (#ops-alerts), lead alerts (#leads), wins (#wins).
 *
 * ⚠️ Cliq channel creation is NOT idempotent. POST /channels with an existing
 * name succeeds and creates a SECOND channel with the same display name and a
 * new id — verified live 2026-07-23. There is also NO delete endpoint (DELETE
 * returns request_url_invalid), so a duplicate can only be removed by a human in
 * the Cliq UI. Therefore callers MUST list existing channels and create only
 * what is missing; `provisionChannels` enforces that and refuses to guess.
 *
 * Scopes: ZohoCliq.Channels.CREATE (create) · ZohoCliq.Channels.READ (list).
 * CREATE does NOT imply READ — listing needs its own scope.
 */

import { getAccessToken } from "../oauth.mjs";
import { getDataCentre } from "../config.mjs";
import { fetchWithTimeout, parseJson, ZohoError } from "../http.mjs";

/** Cliq lives on its own host per DC (cliq.zoho.in / .com / .eu …). */
export function cliqBase(code) {
  const dc = getDataCentre(code);
  // Derive the Cliq host from the accounts host's TLD suffix.
  const suffix = dc.accounts.replace("https://accounts.zoho", "").replace("https://accounts.zohocloud", "cloud");
  return `https://cliq.zoho${suffix}/api/v2`;
}

async function cliqRequest(path, { method = "GET", body } = {}) {
  const token = await getAccessToken();
  const res = await fetchWithTimeout(`${cliqBase()}${path}`, {
    method,
    headers: { Authorization: `Zoho-oauthtoken ${token}`, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await parseJson(res);
  if (!res.ok) {
    throw new ZohoError(`cliq ${method} ${path}: ${json.custom_i18n_message || json.message || res.status}`, {
      status: res.status, code: json.code, service: "cliq",
    });
  }
  return json;
}

/**
 * List existing channels. Requires ZohoCliq.Channels.READ.
 * @returns {Promise<Array<{name:string,id:string}>>}
 */
export async function listChannels() {
  const json = await cliqRequest("/channels");
  return (json.channels ?? json.data ?? []).map((c) => ({
    // Cliq returns names with a leading "#"; normalise so comparisons are safe.
    name: String(c.name ?? "").replace(/^#/, ""),
    id: c.id ?? c.chat_id,
  }));
}

/**
 * Create one organization-level channel. NOT idempotent — see the file header.
 * Never call this without first confirming the channel is absent.
 */
export async function createChannel(name, description, { level = "organization" } = {}) {
  const json = await cliqRequest("/channels", { method: "POST", body: { name, description, level } });
  return { created: true, name: String(json.name ?? name).replace(/^#/, ""), id: json.id ?? json.chat_id };
}

/**
 * Safe provisioning: list first, create ONLY what is missing.
 * Throws if the channel list cannot be read — because creating blind risks
 * permanent duplicates that no API can remove.
 */
export async function provisionChannels(channels, { commit = false, log = () => {} } = {}) {
  let existing;
  try {
    existing = await listChannels();
  } catch (err) {
    throw new ZohoError(
      `Cannot list Cliq channels (${err.message}). Refusing to create blind: Cliq allows duplicate ` +
        `names and provides no delete API, so an unverified create is unrecoverable. ` +
        `Grant ZohoCliq.Channels.READ and retry.`,
      { code: "cliq_read_required", service: "cliq" }
    );
  }
  const have = new Set(existing.map((c) => c.name.toLowerCase()));
  const summary = { created: 0, existing: 0, wouldCreate: 0 };
  for (const ch of channels) {
    if (have.has(ch.name.toLowerCase())) { log(`  = exists   #${ch.name}`); summary.existing++; continue; }
    if (!commit) { log(`  + would create  #${ch.name}`); summary.wouldCreate++; continue; }
    const r = await createChannel(ch.name, ch.description);
    log(`  ✓ created  #${r.name}`);
    summary.created++;
  }
  return summary;
}

/** Post a message to a channel by name (used for #ops-alerts heartbeats). */
export async function postToChannel(channelName, text) {
  return cliqRequest(`/channelsbyname/${encodeURIComponent(channelName)}/message`, {
    method: "POST", body: { text },
  });
}
