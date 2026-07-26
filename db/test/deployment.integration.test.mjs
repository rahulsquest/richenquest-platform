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
import { randomBytes } from "node:crypto";
import { kmsKeyProvider, fakeKmsClient, KmsError } from "../../functions/record/identity/kms.mjs";
import { identityVault, memoryVaultStore, SubjectErased, KEY_BYTES } from "../../functions/record/identity/vault.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REAL_MIGRATIONS = path.join(HERE, "..", "migrations");
// 90 wide, not 900: `node --test` runs these files concurrently, and a 900-wide
// window from 55000 straddles the windows vault (55100+), kms-api (55300+),
// smoke (55500+) and performance (55700+) draw from — so two suites could bind
// the same port and one would fail to start. Every suite now owns a disjoint
// 90-port block.
const PORT = 55000 + Math.floor(Math.random() * 90);

/**
 * Derived from the migrations directory, never hardcoded. These tests assert how
 * the RUNNER behaves — applies each once, serialises concurrent runs, changes
 * nothing on a dry run — and none of that depends on how many migrations exist.
 * Pinning a count here just means every future migration breaks three tests that
 * were not testing the count.
 */
const ALL_VERSIONS = (await loadMigrations(REAL_MIGRATIONS)).map((m) => m.version);

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
    assert.deepEqual(first.applied, ALL_VERSIONS);

    const second = await migrate(db, { logger: {} });
    assert.deepEqual(second.applied, [], "re-running must apply nothing");
    assert.equal(second.alreadyApplied, ALL_VERSIONS.length);

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
    assert.equal(appliedCount, ALL_VERSIONS.length, "each migration is applied exactly once across both instances");

    const ledger = await a.query("SELECT count(*)::int AS n FROM schema_migrations");
    assert.equal(ledger.rows[0].n, ALL_VERSIONS.length);
  } finally {
    await a.end();
    await b.end();
  }
});

test("[deploy] dry-run reports pending work and changes nothing", async () => {
  const db = await freshDb("m_dry");
  try {
    const res = await migrate(db, { dryRun: true, logger: {} });
    assert.deepEqual(res.pending, ALL_VERSIONS);
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

/* ═══════════════════════════════════════════════ KMS — deployment wiring ══ */
// The KMS provider's behaviour — envelope round trip, subject AAD binding,
// rotation, crypto-shredding, failure opacity — is covered exhaustively by
// functions/record/identity/kms.test.mjs, and against real PostgreSQL by
// db/test/vault.integration.test.mjs. Here we assert only what belongs to the
// deployment story: that a KMS-backed vault is what production wires and that it
// round-trips, and that a KMS outage stays opaque.

test("[deploy] a KMS-backed vault is what production wires, and it round-trips", async () => {
  const provider = kmsKeyProvider(fakeKmsClient(), {
    keyId: "projects/p/locations/l/keyRings/r/cryptoKeys/vault-kek",
    version: "v1",
  });
  const vault = identityVault(memoryVaultStore(), provider);

  await vault.putAll("sub_kms", { legal_name: "Aarav Kumar", dob: "2004-03-11" });
  assert.equal(await vault.get("sub_kms", "legal_name"), "Aarav Kumar");
  assert.equal((await provider.healthCheck()).ok, true, "the readiness probe passes");

  const receipt = await vault.erase("sub_kms");
  assert.equal(receipt.fields_shredded, 2);
  await assert.rejects(() => vault.get("sub_kms", "legal_name"), (e) => e instanceof SubjectErased);
});

test("[deploy] a KMS outage is refused opaquely, and a malformed client is refused at construction", async () => {
  assert.throws(() => kmsKeyProvider({}, { keyId: "k" }), (e) => e.code === "BAD_CLIENT");
  assert.throws(() => kmsKeyProvider(fakeKmsClient(), {}), (e) => e.code === "NO_KEY_ID");

  const provider = kmsKeyProvider(fakeKmsClient({ failing: true }), { keyId: "k" });
  await assert.rejects(
    () => provider.wrapDataKey("sub_kms", randomBytes(KEY_BYTES)),
    (e) => e instanceof KmsError && e.code === "KMS_UNAVAILABLE"
  );
});
