# Deployment — Career Record API

PostgreSQL is the **only** system of record. Catalyst is the application runtime
and integration layer; it is never the primary data store.

## Required environment

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | `postgres://user:pass@host:5432/db?sslmode=require` |
| `RECORD_TOKEN_SECRET` | yes | ≥32 chars, random. Session token signing key |
| `RECORD_VAULT_PROVIDER` | yes in prod | `env` is refused when `NODE_ENV=production` |
| `CORS_ALLOWED_ORIGINS` | yes in prod | comma-separated; empty is refused in production |
| `NODE_ENV` | yes | `production` enables the strict startup gates |
| `PG_POOL_MAX` | no | default 10 |
| `PG_STATEMENT_TIMEOUT_MS` | no | default 10000 |
| `RUN_MIGRATIONS_ON_START` | no | default true; set `false` to migrate as a separate deploy step |

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
4. `assertSchema()` confirms the constraints the append path relies on.

The append path delegates conflict detection to database constraints, so a
missing constraint does not degrade gracefully — it silently corrupts a log we
can never repair. Hence the refusal rather than a warning.

## Least-privilege database role

The application must not own the tables, or it can grant itself `UPDATE`.

```sql
CREATE ROLE record_writer LOGIN PASSWORD '<generated>';
GRANT SELECT, INSERT ON events, digests, schema_migrations TO record_writer;
REVOKE UPDATE, DELETE, TRUNCATE ON events, digests FROM record_writer;
```

Verified in `db/test/postgres.integration.test.mjs`: with this grant, `UPDATE`
and `DELETE` are refused by the database while `SELECT`/`INSERT` still work.

Migrations run as a **separate, higher-privileged role**, not as `record_writer`.

## Not yet verified

- **KMS**: `functions/record/identity/kms.mjs` is an abstraction only. It has been
  exercised against a fake client, never a real provider. `RECORD_VAULT_PROVIDER`
  cannot be satisfied in production until one is wired and verified. See the shape
  mismatch noted at the bottom of that file — `unwrapKey()` will need the wrapped
  per-subject key threaded through it.
- **Nothing is deployed.** No environment has run this.
