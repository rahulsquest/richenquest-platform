/**
 * The composition root, against a REAL PostgreSQL server.
 *
 * functions/record/api/server.test.mjs proves the fail-fast ORDER with a fake
 * pool — configuration and provider errors before any connection. It cannot
 * prove the happy path, because doing so would require hand-rolling PostgreSQL's
 * catalog until assertSchema() and assertVaultSchema() are satisfied, which tests
 * the fake rather than the boot.
 *
 * This does the opposite: a real migrated database, the real startup gate, the
 * real provider selection, and the real router — everything a deployment runs,
 * short of listening on a socket.
 */
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";

import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";

import { buildRecordApi } from "../../functions/record/api/server.mjs";
import { KEY_BYTES } from "../../functions/record/identity/vault.mjs";
import { migrate } from "../migrate.mjs";

// 90 wide and disjoint from every other suite's window (see deployment's note).
const PG_PORT = 55900 + Math.floor(Math.random() * 90);
const SECRET = "s".repeat(40);
const KEK = randomBytes(KEY_BYTES).toString("base64");

let engine, pool, dataDir, url;
const quiet = { debug() {}, info() {}, warn() {}, error() {} };

const env = (over = {}) => ({
  DATABASE_URL: url,
  RECORD_TOKEN_SECRET: SECRET,
  RECORD_VAULT_KEK: KEK,
  NODE_ENV: "development",
  RUN_MIGRATIONS_ON_START: "false",
  ...over,
});

before(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), "rq-server-"));
  engine = new EmbeddedPostgres({
    databaseDir: dataDir, user: "postgres", password: "postgres", port: PG_PORT, persistent: false,
  });
  await engine.initialise();
  await engine.start();
  await engine.createDatabase("serverboot");
  url = `postgres://postgres:postgres@localhost:${PG_PORT}/serverboot`;
  pool = new pg.Pool({ host: "localhost", port: PG_PORT, user: "postgres", password: "postgres", database: "serverboot", max: 6 });
  const c = await pool.connect();
  try { await migrate(c, { logger: quiet }); } finally { c.release(); }
});

after(async () => {
  await pool?.end().catch(() => {});
  await engine?.stop().catch(() => {});
  if (dataDir) await rm(dataDir, { recursive: true, force: true });
});

test("[server] boots against a real migrated database and does NOT listen", async () => {
  const { server, config, dependencies } = await buildRecordApi({ env: env(), pool, logger: quiet });

  assert.equal(typeof server.listen, "function", "an http server is returned");
  assert.equal(server.listening, false, "buildRecordApi must assemble without opening a socket");
  assert.equal(config.nodeEnv, "development");
  assert.ok(dependencies, "dependencies are built");
});

test("[server] the startup gate really runs — an unmigrated database is refused", async () => {
  await engine.createDatabase("serverboot_bare");
  const bare = new pg.Pool({ host: "localhost", port: PG_PORT, user: "postgres", password: "postgres", database: "serverboot_bare", max: 2 });
  try {
    await assert.rejects(
      () => buildRecordApi({
        env: env({ DATABASE_URL: `postgres://postgres:postgres@localhost:${PG_PORT}/serverboot_bare` }),
        pool: bare, logger: quiet,
      }),
      // Either the ledger is empty (pending) or the constraints are absent —
      // both are refusals, and which one fires depends on auto-migrate.
      (e) => e.code === "MIGRATIONS_PENDING" || /schema is not safe to write to/.test(e.message)
    );
  } finally {
    await bare.end();
  }
});

test("[server] auto-migrate on a bare database brings it up and then boots", async () => {
  await engine.createDatabase("serverboot_auto");
  const auto = new pg.Pool({ host: "localhost", port: PG_PORT, user: "postgres", password: "postgres", database: "serverboot_auto", max: 2 });
  try {
    const { server } = await buildRecordApi({
      env: env({
        DATABASE_URL: `postgres://postgres:postgres@localhost:${PG_PORT}/serverboot_auto`,
        RUN_MIGRATIONS_ON_START: "true",
      }),
      pool: auto, logger: quiet,
    });
    assert.equal(server.listening, false);

    const { rows } = await auto.query("SELECT count(*)::int AS n FROM schema_migrations");
    assert.ok(rows[0].n >= 2, "the entrypoint applied the migrations it found pending");
  } finally {
    await auto.end();
  }
});

test("[server] a pool it created is drained when startup fails; an injected pool is not", async () => {
  // Observable, not asserted by inspection: a pool that connected and was never
  // ended leaves live backends, which pg_stat_activity reports. Both halves use a
  // database that is deliberately unmigrated, so the startup gate refuses AFTER
  // the pool has opened connections — the exact window where the leak lived.
  await engine.createDatabase("serverboot_leak");
  const leakUrl = `postgres://postgres:postgres@localhost:${PG_PORT}/serverboot_leak`;
  const backends = async () => {
    const { rows } = await pool.query(
      "SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = $1", ["serverboot_leak"]
    );
    return rows[0].n;
  };

  // ── half 1: buildRecordApi creates the pool, so it owns it and must drain it.
  // createPool() enables TLS unless PGSSLMODE=disable, and embedded postgres
  // serves no TLS — so disable it here to reach the real gate failure rather
  // than an SSL handshake error. (createPool reads process.env for this, not the
  // injected env; noted, but out of scope for this fix.)
  const prevSslMode = process.env.PGSSLMODE;
  process.env.PGSSLMODE = "disable";
  try {
    await assert.rejects(
      () => buildRecordApi({ env: env({ DATABASE_URL: leakUrl }), logger: quiet }),
      (e) => e.code === "MIGRATIONS_PENDING"
    );
    let live = await backends();
    for (let i = 0; i < 20 && live > 0; i++) {
      await new Promise((r) => setTimeout(r, 50));
      live = await backends();
    }
    assert.equal(live, 0, "a pool buildRecordApi created must be drained when startup fails");
  } finally {
    if (prevSslMode === undefined) delete process.env.PGSSLMODE;
    else process.env.PGSSLMODE = prevSslMode;
  }

  // ── half 2: an injected pool belongs to the caller and must survive untouched.
  const injected = new pg.Pool({
    host: "localhost", port: PG_PORT, user: "postgres", password: "postgres",
    database: "serverboot_leak", max: 2,
  });
  try {
    await assert.rejects(
      () => buildRecordApi({ env: env({ DATABASE_URL: leakUrl }), pool: injected, logger: quiet }),
      (e) => e.code === "MIGRATIONS_PENDING"
    );
    // If buildRecordApi had ended it, this throws "Cannot use a pool after calling end".
    const { rows } = await injected.query("SELECT 1 AS ok");
    assert.equal(rows[0].ok, 1, "an injected pool must remain usable after a failed startup");
  } finally {
    await injected.end();
  }
});

test("[server] production refuses the env key provider before touching the database", async () => {
  await assert.rejects(
    () => buildRecordApi({
      env: env({ NODE_ENV: "production", CORS_ALLOWED_ORIGINS: "https://www.richenquest.com" }),
      pool, logger: quiet,
    }),
    (e) => e.code === "INSECURE_KEY_PROVIDER"
  );
});
