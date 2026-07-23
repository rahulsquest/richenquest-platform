/**
 * Catalyst Cron entry — titan-reconcile. DEPLOY SHELL (thin).
 * Runs the reconciliation sweep (the correctness authority). Logic in
 * reconcile-core.mjs → reconcile.mjs, both tested. SDK wiring validated at deploy.
 */

module.exports = async (event, context) => {
  try {
    const { createReconcileCore } = await import("./functions/catalyst/reconcile-core.mjs");
    const { buildRuntime } = await import("./functions/titan/runtime.mjs");
    const { catalystStore } = await import("./functions/titan/store.mjs");

    const catalyst = require("zcatalyst-sdk-node").initialize(context);
    const ds = catalyst.datastore();
    const store = catalystStore({
      get: async (t, k) => (await ds.table(t).getRow(k).catch(() => null)) || null,
      put: async (t, k, v) => ds.table(t).insertRow({ ROWID: k, ...v }),
      delete: async (t, k) => ds.table(t).deleteRow(k),
      append: async (t, r) => ds.table(t).insertRow(r),
      list: async (t) => (await ds.table(t).getPagedRows()).data || [],
    });

    const run = createReconcileCore({ buildRuntime, makeStore: () => store, automationUserId: process.env.TITAN_AUTOMATION_USER_ID });
    const summary = await run(catalyst);
    context.closeWithSuccess(JSON.stringify(summary));
  } catch (err) {
    console.error(JSON.stringify({ level: "error", msg: "reconcile cron failed", error: err.message }));
    context.closeWithFailure(err.message);
  }
};
