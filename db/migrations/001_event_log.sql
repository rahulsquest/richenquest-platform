-- ============================================================
-- 001 — The Career Record event log
--
-- Architecture: docs/25-career-record-architecture.md §10.
--
-- Design notes that matter more than the DDL:
--
--  * Append-only is enforced by PRIVILEGE, not by application discipline. The
--    application role has no UPDATE or DELETE grant. An ORM bug, a rogue script
--    or a well-meaning engineer cannot rewrite history through this connection.
--
--  * The adapter's correctness DEPENDS on the constraints declared here. It maps
--    unique-violations to domain errors (sequence conflict, idempotent replay)
--    rather than checking-then-writing, which would race. If these constraints
--    are missing, the adapter is silently unsafe — so they are not optional.
--
--  * On a partitioned table every UNIQUE constraint must include the partition
--    key. Hence (subject_id, event_id) and (subject_id, idempotency_key) rather
--    than the bare columns. This is a real Postgres restriction, not a choice.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS events (
    subject_id      text        NOT NULL,
    seq             bigint      NOT NULL,
    event_id        text        NOT NULL,
    type            text        NOT NULL,
    schema_version  integer     NOT NULL DEFAULT 1,
    occurred_at     timestamptz NOT NULL,
    recorded_at     timestamptz NOT NULL,
    classification  text        NOT NULL,
    actor_kind      text        NOT NULL,
    corrects        text,
    caused_by       text,
    idempotency_key text,
    prev_hash       text,
    hash            text        NOT NULL,
    -- The complete sealed envelope. The columns above are projections OF this
    -- for indexing; envelope is what gets hashed, exported and replayed.
    envelope        jsonb       NOT NULL,

    -- Position in the chain is the primary key: one event per (subject, seq).
    -- This is what makes compare-and-set append a single atomic INSERT.
    PRIMARY KEY (subject_id, seq),

    CONSTRAINT events_event_id_unique UNIQUE (subject_id, event_id),
    CONSTRAINT events_seq_positive CHECK (seq > 0),
    CONSTRAINT events_actor_kind CHECK (actor_kind IN ('human','ai','system','partner')),
    CONSTRAINT events_classification CHECK (classification IN
        ('public','subject','care_team','partner_shareable','restricted','internal'))
) PARTITION BY HASH (subject_id);

-- 16 partitions. Reads are almost always "one person's history", so hashing on
-- subject_id keeps a record's events co-located and avoids a hot partition.
DO $$
BEGIN
    FOR i IN 0..15 LOOP
        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS events_p%s PARTITION OF events
             FOR VALUES WITH (MODULUS 16, REMAINDER %s)', i, i);
    END LOOP;
END $$;

-- Idempotent retries: a counsellor's flaky connection must never double-record.
-- Partial index so the vast majority of rows (no key) cost nothing.
CREATE UNIQUE INDEX IF NOT EXISTS events_idempotency_unique
    ON events (subject_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

-- Global chronological scan for projection rebuilds. event_id is a ULID, so it
-- sorts by time without a separate timestamp index.
CREATE INDEX IF NOT EXISTS events_event_id_idx ON events (event_id);
CREATE INDEX IF NOT EXISTS events_type_idx     ON events (type);

-- ============================================================
-- Daily digest — the public commitment that history was not rewritten.
-- Contains only cryptographic commitments: no names, no payloads, no PII.
-- ============================================================
CREATE TABLE IF NOT EXISTS digests (
    digest_date   date        NOT NULL PRIMARY KEY,
    subject_count integer     NOT NULL,
    event_count   bigint      NOT NULL,
    merkle_root   text        NOT NULL,
    prev_digest   text,
    digest        text        NOT NULL,
    algorithm     text        NOT NULL DEFAULT 'sha256/merkle-v1',
    published_at  timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- Append-only by privilege.
-- Run once per environment with the real role name. The application MUST NOT
-- own these tables, or it can simply grant itself UPDATE.
-- ============================================================
-- CREATE ROLE record_writer LOGIN;
-- GRANT SELECT, INSERT ON events, digests TO record_writer;
-- REVOKE UPDATE, DELETE, TRUNCATE ON events, digests FROM record_writer;
-- ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE UPDATE, DELETE ON TABLES FROM record_writer;

COMMIT;
