/**
 * Exchanges a one-time OAuth grant code for a REFRESH TOKEN and prints it
 * locally in YOUR terminal — never transmitted anywhere but Zoho's token
 * endpoint. Paste the printed value into .env as ZOHO_REFRESH_TOKEN yourself.
 *
 * Run:  node --env-file=.env functions/zoho/scripts/exchange-code.mjs <code>
 *
 * The grant code expires in a few minutes — run this right after auth-url.mjs.
 */

import { requireEnv } from "../config.mjs";
import { exchangeAuthCode } from "../oauth.mjs";

const code = process.argv[2];
if (!code) {
  console.error("Usage: node --env-file=.env functions/zoho/scripts/exchange-code.mjs <code>");
  process.exit(1);
}

requireEnv(["ZOHO_CLIENT_ID", "ZOHO_CLIENT_SECRET", "ZOHO_REDIRECT_URI"]);

try {
  const json = await exchangeAuthCode(code);
  if (!json.refresh_token) {
    console.error("\n✗ No refresh_token returned. Ensure access_type=offline and prompt=consent (auth-url.mjs sets both), and that this code hasn't been exchanged before.");
    process.exit(1);
  }
  console.log("\n✓ Success. Add this line to your .env (do NOT share it, do NOT commit it):\n");
  console.log(`ZOHO_REFRESH_TOKEN=${json.refresh_token}`);
  console.log(`\nGranted scopes: ${json.scope || "(not reported)"}`);
  console.log("Then verify with: node --env-file=.env functions/zoho/scripts/verify.mjs\n");
} catch (err) {
  console.error(`\n✗ Exchange failed: ${err.message}`);
  if (err.code === "invalid_code") console.error("  The code expired or was already used — re-run auth-url.mjs for a fresh one.");
  process.exit(1);
}
