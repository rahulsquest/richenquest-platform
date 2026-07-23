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
    const { reconciler, logger } = await buildRuntime({ store, automationUserId });
    const summary = await reconciler.sweep({ dryRun: false });
    if (summary.missed > 0 || summary.failed > 0) {
      logger.warn("reconciliation surfaced gaps", { missed: summary.missed, failed: summary.failed });
    }
    return summary;
  };
}
