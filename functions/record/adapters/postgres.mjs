/**
 * Career Record — PostgreSQL adapter for the EventStore port.
 *
 * Architecture: docs/25-career-record-architecture.md §10.
 * Schema:       db/migrations/001_event_log.sql
 *
 * DEPENDENCY POSITION: this file depends on a `query(text, params) -> {rows}`
 * function, not on a driver. `pg`, `postgres.js`, a pooled proxy or a test
 * double all satisfy it. The domain model must never depend on a vendor
 * (founder directive), and that rule is worth nothing if the adapter smuggles
 * one in.
 *
 * CONCURRENCY: append is a single INSERT. There is no read-then-write, so there
 * is no race to lose. A concurrent writer at the same seq violates the primary
 * key and we translate that into a domain conflict. Correctness therefore rests
 * on the constraints in the migration, which is why the adapter refuses to guess
 * about them — see `assertSchema`.
 */

const SQL = {
  insert: `
    INSERT INTO events (
      subject_id, seq, event_id, type, schema_version, occurred_at, recorded_at,
      classification, actor_kind, corrects, caused_by, idempotency_key,
      prev_hash, hash, envelope
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,

  byIdempotencyKey: `
    SELECT envelope FROM events
     WHERE subject_id = $1 AND idempotency_key = $2
     LIMIT 1`,

  read: `
    SELECT envelope FROM events
     WHERE subject_id = $1 AND seq >= $2 AND seq <= $3
     ORDER BY seq ASC`,

  head: `
    SELECT envelope FROM events
     WHERE subject_id = $1
     ORDER BY seq DESC
     LIMIT 1`,

  scanAll: `
    SELECT envelope FROM events
     WHERE event_id > $1
     ORDER BY event_id ASC
     LIMIT $2`,

  /** Per-subject chain heads for the daily digest — commitments only, no payloads. */
  chainHeads: `
    SELECT subject_id, max(seq) AS seq, count(*) AS events
      FROM events
     GROUP BY subject_id
     ORDER BY subject_id ASC`,

  headHashFor: `
    SELECT hash FROM events
     WHERE subject_id = $1
     ORDER BY seq DESC
     LIMIT 1`,
};

/** Postgres error codes we translate rather than leak. */
const UNIQUE_VIOLATION = "23505";

export class SequenceConflict extends Error {
  constructor(subjectId, attemptedSeq) {
    super(
      `conflict: seq ${attemptedSeq} already exists for ${subjectId} — another writer got there first; re-read the head and retry`
    );
    this.code = "SEQ_CONFLICT";
    this.name = "SequenceConflict";
    this.subjectId = subjectId;
    this.attemptedSeq = attemptedSeq;
  }
}

/**
 * @param {{ query(text: string, params?: any[]): Promise<{rows: any[]}> }} client
 * @param {{ scanLimit?: number }} [opts]
 */
export function postgresEventStore(client, { scanLimit = 1000 } = {}) {
  const envelopes = (res) => res.rows.map((r) => (typeof r.envelope === "string" ? JSON.parse(r.envelope) : r.envelope));

  return {
    async append(subjectId, event, { expectedSeq, idempotencyKey } = {}) {
      // A replayed request returns the original event rather than a second one.
      if (idempotencyKey) {
        const prior = await client.query(SQL.byIdempotencyKey, [subjectId, idempotencyKey]);
        if (prior.rows.length) return envelopes(prior)[0];
      }

      if (expectedSeq !== undefined && expectedSeq !== event.seq) {
        throw new SequenceConflict(subjectId, expectedSeq);
      }

      try {
        await client.query(SQL.insert, [
          event.subject_id,
          event.seq,
          event.event_id,
          event.type,
          event.schema_version ?? 1,
          event.occurred_at,
          event.recorded_at,
          event.classification,
          event.actor?.kind,
          event.corrects ?? null,
          event.caused_by ?? null,
          idempotencyKey ?? null,
          event.prev_hash ?? null,
          event.hash,
          JSON.stringify(event),
        ]);
      } catch (err) {
        if (err?.code === UNIQUE_VIOLATION) {
          // Two writers raced. If it was an idempotent retry that lost the race,
          // the winner's row is now readable — return it instead of failing.
          if (idempotencyKey) {
            const prior = await client.query(SQL.byIdempotencyKey, [subjectId, idempotencyKey]);
            if (prior.rows.length) return envelopes(prior)[0];
          }
          throw new SequenceConflict(subjectId, event.seq);
        }
        throw err;
      }

      return event;
    },

    async read(subjectId, { fromSeq = 1, toSeq = Number.MAX_SAFE_INTEGER } = {}) {
      return envelopes(await client.query(SQL.read, [subjectId, fromSeq, toSeq]));
    },

    async head(subjectId) {
      const res = await client.query(SQL.head, [subjectId]);
      return res.rows.length ? envelopes(res)[0] : null;
    },

    async scanAll({ fromEventId = "" } = {}) {
      return envelopes(await client.query(SQL.scanAll, [fromEventId, scanLimit]));
    },

    /**
     * Commitments for the daily digest: one (subject, seq, head hash) triple per
     * record. Deliberately returns no payloads, no names and no classifications —
     * the digest must be publishable, so this query cannot be the place PII leaks.
     */
    async chainHeads() {
      const res = await client.query(SQL.chainHeads);
      const out = [];
      for (const row of res.rows) {
        const h = await client.query(SQL.headHashFor, [row.subject_id]);
        out.push({
          subject_id: row.subject_id,
          seq: Number(row.seq),
          events: Number(row.events),
          head: h.rows[0]?.hash ?? null,
        });
      }
      return out;
    },
  };
}

/**
 * Verify the database actually enforces what the adapter relies on.
 *
 * The append path maps constraint violations to domain errors instead of
 * checking first. That is the correct, race-free design — but it means a missing
 * constraint turns silent data corruption into the default. So this runs at
 * startup and refuses to proceed rather than trusting the migration was applied.
 */
export async function assertSchema(client) {
  const required = [
    { name: "events_pkey", what: "PRIMARY KEY (subject_id, seq)" },
    { name: "events_event_id_unique", what: "UNIQUE (subject_id, event_id)" },
  ];
  const res = await client.query(
    `SELECT conname FROM pg_constraint WHERE conrelid = 'events'::regclass`
  );
  const present = new Set(res.rows.map((r) => r.conname));
  const missing = required.filter((r) => !present.has(r.name));

  const idx = await client.query(
    `SELECT indexname FROM pg_indexes WHERE tablename = 'events' AND indexname = 'events_idempotency_unique'`
  );
  if (!idx.rows.length) missing.push({ name: "events_idempotency_unique", what: "UNIQUE (subject_id, idempotency_key)" });

  if (missing.length) {
    throw new Error(
      "Career Record schema is not safe to write to. Missing:\n" +
        missing.map((m) => `  · ${m.name} — ${m.what}`).join("\n") +
        "\nApply db/migrations/001_event_log.sql. The append path relies on these" +
        " constraints to detect concurrent writes; without them conflicts are lost silently."
    );
  }
  return true;
}

export { SQL };
