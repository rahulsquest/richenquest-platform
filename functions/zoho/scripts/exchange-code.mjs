/**
 * Exchanges a one-time OAuth grant code for a REFRESH TOKEN and prints it
 * locally in YOUR terminal — never transmitted anywhere but Zoho's token
 * endpoint. Paste the printed value into .env as ZOHO_REFRESH_TOKEN yourself.
 *
 * Run:  node --env-file=.env functions/zoho/scripts/exchange-code.mjs <code>
 *
 * The grant code expires in a few minutes — run this right after auth-url.mjs.
 * Reads ZOHO_DC, ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REDIRECT_URI.
 */

import { getDataCentre, requireEnv } from "../config.mjs";
import { fetchWithTimeout, parseJson } from "../http.mjs";

const code = process.argv[2];
if (!code) {
  console.error("Usage: node --env-file=.env functions/zoho/scripts/exchange-code.mjs <code>");
  process.exit(1);
}

requireEnv(["ZOHO_CLIENT_ID", "ZOHO_CLIENT_SECRET", "ZOHO_REDIRECT_URI"]);
const dc = getDataCentre();

const body = new URLSearchParams({
  grant_type: "authorization_code",
  client_id: process.env.ZOHO_CLIENT_ID,
  client_secret: process.env.ZOHO_CLIENT_SECRET,
  redirect_uri: process.env.ZOHO_REDIRECT_URI,
  code,
});

const res = await fetchWithTimeout(`${dc.accounts}/oauth/v2/token`, {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body,
});
const json = await parseJson(res);

if (!res.ok || json.error) {
  console.error(`\n✗ Exchange failed: ${json.error || res.status}`);
  if (json.error === "invalid_code") console.error("  The code expired or was already used — re-run auth-url.mjs for a fresh one.");
  process.exit(1);
}

if (!json.refresh_token) {
  console.error("\n✗ No refresh_token returned. Ensure access_type=offline and prompt=consent (auth-url.mjs sets both), and that this code hasn't been exchanged before.");
  process.exit(1);
}

console.log("\n✓ Success. Add this line to your .env (do NOT share it, do NOT commit it):\n");
console.log(`ZOHO_REFRESH_TOKEN=${json.refresh_token}`);
console.log(`\nGranted scopes: ${json.scope || "(not reported)"}`);
console.log("Then verify with: node --env-file=.env functions/zoho/scripts/verify.mjs\n");
