# CHANGELOG

All notable changes to the RichenQuest platform.
Format: [Keep a Changelog](https://keepachangelog.com) · Versioning: [Semantic Versioning](https://semver.org)

**History is never deleted from this file.** Entries are appended and corrected in place; they are
not removed, and superseded work is marked rather than erased.

## Versioning policy

- **`1.0.0` is reserved for the first production deployment.** Nothing has ever been deployed to
  production, so every version below is a `0.x` pre-release. Version numbers do not inflate to look
  like progress.
- `0.x` **minor** bumps mark a completed milestone; **patch** bumps mark fixes and hardening.
- Two git tags exist: `v0.3.0-fat` (FAT baseline) and `v1.0.0-rc.1`. The latter named the
  *website-only* release candidate, cut before the Career Record platform existed. It is retained
  as history and **not** reused — the platform's road to `1.0.0` runs through the `0.x` line below.
- Versions in this file were reconciled against git history on 2026-07-26. Where a version has no
  tag, it is a logical milestone marker, and the commit hash is authoritative.
- **Test totals before 0.22.0 are inflated.** Entries up to and including 0.21.0 (617, 628, and
  the others) add the `functions/**/*.test.mjs` glob to the two HTTP integration suites as though
  they were disjoint. The glob runs both, so those totals double-count 75 tests. The entries are
  left as written — this file does not rewrite history — but a total below 0.22.0 should be read
  as "the suites listed, counted twice in part", not as a test count. From 0.22.0 the stated
  figure is **distinct** tests, which is why the number goes down while coverage does not.

Related: [STATUS.md](STATUS.md) (current state) · [DECISIONS.md](DECISIONS.md) (why) ·
[RELEASE-LOG.md](../RELEASE-LOG.md) (per-change approval record since RC-1).

---

## [Unreleased]

### Added
- Project operating documents: `docs/STATUS.md`, `docs/ROADMAP.md`, `docs/DECISIONS.md`,
  `docs/DEPLOYMENT.md`, `docs/CHANGELOG.md` — the canonical memory for future sessions.

### Fixed — documentation accuracy, no code change
Full suite re-run against the current working tree (Node 24.18.0): **578 distinct tests, 0
failures**, website build 23 pages, all nine content gates green. Four numbers in the canonical
documents did not match what the commands actually print, and each is now corrected:

- **Test totals double-counted by 75.** `node --test "functions/**/*.test.mjs"` already runs
  `functions/record/api/integration.test.mjs` and `functions/ops/api/integration.test.mjs`, so
  adding those two suites to the glob's 413 counted them twice. Verified directly rather than
  assumed: the glob run contains the ops integration test names, and excluding both files yields
  338. The distinct total is 578, and RELEASE-CHECKLIST now shows the arithmetic. CI keeps running
  the two suites as separate steps — attribution on failure is worth the duplicate execution — but
  they do not add to the total.
- **`deployment.integration.test.mjs` is 12 tests, not 13.** Three deployment-level KMS tests were
  consolidated into two when the dedicated `kms.test.mjs` / `kms-gcp.test.mjs` suites landed in
  0.15.0. Coverage moved rather than vanished: DEK-cache purging on erase and refusal of a
  malformed client are asserted in `kms.test.mjs`.
- **Website is 23 pages and 1,133 internal references**, not 22 and 1,128 — the console and
  dashboard pages were added without the figures following. `site.css` is 53.4 KB, not 54.7 KB.
- **A corrupted table row in STATUS.md.** The `functions/**/*.test.mjs` row had lost its
  "what it proves" cell, and that text was stranded as a stray fourth column on the smoke-suite
  row. Restored.

The RELEASE-CHECKLIST's closing section was also still headed "RC1 status" inside a document
titled RC2. Nothing in sections C, D or E changed: **Neon, Google Cloud KMS and Catalyst remain
unexecuted**, and no line is marked done that was not run.

---

## [0.22.0] — 2026-07-26 — RC2: CRM provisioned and verified against the live org

Release candidate validation. No feature work. The Zoho half of production is now real rather than
declared; the rest remains blocked on credentials that do not exist in this environment.

### Done against the live production CRM
- **`provision-crm.mjs --commit`** executed with founder approval against tenant `richenquest`
  (DC `in`). 15 fields created; **35 of 35 now verified present**, 0 pending, 0 failed.
- **Picklist values verified field-by-field** through the per-field detail endpoint — Partnership
  Stage, Partnership Type, Agreement Status and Degree Level each match the code's vocabulary
  exactly, so no write can be rejected for an unknown value.

### Fixed — a production bug only a live run could find
**`Campuses` and `Currency` are reserved labels in Zoho CRM.** Both were rejected with HTTP 400
`INVALID_REQUEST` after two retries. Isolated to the *name* by observing that `Accreditation` — same
module, same type, same length — succeeded, then confirmed by creating `Campus List` and
`Tuition Currency`, which were accepted immediately.

- `Campuses` → **`Campus List`** (`Campus_List`)
- `Currency` → **`Tuition Currency`** (`Tuition_Currency`) — collides with Zoho multi-currency

The API's own `currency` field name is unchanged. Only the CRM column moved, which is exactly what
the projection layer exists to absorb — one rename in `collaboration.mjs`, one in the write path,
and nothing above it noticed.

### Investigated and dismissed
`getFields` reports **every** picklist with zero values — including Titan-era fields proven working
in production. The listing endpoint omits `pick_list_values`; the per-field detail endpoint returns
them in full. Not a defect, and not reported as one.

### Verified
- **578 distinct tests, 0 failures** after the renames: 413 from the functions glob (338
  unit/contract + 25 record HTTP + 50 ops HTTP) · 58 scripts/website · 107 real-PostgreSQL
  (smoke + performance). All content gates green.
  > **Corrected 2026-07-26 (was "653 tests").** The original figure added the functions glob and
  > the two HTTP integration suites as if they were disjoint. They are not — the glob runs both —
  > so 75 tests were counted twice. No suite changed and nothing failed; only the addition was
  > wrong. Retained here rather than erased, per this file's policy.

### Still blocked — credentials absent from this environment
`DATABASE_URL`, `GCP_PROJECT_ID`, `GCP_KMS_KEY`, `CATALYST_TOKEN` and `RECORD_TOKEN_SECRET` are all
unset. Neon migration, KMS verification, Catalyst deployment and checklist section E cannot be run
and are **not** claimed.

---

## [0.21.0] — 2026-07-26 — RC1: production validation sprint

Release Candidate 1. No new features. Validation against everything reachable, and an honest
account of what was not.

### Verified against REAL production
- **Live Zoho CRM field mappings** (read-only dry run, tenant `richenquest`, DC `in`):
  `{"skipped":20,"manual":1,"wouldCreate":15}`. Twenty existing fields confirmed present; the
  fifteen new ones confirmed absent — **proving bug P-1 was real**, not theoretical. `getFields`
  succeeded on Accounts and Products, confirming both modules exist and current OAuth scopes reach
  them, which had been an assumption.

### Added
- **`db/test/performance.integration.test.mjs`** — 11 tests measuring real PostgreSQL at volume:
  5,500 events across 200 subjects plus one 500-event record. Append 0.2 ms p50 / 0.3 ms p95; a
  500-event read 1.3 / 2.2 ms; chain verification 4.8 / 7.5 ms; vault put 0.3 ms and get 0.1 ms
  including KMS wrap/unwrap. Budgets are 20–100× observed on purpose — they catch a regression that
  turns 2 ms into 2 seconds, and cannot certify a production SLA that Neon's network latency will
  dominate.
- **Partition health measured, not assumed.** All 16 hash partitions carry data, the largest holds
  10.9% of subjects against a 6.3% ideal, and a per-subject read resolves to a **single**
  `Index Scan on events_p5` — read from the query plan.
- `npm --prefix db/test run perf` as a focused target; the default gate runs all 107.

### Fixed — both were my own test assertions, not the system
- **Partition spread assertion was statistically wrong.** It compared max/min subject counts and
  failed at 3.67×, which is ordinary hash variance for 200 subjects over 16 buckets. Replaced with
  largest-partition *share* (< 20% against a 6.3% ideal), which catches real clustering without
  failing on noise.
- **Partition-scan counting was wrong.** It matched `events_p\d+` in the plan text, and an Index
  Scan names its index (`events_p5_pkey`) as well as its relation — reporting two partitions for a
  plan touching one. Now walks the plan's `Relation Name` nodes. Pruning was correct throughout.

### Verified
- **628 tests, 0 failures.** 413 functions · 50 ops HTTP · 25 record HTTP · 58 scripts/website ·
  107 real-PostgreSQL (smoke + performance included). All seven content gates green.

### Not done — no credentials in the environment
Neon migration, GCP KMS live wrap/unwrap, and Catalyst deployment. `DATABASE_URL`,
`GCP_PROJECT_ID` and `CATALYST_TOKEN` are all absent. Marked PENDING in the Release Checklist
rather than claimed, and no deployed check is marked done on the basis that it should work.

---

## [0.20.0] — 2026-07-26 — Internal Release v1 preparation

Feature development frozen. Everything here is production readiness: three real bugs fixed, the
whole platform proven as one system, and the documentation a team needs to actually use it.

### Fixed — three production bugs, none of which a test could have caught
- **15 CRM fields the code writes did not exist in the provisioning schema.** Partnership Stage,
  Partnership Type, Agreement Status/Signed On/Expires On, Accreditation, Campuses, International
  Office Contact/Email (Accounts); Degree Level, Intakes, Application Deadline, Duration, Currency
  (Products); Career Record Id (Deals). **Every Collaboration and Student Operations write would
  have failed against a real Zoho org.** Found by diffing the code's field usage against
  `crm-schema.json` — no test could see it, because the memory CRM accepts any field.
- **The deadline field was mismatched.** The student workspace read `Closing_Date` (Zoho standard)
  while the business records deadlines in the provisioned `Next Deadline`. A team using the custom
  field would have seen an empty deadline on every screen. Now reads `Next_Deadline` first.
- **`Subject_Id` → `Career_Record_Id`**, matching the API name Zoho derives from the field label.
  Without it the Career Record link would never resolve and every workspace would say "not linked".

### Added
- **`db/test/smoke.integration.test.mjs`** — the release gate. 12 tests walking the whole platform
  as one system against real PostgreSQL, real HTTP, real crypto and the student's own browser
  client: lead → console → Career Record → student workspace → **student portal showing the same
  events** → export that self-verifies → partnership renewals → both token boundaries → **survives a
  restart**.
- **`docs/ADMIN-SETUP-GUIDE.md`** — Neon, KMS, CRM provisioning, Catalyst, console activation,
  access issuance. Written from the code that consumes it.
- **`docs/INTERNAL-USER-GUIDE.md`** — what the console does and what each role may do.
- **`docs/RELEASE-CHECKLIST.md`** — every line either DONE with evidence or PENDING with its
  unblocker, plus the known limitations at v1 stated up front.
- `.env.example` completed: `DATABASE_URL`, pool tuning, signing secret, vault provider, the five
  GCP KMS variables, CORS, runtime.

### Verified
- **617 tests, 0 failures.** 413 functions · 50 ops HTTP · 25 record HTTP · 58 scripts/website ·
  96 real-PostgreSQL (including the 12-test smoke suite). All seven content gates green.
  site.css 54.7 KB / 60 KB.

### Not done — blocked on infrastructure that does not exist
- Neon integration, deployed verification and the live KMS round trip. `DATABASE_URL` and GCP
  credentials are absent from the environment. Marked PENDING in the Release Checklist rather than
  claimed.

---

## [0.19.0] — 2026-07-26 — Student Operations Platform

The primary operational workspace for every student. Six modules, all of them projections of data
that already existed — no new store, no new event type, no second write path.

### The reuse decision that shaped everything
The Career Record **already models a student's journey**: `application.*`, `admission.*`,
`document.*`, `visa.*` and `arrival.*` are registered event types with classifications and a
permission model. So none of these modules store anything. They fold the log on read:

- **CRM Student Case** → the commercial frame (stage, assigned counsellor, package, deadline)
- **Career Record** → the history (what happened, when, on whose authority)

History is read through the Record's **own** `timeline()` projection, imported rather than
reimplemented, so classification filtering and correction nesting behave identically for staff and
for the student's portal. If a module is wrong, the log is wrong, and there is one thing to fix.

### Added
- **`functions/ops/student.mjs`** — six derivations: `studentWorkspace`, `applicationPipeline`,
  `documentCenter`, `visaPipeline`, `communicationTimeline`, `studentDashboard`. Pure functions.
- `GET /v1/ops/students/:id` extended from a stub into the full workspace — one request, because a
  counsellor opening a student needs the whole picture and six round trips is how a workspace
  becomes slow enough to avoid.
- Student workspace console view, reusing every existing `ops-*` component. **No new CSS.**
- The Career Record store is now an **optional** ops dependency (`record`). Without it a workspace
  still opens with its commercial frame and an honestly empty history rather than failing.

### Correctness decisions worth naming
- **State is resolved from the latest event, not a stored status.** A rejection recorded after an
  offer wins, because ordering decides rather than whichever write landed last. Same for a document
  rejected after submission, and a visa refused then re-applied for and granted.
- **An offer is a decision.** `awaiting_decision` keys on whether a decision was *recorded*, not on
  which state we are in — an application holding an offer is not waiting for one. (Caught by a test;
  the first implementation counted offers as awaiting.)
- **No identity fields reach the staff console.** Name and date of birth live encrypted in the vault
  and are released through one audited route only. Staff see the pseudonymous record id.
- **A CRM/record disagreement is shown, not resolved.** If Zoho says "Lodged" and the record says
  "Granted", both are displayed rather than one quietly winning.

### Found while building
The Record gives `administrator` a **`care_team` ceiling** (policy.mjs) — an org admin is not a
clinician and cannot read `restricted` or `partner_shareable` events. An admin viewer therefore
returned a workspace with no applications, documents or visa, looking exactly like an empty record.
The workspace now reads as a **counsellor assigned to that subject**, which is the honest description
of who is working the case — and safe to assert because `assertCanReach()` has already verified the
actor may reach it under the operations permission model.

### Verified
- **26 new tests** (413 functions, 50 ops over real HTTP). The integration harness seeds a **real
  hash-chained Career Record through the real `appendEvent`** — an invalid event would throw rather
  than produce a workspace built on fiction — and asserts that `access.exercised` (classified
  `internal`) never reaches a staff workspace.
- **Real browser**: student list → workspace with all six modules rendered from a live record —
  2 applications (1 offer, 1 awaiting), documents 1/5 with a rejected marksheet surfaced as an
  alert, visa Lodged with a four-step travel checklist, and a merged communication timeline.
- Full sweep green: 413 functions · 50 ops HTTP · 58 scripts/website · 84 real-PostgreSQL ·
  build 23 pages · all guards · site.css 54.7 KB / 60 KB.

### Frozen
- **Founder Operations** is frozen at 6 of 9 surfaces per founder instruction. No further extension
  without a production bug.

---

## [0.18.0] — 2026-07-26 — University Partnership Operating System

The Collaboration CRM extended from a partner register into the system the partnerships function
actually runs on. No new architecture: five capabilities added by extending what shipped in 0.17.0.

### Added
- **University profile** — accreditation, campuses, international office contact, and
  **partnership type** kept deliberately separate from institution type. `Account_Type` answers "who
  are they"; `Partnership_Type` answers "what have we agreed to do together". Conflating them makes
  the second unanswerable, since a university can be a commission partner and an exchange partner
  over time.
- **Programme catalogue and opportunity tracking** — degrees, scholarships, exchanges, research
  placements and internships, with tuition, currency, duration, intakes and deadlines. Modelled as
  **one collection split by kind**, in one module (`Products`), served by one endpoint: they differ
  by a category value, not by shape, and two entities would have duplicated a CRUD surface, a
  console panel and a test suite to express that.
- **Partnership workspace** — the existing contacts, meetings, agreements, renewal dates and owner,
  plus a **required-document checklist** derived from the partnership type. Matching is deliberately
  loose: a checklist defeated by a file rename reports green on an empty folder.
- **Renewal intelligence** (`GET /collaborators/renewals`) — one severity-ordered queue across four
  failure modes that are each silent alone: lapsed agreements, renewals due, required documents
  never filed, and active partnerships nobody has touched. Active partnerships run on a **180-day
  SLA**, a slower clock than the 5-minute lead promise, because silence means something different
  once something is signed.
- 2 endpoints (`POST /collaborators/:id/offerings`, `GET /collaborators/renewals`); the register and
  detail responses were extended rather than replaced.

### Changed
- Tuition is validated as an **integer in whole currency units** — the platform's validator has no
  `number` type, and an integer cannot acquire a floating-point tail that turns €12,000 into
  €11,999.999999 on the way to a student. The API returns the number and its currency separately and
  never pre-formats: a formatted number cannot be summed, compared or converted.
- The console's collaboration register now renders the API's renewal queue instead of assembling its
  own attention list, so the ordering logic exists once.

### Design
- **Nothing new was provisioned.** The five capabilities reuse Accounts, Contacts, Events, Notes,
  Attachments and Products — all standard Zoho modules.
- **Derived, never stored**: the timeline and the document checklist both follow from records that
  have their own reason to exist, so neither can drift from what it describes.
- Reused unchanged: the platform pipeline, permissions (`collaboration:read` / `collaboration:write`),
  authentication, transport, routing, and every `ops-*` UI component. **No new CSS.**

### Verified
- **22 new tests** (387 functions total, 46 ops over real HTTP). Profile round-trip, offering
  deadline states, checklist matching under renames, renewal-queue ordering and counts, and that the
  literal `/collaborators/renewals` route is not swallowed by `/collaborators/:id`.
- Permissions re-proven on the new surface: renewal intelligence obeys scoping (a partnerships lead
  sees only their own institutions), and adding an offering requires `collaboration:write`.
- **Real browser**: renewal queue rendered with missing-documents ranked above renewal-due above
  gone-quiet; full university profile; catalogue and opportunities with live deadline states
  including a correctly-stated passed deadline.
- Full sweep green: 387 functions · 46 ops HTTP · 58 scripts/website · 84 real-PostgreSQL ·
  build 23 pages · all guards · site.css 54.7 KB / 60 KB.

---

## [0.17.0] — 2026-07-26 — Collaboration CRM

The B2B half of operations: the universities and partners the business is built on, and the state
of every relationship with them. Sixth of the nine Founder Operations surfaces.

### Added
- **`functions/ops/collaboration.mjs`** — vocabulary and projections. Institution types mirror the
  tenant config so the CRM and the console cannot disagree about what a partner is called; the
  pipeline is deliberately short (7 stages) because a stage nobody can define is a stage nobody
  updates, and `Dormant` is a real terminal state rather than a euphemism.
- **6 endpoints** — register (filterable by type and stage, with a pipeline summary), one-request
  detail (contacts + meetings + notes + documents + timeline), create, update, add contact, add
  meeting. All on the existing pipeline, permissions, transport and token.
- **Collaboration console** — register with attention panel, and a detail view with stage moves,
  contact and meeting capture, documents and history. Reuses `dom.js`, `format.js`, the router and
  every existing `ops-*` component; no new CSS was needed.

### Design
- **Every entity maps onto an existing Zoho module** — Accounts, Contacts, Events, Notes,
  Attachments. No new infrastructure, and nothing to provision before the console works.
- **Universities and partner institutions share one register.** They are the same organisation at
  two points on one pipeline; splitting them would mean migrating a record between tables at the
  exact moment the relationship becomes valuable, losing every note and meeting that got it there.
- **The timeline is derived, never stored.** A second copy of the history would be a second thing to
  keep in step, and the first time they disagreed nobody would know which was true.
- Two things are surfaced because they fail silently otherwise: **agreements about to lapse**
  (90-day window) and **open relationships that have gone quiet** (45 days, a slower clock than the
  5-minute lead promise).

### Verified
- **50 new tests** — 13 unit (projections, expiry windows, timeline merge, staleness), 37 over real
  HTTP including the full permission matrix: partnerships may write, a counsellor has no
  collaboration capability at all, marketing is refused, an auditor reads but never writes, and a
  partnerships lead sees only their own institutions.
- **Real browser**: register → attention panel → open a partnership → stage move write round-trip →
  timeline records the attributed change. Mobile 375 px: no horizontal overflow.
- Full sweep green: 365 functions · 37 ops HTTP · 58 scripts/website · 84 real-PostgreSQL ·
  build 23 pages · all guards · site.css 54.7 KB / 60 KB.

### Not built yet
- Follow-up Engine, Email Center, AI Assistant Panel.

---

## [0.16.0] — 2026-07-26 — Founder Operations MVP

Operational software the founder can run the company from today, with one user — built for the
whole team from the first commit so adding the other six is account creation, not a rewrite.

### Added — the platform
- **`functions/ops/permissions.mjs`** — the spine. **Capability × scope**, kept as two independent
  axes because collapsing them into one role→records list is exactly what forces a redesign when a
  manager may read every lead but reassign only their team's. 20 capabilities, 6 roles
  (administrator, manager, counsellor, partnerships, marketing, auditor), 3 scopes (own/team/all).
- **`functions/ops/api/`** — 13 endpoints under `/v1/ops`, on the **same** platform pipeline,
  transport, rate limiter and token as the Career Record API. No second HTTP stack, no second auth
  mechanism, no duplicate endpoints.
- **`functions/ops/crm-port.mjs`** — a CRM port with a Zoho adapter and a real in-memory
  implementation, so every endpoint is verifiable over real HTTP without writing test rows into the
  founder's live CRM (which, unlike a database, cannot be truncated).
- **`functions/ops/views.mjs`** — projections, including **speed-to-lead SLA measurement**. Titan
  has promised "call within 5 minutes" since it went live and nothing measured it, which made the
  promise unfalsifiable. It is now a number on the dashboard.
- **The console** (`/console/`) — Founder Dashboard, Lead Management, Student CRM, Task Manager,
  Analytics. Navigation is built from the server's capability manifest, so a counsellor's first
  login renders a correct console with no code change. Ships **dormant** like the student portal.
- `functions/ops/scripts/dev-ops-server.mjs`, and `Tasks`/`Notes` write methods on the Zoho CRM
  client (`updateRecord`, `createRecord`, `listNotes`).

### Fixed — three real defects, two of them pre-existing
- **`ops_role` was silently dropped from every token.** `issueToken()` builds a fixed payload, so
  the claim never survived signing and every staff token fell back to counsellor grants. Now carried
  inside the signed payload, where the holder cannot edit it.
- **PATCH was blocked in the browser.** The shared CORS helper defaults to GET/POST/OPTIONS, so the
  preflight answered 204 while omitting PATCH — the request was never sent. Node's `fetch` ignores
  CORS, so every server-side test passed while the console was broken. Allowed methods are now
  **derived from the router**, and a test pins it.
- **`[hidden]` was defeated by the cascade** (pre-existing, affected the student dashboard too).
  `.app-gate { display: flex }` and `[hidden]` have equal specificity, so gates rendered while the
  code believed them hidden. Fixed once in the shared shell.

### Changed
- Shared authenticated chrome extracted from `pages/dashboard.css` into
  **`components/app-shell.css`** — it belongs to both surfaces, and a page stylesheet is linked only
  on its own page, so the console rendered entirely unstyled without it. `site.css` 54.7 KB / 60 KB.

### Verified
- **44 new tests** — 20 permission-model, 24 operations API over real HTTP. Authorisation is proven
  against roles **no human currently holds**: a counsellor cannot read a colleague's lead or reassign
  one, marketing may read leads but never write, an auditor is read-only, a student's token cannot
  open the console at all.
- **Real browser, end to end**: sign-in → dashboard → leads → "mark contacted" write round-trip →
  tasks → analytics, against the live operations API. Mobile 375 px: no horizontal overflow.
- Full sweep green: 339 functions · 25 record API · 58 scripts/website · 84 real-PostgreSQL ·
  build 23 pages · all six guards.

### Not built yet
- Collaboration CRM UI, Follow-up Engine, Email Center, AI Assistant Panel. Their capabilities and
  permissions are already declared and tested; each is a view plus endpoints, not new architecture.

---

## [0.15.0] — 2026-07-26 — Google Cloud KMS integration (BL-2, code-complete)

The vault's KEK could not come from a real KMS: the provider returned KEK *plaintext* to the vault,
and a real KMS never surrenders its master key. This release makes the interface change that
resolves it, wires Google Cloud KMS behind a clean adapter, and verifies everything short of the one
step that needs credentials.

**Verification, stated honestly (the user asked for exactly this separation):**
Implemented ✓ · Unit verified ✓ · Integration verified ✓ · **Production verified ✗** — never run
against Google's actual service; no credentials are reachable here. Nothing below claims otherwise.

### Changed — the key-provider interface (the mandate's authorised change)
- The provider now wraps and unwraps the **per-subject DEK** directly —
  `wrapDataKey(subjectId, dek) → { version, material }` and `unwrapDataKey(subjectId, wrapped) → dek`
  — instead of handing KEK plaintext to the vault. This is what lets a real KMS, which keeps its KEK
  inside the HSM, satisfy the same interface as the dev provider. The historical
  `unwrapKey(version)` mismatch is resolved.
- `vault_keys` stores an opaque wrapped DEK (`version`, `material`) instead of an AES-GCM
  `{iv,ct,tag}` triple — the schema no longer commits to one provider's envelope. Migration 002 was
  revised in place (undeployed, so no data to migrate). `vault_fields` is unchanged: the vault always
  seals fields under the DEK itself.
- `subjectId` is bound as additional authenticated data on the KMS wrap, so a wrapped DEK lifted from
  one record cannot be unwrapped under another — the field-level guarantee, extended to the key layer.

### Added
- **`functions/record/identity/kms-gcp.mjs`** — the Google Cloud KMS adapter, the only file that
  names Google. Maps the injected-client interface onto `@google-cloud/kms` encrypt/decrypt with a
  CryptoKey resource name and subject AAD. Imports no SDK: the caller injects the client, so the
  dependency enters only at deploy time. Includes `gcpKmsKeyProvider`, `gcpCryptoKeyName` and
  `gcpKmsConfigFromEnv`.
- **`kms.test.mjs`** (15) and **`kms-gcp.test.mjs`** (10) — unit tests over a fake client doing real
  AES-256-GCM: envelope round-trip, subject-AAD isolation, rotation, crypto-shred, failure opacity,
  the optional DEK cache, and the Google client-shape mapping (Buffer/base64, request shape,
  resource-name construction).
- **`db/test/kms-api.integration.test.mjs`** (4) — the full API over real HTTP × real PostgreSQL ×
  the KMS envelope: a student's DOB written at record creation, read back at export, and still
  recoverable after a full server restart.
- An optional short-TTL DEK cache in `identityVault` (default **off** — no plaintext key retained
  across calls). With a real KMS, an export would otherwise be one network unwrap per field; the
  cache collapses that to one. `erase()` and `rotateKek()` purge it synchronously, so it never masks
  an erasure.

### Clean separation (three layers, no leakage)
- `vault.mjs` knows no provider · `kms.mjs` knows the KMS envelope but not Google · `kms-gcp.mjs`
  knows Google and nothing else. Swapping provider is swapping one file.

### Verified
- 84 real-PostgreSQL tests (was 80): the vault integration suite now runs **through the KMS
  provider**, and a new HTTP×PG×KMS suite proves restart persistence at the API boundary.
- 295 functions unit/contract (was 273), incl. 25 new KMS unit tests. 25 API integration · 58
  scripts/website · build 22 pages · all guards green.
- The GCP adapter is verified against a Google-*shaped* fake only. The real service is untested —
  that is the P0.3 deploy step and needs the service-account credentials being withheld until then.

### Not done, deliberately
- **Production verification of Cloud KMS.** One live wrap/unwrap against a real CryptoKey. Gated on
  GCP credentials at deployment. No deployment begins until the founder provides them.

---

## [0.14.0] — 2026-07-26 — Durable identity vault (BL-7 closed)

The event log was durable; the identity beside it was not. `memoryVaultStore()` was the only
`VaultStore` in existence, so every subject's date of birth and documents died with the process —
which meant exports returned an empty `identity.json`, minor-status checks silently stopped working,
and crypto-shredding had nothing durable to shred. The erasure guarantee (**D12**) was unenforceable
in any deployed system. This release closes that.

### Added
- **`db/migrations/002_identity_vault.sql`** — `vault_keys` and `vault_fields`. Holds no plaintext:
  every value is AES-256-GCM ciphertext with `(subject_id, field)` bound in as AAD, so a dump
  without the KEK is inert. No `ON DELETE CASCADE` between the tables — a cascade would quietly
  convert crypto-shredding into ordinary deletion, which cannot be proven and does not reach backups.
- **`functions/record/adapters/vault-postgres.mjs`** — `postgresVaultStore()`, plus
  `assertVaultSchema()` and `subjectsNeedingRotation()` (the KEK-rotation work queue). Stores opaque
  sealed blobs; every cryptographic decision stays in `identity/vault.mjs`.
- **`db/test/vault.integration.test.mjs`** — 23 real-PostgreSQL tests.

### Changed
- The startup gate now runs `assertVaultSchema()` alongside `assertSchema()`. A missing vault schema
  used to fail on the first person whose key could not be stored; it now refuses to serve traffic.
- `startApi()` defaults `vaultStore` to `postgresVaultStore(pool)`. The only other store is the
  in-memory one, and a deployment holding identity in process memory looks healthy right up until it
  restarts.
- The portal end-to-end suite runs on the durable vault, and asserts an export carries real identity
  **across a restart** — the BL-7 property proven at the product level rather than the adapter level.
- `deployment.integration.test.mjs` derives the expected migration list from the migrations directory
  instead of hardcoding `["001"]`. Three tests broke on migration 002 while testing the runner, not
  the count; they will not break on 003.

### Verified
- Identity survives a restart. Storage holds no plaintext. Erasure destroys the key, **leaves** the
  ciphertext, and the data is unrecoverable from a fresh process. A ciphertext cannot be moved
  between subjects or between fields — GCM rejects it. Tampering is detected. Rotation re-wraps the
  key, touches no field ciphertext, and creates no second key row.
- 80 real-PostgreSQL tests (was 54). Full sweep: 273 functions · 58 scripts/website · 25 API
  integration · 80 database · build 22 pages · all guards green.

### Still open
- **BL-2** — KMS remains abstraction-only. The durable vault makes it *more* urgent, not less: there
  is now real ciphertext whose only protection is a KEK held in an environment variable, which
  `envKeyProvider` refuses to be in production.

---

## [0.13.0] — 2026-07-26 — Student Portal, integrated with the authentication backend

The portal and the session backend were built in separate sessions against a written contract.
This release is the audit that checked them against each other, the one fix that check found, and
the end-to-end proof that they are now one system.

### Added
- **Student Portal** (`website/src/pages/dashboard.html`, `website/src/layouts/app.html`,
  `website/src/assets/js/app/`) — eight features: session handling, layout, timeline, record viewer,
  evidence viewer, notifications, profile, settings. Hash-routed, no framework, no `innerHTML`
  anywhere. Consumes the Career Record API exclusively (**D22**).
- **`db/test/portal.integration.test.mjs`** — 19 end-to-end tests. The dashboard's own `api.js` and
  `session.js`, imported unmodified, driving the real router over a real socket against a real
  postgres binary, with tokens from the real `issueToken()` (**D24**).
- CI job **`database-and-portal`** — runs the whole `db/test` workspace. The real-PostgreSQL suites
  had never run in CI at all; 54 tests now gate every push.
- `functions/record/scripts/dev-server.mjs` and `issue-student-link.mjs` — a local API for
  developing the portal, and the interim session-issuing flow (**BL-8**).

### Fixed
- **Guardian links could never be opened.** `issue-student-link.mjs --role guardian` minted tokens
  with no `subject_id`, because the API authorises guardians on the `ward:` scope alone — but the
  portal needs the token to name the record it opens and refuses an unbound one. Every guardian link
  died on the sign-in gate before a request was made. Guardian claims now carry `subject_id`;
  server-side authorisation is unchanged (**D23**).

### Changed
- The `--ward` flag is gone from `issue-student-link.mjs`. The ward is always `--subject`: a link
  whose ward differed from the record it opens could only produce a session the API refuses.

### Verified
- 19 end-to-end tests, real PostgreSQL, real HTTP, real client, no mocks. The full flow — open link →
  session → dashboard → timeline → profile → acknowledge → consent → logout — plus cross-record
  reads, forged tokens, expired tokens and CORS all refused correctly.
- Three test assumptions were wrong on first run and the real system corrected each: the record's
  event count (staff access entries are in the chain), the withheld count, and where a created
  event's id comes from. Fixes went into the test; the system behaved correctly.
- Full sweep green: 273 functions · 58 scripts/website · 25 API integration · 54 real-PostgreSQL ·
  build 22 pages · claims-guard · voice-guard · evidence-guard · link check 1128 refs.

### Recorded, not fixed
- **BL-7** — the identity vault has no durable adapter. `memoryVaultStore()` is the only `VaultStore`
  and the migration creates no vault tables, so identity data does not survive a restart and
  crypto-shredding erasure (**D12**) is currently unenforceable in a deployed system. Found during
  this audit; blocks production independently of BL-1 and BL-2.
- Five further findings (**A-1**…**A-5**) listed in [STATUS.md](STATUS.md#open-findings). Each is
  feature work rather than integration, so each was left as an explicit decision.

---

## [0.12.0] — 2026-07-25 — Deployment layer
`bd8f711`

### Added
- **Migration runner** (`db/migrate.mjs`) — idempotent, ordered, transactional, checksummed,
  advisory-locked. An applied migration that has been edited halts the deploy.
- **Startup gate** (`functions/record/api/bootstrap.mjs`) — refuses traffic unless the server
  version is supported, no migrations are pending, no checksum has drifted, and `assertSchema()`
  passes. Configuration is validated before any connection. Production additionally refuses the
  development key provider and an empty CORS allowlist.
- **KMS abstraction** (`functions/record/identity/kms.mjs`) — KEK provider taking an injected client,
  so no cloud SDK enters the codebase. Adapter notes for AWS, GCP and Vault included.
- `db/DEPLOYMENT.md` — required env, deploy sequence, least-privilege role, "not yet verified".

### Changed
- PostgreSQL **minimum major pinned to 16**; tested against 18.4. A minimum rather than an exact pin
  so a managed provider can patch without failing startup.

### Verified
- 13 further real-PostgreSQL integration tests (35 total). A failed migration leaves no tables
  behind and is not recorded as applied. Two instances booting at once apply exactly one migration
  between them.

### Known limitation
- **KMS is abstraction-only** — exercised against a fake client, never a real provider. A recorded
  shape mismatch remains: `unwrapKey(version)` receives only a version, but a real KMS decrypts the
  per-subject *wrapped* key. Threading `wrappedDek` through the interface is required before any
  provider is wired, and was deliberately not guessed at.

---

## [0.11.0] — 2026-07-25 — Career Record platform
`cfaae9d` · `f7fc035` · `e3c622c` · `e1aa720` · `af0232c` · `40444f9`

### Added
- **Platform foundation** — request context, typed errors, structured logging, validation, metrics,
  security helpers, shared request pipeline.
- **Career Record core** — append-only hash-chained event log, event envelope, chain verification,
  policy layer, projections, daily digest.
- **Store adapters** — PostgreSQL, Catalyst Data Store, memory, behind one conformance suite.
- **Identity** — encrypted vault with per-subject data keys, consent management, crypto-shredding
  erasure, session authentication.
- **Career Record API** — 7 routes under `/v1/records`: create, get, timeline, append event, get
  event, export, verify.
- `docs/25-career-record-architecture.md` — the architecture and the five decisions that cannot be
  retrofitted.

### Verified
- 22 integration tests against a **real PostgreSQL 18.4 server**: 16 hash partitions with subjects
  distributed across them; the primary key genuinely rejects duplicate `(subject_id, seq)` and the
  adapter translates it into a retryable `SequenceConflict`; the idempotency index is genuinely
  partial; jsonb round-trips byte-for-byte including unicode and nested nulls; **append-only is
  enforced by database privilege** — the least-privilege role was created and proven unable to
  `UPDATE` or `DELETE` while `SELECT`/`INSERT` still work.
- Career Record API integration-tested over real HTTP.

### Fixed
- The conformance suite asserted "exactly one concurrent writer wins" — true only for synchronous
  in-memory stores. Against real PostgreSQL, 6 of 10 parallel appends correctly succeeded, because
  `appendEvent` reads the head itself and with real I/O some writers legitimately observe a newer
  head. Corrected to assert the invariant that actually holds: no two events share a position,
  positions stay contiguous, every loser gets a retryable conflict, and the chain still verifies.
  **The fix was in the test — the adapter was right.**

---

## [0.10.0] — 2026-07-25 — Website premium redesign
`35e7e0d`

### Added
- Brand palette resolved from the logo (cyan→blue→violet); glass, elevation and motion tokens.
- `motion.css` (native scroll-driven reveals), `surface.css`, `showcase.css`, `orbit.css` with an
  inline-SVG hero illustration (zero extra requests).
- **`/match/`** — a real, deterministic, explainable client-side destination matcher over verified
  destination data, with a no-JS fallback. `scripts/validate-matcher-data.mjs` wired into CI so its
  inlined facts cannot drift from source.
- Homepage rewritten: 11 sections, transparency-based trust, honest platform roadmap.

### Changed
- CSS minification in `build.mjs`, verified structurally lossless against the browser parser
  (592 rules / 44 media / 7 supports / 15 keyframes identical). Stylesheet 56.7 KB, inside the
  60 KB budget.
- 44 px touch targets on coarse pointers.

### Deliberately not added
No testimonials, no university-affiliation wording, no invented statistics.

---

## [0.9.0] — 2026-07-25 — Governance, brand, design, trust
`cc7137c` · `31f9fdd` · `0e5bda7` · `dcf0d88`

### Added
- **Constitution v1.0** (33 articles) and the Founder Letter — strategy frozen.
- Brand system: logo architecture, voice guard enforced in CI.
- Design system: the Record visual language, Independence Diagram.
- Trust infrastructure: evidence registers, automatic provenance, disclosure.

---

## [0.8.0] — 2026-07-24 — Titan live on Catalyst
`ada016d` · `0c21188` · `4db708f` · `47173e5` · `5ed6965` · `93c3535`

### Added
- Deployable Catalyst function bundles; live event subscription and channel renewal; job-function
  reconcile with SDK cron scheduling; gated diagnostic routes.

### Verified — first live production evidence
- Acceptance report: **PASS, 88% readiness**. Two real leads created in production Zoho CRM and
  deleted. Zoho pushed events to the deployed webhook with no manual call. A **forged-token event
  was rejected**. The loop-breaker correctly skipped the automation's own write. The cron job wrote
  Data Store checkpoints, proving execution. Zero dead letters.

### Fixed
- `addNote` corrected to the valid `Parent_Id{module,id}` format (found during acceptance testing).
- `Lead_Status` update replaced by an audit note — the hardcoded `"Attempting Contact"` was not a
  valid picklist value and would have dead-lettered every lead.

### Security
- Unforgeable webhook tokens via HMAC; COQL injection guards.

---

## [0.7.0] — 2026-07-23 — Titan automation engine
`b76019f` · `2368427` · `785b654` · `8085b76` · `3ee80bd` · `40e89cc`

### Added
- **ADR-006** — automation is event-driven code, not console-configured workflow rules.
- Automation engine, reconciliation engine, observability. Hybrid architecture: push for speed,
  reconcile for correctness.
- CRM provisioning pipeline with rollback, retry and idempotency; release audit; incident register.
- Subscription provisioner; local OAuth exchange that never prints the token.

### Documented
- Automation impossibility proofs — each manual console task proven un-automatable, with the exact
  API failure recorded.

---

## [0.6.0] — 2026-07-21 — Zoho integration layer
`26ed0d9` · `41ea457`

### Added
- Server-side OAuth: token manager with auto-refresh and 401 retry, per-DC/service base resolution,
  clients for CRM, Mail, Bookings, Analytics, Forms, SalesIQ and Flow, CLI scripts, CI syntax gate.
- Client-side integration layer, dormant by default, config-driven with no hard-coded IDs, Zoho-host
  URL validation and a consent gate.

### Security
- Secrets in `.env` only (gitignored); verified absent from `dist`.

---

## [0.5.0] — 2026-07-20 — Production pipeline · RC-1 cut
`b235870` · `4cfabaa` · `964d005` · git tag `v1.0.0-rc.1`

### Added
- CI gates, deploy workflows (dev on `main`, prod on `v*` tags behind manual approval), security
  headers plan.
- `RELEASE-LOG.md` and the change-class policy.
- Branch model: `main` frozen to represent production; `release/rc-1` active.

---

## [0.4.0] — 2026-07-20 — M3: destination engine + Nepal
`948f2b3` · `2bdf573` · git tag `v0.3.0-fat`

### Added
- Destinations hub with Tier-1 flagship cards from data files; Tier-2/3 listed honestly as
  "guides coming" with no dead links.
- Deep guides: Italy (DSU explained properly — need-based, by right, ~€6,000/yr varying by region)
  and Germany (APS day-one rule, blocked account ≈ €11,900 with an update hedge).
- Tier-1 guides: France, Ireland, Netherlands, Hungary, Japan.
- `/nepal/` landing: NOC guidance, Japan corridor, Europe corridor.
- FAT production-readiness audit (`docs/13-launch-checklist.md`).

---

## [0.3.0] — 2026-07-19 — M2: core pages + legal
`47d4cef` · `88e2b04`

### Added
- `/services/`, `/about/`, `/contact/`, `/success-stories/`, `/legal/privacy|terms|refund`.
- Success stories are consent-first: anonymised snapshots from verified records only.
- Legal pages carry a visible "draft pending review" label until reviewed.
- `page-hero` shared component; cross-site SEO, favicon and consistency audit.

---

## [0.2.0] — 2026-07-19 — M1: production homepage
`4d6100e` · `dbedb40` · `0d2feaa` · `56e8ad6` · `cab37a1`

### Added
- Homepage on the design system: dark gradient hero, claims-safe proof strip, Europe narrative,
  6-step journey, scholarships, integrity band, founder signature.
- Founder-approved claim "1,000+ guided since 2024" with evidence recorded.
- Copy standards: verb discipline, partner-language rules, 2024-operations history.

---

## [0.1.0] — 2026-07-19 — M0: foundation
`81f47e1` · `ba624a0` · `b037db3` · `74c4f3f`

### Added
- Technical architecture, development standards, master implementation plan.
- Zero-dependency build system; design system — tokens, layout, components, icons, styleguide.
- **ADR-001** static vanilla stack · **ADR-002** zero-dependency build ·
  **ADR-003** Zoho backend, no database · **ADR-004** Catalyst hosting + GitHub CI/CD ·
  **ADR-005** claims-guard in CI.
- Legacy site audit; content extracted and migration decisions recorded.

---

## Superseded

- **ADR-003** ("no database") is **scoped, not reversed**, by decision D10 (2026-07-25): the website
  still stores nothing and CRM remains master for operations, but the Career Record's system of
  record is PostgreSQL. See [DECISIONS.md](DECISIONS.md) § D3.
- Tag `v1.0.0-rc.1` named the website-only release candidate. Retained as history; the platform's
  `1.0.0` is the first production deployment and has not happened.
