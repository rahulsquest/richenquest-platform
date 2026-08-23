# PILOT-METRICS.md — first 10 students

Every metric is computed from something the system already records. Nothing here needs a
new field, and nothing is self-reported by the engine about its own quality.

## Student-side

| Metric | Source | Target | Why |
|---|---|---|---|
| Profile completion % | `studentIntelligence.profile_completeness` | median ≥ 80% | Below this, matching is guessing |
| Understood the recommendation | feedback Q1 | ≥ 8/10 answer "yes" | The whole product is explainability |
| Found options relevant | count shortlisted ÷ shown | ≥ 60% | Relevance, not volume |
| Roadmap felt actionable | feedback Q4 | ≥ 7/10 | A plan nobody acts on is a document |
| Information they expected but did not get | free text | → Intake V3 | The gaps the wizard is not asking about |

## Counsellor-side — the real instrument

| Metric | Source | Target |
|---|---|---|
| Corrections per student | `CORRECTION_*` events | **falling across the 10** |
| Correction mix | DATA vs LOGIC vs UX | mostly DATA is healthy |
| Reports approved unchanged | `REPORT_APPROVED` with no preceding correction | rising |
| Time from submission to approved report | `Case_Events` timestamps | ≤ 3 working days |

**Corrections falling matters more than corrections being low.** A high count on student 1 is
expected. A flat count by student 10 means the system is not learning from them.

## Correction classification — recorded as `Case_Events`

| Type | Means | Fix |
|---|---|---|
| `CORRECTION_DATA` | An opportunity or student field was wrong or missing | Verify the record. **Cheap.** |
| `CORRECTION_LOGIC` | Data was right, the engine still reached a wrong conclusion | Change the engine — **only after 3 students show the same thing** |
| `CORRECTION_UX` | Correct and well-reasoned, but the student did not understand it | Change wording, never the score |

**One student never justifies a logic change.** Three independent students showing the same
correction is evidence; one is an anecdote, and tuning an engine to one person is how a
system stops generalising.

## Funnel

`Submitted → Profile ≥80% → ≥1 rankable match → report generated → counsellor approved →
student read → action taken → outcome event`

Drop-off at any stage is the finding. The most likely drop is **"≥1 rankable match"**, because
only 2 opportunities currently qualify.

## Outcome events already available
`OPPORTUNITY_VIEWED` · `OPPORTUNITY_SHORTLISTED` · `APPLICATION_SUBMITTED` · `OFFER_RECEIVED`
· `OFFER_REJECTED` · `VISA_APPROVED` · `VISA_REFUSED` · `ENROLLED` · `CAREER_OUTCOME`
Plus `CORRECTION_DATA/LOGIC/UX`, `STUDENT_FEEDBACK`, `REPORT_APPROVED`, `REPORT_SENT`.
**21 values total. No learning model exists and none is claimed.**

## Honest expectation for 10 students
With 2 rankable opportunities, most students will see **one or two options, both in Hungary**.
That is the honest state and the pilot should not hide it. The finding to watch for is
whether a student finds a verified, explained, single option **more useful** than the long
unverified lists they get elsewhere. If yes, the thesis holds and the constraint is purely
data. If no, the thesis needs re-examining before any more engineering.
