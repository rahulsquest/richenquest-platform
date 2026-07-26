-- ============================================================
-- 002 — The Identity Vault
--
-- Architecture: docs/25-career-record-architecture.md §4, §11.4.
-- Closes BL-7: until this migration, memoryVaultStore() was the only VaultStore
-- that existed, so every subject's date of birth and documents vanished on
-- restart and crypto-shredding had nothing durable to shred.
--
-- Design notes that matter more than the DDL:
--
--  * THIS TABLE HOLDS NO PLAINTEXT. Field values are AES-256-GCM ciphertext sealed
--    under a per-subject data key, with (subject_id, field) bound in as AAD; the
--    data key itself is stored only in WRAPPED form (vault_keys.material) — sealed
--    under a KEK that, in production, never leaves Google Cloud KMS. A dump of
--    these tables without the KMS is inert. That is what allows PII to live in the
--    same database as the event log without contaminating it.
--
--  * vault_keys.material IS OPAQUE. It is a wrapped data key, and its internal
--    shape depends on the key provider: local AES-GCM in development, a Cloud KMS
--    ciphertext in production. The schema deliberately does not model the envelope
--    (no iv/ct/tag columns) — the moment it did, it would be committing to one
--    provider's representation. The database stores a blob and a version; the
--    provider owns everything else.
--
--  * THE PRIVILEGE MODEL IS THE OPPOSITE OF events. The log is append-only by
--    privilege precisely because history must not change. The vault MUST support
--    DELETE on vault_keys — deleting the key row IS the erasure — and UPDATE on
--    vault_fields, because a corrected date of birth overwrites its ciphertext
--    rather than accumulating one. Granting DELETE here is not a weakening of the
--    append-only guarantee; it is what makes the erasure guarantee real, and it
--    is scoped to two tables that contain no history.
--
--  * ERASURE DELETES THE KEY, NOT THE DATA. Field ciphertexts are deliberately
--    left behind. Erasure must not depend on reaching every copy — backups,
--    replicas, cold storage — so it is defined as destroying the only thing that
--    can decrypt them. Rows that remain here after an erasure are permanently
--    undecryptable, and the vault verifies exactly that before reporting success.
--
--  * ON DELETE CASCADE IS DELIBERATELY ABSENT between vault_keys and
--    vault_fields. A cascade would delete the ciphertexts along with the key and
--    quietly convert crypto-shredding into ordinary deletion — which cannot be
--    proven after the fact and does not reach backups.
-- ============================================================

BEGIN;

-- One wrapped data key per subject. Destroying a row here is the erasure.
CREATE TABLE IF NOT EXISTS vault_keys (
    subject_id  text        NOT NULL PRIMARY KEY,
    -- KEK version this DEK is wrapped under. Rotation rewraps the key and touches
    -- no field ciphertext, so it is O(subjects), not O(data).
    version     text        NOT NULL,
    -- The wrapped DEK, opaque to the database: local AES-GCM in development, a
    -- Cloud KMS ciphertext in production. base64/JSON text either way.
    material    text        NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT vault_keys_subject_format CHECK (subject_id ~ '^sub_[A-Za-z0-9_-]+$')
);

-- One sealed value per (subject, field).
CREATE TABLE IF NOT EXISTS vault_fields (
    subject_id text        NOT NULL,
    field      text        NOT NULL,
    iv         text        NOT NULL,
    ct         text        NOT NULL,
    tag        text        NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),

    PRIMARY KEY (subject_id, field),

    -- A field name is bound into the AAD, so it is part of the ciphertext's
    -- identity. Constraining it here keeps an empty or absurd name from ever
    -- becoming an AAD nobody can reproduce.
    CONSTRAINT vault_fields_field_length CHECK (char_length(field) BETWEEN 1 AND 128)
);

-- Erasure lists a subject's fields before destroying the key, and getAll() reads
-- them in one sweep. Both are per-subject prefix scans.
CREATE INDEX IF NOT EXISTS vault_fields_subject_idx ON vault_fields (subject_id);

-- Rotation sweeps by KEK version: "re-wrap everything still on v1".
CREATE INDEX IF NOT EXISTS vault_keys_version_idx ON vault_keys (version);

-- ============================================================
-- Privileges. Run once per environment with the real role name.
--
-- Note the asymmetry with 001: the vault role needs UPDATE and DELETE, the log
-- role must never have them. Use the SAME application role for both — the grants
-- are per-table, so the log stays append-only while the vault stays erasable.
-- ============================================================
-- GRANT SELECT, INSERT, UPDATE, DELETE ON vault_keys, vault_fields TO record_writer;

COMMIT;
