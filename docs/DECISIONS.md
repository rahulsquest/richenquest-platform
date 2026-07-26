# DECISIONS

**Every architectural decision, with its reasoning, the alternatives rejected, and what it costs
us.** A decision is recorded here whether or not it turned out well. Superseded decisions are
marked, never deleted.
Last updated: **2026-07-26**

The six numbered ADRs in [`adr/`](adr/) remain the long-form record for D1–D6; this document is the
single index and carries all decisions taken since. Where they disagree, this document is canonical
and the discrepancy is a bug to fix here.

| ID | Decision | Date | Status |
|---|---|---|---|
| D1 | Static site in pure HTML/CSS/vanilla JS | 2026-07-19 | Accepted |
| D2 | Zero-dependency custom build script | 2026-07-19 | Accepted |
| D3 | Zoho is the backend; website is stateless | 2026-07-19 | **Scoped by D10** |
| D4 | Catalyst hosting, GitHub trunk-based CI/CD | 2026-07-19 | Accepted |
| D5 | Claims-guard enforced in CI | 2026-07-19 | Accepted |
| D6 | Automation is event-driven code, not console workflows | 2026-07-23 | Accepted (amended) |
| D7 | Branch model — `main` frozen, `release/rc-1` active | 2026-07-21 | Accepted |
| D8 | Hybrid event architecture — push + reconcile | 2026-07-23 | Accepted |
| D9 | HMAC-derived per-channel webhook tokens | 2026-07-24 | Accepted |
| D10 | The log is the truth; PostgreSQL is the system of record | 2026-07-25 | Accepted |
| D11 | Per-subject hash chaining | 2026-07-25 | Accepted |
| D12 | Erasure by crypto-shredding | 2026-07-25 | Accepted |
| D13 | Permissions as recorded grants; reads as recorded events | 2026-07-25 | Accepted |
| D14 | The export format is the internal format | 2026-07-25 | Accepted |
| D15 | Storage port, not a database choice | 2026-07-25 | Accepted |
| D16 | Hand-rolled HTTP transport, no framework | 2026-07-25 | Accepted |
| D17 | PostgreSQL minimum major 16, not an exact pin | 2026-07-25 | Accepted |
| D18 | Startup refuses traffic on schema failure | 2026-07-25 | Accepted |
| D19 | Migrations checksum-guarded and advisory-locked | 2026-07-25 | Accepted |
| D20 | KMS abstraction shipped un-integrated, and said so | 2026-07-25 | **Superseded by D25** |
| D21 | Test dependencies isolated in `db/test/` | 2026-07-25 | Accepted |
| D22 | Dashboard consumes the Career Record API only | 2026-07-26 | Accepted |
| D23 | A guardian token carries `subject_id` as well as the ward scope | 2026-07-26 | Accepted |
| D24 | The portal is verified end-to-end against real PostgreSQL | 2026-07-26 | Accepted |
| D25 | Google Cloud KMS, wrapping the per-subject DEK | 2026-07-26 | Accepted |

---

## D1 — Version 1 is a static site in pure HTML5/CSS3/vanilla ES6+
**Date:** 2026-07-19 · **Status:** Accepted (founder decision) · [ADR-001](adr/ADR-001-static-vanilla-stack.md)

**Reason.** The site is a lead-generation and credibility front, not an application. Static HTML is
the fastest, cheapest, most durable way to serve it, and it cannot rot when a framework's major
version lands.

**Alternatives considered.** Next.js/Astro (rejected: build complexity and dependency surface for a
site with no application behaviour); a WordPress or Webflow site (rejected: no version control, no
CI gate on claims); staying on Zoho Sites (rejected: no engineering control).

**Consequences.** No client-side routing, no component framework, no hydration. Interactivity is
hand-written and small. The destination matcher (D-later) proves the ceiling is higher than it
looks. Any future application surface must justify itself against this baseline rather than
assuming a framework.

---

## D2 — Zero-dependency custom build script
**Date:** 2026-07-19 · **Status:** Accepted · [ADR-002](adr/ADR-002-zero-dependency-build.md)

**Reason.** The founder requires reusable components and forbids frameworks/SSGs. Node is used as a
build tool only. `website/build.mjs` does includes, data injection, and minification with no
production dependencies.

**Alternatives considered.** Eleventy or Astro (rejected under D1); raw hand-maintained HTML
(rejected: components would drift across 21 pages).

**Consequences.** We own the build. A bug in it is ours to fix, but there is no supply chain on the
web tier and no dependency upgrade treadmill. `npm audit` on the website is permanently empty.

---

## D3 — Zoho is the backend; the website is stateless with no database
**Date:** 2026-07-19 · **Status:** Accepted, then **scoped by D10** · [ADR-003](adr/ADR-003-zoho-backend-no-database.md)

**Reason.** RichenQuest runs its operation on Zoho One. One fact in one system means no sync bugs
and no PII on the web tier.

**Alternatives considered.** A custom backend from day one (rejected: duplicates CRM master data);
headless CMS (rejected: another system of record).

**Consequences.** Website features are constrained to what Zoho embeds and APIs can do — accepted
deliberately. Lead capture availability depends on Zoho uptime; mitigated by WhatsApp and mailto
fallbacks on every page.

**Scoping note (2026-07-25).** D10 introduced PostgreSQL as the system of record for the **Career
Record**. This does not reverse D3: the *website* still stores nothing, and CRM remains master for
leads, finance, and partnerships. The Career Record is a different asset with a different owner —
the student — and could never live in a CRM we can mutate. The boundary is now: **CRM owns our
operations; PostgreSQL owns the student's record.**

---

## D4 — Zoho Catalyst hosting; GitHub trunk-based CI/CD
**Date:** 2026-07-19 · **Status:** Accepted (supersedes a 2026-07-17 Vercel/Cloudflare recommendation) · [ADR-004](adr/ADR-004-catalyst-hosting-github-cicd.md)

**Reason.** Keeping hosting inside Zoho One keeps PII in the India DC, simplifies DPDP posture, and
uses credits already paid for.

**Alternatives considered.** Vercel/Cloudflare (rejected after initially being recommended: data
residency and a second vendor relationship); self-hosted (rejected: no operational capacity).

**Consequences.** We are tied to Catalyst's deployment model, its job-pool constraints, and its
console-only operations for some resources. Deploys go through `catalyst deploy` in GitHub Actions,
gated on build + claims-guard + link check.

---

## D5 — Claims-guard: the Verified Claims Library enforced in CI
**Date:** 2026-07-19 · **Status:** Accepted · [ADR-005](adr/ADR-005-claims-guard.md)

**Reason.** A company whose entire position is integrity cannot ship an unverified marketing claim.
Making it a CI gate means it cannot be forgotten under deadline pressure.

**Alternatives considered.** Review checklist (rejected: humans skip checklists at 2am); post-hoc
audit (rejected: the claim is already published).

**Consequences.** Every page must pass. Banned phrasings — "AI-powered", "partner universities" —
fail the build. Adding a claim requires adding evidence first. This has blocked copy several times;
that is the gate working.

---

## D6 — Automation is event-driven code, not console-configured workflow rules
**Date:** 2026-07-23 (amended from a 2026-07-21 proposal) · **Status:** Accepted · [ADR-006](adr/ADR-006-event-driven-automation.md)

**Reason.** Console-configured workflows are invisible to version control, untestable, and
un-reviewable. The same behaviour written as code is diffable, testable, and reversible.

**Alternatives considered.** Zoho workflow rules as specified in File 01 §5 (rejected for the four
main rules); Zoho Flow (rejected: same invisibility problem, plus a per-run cost).

**Consequences.** Behaviour lives in `functions/titan/handlers/`. One native fallback workflow is
retained deliberately as a migration safety net and is retired once delivery is measured. Four
console rules were replaced by code.

---

## D7 — Branch model: `main` frozen, `release/rc-1` active
**Date:** 2026-07-21 · **Status:** Accepted

**Reason.** `main` is reserved to represent production. Freezing it makes the production cutover an
explicit founder decision rather than a side effect of merging.

**Alternatives considered.** Trunk-based development straight onto `main` (rejected: with a live
Zoho Sites site and no deployed platform, "main = production" would have been a lie); GitFlow
(rejected: too heavy for one engineer).

**Consequences.** `deploy-dev.yml` triggers on pushes to `main`, so work on `release/rc-1` does not
auto-deploy. Harmless today; must be revisited at cutover. All RC-1 work lands on the release
branch and is logged in [RELEASE-LOG.md](../RELEASE-LOG.md).

---

## D8 — Hybrid event architecture: push notifications plus periodic reconciliation
**Date:** 2026-07-23 · **Status:** Accepted · [titan-event-architecture-review.md](architecture/titan-event-architecture-review.md)

**Reason.** Zoho push notifications are fast but not guaranteed — channels expire, deliveries are
missed. Polling alone is slow and expensive. The hybrid gives speed from push and *correctness*
from reconciliation: the reconcile job, not the webhook, is the authority.

**Alternatives considered.** Push only (rejected: silent data loss when a channel lapses); polling
only (rejected: speed-to-lead is the product); Zoho Flow (rejected under D6).

**Consequences.** Two code paths must converge on the same result, so every handler must be
idempotent. The reconcile job also renews the watch channel, making channel expiry self-healing.
Verified live: a forged event was rejected and the loop-breaker skipped our own write.

---

## D9 — Per-channel webhook tokens derived by HMAC
**Date:** 2026-07-24 · **Status:** Accepted

**Reason.** A shared static webhook token can be guessed or replayed across channels. Each
channel's callback token is `HMAC(secret, channel_id)`, so forging one requires the secret.

**Alternatives considered.** A single shared token (rejected: no per-channel isolation); mTLS
(rejected: Zoho does not offer it on notification channels).

**Consequences.** The secret must be identical in `.env` and in Catalyst function env vars.
Verified in production: a forged-token event was rejected by the deployed webhook.

---

## D10 — The log is the truth; PostgreSQL is the only system of record
**Date:** 2026-07-25 · **Status:** Accepted · [25-career-record-architecture.md](25-career-record-architecture.md) §0.1, §10

**Reason.** There is no separate mutable table that is "really" the state. Every view is a
projection of an append-only event log. A company whose position is auditability cannot hold a
mutable primary table and ask to be believed about its own history. Catalyst is the application
runtime and integration layer; it is never the primary store.

**Alternatives considered.** Zoho CRM as the record store (rejected: we can mutate it, and the
record belongs to the student, not to us); Catalyst Data Store as primary (rejected: no
transactional guarantees or constraint vocabulary the append path needs); a mutable table with a
side audit log (rejected: the audit log and the table drift, and the table always wins).

**Consequences.** Cannot be retrofitted — hence v1. Requires hosted PostgreSQL before anything runs
(**BL-1**). Projections must be rebuildable from the log. Corrections are new events, never edits.

---

## D11 — Per-subject hash chaining
**Date:** 2026-07-25 · **Status:** Accepted

**Reason.** Tamper-evidence must be structural, not procedural. Each event carries the hash of the
previous event for that subject, so any alteration breaks verification.

**Alternatives considered.** A single global chain (rejected: every write serialises on one head —
no concurrency, and a per-subject read cannot be verified in isolation); signed rows without a chain
(rejected: detects modification, not deletion or reordering); external blockchain (rejected: cost,
latency, and it solves a trust problem we do not have).

**Consequences.** jsonb must round-trip byte-for-byte or every hash breaks — explicitly verified
against real PostgreSQL. Concurrent appends to one subject conflict on `(subject_id, seq)` and
retry. Verification is per subject, which is also what an auditor actually wants.

---

## D12 — Erasure by crypto-shredding, not deletion
**Date:** 2026-07-25 · **Status:** Accepted · §11.4

**Reason.** Append-only immutability and the right to erasure are in direct conflict. Resolved at
the storage layer: each subject's data is encrypted with a per-subject key; erasure destroys the
key. The record's *shape* survives for audit; its content becomes unrecoverable.

**Alternatives considered.** Hard deletion (rejected: breaks the chain and the audit guarantee);
tombstoning without encryption (rejected: the PII is still there — not erasure, and not DPDP
compliant); refusing erasure (rejected: unlawful and contrary to Article 18).

**Consequences.** Impossible to bolt on later. The KEK cache TTL is deliberately short (5 min)
because a key cached indefinitely in a long-lived process weakens the guarantee; erasure should be
followed by a process cycle in a multi-instance deployment — recorded, not assumed.

---

## D13 — Permissions are recorded grants; every read is a recorded event
**Date:** 2026-07-25 · **Status:** Accepted · §3

**Reason.** "Privacy is architecture" is meaningless if an access decision leaves no trace. A grant
is an event; a read is an event. The student can see who looked at their record and when.

**Alternatives considered.** An ACL table (rejected: mutable, and reveals nothing about history);
logging reads to an application log (rejected: logs are rotated and are not the record).

**Consequences.** Read volume generates write volume. Accepted deliberately — the disclosure
register is a product feature, not overhead.

---

## D14 — The export format is the internal format
**Date:** 2026-07-25 · **Status:** Accepted · §8

**Reason.** Lock-in becomes structurally impossible rather than promised against. If the export is
the same envelope we store, we cannot quietly degrade it.

**Alternatives considered.** A separate "export view" (rejected: it drifts, and it always drifts in
our favour); PDF export only (rejected: not machine-verifiable by a third party).

**Consequences.** The envelope is a public contract and must be versioned as one. Constrains how
freely the internal shape can change.

---

## D15 — A storage port, not a database choice
**Date:** 2026-07-25 · **Status:** Accepted · §10.1

**Reason.** The event store is defined by a port with a shared conformance suite. PostgreSQL,
Catalyst Data Store, and memory all implement it and all run the same tests.

**Alternatives considered.** Coding directly against `pg` (rejected: untestable without a database,
and no way to run on Catalyst).

**Consequences.** Tests run anywhere with no external dependency. The conformance suite is the
specification — when real PostgreSQL disagreed with it, the *suite* was wrong and was corrected
(it had asserted "exactly one concurrent writer wins", which only holds for synchronous in-memory
stores).

---

## D16 — Hand-rolled HTTP transport, no web framework
**Date:** 2026-07-25 · **Status:** Accepted

**Reason.** Consistent with D2. The API needs routing, body parsing, and a middleware pipeline —
roughly 200 lines. Express would add a dependency tree to an API holding personal data.

**Alternatives considered.** Express/Fastify (rejected: dependency surface on the PII tier);
Catalyst's own request helpers (rejected: would couple the API to one runtime, against D15).

**Consequences.** We own routing and its edge cases. The pipeline in `functions/platform/` is shared
by every route so the ownership cost is paid once. Integration-tested over real HTTP.

---

## D17 — PostgreSQL minimum major 16, stated as a minimum not an exact pin
**Date:** 2026-07-25 · **Status:** Accepted

**Reason.** 16 is the oldest release providing hash partitioning, partial unique indexes on
partitioned tables, and the jsonb round-trip behaviour D11 depends on. A *minimum* lets a managed
provider apply patch upgrades without failing startup.

**Alternatives considered.** Exact version pin (rejected: a provider's routine patch would break
boot); no version check (rejected: an old server fails at the first partition, in production).

**Consequences.** Local integration tests run 18.4; a test asserts the tested version matches what
the pin claims. Production must be ≥ 16 — a constraint on **BL-1**.

---

## D18 — Startup refuses to serve traffic on any schema failure
**Date:** 2026-07-25 · **Status:** Accepted

**Reason.** The append path delegates conflict detection to database constraints. A missing
constraint does not degrade gracefully — it silently corrupts an append-only log we can never
repair. Refusing to boot is strictly better than serving.

**Alternatives considered.** Warn and continue (rejected: the corruption is unrecoverable and
silent); check on first write (rejected: too late, and the operator is no longer watching).

**Consequences.** A misconfigured deploy fails loudly at boot instead of quietly at runtime. Config
is validated before any connection, so a missing secret is a startup error rather than a 500 on the
first request. Production additionally refuses the `env` key provider and an empty CORS allowlist.

---

## D19 — Migrations are checksum-guarded, advisory-locked, and transactional
**Date:** 2026-07-25 · **Status:** Accepted

**Reason.** An *applied* migration that has since been edited means the database and the repository
disagree about the schema, which makes every later assumption unfounded. It halts the deploy.

**Alternatives considered.** A migration framework (rejected under D2/D16 — this is ~240 lines);
warn on drift (rejected per D18's reasoning); no locking (rejected: two instances booting together
would race).

**Consequences.** Verified against a real server that a failed migration leaves no tables behind and
is not recorded as applied, and that two instances booting at once apply exactly one migration
between them. The advisory lock is session-scoped, so a crashed deploy cannot wedge the next one.
Version gaps and malformed filenames are refused, because apply order is derived from the filename.

---

## D20 — Ship the KMS abstraction un-integrated, and label it
**Date:** 2026-07-25 · **Status:** **Superseded by [D25](#d25--google-cloud-kms-wrapping-the-per-subject-dek) (2026-07-26)**

**Reason.** No real KMS is reachable from this environment. The choice was to guess at an
integration or to ship the interface with an explicit, prominent statement that it has been
exercised against a fake client only. Guessing would have produced code that looks integrated and
is not.

**Alternatives considered.** Wait for a provider before writing anything (rejected: the vault needs
*a* provider interface to be testable at all); write a speculative AWS integration (rejected: it
would be untested code claiming to be tested).

**Consequences.** `RECORD_VAULT_PROVIDER` cannot be satisfied in production (**BL-2**). A known
shape mismatch is recorded rather than papered over: `unwrapKey(version)` receives only a version,
but a real KMS decrypts the *per-subject wrapped* key — wiring a provider requires threading
`wrappedDek` through the interface. That mismatch is precisely why the module is marked
abstraction-only. Adapter notes for AWS/GCP/Vault are included so the wiring is mechanical.

**Superseding note (2026-07-26).** D25 selected Google Cloud KMS and changed the interface so the
provider wraps the DEK directly. The shape mismatch described above is resolved; the module is no
longer abstraction-only. The decision is retained because the *reasoning* — ship the interface with
an honest label rather than guess at an integration — is what made the later wiring mechanical, and
because it records why the mismatch was left visible instead of papered over.

---

## D21 — Test dependencies isolated in `db/test/`
**Date:** 2026-07-25 · **Status:** Accepted

**Reason.** Real-PostgreSQL integration tests need `pg` and `embedded-postgres`. Confining them to
their own `package.json` means the website's zero-dependency guarantee (D2) cannot be affected.

**Alternatives considered.** A root `package.json` with devDependencies (rejected: breaks the
zero-dependency claim's simplicity); Docker (rejected: another prerequisite for every developer and
for CI).

**Consequences.** Integration tests run on any machine and in CI with no external database.
`db/test/node_modules` is gitignored. Two test commands instead of one.

---

## D22 — The Student Dashboard consumes the Career Record API only
**Date:** 2026-07-26 · **Status:** Accepted

**Reason.** The dashboard is a *client* of the Record, not a second way into it. Any data path that
bypasses the API also bypasses the disclosure register, the permission model, and the hash chain —
which would defeat D10, D11 and D13 simultaneously.

**Alternatives considered.** Direct database reads for speed (rejected: reads must be recorded
events — D13); a dashboard-specific backend-for-frontend (rejected: a second system of record by
another name); mock data to unblock UI work while BL-1 is open (rejected: mock data is how a UI
ships against an API that does not behave the way the mock did).

**Consequences.** The dashboard cannot be fully exercised until **BL-1** provides a database — it is
built and tested against the real API running locally against real PostgreSQL. No fixtures, no
stubs, no parallel backend. Missing API capability is added to the API, not worked around in the
client.

---

## D23 — A guardian token carries `subject_id` as well as the ward scope
**Date:** 2026-07-26 · **Status:** Accepted

**Reason.** The API authorises a guardian on the `ward:<subject_id>` scope alone
(`auth.mjs assertRecordAccess`), so guardian tokens were minted without `subject_id`. But the token
is also what tells the dashboard *which record to open*, and the portal refuses a token that names
none — correctly, since a session bound to nothing cannot be checked against anything. Every
guardian link therefore died on the sign-in gate before a request was ever made. Two implementations
each behaving reasonably produced a combination that could not work.

**Alternatives considered.** Deriving the record from the `ward:` scope string in the client
(rejected: the client would be parsing an authorisation scope for routing, so a change to the scope
format silently becomes a routing bug); relaxing the portal's "unbound" refusal (rejected: it is the
check that stops an unbound token being pointed at an arbitrary record); leaving guardian links
unsupported (rejected: the issuing script already advertised `--role guardian`).

**Consequences.** `issue-student-link.mjs` sets `subject_id` on guardian claims. Server-side
authorisation is unchanged — it still tests the scope, so the extra claim grants nothing. The ward
is always `--subject`; the separate `--ward` flag is gone, because a link whose ward differed from
the record it opens could only ever produce a session the API refuses. Covered by two end-to-end
tests, including that a guardian scoped to one ward cannot reach another record.

---

## D24 — The portal is verified end-to-end against real PostgreSQL, not against the API alone
**Date:** 2026-07-26 · **Status:** Accepted

**Reason.** The portal and the authentication backend were built in separate sessions against a
written contract. A contract agreed twice is still an assumption until both halves run together.
The end-to-end suite imports the dashboard's own `api.js` and `session.js` unmodified, drives them
over a real socket against the real router on a real postgres binary, and uses tokens from the real
`issueToken()`. Three of its assertions were wrong on first run — the event count, the withheld
count, and where the created event id comes from — and each was a fact about the system nobody had
written down.

**Alternatives considered.** Unit tests with a fetch stub (rejected: they encode the same
assumption twice and prove agreement with themselves); the in-memory store (rejected: it would not
have exercised the adapter that production actually uses); a browser driver (deferred: it tests the
DOM layer, which is already covered by 43 unit tests, at a much higher maintenance cost).

**Consequences.** `db/test/portal.integration.test.mjs` runs in CI in its own job. The one component
not production-shaped is the identity vault, which has no durable adapter at all (**BL-7**) — stated
in the test header rather than left to be discovered. *(BL-7 was closed the same day by the
PostgreSQL vault adapter; the suite now runs on the durable vault.)*

---

## D25 — Google Cloud KMS, wrapping the per-subject DEK
**Date:** 2026-07-26 · **Status:** Accepted · **supersedes [D20](#d20--ship-the-kms-abstraction-un-integrated-and-label-it)**

**Reason.** The vault's KEK could not come from a real KMS, because the provider interface returned
KEK *plaintext* to the vault and a real KMS never surrenders its master key. The interface was
changed instead of the requirement: the provider now wraps and unwraps the **per-subject DEK**
directly (`wrapDataKey` / `unwrapDataKey`), which is a contract both a real KMS and the development
provider can satisfy. Google Cloud KMS was chosen over AWS and Vault because the rest of the stack's
data-residency posture is already India-region and the operational surface is one key ring.

**Alternatives considered.** AWS KMS (rejected: a second cloud relationship for one primitive);
HashiCorp Vault (rejected: we would be operating it, and there is no operational capacity — D4's
reasoning); keeping the KEK in an environment variable (rejected: `envKeyProvider` refuses to run in
production precisely because a durable vault makes the KEK the only thing protecting real
ciphertext).

**Consequences.** Three layers with no leakage: `vault.mjs` knows no provider, `kms.mjs` knows the
envelope but not Google, `kms-gcp.mjs` knows Google and nothing else — swapping provider is swapping
one file. No cloud SDK is imported; the client is injected, so the dependency enters only at deploy.
`vault_keys` stores an opaque wrapped DEK rather than an AES-GCM triple, so the schema commits to no
provider's envelope. `subjectId` is bound as AAD, extending the field-level guarantee to the key
layer. An optional short-TTL DEK cache exists, **default off**, because with a real KMS an export
would otherwise be one network unwrap per field; `erase()` and `rotateKek()` purge it synchronously
so it can never mask an erasure.

**Not yet proven.** Unit- and integration-verified against a Google-shaped client and through the
vault on real PostgreSQL over real HTTP, but **never against Google's actual service** — that is
checklist **E4** and closes **BL-2**. The decision is recorded as accepted because the choice and the
interface are settled; the verification is not claimed.
