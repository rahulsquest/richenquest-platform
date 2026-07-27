/**
 * Zoho SalesIQ client — thin operational reads.
 *
 * HONEST SCOPE: SalesIQ is primarily the embedded chat widget (dormant module
 * website/src/assets/js/modules/zoho-salesiq.js, consent-gated). This server
 * client covers occasional back-office reads (operators, and later chat
 * transcripts to attach to a CRM Lead via crm.addNote). Chat itself needs no
 * server client.
 *
 * Requires ZOHO_SALESIQ_SCREENNAME (your SalesIQ portal screen name).
 * Scope: SalesIQ.operators.READ (verify current strings — docs/14 §11).
 */

import { zohoRequest } from "../client.mjs";
import { requireEnv } from "../config.mjs";

function screenName() {
  requireEnv(["ZOHO_SALESIQ_SCREENNAME"]);
  return process.env.ZOHO_SALESIQ_SCREENNAME;
}

/** List operators in the portal. */
export async function listOperators() {
  return zohoRequest("salesiq", `/${screenName()}/operators`);
}

/** Fetch recent chats (for attaching transcripts to CRM records). */
export async function listChats(query = {}) {
  return zohoRequest("salesiq", `/${screenName()}/conversations`, { query });
}
