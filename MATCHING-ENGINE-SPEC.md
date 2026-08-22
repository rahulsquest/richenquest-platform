# MATCHING-ENGINE-SPEC.md

`matchOpportunities(record_id, module)` — deterministic, explainable, verification-gated.

## The rule that outranks every other rule

**The score is FIT. It is never a probability of admission, scholarship or visa.**

Every ranked row carries a `score_meaning` field stating this in full. It is a field, not a
comment, so a downstream surface cannot render the score without also receiving the
disclaimer. Admission is decided by an institution and a visa by a government; neither is
computable, and any number presented as such would be a fabrication.

## Pipeline
```
studentIntelligence(record_id, module)      ← profile, never re-read here
              +
Accounts where Opportunity_Type != Service Vendor
              ↓
        VERIFICATION GATE
   (tuition + living + deadline + source_url + verified_on)
              ↓
     100-point additive score
              ↓
   ranked[] + not_rankable[]
```

## Scoring — 100 points, every point traceable

| Component | Max | Rule |
|---|---|---|
| **Affordability** | 40 | verified total ≤ budget ceiling → 40. Within 115% → 20 with the shortfall named. Above → 0 |
| **Country** | 20 | destination in the student's named list → 20. No preference stated → 10 |
| **English** | 20 | meets the institution's **published** minimum → 20. MOI where the institution's `English_Waiver_Route` is MOI → 20 |
| **Timeline** | 20 | ≥45 days to deadline → 20. 21–44 → 10 |

Affordability carries the heaviest weight because budget is what actually decides whether a
family proceeds.

## Blockers, not deductions
**Passport not Valid** and **consent not recorded** are returned in `blockers[]` and drive
`next_action`. They are not point deductions — consistent with `caseState`, where a
condition that stops everything is a state, not a score.

## Every row returns
`opportunity` · `type` · `country` · `match_score` · **`score_meaning`** ·
`matched_because[]` · `missing_requirements[]` · `blockers[]` · `verified_total_eur_year` ·
`deadline` · `days_to_deadline` · `evidence{source_url, verified_on, confidence,
tuition_eur, living_eur}` · `next_action`

`not_rankable[]` rows return `opportunity`, `country`, `missing[]` and `why_excluded` — so a
gap is visible as a gap, never as an absence.

## Deluge constraints honoured
No `while` loop and no comparator sort exist in Deluge, so ranking uses a bounded selection
sort over a fixed guard list. Type is inferred from first assignment, so numerics are
initialised numerically.

## v1.1 change
v1.0 assembled the student profile inline — a second copy of "what do we know about this
student" that would have drifted from `studentIntelligence`. v1.1 delegates entirely:
**0 raw student-field reads, 0 `getRecordById` calls** on the student record.
