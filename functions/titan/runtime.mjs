/**
 * Composition root — wires the Titan engine and reconciler to REAL Zoho
 * dependencies. The same wiring is used by the CLI runners and (later) by the
 * Catalyst webhook and cron functions, so production and local runs exercise
 * identical code.
 *
 * Everything the engine needs is injected here and nowhere else: this is the
 * only module that imports both the pure engine and the live Zoho clients.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getRecord, coql, createOrUpdateLead } from "../zoho/services/crm.mjs";
import * as cliqSvc from "../zoho/services/cliq.mjs";
import { zohoRequest } from "../zoho/client.mjs";
import { createEngine } from "./engine.mjs";
import { createReconciler } from "./reconcile.mjs";
import { createLogger, createMetrics } from "./logger.mjs";
import { memoryStore } from "./store.mjs";
import { handlers } from "./handlers/index.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const readJson = async (p) => JSON.parse(await readFile(path.join(ROOT, p), "utf8"));

/** Minimal CRM writer exposed to handlers — kept narrow on purpose. */
function crmForHandlers() {
  return {
    updateLead: (id, fields) =>
      zohoRequest("crm", "/Leads", { method: "PUT", apiVersion: "v8", body: { data: [{ id, ...fields }] } }),
    createOrUpdateLead,
  };
}

/** Cliq poster exposed to handlers (heartbeats + alerts). */
function cliqForHandlers() {
  return { post: (channel, text) => cliqSvc.postToChannel(channel, text) };
}

/**
 * Build a fully-wired runtime.
 * @param {{store?, automationUserId?, level?}} [opts]
 */
export async function buildRuntime({ store, automationUserId, level = "info" } = {}) {
  const subscriptions = await readJson("config/automation-events.json");
  const tenant = await readJson("config/tenant-richenquest.json");
  const logger = createLogger({ level });
  const metrics = createMetrics();
  const st = store ?? memoryStore();

  // Handlers receive shared deps (tenant config + narrow CRM/Cliq clients)
  // bound once, so a handler signature stays (record, ctx).
  const cliq = cliqForHandlers();
  const deps = { tenant, crm: crmForHandlers(), cliq };
  const boundHandlers = Object.fromEntries(
    Object.entries(handlers).map(([name, fn]) => [name, (record, ctx) => fn(record, { ...ctx, deps })])
  );

  const engine = createEngine({
    store: st,
    fetchRecord: getRecord,
    handlers: boundHandlers,
    subscriptions,
    automationUserId,
    logger,
    metrics,
  });

  const reconciler = createReconciler({ query: coql, engine, store: st, subscriptions, logger, metrics });

  return { engine, reconciler, store: st, logger, metrics, subscriptions, tenant, cliq };
}
