#!/usr/bin/env bash
# Reproducible Catalyst redeploy for Titan. Run from the repo root WITH the env
# loaded so build.mjs can bake function env vars:
#   node --env-file=.env functions/catalyst/build.mjs   # (build step, separate)
# then: bash functions/catalyst/redeploy.sh
#
# Idempotent: rebuilds the workspace, ensures the project link + deps, deploys
# functions only (never touches website hosting).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIST="$ROOT/functions/catalyst/dist"
PROJECT_ID="53691000000013024"   # Project-Rainfall (the unused Titan target)
ORG_ID="60076829044"

# ── Preflight ────────────────────────────────────────────────────────────────
# An incomplete configuration deploys perfectly well and then fails on boot, so
# the failure surfaces in a deployed function's logs instead of here. Refuse
# first: this runs BEFORE the build, so a refused deploy changes nothing at all.
#
# The checks mirror the runtime gates one-for-one — readConfig() in
# record/api/bootstrap.mjs, envKeyProvider() in record/identity/vault.mjs, and
# gcpKmsConfigFromEnv() in record/identity/kms-gcp.mjs. They are a fail-fast copy
# of those rules, never a second source of truth: the runtime still enforces
# every one of them.
#
# Read through node's own --env-file parser, the same one build.mjs uses, so the
# guard and the build can never disagree about what .env actually says.
node --env-file="$ROOT/.env" - <<'PREFLIGHT'
const errors = [];
const require_ = (key, why) => { if (!process.env[key]) errors.push(`${key} — ${why}`); };

// The deployed Record API must connect as record_writer (C4), never as the
// owner. build.mjs substitutes DATABASE_URL_APP for the function's DATABASE_URL
// and refuses to fall back to the owner credential.
require_("DATABASE_URL_APP", "the Record API must connect as record_writer, not as the database owner");

// readConfig() requires this and refuses a secret under 32 characters.
require_("RECORD_TOKEN_SECRET", "session token signing key");
const secret = process.env.RECORD_TOKEN_SECRET;
if (secret && secret.length < 32) {
  errors.push("RECORD_TOKEN_SECRET — must be at least 32 characters");
}

// selectKeyProvider() knows exactly these two.
const PROVIDERS = ["env", "kms"];
const provider = process.env.RECORD_VAULT_PROVIDER;
require_("RECORD_VAULT_PROVIDER", `the vault's key provider (${PROVIDERS.join(" | ")})`);
if (provider && !PROVIDERS.includes(provider)) {
  errors.push(`RECORD_VAULT_PROVIDER — "${provider}" is not a provider this build knows (${PROVIDERS.join(", ")})`);
}

if (provider === "env") {
  require_("RECORD_VAULT_KEK", "32 random bytes, base64 — required while the provider is env");
} else if (provider === "kms") {
  require_("GCP_PROJECT_ID", "Cloud KMS project");
  require_("GCP_KMS_LOCATION", "Cloud KMS location");
  require_("GCP_KMS_KEYRING", "Cloud KMS key ring");
  // gcpKmsConfigFromEnv() takes the active version's key from GCP_KMS_KEY or
  // from GCP_KMS_KEY_<VERSION>. Accept either, exactly as it does.
  const version = process.env.RECORD_VAULT_KEK_VERSION ?? "v1";
  if (!process.env.GCP_KMS_KEY && !process.env[`GCP_KMS_KEY_${version.toUpperCase()}`]) {
    errors.push(`GCP_KMS_KEY — no Cloud KMS key configured for version "${version}"`);
  }
}

// NODE_ENV=production tightens two further gates in readConfig().
if (process.env.NODE_ENV === "production") {
  if (provider === "env") {
    errors.push('RECORD_VAULT_PROVIDER — "env" is refused when NODE_ENV=production; production must be "kms"');
  }
  const origins = (process.env.CORS_ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!origins.length) {
    errors.push("CORS_ALLOWED_ORIGINS — empty is refused in production; an API holding personal data must name its callers");
  }
}

if (errors.length) {
  console.error("✗ deploy refused: the Record API's configuration is incomplete.\n");
  for (const e of errors) console.error(`  · ${e}`);
  console.error("\n  Set these in .env — see .env.example and docs/DEPLOYMENT.md.");
  console.error("  DATABASE_URL stays reserved for db/migrate.mjs and owner operations.");
  console.error("  Nothing was built and nothing was deployed.");
  process.exit(1);
}
console.log("✓ preflight: Record API configuration complete");
PREFLIGHT

node --env-file="$ROOT/.env" "$ROOT/functions/catalyst/build.mjs" >/dev/null
cd "$DIST"
# Project link is wiped whenever dist/ is cleaned — recreate it if absent.
[ -f .catalystrc ] || catalyst init --project "$PROJECT_ID" --org "$ORG_ID" --force >/dev/null 2>&1
TMPCACHE="$(mktemp -d)"
# Derived from the deploy targets, never hardcoded: a function that is deployed
# but never installed ships without its node_modules and dies on the first
# require. record-api needs pg; titan-webhook needs express.
FNS=$(node -e 'console.log(require("./catalyst.json").functions.targets.join(" "))')
for fn in $FNS; do
  (cd "functions/$fn" && npm install --cache "$TMPCACHE" --no-audit --no-fund >/dev/null 2>&1)
done
catalyst deploy --only functions
