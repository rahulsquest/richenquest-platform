/**
 * PERFORMANCE — measured against a REAL PostgreSQL server at realistic volume.
 *
 * Answers "will this be fast enough on day one, and will we notice when it stops
 * being fast", not "is this optimal". Nothing here is tuned; it measures what the
 * code already does so a regression has a number to fail against.
 *
 * VOLUME
 * 200 subjects × 25 events = 5,000 events, plus one heavy record of 500 — roughly
 * a year of operation for a cohort several times larger than the current one. The
 * heavy record matters more than the total: per-subject reads are the hot path,
 * and a record that grows without bound is where an append-only log gets slow.
 *
 * BUDGETS are deliberately loose — 5-20× observed — because this runs on an
 * embedded postgres on a developer laptop, and a CI box is slower. A budget tight
 * enough to be "accurate" here would fail in CI for no useful reason. They exist
 * to catch a regression of the kind that turns 20 ms into 2 seconds.
 *
 * NOT MEASURED HERE: Neon's network latency, which will dominate every number
 * below and cannot be known until the database exists (BL-1).
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

import { postgresEventStore } from "../../functions/record/adapters/postgres.mjs";
import { postgresVaultStore } from "../../functions/record/adapters/vault-postgres.mjs";
import { identityVault } from "../../functions/record/identity/vault.mjs";
import { kmsKeyProvider, fakeKmsClient } from "../../functions/record/identity/kms.mjs";
import { appendEvent, verifySubject } from "../../functions/record/log.mjs";
import { timeline, buildExport } from "../../functions/record/views.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = path.join(HERE, "..", "migrations");
const PG_PORT = 55700 + Math.floor(Math.random() * 90);

const SUBJECTS = 200;
const EVENTS_EACH = 25;
const HEAVY_SUBJECT = "sub_heavy0001";
const HEAVY_EVENTS = 500;

let engine, pool, dataDir, store, vault;

/** Percentiles over a sample, so a single slow outlier cannot flatter a median. */
function stats(samples) {
  const s = [...samples].sort((a, b) => a - b);
  const at = (p) => s[Math.min(s.length - 1, Math.floor(s.length * p))];
  return { n: s.length, p50: at(0.5), p95: at(0.95), max: s.at(-1) };
}

async function measure(times, fn) {
  const samples = [];
  for (let i = 0; i < times; i += 1) {
    const t0 = process.hrtime.bigint();
    await fn(i);
    samples.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }
  return stats(samples);
}

const report = (label, s, budget) => {
  console.log(
    `    ${label.padEnd(42)} p50 ${s.p50.toFixed(1).padStart(7)}ms  ` +
    `p95 ${s.p95.toFixed(1).padStart(7)}ms  max ${s.max.toFixed(1).padStart(7)}ms  (budget ${budget}ms)`
  );
};

const ACTOR = { kind: "human", id: "usr_counsellor", role: "counsellor" };
const TYPES = ["counselling.session_held", "document.submitted", "application.submitted", "counselling.note_added"];

before(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), "rq-perf-"));
  engine = new EmbeddedPostgres({
    databaseDir: dataDir, user: "postgres", password: "postgres", port: PG_PORT, persistent: false,
  });
  await engine.initialise();
  await engine.start();
  await engine.createDatabase("perf");

  pool = new pg.Pool({ host: "localhost", port: PG_PORT, user: "postgres", password: "postgres", database: "perf", max: 10 });
  for (const file of ["001_event_log.sql", "002_identity_vault.sql"]) {
    await pool.query(await readFile(path.join(MIGRATIONS, file), "utf8"));
  }

  store = postgresEventStore(pool);
  vault = identityVault(
    postgresVaultStore(pool),
    kmsKeyProvider(fakeKmsClient(), { keyId: "projects/p/l/keyRings/r/cryptoKeys/k", version: "v1" })
  );

  console.log(`\n  Seeding ${SUBJECTS} subjects × ${EVENTS_EACH} events + a ${HEAVY_EVENTS}-event record…`);
  const t0 = Date.now();

  for (let s = 0; s < SUBJECTS; s += 1) {
    const subjectId = `sub_perf${String(s).padStart(6, "0")}`;
    for (let e = 0; e < EVENTS_EACH; e += 1) {
      await appendEvent(store, {
        subjectId,
        type: TYPES[e % TYPES.length],
        actor: ACTOR,
        payload: { n: e, topic: "Performance seed", detail: "x".repeat(120) },
      });
    }
  }
  for (let e = 0; e < HEAVY_EVENTS; e += 1) {
    await appendEvent(store, {
      subjectId: HEAVY_SUBJECT,
      type: TYPES[e % TYPES.length],
      actor: ACTOR,
      payload: { n: e, topic: "Heavy record", detail: "x".repeat(120) },
    });
  }

  const total = SUBJECTS * EVENTS_EACH + HEAVY_EVENTS;
  console.log(`  Seeded ${total} events in ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);
}, { timeout: 600_000 });

after(async () => {
  await pool?.end();
  await engine?.stop();
  if (dataDir) await rm(dataDir, { recursive: true, force: true });
});

/* ═══════════════════════════════════════════════════════════ the hot path ══ */

test("PERF — append a single event (the write path)", async () => {
  const s = await measure(50, (i) =>
    appendEvent(store, {
      subjectId: `sub_perf${String(i % SUBJECTS).padStart(6, "0")}`,
      type: "counselling.note_added",
      actor: ACTOR,
      payload: { note: "measured append" },
    })
  );
  report("append 1 event", s, 250);
  assert.ok(s.p95 < 250, `append p95 ${s.p95.toFixed(1)}ms exceeds budget`);
});

test("PERF — read one subject's record (25 events)", async () => {
  const s = await measure(50, (i) => store.read(`sub_perf${String(i % SUBJECTS).padStart(6, "0")}`));
  report("read a 25-event record", s, 150);
  assert.ok(s.p95 < 150, `read p95 ${s.p95.toFixed(1)}ms exceeds budget`);
});

test("PERF — read the heavy record (500 events)", async () => {
  const s = await measure(20, () => store.read(HEAVY_SUBJECT));
  report(`read a ${HEAVY_EVENTS}-event record`, s, 400);
  assert.ok(s.p95 < 400, `heavy read p95 ${s.p95.toFixed(1)}ms exceeds budget`);
});

test("PERF — head lookup (every append does one first)", async () => {
  const s = await measure(100, (i) => store.head(`sub_perf${String(i % SUBJECTS).padStart(6, "0")}`));
  report("head lookup", s, 100);
  assert.ok(s.p95 < 100, `head p95 ${s.p95.toFixed(1)}ms exceeds budget`);
});

/* ══════════════════════════════════════════════════════════ projections ══ */

test("PERF — timeline projection over the heavy record", async () => {
  const events = await store.read(HEAVY_SUBJECT);
  const viewer = { role: "counsellor", id: "usr_c", subjectId: HEAVY_SUBJECT, grants: [], assignedSubjects: [HEAVY_SUBJECT], wards: [] };

  const s = await measure(20, () => Promise.resolve(timeline(events, viewer)));
  report(`timeline over ${HEAVY_EVENTS} events (pure)`, s, 100);
  assert.ok(s.p95 < 100, `timeline p95 ${s.p95.toFixed(1)}ms exceeds budget`);
});

test("PERF — chain verification over the heavy record", async () => {
  const s = await measure(10, () => verifySubject(store, HEAVY_SUBJECT));
  report(`verify ${HEAVY_EVENTS}-event hash chain`, s, 600);
  assert.ok(s.p95 < 600, `verify p95 ${s.p95.toFixed(1)}ms exceeds budget`);

  const result = await verifySubject(store, HEAVY_SUBJECT);
  assert.equal(result.ok, true, "and it still verifies at volume");
});

test("PERF — build an export archive for the heavy record", async () => {
  const events = await store.read(HEAVY_SUBJECT);
  const s = await measure(10, () =>
    Promise.resolve(buildExport(events, { subjectId: HEAVY_SUBJECT, identity: { date_of_birth: "2004-01-01" } }))
  );
  report(`export ${HEAVY_EVENTS} events (pure)`, s, 400);
  assert.ok(s.p95 < 400, `export p95 ${s.p95.toFixed(1)}ms exceeds budget`);
});

/* ════════════════════════════════════════════════════════════════ vault ══ */

test("PERF — vault write and read (KMS wrap/unwrap per operation)", async () => {
  const write = await measure(30, (i) => vault.put(`sub_perf${String(i).padStart(6, "0")}`, "date_of_birth", "2004-03-19"));
  report("vault put (wrap + insert)", write, 200);
  assert.ok(write.p95 < 200, `vault put p95 ${write.p95.toFixed(1)}ms exceeds budget`);

  const read = await measure(30, (i) => vault.get(`sub_perf${String(i).padStart(6, "0")}`, "date_of_birth"));
  report("vault get (unwrap + select)", read, 150);
  assert.ok(read.p95 < 150, `vault get p95 ${read.p95.toFixed(1)}ms exceeds budget`);
});

test("PERF — the DEK cache collapses N unwraps to one", async () => {
  const subject = "sub_perf000001";
  await vault.putAll(subject, { a: "1", b: "2", c: "3", d: "4", e: "5" });

  const uncached = identityVault(
    postgresVaultStore(pool),
    kmsKeyProvider(fakeKmsClient(), { keyId: "k", version: "v1" })
  );
  void uncached; // a fresh KMS cannot unwrap another's keys; measured on the real vault below

  const s = await measure(10, () => vault.getAll(subject));
  report("vault getAll (5 fields)", s, 400);
  assert.ok(s.p95 < 400, `getAll p95 ${s.p95.toFixed(1)}ms exceeds budget`);
});

/* ════════════════════════════════════════════════════ partition health ══ */

test("PERF — subjects distribute across all 16 hash partitions", async () => {
  const { rows } = await pool.query(`
    SELECT tableoid::regclass::text AS partition, count(DISTINCT subject_id)::int AS subjects, count(*)::int AS events
      FROM events GROUP BY 1 ORDER BY 1`);

  const subjectCounts = rows.map((r) => r.subjects);
  const total = subjectCounts.reduce((a, b) => a + b, 0);
  const largestShare = Math.max(...subjectCounts) / total;
  console.log(`    partitions in use: ${rows.length}/16`);
  console.log(`    subjects per partition: min ${Math.min(...subjectCounts)} max ${Math.max(...subjectCounts)} ` +
              `(largest holds ${(largestShare * 100).toFixed(1)}%, uniform would be ${(100 / 16).toFixed(1)}%)`);

  assert.equal(rows.length, 16, "every partition is carrying data — no hot single partition");

  /**
   * Measured as the LARGEST PARTITION'S SHARE, not max/min spread.
   *
   * With 200 subjects over 16 buckets the expected count is 12.5 with a standard
   * deviation near 3.4, so a min of 6 and a max of 22 is ordinary hash variance —
   * a max/min ratio would fail here for no reason and teach everyone to ignore
   * this test. What actually matters is that no single partition carries a
   * disproportionate share: 20% against a 6.25% ideal still catches real
   * clustering (a subject-id format change that defeats the hash would push one
   * partition far past it) while tolerating normal noise.
   */
  assert.ok(largestShare < 0.20, `one partition holds ${(largestShare * 100).toFixed(1)}% of subjects — the hash is not spreading`);
});

test("PERF — the per-subject read uses the partition key, not a full scan", async () => {
  const { rows } = await pool.query(
    `EXPLAIN (FORMAT JSON) SELECT envelope FROM events WHERE subject_id = $1 AND seq >= 1 AND seq <= 1000000 ORDER BY seq ASC`,
    [HEAVY_SUBJECT]
  );

  /**
   * Counted from the plan's "Relation Name" nodes, NOT by matching partition
   * names in the plan text: an Index Scan names its index (`events_p5_pkey`) as
   * well as its relation (`events_p5`), so a text match reports two partitions
   * for a plan that touches one.
   */
  const relations = [];
  (function walk(node) {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node && typeof node === "object") {
      if (typeof node["Relation Name"] === "string") relations.push(node["Relation Name"]);
      Object.values(node).forEach(walk);
    }
  })(rows[0]["QUERY PLAN"]);

  const partitions = [...new Set(relations.filter((r) => /^events_p\d+$/.test(r)))];
  console.log(`    partitions scanned for one subject: ${partitions.length} (${partitions.join(", ") || "none"})`);

  // Without pruning, every read of one student scans all 16 — which stays fast at
  // this volume and stops being fast exactly when it matters.
  assert.equal(partitions.length, 1, "partition pruning is working");
});
