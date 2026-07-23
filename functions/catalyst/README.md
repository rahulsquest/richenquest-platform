# Catalyst deployment plan (ready to execute at B3)

The Titan automation engine (`functions/titan/`) and Zoho clients (`functions/zoho/`) are built,
tested (71 tests), and runtime-verified against production. This directory holds the **Catalyst
deployment layer** — the thin adapter that hosts that tested code as serverless functions.

**Status:** structure verified against Catalyst's documented function layout; **end-to-end deploy is
gated on B3** (Catalyst project + `catalyst login`). Nothing here is deployed. `parse-notification.mjs`
is pure and already unit-tested; the wrapper templates below are finalised at deploy, when the SDK
and project id are available to test against.

## Two functions

| Function | Type | Trigger | Calls | Timeout |
|---|---|---|---|---|
| `titan-webhook` | Advanced I/O | Zoho `actions/watch` POST | `engine.handle()` | 30s — must ack in <1s |
| `titan-reconcile` | Cron | every 15 min | `reconciler.sweep()` | 15 min |

## How the tested code plugs in

Both functions are **thin**. All logic is in `functions/titan/runtime.mjs` (the composition root),
which is already tested. The webhook adapter does exactly three things:

1. `parseZohoNotification(req.body)` — pure, tested (`parse-notification.mjs`).
2. verify + `engine.handle(notification)` — the engine applies every safety guard.
3. **return 200 immediately** — Zoho's retry behaviour is undocumented (ADR-006), so we ack fast and
   let reconciliation guarantee correctness.

### `titan-webhook` — Advanced I/O (Express), documented shape

```
functions/catalyst/titan-webhook/
├── catalyst-config.json     # { "deployment": { "name":"titan-webhook", "stack":"nodejs18",
│                            #     "type":"advancedio", "memory":256 } }
├── handler.js               # entry point → requires ./server
└── server/index.js          # Express app (below)
```

```js
// server/index.js — finalised at B3 (needs zcatalyst-sdk-node + Data Store, testable only on-platform)
const express = require("express");
const app = express();
app.use(express.json());

app.post("/", async (req, res) => {
  // Dynamic import bridges CJS (Catalyst) → ESM (our engine).
  const { buildRuntime } = await import("../../../titan/runtime.mjs");
  const { parseZohoNotification } = await import("../../parse-notification.mjs");
  const { catalystStore } = await import("../../../titan/store.mjs");

  const parsed = parseZohoNotification(req.body);
  if (!parsed.ok) return res.status(202).json({ ignored: parsed.reason }); // ack, never retry junk

  const catalyst = require("zcatalyst-sdk-node").initialize(req);
  const store = catalystStore(dataStoreClient(catalyst)); // adapter already contract-tested
  const { engine } = await buildRuntime({ store, automationUserId: process.env.TITAN_AUTOMATION_USER_ID });

  // Ack FIRST, process after — correctness comes from reconciliation, not this response.
  res.status(200).json({ received: true });
  engine.handle(parsed.notification).catch((e) => console.error(JSON.stringify({ level: "error", msg: "engine", error: e.message })));
});
module.exports = app;
```

### `titan-reconcile` — Cron

```js
// index.js — finalised at B3
module.exports = async (event, context) => {
  const { buildRuntime } = await import("../../titan/runtime.mjs");
  const { catalystStore } = await import("../../titan/store.mjs");
  const catalyst = require("zcatalyst-sdk-node").initialize(context);
  const store = catalystStore(dataStoreClient(catalyst));
  const { reconciler } = await buildRuntime({ store, automationUserId: process.env.TITAN_AUTOMATION_USER_ID });
  const summary = await reconciler.sweep({ dryRun: false });
  context.closeWithSuccess(JSON.stringify(summary));
};
```

## Data Store tables (created at B3)

The `catalystStore` adapter (in `store.mjs`, contract-tested) expects three tables:
`titan_idempotency` (key, expiresAt), `titan_meta` (name, value — reconciliation checkpoints),
`titan_dead_letter` (append-only). Schema created via the Catalyst console or CLI at deploy.

## Environment (Catalyst function env vars — never in code)

Same names as `.env`: `ZOHO_CLIENT_ID/_SECRET/_REFRESH_TOKEN`, `ZOHO_DC=in`, plus
`ZOHO_NOTIFY_URL` (the deployed webhook URL), `TITAN_WEBHOOK_SECRET` (HMAC secret for the callback
token — **must match** the value used at provisioning), and `TITAN_AUTOMATION_USER_ID` (the CRM user
our writes run as — powers the loop-breaker).

## Deploy sequence (at B3)

1. `catalyst init` in this directory → link the `titan` project (IN region).
2. Create the three Data Store tables.
3. Set function env vars (from the local `.env`, entered in the Catalyst console — no secret in chat).
4. `catalyst deploy` → obtain the `titan-webhook` public URL.
5. Set `ZOHO_NOTIFY_URL` locally → `provision-notifications.mjs` dry-run → commit.
6. Roadmap Stage 1: one channel, 7-day delivery measurement.
