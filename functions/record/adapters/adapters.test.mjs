/**
 * Adapter tests — the same conformance suite run against every EventStore.
 *
 * WHAT THESE FAKES DO AND DO NOT PROVE — stated plainly, because overstating it
 * would be the exact failure this project exists to avoid:
 *
 *   THEY DO prove the adapter's own logic: statement shape, parameter order,
 *   ordering guarantees, idempotent replay, and — importantly — that it maps
 *   constraint violations to domain errors instead of leaking driver errors or
 *   racing a read-then-write.
 *
 *   THEY DO NOT prove PostgreSQL behaves as assumed. The fake enforces the same
 *   constraints the migration declares (PK on (subject_id, seq), UNIQUE on
 *   (subject_id, event_id) and (subject_id, idempotency_key)), so the adapter is
 *   tested against the contract it relies on — but a real database is still
 *   required before production. `assertSchema()` exists so a missing constraint
 *   fails loudly at startup rather than corrupting data quietly.
 *
 *   To run this suite against a real database once one exists, replace the fake
 *   client with a real `pg` client against a scratch schema. No test bodies change
 *   — that is the point of a conformance suite.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { memoryStore, appendEvent } from "../log.mjs";
import { conformanceSuite } from "./conformance.mjs";
import { postgresEventStore, assertSchema, SequenceConflict } from "./postgres.mjs";
import { catalystEventStore, ConcurrentAppendDetected, CATALYST_TABLE_SPEC } from "./catalyst.mjs";

/* =====================================================================
   A Postgres client double that enforces the migration's constraints.
   ===================================================================== */
function fakePgClient() {
  /** @type {Map<string, object>} key `${subject_id}|${seq}` */
  const rows = new Map();
  const byEventId = new Set();
  const byIdem = new Set();
  const log = [];

  const uniqueViolation = (constraint) => {
    const err = new Error(`duplicate key value violates unique constraint "${constraint}"`);
    err.code = "23505";
    err.constraint = constraint;
    return err;
  };

  return {
    statements: log,
    async query(text, params = []) {
      log.push({ text: text.trim().split("\n")[0].trim(), params });
      const t = text.trim();

      if (t.startsWith("INSERT INTO events")) {
        const [subject_id, seq, event_id, type, schema_version, occurred_at, recorded_at,
               classification, actor_kind, corrects, caused_by, idempotency_key,
               prev_hash, hash, envelope] = params;

        const pk = `${subject_id}|${seq}`;
        if (rows.has(pk)) throw uniqueViolation("events_pkey");
        if (byEventId.has(`${subject_id}|${event_id}`)) throw uniqueViolation("events_event_id_unique");
        if (idempotency_key && byIdem.has(`${subject_id}|${idempotency_key}`)) {
          throw uniqueViolation("events_idempotency_unique");
        }

        rows.set(pk, { subject_id, seq: Number(seq), event_id, type, schema_version, occurred_at,
                       recorded_at, classification, actor_kind, corrects, caused_by,
                       idempotency_key, prev_hash, hash, envelope });
        byEventId.add(`${subject_id}|${event_id}`);
        if (idempotency_key) byIdem.add(`${subject_id}|${idempotency_key}`);
        return { rows: [] };
      }

      const all = [...rows.values()];

      if (t.includes("AND idempotency_key = $2")) {
        const [s, k] = params;
        return { rows: all.filter((r) => r.subject_id === s && r.idempotency_key === k).map((r) => ({ envelope: r.envelope })) };
      }
      if (t.includes("AND seq >= $2 AND seq <= $3")) {
        const [s, from, to] = params;
        return { rows: all.filter((r) => r.subject_id === s && r.seq >= from && r.seq <= to)
                          .sort((a, b) => a.seq - b.seq).map((r) => ({ envelope: r.envelope })) };
      }
      if (t.includes("ORDER BY seq DESC") && t.includes("SELECT envelope")) {
        const [s] = params;
        const found = all.filter((r) => r.subject_id === s).sort((a, b) => b.seq - a.seq)[0];
        return { rows: found ? [{ envelope: found.envelope }] : [] };
      }
      if (t.includes("SELECT hash FROM events")) {
        const [s] = params;
        const found = all.filter((r) => r.subject_id === s).sort((a, b) => b.seq - a.seq)[0];
        return { rows: found ? [{ hash: found.hash }] : [] };
      }
      if (t.includes("WHERE event_id > $1")) {
        const [from, limit] = params;
        return { rows: all.filter((r) => r.event_id > from).sort((a, b) => (a.event_id < b.event_id ? -1 : 1))
                          .slice(0, limit).map((r) => ({ envelope: r.envelope })) };
      }
      if (t.includes("GROUP BY subject_id")) {
        const bySubject = new Map();
        for (const r of all) {
          const cur = bySubject.get(r.subject_id) ?? { seq: 0, events: 0 };
          bySubject.set(r.subject_id, { seq: Math.max(cur.seq, r.seq), events: cur.events + 1 });
        }
        return { rows: [...bySubject.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))
                        .map(([subject_id, v]) => ({ subject_id, seq: v.seq, events: v.events })) };
      }
      if (t.includes("pg_constraint")) {
        return { rows: [{ conname: "events_pkey" }, { conname: "events_event_id_unique" }] };
      }
      if (t.includes("pg_indexes")) {
        return { rows: [{ indexname: "events_idempotency_unique" }] };
      }

      throw new Error(`fakePgClient: unhandled statement:\n${t}`);
    },
  };
}

/* =====================================================================
   A Catalyst Data Store double. Deliberately has NO unique enforcement,
   because the real one has none — that is the limitation under test.
   ===================================================================== */
function fakeCatalystClient() {
  const rows = [];
  return {
    rows,
    async insert(_table, row) {
      rows.push({ ...row });
    },
    async query(zcql) {
      const subject = /subject_id = '([^']*)'/.exec(zcql)?.[1];
      const idem = /idempotency_key = '([^']*)'/.exec(zcql)?.[1];
      const from = /seq >= (\d+)/.exec(zcql)?.[1];
      const to = /seq <= (\d+)/.exec(zcql)?.[1];
      const afterId = /event_id > '([^']*)'/.exec(zcql)?.[1];

      let out = rows;
      if (subject !== undefined) out = out.filter((r) => r.subject_id === subject);
      if (idem !== undefined) out = out.filter((r) => r.idempotency_key === idem);
      if (from !== undefined) out = out.filter((r) => Number(r.seq) >= Number(from));
      if (to !== undefined) out = out.filter((r) => Number(r.seq) <= Number(to));
      if (afterId !== undefined) out = out.filter((r) => r.event_id > afterId);
      return out.map((r) => ({ career_events: r }));
    },
  };
}

/* =====================================================================
   The same suite, three adapters.
   ===================================================================== */

conformanceSuite("memory", async () => memoryStore());
conformanceSuite("postgres", async () => postgresEventStore(fakePgClient()));
conformanceSuite("catalyst", async () => catalystEventStore(fakeCatalystClient()), {
  concurrentAppendIsAtomic: false,
});

/* ------------------------------------------- adapter-specific behaviour --- */

test("[postgres] a unique violation becomes a domain conflict, not a driver error", async () => {
  const client = fakePgClient();
  const store = postgresEventStore(client);
  const first = await appendEvent(store, {
    subjectId: "sub_pg", type: "profile.created",
    actor: { kind: "human", id: "u", role: "counsellor" }, payload: {},
  });

  await assert.rejects(
    () => store.append("sub_pg", first, { expectedSeq: first.seq }),
    (err) => err instanceof SequenceConflict && err.code === "SEQ_CONFLICT",
    "callers must see a retryable conflict, never a Postgres error code"
  );
});

test("[postgres] append is a single INSERT — no read-then-write race", async () => {
  const client = fakePgClient();
  const store = postgresEventStore(client);
  await appendEvent(store, {
    subjectId: "sub_pg2", type: "profile.created",
    actor: { kind: "human", id: "u", role: "counsellor" }, payload: {},
  });

  // appendEvent reads head (1 SELECT), then the adapter INSERTs. The adapter
  // itself must not add a check-then-write, or two writers can both pass the check.
  const inserts = client.statements.filter((s) => s.text.startsWith("INSERT INTO events"));
  const selectsBeforeInsert = client.statements
    .slice(0, client.statements.findIndex((s) => s.text.startsWith("INSERT INTO events")))
    .filter((s) => s.text.startsWith("SELECT"));
  assert.equal(inserts.length, 1);
  assert.ok(selectsBeforeInsert.length <= 1, "the adapter must not verify-then-insert");
});

test("[postgres] assertSchema passes when constraints exist and fails when they do not", async () => {
  await assert.doesNotReject(() => assertSchema(fakePgClient()));

  const bare = {
    async query(text) {
      if (text.includes("pg_constraint")) return { rows: [] };
      if (text.includes("pg_indexes")) return { rows: [] };
      return { rows: [] };
    },
  };
  await assert.rejects(
    () => assertSchema(bare),
    /not safe to write to[\s\S]*events_pkey[\s\S]*events_event_id_unique/,
    "a missing constraint must refuse startup, not degrade silently"
  );
});

test("[catalyst] a lost conflict is DETECTED after the fact, not hidden", async () => {
  const client = fakeCatalystClient();
  const store = catalystEventStore(client);
  const actor = { kind: "human", id: "u", role: "counsellor" };
  const first = await appendEvent(store, { subjectId: "sub_cat", type: "profile.created", actor, payload: {} });

  // Simulate the race the store cannot prevent: another writer already inserted
  // seq 2 directly, and our writer's pre-check happened before that.
  const second = await appendEvent(store, { subjectId: "sub_cat", type: "counselling.note_added", actor, payload: { w: 1 } });
  await client.insert("career_events", {
    subject_id: "sub_cat", seq: second.seq, event_id: "01OTHERWRITER",
    type: "counselling.note_added", classification: "care_team", actor_kind: "human",
    idempotency_key: null, prev_hash: first.hash, hash: "sha256:forged",
    envelope: JSON.stringify({ ...second, event_id: "01OTHERWRITER", hash: "sha256:forged" }),
  });

  const verified = await store.verify("sub_cat");
  assert.equal(verified.ok, false, "a forked chain must not verify");
});

test("[catalyst] the table spec documents the missing-uniqueness limitation", () => {
  assert.equal(CATALYST_TABLE_SPEC.table, "career_events");
  assert.match(CATALYST_TABLE_SPEC.note, /No unique constraint/i);
  assert.match(CATALYST_TABLE_SPEC.note, /PostgreSQL is the system of record/i);
  assert.ok(CATALYST_TABLE_SPEC.columns.some((c) => c.name === "envelope"));
});

test("ConcurrentAppendDetected carries what an operator needs to act", () => {
  const err = new ConcurrentAppendDetected("sub_x", 7);
  assert.equal(err.code, "CONCURRENT_APPEND");
  assert.equal(err.subjectId, "sub_x");
  assert.equal(err.seq, 7);
  assert.match(err.message, /reconciled/);
});
