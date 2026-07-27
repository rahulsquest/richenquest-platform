/**
 * Event-subscription provisioning (ADR-006) — replaces console workflow rules.
 *
 * Reads config/automation-events.json, reads live channels, computes the exact
 * delta, and applies only what changed. Dry-run by default.
 *
 *   node --env-file=.env functions/zoho/provision-notifications.mjs
 *   node --env-file=.env functions/zoho/provision-notifications.mjs --commit
 *   node --env-file=.env functions/zoho/provision-notifications.mjs --rollback --commit
 *
 * Requires: ZOHO_NOTIFY_URL (public HTTPS endpoint) and the
 * ZohoCRM.notifications.ALL scope. Both are checked up-front with an explicit
 * message rather than failing deep in an API call.
 *
 * ⚠️ Channels expire (config → expiry_hours). Run this on a schedule shorter
 * than renewal_hours, or automation stops silently. `--commit` is safe to run
 * repeatedly: unchanged channels are reported "keep" and are not rewritten.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listWatches, createWatches, deleteWatches, planWatches, toWatchPayload } from "./services/notifications.mjs";
import { channelToken } from "../titan/webhook-auth.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

async function main() {
  const commit = process.argv.includes("--commit");
  const rollback = process.argv.includes("--rollback");
  const config = JSON.parse(await readFile(path.join(ROOT, "config/automation-events.json"), "utf8"));
  const notifyUrl = process.env.ZOHO_NOTIFY_URL;
  const secret = process.env.TITAN_WEBHOOK_SECRET;

  console.log(`\nEvent subscriptions — ${rollback ? "ROLLBACK" : "provisioning"} — ${commit ? "COMMIT" : "DRY-RUN"}\n`);

  if (!notifyUrl && !rollback) {
    console.error("✗ ZOHO_NOTIFY_URL is not set.\n" +
      "  Event-driven automation needs a public HTTPS endpoint (Catalyst function).\n" +
      "  Until Catalyst exists this cannot be provisioned — see ADR-006.\n");
    process.exit(2);
  }
  if (!secret && !rollback) {
    console.error("✗ TITAN_WEBHOOK_SECRET is not set.\n" +
      "  Each channel's callback token is HMAC(secret, channel_id); without the secret the\n" +
      "  webhook cannot authenticate deliveries. Generate one: openssl rand -hex 32\n");
    process.exit(2);
  }

  let live;
  try {
    live = await listWatches();
  } catch (err) {
    if (/OAUTH_SCOPE_MISMATCH|invalid oauth scope/i.test(err.message)) {
      console.error("✗ Missing scope ZohoCRM.notifications.ALL.\n" +
        "  The endpoint exists and is reachable — the current token simply lacks the scope.\n" +
        "  Re-mint the token including ZohoCRM.notifications.ALL (see ADR-006).\n");
      process.exit(2);
    }
    throw err;
  }
  console.log(`  live channels: ${live.length}`);

  if (rollback) {
    const ids = live.map((w) => w.channel_id);
    if (!ids.length) { console.log("  nothing to roll back.\n"); return; }
    if (!commit) { console.log(`  - would delete ${ids.length} channel(s): ${ids.join(", ")}\n`); return; }
    const res = await deleteWatches(ids);
    console.log(`  ✓ deleted ${res.filter((r) => r.ok).length}/${ids.length} channel(s)\n`);
    return;
  }

  const { plan, orphans } = planWatches(config, live, notifyUrl);
  for (const p of plan) {
    const mark = { create: "+", update: "~", renew: "↻", keep: "=" }[p.action];
    console.log(`  ${mark} ${p.action.padEnd(6)} ${p.name.padEnd(20)} [${p.events.join(", ")}]${p.reason ? ` — ${p.reason}` : ""}`);
  }
  if (orphans.length) console.log(`  ⚠ undeclared channels in CRM (drift): ${orphans.join(", ")}`);

  const actionable = plan.filter((p) => p.action !== "keep");
  if (!actionable.length) { console.log(`\n  ✓ no changes — all ${plan.length} subscriptions current.\n`); return; }

  if (!commit) {
    console.log(`\nDRY-RUN: ${actionable.length} change(s) pending. Re-run with --commit.\n`);
    return;
  }

  const payload = actionable.map((p) => toWatchPayload(p, notifyUrl, config.expiry_hours ?? 24, channelToken(p.channel_id, secret)));
  const res = await createWatches(payload);
  const ok = res.filter((r) => r.ok).length;
  console.log(`\n  ${ok === res.length ? "✓" : "✗"} applied ${ok}/${res.length} change(s)`);

  // Read-back verification — never trust the write response alone.
  const after = await listWatches();
  const { plan: verifyPlan } = planWatches(config, after, notifyUrl);
  const stillPending = verifyPlan.filter((p) => p.action === "create" || p.action === "update");
  console.log(`  read-back: ${after.length} live channel(s); ${stillPending.length ? `⚠ still pending: ${stillPending.map((p) => p.name).join(", ")}` : "all subscriptions verified ✓"}\n`);
  process.exit(stillPending.length ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => { console.error(`✗ notification provisioning error: ${err.message}`); process.exit(1); });
}
