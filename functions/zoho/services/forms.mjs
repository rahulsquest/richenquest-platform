/**
 * Zoho Forms client — read form metadata and submissions.
 *
 * HONEST SCOPE: for the website, Zoho Forms is inbound — the embedded form
 * pushes submissions straight to CRM (no server call needed). This client only
 * READS (list forms, pull submission reports) for reconciliation/auditing. It
 * is deliberately thin; do not build lead capture on top of it.
 *
 * Scope: ZohoForms.forms.READ (verify current strings — docs/14 §11).
 */

import { zohoRequest } from "../client.mjs";

/** List forms in the account. */
export async function listForms() {
  return zohoRequest("forms", "/forms");
}

/** Pull submission records for a form's report (for audit/reconciliation). */
export async function getSubmissions(formLinkName, reportLinkName) {
  return zohoRequest("forms", `/form/${formLinkName}/report/${reportLinkName}/records`);
}
