# SAAS-MVP-STATUS.md — 2026-08-23

Website work stopped as instructed. Everything below is the Student Intelligence engine.

## Engine layer — written this session

| Function | Lines | Role | Deployed |
|---|---|---|---|
| `studentIntelligence` | 199 | Canonical profile. Projection over existing CRM fields | **NO** |
| `matchOpportunities` v1.1 | 278 | FIT ranking, verification-gated | **NO** |
| `studentRoadmap` | 163 | NOW / 30d / 3m / 6m, backward from verified deadlines | **NO** |
| `matchMentor` | 200 | Deterministic mentor match, credential-gated | **NO** |
| `studentDashboard` | 168 | Frontend-independent payload for the new website | **NO** |
| `student360` v3.0 | 287 | Counsellor view, **extended not replaced** | already live at v2.0 |

**1,008 lines of new engine code. None of it has executed.** The Deluge deploy channel needs
an authenticated `crm.zoho.in` Chrome tab; none is open, and the MCP connector has records
and fields but **no function-create capability**.

## Schema — executed live in CRM

| Change | Status |
|---|---|
| `Opportunity_Type`, `Eligibility_Summary`, `Funding_Amount_EUR` on Accounts | **LIVE** |
| 23 Accounts backfilled (21 University Programme, 2 Service Vendor) | **LIVE** |
| 12 mentor fields on Vendors | **LIVE** |
| Pécs tuition verified and written | **LIVE** |

## Architecture — one engine, not two

```
studentIntelligence ──┬─→ matchOpportunities ──┐
                      ├─→ matchMentor ─────────┤
                      └─→ studentRoadmap ──────┤
                                               ├─→ studentDashboard  (student surface)
caseState (unchanged, still owns case state) ──┤
                                               └─→ student360 v3.0   (counsellor surface)
```

`student360` gained an `intelligence` section by **calling** the new engines —
**0 lines of matching logic were re-implemented** (verified: `grep -c 'match_score' = 0`).
The counsellor and the student read the same functions, so they cannot be told different
things.

## Outcome feedback loop (step 9) — designed, not implemented

`Case_Events` already exists as the append-only timeline with
`FIRST_SNAPSHOT / STATE_CHANGE / BAND_CHANGE / BLOCKER_RAISED / BLOCKER_CLEARED`.

The outcome model is **nine additional `Event_Type` values**:
`OPPORTUNITY_VIEWED` · `OPPORTUNITY_SHORTLISTED` · `APPLICATION_SUBMITTED` ·
`OFFER_RECEIVED` · `OFFER_REJECTED` · `VISA_APPROVED` · `VISA_REFUSED` · `ENROLLED` ·
`CAREER_OUTCOME`

They are **not added yet**: extending a picklist needs a PATCH the loaded MCP tools do not
expose. This is a one-call change once the CRM channel is open.

**No ML model is trained, and none is claimed.** This is the dataset that would make
training possible later, nothing more.

## AI provider abstraction
Not written, deliberately. The matcher is **fully deterministic** — every point traces to a
published field — so no provider dependency exists to abstract. When generative
summarisation is added it sits behind one interface returning validated JSON, with the
deterministic engine remaining the source of truth for the ranking.

## What limits output today
**One** opportunity is fully rankable. The engine would rank Debrecen and correctly exclude
22. That is the gate working, starved on input — four emails, not more code.
