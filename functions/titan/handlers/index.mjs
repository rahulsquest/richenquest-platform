/**
 * Handler registry — the contract between the engine and business logic.
 *
 * A handler is `async (record, ctx) => result`, where `record` is an
 * authenticated CRM read (never notification-supplied data) and `ctx` carries
 * {module, id, operation, subscription, logger}.
 *
 * Handlers MUST be idempotent: reconciliation and at-least-once delivery both
 * mean a handler can legitimately run twice for the same record. Check state
 * before acting rather than assuming a first run.
 *
 * Every handler named in config/automation-events.json must appear here — CI
 * (`scripts/validate-automation-events.mjs`) fails the build otherwise, because
 * a declared-but-missing handler silently discards business events.
 */

import { onLeadCreate } from "./on-lead-create.mjs";

export const handlers = {
  onLeadCreate,
};

/** Names the engine can dispatch to — used by CI validation. */
export const handlerNames = Object.keys(handlers);
