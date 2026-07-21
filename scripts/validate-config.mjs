/**
 * Tenant configuration validator — Configuration Validation quality gate
 * (Execution Lock v1.0). Zero dependencies. Validates every config/tenant-*.json
 * against the invariants the CRM build (AM0.4) and downstream automations depend
 * on, so a malformed config is caught here, not half-built inside Zoho.
 *
 * Reusable for Titan: every future tenant config is validated by the same rules.
 * Run: node scripts/validate-config.mjs
 */

import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG_DIR = path.join(ROOT, "config");

const ENGAGEMENT_MODELS = new Set(["full_time", "part_time", "collaboration"]);

/** @returns {string[]} list of error messages (empty = valid) */
function validate(cfg) {
  const errors = [];
  const req = (cond, msg) => { if (!cond) errors.push(msg); };
  const nonEmptyArr = (v) => Array.isArray(v) && v.length > 0;
  const isStr = (v) => typeof v === "string" && v.trim() !== "";

  // Identity
  req(cfg.tenant && isStr(cfg.tenant.id), "tenant.id must be a non-empty string");
  req(cfg.tenant && isStr(cfg.tenant.dc), "tenant.dc must be set (e.g. 'in')");

  // Geography — configurable but must be present (never empty)
  req(cfg.markets && nonEmptyArr(cfg.markets.primary), "markets.primary must be a non-empty array");
  req(cfg.destinations && nonEmptyArr(cfg.destinations.primary_europe), "destinations.primary_europe must be a non-empty array");

  // Languages — never English-only assumption; must list customer languages
  req(cfg.languages && isStr(cfg.languages.system), "languages.system must be set");
  req(cfg.languages && nonEmptyArr(cfg.languages.customer), "languages.customer must be a non-empty array");

  // Lead types — Student must be active (Option A)
  const active = cfg.lead_types?.active;
  req(nonEmptyArr(active), "lead_types.active must be a non-empty array");
  if (nonEmptyArr(active)) req(active.includes("Student"), "lead_types.active must include 'Student'");

  // Service packages
  req(nonEmptyArr(cfg.service_packages), "service_packages must be a non-empty array");

  // Contributors — CRM supports all; each must declare a valid engagement model + CRM role
  const roster = cfg.contributors?.roster;
  req(nonEmptyArr(roster), "contributors.roster must be a non-empty array");
  if (nonEmptyArr(roster)) {
    roster.forEach((c, i) => {
      req(isStr(c.name), `contributors.roster[${i}].name must be set`);
      req(ENGAGEMENT_MODELS.has(c.engagement_model), `contributors.roster[${i}].engagement_model must be one of ${[...ENGAGEMENT_MODELS].join("/")}`);
      req(isStr(c.crm_role), `contributors.roster[${i}].crm_role must be set`);
    });
  }

  // Ownership — role-based, transferable; Finance Owner must exist (OI-3)
  req(cfg.ownership_roles?.["Finance Owner"]?.current, "ownership_roles['Finance Owner'].current must be set");

  // Assignment Engine — configurable, never static; manual override mandatory (OI-4)
  req(nonEmptyArr(cfg.assignment_engine?.priority_dimensions), "assignment_engine.priority_dimensions must be a non-empty array");
  req(cfg.assignment_engine?.manual_override, "assignment_engine.manual_override must be present (always-available human override)");

  // Scale-target principle present (design-for-scale, build-for-today)
  req(cfg.scale_target?.design_for, "scale_target.design_for must be present");

  return errors;
}

const files = existsSync(CONFIG_DIR)
  ? (await readdir(CONFIG_DIR)).filter((f) => /^tenant-.*\.json$/.test(f))
  : [];

if (files.length === 0) {
  console.error("✗ validate-config: no config/tenant-*.json found");
  process.exit(1);
}

let failed = 0;
for (const f of files.sort()) {
  const full = path.join(CONFIG_DIR, f);
  let cfg;
  try {
    cfg = JSON.parse(await readFile(full, "utf8"));
  } catch (e) {
    console.error(`✗ ${f}: invalid JSON — ${e.message}`);
    failed++;
    continue;
  }
  const errors = validate(cfg);
  if (errors.length) {
    failed++;
    console.error(`✗ ${f}: ${errors.length} error(s):`);
    for (const e of errors) console.error(`    - ${e}`);
  } else {
    console.log(`✓ ${f}: valid (${cfg.contributors.roster.length} contributors, ${cfg.lead_types.active.length} active lead type(s), ${cfg.service_packages.length} packages)`);
  }
}

process.exit(failed ? 1 : 0);
