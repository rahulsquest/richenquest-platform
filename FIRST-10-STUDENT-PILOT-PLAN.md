# FIRST-10-STUDENT-PILOT-PLAN.md — 2026-08-23

Development is paused. This is the plan for validating the engine against ten real people.

## 1 · Workflow

```
Student opens the portal
  ↓  consent recorded (Consent_Given + timestamp + policy version)
Wizard, 11 steps                          [automatic]
  ↓  submitApplication → Lead, case number, owner, tasks
studentIntelligence                        [automatic]
  ↓  completeness %, profile strength /100
matchOpportunities V2.2                    [automatic]
  ↓  FIT + eligibility + readiness + deadline + financial, ranked with reasons
studentRoadmap → matchMentor               [automatic]
  ↓
studentReport                              [automatic]  approved = FALSE
  ↓
COUNSELLOR REVIEW                          ← the gate. Human. Mandatory.
  ↓  corrections logged as CORRECTION_DATA / LOGIC / UX
REPORT_APPROVED event
  ↓
REPORT_SENT to the student
  ↓
STUDENT_FEEDBACK  →  outcome events
```

**Every automatic step already runs and has been executed live.** The only new thing the
pilot introduces is a human reading the output before a family does.

## 2 · Student experience
One link, about ten minutes, save-and-resume. A case number immediately. A call within 48
hours from someone who has read the file. Then a report that says, for every option: what it
costs, where that figure came from, when it was checked, why it fits, what is missing, and
what to do next — in second person, with no probability language anywhere.

**What they will not get:** a long list. With 2 verified opportunities they will see one or
two options, both Hungarian. The pilot tests whether *that* is more useful than the
unverified lists they get elsewhere.

## 3 · Counsellor workflow

Per student, before anything is sent:

- [ ] Open `studentReport` — never the raw CRM record
- [ ] Every figure carries a source URL and a verification date
- [ ] No opportunity shown has `deadline_status` CLOSED
- [ ] Nothing reads as a guarantee or a probability
- [ ] The ranking explanation matches what the student would expect
- [ ] Nothing contradicts what was said on the call
- [ ] Log every correction with its classification
- [ ] Record `REPORT_APPROVED`, then send

## 4 · Metrics
See `PILOT-METRICS.md`. The instrument that matters is **corrections per student falling
across the ten**, and the DATA / LOGIC / UX split.

## 5 · Feedback loop
`CORRECTION_DATA` → verify the record, same day.
`CORRECTION_LOGIC` → **do not touch the engine until three students show the same thing.**
`CORRECTION_UX` → change wording, never the score.

Tuning an engine to one person is how a system stops generalising.

## 6 · Success criteria

| # | Criterion | Threshold |
|---|---|---|
| 1 | Students completing the wizard | ≥ 8 of 10 |
| 2 | Median profile completeness | ≥ 80% |
| 3 | Students with ≥1 rankable match | ≥ 6 of 10 |
| 4 | Reports approved without a factual correction | ≥ 6 of 10 |
| 5 | Students who understood the recommendation | ≥ 8 of 10 |
| 6 | Corrections per student, #1 → #10 | falling |
| 7 | **Unverified figure reaching a student** | **0 — a stop condition** |
| 8 | **Closed intake presented as reachable** | **0 — a stop condition** |

Criteria 7 and 8 halt the pilot immediately. Everything else is a measurement.

## 7 · Remaining blockers

| Blocker | Effect on the pilot | Owner |
|---|---|---|
| **2 rankable opportunities** | Criterion 3 is at risk — most students will see 1–2 options | 4 emails sent, awaiting reply |
| **0 verified mentors** | Mentor step returns an honest empty state | needs real people |
| Package fees unset | Cannot quote or invoice | founder |
| Legal pack unreviewed | Cannot accept payment | founder + advocate |
| `official@` must be monitored | 4 university replies land there | founder |

**None of these is a code blocker.** The pilot can run on advice without payment; it cannot
run without students.

## What is deliberately NOT in this plan
No new scoring dimensions · no new engines · no mentor fabrication · no additional university
research beyond replies received · no website work.
