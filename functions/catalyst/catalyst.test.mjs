/**
 * Tests for the Catalyst deploy layer: the framework-agnostic cores and the
 * bundle assembler. The CJS SDK shells (handler.js) are validated at first
 * deploy — everything they call is tested here.
 *
 * Run: node --test functions/
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { access, readFile } from "node:fs/promises";

import { createWebhookCore } from "./webhook-core.mjs";
import { createReconcileCore } from "./reconcile-core.mjs";
import { build } from "./build.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

// ---- webhook core ---------------------------------------------------------
function fakeRuntime() {
  const handled = [];
  return { calls: handled, buildRuntime: async () => ({ engine: { handle: async (n, o) => handled.push({ n, o }) } }) };
}

test("webhook core acks 200 BEFORE dispatching (never blocks on the engine)", async () => {
  const order = [];
  const rt = fakeRuntime();
  const core = createWebhookCore({
    parse: () => ({ ok: true, notification: { module: "Leads", ids: ["1"] } }),
    buildRuntime: async (...a) => { order.push("dispatch"); return rt.buildRuntime(...a); },
    makeStore: () => ({}), automationUserId: "u", webhookSecret: "s",
  });
  await core({ body: {}, initArg: {}, respond: (status) => order.push(`respond:${status}`) });
  assert.deepEqual(order, ["respond:200", "dispatch"], "must respond before it builds the runtime/dispatches");
  assert.equal(rt.calls.length, 1);
  assert.equal(rt.calls[0].o.source, "event");
});

test("webhook core acks 202 and does not dispatch on a malformed body", async () => {
  let dispatched = false;
  const core = createWebhookCore({
    parse: () => ({ ok: false, reason: "missing_module" }),
    buildRuntime: async () => { dispatched = true; return {}; },
    makeStore: () => ({}),
  });
  const res = await core({ body: {}, initArg: {}, respond: () => {} });
  assert.equal(res.acked, 202);
  assert.equal(dispatched, false);
});

test("webhook core never throws even if dispatch fails (200 already sent)", async () => {
  const core = createWebhookCore({
    parse: () => ({ ok: true, notification: { ids: ["1"] } }),
    buildRuntime: async () => { throw new Error("runtime boom"); },
    makeStore: () => ({}),
  });
  let status = 0;
  await assert.doesNotReject(() => core({ body: {}, initArg: {}, respond: (s) => (status = s) }));
  assert.equal(status, 200, "the ack must stand even when dispatch throws");
});

// ---- reconcile core -------------------------------------------------------
test("reconcile core runs a committing sweep and returns the summary", async () => {
  let dryRunSeen;
  const core = createReconcileCore({
    buildRuntime: async () => ({
      reconciler: { sweep: async ({ dryRun }) => { dryRunSeen = dryRun; return { missed: 0, failed: 0 }; } },
      logger: { warn: () => {}, error: () => {} }, cliq: { post: async () => {} }, maintainWatches: async () => ({ renewed: 0 }),
    }),
    makeStore: () => ({}), automationUserId: "u",
  });
  const summary = await core({});
  assert.equal(dryRunSeen, false, "the cron is authoritative — never a dry run");
  assert.deepEqual(summary, { missed: 0, failed: 0 });
});

test("reconcile core posts to #ops-alerts on gaps, and a Cliq failure never fails the sweep", async () => {
  const posts = [];
  const gappy = (cliq) => createReconcileCore({
    buildRuntime: async () => ({
      reconciler: { sweep: async () => ({ missed: 2, failed: 0 }) },
      logger: { warn: () => {}, error: () => {} }, cliq, maintainWatches: async () => ({ renewed: 0 }),
    }),
    makeStore: () => ({}), automationUserId: "u",
  });
  await gappy({ post: async (ch, msg) => posts.push({ ch, msg }) })({});
  assert.equal(posts[0].ch, "ops-alerts");
  assert.match(posts[0].msg, /2 missed/);
  // A throwing Cliq must not bubble out of the sweep.
  await assert.doesNotReject(() => gappy({ post: async () => { throw new Error("cliq down"); } })({}));
});

// ---- bundle assembler -----------------------------------------------------
test("build produces the Catalyst function layout with required files", async () => {
  const built = await build();
  assert.deepEqual(built.map((b) => b.name).sort(), ["titan-reconcile", "titan-webhook"]);

  for (const b of built) {
    for (const f of ["index.js", "catalyst-config.json", "package.json", "config", "lib"]) {
      await assert.doesNotReject(access(path.join(b.dir, f)), `${b.name} missing ${f}`);
    }
    await assert.doesNotReject(access(path.join(b.dir, "lib/titan/runtime.mjs")));
    await assert.doesNotReject(access(path.join(b.dir, "lib/catalyst/webhook-core.mjs")));
    await assert.doesNotReject(access(path.join(b.dir, "config/automation-events.json")));
    // Test files must never ship in a deploy bundle.
    await assert.rejects(access(path.join(b.dir, "lib/titan/titan.test.mjs")));
  }
});

test("catalyst-config.json matches the real scaffold schema", async () => {
  const [webhook] = (await build()).filter((b) => b.name === "titan-webhook");
  const cfg = JSON.parse(await readFile(path.join(webhook.dir, "catalyst-config.json"), "utf8"));
  assert.equal(cfg.deployment.type, "advancedio");
  assert.equal(cfg.deployment.stack, "node18");
  assert.equal(cfg.execution.main, "index.js");
  const pkg = JSON.parse(await readFile(path.join(webhook.dir, "package.json"), "utf8"));
  assert.ok(pkg.dependencies["zcatalyst-sdk-node"], "SDK must be a declared dependency");
});

test("the assembled bundle's runtime imports + loads config from within the bundle", async () => {
  const [webhook] = (await build()).filter((b) => b.name === "titan-webhook");
  // Proves every relative import resolves inside the bundle AND config/ is
  // found at runtime.mjs's two-level ROOT (lib/titan → function root → config/).
  const { buildRuntime } = await import(path.join(webhook.dir, "lib/titan/runtime.mjs"));
  const { memoryStore } = await import(path.join(webhook.dir, "lib/titan/store.mjs"));
  const rt = await buildRuntime({ store: memoryStore(), automationUserId: "u", webhookSecret: "s" });
  assert.ok(rt.engine && rt.reconciler, "buildRuntime must wire an engine + reconciler from the bundle");
  assert.ok(rt.subscriptions.subscriptions.length > 0, "config loaded from inside the bundle");
});
