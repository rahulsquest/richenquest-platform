/**
 * Composition-root wiring. Offline: a fake pool records what the boot sequence
 * did, so the ORDER of validation is assertable without a database, a socket, or
 * a cloud SDK.
 *
 * The ordering is the safety property. Configuration and provider errors must
 * surface before any connection is opened; a database error must surface before
 * the server listens. A deployment that opens a pool and then discovers it has no
 * key provider has already done work it cannot report on.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

import { buildRecordApi } from "./server.mjs";
import { KEY_BYTES } from "../identity/vault.mjs";
import { loadMigrations } from "../../../db/migrate.mjs";

// Derived from the migrations directory, never hardcoded: the ledger the fake
// reports must carry the REAL checksums or the startup gate correctly refuses to
// boot on drift. Deriving also means adding migration 003 will not break this.
const MIGRATIONS = await loadMigrations();

/** The platform logger surface: debug/info/warn/error. No .log — see server.mjs. */
const quiet = { debug() {}, info() {}, warn() {}, error() {} };

const SECRET = "x".repeat(40);
const KEK = randomBytes(KEY_BYTES).toString("base64");

const baseEnv = (over = {}) => ({
  DATABASE_URL: "postgres://u:p@localhost:5432/db?sslmode=require",
  RECORD_TOKEN_SECRET: SECRET,
  RECORD_VAULT_KEK: KEK,
  NODE_ENV: "development",
  RUN_MIGRATIONS_ON_START: "false",
  ...over,
});

/** A pool that records every use, so "did we connect?" is checkable. */
function fakePool({ migrationsApplied = true } = {}) {
  const calls = [];
  const client = {
    async query(text) {
      calls.push(String(text).replace(/\s+/g, " ").trim().slice(0, 60));
      const q = String(text);
      if (/server_version_num/.test(q)) return { rows: [{ num: 180004, v: "PostgreSQL 18.4" }] };
      if (/SHOW server_version|current_setting\('server_version'\)/.test(q)) return { rows: [{ server_version: "18.4" }] };
      if (/to_regclass\('schema_migrations'\)/.test(q)) return { rows: [{ present: true }] };
      if (/FROM schema_migrations/.test(q)) {
        return { rows: migrationsApplied
          ? MIGRATIONS.map((m) => ({ version: m.version, name: m.name, checksum: m.checksum, applied_at: new Date() }))
          : [] };
      }
      return { rows: [] };
    },
    release() { calls.push("RELEASE"); },
  };
  return {
    calls,
    connected: 0,
    async connect() { this.connected += 1; calls.push("CONNECT"); return client; },
    async query(text) { return client.query(text); },
    async end() { calls.push("END"); },
  };
}

/* ───────────────────────────────────────── config fails before any connection ── */

test("server: a weak signing secret fails before the pool is touched", async () => {
  const pool = fakePool();
  await assert.rejects(
    () => buildRecordApi({ env: baseEnv({ RECORD_TOKEN_SECRET: "short" }), pool, logger: quiet }),
    (e) => e.code === "WEAK_SECRET"
  );
  assert.equal(pool.calls.length, 0, "configuration must be validated before the pool is touched");
});

test("server: production with the env key provider is refused, and never connects", async () => {
  const pool = fakePool();
  await assert.rejects(
    () => buildRecordApi({
      env: baseEnv({ NODE_ENV: "production", CORS_ALLOWED_ORIGINS: "https://www.richenquest.com" }),
      pool, logger: quiet,
    }),
    (e) => e.code === "INSECURE_KEY_PROVIDER"
  );
  assert.equal(pool.calls.length, 0, "the production gate must hold before any I/O");
});

test("server: production with an empty CORS allowlist is refused", async () => {
  const pool = fakePool();
  await assert.rejects(
    () => buildRecordApi({
      env: baseEnv({ NODE_ENV: "production", RECORD_VAULT_PROVIDER: "kms" }),
      pool, logger: quiet,
    }),
    (e) => e.code === "CORS_NOT_CONFIGURED" || /CORS/i.test(e.message)
  );
  assert.equal(pool.calls.length, 0);
});

/* ────────────────────────────────── provider fails before any connection too ── */

test("server: an unknown vault provider fails before the pool is touched", async () => {
  const pool = fakePool();
  await assert.rejects(
    () => buildRecordApi({ env: baseEnv({ RECORD_VAULT_PROVIDER: "vault" }), pool, logger: quiet }),
    (e) => e.code === "UNKNOWN_VAULT_PROVIDER"
  );
  assert.equal(pool.calls.length, 0, "provider selection is pure and must precede I/O");
});

test('server: RECORD_VAULT_PROVIDER="kms" without a client fails before connecting', async () => {
  const pool = fakePool();
  await assert.rejects(
    () => buildRecordApi({
      env: baseEnv({ RECORD_VAULT_PROVIDER: "kms", GCP_PROJECT_ID: "p", GCP_KMS_LOCATION: "asia-southeast1", GCP_KMS_KEYRING: "r", GCP_KMS_KEY: "k" }),
      pool, logger: quiet,
    }),
    (e) => e.code === "KMS_CLIENT_REQUIRED"
  );
  assert.equal(pool.calls.length, 0, "a missing KMS client must not cost a connection");
});

/* ─────────────────────────────────────────────── the gate is reached at all ── */

test("server: pending migrations with auto-migrate off refuse to start", async () => {
  const pool = fakePool({ migrationsApplied: false });
  await assert.rejects(
    () => buildRecordApi({ env: baseEnv(), pool, logger: quiet }),
    (e) => e.code === "MIGRATIONS_PENDING"
  );
  assert.ok(pool.calls.length > 0, "this one DOES reach the database — it is a database fact, not a config one");
});

/*
 * The happy path is NOT tested here, deliberately. Asserting it against this fake
 * would mean hand-rolling PostgreSQL's catalog so assertSchema() and
 * assertVaultSchema() can find their constraints — at which point the test proves
 * the fake matches the assertions, not that the server boots. It lives in
 * db/test/server.integration.test.mjs, against a real migrated database.
 */
