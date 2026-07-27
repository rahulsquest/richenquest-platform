/**
 * PostgreSQL adapter — INTEGRATION tests against a REAL PostgreSQL server.
 *
 * A genuine postgres binary is started on an ephemeral port, the production
 * migration is applied verbatim, and the shared conformance suite runs against
 * the real adapter and the real driver.
 *
 * This is what upgrades the adapter from contract-tested to integration-tested.
 * The previous fake proved the adapter's logic; only this proves that PostgreSQL
 * behaves the way the adapter assumes — partitioned-table constraints, the
 * 23505 error code, jsonb round-tripping, and privilege-enforced append-only.
 *
 * Run: npm --prefix db/test test
 */

import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";

import { postgresEventStore, assertSchema, SequenceConflict } from "../../functions/record/adapters/postgres.mjs";
import { conformanceSuite } from "../../functions/record/adapters/conformance.mjs";
import { appendEvent, verifySubject } from "../../functions/record/log.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION = path.join(HERE, "..", "migrations", "001_event_log.sql");

let engine;
let pool;
let dataDir;

/** A free-ish port; embedded-postgres needs an explicit one. */
const PORT = 54000 + Math.floor(Math.random() * 900);

before(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), "rq-pg-"));
  engine = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: "postgres",
    password: "postgres",
    port: PORT,
    persistent: false,
  });
  await engine.initialise();
  await engine.start();
  await engine.createDatabase("career_record_test");

  pool = new pg.Pool({
    host: "localhost",
    port: PORT,
    user: "postgres",
    password: "postgres",
    database: "career_record_test",
    max: 8,
  });

  // The production migration, applied verbatim. If it does not run here, it does
  // not run in production either.
  await pool.query(await readFile(MIGRATION, "utf8"));
}, { timeout: 180_000 });

after(async () => {
  await pool?.end();
  await engine?.stop();
  if (dataDir) await rm(dataDir, { recursive: true, force: true });
});

/** Each conformance run gets a clean table so subject ids cannot collide. */
async function freshStore() {
  await pool.query("TRUNCATE events");
  return postgresEventStore(pool);
}

/* ══════════════════════════════════════════ the shared contract, for real ══ */

conformanceSuite("postgres-real", freshStore);

/* ═══════════════════════════════════════════════ schema-level guarantees ══ */

test("[pg-real] the migration creates a partitioned table with the required constraints", async () => {
  const parts = await pool.query(
    `SELECT count(*)::int AS n FROM pg_inherits i
       JOIN pg_class p ON p.oid = i.inhparent WHERE p.relname = 'events'`
  );
  assert.equal(parts.rows[0].n, 16, "16 hash partitions must exist");

  const strategy = await pool.query(
    `SELECT partstrat FROM pg_partitioned_table pt
       JOIN pg_class c ON c.oid = pt.partrelid WHERE c.relname = 'events'`
  );
  assert.equal(strategy.rows[0].partstrat, "h", "partitioned by HASH");

  // assertSchema is the startup guard; it must pass against the real migration.
  assert.equal(await assertSchema(pool), true);
});

test("[pg-real] assertSchema refuses a database missing the constraints it relies on", async () => {
  await pool.query("CREATE TABLE IF NOT EXISTS bare_events (subject_id text, seq bigint)");
  const bare = {
    query: async (text) =>
      text.includes("pg_constraint") || text.includes("pg_indexes") ? { rows: [] } : pool.query(text),
  };
  await assert.rejects(() => assertSchema(bare), /not safe to write to/);
  await pool.query("DROP TABLE bare_events");
});

test("[pg-real] the primary key rejects a duplicate (subject_id, seq) with 23505", async () => {
  await pool.query("TRUNCATE events");
  const store = postgresEventStore(pool);
  const first = await appendEvent(store, {
    subjectId: "sub_pk", type: "profile.created",
    actor: { kind: "human", id: "u", role: "counsellor" }, payload: {},
  });

  await assert.rejects(
    () => store.append("sub_pk", first, { expectedSeq: first.seq }),
    (err) => err instanceof SequenceConflict && err.code === "SEQ_CONFLICT",
    "a real unique violation must surface as a retryable domain conflict"
  );
});

test("[pg-real] the idempotency index is partial — many NULL keys coexist", async () => {
  await pool.query("TRUNCATE events");
  const store = postgresEventStore(pool);
  for (let i = 0; i < 5; i++) {
    await appendEvent(store, {
      subjectId: "sub_idem", type: "counselling.note_added",
      actor: { kind: "human", id: "u", role: "counsellor" }, payload: { i },
    });
  }
  assert.equal((await store.read("sub_idem")).length, 5, "NULL idempotency keys must not collide");

  const withKey = { ...{ subjectId: "sub_idem", type: "counselling.note_added",
    actor: { kind: "human", id: "u", role: "counsellor" }, payload: {} }, idempotencyKey: "k1" };
  const a = await appendEvent(store, withKey);
  const b = await appendEvent(store, { ...withKey });
  assert.equal(a.event_id, b.event_id, "the same key must return the original row");
  assert.equal((await store.read("sub_idem")).length, 6);
});

test("[pg-real] jsonb round-trips the envelope byte-for-byte so hashes still verify", async () => {
  await pool.query("TRUNCATE events");
  const store = postgresEventStore(pool);
  const written = await appendEvent(store, {
    subjectId: "sub_json",
    type: "recommendation.issued",
    actor: { kind: "human", id: "usr_k", role: "counsellor" },
    evidence: [{ ref: "dest:germany@2026-07-19", kind: "published_data", hash: "sha256:9f2c" }],
    disclosure: { shown: true, register_version: "2026-07-25", statements: ["none"] },
    payload: {
      recommended: [{ option: "dest:germany", rank: 1, rationale: "unicode: € — ₹ 'quotes' \"double\"" }],
      nested: { deep: { value: null, num: 1.5, bool: false } },
    },
  });

  const [readBack] = await store.read("sub_json");
  assert.deepEqual(readBack, written, "jsonb must not reorder or coerce anything the hash covers");
  assert.equal((await verifySubject(store, "sub_json")).ok, true);
});

test("[pg-real] concurrent writers never share a position, and the chain survives", async () => {
  await pool.query("TRUNCATE events");
  const store = postgresEventStore(pool);
  const actor = { kind: "human", id: "u", role: "counsellor" };
  await appendEvent(store, { subjectId: "sub_race", type: "profile.created", actor, payload: {} });

  // Ten genuinely parallel appends over separate pool connections. They do NOT
  // all contend for seq 2: each reads the head itself, so with real I/O some
  // observe a newer head and take a later position. Against real PostgreSQL 6 of
  // 10 succeeded — which is correct behaviour, not a lost conflict.
  const results = await Promise.allSettled(
    Array.from({ length: 10 }, (_, i) =>
      appendEvent(store, { subjectId: "sub_race", type: "counselling.note_added", actor, payload: { w: i } })
    )
  );

  const won = results.filter((r) => r.status === "fulfilled");
  const lost = results.filter((r) => r.status === "rejected");
  assert.ok(won.length >= 1, "at least one writer must succeed");
  for (const l of lost) assert.equal(l.reason.code, "SEQ_CONFLICT", "losers get a retryable conflict, never corruption");

  // The guarantee the database provides, and the one that matters:
  const rows = await pool.query("SELECT seq FROM events WHERE subject_id = $1 ORDER BY seq", ["sub_race"]);
  const seqs = rows.rows.map((r) => Number(r.seq));
  assert.equal(new Set(seqs).size, seqs.length, "the primary key must make duplicate positions impossible");
  assert.deepEqual(seqs, Array.from({ length: seqs.length }, (_, i) => i + 1), "positions stay contiguous");
  assert.equal(seqs.length, won.length + 1);
  assert.equal((await verifySubject(store, "sub_race")).ok, true, "the chain must verify after a real race");
});

test("[pg-real] append-only is enforceable by PRIVILEGE, not by discipline", async () => {
  await pool.query("TRUNCATE events");
  const store = postgresEventStore(pool);
  await appendEvent(store, {
    subjectId: "sub_priv", type: "profile.created",
    actor: { kind: "human", id: "u", role: "counsellor" }, payload: { grade: "62%" },
  });

  // Create the least-privilege role the migration's commented block describes and
  // prove the grant actually stops an UPDATE and a DELETE.
  await pool.query(`DROP ROLE IF EXISTS record_writer_test`);
  await pool.query(`CREATE ROLE record_writer_test LOGIN PASSWORD 'x'`);
  await pool.query(`GRANT SELECT, INSERT ON events TO record_writer_test`);
  await pool.query(`REVOKE UPDATE, DELETE, TRUNCATE ON events FROM record_writer_test`);

  const restricted = new pg.Pool({
    host: "localhost", port: PORT, user: "record_writer_test", password: "x",
    database: "career_record_test", max: 2,
  });
  try {
    await assert.rejects(
      () => restricted.query("UPDATE events SET hash = 'tampered'"),
      /permission denied/i,
      "the application role must not be able to rewrite history"
    );
    await assert.rejects(
      () => restricted.query("DELETE FROM events"),
      /permission denied/i,
      "the application role must not be able to delete history"
    );
    const readable = await restricted.query("SELECT count(*)::int AS n FROM events");
    assert.equal(readable.rows[0].n, 1, "reads and inserts still work");
  } finally {
    await restricted.end();
    // A role holding grants cannot be dropped: DROP OWNED BY removes the
    // dependent privileges first. Same sequence a real environment needs when
    // rotating the application role.
    await pool.query(`DROP OWNED BY record_writer_test`);
    await pool.query(`DROP ROLE IF EXISTS record_writer_test`);
  }
});

test("[pg-real] events land in different partitions and read back per subject", async () => {
  await pool.query("TRUNCATE events");
  const store = postgresEventStore(pool);
  const actor = { kind: "human", id: "u", role: "counsellor" };
  for (let i = 0; i < 40; i++) {
    await appendEvent(store, { subjectId: `sub_part_${i}`, type: "profile.created", actor, payload: { i } });
  }

  const spread = await pool.query(
    `SELECT tableoid::regclass::text AS part, count(*)::int AS n FROM events GROUP BY 1`
  );
  assert.ok(spread.rows.length > 1, "subjects must distribute across partitions, not pile into one");
  assert.equal(spread.rows.reduce((n, r) => n + r.n, 0), 40);

  // Per-subject reads still work across the partition boundary.
  const one = await store.read("sub_part_17");
  assert.equal(one.length, 1);
  assert.equal(one[0].payload.i, 17);
});

test("[pg-real] chainHeads returns commitments only — safe to publish", async () => {
  await pool.query("TRUNCATE events");
  const store = postgresEventStore(pool);
  const actor = { kind: "human", id: "u", role: "counsellor" };
  await appendEvent(store, {
    subjectId: "sub_dig", type: "counselling.note_added", actor,
    payload: { note: "PASSPORT X1234567 and a private detail" },
  });

  const heads = await store.chainHeads();
  const mine = heads.find((h) => h.subject_id === "sub_dig");
  assert.equal(mine.seq, 1);
  assert.equal(mine.head, (await store.head("sub_dig")).hash);
  assert.doesNotMatch(JSON.stringify(heads), /X1234567|private detail/, "digest input must carry no payloads");
});

test("[pg-real] scanAll is chronological and resumable for projection rebuilds", async () => {
  await pool.query("TRUNCATE events");
  const store = postgresEventStore(pool);
  const actor = { kind: "human", id: "u", role: "counsellor" };
  for (let i = 0; i < 12; i++) {
    await appendEvent(store, { subjectId: `sub_scan_${i % 3}`, type: "counselling.note_added", actor, payload: { i } });
  }

  const all = await store.scanAll({});
  assert.equal(all.length, 12);
  assert.deepEqual(all.map((e) => e.event_id), [...all.map((e) => e.event_id)].sort());

  const resumed = await store.scanAll({ fromEventId: all[5].event_id });
  assert.equal(resumed.length, 6, "a rebuild must be resumable from the last processed id");
  assert.equal(resumed[0].event_id, all[6].event_id);
});
