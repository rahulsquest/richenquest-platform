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

app.post("/", async (req, res) => {
  const { createWebhookCore } = await import("./lib/catalyst/webhook-core.mjs");
  const { parseZohoNotification } = await import("./lib/catalyst/parse-notification.mjs");
  const { buildRuntime } = await import("./lib/titan/runtime.mjs");
  const { catalystStore } = await import("./lib/titan/store.mjs");

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

/** Maps the Catalyst Data Store SDK onto the tiny { get,put,delete,append,list } contract
 *  that store.mjs → catalystStore expects. Finalised against the live SDK at deploy. */
function dataStoreAdapter(catalyst) {
  const ds = catalyst.datastore();
  return {
    get: async (table, key) => { const r = await ds.table(table).getRow(key).catch(() => null); return r || null; },
    put: async (table, key, value) => ds.table(table).insertRow({ ROWID: key, ...value }),
    delete: async (table, key) => ds.table(table).deleteRow(key),
    append: async (table, row) => ds.table(table).insertRow(row),
    list: async (table) => ds.table(table).getPagedRows().then((r) => r.data || []),
  };
}

module.exports = app;
