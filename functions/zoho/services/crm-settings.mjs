/**
 * Zoho CRM settings/metadata client — used by provision-crm.mjs to create the
 * AM0.4 custom fields autonomously via the API (no console clicking).
 * Scope required: ZohoCRM.settings.ALL.
 */

import { zohoRequest } from "../client.mjs";

/** List existing fields on a module → array of { api_name, field_label, data_type }. */
export async function getFields(module) {
  const json = await zohoRequest("crm", "/settings/fields", { query: { module } });
  return (json.fields ?? []).map((f) => ({
    id: f.id,
    api_name: f.api_name,
    field_label: f.field_label,
    data_type: f.data_type,
    custom_field: f.custom_field,
  }));
}

/** Delete a custom field by id (rollback). Returns { ok, code }. */
export async function deleteField(module, id) {
  const json = await zohoRequest("crm", `/settings/fields/${encodeURIComponent(id)}`, {
    method: "DELETE",
    query: { module },
  });
  const row = json.fields?.[0] ?? json;
  return { ok: row?.status === "success" || row?.code === "SUCCESS", code: row?.code, message: row?.message };
}

/**
 * Normalized field def → Zoho create payload. Pure function (unit-tested).
 * @param {{label:string,type:string,values?:string[],length?:number}} def
 */
export function buildFieldPayload(def) {
  const payload = { field_label: def.label, data_type: def.type };
  if (def.type === "picklist" || def.type === "multiselectpicklist") {
    payload.pick_list_values = (def.values ?? []).map((v) => ({ display_value: v, actual_value: v }));
  }
  if (def.type === "text" || def.type === "textarea") {
    payload.length = def.length ?? 120;
  }
  return payload;
}

/** Create one custom field on a module. Returns { ok, code, api_name }. */
export async function createField(module, def) {
  const json = await zohoRequest("crm", "/settings/fields", {
    method: "POST",
    query: { module },
    body: { fields: [buildFieldPayload(def)] },
  });
  const row = json.fields?.[0];
  return {
    ok: row?.status === "success",
    code: row?.code,
    message: row?.message,
    api_name: row?.details?.api_name,
  };
}

/** Read the module's pipeline stages (to verify pipeline config after manual setup). */
export async function getPipelineStages(module = "Deals") {
  const json = await zohoRequest("crm", "/settings/pipeline", { query: { module } });
  return json.pipelines ?? json;
}
