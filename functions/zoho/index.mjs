/**
 * Zoho server-side integration layer — barrel export.
 *
 * Usage from a Catalyst function:
 *   import { crm } from "../zoho/index.mjs";
 *   const { id } = await crm.createOrUpdateLead({ Last_Name, Email, Phone });
 *
 * Everything here is SERVER-SIDE ONLY. No module in this tree is imported by the
 * website build (website/build.mjs reads website/src exclusively), so none of it
 * can reach the browser or the live site. Secrets come from process.env only.
 */

export { getAccessToken, verifyToken, setTokenCache } from "./oauth.mjs";
export { zohoRequest } from "./client.mjs";
export { getDataCentre, serviceBase } from "./config.mjs";
export { ZohoError } from "./http.mjs";

export * as crm from "./services/crm.mjs";
export * as mail from "./services/mail.mjs";
export * as bookings from "./services/bookings.mjs";
export * as analytics from "./services/analytics.mjs";
export * as forms from "./services/forms.mjs";
export * as salesiq from "./services/salesiq.mjs";
export * as flow from "./services/flow.mjs";
