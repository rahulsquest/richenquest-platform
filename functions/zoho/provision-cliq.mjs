/**
 * Cliq channel provisioning (AM0.8) — creates the operational channels the
 * automation layer posts into.
 *
 * ⚠️ Cliq permits duplicate channel names and offers NO delete API, so this
 * script lists existing channels first and creates only what is missing. If the
 * list cannot be read (missing ZohoCliq.Channels.READ) it ABORTS rather than
 * creating blind — an unverified create is unrecoverable without human UI work.
 *
 *   node --env-file=.env functions/zoho/provision-cliq.mjs            # dry-run
 *   node --env-file=.env functions/zoho/provision-cliq.mjs --commit   # create
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { provisionChannels } from "./services/cliq.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** PURE: the channel set, sourced from tenant config with a documented default. */
export function planChannels(tenant) {
  return tenant.cliq_channels ?? [
    { name: "leads", description: "New lead notifications (AM0.4 WF1)" },
    { name: "wins", description: "Agreement signed / offer / visa approved (AM0.4 WF3)" },
    { name: "finance-approvals", description: "Finance approval requests" },
    { name: "ops-alerts", description: "Automation heartbeats + failure alerts (AM0.4)" },
    { name: "daily-updates", description: "Daily team standup + digests" },
  ];
}

async function main() {
  const commit = process.argv.includes("--commit");
  const tenant = JSON.parse(await readFile(path.join(ROOT, "config/tenant-richenquest.json"), "utf8"));
  const plan = planChannels(tenant);

  console.log(`\nCliq channel provisioning — ${commit ? "COMMIT" : "DRY-RUN"}\n`);
  const summary = await provisionChannels(plan, { commit, log: (m) => console.log(m) });
  console.log(`\nSummary: ${JSON.stringify(summary)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => { console.error(`✗ cliq provisioning error: ${err.message}`); process.exit(1); });
}
