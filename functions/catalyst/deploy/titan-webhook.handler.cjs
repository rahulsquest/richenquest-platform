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

// Diagnostic/admin routes (/health, /setup-scheduling, /verify-scheduling) are
// gated behind the webhook secret — they can trigger jobs and expose runtime
// structure, so they must not be publicly callable. Pass ?key=<TITAN_WEBHOOK_SECRET>.
function diagAuth(req, res) {
  const expected = process.env.TITAN_WEBHOOK_SECRET || "";
  const key = String(req.query.key || "");
  const ok = expected && key.length === expected.length &&
    require("crypto").timingSafeEqual(Buffer.from(key), Buffer.from(expected));
  if (!ok) { res.status(403).json({ error: "forbidden" }); return false; }
  return true;
}

// Diagnostic health/readiness probe. Reports env-var PRESENCE (never values),
// CRM auth reachability, and the live Data Store table structure so the store
// adapter can be finalised against reality. Read-only.
app.get("/health", async (req, res) => {
  if (!diagAuth(req, res)) return;
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

// Idempotent scheduling setup: creates the Periodic cron (every 15 min) that
// submits the titan-reconcile job to the Job Pool. The Job Pool itself must
// pre-exist — the SDK can only READ pools (getJobpool), not create them, so the
// pool is a one-time console step. Safe to call repeatedly.
const POOL = "titanpool"; // must match the console-created Job Pool name exactly
const CRON_NAME = "titan_reconcile_15min";
app.get("/setup-scheduling", async (req, res) => {
  if (!diagAuth(req, res)) return;
  const out = {};
  try {
    const catalyst = require("zcatalyst-sdk-node").initialize(req);
    const js = catalyst.jobScheduling();

    // 1) Pool must exist (console-created).
    try { await js.getJobpool(POOL); out.pool = "found"; }
    catch (e) { out.pool = "MISSING — create a Functions job pool named '" + POOL + "' in the console: " + e.message; return res.status(200).json(out); }

    // 2) Cron: create only if absent.
    const existing = await js.CRON.getAllCron().catch(() => []);
    if ((existing || []).some((c) => c.cron_name === CRON_NAME)) { out.cron = "already exists"; return res.status(200).json(out); }

    const cron = await js.CRON.createCron({
      cron_name: CRON_NAME,
      cron_status: true,
      cron_type: "Periodic",
      cron_detail: { hour: 0, minute: 15, second: 0, repetition_type: "every" },
      job_meta: { jobpool_name: POOL, target_type: "Function", target_name: "titan-reconcile", job_name: "titan_reconcile_job" },
    });
    out.cron = "created";
    out.cron_id = cron?.cron_id ?? cron?.id ?? null;
  } catch (e) { out.error = e.message; }
  res.status(200).json(out);
});

// Verify scheduling: list crons, optionally trigger a run (?run=1), and report
// Data Store counts — reconcile writes checkpoints to titan_meta, so meta>0
// after a run proves the job executed the sweep.
app.get("/verify-scheduling", async (req, res) => {
  if (!diagAuth(req, res)) return;
  const out = {};
  try {
    const catalyst = require("zcatalyst-sdk-node").initialize(req);
    const js = catalyst.jobScheduling();
    try {
      const crons = await js.CRON.getAllCron();
      out.crons = (crons || []).map((c) => ({ name: c.cron_name, status: c.cron_status, type: c.cron_type }));
    } catch (e) { out.crons = "err: " + e.message; }
    if (req.query.run) {
      try { out.run = await js.CRON.runCron(CRON_NAME); } catch (e) { out.run = "err: " + e.message; }
    }
    const { dataStoreAdapter } = await import("./lib/catalyst/datastore-adapter.mjs");
    const a = dataStoreAdapter(catalyst);
    const count = async (t) => { try { return (await a.list(t)).length; } catch { return -1; } };
    out.counts = { meta: await count("titan_meta"), idempotency: await count("titan_idempotency"), dead_letter: await count("titan_dead_letter") };
    // Reconcile liveness heartbeat — the cron writes this each run. A stale
    // age_seconds (>> the 15-min cron interval) or a null value means scheduled
    // execution has stopped, even though nothing has errored. This is the
    // silent-failure detector for the whole self-healing layer.
    try {
      const raw = await a.get("titan_meta", "reconcile:heartbeat");
      // setCheckpoint stores the value wrapped as { value: <hb> }; unwrap it.
      const v = raw && typeof raw === "object" && "value" in raw ? raw.value : raw;
      out.reconcile_heartbeat = v
        ? { ...v, at_iso: v.at ? new Date(v.at).toISOString() : null, age_seconds: v.at ? Math.round((Date.now() - v.at) / 1000) : null }
        : null;
    } catch (e) { out.reconcile_heartbeat = "err: " + e.message; }
    // Live watch channels + expiry (renewal observable).
    try {
      const { listWatches } = await import("./lib/zoho/services/notifications.mjs");
      out.channels = (await listWatches()).map((w) => ({ id: w.channel_id, expiry: w.expiry }));
    } catch (e) { out.channels = "err: " + e.message; }
  } catch (e) { out.error = e.message; }
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
