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

node --env-file="$ROOT/.env" "$ROOT/functions/catalyst/build.mjs" >/dev/null
cd "$DIST"
# Project link is wiped whenever dist/ is cleaned — recreate it if absent.
[ -f .catalystrc ] || catalyst init --project "$PROJECT_ID" --org "$ORG_ID" --force >/dev/null 2>&1
TMPCACHE="$(mktemp -d)"
for fn in titan-webhook titan-reconcile; do
  (cd "functions/$fn" && npm install --cache "$TMPCACHE" --no-audit --no-fund >/dev/null 2>&1)
done
catalyst deploy --only functions
