/**
 * Zoho Analytics client — push rows and export data via the Analytics API v2.
 *
 * Dashboards are built in Analytics itself (auto-syncing from CRM/Books,
 * File 01 §8); reach for this only to push custom operational rows (e.g. a
 * website-events table) or to export data programmatically.
 *
 * Requires ZOHO_ANALYTICS_ORG_ID. Scope: ZohoAnalytics.data.all (or narrower).
 * Analytics uses its own host (analyticsapi.zoho.<dc>) — handled in config.
 */

import { zohoRequest } from "../client.mjs";
import { requireEnv } from "../config.mjs";

function orgHeader() {
  requireEnv(["ZOHO_ANALYTICS_ORG_ID"]);
  return { "ZANALYTICS-ORGID": process.env.ZOHO_ANALYTICS_ORG_ID };
}

/** Append rows to a table (view) in a workspace. */
export async function addRows(workspaceId, viewId, rows) {
  return zohoRequest("analytics", `/workspaces/${workspaceId}/views/${viewId}/rows`, {
    method: "POST",
    headers: orgHeader(),
    body: { columns: rows },
  });
}

/** Kick off a data export job for a view (returns job info). */
export async function exportView(workspaceId, viewId, responseFormat = "json") {
  return zohoRequest("analytics", `/workspaces/${workspaceId}/views/${viewId}/data`, {
    query: { CONFIG: JSON.stringify({ responseFormat }) },
    headers: orgHeader(),
  });
}
