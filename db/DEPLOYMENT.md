# Deployment — Career Record database mechanics

> **Scope.** This file covers database-specific mechanics only. The canonical deployment
> reference — environments, the full environment-variable table, infrastructure requirements
> and rollback — is **[docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md)**.

PostgreSQL is the **only** system of record. Catalyst is the application runtime
and integration layer; it is never the primary data store.

## Required environment

See the environment-variable tables in [docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md#required-environment-variables).
Not duplicated here, so the two cannot drift.

## PostgreSQL version

- **Minimum supported major: 16.** Startup refuses anything older.
- **Tested against: 18.4** (`db/test/`, real server, not a mock).

16 is the oldest release providing hash partitioning, partial unique indexes on
partitioned tables, and the jsonb round-trip behaviour the hash chain depends on.
A minimum rather than an exact pin lets a managed provider apply patch upgrades
without failing startup.

## Deploy sequence

```bash
node db/migrate.mjs status     # what would change
node db/migrate.mjs up         # apply (advisory-locked, idempotent)
```

Then start the app. `prepareDatabase()` runs on boot and **refuses to serve
traffic** unless:

1. the server version is ≥ the minimum,
2. no migrations are pending,
3. no applied migration has been edited (checksum drift),
4. `assertSchema()` confirms the constraints the append path relies on,
5. `assertVaultSchema()` confirms the identity vault's tables and keys exist.

The append path delegates conflict detection to database constraints, so a
missing constraint does not degrade gracefully — it silently corrupts a log we
can never repair. The vault gate is the same reasoning: without its tables,
identity fails to store and an erasure finds no key to destroy. Hence the refusal
rather than a warning. Both migrations (`001_event_log.sql`, `002_identity_vault.sql`)
must be applied.

## Least-privilege database role

The append-only log and the erasable vault need **opposite** privileges, and the
same application role holds both — the grants are per-table, so the log stays
append-only while the vault stays erasable.

```sql
CREATE ROLE record_writer LOGIN PASSWORD '<generated>';

-- The log: append-only by privilege. No UPDATE, no DELETE, ever.
GRANT SELECT, INSERT ON events, digests TO record_writer;
REVOKE UPDATE, DELETE, TRUNCATE ON events, digests FROM record_writer;

-- The migration ledger is READ-ONLY to the application: it only ever reads this
-- at the startup gate, to confirm nothing is pending. Writing to it is the
-- migration role's business. `applied()` in db/migrate.mjs probes with
-- to_regclass() before any DDL precisely so this role needs no CREATE.
GRANT SELECT ON schema_migrations TO record_writer;

-- The vault: DELETE on vault_keys IS the erasure; UPDATE on vault_fields is a
-- corrected value overwriting its ciphertext. Granting them here does not weaken
-- the log — different tables, different rules.
GRANT SELECT, INSERT, UPDATE, DELETE ON vault_keys, vault_fields TO record_writer;
```

Verified in `db/test/postgres.integration.test.mjs` (log) and
`db/test/vault.integration.test.mjs` (vault): with these grants the log refuses
`UPDATE`/`DELETE` while the vault can erase and correct.

Migrations run as a **separate, higher-privileged role**, not as `record_writer`.

The split is carried into deployment by `DATABASE_URL_APP`: the deployed function is built with the
`record_writer` URL, while the owner `DATABASE_URL` stays reserved for `db/migrate.mjs`. See the
environment tables in [docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md#required-environment-variables) —
`functions/catalyst/redeploy.sh` refuses to build or deploy without it.

## Key management (KMS)

The vault's KEK comes from a key provider (`functions/record/identity/kms.mjs`).
Production uses **Google Cloud KMS** via `functions/record/identity/kms-gcp.mjs`;
`envKeyProvider` is refused when `NODE_ENV=production`.

- **Implemented** ✓ — provider + injected-client interface; the wrapped per-subject
  DEK is threaded through `unwrapDataKey()` (the historical `unwrapKey(version)`
  mismatch is resolved). The GCP adapter maps to `@google-cloud/kms`
  encrypt/decrypt with the subject as additional authenticated data.
- **Unit + Integration verified** ✓ — against a fake client doing real AES-256-GCM,
  through the vault, over real PostgreSQL, and over real HTTP (`kms*.test.mjs`,
  `db/test/vault.integration.test.mjs`, `db/test/kms-api.integration.test.mjs`).
- **Production verified** ✗ — never run against Google's actual service. No
  credentials are reachable here. Wiring (deploy time):

  ```js
  import { KeyManagementServiceClient } from "@google-cloud/kms";
  import { gcpKmsKeyProvider, gcpKmsConfigFromEnv } from
    "./functions/record/identity/kms-gcp.mjs";
  const provider = gcpKmsKeyProvider(new KeyManagementServiceClient(), gcpKmsConfigFromEnv());
  // GCP_PROJECT_ID, GCP_KMS_LOCATION, GCP_KMS_KEYRING, GCP_KMS_KEY are read from env.
  // Service account role: roles/cloudkms.cryptoKeyEncrypterDecrypter — nothing more.
  ```

- **Nothing is deployed.** No environment has run this.
