# Catalyst deployment layer

Hosts the tested Titan engine (`functions/titan/`) + Zoho clients (`functions/zoho/`) as two Catalyst
serverless functions. The target is the **existing unused Catalyst project** — a standard Catalyst
project supplies Advanced I/O + Cron + Data Store, which is all Titan needs, so no new project is
required.

**Status (2026-07-24): DEPLOYED to `Project-Rainfall` (Development).** Both functions are live:
- `titan-webhook` (Advanced I/O) → `https://project-rainfall-60076829044.development.catalystserverless.in/server/titan-webhook/`
- `titan-reconcile` (Cron)

They will not process events until (a) the function **environment variables** are set in the
Catalyst console and (b) the three **Data Store tables** exist — both are console actions (the env
vars are credentials). See "Remaining console steps" below.

## Two functions

| Function | Type | Trigger | Core (tested) | Timeout |
|---|---|---|---|---|
| `titan-webhook` | Advanced I/O | Zoho `actions/watch` POST | `webhook-core.mjs` → `engine.handle()` | 30s (acks <1s) |
| `titan-reconcile` | Cron | every 15 min | `reconcile-core.mjs` → `reconciler.sweep()` | 15 min |

## Files

| File | Role | Tested? |
|---|---|---|
| `parse-notification.mjs` | Zoho webhook body → engine input (pure) | ✅ |
| `webhook-core.mjs` | ack-first-then-dispatch logic (framework-agnostic) | ✅ |
| `reconcile-core.mjs` | committing-sweep logic | ✅ |
| `deploy/*.handler.cjs` | thin Catalyst SDK shells (Express / Cron + Data Store) | shell validated at deploy |
| `build.mjs` | assembles self-contained deploy bundles | ✅ (assembly asserted) |

## The packaging problem this solves

Catalyst bundles **each function's own directory** — imports that escape it (`../../../`) are not
included in the deployment package, and `runtime.mjs` also reads `config/` by filesystem path.
`build.mjs` therefore produces `dist/<fn>/` mirroring the repo layout (`config/` +
`functions/{titan,zoho,catalyst}` + a root `handler.js`), so every import resolves locally and
config loads from inside the bundle. A test imports the *assembled* runtime and builds it, proving
the bundle is self-contained before any deploy.

```
node functions/catalyst/build.mjs   # → functions/catalyst/dist/<fn>/ (gitignored)
```

## The one seam validated only at deploy

The CJS shells (`deploy/*.handler.cjs`) wire Catalyst's SDK (Express request/response, `datastore()`)
into the tested cores via dynamic `import()` of the ESM logic. That SDK wiring — and the Data Store
adapter mapping onto the `catalystStore` contract in `store.mjs` — cannot be exercised without the
live runtime. Everything it calls is tested; the adapter contract itself is contract-tested against a
fake client. This seam is finalised on the first deploy.

## Data Store tables (created at deploy)

`titan_idempotency` (key, expiresAt) · `titan_meta` (name, value — reconciliation checkpoints) ·
`titan_dead_letter` (append-only). Created via the Catalyst console/CLI.

## Environment (Catalyst function env vars — never in code)

`ZOHO_CLIENT_ID/_SECRET/_REFRESH_TOKEN`, `ZOHO_DC=in`, `ZOHO_NOTIFY_URL` (the deployed webhook URL),
`TITAN_WEBHOOK_SECRET` (must match the value used at provisioning), `TITAN_AUTOMATION_USER_ID`.

## Reproducing the deploy

```bash
node functions/catalyst/build.mjs                     # → dist/ (functions/ + catalyst.json)
cd functions/catalyst/dist
catalyst init --project 53691000000013024 --org 60076829044 --force   # writes .catalystrc
(cd functions/titan-webhook && npm install) && (cd functions/titan-reconcile && npm install)
catalyst deploy --only functions                      # --only functions never touches website hosting
```

## Remaining console steps (cannot be automated — credentials + console)

1. **Function environment variables** — Catalyst console → project `Project-Rainfall` → Functions →
   each function → Configuration → Environment Variables. Set: `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`,
   `ZOHO_REFRESH_TOKEN`, `ZOHO_DC=in`, `TITAN_WEBHOOK_SECRET` (same value as local `.env`),
   `TITAN_AUTOMATION_USER_ID=1292318000000457001`. The ZOHO values are the same as local `.env`.
2. **Data Store tables** — console → Data Store → create: `titan_idempotency` (columns: `ROWID`,
   `expiresAt` Number), `titan_meta` (`ROWID`, `value` Number), `titan_dead_letter` (`ROWID`,
   payload columns / a single `json` Text column).

## Then (I automate)

`provision-notifications.mjs --commit` for **speed-to-lead only** (its handler exists; the other
three subscriptions wait on their handlers) → roadmap Stage 1: one channel, 7-day delivery measurement
via the reconciler's `missed` metric.
