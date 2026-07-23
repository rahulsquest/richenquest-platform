/**
 * Pipeline (Stage picklist) provisioning for Student Cases — AM0.4 §4.
 *
 * ── The critical Zoho contract this module encodes ──────────────────────────
 * A PATCH to /settings/fields/<id> with `pick_list_values` is treated by Zoho as
 * the COMPLETE layout-associated set. Sending a partial list silently
 * DE-ASSOCIATES every option you omitted — the values survive in the field's
 * value pool but vanish from the layout, leaving an unusable picklist.
 * Therefore: always send every stage in ONE atomic call. `planPipeline` builds
 * that full payload; there is deliberately no single-stage update path.
 *
 * Other contract details, learned against the live API:
 *  - Renaming an existing option = match by `id` and keep `actual_value`
 *    (the stored value); only `display_value` changes. Changing actual_value
 *    is read as a new option and collides with DUPLICATE_DATA.
 *  - New options require `deal_category` AND `forecast_category.id`.
 *    Forecast-category ids are ORG-SPECIFIC, so they are discovered at runtime
 *    from the live field rather than hardcoded.
 *
 * Modes (safe by default = DRY-RUN):
 *   node --env-file=.env functions/zoho/provision-pipeline.mjs
 *   node --env-file=.env functions/zoho/provision-pipeline.mjs --commit
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { zohoRequest } from "./client.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Read the Stage field (id, options, and the org's forecast categories). */
export async function readStageField(module = "Deals", fieldLabel = "Stage") {
  const json = await zohoRequest("crm", "/settings/fields", { query: { module } });
  const field = (json.fields ?? []).find((f) => f.api_name === fieldLabel || f.field_label === fieldLabel);
  if (!field) throw new Error(`Field "${fieldLabel}" not found on ${module}.`);
  return { id: field.id, options: field.pick_list_values ?? [] };
}

/**
 * PURE. Build the complete atomic payload plus a human-readable diff.
 * @param {{stages:Array}} pipeline  config/crm-schema.json → pipeline
 * @param {Array} existing           live pick_list_values
 * @param {Record<string,string>} forecastIds  name → org-specific id
 */
export function planPipeline(pipeline, existing, forecastIds) {
  const byName = new Map(existing.map((o) => [o.display_value, o]));
  const diff = [];
  const values = pipeline.stages.map((s, i) => {
    const cur = byName.get(s.name);
    const forecastId = forecastIds[s.forecast];
    if (!forecastId) throw new Error(`No forecast category id for "${s.forecast}" — found: ${Object.keys(forecastIds).join(", ") || "(none)"}`);
    const base = {
      display_value: s.name,
      // Preserve the stored value on existing options so historical records stay valid.
      actual_value: cur?.actual_value ?? s.name,
      probability: s.probability,
      sequence_number: i + 1,
      deal_category: s.category,
      forecast_category: { id: forecastId },
    };
    if (cur) {
      const drift = cur.probability !== s.probability || cur.deal_category !== s.category;
      diff.push({ stage: s.name, action: drift ? "update" : "keep" });
      return { id: cur.id, ...base };
    }
    diff.push({ stage: s.name, action: "create" });
    return base;
  });
  const orphans = existing.filter((o) => !pipeline.stages.some((s) => s.name === o.display_value)).map((o) => o.display_value);
  return { values, diff, orphans };
}

/** Map the org's forecast-category names → ids, read from live options. */
export function discoverForecastIds(options) {
  const ids = {};
  for (const o of options) if (o.forecast_category?.id) ids[o.forecast_category.name] = o.forecast_category.id;
  return ids;
}

/** Apply the plan in ONE atomic call. `api` is injectable for tests. */
export async function executePipeline(fieldId, values, api, { module = "Deals", commit = false } = {}) {
  if (!commit) return { committed: false, count: values.length };
  const res = await api.updateField(fieldId, module, values);
  return { committed: true, count: values.length, ok: res.ok, code: res.code };
}

async function main() {
  const commit = process.argv.includes("--commit");
  const schema = JSON.parse(await readFile(path.join(ROOT, "config/crm-schema.json"), "utf8"));
  const pipeline = schema.pipeline;
  if (!pipeline) throw new Error("config/crm-schema.json has no `pipeline` section.");

  console.log(`\nPipeline provisioning — ${commit ? "COMMIT" : "DRY-RUN"} (${pipeline.module}.${pipeline.field})\n`);

  const { id, options } = await readStageField(pipeline.module, pipeline.field);
  const forecastIds = discoverForecastIds(options);
  console.log(`  forecast categories discovered: ${Object.entries(forecastIds).map(([n, i]) => `${n}=${i}`).join(" · ") || "(none)"}`);

  const { values, diff, orphans } = planPipeline(pipeline, options, forecastIds);
  for (const d of diff) console.log(`  ${d.action === "create" ? "+" : d.action === "update" ? "~" : "="} ${d.action.padEnd(6)} ${d.stage}`);
  if (orphans.length) console.log(`  ⚠ dropped (not in config, will be de-associated): ${orphans.join(" · ")}`);

  const api = {
    updateField: async (fieldId, module, vals) => {
      const j = await zohoRequest("crm", `/settings/fields/${fieldId}`, {
        method: "PATCH", query: { module }, body: { fields: [{ pick_list_values: vals }] },
      });
      const row = j.fields?.[0];
      return { ok: row?.status === "success", code: row?.code };
    },
  };
  const out = await executePipeline(id, values, api, { module: pipeline.module, commit });

  if (!commit) {
    console.log(`\nDRY-RUN: would send ${out.count} stages in one atomic PATCH. Re-run with --commit.\n`);
    return;
  }
  const after = await readStageField(pipeline.module, pipeline.field);
  const live = after.options.slice().sort((a, b) => (a.sequence_number ?? 0) - (b.sequence_number ?? 0));
  console.log(`\n  ${out.ok ? "✓" : "✗"} committed ${out.count} stages\n`);
  for (const o of live) console.log(`   ${String(o.sequence_number).padStart(2)}. ${o.display_value.padEnd(24)} ${String(o.probability).padStart(3)}%  ${o.deal_category}`);
  const okCount = live.length === pipeline.stages.length;
  console.log(`\n  verified: ${live.length}/${pipeline.stages.length} stages live ${okCount ? "✓" : "✗"}\n`);
  process.exit(okCount ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`✗ pipeline provisioning error: ${err.message}`);
    process.exit(1);
  });
}
