/**
 * Career Record — Catalyst Data Store adapter for the EventStore port.
 *
 * Architecture: docs/25-career-record-architecture.md §10.
 *
 * ROLE: integration layer, NOT the permanent system of record (founder directive,
 * architecture freeze). It exists so the Career Record can run inside the
 * Catalyst deployment that already carries RichenQuest's automation, and so the
 * eventual move to PostgreSQL is a replay rather than a migration.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * HONEST LIMITATION — read this before relying on it
 *
 * Catalyst Data Store gives us no unique constraint and no conditional insert.
 * The PostgreSQL adapter makes append safe by letting the database reject a
 * duplicate (subject_id, seq); here there is no such authority, so compare-and-set
 * is READ-THEN-WRITE and therefore ADVISORY, not atomic. Two simultaneous writers
 * can both observe head=N and both insert seq=N+1.
 *
 * What this adapter does about it:
 *   · re-reads after writing and RAISES if a duplicate seq materialised, so a
 *     lost conflict is detected rather than silently accepted;
 *   · verifies the hash chain over the re-read window, so a fork is visible.
 *
 * Detection is not prevention. Therefore: single-writer workloads only (the
 * counsellor workspace serialises per subject), and PostgreSQL for anything
 * concurrent. This limitation is a property of the store, not a defect to fix
 * here — and it is the concrete reason the architecture names Postgres as the
 * system of record.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { verifyChain } from "../event.mjs";

const TABLE = "career_events";

export class ConcurrentAppendDetected extends Error {
  constructor(subjectId, seq) {
    super(
      `lost conflict at ${subjectId} seq ${seq}: two writers appended the same position. ` +
        `Catalyst Data Store cannot enforce uniqueness, so this was detected after the fact. ` +
        `The chain for this subject must be reconciled before further writes.`
    );
    this.code = "CONCURRENT_APPEND";
    this.name = "ConcurrentAppendDetected";
    this.subjectId = subjectId;
    this.seq = seq;
  }
}

/**
 * @param {{
 *   insert(table: string, row: object): Promise<void>,
 *   query(zcql: string): Promise<object[]>
 * }} client  minimal Data Store port (see functions/catalyst/datastore-adapter.mjs)
 */
export function catalystEventStore(client) {
  const esc = (s) => String(s).replace(/'/g, "''"); // ZCQL single-quote escape

  const rowsToEvents = (rows) =>
    rows
      .map((r) => {
        const row = r[TABLE] ?? r;
        return typeof row.envelope === "string" ? JSON.parse(row.envelope) : row.envelope;
      })
      .filter(Boolean)
      .sort((a, b) => a.seq - b.seq);

  async function readRange(subjectId, fromSeq, toSeq) {
    const rows = await client.query(
      `SELECT envelope, seq FROM ${TABLE} WHERE subject_id = '${esc(subjectId)}'` +
        ` AND seq >= ${Number(fromSeq)} AND seq <= ${Number(toSeq)}`
    );
    return rowsToEvents(rows);
  }

  return {
    async append(subjectId, event, { expectedSeq, idempotencyKey } = {}) {
      if (idempotencyKey) {
        const prior = await client.query(
          `SELECT envelope FROM ${TABLE} WHERE subject_id = '${esc(subjectId)}'` +
            ` AND idempotency_key = '${esc(idempotencyKey)}'`
        );
        const found = rowsToEvents(prior);
        if (found.length) return found[0];
      }

      const existing = await readRange(subjectId, event.seq, event.seq);
      if (existing.length) {
        const err = new Error(
          `conflict: seq ${event.seq} already exists for ${subjectId} — re-read the head and retry`
        );
        err.code = "SEQ_CONFLICT";
        throw err;
      }
      if (expectedSeq !== undefined && expectedSeq !== event.seq) {
        const err = new Error(`conflict: expected seq ${expectedSeq}, event carries ${event.seq}`);
        err.code = "SEQ_CONFLICT";
        throw err;
      }

      await client.insert(TABLE, {
        subject_id: event.subject_id,
        seq: event.seq,
        event_id: event.event_id,
        type: event.type,
        classification: event.classification,
        actor_kind: event.actor?.kind ?? null,
        idempotency_key: idempotencyKey ?? null,
        prev_hash: event.prev_hash ?? null,
        hash: event.hash,
        envelope: JSON.stringify(event),
      });

      // Detection pass. Cannot prevent a lost conflict; refuses to hide one.
      const after = await readRange(subjectId, event.seq, event.seq);
      if (after.length > 1) throw new ConcurrentAppendDetected(subjectId, event.seq);

      return event;
    },

    async read(subjectId, { fromSeq = 1, toSeq = Number.MAX_SAFE_INTEGER } = {}) {
      return readRange(subjectId, fromSeq, toSeq);
    },

    async head(subjectId) {
      const all = await readRange(subjectId, 1, Number.MAX_SAFE_INTEGER);
      return all.at(-1) ?? null;
    },

    async scanAll({ fromEventId = "" } = {}) {
      const rows = await client.query(
        `SELECT envelope, event_id FROM ${TABLE} WHERE event_id > '${esc(fromEventId)}'`
      );
      return rowsToEvents(rows).sort((a, b) => (a.event_id < b.event_id ? -1 : 1));
    },

    async chainHeads() {
      const events = await this.scanAll({});
      const bySubject = new Map();
      for (const e of events) {
        const cur = bySubject.get(e.subject_id);
        if (!cur || e.seq > cur.seq) bySubject.set(e.subject_id, { seq: e.seq, head: e.hash });
        const rec = bySubject.get(e.subject_id);
        rec.events = (rec.events ?? 0) + 1;
      }
      return [...bySubject.entries()]
        .map(([subject_id, v]) => ({ subject_id, ...v }))
        .sort((a, b) => (a.subject_id < b.subject_id ? -1 : 1));
    },

    /** Chain integrity for one subject — used by the fork-detection pass. */
    async verify(subjectId) {
      return verifyChain(await readRange(subjectId, 1, Number.MAX_SAFE_INTEGER));
    },
  };
}

/**
 * The Data Store table this adapter expects. Catalyst tables are created in the
 * console (the SDK cannot create them), so this is the specification to follow —
 * exactly the same situation as the titan_* tables already in production.
 */
export const CATALYST_TABLE_SPEC = Object.freeze({
  table: TABLE,
  columns: [
    { name: "subject_id", type: "VARCHAR(255)" },
    { name: "seq", type: "BIGINT" },
    { name: "event_id", type: "VARCHAR(64)" },
    { name: "type", type: "VARCHAR(64)" },
    { name: "classification", type: "VARCHAR(32)" },
    { name: "actor_kind", type: "VARCHAR(16)" },
    { name: "idempotency_key", type: "VARCHAR(255)" },
    { name: "prev_hash", type: "VARCHAR(80)" },
    { name: "hash", type: "VARCHAR(80)" },
    { name: "envelope", type: "TEXT" },
  ],
  note:
    "No unique constraint is available. See the limitation block at the top of this file: " +
    "single-writer workloads only; PostgreSQL is the system of record.",
});
