/**
 * Reconciliation cron logic, framework-agnostic and testable. The CJS Cron
 * shell wires the Catalyst context + Data Store into this.
 *
 * Always a real (committing) sweep — the cron IS the correctness authority
 * (ADR-006 as amended). Returns the summary so the shell can log it and so a
 * non-zero `missed`/`failed` is observable in Catalyst logs and metrics.
 */

export function createReconcileCore({ buildRuntime, makeStore, automationUserId }) {
  return async function run(initArg) {
    const store = makeStore(initArg);
    const { reconciler, logger, cliq, maintainWatches } = await buildRuntime({ store, automationUserId });

    // Liveness heartbeat: record that the scheduled sweep actually FIRED, at the
    // start (before any work) and again at the end with the outcome. A stale or
    // absent heartbeat is the direct, monitorable signal that scheduled execution
    // has stopped — the failure mode that silently lapses the watch channel and
    // stops the safety net without a single error being raised. Best-effort: it
    // must never fail the sweep, and tolerates a store with no checkpoint support
    // (some tests inject a bare store).
    const beat = (phase, extra = {}) =>
      Promise.resolve(store.setCheckpoint?.("reconcile:heartbeat", { at: Date.now(), phase, ...extra }))
        .catch((e) => logger.error?.("heartbeat write failed", { error: e.message }));

    await beat("started");
    try {
      // Renew watch channels first — a lapsed channel stops delivery silently, and
      // it must never fail the sweep, so it is best-effort.
      await maintainWatches?.().catch((e) => logger.error("watch maintenance failed", { error: e.message }));

      const summary = await reconciler.sweep({ dryRun: false });
      if (summary.missed > 0 || summary.failed > 0) {
        logger.warn("reconciliation surfaced gaps", { missed: summary.missed, failed: summary.failed });
        // Surface to humans in #ops-alerts. Best-effort: a Cliq failure must never
        // fail the sweep (the sweep already did its job; this is notification).
        await cliq?.post?.("ops-alerts",
          `⚠️ Reconciliation: ${summary.missed} missed, ${summary.failed} failed (event path gap — investigate).`
        ).catch((e) => logger.error("ops-alert post failed", { error: e.message }));
      }
      await beat("ok", { missed: summary.missed, failed: summary.failed });
      return summary;
    } catch (err) {
      // Record the failed run so a heartbeat is present even on error, then let
      // the cron shell mark the job failed (closeWithFailure).
      await beat("error", { error: err.message });
      throw err;
    }
  };
}
