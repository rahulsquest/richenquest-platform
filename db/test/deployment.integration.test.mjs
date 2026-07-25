/**
 * Migration runner + startup gate — INTEGRATION tests against real PostgreSQL.
 *
 * The migration runner is the one component whose failure mode is unrecoverable:
 * a half-applied schema on an append-only log cannot be repaired by rolling back
 * data. So it is tested against a real server, not a fake.
 */

import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";

import { migrate, status, loadMigrations, MigrationError } from "../migrate.mjs";
import {
  assertServerVersion, prepareDatabase, readConfig, StartupError,
  MIN_POSTGRES_MAJOR, TESTED_POSTGRES_VERSION,
} from "../../functions/record/api/bootstrap.mjs";
import { kmsKeyProvider, fakeKmsClient, KmsError } from "../../functions/record/identity/kms.mjs";
import { identityVault, memoryVaultStore } from "../../functions/record/identity/vault.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REAL_MIGRATIONS = path.join(HERE, "..", "migrations");
const PORT = 55000 + Math.floor(Math.random() * 900);

let engine, pool, dataDir;

before(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), "rq-pg-dep-"));
  engine = new EmbeddedPostgres({
    databaseDir: dataDir, user: "postgres", password: "postgres", port: PORT, persistent: false,
  });
  await engine.initialise();
  await engine.start();
  await engine.createDatabase("deploy_test");
  pool = new pg.Pool({ host: "localhost", port: PORT, user: "postgres", password: "postgres", database: "deploy_test", max: 4 });
}, { timeout: 180_000 });

after(async () => {
  await pool?.end();
  await engine?.stop();
  if (dataDir) await rm(dataDir, { recursive: true, force: true });
});

/** A scratch database per test, so migration state never bleeds between them. */
async function freshDb(name) {
  await pool.query(`DROP DATABASE IF EXISTS ${name}`);
  await pool.query(`CREATE DATABASE ${name}`);
  const client = new pg.Client({ host: "localhost", port: PORT, user: "postgres", password: "postgres", database: name });
  await client.connect();
  return client;
}

/* ═══════════════════════════════════════════════════ migration runner ═══ */

test("[deploy] applies the real migrations and is idempotent", async () => {
  const db = await freshDb("m_apply");
  try {
    const first = await migrate(db, { logger: {} });
    assert.deepEqual(first.applied, ["001"]);

    const second = await migrate(db, { logger: {} });
    assert.deepEqual(second.applied, [], "re-running must apply nothing");
    assert.equal(second.alreadyApplied, 1);

    const s = await status(db);
    assert.equal(s.pending.length, 0);
    assert.equal(s.drift.length, 0);

    const ledger = await db.query("SELECT version, name, duration_ms FROM schema_migrations");
    assert.equal(ledger.rows[0].version, "001");
    assert.ok(ledger.rows[0].duration_ms >= 0);
  } finally {
    await db.end();
  }
});

test("[deploy] REFUSES to run when an applied migration has been edited", async () => {
  const db = await freshDb("m_drift");
  const dir = await mkdtemp(path.join(tmpdir(), "rq-mig-"));
  try {
    await writeFile(path.join(dir, "001_initial.sql"), "CREATE TABLE t1 (id int);");
    await migrate(db, { dir, logger: {} });

    // Someone edits history rather than adding a migration.
    await writeFile(path.join(dir, "001_initial.sql"), "CREATE TABLE t1 (id bigint);");

    await assert.rejects(
      () => migrate(db, { dir, logger: {} }),
      (err) => err instanceof MigrationError && err.code === "CHECKSUM_DRIFT",
      "the database and the repository disagreeing about the schema must halt the deploy"
    );

    const s = await status(db, dir);
    assert.equal(s.drift.length, 1);
  } finally {
    await db.end();
    await rm(dir, { recursive: true, force: true });
  }
});

test("[deploy] a failing migration rolls back whole — no partial schema", async () => {
  const db = await freshDb("m_rollback");
  const dir = await mkdtemp(path.join(tmpdir(), "rq-mig-"));
  try {
    await writeFile(
      path.join(dir, "001_partial.sql"),
      "CREATE TABLE good (id int); CREATE TABLE bad (id int) PARTITION BY NONSENSE (id);"
    );
    await assert.rejects(() => migrate(db, { dir, logger: {} }), (e) => e.code === "APPLY_FAILED");

    const tables = await db.query(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN ('good','bad')"
    );
    assert.equal(tables.rows.length, 0, "a half-applied schema on an append-only log is unrecoverable");

    const ledger = await db.query("SELECT count(*)::int AS n FROM schema_migrations");
    assert.equal(ledger.rows[0].n, 0, "a failed migration must not be recorded as applied");
  } finally {
    await db.end();
    await rm(dir, { recursive: true, force: true });
  }
});

test("[deploy] concurrent migration runs are serialised by the advisory lock", async () => {
  const a = await freshDb("m_lock");
  const b = new pg.Client({ host: "localhost", port: PORT, user: "postgres", password: "postgres", database: "m_lock" });
  await b.connect();
  try {
    // Two instances booting at once. Exactly one applies; the other observes an
    // up-to-date schema rather than colliding.
    const [ra, rb] = await Promise.all([migrate(a, { logger: {} }), migrate(b, { logger: {} })]);
    const appliedCount = ra.applied.length + rb.applied.length;
    assert.equal(appliedCount, 1, "only one instance may apply a migration");

    const ledger = await a.query("SELECT count(*)::int AS n FROM schema_migrations");
    assert.equal(ledger.rows[0].n, 1);
  } finally {
    await a.end();
    await b.end();
  }
});

test("[deploy] dry-run reports pending work and changes nothing", async () => {
  const db = await freshDb("m_dry");
  try {
    const res = await migrate(db, { dryRun: true, logger: {} });
    assert.deepEqual(res.pending, ["001"]);
    assert.equal(res.dryRun, true);
    const tables = await db.query("SELECT tablename FROM pg_tables WHERE tablename = 'events'");
    assert.equal(tables.rows.length, 0, "dry-run must not create anything");
  } finally {
    await db.end();
  }
});

test("[deploy] malformed or out-of-order migration filenames are refused", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "rq-mig-"));
  try {
    await writeFile(path.join(dir, "not-a-migration.sql"), "SELECT 1;");
    await assert.rejects(() => loadMigrations(dir), (e) => e.code === "BAD_FILENAME");

    await rm(path.join(dir, "not-a-migration.sql"));
    await writeFile(path.join(dir, "001_a.sql"), "SELECT 1;");
    await writeFile(path.join(dir, "003_c.sql"), "SELECT 1;"); // 002 missing
    await assert.rejects(() => loadMigrations(dir), (e) => e.code === "VERSION_GAP");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

/* ═══════════════════════════════════════════════════════ startup gate ═══ */

test("[deploy] server version is checked and the pin is honoured", async () => {
  const v = await assertServerVersion(pool);
  assert.ok(v.major >= MIN_POSTGRES_MAJOR, `running ${v.version}, minimum ${MIN_POSTGRES_MAJOR}`);
  assert.equal(String(v.major), TESTED_POSTGRES_VERSION.split(".")[0], "tests must run the version we claim to test");

  const ancient = { query: async () => ({ rows: [{ server_version: "12.19" }] }) };
  await assert.rejects(
    () => assertServerVersion(ancient),
    (e) => e instanceof StartupError && e.code === "VERSION_TOO_OLD"
  );
});

test("[deploy] prepareDatabase migrates then verifies constraints", async () => {
  const db = await freshDb("m_prepare");
  try {
    await prepareDatabase(db, { logger: {} });
    const s = await status(db);
    assert.equal(s.pending.length, 0);
    // assertSchema ran inside prepareDatabase; prove the constraints are real.
    const constraints = await db.query(
      `SELECT conname FROM pg_constraint WHERE conrelid = 'events'::regclass`
    );
    const names = constraints.rows.map((r) => r.conname);
    assert.ok(names.includes("events_pkey"));
    assert.ok(names.includes("events_event_id_unique"));
  } finally {
    await db.end();
  }
});

test("[deploy] startup refuses when migrations are pending and auto-migrate is off", async () => {
  const db = await freshDb("m_pending");
  try {
    await assert.rejects(
      () => prepareDatabase(db, { runMigrations: false, logger: {} }),
      (e) => e.code === "MIGRATIONS_PENDING",
      "serving traffic against an unmigrated schema must be impossible"
    );
  } finally {
    await db.end();
  }
});

/* ══════════════════════════════════════════════════════════ config ══════ */

test("[deploy] configuration is validated before anything connects", () => {
  const base = {
    DATABASE_URL: "postgres://x", RECORD_TOKEN_SECRET: "a".repeat(32),
    NODE_ENV: "development",
  };
  assert.equal(readConfig(base).poolMax, 10);

  assert.throws(() => readConfig({}), (e) => e.code === "CONFIG_MISSING");
  assert.throws(
    () => readConfig({ ...base, RECORD_TOKEN_SECRET: "short" }),
    (e) => e.code === "WEAK_SECRET"
  );
  // Production must not run on the development key provider.
  assert.throws(
    () => readConfig({ ...base, NODE_ENV: "production", CORS_ALLOWED_ORIGINS: "https://a.com" }),
    (e) => e.code === "INSECURE_KEY_PROVIDER"
  );
  // …and must name its callers.
  assert.throws(
    () => readConfig({ ...base, NODE_ENV: "production", RECORD_VAULT_PROVIDER: "kms" }),
    (e) => e.code === "CORS_UNCONFIGURED"
  );
  assert.equal(
    readConfig({ ...base, NODE_ENV: "production", RECORD_VAULT_PROVIDER: "kms", CORS_ALLOWED_ORIGINS: "https://a.com" })
      .corsAllowed.length,
    1
  );
});

/* ══════════════════════════════════════════════ KMS abstraction only ════ */

test("[deploy] KMS provider satisfies the vault's key-provider interface", async () => {
  // NOT a claim that any real KMS works. This proves only that the abstraction
  // fits the interface the vault requires.
  const provider = kmsKeyProvider(fakeKmsClient(), { keyId: "arn:fake:key/1", version: "v1" });
  const vault = identityVault(memoryVaultStore(), provider);

  await vault.put("sub_kms", "legal_name", "Aarav Kumar");
  assert.equal(await vault.get("sub_kms", "legal_name"), "Aarav Kumar");

  const receipt = await vault.erase("sub_kms");
  assert.equal(receipt.fields_shredded, 1);
});

test("[deploy] KMS failures never leak provider detail", async () => {
  const provider = kmsKeyProvider(fakeKmsClient({ failing: true }), { keyId: "arn:fake:key/1" });
  await assert.rejects(
    () => provider.wrapKey(),
    (e) => e instanceof KmsError && e.code === "KMS_UNAVAILABLE"
  );

  const unknown = kmsKeyProvider(fakeKmsClient(), { keyId: "k", version: "v2" });
  await assert.rejects(() => unknown.unwrapKey("v1"), (e) => e.code === "UNKNOWN_KEK_VERSION");
});

test("[deploy] KMS provider rejects a malformed client and purges cached keys", async () => {
  assert.throws(() => kmsKeyProvider({}, { keyId: "k" }), (e) => e.code === "BAD_CLIENT");
  assert.throws(() => kmsKeyProvider(fakeKmsClient(), {}), (e) => e.code === "NO_KEY_ID");

  const provider = kmsKeyProvider(fakeKmsClient(), { keyId: "k" });
  await provider.wrapKey();
  assert.equal(provider.purgeCache(), 1, "cached key material must be droppable after an erasure");
  assert.equal((await provider.healthCheck()).ok, true);
});
