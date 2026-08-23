# PILOT-METRICS-DASHBOARD.md — 2026-08-23

Minimum viable analytics. Every metric is computed from something already recorded — **no new
schema, no new engine.**

## The eight tracked numbers

| # | Metric | Where it comes from | Target |
|---|---|---|---|
| 1 | Students onboarded | `Leads` count | 10 |
| 2 | Profile completion % | `studentIntelligence.profile_completeness` | median ≥ 80% |
| 3 | Reports generated | `studentReport` runs | 1 per student |
| 4 | Counsellor approvals | `REPORT_APPROVED` events | ≥ 8 of 10 |
| 5 | Recommendation corrections | `CORRECTION_*` events | **falling across the 10** |
| 6 | Most common missing data | mode of `missing_fields` | → Intake V3 |
| 7 | Student satisfaction | feedback ratings | ≥ 3.5 / 5 on all four |
| 8 | Action taken after recommendation | `OPPORTUNITY_SHORTLISTED`, `APPLICATION_SUBMITTED` | ≥ 5 of 10 |

## Tracking method — all existing infrastructure

`Case_Events` already carries **21 `Event_Type` values**, including the six added for this
pilot: `CORRECTION_DATA` · `CORRECTION_LOGIC` · `CORRECTION_UX` · `STUDENT_FEEDBACK` ·
`REPORT_APPROVED` · `REPORT_SENT`.

Counting is a COQL query per event type. **No dashboard needs building** — with ten students
a spreadsheet is faster to read and impossible to get wrong. Build a screen when the count
makes reading rows impractical, not before.

## Counsellor efficiency — the honest version

| Measure | Method | Caveat |
|---|---|---|
| Pre-RichenQuest research time | **Estimated by the counsellor, students 1–3, before opening the report** | An estimate, and it will be optimistic or pessimistic depending on mood |
| Post review time | Measured, students 4–10 | Real |
| Corrections per student | `CORRECTION_*` count | Real |

**This comparison is weak evidence and should be reported as such.** n=10, one counsellor,
self-estimated baseline. It indicates a direction; it does not prove a saving. Claiming
"RichenQuest saves counsellors X%" from this sample would be the same overclaim the product
refuses everywhere else.

## Success criteria — after 10 students

**Product value** — students understand recommendations (Q1 ≥ 4/5 median) · trust the
explanations (Q3 ≥ 4/5) · can name their next action unprompted.

**Operational value** — corrections per student falling from #1 to #10 · reports approved
without a *factual* correction ≥ 6 of 10.

**Data value** — the missing-field mode is identified · the opportunity gaps that blocked
recommendations are listed by name.

## Failure criteria — stop and reassess

- Students cannot explain why an option was recommended → **the explainability thesis fails**
- Recommendations are no better than ordinary counselling → the product has no wedge
- Counsellors override most outputs → the engine is wrong, not the data
- Missing data prevents useful guidance for **more than 6 of 10** → the graph is too small to
  pilot at all, and the answer is verification, not iteration

## What is deliberately not tracked
Conversion to paid · revenue per student · time to enrolment. **Ten students over a few weeks
cannot produce those numbers honestly**, and measuring them would invite decisions the sample
cannot support.
