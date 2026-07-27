# Release Checklist — Release Candidate 2 (RC2)

Worked top to bottom. Every line is either **DONE** (verified in this repository)
or **PENDING** with the exact thing that unblocks it.

The distinction is the point of this document: local green proves the code, not
the deployment. Nothing below is marked done because it "should" work.

---

## A. Code readiness — **DONE**

| # | Item | Evidence |
|---|---|---|
| A1 | All function tests pass — unit, contract **and** the two HTTP suites below | `node --test "functions/**/*.test.mjs"` — **413 pass** (338 unit/contract + A2 + A3) |
| A2 | Career Record API over real HTTP | `functions/record/api/integration.test.mjs` — 25 pass |
| A3 | Operations API over real HTTP | `functions/ops/api/integration.test.mjs` — 50 pass |
| A4 | PostgreSQL adapter against a real server | `db/test/postgres.integration.test.mjs` — 22 pass |
| A5 | Migration runner + startup gate | `db/test/deployment.integration.test.mjs` — 12 pass |
| A6 | Identity vault: durability, crypto-shredding, rotation | `db/test/vault.integration.test.mjs` — 24 pass |
| A7 | KMS envelope over real HTTP × real PostgreSQL | `db/test/kms-api.integration.test.mjs` — 4 pass |
| A8 | Student portal ↔ API end-to-end | `db/test/portal.integration.test.mjs` — 22 pass |
| A9 | **Cross-module smoke: the whole platform as one system** | `db/test/smoke.integration.test.mjs` — **12 pass** |
| A10 | Website build + all content gates | 23 pages · claims-guard · voice-guard · evidence-guard · disclosure-data · link check (1133 refs) · config · crm-schema · automation-events · matcher-data — **9 gates, all green** |
| A11 | CSS inside budget | 53.4 KB / 60 KB |
| A12 | Every `.mjs` parses | `find functions -name "*.mjs" \| xargs -n1 node --check` |
| A13 | **Performance measured at volume** | `db/test/performance.integration.test.mjs` — 11 pass |

**Total: 578 distinct tests, 0 failures.** Re-run on 2026-07-26 against the
current working tree (Node 24.18.0).

### How that total is counted

Earlier totals in this file and in the CHANGELOG (617 / 628 / 653) added A1, A2
and A3 together. They overlap: `node --test "functions/**/*.test.mjs"` **already
runs both integration files**, so A2 and A3 were counted twice and the total was
inflated by 75.

| Command | Tests |
|---|---|
| `node --test "functions/**/*.test.mjs"` (A1, inclusive) | 413 |
| — of which unit/contract only | 338 |
| — of which A2, Career Record API over HTTP | 25 |
| — of which A3, Operations API over HTTP | 50 |
| `node --test "scripts/**/*.test.mjs" "website/*.test.mjs"` | 58 |
| `npm --prefix db/test test` (A4–A9, A13) | 107 |
| **Distinct total** | **578** |

CI runs A2 and A3 as separate steps on purpose — a failure there is attributed to
the API rather than lost among 300+ unit tests. That is worth keeping; it just
does not add tests to the total.

A5 is **12**, not the 13 recorded through RC2. Three deployment-level KMS tests
were consolidated into two when the dedicated `kms.test.mjs` / `kms-gcp.test.mjs`
suites landed in 0.15.0. Coverage moved rather than disappeared: DEK-cache purging
on erase and refusal of a malformed client are both asserted in `kms.test.mjs`.

### A13 — measured, not assumed

5,500 events across 200 subjects plus one 500-event record, on real PostgreSQL:

| Operation | p50 | p95 | Budget |
|---|---|---|---|
| Append one event | 0.2 ms | 0.3 ms | 250 ms |
| Read a 25-event record | 0.2 ms | 0.2 ms | 150 ms |
| Read a 500-event record | 1.3 ms | 2.2 ms | 400 ms |
| Head lookup | 0.1 ms | 0.2 ms | 100 ms |
| Timeline over 500 events | 0.1 ms | 0.7 ms | 100 ms |
| Verify a 500-event hash chain | 4.8 ms | 7.5 ms | 600 ms |
| Build a 500-event export | 3.6 ms | 4.1 ms | 400 ms |
| Vault put (KMS wrap + insert) | 0.3 ms | 0.6 ms | 200 ms |
| Vault get (KMS unwrap + select) | 0.1 ms | 0.2 ms | 150 ms |

**Partitioning verified from the query plan**, not assumed: a per-subject read is a
single `Index Scan on events_p5` — one partition of sixteen. All 16 carry data;
the largest holds 10.9% of subjects against a 6.3% ideal, which is ordinary hash
variance at this sample size.

Budgets are 20–100× observed on purpose: this runs on an embedded postgres on a
laptop, and **Neon's network latency will dominate every number above** — likely
adding 1–20 ms per round trip depending on region. The budgets exist to catch a
regression that turns 2 ms into 2 seconds, not to certify a production SLA.

### What A9 actually walks

Lead arrives → founder works it in the console → SLA breach clears → Career Record
opened with identity in the KMS-wrapped vault → case linked → counsellor records
applications, documents, visa → **student opens their portal and sees the same
events** → student exports, and the export verifies independently → partnership
registered and its renewal queue answers → both token boundaries hold → **the whole
platform survives a restart**.

---

## B. Configuration readiness — **DONE**

| # | Item | Evidence |
|---|---|---|
| B1 | Every CRM field the code writes is declared | `config/crm-schema.json` — 36 field definitions |
| B2 | Deployment environment fully templated | `.env.example` — DB, secret, vault, KMS, CORS, runtime |
| B3 | Migration files present and ordered | `001_event_log.sql`, `002_identity_vault.sql` |
| B4 | Consoles ship dormant | `platform.json` origins empty; both render "not connected" |
| B5 | CI runs the real-PostgreSQL suite | `.github/workflows/ci.yml` → `database-and-portal` job |
| B6 | Least-privilege SQL documented | `db/DEPLOYMENT.md` + Admin Setup Guide §1 |
| B7 | **Field mappings verified against the LIVE Zoho org** | `provision-crm.mjs` dry run — see below |

### B7 — CRM provisioned and verified against the LIVE org

Founder-approved, executed against tenant `richenquest` (DC `in`) on 2026-07-26.

```
Summary: {"created":0,"skipped":35,"manual":1,"failed":0,"wouldCreate":0}
```

- **35 of 35 fields confirmed present.** 20 Titan-era fields intact; 15 new fields
  created for the Collaboration CRM, University Partnership OS and the Career
  Record link.
- **Picklist values verified individually** via the per-field detail endpoint:
  Partnership Stage (7), Agreement Status (6), Partnership Type (7), Degree Level
  (7) — each matching the code's vocabulary exactly, so a write cannot be rejected
  for an unknown value.
- `getFields` succeeded on **Accounts and Products**, proving both modules exist
  and current OAuth scopes reach them.
- 1 field remains user-lookup and console-only (Assigned Counselor), as recorded.

### Fixed during release preparation

**15 CRM fields the code wrote did not exist in the schema.** Every Collaboration
and Student Operations write would have failed against a real Zoho org. Now
declared on Accounts (9), Products (5) and Deals (1).

**The deadline field was mismatched.** The code read `Closing_Date` (Zoho standard)
while the business records deadlines in the provisioned `Next Deadline` field. A
team filling in the custom field would have seen an empty deadline everywhere. Now
reads `Next_Deadline` with `Closing_Date` as fallback.

**`Subject_Id` → `Career_Record_Id`**, matching the API name Zoho derives from the
provisioned label.

### Fixed during RC2 validation — found only by running against the live CRM

**Two field labels are RESERVED by Zoho and were rejected on creation** (HTTP 400
`INVALID_REQUEST`, after two retries each):

| Was | Now | Why |
|---|---|---|
| `Campuses` (Accounts) | **`Campus List`** → `Campus_List` | Zoho rejects the label; `Accreditation` at the same type and length succeeded, isolating it to the name |
| `Currency` (Products) | **`Tuition Currency`** → `Tuition_Currency` | Collides with Zoho multi-currency |

Diagnosed by attempting the alternatives, which were accepted immediately. The
API's own `currency` field name is unchanged — only the CRM column moved, which is
precisely what the projection layer exists to absorb.

**A third suspected bug was investigated and dismissed rather than reported.**
`getFields` returns every picklist with zero `pick_list_values`, including
long-established Titan fields known to work in production. The listing endpoint
omits them; the per-field detail endpoint returns them in full. No defect.

---

## C. Infrastructure — **PENDING** (founder)

| # | Item | Blocked on | Unblocks |
|---|---|---|---|
| C1 | Neon project created, PG ≥ 16 | Founder | Everything below |
| C2 | `DATABASE_URL` in `.env` | C1 | Migrations |
| C3 | `node db/migrate.mjs up` against Neon | C2 | The platform running at all |
| C4 | `record_writer` role created and granted | C3 | Append-only enforced by privilege |
| C5 | GCP key ring + key + service account | Founder | Production vault |
| C6 | `RECORD_VAULT_PROVIDER=kms` verified live | C5 | **The only unverified code path** |
| C7 | `RECORD_TOKEN_SECRET` generated (≥32 bytes) | Founder | Any login |
| C8 | Catalyst project + env vars set | Founder | Deployment |
| C9 | `CORS_ALLOWED_ORIGINS` set to site + console | C8 | Browsers reaching the API |

---

## D. Provisioning — **PENDING**

| # | Item | Blocked on |
|---|---|---|
| D1 | ~~`provision-crm.mjs --commit` against production CRM~~ | ✅ **DONE 2026-07-26** — 35/35 verified |
| D2 | 4 console-only CRM items completed (~13 min) | Founder — `EXTERNAL-BLOCKERS.md` B5 |
| D3 | 6 team email addresses supplied | Founder — 2 minutes |
| D4 | 6 team accounts provisioned with `ops_role` | D3 |
| D5 | Existing Student Cases given a `Career Record Id` | D1 |

> **D5 matters more than it looks.** Until a case carries its record id, its
> workspace opens with an empty history. That is handled honestly — the screen
> says "not linked" — but it is not the intended state.

---

## E. Deployed verification — **PENDING** (needs C complete)

Run against the deployed environment, not locally. Each line is a specific
observable, not "check it works".

| # | Check | Pass condition |
|---|---|---|
| E1 | `node db/migrate.mjs status` against Neon | 0 pending, 0 drift |
| E2 | Boot with `NODE_ENV=production` | Starts; refuses if vault provider is `env` |
| E3 | Startup schema gate | Log shows `schema constraints verified (log + vault)` |
| E4 | **Live KMS wrap/unwrap** | A record created, then read back — closes BL-2 |
| E5 | Create a Career Record via API | 201; `vault_keys` row exists in Neon |
| E6 | Student link opens the portal | Timeline renders; fragment erased from the address bar |
| E7 | Export downloads and self-verifies | `node verify.mjs` inside the archive prints OK |
| E8 | Console loads against the deployed API | Nav built from the capability manifest |
| E9 | Lead → contacted round trip | Status changes; attributed note in Zoho |
| E10 | Student workspace on a real case | Six modules; history from the record |
| E11 | Partnership + renewal queue | Institution created; queue answers |
| E12 | CORS from the real origins | Site and console admitted; anything else refused |
| E13 | Restart persistence | Identity still recoverable after a restart |
| E14 | Least-privilege role holds | `UPDATE events` refused by the database |

---

## F. Release — **PENDING** (needs E complete)

| # | Item |
|---|---|
| F1 | `docs/STATUS.md` updated with deployed state |
| F2 | Tag `v1.0.0-internal.1` |
| F3 | Internal User Guide circulated to the team |
| F4 | One week of real use before external commitments |

---

## Known limitations at v1

Stated so nobody discovers them at the wrong moment.

- **In-process rate limiting.** Limits are per instance; a multi-instance deploy
  multiplies every limit by the instance count. Fine at current scale, recorded.
- **Counsellor assignment is not enforced in the Career Record.** `assignedSubjects`
  defaults to "no model configured", so any authenticated counsellor can reach any
  record *through the Record API*. The Operations console **does** scope by CRM
  ownership. Must be closed before any non-staff role is issued a counsellor token.
- **Declining a recommendation does not clear it** from the student's "waiting on
  you" list — the timeline projection exposes only acknowledgements. Cosmetic,
  logged as A-1.
- **Catalyst transport is untested.** The `node:http` path is fully covered; the
  Catalyst Advanced I/O adapter is a thin mapping that has never run.
- **Email Center and AI Assistant are not built.** They need
  `ZOHO_MAIL_ACCOUNT_ID` and an AI provider key respectively.

---

## RC2 status

**Release Candidate 2 is cut on code, configuration, documentation and
performance. It cannot be promoted to a release until an environment exists.**

Validated against real infrastructure: PostgreSQL (adapter, migrations, vault,
partitioning, performance), HTTP (both APIs), cryptography (hash chain, AES-GCM
envelope, KMS wrap/unwrap), a real browser, and the **live Zoho CRM** (field
mappings, read-only).

Never executed: **Neon, Google Cloud KMS, Catalyst.** Three services, no
credentials in the environment. Sections C, D and E remain PENDING and no line in
them is marked done on the basis that it "should" work.

That is one afternoon of founder work (C1–C9), then section E's 14 checks.
