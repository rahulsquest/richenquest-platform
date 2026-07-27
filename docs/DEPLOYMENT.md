# DEPLOYMENT

**Canonical deployment reference** for every environment.
Last updated: **2026-07-26**

Database-specific mechanics — migration internals, the PostgreSQL version rationale, the
least-privilege role SQL — live in [`db/DEPLOYMENT.md`](../db/DEPLOYMENT.md) and are referenced,
not duplicated, here.

> **Current reality.** Only Titan is deployed, to the Catalyst **Development** environment. The
> Career Record platform has never been deployed anywhere — it is blocked on BL-1 (hosted
> PostgreSQL); BL-2 (Google Cloud KMS) is code-complete and awaits one live wrap/unwrap at deploy.
> See [STATUS.md](STATUS.md).

---

## Environments

| Environment | Purpose | Runtime | State |
|---|---|---|---|
| **Development** | Engineering; live Titan automation | Catalyst `development` (Project-Rainfall, IN DC) | Titan **live**; Record platform absent |
| **Staging** | Pre-production rehearsal against production-shaped data | Catalyst `development`, second project — **not yet created** | Does not exist |
| **Production** | Real students, real records | Catalyst `production` — **not yet created** | Does not exist |

Staging does not exist today, and Development is doing double duty as both. That is acceptable
while no student data is in the system and unacceptable once Beta starts — creating a real staging
environment is Phase 2 scope ([ROADMAP.md](ROADMAP.md) §2.7).

---

## Development deployment

### Website (local)

```bash
node website/build.mjs && node website/serve.mjs
```

### Career Record API (local, against real PostgreSQL)

```bash
node db/migrate.mjs status
node db/migrate.mjs up
NODE_ENV=development node --env-file=.env functions/record/api/bootstrap.mjs
```

`RECORD_VAULT_PROVIDER=env` is permitted here and only here — startup refuses it when
`NODE_ENV=production`.

### Titan automation → Catalyst Development

Reproducible; env vars are baked at build time from local `.env` and never enter git.

```bash
node --env-file=.env functions/catalyst/build.mjs
bash functions/catalyst/redeploy.sh
```

### Pre-deploy gates (all must pass)

```bash
node website/build.mjs && node scripts/claims-guard.mjs && node scripts/check-links.mjs && node --test "functions/**/*.test.mjs"
```

Real-PostgreSQL integration tests (separate workspace, no external database needed):

```bash
cd db/test && npm install && npm test
```

---

## Staging deployment

**Not yet implemented.** When created, it must satisfy all of the following, or it is not a
staging environment:

- A **separate Catalyst project**, not a shared one with different env vars.
- Its **own PostgreSQL database**, never a pointer to production.
- Production-shaped data volume, with real PII either absent or synthetic.
- The **same deploy artefact** as production — promoted, not rebuilt.
- `NODE_ENV=production`, so the strict startup gates are exercised before production sees them.

The last point is the reason staging exists at all: an environment that runs with development gates
proves nothing about a production boot.

---

## Production deployment

### One-time setup

1. GitHub → Settings → Environments → `production` → require reviewers (founder).
2. Repository secrets: `CATALYST_TOKEN`, `CATALYST_ORG`.
3. Provision PostgreSQL ≥ 16 with TLS (**BL-1**).
4. Create the application role and grant least privilege — SQL in [`db/DEPLOYMENT.md`](../db/DEPLOYMENT.md).
   The application must **not** own the tables, or it can grant itself `UPDATE`.
5. Provision the KMS key and credentials (**BL-2**).
6. Set every production environment variable (below) as Catalyst env vars — never a file.

### Deploy sequence

Migrations run as a **separate, higher-privileged role**, not as the application role.

```bash
node db/migrate.mjs status
node db/migrate.mjs up
```

Then trigger the application deploy by pushing a release tag:

```bash
git tag -a v1.0.0 -m "Production cutover" && git push origin v1.0.0
```

`.github/workflows/deploy-prod.yml` runs on `v*` tags behind the `production` approval environment:
build → claims-guard → link check → `catalyst deploy --env production`.

### What happens on boot

`prepareDatabase()` runs before the server accepts traffic and **refuses to start** unless:

1. the PostgreSQL server version is ≥ the pinned minimum major (16),
2. no migrations are pending,
3. no applied migration has been edited (checksum drift),
4. `assertSchema()` confirms the constraints the append path relies on.

This is a refusal, not a warning, by decision **D18** — the append path delegates conflict detection
to those constraints, so a missing one silently corrupts a log we can never repair.

Production additionally refuses to start with `RECORD_VAULT_PROVIDER=env` or an empty
`CORS_ALLOWED_ORIGINS`.

### Post-deploy verification

- Startup log shows the version line and `✓ startup: schema constraints verified`.
- `GET /v1/records/:subject_id/verify` returns a valid chain for a known subject.
- Titan: gated diagnostics respond; `dead_letter` count is 0; reconcile checkpoints advancing.

---

## Required environment variables

Set as Catalyst environment variables in deployed environments. Locally, `.env` (gitignored) — see
[`.env.example`](../.env.example) for the annotated template.

### Career Record platform

| Variable | Required | Default | Notes |
|---|---|---|---|
| `DATABASE_URL` | yes | — | `postgres://user:pass@host:5432/db?sslmode=require`. **In a deployed function this is the `record_writer` URL**, substituted from `DATABASE_URL_APP` at build time — never the owner's |
| `RECORD_TOKEN_SECRET` | yes | — | ≥ 32 chars, random. Session token signing key |
| `RECORD_VAULT_PROVIDER` | yes | `env` | `env` \| `kms`. `env` is **refused** when `NODE_ENV=production` |
| `RECORD_VAULT_KEK` | **yes when provider is `env`** | — | 32 random bytes, base64 (`openssl rand -base64 32`). Ignored when the provider is `kms` |
| `RECORD_VAULT_KEK_VERSION` | no | `v1` | Which key version wraps new data keys; with `kms`, selects which `GCP_KMS_KEY_<VERSION>` must exist |
| `CORS_ALLOWED_ORIGINS` | yes in prod | — | Comma-separated; empty is refused in production |
| `NODE_ENV` | yes | `development` | `production` enables the strict startup gates |
| `PORT` | no | `8080` | |
| `PG_POOL_MAX` | no | `10` | |
| `PG_STATEMENT_TIMEOUT_MS` | no | `10000` | Some poolers disallow session-level `SET`; logged, not fatal |
| `RUN_MIGRATIONS_ON_START` | no | `true` | `false` to migrate as a separate deploy step |

#### Google Cloud KMS — required when `RECORD_VAULT_PROVIDER=kms`

Ignored entirely when the provider is `env`. The service account needs
`roles/cloudkms.cryptoKeyEncrypterDecrypter` on the key and nothing more: it can wrap and unwrap,
and cannot read, disable, destroy or rotate. Authentication is Application Default Credentials.

| Variable | Required | Default | Notes |
|---|---|---|---|
| `GCP_PROJECT_ID` | yes (kms) | — | |
| `GCP_KMS_LOCATION` | yes (kms) | — | `asia-southeast1` (Singapore), matching the Neon region |
| `GCP_KMS_KEYRING` | yes (kms) | — | |
| `GCP_KMS_KEY` | yes (kms) | — | Key for the **active** version. May instead be supplied as `GCP_KMS_KEY_<VERSION>` — one of the two must exist |
| `GCP_KMS_KEY_V1`, `…_V2` … | no | — | Older versions, so a rotation can still unwrap what they wrapped |

#### Build-time only (local `.env`, never a deployed variable)

| Variable | Required | Default | Notes |
|---|---|---|---|
| `DATABASE_URL_APP` | **yes to deploy** | — | The same database as the least-privilege `record_writer` role. `functions/catalyst/build.mjs` bakes this as the deployed function's `DATABASE_URL` and **refuses to fall back to the owner credential**. Without it the function builds with no database URL and fails at startup with `CONFIG_MISSING`. See [`db/DEPLOYMENT.md`](../db/DEPLOYMENT.md#least-privilege-database-role) |

Why the substitution exists: the event log is append-only **by database privilege** — `record_writer`
holds `SELECT`+`INSERT` and cannot `UPDATE`, `DELETE` or `TRUNCATE`. That guarantee is worth nothing
if the deployed function carries the owner credential, so `DATABASE_URL` (owner) stays reserved for
`db/migrate.mjs` and owner operations and is never copied into a bundle.

#### Deploy preflight

`functions/catalyst/redeploy.sh` validates the above **before it builds or deploys anything**, and
exits non-zero with the list of what is missing. The checks mirror the runtime gates
(`readConfig()`, `envKeyProvider()`, `gcpKmsConfigFromEnv()`) one-for-one — they are a fail-fast
copy, not a second source of truth; the runtime still enforces every one of them. An incomplete
configuration otherwise deploys cleanly and only fails when the function boots.

### Zoho integration

| Variable | Required | Notes |
|---|---|---|
| `ZOHO_DC` | yes | `in` for RichenQuest |
| `ZOHO_CLIENT_ID` | yes | |
| `ZOHO_CLIENT_SECRET` | yes | **secret** |
| `ZOHO_REDIRECT_URI` | yes | Must match the app registration character-for-character |
| `ZOHO_SCOPES` | yes | Least-privilege; widen only as features need it |
| `ZOHO_REFRESH_TOKEN` | yes | **secret**, long-lived |
| `ZOHO_TOKEN_CACHE_FILE` | no | Shares one access token across CLI runs; avoids refresh rate limits |
| `ZOHO_MAIL_ACCOUNT_ID` | per-service | |
| `ZOHO_ANALYTICS_ORG_ID` | per-service | |
| `ZOHO_SALESIQ_SCREENNAME` | per-service | |
| `ZOHO_FLOW_WEBHOOK_URL` | per-service | Capability-bearing URL — treat as a secret |

### Titan automation

| Variable | Required | Notes |
|---|---|---|
| `ZOHO_NOTIFY_URL` | yes | Public HTTPS endpoint Zoho CRM pushes events to |
| `TITAN_WEBHOOK_SECRET` | yes | **secret**. Per-channel token is `HMAC(secret, channel_id)` (D9). Must be identical in `.env` and Catalyst |
| `TITAN_AUTOMATION_USER_ID` | yes | CRM user the automation writes as; powers the loop-breaker |

### CI secrets (GitHub)

`CATALYST_TOKEN`, `CATALYST_ORG`. Absent in dev, the deploy step warns and exits green; absent in
prod, it fails.

> **Credential rule (founder instruction, 2026-07-23).** Passwords, PATs, refresh tokens and API
> secrets are never pasted into chat. Credential material is created and stored locally.

---

## Infrastructure requirements

### PostgreSQL — the only system of record

| Requirement | Value |
|---|---|
| Version | **≥ 16** (tested against 18.4) |
| TLS | Required — `sslmode=require` |
| Extensions | None beyond core |
| Roles | Two: a migration owner, and a least-privilege application role |
| Backups | Point-in-time recovery. Restore must be **rehearsed**, not assumed |
| Region | India, to match the DPDP posture of the rest of the stack |

Why 16 and why a minimum rather than a pin: **D17** in [DECISIONS.md](DECISIONS.md).

An append-only log cannot be repaired by rolling back data. Backups are the only recovery mechanism
that exists, which makes an unrehearsed backup a fiction.

### Catalyst

Project **Project-Rainfall** (`53691000000013024`), IN DC. Current resources:

| Resource | Name | Notes |
|---|---|---|
| Webhook function | `titan-webhook` | Advanced I/O, public HTTPS |
| Reconcile function | `titan-reconcile` | Job function |
| Job pool | `titanpool` | Functions, 256 MB — **console-created**, no API |
| Cron | `titan_reconcile_15min` | Periodic, 15 min |
| Data Store | `titan_idempotency`, `titan_meta`, `titan_dead_letter` | |
| Watch channel | `1001` → `Leads.create` | ~24 h expiry, auto-renewed by the reconcile job |

### KMS

**Google Cloud KMS**, selected 2026-07-26. Key ring + CryptoKey in `asia-southeast1` (Singapore),
co-located with the Neon database so every wrap/unwrap stays intra-region, with a service
account holding `roles/cloudkms.cryptoKeyEncrypterDecrypter` and nothing more — it can wrap and
unwrap data keys but cannot read, disable, destroy or rotate the key. Setup commands in
[ADMIN-SETUP-GUIDE.md](ADMIN-SETUP-GUIDE.md) §2.

The provider interface now wraps and unwraps the per-subject DEK directly
(`wrapDataKey` / `unwrapDataKey`), so the `unwrapKey(version)` shape mismatch recorded in **D20** is
resolved. `subjectId` is bound as additional authenticated data, so a wrapped DEK lifted from one
record cannot be unwrapped under another.

> **Not production-verified.** Unit- and integration-tested against a Google-shaped client doing
> real AES-256-GCM, and through the vault on real PostgreSQL over real HTTP — but never against
> Google's actual service. The live wrap/unwrap is checklist item **E4** and closes **BL-2**.

---

## Rollback procedure

### Application rollback

Re-run `deploy-prod.yml` from the previous release tag. Catalyst deploys are whole artefacts, so
this is a complete revert of application code.

```bash
gh workflow run deploy-prod.yml --ref v<previous-version>
```

### Database rollback — there is no down migration

**Deliberate.** Migrations on an append-only log are forward-only. A down migration that drops a
column drops evidence, and evidence is the product.

If a migration is wrong:

1. **Stop the deploy.** A failed migration is already fully rolled back — each migration commits or
   rolls back whole, verified against a real server to leave no tables behind and no applied record.
2. If the migration *succeeded* but is wrong, write a **new forward migration** that corrects it.
3. If data is wrong, write **correcting events**. The log is never edited (D10).
4. Restore from backup only if the schema is unrecoverable — and accept that a restore on an
   append-only log loses every event after the restore point, permanently.

### Titan rollback

Redeploy the previous bundle:

```bash
git checkout <previous-sha> -- functions/titan functions/catalyst
node --env-file=.env functions/catalyst/build.mjs
bash functions/catalyst/redeploy.sh
```

To stop automation without a deploy, disable the cron in the Catalyst console. The webhook keeps
acking (no data loss — reconcile is the correctness authority and will catch up when re-enabled).

Detailed incident procedures: [architecture/titan-operations-and-roadmap.md](architecture/titan-operations-and-roadmap.md) §3–4.

### DNS cutover rollback

Not yet applicable. `www.richenquest.com` is served by Zoho Sites and is untouched by any deploy
here. When cutover happens (Phase 3), lower the TTL well in advance so reverting is minutes rather
than hours. This is the least reversible action in the project and gets its own founder approval.
