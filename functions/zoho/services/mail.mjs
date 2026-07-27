/**
 * Zoho Mail client — transactional send from a Catalyst function.
 *
 * Useful for server-generated mail (e.g. a branded confirmation the CRM
 * workflow doesn't cover). Most business email still flows through Zoho Mail
 * the app and CRM workflow templates (File 03) — reach for this only when a
 * function must send mail itself.
 *
 * Requires ZOHO_MAIL_ACCOUNT_ID (Mail → Settings → the account's zuid/accountId).
 * Scope: ZohoMail.messages.CREATE.
 */

import { zohoRequest } from "../client.mjs";
import { requireEnv } from "../config.mjs";

/**
 * @param {{from: string, to: string, subject: string, content: string, contentType?: "html"|"plaintext"}} msg
 */
export async function sendMail({ from, to, subject, content, contentType = "html" }) {
  requireEnv(["ZOHO_MAIL_ACCOUNT_ID"]);
  const accountId = process.env.ZOHO_MAIL_ACCOUNT_ID;
  if (!from || !to || !subject) throw new Error("sendMail requires from, to and subject.");
  return zohoRequest("mail", `/accounts/${encodeURIComponent(accountId)}/messages`, {
    method: "POST",
    body: { fromAddress: from, toAddress: to, subject, content, mailFormat: contentType },
  });
}
