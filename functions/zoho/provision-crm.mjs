/**
 * Autonomous CRM field provisioning (AM0.4, API-addressable part).
 * Reads config/crm-schema.json + config/tenant-richenquest.json and creates the
 * custom fields/picklists via the Zoho CRM settings API — no console clicking.
 *
 * Safe by default: DRY-RUN (reads current state, reports what WOULD be created).
 * Pass --commit to actually create. Idempotent: existing fields are skipped.
 * Every created field is re-read to verify.
 *
 *   node --env-file=.env functions/zoho/provision-crm.mjs           # dry-run
 *   node --env-file=.env functions/zoho/provision-crm.mjs --commit  # create + verify
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getFields, createField } from "./services/crm-settings.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const COMMIT = process.argv.includes("--commit");

const readJson = async (p) => JSON.parse(await readFile(path.join(ROOT, p), "utf8"));

/** Resolve a field def's picklist values from the tenant config (single source). */
export function resolveValues(def, tenant) {
  if (!def.values_from) return def.values ?? [];
  switch (def.values_from) {
    case "lead_types":
      return [...tenant.lead_types.active, ...tenant.lead_types.future_ready];
    case "markets":
      return [...tenant.markets.primary, ...tenant.markets.secondary, "Other"];
    case "destinations":
      return [...tenant.destinations.primary_europe, ...tenant.destinations.secondary, "Other"];
    case "service_packages":
      return tenant.service_packages;
    default:
      throw new Error(`Unknown values_from "${def.values_from}"`);
  }
}

async function main() {
  const tenant = await readJson("config/tenant-richenquest.json");
  const schema = await readJson("config/crm-schema.json");

  console.log(`\nCRM provisioning — ${COMMIT ? "COMMIT" : "DRY-RUN"} (tenant ${tenant.tenant.id}, DC ${tenant.tenant.dc})\n`);

  const summary = { created: 0, skipped: 0, manual: 0, failed: 0 };

  for (const [module, defs] of Object.entries(schema.modules)) {
    const existing = await getFields(module); // also proves live API connectivity
    const haveLabels = new Set(existing.map((f) => f.field_label.toLowerCase()));
    console.log(`── ${module} (${existing.length} existing fields) ──`);

    for (const def of defs) {
      const values = def.manual ? [] : resolveValues(def, tenant);
      const label = def.label;

      if (def.manual) {
        console.log(`  ↷ MANUAL  ${label} (${def.manual_reason})`);
        summary.manual++;
        continue;
      }
      if (haveLabels.has(label.toLowerCase())) {
        console.log(`  = exists  ${label}`);
        summary.skipped++;
        continue;
      }
      if (!COMMIT) {
        console.log(`  + would create  ${label} [${def.type}]${values.length ? ` ${values.length} values` : ""}`);
        continue;
      }
      const res = await createField(module, { ...def, values });
      if (res.ok) {
        const after = await getFields(module); // verify
        const verified = after.some((f) => f.field_label.toLowerCase() === label.toLowerCase());
        console.log(`  ${verified ? "✓ created " : "⚠ created (unverified) "} ${label} → ${res.api_name}`);
        summary.created++;
      } else {
        console.log(`  ✗ FAILED  ${label}: ${res.code} ${res.message}`);
        summary.failed++;
      }
    }
  }

  console.log(`\nSummary: created ${summary.created}, skipped(existing) ${summary.skipped}, manual ${summary.manual}, failed ${summary.failed}`);
  console.log(`Console-only (not provisioned here): ${schema.console_only.items.join(" · ")}\n`);
  process.exit(summary.failed ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`✗ provisioning error: ${err.message}`);
    console.error("  (If this is an auth error, generate the OAuth token first — see docs/14 §11.)");
    process.exit(1);
  });
}
