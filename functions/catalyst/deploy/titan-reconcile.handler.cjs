/**
 * Catalyst Cron entry — titan-reconcile. DEPLOY SHELL (thin).
 * Runs the reconciliation sweep (the correctness authority). Logic in
 * reconcile-core.mjs → reconcile.mjs, both tested. SDK wiring validated at deploy.
 */

module.exports = async (event, context) => {
  try {
    const { createReconcileCore } = await import("./lib/catalyst/reconcile-core.mjs");
    const { buildRuntime } = await import("./lib/titan/runtime.mjs");
    const { catalystStore } = await import("./lib/titan/store.mjs");
    const { dataStoreAdapter } = await import("./lib/catalyst/datastore-adapter.mjs");

    const catalyst = require("zcatalyst-sdk-node").initialize(context);
    const store = catalystStore(dataStoreAdapter(catalyst));

    const run = createReconcileCore({ buildRuntime, makeStore: () => store, automationUserId: process.env.TITAN_AUTOMATION_USER_ID });
    const summary = await run(catalyst);
    context.closeWithSuccess(JSON.stringify(summary));
  } catch (err) {
    console.error(JSON.stringify({ level: "error", msg: "reconcile cron failed", error: err.message }));
    context.closeWithFailure(err.message);
  }
};
