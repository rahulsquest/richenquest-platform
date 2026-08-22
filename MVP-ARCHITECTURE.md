# MVP-ARCHITECTURE.md — Student Intelligence Platform v1.0

**Principle followed:** the existing architecture has priority. Nothing here is a parallel
stack. There is **one** decision engine (`caseState`), and the MVP is a sibling read-model
beside it, never a competitor.

## Where each MVP concept lives

| MVP concept | Implementation | New or reused |
|---|---|---|
| Student Intelligence Profile | Read-model assembled in `matchOpportunities()` from existing Leads/Contacts fields | **Reused** — zero duplicated fields |
| Opportunity model | `Accounts` module + `Opportunity_Type`, `Eligibility_Summary`, `Funding_Amount_EUR` | **Extended**, not duplicated |
| Provenance | Existing `Source_URL`, `Verified_On`, `Confidence`, `Confidence_*` per-dimension | **Reused** |
| Matching engine | `functions/src/matchOpportunities.dg` | **New** |
| Risk / band / next action | `caseState()` — untouched | **Reused** |
| Counsellor view | `student360()` — untouched | **Reused** |
| Work queue | `buildWorkQueue()` — untouched | **Reused** |
| Audit / provenance trail | `Case_Events` + `recordStateEvent()` | **Reused** |
| Consent / legal | `Consent_Given`, `Consent_Timestamp`, `Consent_Policy_Version` | **Reused** |

**Why Accounts rather than a new Opportunities module.** The Accounts module already carried
every field an Opportunity needs — tuition range, living cost, deadline, application fee,
IELTS minimums, source URL, verification date and five per-dimension confidence pickers.
Creating a parallel module would have duplicated all of it and split the verification
gate across two places. `Opportunity_Type` generalises what was already there.

## The matching engine contract

```
matchOpportunities(lead_or_contact_id, module)
  → { profile, ranked[], not_rankable[], portfolio_health, ok }
```

Each ranked row carries: `match_score`, `score_meaning`, `matched_because[]`,
`missing_requirements[]`, `blockers[]`, `evidence{source_url, verified_on, confidence,
tuition_eur, living_eur}`, `next_action`.

### Two rules the engine enforces in code, not in documentation

**1. The score is fit, never probability.** Every row carries `score_meaning` stating that
it measures alignment with *published requirements* and says nothing about admission,
scholarship or visa outcomes. A downstream surface cannot relabel it without deleting that
field.

**2. Unverified opportunities are never ranked.** An opportunity needs tuition, living cost,
deadline, `Source_URL` **and** `Verified_On` before it can be scored. Everything else goes to
`not_rankable[]` with the exact missing fields. This is the same gate SOP-2 and QA-2 already
impose on counsellors, now enforced mechanically.

### Scoring, 100 points, all explained
Affordability 40 · Country preference 20 · English against the published minimum 20 ·
Timeline against the real deadline 20. Passport and consent are **blockers**, not
deductions — consistent with `caseState`'s hard-block model.

Budget bands map to the **lower bound** of the band, deliberately: recommending against the
top of a band is how families end up short in November.

## AI provider abstraction

Not yet written, and deliberately so. The matching engine is **fully deterministic** — every
point is traceable to a published field. No AI provider is required to run it, so no
provider dependency has been created. When generative summarisation is added it goes behind
a single interface that returns validated JSON; the deterministic engine stays the source of
truth for the ranking itself.

## Not built (Part E boundaries respected)
Native app · payments · ML training pipeline · microservices · a second CRM · a second
website · a second form system · a second decision engine.
