/**
 * Autonomous CRM field provisioning (AM0.4, API-addressable part).
 * Reads config/crm-schema.json + config/tenant-richenquest.json and creates the
 * custom fields/picklists via the Zoho CRM settings API — no console clicking.
 *
 * Core logic (plan/execute) is pure and takes an injectable `api`, so the whole
 * engine is unit-tested against a mock Zoho with no network/token (zoho.test.mjs).
 *
 * Modes (safe by default = DRY-RUN; --commit performs writes):
 *   node --env-file=.env functions/zoho/provision-crm.mjs                # dry-run provision
 *   node --env-file=.env functions/zoho/provision-crm.mjs --commit       # create + verify + retry
 *   node --env-file=.env functions/zoho/provision-crm.mjs --rollback     # dry-run rollback
 *   node --env-file=.env functions/zoho/provision-crm.mjs --rollback --commit  # delete created fields
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getFields, createField, deleteField } from "./services/crm-settings.mjs";
import { retryAsync } from "./http.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
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

/** PURE: decide create / skip(exists) / manual per field. `existing` = getFields() array. */
export function planProvision(schema, tenant, existingByModule) {
  const plan = {};
  for (const [module, defs] of Object.entries(schema.modules)) {
    const have = new Set((existingByModule[module] ?? []).map((f) => f.field_label.toLowerCase()));
    plan[module] = defs.map((def) => {
      if (def.manual) return { label: def.label, action: "manual", reason: def.manual_reason };
      if (have.has(def.label.toLowerCase())) return { label: def.label, action: "skip" };
      return { label: def.label, action: "create", def: { ...def, values: resolveValues(def, tenant) } };
    });
  }
  return plan;
}

/** PURE: decide delete / absent per schema field (reverse of provision). */
export function planRollback(schema, existingByModule) {
  const plan = {};
  for (const [module, defs] of Object.entries(schema.modules)) {
    const byLabel = new Map((existingByModule[module] ?? []).map((f) => [f.field_label.toLowerCase(), f]));
    plan[module] = defs
      .filter((d) => !d.manual)
      .map((def) => {
        const f = byLabel.get(def.label.toLowerCase());
        return f && f.custom_field ? { label: def.label, action: "delete", id: f.id } : { label: def.label, action: "absent" };
      });
  }
  return plan;
}

const RETRYABLE = new Set(["INTERNAL_ERROR", "RATE_LIMIT_EXCEEDED", "REQUEST_TIMEOUT"]);

/** Execute a provision plan. `api` = {getFields,createField}. Retries transient failures. */
export async function executeProvision(plan, api, { commit = false, tries = 3, delayMs = 400, log = () => {} } = {}) {
  const summary = { created: 0, skipped: 0, manual: 0, failed: 0, wouldCreate: 0 };
  for (const [module, items] of Object.entries(plan)) {
    for (const item of items) {
      if (item.action === "manual") { log(`  ↷ MANUAL  ${item.label} (${item.reason})`); summary.manual++; continue; }
      if (item.action === "skip") { log(`  = exists  ${item.label}`); summary.skipped++; continue; }
      if (!commit) { log(`  + would create  ${item.label} [${item.def.type}]`); summary.wouldCreate++; continue; }
      try {
        const res = await retryAsync(
          async () => {
            const r = await api.createField(module, item.def);
            if (!r.ok && RETRYABLE.has(r.code)) throw new Error(`retryable ${r.code}`);
            return r;
          },
          { tries, delayMs, onRetry: (e, a) => log(`  ↻ retry ${item.label} (attempt ${a}: ${e.message})`) }
        );
        if (res.ok) {
          const after = await api.getFields(module);
          const verified = after.some((f) => f.field_label.toLowerCase() === item.label.toLowerCase());
          log(`  ${verified ? "✓ created " : "⚠ unverified "} ${item.label} → ${res.api_name}`);
          verified ? summary.created++ : summary.failed++;
        } else {
          log(`  ✗ FAILED  ${item.label}: ${res.code} ${res.message}`);
          summary.failed++;
        }
      } catch (err) {
        log(`  ✗ FAILED  ${item.label}: ${err.message}`);
        summary.failed++;
      }
    }
  }
  return summary;
}

/** Execute a rollback plan. `api` = {deleteField,getFields}. */
export async function executeRollback(plan, api, { commit = false, tries = 3, delayMs = 400, log = () => {} } = {}) {
  const summary = { deleted: 0, absent: 0, failed: 0, wouldDelete: 0 };
  for (const [module, items] of Object.entries(plan)) {
    for (const item of items) {
      if (item.action === "absent") { summary.absent++; continue; }
      if (!commit) { log(`  - would delete  ${item.label} (${item.id})`); summary.wouldDelete++; continue; }
      try {
        const res = await retryAsync(() => api.deleteField(module, item.id), { tries, delayMs });
        if (res.ok) { log(`  ✓ deleted  ${item.label}`); summary.deleted++; }
        else { log(`  ✗ FAILED  ${item.label}: ${res.code}`); summary.failed++; }
      } catch (err) {
        log(`  ✗ FAILED  ${item.label}: ${err.message}`); summary.failed++;
      }
    }
  }
  return summary;
}

async function main() {
  const commit = process.argv.includes("--commit");
  const rollback = process.argv.includes("--rollback");
  const tenant = await readJson("config/tenant-richenquest.json");
  const schema = await readJson("config/crm-schema.json");
  const api = { getFields, createField, deleteField };
  const log = (m) => console.log(m);

  console.log(`\nCRM ${rollback ? "ROLLBACK" : "provisioning"} — ${commit ? "COMMIT" : "DRY-RUN"} (tenant ${tenant.tenant.id}, DC ${tenant.tenant.dc})\n`);

  const existingByModule = {};
  for (const module of Object.keys(schema.modules)) existingByModule[module] = await getFields(module);

  let summary;
  if (rollback) {
    summary = await executeRollback(planRollback(schema, existingByModule), api, { commit, log });
  } else {
    summary = await executeProvision(planProvision(schema, tenant, existingByModule), api, { commit, log });
  }
  console.log(`\nSummary: ${JSON.stringify(summary)}`);
  console.log(`Console-only (not handled here): ${schema.console_only.items.join(" · ")}\n`);
  process.exit(summary.failed ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`✗ provisioning error: ${err.message}`);
    console.error("  (If this is an auth error, generate the OAuth token first — see docs/14 §11.)");
    process.exit(1);
  });
}
