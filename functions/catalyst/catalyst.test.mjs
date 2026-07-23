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
import { access } from "node:fs/promises";

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
      logger: { warn: () => {} },
    }),
    makeStore: () => ({}), automationUserId: "u",
  });
  const summary = await core({});
  assert.equal(dryRunSeen, false, "the cron is authoritative — never a dry run");
  assert.deepEqual(summary, { missed: 0, failed: 0 });
});

// ---- bundle assembler -----------------------------------------------------
test("build produces self-contained bundles whose imports resolve locally", async () => {
  const built = await build();
  const names = built.map((b) => b.name).sort();
  assert.deepEqual(names, ["titan-reconcile", "titan-webhook"]);

  for (const b of built) {
    // Each bundle must carry its entry, config, and the local copies its
    // imports need — nothing may escape the function directory.
    for (const f of ["handler.js", "catalyst-config.json", "config", "functions"]) {
      await assert.doesNotReject(access(path.join(b.dest, f)), `${b.name} missing ${f}`);
    }
    await assert.doesNotReject(access(path.join(b.dest, "functions/titan/runtime.mjs")));
    await assert.doesNotReject(access(path.join(b.dest, "functions/catalyst/webhook-core.mjs")));
    await assert.doesNotReject(access(path.join(b.dest, "config/automation-events.json")));
  }
});

test("the assembled bundle's runtime imports + loads config from within the bundle", async () => {
  const [webhookBundle] = (await build()).filter((b) => b.name === "titan-webhook");
  // Importing the bundled runtime proves every relative import resolves inside
  // the bundle AND that config/ is found at runtime.mjs's expected ROOT.
  const { buildRuntime } = await import(path.join(webhookBundle.dest, "functions/titan/runtime.mjs"));
  const { memoryStore } = await import(path.join(webhookBundle.dest, "functions/titan/store.mjs"));
  const rt = await buildRuntime({ store: memoryStore(), automationUserId: "u", webhookSecret: "s" });
  assert.ok(rt.engine && rt.reconciler, "buildRuntime must wire an engine + reconciler from the bundle");
  assert.ok(rt.subscriptions.subscriptions.length > 0, "config loaded from inside the bundle");
});
