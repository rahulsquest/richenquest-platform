/**
 * Identity Vault — PostgreSQL adapter for the VaultStore port.
 *
 * Architecture: docs/25-career-record-architecture.md §4, §11.4.
 * Schema:       db/migrations/002_identity_vault.sql
 *
 * Closes BL-7. Before this, `memoryVaultStore()` was the only VaultStore in
 * existence: identity died with the process, exports returned an empty
 * identity.json, minor-status checks silently stopped working, and
 * crypto-shredding had nothing durable to shred — so the erasure guarantee was
 * unenforceable in any deployed system.
 *
 * DEPENDENCY POSITION: like the event-store adapter, this depends on a
 * `query(text, params) -> {rows}` function, not on a driver. The vault module
 * above it stays ignorant of PostgreSQL, and this file imports no vendor SDK.
 *
 * WHAT THIS ADAPTER DOES NOT DO
 * It does not encrypt, decrypt, or know what a KEK is. It stores and returns
 * opaque sealed blobs exactly as `identityVault()` hands them over. Every
 * cryptographic decision stays in `identity/vault.mjs`, so there is one place
 * where the envelope scheme lives and no chance of two implementations drifting.
 * The blobs are round-tripped verbatim: GCM authenticates the ciphertext against
 * its AAD, so any storage layer that reordered, re-encoded or "helpfully"
 * normalised a field would surface as a decryption failure, not as silent
 * corruption.
 */

const SQL = {
  /**
   * Upsert rather than insert: a rotation re-wraps an existing subject's DEK.
   * created_at is preserved on conflict — it records when the subject's identity
   * first entered the vault, which a rotation does not change.
   *
   * `material` is the wrapped DEK, opaque to this layer: local AES-GCM in
   * development, a Cloud KMS ciphertext in production. The DB never sees a plain
   * key and never needs to know which provider produced the blob.
   */
  putKey: `
    INSERT INTO vault_keys (subject_id, version, material)
         VALUES ($1, $2, $3)
    ON CONFLICT (subject_id) DO UPDATE
            SET version    = EXCLUDED.version,
                material   = EXCLUDED.material,
                updated_at = now()`,

  getKey: `
    SELECT version, material
      FROM vault_keys
     WHERE subject_id = $1`,

  /**
   * THE ERASURE. RETURNING makes "the key existed and is now gone" and "there was
   * never a key" distinguishable in one statement — the vault must tell those
   * apart, because erasing an already-erased subject is not a success.
   */
  destroyKey: `
    DELETE FROM vault_keys
     WHERE subject_id = $1
 RETURNING subject_id`,

  putField: `
    INSERT INTO vault_fields (subject_id, field, iv, ct, tag)
         VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (subject_id, field) DO UPDATE
            SET iv         = EXCLUDED.iv,
                ct         = EXCLUDED.ct,
                tag        = EXCLUDED.tag,
                updated_at = now()`,

  getField: `
    SELECT iv, ct, tag
      FROM vault_fields
     WHERE subject_id = $1 AND field = $2`,

  listFields: `
    SELECT field
      FROM vault_fields
     WHERE subject_id = $1
     ORDER BY field ASC`,

  /** Subjects still wrapped under an older KEK — the rotation work queue. */
  subjectsByKekVersion: `
    SELECT subject_id
      FROM vault_keys
     WHERE version <> $1
     ORDER BY subject_id ASC
     LIMIT $2`,
};

/**
 * @param {{ query(text: string, params?: any[]): Promise<{rows: any[]}> }} client
 */
export function postgresVaultStore(client) {
  return {
    async putKey(subjectId, wrapped) {
      await client.query(SQL.putKey, [subjectId, wrapped.version, wrapped.material]);
    },

    async getKey(subjectId) {
      const { rows } = await client.query(SQL.getKey, [subjectId]);
      if (!rows.length) return null;
      const { version, material } = rows[0];
      return { version, material };
    },

    async destroyKey(subjectId) {
      const { rows } = await client.query(SQL.destroyKey, [subjectId]);
      return rows.length > 0;
    },

    async putField(subjectId, field, blob) {
      await client.query(SQL.putField, [subjectId, field, blob.iv, blob.ct, blob.tag]);
    },

    async getField(subjectId, field) {
      const { rows } = await client.query(SQL.getField, [subjectId, field]);
      if (!rows.length) return null;
      const { iv, ct, tag } = rows[0];
      return { iv, ct, tag };
    },

    async listFields(subjectId) {
      const { rows } = await client.query(SQL.listFields, [subjectId]);
      return rows.map((r) => r.field);
    },

    /**
     * Operational extra, not part of the VaultStore port: which subjects still
     * need re-wrapping after a KEK rotation. Rotation is O(subjects) because only
     * the wrapped key changes, so this is the whole work queue.
     */
    async subjectsNeedingRotation(currentVersion, { limit = 1000 } = {}) {
      const { rows } = await client.query(SQL.subjectsByKekVersion, [currentVersion, limit]);
      return rows.map((r) => r.subject_id);
    },
  };
}

/**
 * Verify the database enforces what the vault relies on.
 *
 * Mirrors assertSchema() for the event log and runs from the same startup gate.
 * The failure this catches is worse than a crash: with vault_keys missing, a
 * `put()` throws on the first write and identity never lands — but with the
 * PRIMARY KEY missing, a rotation would INSERT a second key row instead of
 * replacing the first, and `getKey()` would then return whichever row the planner
 * felt like. A subject with two data keys is a subject whose erasure destroys one
 * of them.
 */
export async function assertVaultSchema(client) {
  const missing = [];

  const tables = await client.query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = current_schema() AND table_name IN ('vault_keys','vault_fields')`
  );
  const present = new Set(tables.rows.map((r) => r.table_name));
  for (const table of ["vault_keys", "vault_fields"]) {
    if (!present.has(table)) missing.push({ name: table, what: "table" });
  }

  // Without the tables there is nothing to check constraints on, and reporting
  // "missing primary key" alongside "missing table" only obscures the real fix.
  if (missing.length === 0) {
    const constraints = await client.query(
      `SELECT conrelid::regclass::text AS tbl, contype
         FROM pg_constraint
        WHERE conrelid IN ('vault_keys'::regclass, 'vault_fields'::regclass)
          AND contype = 'p'`
    );
    const withPk = new Set(constraints.rows.map((r) => r.tbl));
    if (!withPk.has("vault_keys")) missing.push({ name: "vault_keys_pkey", what: "PRIMARY KEY (subject_id)" });
    if (!withPk.has("vault_fields")) {
      missing.push({ name: "vault_fields_pkey", what: "PRIMARY KEY (subject_id, field)" });
    }
  }

  if (missing.length) {
    throw new Error(
      "Identity vault schema is not safe to write to. Missing:\n" +
        missing.map((m) => `  · ${m.name} — ${m.what}`).join("\n") +
        "\nApply db/migrations/002_identity_vault.sql. Without it, identity does not" +
        " survive a restart and crypto-shredding has nothing durable to destroy," +
        " so the erasure guarantee cannot be honoured."
    );
  }
  return true;
}

export { SQL };
