# Student Pilot Checklist — first 10 students

One page per student. The point of the pilot is **not** to prove the engine works — it does.
It is to find where the engine is *wrong about a real person*.

## Per-student sequence

| # | Step | Owner | Done when | Recorded as |
|---|---|---|---|---|
| 1 | **Consent** | automatic | `Consent_Given` true + timestamp + policy version | Lead fields |
| 2 | **Profile completion** | student | `profile_completeness` ≥ 80% | `studentIntelligence` |
| 3 | **Intelligence generated** | automatic | `profile_strength` returned with breakdown | `studentIntelligence` |
| 4 | **Matching run** | automatic | ≥1 rankable opportunity, or an honest empty state | `matchOpportunities` |
| 5 | **Roadmap** | automatic | NOW/30/3m/6m, anchored to a verified deadline | `studentRoadmap` |
| 6 | **Counsellor review** | counsellor | every recommendation read **before** the student sees it | corrections log below |
| 7 | **Student feedback** | student | 3 questions, below | feedback log |
| 8 | **Outcome tracking** | automatic | `Case_Events` row per real event | 15 `Event_Type` values |

**Step 6 is the pilot.** The counsellor is the ground truth for the first 10. Every
correction they make is a measurement of where the engine is wrong.

## Measurements

| Metric | How | Target for 10 students |
|---|---|---|
| Profile completion % | `studentIntelligence` | median ≥ 80% |
| Recommendation usefulness | counsellor marks each shortlisted / rejected | ≥ 60% shortlisted |
| **Counsellor corrections** | count + reason, per student | **trend down** across the 10 |
| Student satisfaction | question 3 below | ≥ 7/10 |
| Missing-data patterns | which `missing_fields` recur | feeds Intake V3 |

## Counsellor correction log — one row per correction

`student · opportunity · what the engine said · what is actually true · why it was wrong ·
is it data or logic?`

**"Data or logic" is the column that matters.** A data error is fixed by verifying a record.
A logic error is fixed by changing the engine — and needs evidence from more than one
student before anything is changed.

## Student feedback — exactly three questions
1. Did the recommendation explain *why* it was suggested? (yes / partly / no)
2. Was anything recommended that you already knew was wrong for you?
3. Would you have found this yourself? (0–10)

Question 2 is the one that finds real defects. Question 3 measures whether the product
is worth paying for.

## Stop rules
- Any recommendation shown to a student with an unverified figure → **stop the pilot**, fix, restart.
- Any student told an intake is reachable when `deadline_status` is CLOSED → **stop**.
- Three students with the same counsellor correction → that is a logic defect, not bad luck.
