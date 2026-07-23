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
import { listWatches, createWatches, planWatches, toWatchPayload } from "../zoho/services/notifications.mjs";
import { channelToken } from "./webhook-auth.mjs";
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

  /**
   * Renew watch channels before they lapse. Zoho channels expire (≤1 week), and
   * a lapsed channel stops event delivery silently — so the reconcile cron calls
   * this each run. Idempotent: only expiring/changed channels are rewritten.
   */
  async function maintainWatches() {
    const notifyUrl = process.env.ZOHO_NOTIFY_URL;
    const secret = process.env.TITAN_WEBHOOK_SECRET;
    if (!notifyUrl || !secret) return { skipped: "missing ZOHO_NOTIFY_URL/TITAN_WEBHOOK_SECRET" };
    const live = await listWatches();
    const { plan } = planWatches(subscriptions, live, notifyUrl);
    const actionable = plan.filter((p) => p.action === "create" || p.action === "update" || p.action === "renew");
    if (!actionable.length) return { renewed: 0 };
    const payload = actionable.map((p) => toWatchPayload(p, notifyUrl, subscriptions.expiry_hours ?? 24, channelToken(p.channel_id, secret)));
    const res = await createWatches(payload);
    const ok = res.filter((r) => r.ok).length;
    logger.info("watch channels maintained", { renewed: ok, of: actionable.length });
    return { renewed: ok };
  }

  return { engine, reconciler, store: st, logger, metrics, subscriptions, tenant, cliq, maintainWatches };
}
