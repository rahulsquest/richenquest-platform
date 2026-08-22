# MATCHING-ENGINE-V2.md

`matchOpportunities` v2.1. Weights total **exactly 100**, verified by static sum of the
source: `available = available + N` sums to 100.

## Why the model was redesigned rather than extended

v1 blended fit and reachability into one number, so a programme whose deadline had passed
could still score 100 and sort first. V2 separates the axes the brief separates.

**Skills, projects and achievements were deliberately NOT given FIT weight.** Matching needs
both sides, and the audit found **no opportunity field expressing required skills or valued
projects** — `Eligibility_Summary` is populated on **0/23** records. Weighting them would
score every opportunity against nothing. They form a separate **profile strength** axis in
`studentIntelligence` instead.

## The five axes

| Axis | Values | In the score? |
|---|---|---|
| `match_score` | 0–100 FIT | **yes** |
| `eligibility_status` | ELIGIBLE / NOT_ELIGIBLE / NOT_ELIGIBLE_YET / UNKNOWN | no |
| `readiness_status` | READY / BLOCKED | no |
| `deadline_status` | OPEN / TIGHT / VERY_TIGHT / CLOSED | no |
| `financial_fit` | AFFORDABLE / STRETCH / UNAFFORDABLE | contributes 30 |

A high-fit opportunity can still be ineligible, unreachable, unaffordable or closed. All
five are reported separately so none of it hides behind one number.

## The 100-point FIT model

| # | Dimension | Weight | Calculation | Evidence required | Missing-data behaviour |
|---|---|---|---|---|---|
| 1 | Financial fit | **30** | total ≤ budget → 30; ≤115% → 15; else 0 | tuition + living (gate-enforced) | never missing |
| 2 | Country | **20** | destination ∈ student's list | `University_Country` | student stated none → **weight removed from denominator** |
| 3 | Domain | **20** | `Preferred_Domain` ∈ `Domains_Offered` | `Domains_Offered` + source | either side missing → **removed from denominator** |
| 4 | English | **15** | IELTS ≥ published min, or MOI where waiver = MOI | `IELTS_Min_UG/PG` | not published → **removed from denominator** |
| 5 | Level | **15** | student level ∈ `Levels_Offered` | `Levels_Offered` | not published → **removed from denominator** |
| | **Total** | **100** | | | |

**Timeline is not scored.** Reachability is its own axis.

## Missing data reduces confidence, never scores zero

```
match_score = earned / available × 100
confidence  = available            (out of 100)
```

`unscored_dimensions[]` names each excluded dimension and why. A programme is never punished
for our not having researched it, and never flattered either.

Live example — Debrecen scored **out of 80**, not 100, because its domains are unverified:
```
confidence_meaning: "Points of the 100-point model that could be scored.
                     20 points were unscored because the data does not exist,
                     not because the student failed them."
```

## Reason shown to student vs counsellor

| Audience | Fields |
|---|---|
| **Student** | `why_it_matches[]`, `missing_requirements[]`, `next_action`, `deadline_status` |
| **Counsellor** | all of the above **plus** `score_breakdown[]` (per-dimension points), `confidence`, `unscored_dimensions[]`, `risk_flags[]`, `provenance{}` |

## Ordering

Closed opportunities are demoted **in ordering only** — their FIT score is left untouched,
because it is true and a counsellor needs it when discussing the next intake. A shut door
does not belong at the top of a list; ordering is presentation, the score is measurement.

## The score is never a probability
Every row carries `score_meaning` as a **field**, not a comment, so no surface can render the
number without the disclaimer. Source-wide check: **zero bare probability claims** — every
occurrence of the word is inside a disclaimer or inside `qualityGate`'s banned-phrase list.

## AI layer
**None.** The engine is fully deterministic and reproducible; every point traces to a
published field. No provider dependency exists to abstract, no model is trained, and no
predictive accuracy is claimed.
