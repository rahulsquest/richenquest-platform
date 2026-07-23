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
    return summary;
  };
}
