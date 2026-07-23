/**
 * Team user provisioning (AM0.2) — creates CRM users from the tenant roster,
 * mapping each contributor's crm_role to a Zoho role + profile.
 *
 * GATED: a user cannot be created without an email, and creating one emails a
 * real person. Members whose roster entry has no `email` are reported "blocked"
 * and never created. Add emails to config/tenant-richenquest.json → contributors
 * .roster[].email, then run with --commit.
 *
 *   node --env-file=.env functions/zoho/provision-users.mjs            # dry-run
 *   node --env-file=.env functions/zoho/provision-users.mjs --commit   # create
 *
 * Idempotent: an email already present as an active/invited user is skipped.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { zohoRequest } from "./client.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Split a display name into Zoho's first/last (last_name is mandatory). */
export function splitName(name) {
  const parts = String(name).trim().split(/\s+/);
  return parts.length > 1 ? { first_name: parts[0], last_name: parts.slice(1).join(" ") } : { first_name: "", last_name: parts[0] };
}

/** crm_role "Manager / Operations" → base role "Manager". */
export function baseRole(crmRole) {
  return String(crmRole || "").split("/")[0].trim();
}

/**
 * PURE. Plan user creation.
 * @param {Array} roster            contributors.roster
 * @param {Array} existing          live users (need .email)
 * @param {Map<string,string>} roleIdByName
 * @param {Map<string,string>} profileIdByName
 * @param {(m:object)=>string} profilePolicy  member → profile name (permissions)
 */
export function planUsers(roster, existing, roleIdByName, profileIdByName, profilePolicy) {
  const haveEmail = new Set(existing.map((u) => (u.email || "").toLowerCase()).filter(Boolean));
  return roster.map((m) => {
    if (!m.email) return { name: m.name, action: "blocked", reason: "no email in roster" };
    if (haveEmail.has(m.email.toLowerCase())) return { name: m.name, email: m.email, action: "exists" };

    const roleName = baseRole(m.crm_role);
    const roleId = roleIdByName.get(roleName);
    if (!roleId) return { name: m.name, action: "blocked", reason: `no CRM role "${roleName}" (from crm_role "${m.crm_role}")` };

    const profileName = profilePolicy(m);
    const profileId = profileIdByName.get(profileName);
    if (!profileId) return { name: m.name, action: "blocked", reason: `no profile "${profileName}"` };

    return {
      name: m.name, email: m.email, action: "create", roleName, profileName,
      payload: { ...splitName(m.name), email: m.email, role: { id: roleId }, profile: { id: profileId } },
    };
  });
}

/** Least privilege: only the CEO gets Administrator; everyone else Standard. */
export const defaultProfilePolicy = (m) => (baseRole(m.crm_role) === "CEO" ? "Administrator" : "Standard");

/** Execute a plan. `api` = { createUser(payload) } — injectable for tests. */
export async function executeUsers(plan, api, { commit = false, log = () => {} } = {}) {
  const summary = { created: 0, exists: 0, blocked: 0, failed: 0, wouldCreate: 0 };
  for (const item of plan) {
    if (item.action === "blocked") { log(`  ⛔ ${item.name}: ${item.reason}`); summary.blocked++; continue; }
    if (item.action === "exists") { log(`  = exists   ${item.name} <${item.email}>`); summary.exists++; continue; }
    if (!commit) { log(`  + would create  ${item.name} <${item.email}> → ${item.roleName}/${item.profileName}`); summary.wouldCreate++; continue; }
    try {
      const res = await api.createUser(item.payload);
      if (res.ok) { log(`  ✓ created  ${item.name} <${item.email}> (invitation sent)`); summary.created++; }
      else { log(`  ✗ FAILED   ${item.name}: ${res.code} ${res.message}`); summary.failed++; }
    } catch (err) { log(`  ✗ FAILED   ${item.name}: ${err.message}`); summary.failed++; }
  }
  return summary;
}

async function main() {
  const commit = process.argv.includes("--commit");
  const tenant = JSON.parse(await readFile(path.join(ROOT, "config/tenant-richenquest.json"), "utf8"));

  const roles = await zohoRequest("crm", "/settings/roles");
  const profiles = await zohoRequest("crm", "/settings/profiles");
  const users = await zohoRequest("crm", "/users", { query: { type: "AllUsers" } });
  const roleIdByName = new Map((roles.roles ?? []).map((r) => [r.name, r.id]));
  const profileIdByName = new Map((profiles.profiles ?? []).map((p) => [p.name, p.id]));

  console.log(`\nUser provisioning — ${commit ? "COMMIT" : "DRY-RUN"} (${tenant.contributors.roster.length} in roster, ${users.users?.length ?? 0} live)\n`);
  const plan = planUsers(tenant.contributors.roster, users.users ?? [], roleIdByName, profileIdByName, defaultProfilePolicy);

  const api = {
    createUser: async (payload) => {
      const j = await zohoRequest("crm", "/users", { method: "POST", body: { users: [payload] } });
      const row = j.users?.[0] ?? j;
      return { ok: row?.status === "success" || row?.code === "SUCCESS", code: row?.code, message: row?.message };
    },
  };
  const summary = await executeUsers(plan, api, { commit, log: (m) => console.log(m) });
  console.log(`\nSummary: ${JSON.stringify(summary)}`);
  if (summary.blocked) console.log("\nBlocked users need an `email` in config/tenant-richenquest.json → contributors.roster.\n");
  process.exit(summary.failed ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => { console.error(`✗ user provisioning error: ${err.message}`); process.exit(1); });
}
