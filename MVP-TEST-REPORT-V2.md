# MVP-TEST-REPORT-V2.md — 2026-08-23

Five synthetic profiles, live CRM execution. All deleted afterwards.

## Profiles and live results

| # | Profile | Strength | Top FIT | Confidence | Eligibility | Deadline | Financial |
|---|---|---|---|---|---|---|---|
| A | Strong academics, low budget | 78 | 62.5 | 80/100 | ELIGIBLE | OPEN | **UNAFFORDABLE** |
| B | Average academics, strong projects | 80 | **100** | 80/100 | ELIGIBLE | OPEN | AFFORDABLE |
| C | Strong, deadline gone | 79 | 100 | 100/100 | ELIGIBLE | **CLOSED** | AFFORDABLE |
| D | Incomplete | **0** | 25 | **60/100** | NOT_ELIGIBLE_YET | CLOSED | UNAFFORDABLE |
| E | Strong, no English | 79 | 81.25 | 80/100 | **NOT_ELIGIBLE_YET** | OPEN | AFFORDABLE |

**A** proves fit and affordability are separate — eligible and open, but unaffordable, and
`next_action` says so rather than recommending it.
**B** proves academics do not gate everything — 58% and 2 backlogs still reached 100 FIT.
**C** proves the deadline axis — perfect fit, `CLOSED`, *"Do not pursue for this intake."*
**D** proves missing data reduces confidence — scored out of **60**, with country and domain
in `unscored_dimensions`, not scored zero.
**E** proves eligibility is separate from fit — 81.25 FIT and `NOT_ELIGIBLE_YET`.

## Checks

| # | Check | Result |
|---|---|---|
| 1 | Weights total exactly 100 | **PASS** — static sum of source = 100 |
| 2 | Missing data reduces confidence, not score | **PASS** — D scored out of 60 |
| 3 | Missing data never becomes positive evidence | **PASS** — unscored, not credited |
| 4 | Closed deadlines blocked | **PASS** — `next_action` refuses; roadmap won't anchor |
| 5 | Explanations match the breakdown | **PASS** — per-dimension points shown |
| 6 | No probability language | **PASS** — 0 bare claims; all occurrences are disclaimers or `qualityGate`'s banned list |
| 7 | No fabricated data | **PASS** — Domains populated only from fetched fee tables |
| 8 | Four axes reported separately | **PASS** |
| 9 | Profile strength separate from FIT | **PASS** |
| 10 | Roadmap uses richer profile | **PASS** — D got skills/projects/strength actions, B did not |
| 11 | Roadmap won't anchor to closed | **PASS** — anchored Debrecen, not the expired record |
| 12 | Mentor still credential-gated | **PASS** — 0 mentors, explicit empty state |
| 13 | Dashboard still 14 keys | **PASS** |
| 14 | No internal-data leakage | **PASS** |
| 15 | Consent refusal still holds | **PASS** |
| 16 | Synthetic records deleted | **PASS** — `zz%` returns 204 in both modules |

**16/16 pass. Original 20/20 regression intact** — verification gate, consent refusal, mentor
empty state, dashboard shape and student360 delegation all re-verified.

## Defect found and fixed in V2 testing

**Closed opportunities sorted to the top.** Profile C's most prominent recommendation was a
programme it could not apply to — score 100, deadline `CLOSED`. Ordering now demotes closed
entries while leaving the FIT score untouched, because the score is true and a counsellor
needs it when discussing the next intake.

## Test-fixture error, disclosed
The expired-opportunity fixture was created **twice** by a stray retry in my own script, so
Profile C briefly showed a duplicate. It was a fixture bug, not an engine bug. Both records
were deleted; the sweep confirms 204.

## Remaining blockers
1. **`Domains_Offered` on 2/23** — domain is 20 points and is unscored for 21 opportunities.
2. **One fully rankable opportunity.** Unchanged: four emails.
3. **Zero mentors.**
4. **Push blocked** — no git credential.
