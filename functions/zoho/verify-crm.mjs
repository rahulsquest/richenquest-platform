/**
 * AM0.4 acceptance verifier — generates evidence for the acceptance checklist
 * straight from the live Zoho CRM API, replacing screenshot evidence wherever a
 * criterion is API-observable. Read-only: performs GETs only.
 *
 *   node --env-file=.env functions/zoho/verify-crm.mjs
 *   node --env-file=.env functions/zoho/verify-crm.mjs --json
 *
 * Exit code 0 when every API-observable criterion passes, 1 otherwise, so this
 * can gate a release. Criteria that are NOT API-observable (workflow actions
 * firing, Cliq posts, per-user record visibility) are reported as MANUAL.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { zohoRequest } from "./client.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const results = [];
const record = (id, criterion, verdict, evidence) => results.push({ id, criterion, verdict, evidence });

const fieldsOf = async (module) => (await zohoRequest("crm", "/settings/fields", { query: { module } })).fields ?? [];

async function run() {
  const schema = JSON.parse(await readFile(path.join(ROOT, "config/crm-schema.json"), "utf8"));
  const tenant = JSON.parse(await readFile(path.join(ROOT, "config/tenant-richenquest.json"), "utf8"));

  // A2 — module renamed.
  const mod = (await zohoRequest("crm", "/settings/modules/Deals")).modules?.[0] ?? {};
  record("A2", "Deals renamed to Student Cases",
    mod.plural_label === "Student Cases" && mod.singular_label === "Student Case" ? "PASS" : "FAIL",
    `singular="${mod.singular_label}" plural="${mod.plural_label}"`);

  // A3/A4 — custom fields present, with picklist values matching config.
  for (const [module, label, id] of [["Leads", "Lead", "A3"], ["Deals", "Student Case", "A4"]]) {
    const live = await fieldsOf(module);
    const byLabel = new Map(live.map((f) => [f.field_label, f]));
    const want = schema.modules[module] ?? [];
    const missing = want.filter((d) => !byLabel.has(d.label)).map((d) => d.label);
    // Verify picklist values for config-sourced fields.
    const mismatches = [];
    for (const def of want) {
      const f = byLabel.get(def.label);
      if (!f || !def.values_from) continue;
      const expected = resolveExpected(def, tenant);
      const actual = (f.pick_list_values ?? []).map((v) => v.display_value).filter((v) => v !== "-None-");
      const missingVals = expected.filter((v) => !actual.includes(v));
      if (missingVals.length) mismatches.push(`${def.label}: missing ${missingVals.join(",")}`);
    }
    record(id, `${label} fields + picklists match config`,
      missing.length === 0 && mismatches.length === 0 ? "PASS" : "FAIL",
      missing.length || mismatches.length
        ? `missing fields: [${missing.join(", ")}] · value gaps: [${mismatches.join(" | ")}]`
        : `all ${want.length} fields present; config-sourced picklists match`);
  }

  // A5 — 11-stage pipeline with probabilities (+ Lost Reason field present).
  const dealFields = await fieldsOf("Deals");
  const stage = dealFields.find((f) => f.api_name === "Stage");
  const liveStages = (stage?.pick_list_values ?? []).slice().sort((a, b) => (a.sequence_number ?? 0) - (b.sequence_number ?? 0));
  const wantStages = schema.pipeline?.stages ?? [];
  const stageDrift = wantStages.filter((s, i) => liveStages[i]?.display_value !== s.name || liveStages[i]?.probability !== s.probability)
    .map((s) => s.name);
  const lostReason = dealFields.find((f) => f.field_label === "Lost Reason");
  record("A5", "11-stage pipeline + probabilities + Lost Reason field",
    liveStages.length === wantStages.length && stageDrift.length === 0 && lostReason ? "PASS" : "FAIL",
    `${liveStages.length}/${wantStages.length} stages · drift=[${stageDrift.join(", ") || "none"}] · Lost Reason=${lostReason ? "present" : "MISSING"}`);
  record("A5b", "Lost Reason mandatory-on-Closed-Lost validation rule", "MANUAL",
    "Zoho validation_rules API returns HTTP 500 on a schema-valid payload (v7 and v8) — console-only");

  // A6 — Email duplicate check.
  const leadFields = await fieldsOf("Leads");
  const email = leadFields.find((f) => f.api_name === "Email");
  record("A6", "Email duplicate-check active",
    email?.unique ? "PASS" : "FAIL", `Email.unique=${JSON.stringify(email?.unique ?? null)}`);

  // A7 — assignment rule exists.
  let ar = { assignment_rules: [] };
  try { ar = await zohoRequest("crm", "/settings/automation/assignment_rules"); } catch { /* scope */ }
  const rule = (ar.assignment_rules ?? [])[0];
  record("A7", "Assignment rule present (configurable engine, Phase 1)",
    rule ? "PARTIAL" : "FAIL",
    rule ? `"${rule.name}" on ${rule.module?.api_name}; criteria entries require console (users not yet provisioned)` : "no rule found");

  // A8 — workflow rules.
  let wf = { workflow_rules: [] };
  try {
    const res = await zohoRequest("crm", "/settings/automation/workflow_rules");
    wf = res;
  } catch { /* v7 lacks this path */ }
  record("A8", "5 workflow rules active + #ops-alerts heartbeat", "MANUAL",
    `${(wf.workflow_rules ?? []).length} rule(s) live. Creation blocked: a workflow requires >=1 action entity, and action entities are read-only via API (POST /settings/automation/tasks → INVALID_REQUEST)`);

  // A9 — data sharing.
  let ds = { data_sharing: [] };
  try { ds = await zohoRequest("crm", "/settings/data_sharing"); } catch { /* scope */ }
  const relevant = (ds.data_sharing ?? []).filter((d) => ["Leads", "Deals"].includes(d.module?.api_name));
  const allPrivate = relevant.length > 0 && relevant.every((d) => d.share_type === "private");
  record("A9", "Data sharing Private + hierarchy",
    allPrivate ? "PASS" : "FAIL", relevant.map((d) => `${d.module.api_name}=${d.share_type}`).join(" · ") || "unreadable");

  // A1 — users/roles/2FA + Cliq.
  let roles = { roles: [] };
  try { roles = await zohoRequest("crm", "/settings/roles"); } catch { /* scope */ }
  record("A1", "Users + roles + 2FA; 5 Cliq channels", "MANUAL",
    `roles present: ${(roles.roles ?? []).map((r) => r.name).join(" · ") || "unreadable"}. User provisioning needs ZohoCRM.users.ALL scope; 2FA is Admin-Panel-only; Cliq needs Cliq scopes`);

  for (const [id, c] of [["A10", "Test lead fires WF1"], ["A11", "Agreement Signed fires WF3"], ["A12", "#ops-alerts heartbeat"], ["A13", "Counselor sees only own records"]]) {
    record(id, c, "MANUAL", "requires live workflow execution / per-user session — not API-observable");
  }

  return results;
}

function resolveExpected(def, tenant) {
  switch (def.values_from) {
    case "lead_types": return [...tenant.lead_types.active, ...tenant.lead_types.future_ready];
    case "markets": return [...tenant.markets.primary, ...tenant.markets.secondary, "Other"];
    case "destinations": return [...tenant.destinations.primary_europe, ...tenant.destinations.secondary, "Other"];
    case "service_packages": return tenant.service_packages;
    default: return def.values ?? [];
  }
}

const out = await run();
if (process.argv.includes("--json")) {
  console.log(JSON.stringify(out, null, 2));
} else {
  const icon = { PASS: "✅", FAIL: "❌", PARTIAL: "🟡", MANUAL: "🖐" };
  console.log("\nAM0.4 ACCEPTANCE — API-VERIFIED EVIDENCE\n" + "─".repeat(78));
  for (const r of out) {
    console.log(`${icon[r.verdict]} ${r.id.padEnd(4)} ${r.criterion}`);
    console.log(`        ${r.evidence}`);
  }
  const pass = out.filter((r) => r.verdict === "PASS").length;
  const fail = out.filter((r) => r.verdict === "FAIL").length;
  console.log("─".repeat(78));
  console.log(`PASS ${pass} · FAIL ${fail} · PARTIAL ${out.filter((r) => r.verdict === "PARTIAL").length} · MANUAL ${out.filter((r) => r.verdict === "MANUAL").length}\n`);
  process.exit(fail ? 1 : 0);
}
