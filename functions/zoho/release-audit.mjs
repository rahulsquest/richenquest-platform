/**
 * Release audit — read-only. Proves production matches the repository and that
 * no unintended artifacts remain. Exit 0 only when every check passes.
 *
 *   node --env-file=.env functions/zoho/release-audit.mjs
 *
 * Checks: config drift (fields, picklist values, pipeline), stray artifacts
 * left by API probing (workflow/validation/assignment rules, orphaned picklist
 * values), org/user reality, and data-sharing posture.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { zohoRequest } from "./client.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const checks = [];
const check = (area, name, pass, detail) => checks.push({ area, name, pass, detail });

/**
 * Read that NEVER silently degrades to "empty". A failed read is returned as
 * {unreadable: reason} so the caller must fail the check rather than report a
 * false clean — an audit that cannot read must never claim a pass.
 */
const tryRead = async (fn) => {
  try { return { ok: true, value: await fn() }; }
  catch (e) { return { ok: false, unreadable: `${e.code ?? e.status ?? "error"}: ${(e.message ?? "").slice(0, 90)}` }; }
};
const fieldsOf = async (m) => (await zohoRequest("crm", "/settings/fields", { query: { module: m } })).fields ?? [];

function expectedValues(def, tenant) {
  switch (def.values_from) {
    case "lead_types": return [...tenant.lead_types.active, ...tenant.lead_types.future_ready];
    case "markets": return [...tenant.markets.primary, ...tenant.markets.secondary, "Other"];
    case "destinations": return [...tenant.destinations.primary_europe, ...tenant.destinations.secondary, "Other"];
    case "service_packages": return tenant.service_packages;
    default: return def.values ?? [];
  }
}

const schema = JSON.parse(await readFile(path.join(ROOT, "config/crm-schema.json"), "utf8"));
const tenant = JSON.parse(await readFile(path.join(ROOT, "config/tenant-richenquest.json"), "utf8"));

// ── 1. Field drift: every configured field present, every value present ─────
let totalFields = 0;
for (const [module, defs] of Object.entries(schema.modules)) {
  const live = await fieldsOf(module);
  const byLabel = new Map(live.map((f) => [f.field_label, f]));
  const missing = defs.filter((d) => !byLabel.has(d.label)).map((d) => d.label);
  totalFields += defs.length;
  check("CRM", `${module}: ${defs.length} configured fields present`, missing.length === 0,
    missing.length ? `MISSING: ${missing.join(", ")}` : `all present`);

  const valueDrift = [];
  for (const d of defs) {
    const f = byLabel.get(d.label);
    if (!f || !/picklist/.test(d.type)) continue;
    const want = expectedValues(d, tenant);
    const got = (f.pick_list_values ?? []).map((v) => v.display_value).filter((v) => v !== "-None-");
    const miss = want.filter((v) => !got.includes(v));
    const extra = got.filter((v) => !want.includes(v));
    if (miss.length || extra.length) valueDrift.push(`${d.label}[missing:${miss.join("|") || "-"} extra:${extra.join("|") || "-"}]`);
  }
  check("CRM", `${module}: picklist values match config exactly`, valueDrift.length === 0,
    valueDrift.length ? valueDrift.join(" · ") : "no drift");
}

// ── 2. Module rename ───────────────────────────────────────────────────────
const mod = (await zohoRequest("crm", "/settings/modules/Deals")).modules?.[0] ?? {};
check("CRM", "Deals renamed to Student Cases", mod.plural_label === "Student Cases" && mod.singular_label === "Student Case",
  `singular="${mod.singular_label}" plural="${mod.plural_label}"`);

// ── 3. Pipeline: associated set AND the underlying value pool ──────────────
const dealFields = await fieldsOf("Deals");
const stage = dealFields.find((f) => f.api_name === "Stage");
const assoc = (stage?.pick_list_values ?? []).slice().sort((a, b) => (a.sequence_number ?? 0) - (b.sequence_number ?? 0));
const want = schema.pipeline.stages;
const drift = want.map((s, i) => (assoc[i]?.display_value !== s.name || assoc[i]?.probability !== s.probability)
  ? `${s.name}(want ${s.probability}% got ${assoc[i]?.display_value ?? "—"} ${assoc[i]?.probability ?? "—"}%)` : null).filter(Boolean);
check("CRM", `pipeline: ${want.length} stages, exact order + probabilities`, assoc.length === want.length && drift.length === 0,
  drift.length ? drift.join(" · ") : `${assoc.length}/${want.length} exact`);

// Orphans in the value pool = residue from the de-association incident (INC-1).
const poolR = await tryRead(async () => (await zohoRequest("crm", `/settings/fields/${stage.id}/pick_list_values`, { query: { module: "Deals" } })).pick_list_values ?? []);
const pool = poolR.ok ? poolR.value : [];
const orphans = pool.map((p) => p.display_value).filter((n) => !want.some((s) => s.name === n));
check("CRM", "no orphaned Stage values in pool (INC-1 residue)", poolR.ok && orphans.length === 0,
  !poolR.ok ? `UNREADABLE ${poolR.unreadable}` : orphans.length ? `ORPHANS: ${orphans.join(", ")}` : `pool ${pool.length} == associated ${assoc.length}`);

// ── 4. Duplicate-check + data sharing ──────────────────────────────────────
const email = (await fieldsOf("Leads")).find((f) => f.api_name === "Email");
check("CRM", "Leads.Email duplicate-check active", Boolean(email?.unique), JSON.stringify(email?.unique ?? null));

const dsR = await tryRead(() => zohoRequest("crm", "/settings/data_sharing"));
const rel = dsR.ok ? (dsR.value.data_sharing ?? []).filter((d) => ["Leads", "Deals"].includes(d.module?.api_name)) : [];
check("CRM", "data sharing Leads+Deals = private", dsR.ok && rel.length > 0 && rel.every((d) => d.share_type === "private"),
  !dsR.ok ? `UNREADABLE ${dsR.unreadable}` : rel.map((d) => `${d.module.api_name}=${d.share_type}`).join(" · "));

// ── 5. Stray artifacts from probing ────────────────────────────────────────
const rolesR = await tryRead(() => zohoRequest("crm", "/settings/roles"));
const roleNames = rolesR.ok ? (rolesR.value.roles ?? []).map((r) => r.name).sort() : [];
const expectedRoles = ["CEO", "Counselor", "Manager", "Marketing", "Operations"];
check("CRM", "roles are exactly the expected set (no probe residue)",
  rolesR.ok && JSON.stringify(roleNames) === JSON.stringify(expectedRoles),
  !rolesR.ok ? `UNREADABLE ${rolesR.unreadable}` : roleNames.join(" · "));

const arR = await tryRead(() => zohoRequest("crm", "/settings/automation/assignment_rules"));
check("CRM", "exactly 1 assignment rule (no probe duplicates)", arR.ok && (arR.value.assignment_rules ?? []).length === 1,
  !arR.ok ? `UNREADABLE ${arR.unreadable}` : (arR.value.assignment_rules ?? []).map((r) => r.name).join(" · ") || "none");

// Workflow rules live ONLY on v8 — reading via v7 returns API_NOT_SUPPORTED,
// which must surface as an audit failure, never as a false "0 rules".
const wfR = await tryRead(() => zohoRequest("crm", "/settings/automation/workflow_rules", { apiVersion: "v8" }));
const wfNames = wfR.ok ? (wfR.value.workflow_rules ?? []).map((w) => w.name) : [];
const probeJunk = wfNames.filter((n) => /^probe_/i.test(n));
check("CRM", "no probe-created workflow rules left behind", wfR.ok && probeJunk.length === 0,
  !wfR.ok ? `UNREADABLE ${wfR.unreadable}` : `${wfNames.length} rule(s): ${wfNames.join(" · ") || "none"}${probeJunk.length ? ` — JUNK: ${probeJunk.join(", ")}` : ""}`);

// Pre-existing rule must be intact — my probing must not have disturbed it.
check("CRM", "pre-existing 'Big Deal Rule' intact (no collateral damage)",
  wfR.ok && wfNames.includes("Big Deal Rule"),
  !wfR.ok ? `UNREADABLE ${wfR.unreadable}` : wfNames.includes("Big Deal Rule") ? "present" : "MISSING — investigate");

const vrR = await tryRead(async () => {
  const j = await zohoRequest("crm", "/settings/validation_rules", { query: { module: "Deals", layout_id: "1292318000000000173" }, apiVersion: "v8" });
  return j.validation_rules ?? [];
});
const vrJunk = vrR.ok ? vrR.value.filter((r) => /^LR_|Lost Reason Required/i.test(r.name ?? "")) : [];
check("CRM", "no probe-created validation rules left behind", vrR.ok && vrJunk.length === 0,
  !vrR.ok ? `UNREADABLE ${vrR.unreadable}` : `${vrR.value.length} rule(s)${vrJunk.length ? ` — JUNK: ${vrJunk.map((r) => r.name).join(", ")}` : ""}`);

// ── 6. Records: sample data purge ──────────────────────────────────────────
for (const m of ["Leads", "Deals"]) {
  const cR = await tryRead(() => zohoRequest("crm", `/${m}/actions/count`));
  check("CRM", `${m} record count (sample data purged)`, cR.ok && String(cR.value.count) === "0",
    !cR.ok ? `UNREADABLE ${cR.unreadable}` : `count=${cR.value.count}`);
}

// ── 7. Org / users reality ─────────────────────────────────────────────────
const usersR = await tryRead(() => zohoRequest("crm", "/users", { query: { type: "AllUsers" } }));
const roster = tenant.contributors.roster.length;
check("ORG", `users provisioned (${roster} in roster)`, usersR.ok && (usersR.value.users ?? []).length >= roster,
  !usersR.ok ? `UNREADABLE ${usersR.unreadable}` : `${(usersR.value.users ?? []).length} live: ${(usersR.value.users ?? []).map((u) => u.full_name).join(", ")}`);

// ── report ─────────────────────────────────────────────────────────────────
const pad = (s, n) => String(s).padEnd(n);
console.log("\nRELEASE AUDIT — production vs repository\n" + "═".repeat(84));
let area = "";
for (const c of checks) {
  if (c.area !== area) { area = c.area; console.log(`\n[${area}]`); }
  console.log(`  ${c.pass ? "✅" : "❌"} ${pad(c.name, 56)} ${c.detail}`);
}
const failed = checks.filter((c) => !c.pass);
console.log("\n" + "═".repeat(84));
console.log(`${checks.length - failed.length}/${checks.length} checks passed${failed.length ? ` · ${failed.length} FAILED` : " · CLEAN"}`);
if (failed.length) { console.log("\nFAILURES:"); failed.forEach((f) => console.log(`  ❌ [${f.area}] ${f.name} → ${f.detail}`)); }
console.log();
process.exit(failed.length ? 1 : 0);
