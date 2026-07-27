/**
 * Verifies the OAuth setup by performing a real refresh — proving the refresh
 * token, client credentials and data centre all agree. Prints only a redacted
 * token preview and the expiry; never the full token.
 *
 * Run:  node --env-file=.env functions/zoho/scripts/verify.mjs
 */

import { verifyToken } from "../oauth.mjs";

try {
  const result = await verifyToken();
  console.log("\n✓ Zoho OAuth working.");
  console.log(`  access token: ${result.tokenPreview}`);
  console.log(`  expires in:   ${result.expiresInSeconds}s`);
  console.log("\nThe production layer will refresh this automatically as needed.\n");
} catch (err) {
  console.error(`\n✗ Verification failed: ${err.message}`);
  console.error("  Check ZOHO_DC matches where you created the app, and that client id/secret/refresh token are correct.\n");
  process.exit(1);
}
