/**
 * Zoho CRM client — the core of the lead journey.
 *
 * This is the one server-side client the website funnel actually depends on:
 * the future branded form proxy (File 09 §8) calls createOrUpdateLead() so a
 * submission becomes a deduplicated CRM Lead. High-confidence API (CRM v7).
 *
 * Scope required: ZohoCRM.modules.ALL (or narrower ZohoCRM.modules.leads.ALL).
 */

import { zohoRequest } from "../client.mjs";

/**
 * Upsert a Lead, deduplicating on Email (then Phone). Zoho matches an existing
 * record on the duplicate-check fields and updates it, else creates one.
 * @param {object} fields  CRM Lead API field names (Last_Name, Email, Phone, …)
 * @returns {Promise<{action: "insert"|"update", id: string}>}
 */
export async function createOrUpdateLead(fields, { source = "Website" } = {}) {
  if (!fields || (!fields.Email && !fields.Phone)) {
    throw new Error("createOrUpdateLead requires at least Email or Phone.");
  }
  const record = { Lead_Source: source, ...fields };
  const json = await zohoRequest("crm", "/Leads/upsert", {
    method: "POST",
    body: { data: [record], duplicate_check_fields: ["Email", "Phone"] },
  });
  const row = json.data?.[0];
  if (row?.status === "error") {
    throw new Error(`CRM upsert error: ${row.code} ${row.message}`);
  }
  return { action: row?.action, id: row?.details?.id };
}

/** Fetch a Lead by id. */
export async function getLead(id) {
  const json = await zohoRequest("crm", `/Leads/${encodeURIComponent(id)}`);
  return json.data?.[0] ?? null;
}

/** Find Leads by email (criteria search). */
export async function searchLeadByEmail(email) {
  const json = await zohoRequest("crm", "/Leads/search", { query: { email } });
  return json.data ?? [];
}

/** Fetch any record by module + id (used by the automation engine to hydrate). */
export async function getRecord(module, id) {
  const json = await zohoRequest("crm", `/${encodeURIComponent(module)}/${encodeURIComponent(id)}`, { apiVersion: "v8" });
  return json.data?.[0] ?? null;
}

/**
 * Run a COQL query. Returns { data, info }. COQL REQUIRES a WHERE clause
 * (a query without one → SYNTAX_ERROR "missing clause"), and an empty result
 * comes back as HTTP 204 with no body, which normalises to { data: [] }.
 */
export async function coql(selectQuery) {
  const json = await zohoRequest("crm", "/coql", { method: "POST", apiVersion: "v8", body: { select_query: selectQuery } });
  return { data: json.data ?? [], info: json.info ?? { more_records: false } };
}

/**
 * Add a note to any record (e.g. an automation audit trail on a Lead).
 * Parent_Id must be a json object { module:{api_name}, id } — a bare id is
 * rejected with INVALID_DATA. Throws on a row-level error so a failure surfaces
 * (dead-lettered by the engine) rather than passing silently.
 */
export async function addNote(parentModule, parentId, title, content) {
  const json = await zohoRequest("crm", "/Notes", {
    method: "POST",
    apiVersion: "v8",
    body: { data: [{ Note_Title: title, Note_Content: content, Parent_Id: { module: { api_name: parentModule }, id: parentId } }] },
  });
  const row = json.data?.[0];
  if (row?.status === "error") throw new Error(`addNote failed: ${row.code} ${row.message}`);
  return { id: row?.details?.id };
}
