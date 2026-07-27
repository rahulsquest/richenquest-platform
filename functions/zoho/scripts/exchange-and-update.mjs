/**
 * Exchange a one-time OAuth grant code and write the refresh token straight
 * into .env — WITHOUT ever printing it.
 *
 * `exchange-code.mjs` prints the token for you to copy by hand. This variant
 * exists so the token never appears on screen, in a terminal scrollback, or in
 * a chat transcript: it is written directly to .env and only its SHA-256 is
 * reported, which is enough to confirm the value changed without revealing it.
 *
 * Run:  node --env-file=.env functions/zoho/scripts/exchange-and-update.mjs <code>
 *
 * Grant codes expire in roughly 1-2 minutes, so run this immediately after
 * approving consent in the browser.
 */

import { readFileSync, writeFileSync, copyFileSync, chmodSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireEnv } from "../config.mjs";
import { exchangeAuthCode } from "../oauth.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const ENV_PATH = path.join(ROOT, ".env");

const sha = (s) => createHash("sha256").update(s ?? "", "utf8").digest("hex");

/**
 * PURE: replace (or append) a key in .env content, preserving every other line.
 * Exported for testing — silently corrupting .env would be a very bad failure.
 */
export function patchEnv(content, key, value) {
  const lines = content.split("\n");
  const idx = lines.findIndex((l) => new RegExp(`^\\s*${key}\\s*=`).test(l));
  if (idx === -1) {
    // Append, keeping exactly one trailing newline.
    const body = content.replace(/\n+$/, "");
    return `${body}\n${key}=${value}\n`;
  }
  lines[idx] = `${key}=${value}`;
  return lines.join("\n");
}

async function main() {
  const code = process.argv[2];
  if (!code) {
    console.error("Usage: node --env-file=.env functions/zoho/scripts/exchange-and-update.mjs <code>");
    process.exit(1);
  }

  requireEnv(["ZOHO_CLIENT_ID", "ZOHO_CLIENT_SECRET", "ZOHO_REDIRECT_URI"]);

  const json = await exchangeAuthCode(code);
  if (!json.refresh_token) {
    console.error("\n✗ No refresh_token returned. Ensure access_type=offline and prompt=consent, and that this code has not already been used.");
    process.exit(1);
  }

  const before = readFileSync(ENV_PATH, "utf8");
  const oldMatch = before.match(/^\s*ZOHO_REFRESH_TOKEN\s*=(.*)$/m);
  const oldHash = sha(oldMatch ? oldMatch[1] : "");

  copyFileSync(ENV_PATH, `${ENV_PATH}.pre-remint.bak`);
  chmodSync(`${ENV_PATH}.pre-remint.bak`, 0o600);
  writeFileSync(ENV_PATH, patchEnv(before, "ZOHO_REFRESH_TOKEN", json.refresh_token));
  chmodSync(ENV_PATH, 0o600);

  console.log("\n✓ Token exchanged and written to .env — the value was never printed.");
  console.log(`  granted scopes : ${json.scope || "(not reported)"}`);
  console.log(`  api_domain     : ${json.api_domain || "(not reported)"}`);
  console.log(`  old token sha256: ${oldHash.slice(0, 16)}…`);
  console.log(`  new token sha256: ${sha(json.refresh_token).slice(0, 16)}…`);
  console.log(`  changed         : ${oldHash !== sha(json.refresh_token)}`);
  console.log(`  backup          : .env.pre-remint.bak (mode 600, gitignored)`);
  console.log("\nNext: node --env-file=.env functions/zoho/scripts/verify.mjs\n");
}

// Only run when executed directly — importing this module (e.g. for patchEnv in
// tests) must have zero side effects.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`\n✗ Exchange failed: ${err.message}`);
    if (err.code === "invalid_code") {
      console.error("  The code expired (they live ~1-2 minutes) or was already used.");
      console.error("  Re-run auth-url.mjs, approve again, and run this immediately.\n");
    }
    process.exit(1);
  });
}
