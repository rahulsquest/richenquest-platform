# STATUS

**Canonical implementation state.** Updated on every implementation change.
Last updated: **2026-07-26** (RC2 — CRM provisioned and verified against the live org; full suite
re-run and test-count arithmetic corrected) · Branch `release/rc-1` · HEAD `bd8f711` + uncommitted

> Companion documents: [ROADMAP.md](ROADMAP.md) · [DECISIONS.md](DECISIONS.md) ·
> [DEPLOYMENT.md](DEPLOYMENT.md) · [CHANGELOG.md](CHANGELOG.md)

---

## Current implementation status

Six systems exist in one repository, at three different levels of maturity.

| System | State | Runs where |
|---|---|---|
| **Website** (`website/`) | Feature-complete, 23 pages, built and gated | Nowhere — not deployed |
| **Student Portal** (`website/src/assets/js/app/`) | Complete, integrated, verified end-to-end | Nowhere — ships dormant until an API origin is set |
| **Founder Operations** (`functions/ops/`, `website/src/assets/js/console/`) | Dashboard, Leads, Students, **Collaboration CRM**, Tasks, Analytics complete and browser-verified | Nowhere — ships dormant until an API origin is set |
| **Zoho integration** (`functions/zoho/`) | Complete; **35/35 fields provisioned and verified in the live org** | Local CLI + Catalyst |
| **Titan automation** (`functions/titan/`, `functions/catalyst/`) | **LIVE** end-to-end | Catalyst **Development** env |
| **Career Record platform** (`functions/record/`, `functions/platform/`, `db/`) | Code-complete, integration-tested, **vault durable** | Nowhere — no database provisioned |

The public site at `www.richenquest.com` is served by **Zoho Sites (WYSIWYG)** and has no
connection to this repository. Nothing in git can change it before a DNS cutover.

---

## Completed

**Platform foundation** (`functions/platform/`)
Request context, typed errors, structured logging, validation, metrics, security helpers, and the
shared request pipeline. Every API route runs through it.

**Career Record core** (`functions/record/`)
Append-only, hash-chained event log. Event envelope + chain verification, policy layer, projections
(`views.mjs`), daily digest. Three store adapters — PostgreSQL, Catalyst Data Store, memory — behind
one conformance suite.

**Identity** (`functions/record/identity/`, `functions/record/adapters/vault-postgres.mjs`)
Encrypted vault with per-subject data keys, consent management, crypto-shredding erasure, session
authentication. **Durable on PostgreSQL** since 2026-07-26 (migration 002): identity survives a
restart and erasure is enforceable. The KEK comes from a key provider: `envKeyProvider` for
development, **Google Cloud KMS** in production (`kms.mjs` + `kms-gcp.mjs`) — code complete and
verified through the vault, over real PostgreSQL and real HTTP; the one live round-trip against
Google's service is gated on deploy credentials (**BL-2**).

**Career Record API** (`functions/record/api/`) — 7 routes under `/v1/career-records`:
`POST /` · `GET /:subject_id` · `GET /:subject_id/timeline` · `POST /:subject_id/events` ·
`GET /:subject_id/events/:event_id` · `POST /:subject_id/export` · `GET /:subject_id/verify`

**Student Portal** (`website/src/pages/dashboard.html`, `website/src/assets/js/app/`)
Eight features complete: session handling, layout, timeline, record viewer, evidence viewer,
notifications, profile, settings. A hash-routed client over the Career Record API — no framework, no
build step beyond the existing one, no innerHTML anywhere. Sessions arrive as a signed token in the
URL fragment and are erased from history on first paint. Ships **dormant**: with `record_api.base_url`
unset the dashboard renders a "not configured" gate and issues no requests, and it has no fallback
dataset in any state. Integrated with the authentication backend and verified end-to-end on
2026-07-26.

**Founder Operations platform** (`functions/ops/`)
An internal console over Zoho CRM — the operational system of record (ADR-003) — reusing the
same platform pipeline, transport and token as the Career Record API. **Capability + scope
permission model** (`permissions.mjs`): 6 roles, 20 capabilities, three scopes, with every list
filtered and every by-id read checked **today**, so adding the six team accounts is account
creation rather than an engineering project. 20 routes under `/v1/ops` across 16 paths. The console
(`/console/`) builds its own navigation from the server's capability manifest.

**Collaboration CRM — University Partnership OS** (`functions/ops/collaboration.mjs`)
The B2B side, complete: university profiles (accreditation, campuses, international office,
partnership type), a **programme catalogue** and **opportunity tracking** (scholarships, exchanges,
research, internships), the partnership workspace (contacts, meetings, agreements, renewal dates,
required-document checklist, assigned owner), a derived relationship timeline, and **renewal
intelligence**.

**Every entity maps onto an existing Zoho module** (Accounts / Contacts / Events / Notes /
Attachments / Products) — no new infrastructure and nothing to provision before the console works.
Three modelling decisions carry the design: universities and partners are one register at different
pipeline stages; degrees and opportunities are one collection split by kind; and the timeline and
document checklist are **derived, never stored**, so they cannot drift from what they describe.

Renewal intelligence answers "what will break if nobody acts" as one severity-ordered queue across
four failure modes that are each silent alone: lapsed agreements, renewals due, required documents
never filed, and active partnerships nobody has touched (180-day SLA — a slower clock than the
5-minute lead promise).

**Student Operations Platform** (`functions/ops/student.mjs`)
The primary operational workspace for every student: profile and assigned counsellor, application
pipeline (universities applied, offers, rejections, awaiting decisions), document centre (uploaded,
verified, missing, required actions), visa pipeline (status, interview, insurance, accommodation,
travel checklist), communication timeline, and a per-student dashboard.

**Every module is a projection of the Career Record**, not a second copy of it. `application.*`,
`admission.*`, `document.*`, `visa.*` and `arrival.*` were already registered event types with
classifications and a permission model — so there is no new store, no new event type and no second
write path. The CRM Student Case supplies the commercial frame (stage, counsellor, package,
deadline); the Record supplies the history. History is read through the Record's **own** `timeline()`
projection, so staff and student can never be shown different versions of the same events.

**Deployment layer** (`db/`, `functions/record/api/bootstrap.mjs`)
Migration runner (advisory-locked, transactional, checksum-guarded), startup gate that refuses
traffic on version/migration/checksum/schema failure, PostgreSQL minimum major pinned to 16.

**Titan automation** — speed-to-lead pipeline live on Catalyst Development since 2026-07-24.
Webhook (HMAC-authenticated) → dedupe → CRM hydration → loop-break → handler → Cliq. Reconcile job
every 15 min sweeps for missed events and renews the watch channel.

**Website** — 23 pages, design system, destination matcher (`/match/`), claims-guard, link check,
CSS budget. Brand system, design system, trust infrastructure, Constitution v1.0 all ratified.

---

## In Progress

**ALL FEATURE DEVELOPMENT IS FROZEN.** The objective is production readiness, not features.

**Release Candidate 2 is cut**, blocked only on infrastructure. Code, configuration, documentation
and performance are complete and verified; three services have never been reached. See
[RELEASE-CHECKLIST.md](RELEASE-CHECKLIST.md) — sections A and B are DONE with evidence, C onward are
founder work.

**Validated against real infrastructure:** PostgreSQL (adapter, migrations, vault, partitioning,
performance at 5,500 events), HTTP (both APIs), cryptography (hash chain, AES-GCM, KMS envelope), a
real browser, and the **live Zoho CRM** (field mappings, read-only).

**Never executed:** Neon, Google Cloud KMS, Catalyst — no credentials in the environment.

Not built, deliberately: Follow-up Engine, Email Center, AI Assistant Panel.

---

## Pending

| Item | Blocked by | Notes |
|---|---|---|
| Student identity provider | Founder decision (**BL-8**) | Sessions are issued by staff today; genuine, signed, short-lived, but manual |
| KMS Production verification | GCP credentials at deploy (**BL-2**) | Code complete, Unit + Integration verified against Cloud KMS's interface; one live round-trip against Google's service remains |
| First production deployment | Hosted PostgreSQL | Nothing has ever run outside local tests |
| Catalyst **Production** environment | Founder | Titan runs in Development only |
| Team user provisioning (6 users) | 6 email addresses | Tooling written and tested; CRM release audit is 16/17 with users the sole failure |
| Manual Zoho console work | Founder (13 min of clicking) | 4 items, each proven un-automatable |
| WhatsApp half of speed-to-lead | BSP choice + Meta verification | Longest external lead time in the project |
| AI layer | Provider + API key | Not started |
| Legal pages review | Founder/legal | Currently labelled "draft pending review" on the live build |

---

## Verified

Re-run and confirmed green on **2026-07-26** against the current working tree:
**578 distinct tests, 0 failures**, plus the website build and all nine content gates.

The total was previously stated as 653 by adding the three test rows below together. They
overlap — the `functions/**/*.test.mjs` glob already runs both HTTP integration suites, so 75
tests were counted twice. The suites and their counts were correct; only the addition was wrong.
Breakdown in [RELEASE-CHECKLIST.md](RELEASE-CHECKLIST.md#how-that-total-is-counted).

| Suite | Result | What it proves |
|---|---|---|
| `node --test "functions/**/*.test.mjs"` | **413 pass / 0 fail** | Unit + contract behaviour across platform, record, identity, titan, zoho, catalyst — **and** the two HTTP integration suites below, which this glob already runs (338 unit/contract + 25 + 50) |
| **`db/test/performance.integration.test.mjs`** | **11 pass, real PostgreSQL at volume** | **5,500 events / 200 subjects / one 500-event record. Append 0.2 ms p50, heavy read 1.3 ms, chain verify 4.8 ms, vault round trip 0.3/0.1 ms. Partition pruning verified from the query plan: one `Index Scan` of sixteen partitions** |
| **`db/test/smoke.integration.test.mjs`** | **12 pass — the release gate** | **The whole platform as ONE system: lead → console → Career Record → student workspace → student portal → export → partnership renewals → token boundaries → survives a restart. Real PostgreSQL, real HTTP, real crypto, real browser client** |
| `db/test/postgres.integration.test.mjs` | 22 tests, real PostgreSQL 18.4 | Partitioning, PK conflict → retryable `SequenceConflict`, partial idempotency index, jsonb byte-fidelity, append-only enforced **by database privilege** |
| `db/test/deployment.integration.test.mjs` | 12 tests, real PostgreSQL | Migration atomicity, advisory-lock serialisation, checksum-drift refusal, startup gate |
| **`db/test/vault.integration.test.mjs`** | **24 tests, real PostgreSQL, via the KMS provider** | **Identity survives a restart · storage holds no plaintext · erasure destroys the key and leaves undecryptable ciphertext · neither a field nor a wrapped key can be moved between subjects · KEK rotation is O(subjects) and creates no second key row** |
| **`db/test/kms-api.integration.test.mjs`** | **4 tests, real HTTP × real PostgreSQL × KMS** | **A student's DOB written at record creation and read back at export travels through the KMS envelope over HTTP and survives a full server restart; the hash chain still verifies** |
| **`kms.test.mjs` · `kms-gcp.test.mjs`** | **25 unit tests** | **KMS envelope round-trip (real AES-GCM), subject-AAD binding, rotation, crypto-shred, failure opacity, DEK cache, and the Google client-shape mapping** |
| **`db/test/portal.integration.test.mjs`** | **22 tests, real PostgreSQL** | **Portal ↔ API end-to-end: the dashboard's own `api.js`/`session.js` driving the real router over a real socket. Open link → session → dashboard → timeline → profile → acknowledge → consent → export → logout. Export carries durable identity across a restart. Cross-record reads, forged and expired tokens, and CORS all refused correctly** |
| `functions/record/api/integration.test.mjs` | 25 pass | The 7 API routes over real HTTP |
| **`functions/ops/api/integration.test.mjs`** | **50 pass, real HTTP** | **All 20 operations routes; authorisation proven against 6 roles no human holds yet — a counsellor cannot read a colleague's lead, marketing cannot write, an auditor is read-only, preflight advertises every method the router serves** |
| **`functions/ops/collaboration.test.mjs`** | **26 pass** | **Pipeline vocabulary, university profile projection, offering deadlines, the required-document checklist (loose matching so a rename cannot defeat it), renewal intelligence ordering, the derived timeline, and partnership staleness on a slower clock than a lead** |
| **`functions/ops/student.test.mjs`** | **22 pass** | **Application state resolved from the latest event (a rejection after an offer wins), documents rejected after submission, a visa refused then re-granted, travel readiness, and the attention rules that surface silence** |
| **`functions/ops/permissions.test.mjs`** | **20 pass** | **Capability/scope model integrity: no undeclared capability, no dead capability, a student token cannot open the console, the `ops_role` seam works for every role** |
| **Console, real browser** | **verified 2026-07-26** | **Sign-in → dashboard → leads → mark-contacted write → tasks → analytics, against the live operations API. Mobile 375px: no horizontal overflow** |
| `website/dashboard.test.mjs` | 43 pass | Portal session decoding, API path contract, derivations, formatting |
| Website gates | build 23 pages · claims-guard · voice-guard · evidence-guard · disclosure-data · link check (1133 refs) · config · crm-schema · automation-events · matcher-data sync | CI-enforced · site.css 53.4 KB / 60 KB |
| Titan live acceptance (2026-07-24) | **PASS — 88% readiness** | Real leads created in production CRM; forged webhook token rejected; loop-breaker skipped our own write; cron job wrote checkpoints |

**Not verified:** nothing is production-validated. No environment has ever run the Career Record
platform. KMS has been exercised against a fake client only.

---

## Blockers

Ordered by what unblocks the most.

**BL-1 — Hosted PostgreSQL (`DATABASE_URL`)** · *founder*
No database exists. The entire Career Record platform is code-complete and cannot run. Requires
PostgreSQL **≥ 16** with TLS. Blocks: production deployment, Student Dashboard against real data.

**BL-2 — Google Cloud KMS integration** · *code complete; Production verification needs credentials* · **2026-07-26**
Provider chosen: **Google Cloud KMS**. The interface change is done — the provider now wraps and
unwraps the per-subject DEK directly (`wrapDataKey`/`unwrapDataKey`), so the historical
`unwrapKey(version)` mismatch is resolved and `vault_keys` stores an opaque wrapped DEK. Clean
three-layer separation: `vault.mjs` (no provider knowledge) → `kms.mjs` (generic KMS envelope, no
Google) → `kms-gcp.mjs` (the only file that names Google; injected `@google-cloud/kms` client, no SDK
import). Verification, stated honestly:

| Level | Status | Evidence |
|---|---|---|
| Implemented | ✓ | `kms.mjs`, `kms-gcp.mjs`, startup wiring |
| Unit verified | ✓ | `kms.test.mjs`, `kms-gcp.test.mjs` — real AES-256-GCM through the interface, subject-AAD binding, rotation, crypto-shred, failure opacity, Google client-shape mapping |
| Integration verified | ✓ | vault through the KMS provider on real PostgreSQL; the full API over real HTTP + real PG + KMS envelope, identity surviving a restart (`vault.integration`, `kms-api.integration`) |
| **Production verified** | **✗** | **never run against Google's actual service — no credentials reachable here** |

What remains is the one step that genuinely needs credentials: a live wrap/unwrap against a real
Cloud KMS CryptoKey. That is deliberately gated on deployment (P0.3). Until then, `RECORD_VAULT_PROVIDER`
in production is wired but not yet proven end-to-end against Google.

**BL-3 — Team email addresses (0 of 6)** · *founder, 2 minutes*
CRM has 1 user. Provisioning tooling is written and tested. Blocks assignment routing with real
assignees and CRM acceptance A1c/A7. **No longer blocks the operations platform**: the console is
built and tested for the whole team, and each person needs only an account and a token carrying
their `ops_role`.

**BL-4 — Manual Zoho console work (4 items, ~13 min)** · *founder*
Duplicate Cliq channel deletion, Lost Reason validation rule, 2FA enforcement, one native fallback
workflow. Each proven un-automatable in `docs/automation-specs/AM0.4-automation-proofs.md`.

**BL-5 — WhatsApp BSP + Meta business verification** · *founder, days of lead time*
Should already have started. Blocks the WhatsApp half of speed-to-lead.

**BL-6 — AI provider + API key** · *founder*
Blocks the entire AI layer.

**BL-7 — Durable identity vault** · ~~*engineering*~~ · **CLOSED 2026-07-26**
`db/migrations/002_identity_vault.sql` + `functions/record/adapters/vault-postgres.mjs`. Identity
survives a restart, crypto-shredding destroys the key while leaving the ciphertext permanently
undecryptable, and exports carry real identity read back from the database. Verified by 23
real-PostgreSQL tests plus an end-to-end export across a simulated restart. The startup gate now
refuses to serve traffic if the vault schema is absent.

**BL-8 — Student identity proofing** · *founder*
The API deliberately holds no passwords (`auth.mjs` SCOPE). Sessions are currently minted by a
person who has already established who the student is, using
`functions/record/scripts/issue-student-link.mjs`, and delivered as a short-lived link. That is a
genuine signed credential, not a placeholder — but it does not scale past a small cohort and it
puts the burden of identity proofing on a staff member. Choosing the student IdP (magic-link or
OIDC) is an open decision. It does **not** block the first deployment.

Full detail and remediation steps: [EXTERNAL-BLOCKERS.md](EXTERNAL-BLOCKERS.md).

---

## Fixed during release preparation

| # | Bug | Consequence had it shipped |
|---|---|---|
| **P-1** | **15 CRM fields the code writes were not in `crm-schema.json`** — 9 on Accounts, 5 on Products, 1 on Deals | Every Collaboration CRM and Student Operations write would have failed against a real Zoho org |
| **P-2** | The student workspace read `Closing_Date` while the business records deadlines in the provisioned `Next Deadline` field | A team filling in the custom field would have seen an empty deadline on every screen |
| **P-3** | `Subject_Id` did not match the API name Zoho derives from its label | The Career Record link would never have resolved; every workspace would show "not linked" |
| **P-4** | `Campuses` and `Currency` are **reserved labels in Zoho** — both rejected with HTTP 400 on creation | Two fields would silently never exist; campus lists and tuition currency would read empty forever. Renamed to `Campus List` / `Tuition Currency` |

P-1 to P-3 were found by auditing the code's field usage against the provisioning schema. **P-4 was
found only by executing against the live CRM** — no schema audit could predict which labels Zoho
reserves. A suspected fifth bug (picklists reporting zero values) was investigated and dismissed as a
listing-endpoint artifact rather than reported.

**CRM provisioning is complete: 35/35 fields verified present in the live org, picklist values
confirmed field-by-field.**

---

## Open findings

Raised by the portal ↔ backend integration audit (2026-07-26) and **not** fixed, because each is
feature work rather than integration. Recorded so they are decisions rather than oversights.

| # | Finding | Where | Severity |
|---|---|---|---|
| **A-1** | Declining a recommendation never clears it from "waiting for your response". The timeline projection exposes only an `acknowledgement` field, derived from children whose type ends `.acknowledged`, so a `recommendation.declined` child is invisible to the client — which therefore cannot know the student answered. The fix belongs in `views.mjs`, not the portal. | `functions/record/views.mjs` `timeline()` | Medium — a student who declines is chased forever |
| **A-2** | `POST /:subject_id/events` returns `{ type }`, not the event it created. A client cannot learn the id of what it just wrote and must re-read the timeline to find it. Harmless today because the portal re-reads anyway; a trap for the next client. | `functions/record/api/endpoints.mjs` | Low |
| **A-3** | The `gate-error` panel and the `data-app="loading"` element are never shown — no code path calls `showOnly("gate-error")`, and the loading node is only ever hidden. Errors *are* handled, per-view, via `errorState()`. Dead markup, not a broken state. | `website/src/pages/dashboard.html` | Low — cosmetic |
| **A-4** | The integrity alert in Updates only appears once the Record view has been visited, because `ctx.setVerification()` is what populates it. A student who never opens Record is not told their chain failed. | `website/src/assets/js/app.js` | Medium |
| **A-5** | The rate limiter is in-process (`platform/security.mjs`), so limits are per-instance and a multi-instance deployment multiplies every limit by the instance count. Already recorded as debt in `auth.mjs`; restated here because the portal is the first surface that makes it reachable from a browser. | `functions/platform/security.mjs` | Medium at scale |

---

## Next Milestone

**First deployment of the Career Record platform** — the portal is finished and proven; what remains
is infrastructure, and none of it is engineering work this repository can do for itself.

Ordered by what unblocks the most — and now entirely infrastructure, not engineering:

1. **BL-1** hosted PostgreSQL (Neon `DATABASE_URL`) → the platform can run at all.
2. **BL-2** Google Cloud KMS **Production verification** → the code and its interface are done and
   verified against the KMS envelope; what remains is one live wrap/unwrap against Google's service,
   which needs the service-account credentials. This is the P0.3 deploy step, not new code.
3. Set `record_api.base_url` in `website/src/data/platform.json`, add the site origin to
   `CORS_ALLOWED_ORIGINS`, rebuild. The portal activates with no code change.

Definition of done: a student opens a link issued by `issue-student-link.mjs` against a hosted
database and reads their own record, with the vault durable **and** its DEKs wrapped by a real Cloud
KMS key. Everything up to that live KMS round-trip is complete and verified.
