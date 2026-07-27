# ROADMAP

**Phase-wise delivery plan.** Current state lives in [STATUS.md](STATUS.md); this document is the
forward plan only.
Last updated: **2026-07-26**

Four phases. A phase closes only when its exit criteria are met — not when its features exist.

| Phase | Target | State |
|---|---|---|
| **MVP** | Career Record running on real infrastructure, one student-facing surface | **In progress** |
| **Beta** | Real students on real records, invite-only | Not started |
| **Public Launch** | Open signup, DNS cutover, marketing on | Not started |
| **Post Launch** | Institutional trust, AI layer, interoperability | Not started |

---

## Phase 1 — MVP

**Goal:** a student can sign in, see their own Career Record, and trust what they see.

### Scope

| # | Item | State |
|---|---|---|
| 1.1 | Career Record event core, adapters, digest | ✅ Complete |
| 1.2 | Identity — vault, consent, crypto-shredding, session auth | ✅ Complete |
| 1.3 | Career Record API (7 routes) | ✅ Complete |
| 1.4 | Migration runner + startup schema gate | ✅ Complete |
| 1.5 | Titan speed-to-lead automation | ✅ Live (Catalyst Development) |
| 1.6 | **Student Portal** — session handling, layout, timeline, record viewer, evidence viewer, notifications, profile, settings | ✅ Complete |
| 1.6a | Portal ↔ authentication backend integrated and verified end-to-end against real PostgreSQL | ✅ Complete |
| 1.6b | **Durable vault adapter** — PostgreSQL-backed vault; identity survives restart, erasure enforceable | ✅ Complete |
| 1.7 | Hosted PostgreSQL provisioned and migrated | ⛔ Blocked — BL-1 |
| 1.8 | Google Cloud KMS wired (DEK threaded through `unwrapDataKey`) — code complete, Unit + Integration verified; Production verification needs GCP credentials | 🟡 Code complete — BL-2 |
| 1.9 | First deployment to Catalyst Development, end-to-end against real infrastructure | Pending 1.7–1.8 |
| 1.10 | **Founder Operations MVP** — console the founder can run the company from, built for the full team from day one | 🔨 6 of 9 surfaces complete |
| 1.10a | **University Partnership OS** — profiles, programme catalogue, opportunities, workspace, renewal intelligence | ✅ Complete |
| 1.10b | **Founder Operations frozen** at 6 of 9 surfaces — no further extension without a production bug | 🔒 Frozen |
| 1.11 | **Student Operations Platform** — workspace, applications, documents, visa, communication, dashboard | ✅ Complete |
| 1.12 | **Internal Release v1 prep** — field mappings, deployment config, cross-module smoke, three guides | ✅ Complete |
| 1.13 | **Feature development frozen** — production readiness only | 🔒 Frozen |
| 1.14 | **RC2** — CRM provisioned and verified live (35/35 fields); 2 reserved-label bugs fixed | ✅ Complete |
| 1.14 | **RC1** — live CRM field verification, performance at volume, cross-module smoke | ✅ Complete |
| 1.15 | RC1 → release: Neon, KMS, Catalyst, deployed verification | ⛔ Blocked — BL-1, BL-2 |

### Exit criteria

- A student authenticates against the real API and reads their own record — no mock data anywhere.
- `NODE_ENV=production` starts cleanly: KMS-backed key provider, CORS allowlist populated, schema
  gate passed.
- ~~Crypto-shredding erasure verified against a **durable** vault, not an in-memory one.~~ ✅ done (1.6b).
- Chain verification passes on a record that was written by the live automation, not a fixture.

### Out of scope for MVP

Counsellor and institutional surfaces, payments, WhatsApp, AI, public signup.

---

## Phase 2 — Beta

**Goal:** real students, real records, invite-only, with the operational discipline to survive them.

### Scope

| # | Item |
|---|---|
| 2.1 | Invite-only onboarding; no public signup path |
| 2.2 | Counsellor surface — the internal view of a student's record, permissioned and disclosure-logged |
| 2.3 | Evidence submission — students and counsellors add evidence; every addition provenance-stamped |
| 2.4 | Team user provisioning complete (unblocks BL-3); assignment routing with real assignees |
| 2.5 | Manual Zoho console items closed (BL-4) |
| 2.6 | WhatsApp half of speed-to-lead (BL-5) |
| 2.7 | Catalyst **Production** environment; promotion path Dev → Prod proven |
| 2.8 | Backup + restore rehearsed — a restore actually performed, not documented |
| 2.9 | Monitoring and alerting on the Record API, not only on Titan |
| 2.10 | Legal pages off "draft pending review" |

### Exit criteria

- 20+ real student records in production, written by real operations.
- A restore from backup performed successfully against a non-production copy.
- Erasure request executed end-to-end for a real subject, with evidence.
- Zero unexplained dead letters over a 14-day window.
- DPDP consent flow reviewed against the actual implementation.

---

## Phase 3 — Public Launch

**Goal:** open the doors.

### Scope

| # | Item |
|---|---|
| 3.1 | Public signup with rate limiting and abuse controls |
| 3.2 | DNS cutover — `www.richenquest.com` moves off Zoho Sites onto this repository's build |
| 3.3 | Website ↔ platform join: site lead capture creates a Career Record subject |
| 3.4 | Performance budget enforced in production (Lighthouse CI already configured) |
| 3.5 | Analytics, consent-gated |
| 3.6 | Incident response runbook for the Record API |
| 3.7 | Load testing at projected launch volume |

### Exit criteria

- Cutover rehearsed with a rollback path proven (DNS TTL lowered in advance).
- Launch-checklist founder actions 1–8 closed (`docs/13-launch-checklist.md`).
- Error budget and on-call defined before traffic, not after.

### Explicit risk

DNS cutover is the single least reversible action in the project. It gets its own rehearsal,
its own rollback plan, and its own founder approval.

---

## Phase 4 — Post Launch

**Goal:** the Record becomes worth trusting from outside RichenQuest.

### Scope

| # | Item |
|---|---|
| 4.1 | **AI layer** (BL-6) — guidance over the student's own record, never over a scraped profile |
| 4.2 | **Portable export** — a student takes their verified record elsewhere; signature verifiable by a third party |
| 4.3 | **Institutional verification** — a university verifies a record without RichenQuest as intermediary |
| 4.4 | Alumni and community surfaces |
| 4.5 | Payments (Books / Razorpay) — sequencing depends on the Zoho credit-type answer |
| 4.6 | Regional expansion surfaces beyond India/Nepal/Pakistan |
| 4.7 | Multi-region PostgreSQL / read replicas if volume justifies it — not before |

### Exit criteria

Per item; this phase is a portfolio, not a gate.

### Standing constraints

- The AI layer never invents a fact about a student. It reads the Record or it says nothing.
- Interoperability is Article 23 of the Constitution: exports are open-format and verifiable
  without us. Lock-in is not a retention strategy.

---

## Sequencing note

Phases 1 and 2 are gated on founder-supplied infrastructure (BL-1, BL-2), not on engineering.
Engineering has not been the bottleneck since 2026-07-23. Where a phase item is blocked, the
unblocked items in the same phase proceed in parallel rather than waiting.
