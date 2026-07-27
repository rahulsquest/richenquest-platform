/**
 * Prints the Zoho OAuth authorization URL, built from your .env values.
 *
 * Run:  node --env-file=.env functions/zoho/scripts/auth-url.mjs
 *
 * Reads ZOHO_DC, ZOHO_CLIENT_ID, ZOHO_REDIRECT_URI, ZOHO_SCOPES.
 * Open the printed URL in a browser, approve access, and Zoho redirects to your
 * Redirect URI with a `code` parameter — that grant code goes into exchange-code.mjs.
 */

import { getDataCentre, requireEnv } from "../config.mjs";

requireEnv(["ZOHO_CLIENT_ID", "ZOHO_REDIRECT_URI", "ZOHO_SCOPES"]);
const dc = getDataCentre();

const url = new URL(`${dc.accounts}/oauth/v2/auth`);
url.searchParams.set("scope", process.env.ZOHO_SCOPES);
url.searchParams.set("client_id", process.env.ZOHO_CLIENT_ID);
url.searchParams.set("response_type", "code");
url.searchParams.set("access_type", "offline"); // required to receive a refresh token
url.searchParams.set("prompt", "consent"); // force a refresh token every time
url.searchParams.set("redirect_uri", process.env.ZOHO_REDIRECT_URI);

console.log("\nData centre:", process.env.ZOHO_DC || "in");
console.log("\nOpen this URL in your browser and approve access:\n");
console.log(url.toString());
console.log(
  "\nAfter approving, your browser lands on the Redirect URI with `?code=...` in the address bar."
);
console.log("Copy that code value, then run:");
console.log("  node --env-file=.env functions/zoho/scripts/exchange-code.mjs <code>\n");
