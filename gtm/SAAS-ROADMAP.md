# SAAS-ROADMAP.md — 2026-08-23
*Part 4. Every phase names its precondition. A phase built before its precondition ships an
empty product.*

## Phase 1 — Student Intelligence Platform · **BUILT AND LIVE**
`studentIntelligence` · `matchOpportunities` v2.2 · `studentRoadmap` · `matchMentor` ·
`studentDashboard` · `studentReport` · `student360` v3 · `caseState` · `buildWorkQueue`.
Internal, counsellor-operated. **Precondition met.**

## Phase 2 — Student self-service portal
**Precondition: ≥10 verified opportunities.** With 2, self-service shows most students one
option or none — and a student who self-serves their way to an empty result does not come back.

| Feature | User problem | Business value | Priority | Complexity | Revenue impact |
|---|---|---|---|---|---|
| Profile (self-edit) | "I want to update my details" | data quality without counsellor time | **P0** | Low — `studentIntelligence` exists | indirect |
| Opportunity matching view | "what fits me?" | the core demo | **P0** | Low — `studentDashboard` returns it | indirect |
| Roadmap view | "what do I do now?" | retention | **P0** | Low — renderer only | indirect |
| Document checklist | "what do you need?" | **cuts the biggest ops cost** | **P1** | Medium — upload exists in the Worker | **high — reduces cost** |
| Progress tracking | "where am I?" | reduces "any update?" messages | P1 | Low — `caseState` returns it | indirect |

**Most of Phase 2 is rendering payloads that already exist.** The work is a frontend, and the
frontend is being rebuilt separately — so this phase is largely *integration*, not building.

## Phase 3 — Mentor marketplace
**Precondition: ≥5 verified mentors.** Currently 0.

| Feature | Problem | Value | Priority | Complexity | Revenue |
|---|---|---|---|---|---|
| Verified mentor profiles | "who can I trust?" | differentiation | P0 | Low — 12 fields exist | enables |
| Matching | "who fits me?" | `matchMentor` is built | P0 | **Done** | enables |
| Sessions + payments | booking | commission | P1 | High — payments | **direct** |
| Reviews | credibility | quality signal | P2 | Medium | indirect |

## Phase 4 — University / partner dashboard
**Precondition: ≥1 signed agreement AND ≥20 students in pipeline.** Building this with 0
students shows partners an empty screen — worse than no dashboard.

| Feature | Problem | Value | Priority | Complexity | Revenue |
|---|---|---|---|---|---|
| Applicant pipeline | "who is coming from you?" | trust | P0 | Medium | enables |
| **Document-readiness view** | "are their papers complete?" | **the actual pain — incomplete files are admin waste** | **P0** | Medium | **direct** |
| Analytics | conversion by segment | renewal | P1 | Medium | indirect |

**Document readiness is the wedge, not the pipeline count.** For a DSU body an incomplete file
is pure cost.

## Phase 5 — Global mobility intelligence platform
**Precondition: the opportunity graph is large and demonstrably accurate.** Country pathway
intelligence, deadline intelligence, B2B data. This is where "Global Education Mobility
Intelligence Platform" becomes literally true rather than positioning.

## The sequencing rule
**Each phase is gated on inventory, not on engineering readiness.** Phases 2, 3 and 4 are all
buildable today and all would ship empty. The constraint is verified opportunities, verified
mentors and signed partners — none of which is a coding problem.
