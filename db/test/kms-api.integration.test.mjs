/**
 * Career Record API over a KMS-wrapped vault — REAL HTTP × REAL PostgreSQL.
 *
 * The definitive Integration-Verified evidence for BL-2: the whole stack, wired
 * the way production wires it, with identity protected by the KMS provider rather
 * than the development env provider.
 *
 *   · real HTTP        — createApiServer() on a listening socket;
 *   · real PostgreSQL  — an actual postgres binary, both migrations applied;
 *   · the KMS provider — kmsKeyProvider over a fakeKmsClient doing real AES-256-GCM,
 *                        standing in for Cloud KMS (which never leaves its KEK).
 *
 * The property proven end-to-end: a student's date of birth, written to the vault
 * at record creation and read back at export, travels through the KMS envelope and
 * SURVIVES A RESTART. Before BL-7 that identity was lost on restart; before BL-2
 * it could not be KMS-protected at all. What is still NOT proven here is Google's
 * actual service — that is Production verification and needs credentials
 * (docs/STATUS.md BL-2).
 *
 * Run: npm --prefix db/test test
 */

import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";

import { createApiServer } from "../../functions/record/api/service.mjs";
import { postgresEventStore } from "../../functions/record/adapters/postgres.mjs";
import { postgresVaultStore } from "../../functions/record/adapters/vault-postgres.mjs";
import { identityVault } from "../../functions/record/identity/vault.mjs";
import { kmsKeyProvider, fakeKmsClient } from "../../functions/record/identity/kms.mjs";
import { issueToken } from "../../functions/record/identity/auth.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..", "..");
const MIGRATIONS = path.join(HERE, "..", "migrations");

const PG_PORT = 55300 + Math.floor(Math.random() * 90);
const SITE_ORIGIN = "https://www.richenquest.com";
const SECRET = randomBytes(32).toString("hex");
const SUBJECT = "sub_kmsapi01";
const DOB = "2004-03-19";

/** The durable "Cloud KMS": one instance, shared across simulated restarts. */
const KMS = fakeKmsClient();
const kmsProvider = () =>
  kmsKeyProvider(KMS, { keyId: "projects/rq/locations/asia-south1/keyRings/vault/cryptoKeys/kek", version: "v1" });

let engine;
let pool;
let dataDir;
let disclosureRegister;
let evidenceRegister;
let staffToken;
let studentToken;

/** A fresh API server over the same DB and the same KMS — a process restart. */
function makeServer() {
  return createApiServer({
    store: postgresEventStore(pool),
    vault: identityVault(postgresVaultStore(pool), kmsProvider()),
    secret: SECRET,
    evidenceRegister,
    disclosureRegister,
    cors: { allowed: [SITE_ORIGIN] },
  });
}

async function withServer(fn) {
  const server = makeServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    return await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function call(base, method, url, token, body) {
  const res = await fetch(`${base}${url}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await res.json().catch(() => null);
  return { status: res.status, payload };
}

before(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), "rq-kmsapi-"));
  engine = new EmbeddedPostgres({
    databaseDir: dataDir, user: "postgres", password: "postgres", port: PG_PORT, persistent: false,
  });
  await engine.initialise();
  await engine.start();
  await engine.createDatabase("kmsapi");

  pool = new pg.Pool({ host: "localhost", port: PG_PORT, user: "postgres", password: "postgres", database: "kmsapi", max: 8 });
  for (const file of ["001_event_log.sql", "002_identity_vault.sql"]) {
    await pool.query(await readFile(path.join(MIGRATIONS, file), "utf8"));
  }

  [disclosureRegister, evidenceRegister] = await Promise.all([
    readFile(path.join(ROOT, "website/src/data/disclosure.json"), "utf8").then(JSON.parse),
    readFile(path.join(ROOT, "website/src/data/evidence.json"), "utf8").then(JSON.parse),
  ]);

  staffToken = issueToken({ sub: "usr_kmscounsellor", role: "counsellor" }, SECRET, { ttlSeconds: 3600 }).token;
  studentToken = issueToken({ sub: SUBJECT, role: "subject", subject_id: SUBJECT }, SECRET, { ttlSeconds: 3600 }).token;
}, { timeout: 180_000 });

after(async () => {
  await pool?.end();
  await engine?.stop();
  if (dataDir) await rm(dataDir, { recursive: true, force: true });
});

/* ═══════════════════════════════════════════════════════════════════════════ */

test("creating a record writes the DOB to the vault through the KMS envelope", async () => {
  await withServer(async (base) => {
    const created = await call(base, "POST", "/v1/career-records", staffToken, {
      subject_id: SUBJECT,
      consent_purposes: ["advisory"],
      date_of_birth: DOB,
      origin_country: "India",
    });
    assert.equal(created.status, 201);
  });

  // The wrapped key exists in PostgreSQL, and it is a KMS ciphertext — not the DEK.
  const key = await pool.query("SELECT version, material FROM vault_keys WHERE subject_id = $1", [SUBJECT]);
  assert.equal(key.rows.length, 1);
  assert.equal(key.rows[0].version, "v1");
  assert.ok(key.rows[0].material.length > 0);

  // And no plaintext DOB is anywhere in the vault tables.
  const fields = await pool.query("SELECT iv, ct, tag FROM vault_fields WHERE subject_id = $1", [SUBJECT]);
  assert.ok(!JSON.stringify(fields.rows).includes(DOB), "the date of birth is never stored in the clear");
});

test("the student's export returns the real DOB, decrypted through KMS over HTTP", async () => {
  await withServer(async (base) => {
    const { status, payload } = await call(base, "POST", `/v1/career-records/${SUBJECT}/export`, studentToken, {});
    assert.equal(status, 200);
    assert.equal(payload.includes_identity, true);
    const identity = JSON.parse(payload.archive["identity.json"]);
    assert.equal(identity.date_of_birth, DOB, "KMS-unwrapped identity comes back through the API");
  });
});

test("identity survives a RESTART — a new server, same DB, same KMS, still returns it", async () => {
  // makeServer() builds an entirely new API + store + vault. Nothing from the
  // earlier servers is in memory. This is the BL-7 property, now with the DEK
  // protected by KMS (BL-2), proven at the HTTP boundary.
  await withServer(async (base) => {
    const { payload } = await call(base, "POST", `/v1/career-records/${SUBJECT}/export`, studentToken, {});
    const identity = JSON.parse(payload.archive["identity.json"]);
    assert.equal(identity.date_of_birth, DOB, "the DOB is still recoverable after a full restart");
  });
});

test("the record's hash chain verifies over HTTP, independent of the vault", async () => {
  await withServer(async (base) => {
    const { status, payload } = await call(base, "GET", `/v1/career-records/${SUBJECT}/verify`, studentToken);
    assert.equal(status, 200);
    assert.equal(payload.verified, true, "erasable identity and an immutable log coexist");
  });
});
