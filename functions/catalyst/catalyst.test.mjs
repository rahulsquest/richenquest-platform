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
import { access, readFile, readdir } from "node:fs/promises";

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

test("reconcile core writes a liveness heartbeat (started → ok) each run", async () => {
  const beats = [];
  const core = createReconcileCore({
    buildRuntime: async () => ({
      reconciler: { sweep: async () => ({ missed: 0, failed: 0 }) },
      logger: { warn: () => {}, error: () => {} }, cliq: { post: async () => {} }, maintainWatches: async () => ({ renewed: 0 }),
    }),
    makeStore: () => ({ setCheckpoint: async (k, v) => beats.push({ k, v }) }), automationUserId: "u",
  });
  await core({});
  const hb = beats.filter((b) => b.k === "reconcile:heartbeat");
  assert.equal(hb.length, 2, "one heartbeat before work, one after");
  assert.equal(hb[0].v.phase, "started");
  assert.equal(hb[1].v.phase, "ok");
  assert.equal(hb[1].v.missed, 0);
  assert.equal(typeof hb[1].v.at, "number");
});

test("reconcile core records an 'error' heartbeat when the sweep throws, then rethrows", async () => {
  const beats = [];
  const core = createReconcileCore({
    buildRuntime: async () => ({
      reconciler: { sweep: async () => { throw new Error("sweep boom"); } },
      logger: { warn: () => {}, error: () => {} }, cliq: { post: async () => {} }, maintainWatches: async () => ({ renewed: 0 }),
    }),
    makeStore: () => ({ setCheckpoint: async (k, v) => beats.push({ k, v }) }), automationUserId: "u",
  });
  await assert.rejects(() => core({}), /sweep boom/);
  const phases = beats.filter((b) => b.k === "reconcile:heartbeat").map((b) => b.v.phase);
  assert.deepEqual(phases, ["started", "error"], "heartbeat present even on failure");
});

test("reconcile core tolerates a store without checkpoint support (bare store)", async () => {
  const core = createReconcileCore({
    buildRuntime: async () => ({
      reconciler: { sweep: async () => ({ missed: 0, failed: 0 }) },
      logger: { warn: () => {}, error: () => {} }, cliq: { post: async () => {} }, maintainWatches: async () => ({ renewed: 0 }),
    }),
    makeStore: () => ({}), automationUserId: "u",
  });
  await assert.doesNotReject(() => core({}), "a heartbeat write must never break the sweep");
});

// ---- bundle assembler -----------------------------------------------------
test("build produces the Catalyst function layout with required files", async () => {
  const built = await build();
  assert.deepEqual(built.map((b) => b.name).sort(), ["record-api", "titan-reconcile", "titan-webhook"]);

  for (const b of built) {
    for (const f of ["index.js", "catalyst-config.json", "package.json", "lib"]) {
      await assert.doesNotReject(access(path.join(b.dir, f)), `${b.name} missing ${f}`);
    }
  }
  for (const b of built.filter((x) => x.name.startsWith("titan-"))) {
    await assert.doesNotReject(access(path.join(b.dir, "lib/titan/runtime.mjs")));
    await assert.doesNotReject(access(path.join(b.dir, "lib/catalyst/webhook-core.mjs")));
    await assert.doesNotReject(access(path.join(b.dir, "config/automation-events.json")));
    // Test files must never ship in a deploy bundle.
    await assert.rejects(access(path.join(b.dir, "lib/titan/titan.test.mjs")));
  }
});

/* ---- record-api bundle: self-contained ---------------------------------- */

const recordBundle = async () => (await build()).find((b) => b.name === "record-api");

test("record-api bundle carries everything the startup gate reads", async () => {
  const b = await recordBundle();
  assert.equal(b.type, "advancedio");

  for (const f of [
    "index.js",
    "package.json",
    "catalyst-config.json",
    "lib/record/api/server.mjs",
    "lib/record/api/transport.mjs",
    "lib/platform/pipeline.mjs",
    // The startup gate reads the ledger and the migration files on every boot.
    "db/migrate.mjs",
    "db/migrations/001_event_log.sql",
    "db/migrations/002_identity_vault.sql",
    // MANDATORY: createDependencies() refuses to build without it.
    "website/src/data/disclosure.json",
    // Optional, but shipped so evidence references resolve rather than degrade.
    "website/src/data/evidence.json",
  ]) {
    await assert.doesNotReject(access(path.join(b.dir, f)), `record-api missing ${f}`);
  }

  // Titan's code must not ride along, and no test file may ship.
  await assert.rejects(access(path.join(b.dir, "lib/titan")), "titan must not be bundled with the Record API");
  await assert.rejects(access(path.join(b.dir, "lib/record/api/integration.test.mjs")));
});

test("record-api declares its runtime packages, with versions derived not restated", async () => {
  const b = await recordBundle();
  const pkg = JSON.parse(await readFile(path.join(b.dir, "package.json"), "utf8"));
  const declared = JSON.parse(await readFile(path.join(HERE, "../package.json"), "utf8")).dependencies;

  assert.ok(pkg.dependencies["zcatalyst-sdk-node"], "the Catalyst SDK must be declared");

  // Every runtime package the bundle names must carry the version from
  // functions/package.json. A literal here would be a second place to bump.
  for (const name of ["pg", "@google-cloud/kms"]) {
    assert.ok(pkg.dependencies[name], `record-api must declare ${name}`);
    assert.equal(pkg.dependencies[name], declared[name], `${name} must be derived from functions/package.json`);
  }
});

test("the Cloud KMS SDK is loaded only by the deploy shell, and only when configured", async () => {
  // THE PROVIDER-AGNOSTIC INVARIANT, pinned. vault.mjs knows no provider,
  // kms.mjs knows the envelope but not Google, kms-gcp.mjs maps an INJECTED
  // client. If any of them ever imports the SDK directly, that separation is
  // gone and swapping provider stops being swapping one file — so assert it
  // rather than trusting a comment.
  // Walk with PRUNING rather than readdir({recursive:true}) + filter: the latter
  // enumerates every file under functions/node_modules before discarding them,
  // which turned this test into a 40-second one once the KMS SDK was installed.
  const dir = path.resolve(HERE, "..");
  const skip = new Set(["node_modules", "dist"]);
  async function collect(d, out = []) {
    for (const e of await readdir(d, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (!skip.has(e.name)) await collect(path.join(d, e.name), out);
      } else if (e.name.endsWith(".mjs")) {
        out.push(path.join(d, e.name));
      }
    }
    return out;
  }
  const files = await collect(dir);

  // Strip comments first: kms-gcp.mjs documents the deploy-time wiring in its
  // header, and that example contains a literal import line. Documenting how to
  // construct the client is exactly right; doing it is what must not happen.
  const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  for (const f of files) {
    const src = stripComments(await readFile(f, "utf8"));
    const loads = /(?:import\s[^;]*from\s*|import\s*\(\s*|require\s*\(\s*)["']@google-cloud\/kms["']/m.test(src);
    assert.equal(loads, false, `${path.relative(dir, f)} must not load @google-cloud/kms — the client is injected`);
  }

  // The deploy shell is the one place that may, and only behind the guard.
  const shell = await readFile(path.join(HERE, "deploy/record-api.handler.cjs"), "utf8");
  assert.match(shell, /require\("@google-cloud\/kms"\)/, "the shell constructs the client");
  assert.match(
    shell,
    /RECORD_VAULT_PROVIDER\s*!==\s*"kms"/,
    "the SDK must load only when the provider is actually kms"
  );
  assert.match(shell, /kmsClient:\s*makeKmsClient\(\)/, "the client must be injected into buildRecordApi");
});

test("record-api is baked with the least-privilege URL, never the owner's", async () => {
  // C4 makes the event log append-only BY DATABASE PRIVILEGE: record_writer holds
  // SELECT+INSERT and cannot UPDATE, DELETE or TRUNCATE. That guarantee is worth
  // nothing if the deployed function carries the OWNER credential, so assert the
  // substitution rather than trusting it.
  const OWNER = "postgresql://owner:ownerpw@db.example.neon.tech/neondb?sslmode=require";
  const APP = "postgresql://record_writer:apppw@db.example.neon.tech/neondb?sslmode=require";
  const saved = { url: process.env.DATABASE_URL, app: process.env.DATABASE_URL_APP };

  try {
    process.env.DATABASE_URL = OWNER;
    process.env.DATABASE_URL_APP = APP;
    const b = (await build()).find((x) => x.name === "record-api");
    const cfg = JSON.parse(await readFile(path.join(b.dir, "catalyst-config.json"), "utf8"));

    assert.equal(cfg.deployment.env_variables.DATABASE_URL, APP, "the function must carry record_writer");
    assert.notEqual(cfg.deployment.env_variables.DATABASE_URL, OWNER, "the owner credential must never be baked");
    assert.equal(cfg.deployment.env_variables.DATABASE_URL_APP, undefined, "substituted, not duplicated");

    // Absent app URL: build with NO database URL rather than falling back to the
    // owner. The function then refuses to start (CONFIG_MISSING) instead of
    // running with rights it must not have.
    delete process.env.DATABASE_URL_APP;
    const b2 = (await build()).find((x) => x.name === "record-api");
    const cfg2 = JSON.parse(await readFile(path.join(b2.dir, "catalyst-config.json"), "utf8"));
    assert.equal(cfg2.deployment.env_variables.DATABASE_URL, undefined, "no URL is correct; the owner's is not");
  } finally {
    if (saved.url === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = saved.url;
    if (saved.app === undefined) delete process.env.DATABASE_URL_APP; else process.env.DATABASE_URL_APP = saved.app;
  }
});

test("record-api resolves migrations and the register from INSIDE the bundle", async () => {
  const b = await recordBundle();

  // The two repository-relative paths the Record API depends on. Both are
  // computed from a module's own location, so if the bundle layout ever stops
  // mirroring the repo root these resolve outside the bundle — silently, until a
  // deploy fails. Resolving them here is what makes that a test failure instead.
  const { MIGRATIONS_DIR } = await import(path.join(b.dir, "db/migrate.mjs"));
  assert.ok(
    MIGRATIONS_DIR.startsWith(b.dir),
    `migrations resolved OUTSIDE the bundle: ${MIGRATIONS_DIR}`
  );
  await assert.doesNotReject(access(path.join(MIGRATIONS_DIR, "001_event_log.sql")));

  // server.mjs resolves the register at ../../../website/src/data from
  // lib/record/api/ — i.e. the function root. Assert the file it will read.
  const registerDir = path.resolve(b.dir, "lib/record/api", "../../../website/src/data");
  assert.ok(registerDir.startsWith(b.dir), `register resolved OUTSIDE the bundle: ${registerDir}`);
  const disclosure = JSON.parse(await readFile(path.join(registerDir, "disclosure.json"), "utf8"));
  assert.ok(disclosure, "the mandatory disclosure register must parse from inside the bundle");
});

test("record-api's modules load from inside the bundle with no missing imports", async () => {
  const b = await recordBundle();

  // Importing exercises every relative specifier in the graph. A path that
  // escaped the bundle, or a file the assembler forgot, fails here rather than
  // on Catalyst.
  const server = await import(path.join(b.dir, "lib/record/api/server.mjs"));
  const transport = await import(path.join(b.dir, "lib/record/api/transport.mjs"));
  const service = await import(path.join(b.dir, "lib/record/api/service.mjs"));

  assert.equal(typeof server.buildRecordApi, "function", "the entrypoint must export buildRecordApi");
  assert.equal(typeof server.main, "function");
  assert.equal(typeof transport.catalystHandler, "function", "the Advanced I/O adapter must be present");
  assert.equal(typeof service.createRouter, "function");
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
