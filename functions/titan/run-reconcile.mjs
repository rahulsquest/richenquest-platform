/**
 * Reconciliation runner (CLI). Dry-run by default: queries live CRM via COQL
 * and reports what the event path would have missed, WITHOUT invoking handlers
 * or writing anything.
 *
 *   node --env-file=.env functions/titan/run-reconcile.mjs            # dry-run (read-only)
 *   node --env-file=.env functions/titan/run-reconcile.mjs --commit   # process missed records
 *
 * In production this logic runs as a Catalyst Cron function on the same
 * runtime.mjs wiring; this CLI exists for local verification and manual
 * backfills.
 */

import { buildRuntime } from "./runtime.mjs";

async function main() {
  const commit = process.argv.includes("--commit");
  const { reconciler } = await buildRuntime({ level: "warn" });

  console.log(`\nReconciliation sweep — ${commit ? "COMMIT" : "DRY-RUN (read-only)"}\n`);
  const summary = await reconciler.sweep({ dryRun: !commit });

  for (const [module, m] of Object.entries(summary.modules)) {
    if (m.error) { console.log(`  ✗ ${module}: ${m.error}`); continue; }
    console.log(`  ${module.padEnd(8)} scanned=${m.scanned} missed=${m.missed} duplicates=${m.duplicates} failed=${m.failed}`);
  }
  console.log(`\n  TOTAL scanned=${summary.scanned} missed=${summary.missed} duplicates=${summary.duplicates} failed=${summary.failed}`);
  console.log(`  ${summary.missed > 0 ? `⚠ ${summary.missed} record(s) the event path did not deliver` : "✓ no gap between event path and CRM"}\n`);
  process.exit(summary.failed ? 1 : 0);
}

main().catch((err) => { console.error(`✗ reconciliation error: ${err.message}`); process.exit(1); });
