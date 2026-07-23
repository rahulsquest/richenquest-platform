# Catalyst deployment layer

Hosts the tested Titan engine (`functions/titan/`) + Zoho clients (`functions/zoho/`) as two Catalyst
serverless functions. The target is the **existing unused Catalyst project** — a standard Catalyst
project supplies Advanced I/O + Cron + Data Store, which is all Titan needs, so no new project is
required.

**Status:** the logic is built and tested (83 tests); bundles assemble and self-verify locally. The
only step that needs the live platform is `catalyst deploy` (requires `catalyst login`).

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

## Deploy sequence (once `catalyst login` is done)

1. `node functions/catalyst/build.mjs` → bundles.
2. `catalyst init` in each `dist/<fn>/` linking the **unused** project (IN region); create the three
   Data Store tables; set function env vars in the console.
3. `catalyst deploy` → obtain the `titan-webhook` public URL.
4. Set `ZOHO_NOTIFY_URL` + `TITAN_WEBHOOK_SECRET` locally → `provision-notifications.mjs` dry-run → commit.
5. Roadmap Stage 1: one channel, 7-day delivery measurement.
