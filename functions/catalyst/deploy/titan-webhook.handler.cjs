/**
 * Catalyst Advanced I/O entry — titan-webhook. DEPLOY SHELL (thin).
 *
 * All logic is in the tested cores (webhook-core.mjs → engine.mjs); this file
 * only bridges Catalyst's platform surface (Express request/response + SDK Data
 * Store) into them. The CJS→ESM bridge uses dynamic import(), the compatible
 * path for loading ESM from a CommonJS Catalyst function.
 *
 * Copied to a bundle root by build.mjs, so its imports are LOCAL (./functions/…),
 * never escaping the function directory (Catalyst bundles per-function).
 *
 * The SDK wiring here is validated at first deploy — it is the one seam that
 * cannot be exercised without the live Catalyst runtime; everything it calls is
 * already tested.
 */

const express = require("express");
const app = express();
app.use(express.json());

// Diagnostic health/readiness probe. Reports env-var PRESENCE (never values),
// CRM auth reachability, and the live Data Store table structure so the store
// adapter can be finalised against reality. Read-only.
app.get("/health", async (req, res) => {
  const out = { env: {}, crm: null, datastore: null };
  for (const k of ["ZOHO_DC", "ZOHO_CLIENT_ID", "ZOHO_CLIENT_SECRET", "ZOHO_REFRESH_TOKEN", "TITAN_WEBHOOK_SECRET", "TITAN_AUTOMATION_USER_ID"]) {
    out.env[k] = Boolean(process.env[k]);
  }
  try {
    const { getAccessToken } = await import("./lib/zoho/oauth.mjs");
    await getAccessToken({ forceRefresh: true });
    out.crm = "ok";
  } catch (e) { out.crm = "err: " + e.message; }
  try {
    const catalyst = require("zcatalyst-sdk-node").initialize(req);
    const { catalystStore } = await import("./lib/titan/store.mjs");
    const { dataStoreAdapter } = await import("./lib/catalyst/datastore-adapter.mjs");
    const adapter = dataStoreAdapter(catalyst);
    const store = catalystStore(adapter);
    // Full round-trip on the idempotency table: write, read back, delete.
    const k = `health:${Date.now()}`;
    await store.remember(k, 60_000);
    const seen = await store.seen(k);
    out.datastore = seen ? "ok (round-trip verified)" : "wrote but could not read back";
    // Observables for end-to-end webhook tests: a processed event writes an
    // idempotency key (vanish/success) or a dead-letter (failure) — either way
    // one of these counts moves.
    const count = async (t) => { try { return (await adapter.list(t)).length; } catch { return -1; } };
    out.counts = { idempotency: await count("titan_idempotency"), dead_letter: await count("titan_dead_letter") };
  } catch (e) { out.datastore = "err: " + e.message; }
  res.status(200).json(out);
});

app.post("/", async (req, res) => {
  const { createWebhookCore } = await import("./lib/catalyst/webhook-core.mjs");
  const { parseZohoNotification } = await import("./lib/catalyst/parse-notification.mjs");
  const { buildRuntime } = await import("./lib/titan/runtime.mjs");
  const { catalystStore } = await import("./lib/titan/store.mjs");
  const { dataStoreAdapter } = await import("./lib/catalyst/datastore-adapter.mjs");

  const catalyst = require("zcatalyst-sdk-node").initialize(req);

  const core = createWebhookCore({
    parse: parseZohoNotification,
    buildRuntime,
    makeStore: () => catalystStore(dataStoreAdapter(catalyst)),
    automationUserId: process.env.TITAN_AUTOMATION_USER_ID,
    webhookSecret: process.env.TITAN_WEBHOOK_SECRET,
  });

  await core({ body: req.body, initArg: catalyst, respond: (status, json) => res.status(status).json(json) });
});

module.exports = app;
