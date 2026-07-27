/**
 * Identity Vault — INTEGRATION tests against a REAL PostgreSQL server, driven
 * through the KMS-shaped key provider.
 *
 * Closes BL-7 and provides the Integration-Verified evidence for BL-2. The
 * property under test is the one the whole erasure design rests on:
 *
 *   identity survives a restart, and destroying the data key makes it
 *   permanently unrecoverable WITHOUT deleting the ciphertext.
 *
 * Both halves matter. A store that lost data on restart cannot hold identity at
 * all; a store that erased by DELETE could not prove anything about the copies it
 * did not reach. Only a real database can demonstrate either, which is why the
 * in-memory store — where "restart" has no meaning — could never have.
 *
 * THE PROVIDER HERE IS THE KMS PROVIDER (kmsKeyProvider), not the env one. It runs
 * on a fakeKmsClient that performs real AES-256-GCM — so wrap/unwrap, rotation and
 * crypto-shredding are exercised through the exact interface Cloud KMS will use,
 * against a real database. What this does NOT prove is that Google's service works
 * — that is Production verification and needs credentials (docs/STATUS.md BL-2).
 * The env provider over real PostgreSQL is covered separately by the portal suite.
 *
 * Run: npm --prefix db/test test
 */

import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";

import { postgresVaultStore, assertVaultSchema } from "../../functions/record/adapters/vault-postgres.mjs";
import { identityVault, SubjectErased } from "../../functions/record/identity/vault.mjs";
import { kmsKeyProvider, fakeKmsClient } from "../../functions/record/identity/kms.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = path.join(HERE, "..", "migrations");

const PG_PORT = 55100 + Math.floor(Math.random() * 90);
const SUBJECT = "sub_vaultstudent01";
const OTHER = "sub_vaultother02";

let engine;
let pool;
let dataDir;

/**
 * One durable "KMS" for the whole run: a fakeKmsClient doing real AES-256-GCM, its
 * per-keyId masters standing in for Cloud KMS CryptoKeys that persist while our
 * process cycles. A fresh vault over the same DB and the same KMS is a restart.
 */
const KMS = fakeKmsClient();
const keyName = (v) => `key/${v}`;

/**
 * @param {string} version   the version new keys are wrapped under
 * @param {string[]} known   versions this provider can still unwrap. A real
 *                           provider keeps old versions until every subject has
 *                           been re-wrapped; omitting one simulates retiring it
 *                           early, which is what the UNKNOWN_KEK_VERSION test does.
 */
function kmsProvider(version = "v1", known = [version]) {
  return kmsKeyProvider(KMS, {
    keyId: keyName(version),
    version,
    keyIdsByVersion: new Map(known.map((v) => [v, keyName(v)])),
  });
}

/**
 * A NEW store and a NEW vault over the same database and the same KMS — this is
 * what "restart" means for a stateless process. No in-process state carries over.
 */
const freshVault = (version = "v1", known) => identityVault(postgresVaultStore(pool), kmsProvider(version, known));

before(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), "rq-vault-"));
  engine = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: "postgres",
    password: "postgres",
    port: PG_PORT,
    persistent: false,
  });
  await engine.initialise();
  await engine.start();
  await engine.createDatabase("vault_test");

  pool = new pg.Pool({
    host: "localhost",
    port: PG_PORT,
    user: "postgres",
    password: "postgres",
    database: "vault_test",
    max: 8,
  });

  // The production migrations, applied verbatim and in order.
  for (const file of ["001_event_log.sql", "002_identity_vault.sql"]) {
    await pool.query(await readFile(path.join(MIGRATIONS, file), "utf8"));
  }
}, { timeout: 180_000 });

after(async () => {
  await pool?.end();
  await engine?.stop();
  if (dataDir) await rm(dataDir, { recursive: true, force: true });
});

beforeEach(async () => {
  await pool.query("TRUNCATE vault_keys, vault_fields");
});

/* ═══════════════════════════════════════════════════════════════ schema ══ */

test("the startup gate accepts the real migration", async () => {
  assert.equal(await assertVaultSchema(pool), true);
});

test("the startup gate refuses a database that has not been migrated", async () => {
  // DDL is transactional in PostgreSQL, so the drop is real inside this
  // transaction and undone by the rollback. The gate sees a genuinely
  // unmigrated database rather than a mocked catalogue.
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DROP TABLE vault_fields, vault_keys");
    await assert.rejects(() => assertVaultSchema(client), /002_identity_vault\.sql/);
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }

  assert.equal(await assertVaultSchema(pool), true, "and the rollback restored them");
});

/* ═══════════════════════════════════════════════════════ durability ══════ */

test("identity survives a restart — the property BL-7 existed to fix", async () => {
  await freshVault().putAll(SUBJECT, {
    date_of_birth: "2004-03-19",
    legal_name: "A. Student",
    passport_number: "X1234567",
  });

  // Everything in-process is discarded. Only the database carries over.
  const afterRestart = freshVault();

  assert.equal(await afterRestart.get(SUBJECT, "date_of_birth"), "2004-03-19");
  assert.equal(await afterRestart.get(SUBJECT, "legal_name"), "A. Student");
  assert.equal(await afterRestart.exists(SUBJECT), true);
  assert.deepEqual(await afterRestart.getAll(SUBJECT), {
    date_of_birth: "2004-03-19",
    legal_name: "A. Student",
    passport_number: "X1234567",
  });
});

test("nothing readable is written to the database — a dump without the KEK is inert", async () => {
  await freshVault().put(SUBJECT, "legal_name", "Priya Sharma");

  const { rows } = await pool.query("SELECT iv, ct, tag FROM vault_fields WHERE subject_id = $1", [SUBJECT]);
  assert.equal(rows.length, 1);
  const stored = JSON.stringify(rows[0]);
  assert.ok(!stored.includes("Priya"), "the plaintext does not appear in storage");
  assert.ok(!stored.includes("Sharma"));

  // And the key column holds an opaque wrapped key, not the DEK itself.
  const keyRow = await pool.query("SELECT version, material FROM vault_keys WHERE subject_id = $1", [SUBJECT]);
  assert.equal(keyRow.rows[0].version, "v1");
  assert.ok(keyRow.rows[0].material.length > 0);
});

test("types survive the round trip, not just strings", async () => {
  const vault = freshVault();
  await vault.putAll(SUBJECT, {
    age: 21,
    verified: true,
    aliases: ["A. Student", "AS"],
    address: { city: "Patna", country: "India" },
    middle_name: null,
  });

  const back = freshVault();
  assert.equal(await back.get(SUBJECT, "age"), 21);
  assert.equal(await back.get(SUBJECT, "verified"), true);
  assert.deepEqual(await back.get(SUBJECT, "aliases"), ["A. Student", "AS"]);
  assert.deepEqual(await back.get(SUBJECT, "address"), { city: "Patna", country: "India" });
  assert.equal(await back.get(SUBJECT, "middle_name"), null);
});

test("unicode is not mangled by the storage layer", async () => {
  await freshVault().put(SUBJECT, "legal_name", "प्रिया शर्मा 🇮🇳");
  assert.equal(await freshVault().get(SUBJECT, "legal_name"), "प्रिया शर्मा 🇮🇳");
});

test("a corrected field overwrites its ciphertext rather than accumulating one", async () => {
  const vault = freshVault();
  await vault.put(SUBJECT, "date_of_birth", "2004-03-19");
  await vault.put(SUBJECT, "date_of_birth", "2004-03-20");

  const { rows } = await pool.query(
    "SELECT count(*)::int AS n FROM vault_fields WHERE subject_id = $1 AND field = 'date_of_birth'",
    [SUBJECT]
  );
  assert.equal(rows[0].n, 1, "one row per (subject, field)");
  assert.equal(await freshVault().get(SUBJECT, "date_of_birth"), "2004-03-20");
});

/* ═════════════════════════════════════════════════════ crypto-shredding ══ */

test("erasure destroys the key, leaves the ciphertext, and the data is unrecoverable", async () => {
  const vault = freshVault();
  await vault.putAll(SUBJECT, { date_of_birth: "2004-03-19", legal_name: "A. Student" });

  const receipt = await vault.erase(SUBJECT, { reason: "subject request" });
  assert.equal(receipt.subject_id, SUBJECT);
  assert.equal(receipt.fields_shredded, 2);

  // The key row is gone …
  const keys = await pool.query("SELECT count(*)::int AS n FROM vault_keys WHERE subject_id = $1", [SUBJECT]);
  assert.equal(keys.rows[0].n, 0);

  // … and the ciphertext is deliberately still there. Erasure must not depend on
  // reaching every copy, so it is defined as destroying the only thing that can
  // read them — not as deleting rows we happen to be able to reach.
  const fields = await pool.query("SELECT count(*)::int AS n FROM vault_fields WHERE subject_id = $1", [SUBJECT]);
  assert.equal(fields.rows[0].n, 2, "ciphertext remains, permanently undecryptable");

  // A brand-new process cannot read it either.
  await assert.rejects(() => freshVault().get(SUBJECT, "date_of_birth"), SubjectErased);
  await assert.rejects(() => freshVault().getAll(SUBJECT), SubjectErased);
  assert.equal(await freshVault().exists(SUBJECT), false);
});

test("erasure survives a restart — it cannot be undone by reconnecting", async () => {
  const vault = freshVault();
  await vault.put(SUBJECT, "date_of_birth", "2004-03-19");
  await vault.erase(SUBJECT);

  await assert.rejects(() => freshVault().get(SUBJECT, "date_of_birth"), SubjectErased);
});

test("erasing an already-erased subject is refused, not silently reported as success", async () => {
  const vault = freshVault();
  await vault.put(SUBJECT, "date_of_birth", "2004-03-19");
  await vault.erase(SUBJECT);

  await assert.rejects(() => freshVault().erase(SUBJECT), SubjectErased);
});

test("erasing one subject does not touch another", async () => {
  const vault = freshVault();
  await vault.put(SUBJECT, "date_of_birth", "2004-03-19");
  await vault.put(OTHER, "date_of_birth", "2003-06-02");

  await vault.erase(SUBJECT);

  assert.equal(await freshVault().get(OTHER, "date_of_birth"), "2003-06-02");
  assert.equal(await freshVault().exists(OTHER), true);
});

/* ═══════════════════════════════════════════════════════════ isolation ══ */

test("a ciphertext cannot be moved between subjects", async () => {
  const vault = freshVault();
  await vault.put(SUBJECT, "legal_name", "A. Student");
  await vault.put(OTHER, "legal_name", "B. Student");

  // Move A's sealed value into B's row, exactly as a compromised store or a
  // mistaken migration might. subject_id is bound in as AAD, so GCM must reject it.
  await pool.query(
    `UPDATE vault_fields
        SET iv = src.iv, ct = src.ct, tag = src.tag
       FROM (SELECT iv, ct, tag FROM vault_fields WHERE subject_id = $1 AND field = 'legal_name') AS src
      WHERE vault_fields.subject_id = $2 AND vault_fields.field = 'legal_name'`,
    [SUBJECT, OTHER]
  );

  await assert.rejects(
    () => freshVault().get(OTHER, "legal_name"),
    (err) => err.code === "DECRYPT_FAILED"
  );
});

test("a ciphertext cannot be moved between fields of the same subject", async () => {
  const vault = freshVault();
  await vault.put(SUBJECT, "legal_name", "A. Student");
  await vault.put(SUBJECT, "passport_number", "X1234567");

  await pool.query(
    `UPDATE vault_fields
        SET iv = src.iv, ct = src.ct, tag = src.tag
       FROM (SELECT iv, ct, tag FROM vault_fields WHERE subject_id = $1 AND field = 'legal_name') AS src
      WHERE vault_fields.subject_id = $1 AND vault_fields.field = 'passport_number'`,
    [SUBJECT]
  );

  await assert.rejects(
    () => freshVault().get(SUBJECT, "passport_number"),
    (err) => err.code === "DECRYPT_FAILED"
  );
});

test("a tampered ciphertext is detected rather than returned", async () => {
  await freshVault().put(SUBJECT, "legal_name", "A. Student");
  await pool.query(
    `UPDATE vault_fields
        SET ct = encode(decode(ct, 'base64') || '\\x00'::bytea, 'base64')
      WHERE subject_id = $1 AND field = 'legal_name'`,
    [SUBJECT]
  );

  await assert.rejects(
    () => freshVault().get(SUBJECT, "legal_name"),
    (err) => err.code === "DECRYPT_FAILED"
  );
});

test("a WRAPPED KEY cannot be moved between subjects — the KMS binds it too", async () => {
  const vault = freshVault();
  await vault.put(SUBJECT, "legal_name", "A. Student");
  await vault.put(OTHER, "legal_name", "B. Student");

  // Repoint B's wrapped-key row at A's wrapped key. subjectId is the AAD of the
  // KMS wrap, so unwrapping it as B fails inside the KMS — a stolen key row is
  // useless under another identity. The failure is opaque (KMS_UNAVAILABLE) on
  // purpose: we never tell a caller whether it was tampering or an outage.
  await pool.query(
    `UPDATE vault_keys
        SET version = src.version, material = src.material
       FROM (SELECT version, material FROM vault_keys WHERE subject_id = $1) AS src
      WHERE vault_keys.subject_id = $2`,
    [SUBJECT, OTHER]
  );

  await assert.rejects(
    () => freshVault().get(OTHER, "legal_name"),
    (err) => err.code === "KMS_UNAVAILABLE"
  );
});

test("reading a field that was never written is undefined, not an error", async () => {
  await freshVault().put(SUBJECT, "legal_name", "A. Student");
  assert.equal(await freshVault().get(SUBJECT, "passport_number"), undefined);
});

test("reading a subject that never existed reports erased, not empty", async () => {
  // "Never existed" and "erased" must not look alike to a caller deciding whether
  // it is safe to write: one is a new record, the other is a person who asked to
  // be forgotten.
  await assert.rejects(() => freshVault().get("sub_neverexisted", "legal_name"), SubjectErased);
});

/* ════════════════════════════════════════════════════════════ rotation ══ */

test("KEK rotation re-wraps the key and touches no field ciphertext", async () => {
  await freshVault("v1").putAll(SUBJECT, { date_of_birth: "2004-03-19", legal_name: "A. Student" });

  const before = await pool.query(
    "SELECT field, ct FROM vault_fields WHERE subject_id = $1 ORDER BY field",
    [SUBJECT]
  );

  const rotated = await freshVault("v2", ["v1", "v2"]).rotateKek(SUBJECT);
  assert.deepEqual(rotated, { rotated: true, from: "v1", to: "v2" });

  const after = await pool.query(
    "SELECT field, ct FROM vault_fields WHERE subject_id = $1 ORDER BY field",
    [SUBJECT]
  );
  assert.deepEqual(after.rows, before.rows, "rotation is O(subjects), not O(data)");

  const version = await pool.query("SELECT version FROM vault_keys WHERE subject_id = $1", [SUBJECT]);
  assert.equal(version.rows[0].version, "v2");
  assert.equal(await freshVault("v2", ["v1", "v2"]).get(SUBJECT, "legal_name"), "A. Student");
});

test("rotation is idempotent — a subject already on the current KEK is left alone", async () => {
  await freshVault("v1").put(SUBJECT, "legal_name", "A. Student");
  assert.deepEqual(await freshVault("v1").rotateKek(SUBJECT), { rotated: false, version: "v1" });
});

test("rotation does not create a second key row for the same subject", async () => {
  await freshVault("v1").put(SUBJECT, "legal_name", "A. Student");
  await freshVault("v2", ["v1", "v2"]).rotateKek(SUBJECT);

  const { rows } = await pool.query("SELECT count(*)::int AS n FROM vault_keys WHERE subject_id = $1", [SUBJECT]);
  assert.equal(rows[0].n, 1, "a subject with two data keys is a subject whose erasure destroys one of them");
});

test("the rotation work queue lists exactly the subjects still on an old KEK", async () => {
  const store = postgresVaultStore(pool);
  await freshVault("v1").put(SUBJECT, "legal_name", "A. Student");
  await freshVault("v1").put(OTHER, "legal_name", "B. Student");

  assert.deepEqual((await store.subjectsNeedingRotation("v2")).sort(), [OTHER, SUBJECT].sort());

  await freshVault("v2", ["v1", "v2"]).rotateKek(SUBJECT);
  assert.deepEqual(await store.subjectsNeedingRotation("v2"), [OTHER]);
});

test("a subject wrapped under a retired KEK fails loudly rather than returning wrong data", async () => {
  await freshVault("v1").put(SUBJECT, "legal_name", "A. Student");

  // v3 knows nothing of v1: the rotation removed it before every subject was re-wrapped.
  await assert.rejects(
    () => freshVault("v3").get(SUBJECT, "legal_name"),
    (err) => err.code === "UNKNOWN_KEK_VERSION"
  );
});

/* ═══════════════════════════════════════════════════════ schema guards ══ */

test("the database refuses a malformed subject id", async () => {
  await assert.rejects(
    () => pool.query("INSERT INTO vault_keys (subject_id, version, material) VALUES ($1,'v1','wrapped')", [
      "not-a-subject-id",
    ]),
    /vault_keys_subject_format/
  );
});

test("the database refuses an empty field name", async () => {
  await assert.rejects(
    () => pool.query("INSERT INTO vault_fields (subject_id, field, iv, ct, tag) VALUES ($1,'','a','b','c')", [SUBJECT]),
    /vault_fields_field_length/
  );
});
