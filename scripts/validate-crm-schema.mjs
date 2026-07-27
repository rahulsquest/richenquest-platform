#!/usr/bin/env node
/**
 * CRM schema + pipeline config validator (CI gate, zero-dependency).
 *
 * Guards the invariants that the live provisioning engines depend on, so a bad
 * config can never reach production CRM:
 *  - every field def has a label + type; picklists resolve to non-empty values
 *  - `values_from` references a real key in the tenant config
 *  - pipeline stages: unique names, probabilities 0-100, valid deal_category,
 *    monotonic ordering, and exactly one Closed Won / one Closed Lost terminal
 *  - console_only items are declared (documentation completeness)
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => JSON.parse(readFileSync(path.join(ROOT, p), "utf8"));

const errors = [];
const fail = (m) => errors.push(m);

const schema = read("config/crm-schema.json");
const tenant = read("config/tenant-richenquest.json");

const RESOLVERS = {
  lead_types: () => [...tenant.lead_types.active, ...tenant.lead_types.future_ready],
  markets: () => [...tenant.markets.primary, ...tenant.markets.secondary, "Other"],
  destinations: () => [...tenant.destinations.primary_europe, ...tenant.destinations.secondary, "Other"],
  service_packages: () => tenant.service_packages,
};

// ---- field defs -----------------------------------------------------------
let fieldCount = 0;
for (const [module, defs] of Object.entries(schema.modules ?? {})) {
  if (!Array.isArray(defs)) { fail(`modules.${module} must be an array`); continue; }
  const seen = new Set();
  for (const d of defs) {
    fieldCount++;
    if (!d.label) fail(`${module}: a field def is missing "label"`);
    if (!d.type) fail(`${module}.${d.label}: missing "type"`);
    if (seen.has(d.label)) fail(`${module}: duplicate field label "${d.label}"`);
    seen.add(d.label);
    if (d.values_from) {
      if (!RESOLVERS[d.values_from]) fail(`${module}.${d.label}: unknown values_from "${d.values_from}"`);
      else if (RESOLVERS[d.values_from]().length === 0) fail(`${module}.${d.label}: values_from "${d.values_from}" resolves empty`);
    }
    if (/picklist/.test(d.type) && !d.values_from && !(d.values ?? []).length) {
      fail(`${module}.${d.label}: picklist has no values`);
    }
    if (d.manual && !d.manual_reason) fail(`${module}.${d.label}: manual:true requires manual_reason`);
  }
}

// ---- pipeline -------------------------------------------------------------
const CATEGORIES = new Set(["Open", "Closed Won", "Closed Lost"]);
const p = schema.pipeline;
if (!p) {
  fail("config/crm-schema.json is missing the `pipeline` section");
} else {
  const names = new Set();
  let won = 0, lost = 0;
  for (const s of p.stages ?? []) {
    if (!s.name) fail("pipeline: a stage is missing a name");
    if (names.has(s.name)) fail(`pipeline: duplicate stage "${s.name}"`);
    names.add(s.name);
    if (typeof s.probability !== "number" || s.probability < 0 || s.probability > 100) {
      fail(`pipeline.${s.name}: probability must be 0-100 (got ${s.probability})`);
    }
    if (!CATEGORIES.has(s.category)) fail(`pipeline.${s.name}: invalid category "${s.category}"`);
    if (!s.forecast) fail(`pipeline.${s.name}: missing forecast category name`);
    if (s.category === "Closed Won") won++;
    if (s.category === "Closed Lost") lost++;
  }
  if (won !== 1) fail(`pipeline: expected exactly 1 "Closed Won" stage, found ${won}`);
  if (lost !== 1) fail(`pipeline: expected exactly 1 "Closed Lost" stage, found ${lost}`);
  // Open stages should ascend in probability — a descending step is a config bug.
  const open = (p.stages ?? []).filter((s) => s.category === "Open");
  for (let i = 1; i < open.length; i++) {
    if (open[i].probability <= open[i - 1].probability) {
      fail(`pipeline: "${open[i].name}" (${open[i].probability}%) does not ascend after "${open[i - 1].name}" (${open[i - 1].probability}%)`);
    }
  }
}

if (!(schema.console_only?.items ?? []).length) fail("console_only.items should document non-API work");

if (errors.length) {
  console.error("✗ crm-schema.json invalid:");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`✓ crm-schema.json: valid (${fieldCount} field defs, ${p.stages.length} pipeline stages, ${schema.console_only.items.length} console-only items)`);
