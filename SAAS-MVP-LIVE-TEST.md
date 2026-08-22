# SAAS-MVP-LIVE-TEST.md — 2026-08-23

Every result below came from an actual CRM execution. Raw outputs were observed, not inferred.

## Functions deployed

| Function | Version | Deployed | Executed |
|---|---|---|---|
| `studentIntelligence` | 1.0 | ✅ | ✅ |
| `matchOpportunities` | 1.2 | ✅ | ✅ |
| `studentRoadmap` | 1.1 | ✅ | ✅ |
| `matchMentor` | 1.0 | ✅ | ✅ |
| `studentDashboard` | 1.0 | ✅ | ✅ |
| `student360` | 3.0 | ✅ | ✅ |

## Live execution results

**`studentIntelligence`** — profile completeness **100% (16/16)**, budget ceiling
**21,700 EUR** from band `20-35L`, `ielts_numeric` 6.5, `passport_blocking` false,
`consent_given` true. Lead-stage history correctly reported as not-yet-applicable rather
than as an empty list.

**Matching result** — 1 rankable, 20 excluded.

```
University of Debrecen   SCORE 100
  meaning : FIT against published requirements, out of 100. NOT a probability
            of admission, scholarship or visa
  total   : EUR 14320/yr | deadline 2026-11-01 (70d)
  WHY   + Affordable: EUR 14320/yr within the stated budget of about EUR 21700
  WHY   + Hungary is one of the countries the student named
  WHY   + English meets the published minimum: student 6.5 against required 5.5
  WHY   + 70 days until the deadline — enough time to assemble documents
  evidence: https://edu.unideb.hu verified 2026-08-16
  next    : Ready to shortlist. Send the family the full-cost breakdown with
            its source before anything is submitted
```

Exclusions carried exact gaps, e.g. METU `['living_cost','application_deadline']`,
Vistula `['tuition','application_deadline']`.

**Roadmap result** — anchored to Debrecen, deadline 2026-11-01, verified.
NOW 0 · 30d 1 · 3m 2 · 6m 1. For the failure student, NOW correctly filled with
`[CRITICAL] consent`, `[CRITICAL] passport`, `[HIGH] complete profile`.

**Mentor result** — `verified_mentor_count 0`, `recommended_mentor {}`,
status `NO VERIFIED MENTORS AVAILABLE…`. **No mentor was invented.**

**Dashboard result** — 14 top-level keys, provenance listing all five engine versions.
Leakage check for commission / partnership / internal fields: **CLEAN**.

**`student360` v3.0** — returned its own `caseState` risks (`NO_START_DATE`,
`DOCUMENTS_INCOMPLETE`) **plus** an `intelligence` section sourced from the same engines:
`top_opportunities` 2, `portfolio_health`, `mentor_status`, `timeline_basis`,
`profile_completeness`. No matching logic duplicated.

**Outcome events** — 9 values added to `Case_Events.Event_Type` (15 total). Write verified:
`Event_Type: OPPORTUNITY_SHORTLISTED | To_Value: University of Debrecen`.

## Tests passed / failed

| # | Test | Result |
|---|---|---|
| 1 | Six functions deploy | **PASS** |
| 2 | studentIntelligence executes | **PASS** |
| 3 | matchOpportunities executes | **PASS** |
| 4 | Score is FIT, disclaimer on every row | **PASS** |
| 5 | Explanation on every recommendation | **PASS** — 4 reasons |
| 6 | Evidence on every recommendation | **PASS** — source URL + date |
| 7 | Unverified opportunities excluded | **PASS** — 20 excluded with exact gaps |
| 8 | No probability language anywhere | **PASS** |
| 9 | Roadmap generates four horizons | **PASS** |
| 10 | Mentor empty state, no fabrication | **PASS** |
| 11 | Dashboard payload frontend-independent | **PASS** |
| 12 | Dashboard leaks no internal data | **PASS** |
| 13 | student360 uses the same engine | **PASS** — 0 duplicated logic |
| 14 | FAIL: no consent → refused | **PASS** |
| 15 | FAIL: incomplete profile | **PASS** — 50%, gaps named |
| 16 | FAIL: expired deadline | **PASS after fix** — see below |
| 17 | FAIL: no verified opportunity for country | **PASS** — scored 20, gaps named |
| 18 | FAIL: missing evidence | **PASS** — excluded, not estimated |
| 19 | Outcome event types added and written | **PASS** |
| 20 | Synthetic records deleted | **PASS** — 0 leaks, `zz%` returns 204 |

**Two defects found by live execution and fixed:**

1. **`List.remove()` takes an index, not the element.** `matchOpportunities` failed outright:
   *"Data type of the argument of the function 'remove' did not match the required data type
   of '[BIGINT]'"*. The selection sort now tracks the index. → v1.2
2. **The roadmap anchored to an expired deadline.** It worked backwards from `2026-06-01`,
   producing a confident plan toward a date nobody can meet. Ranking measures fit, not
   reachability, so the roadmap now skips any candidate with `days_to_deadline < 0` and, if
   none remain, raises a CRITICAL action to tell the family the intake has closed. → v1.1

Both were only findable by running the code.

## Remaining blockers

1. **One rankable opportunity.** The engine ranked Debrecen and correctly excluded 20. Output
   quality is capped by input, not logic. Four emails: `international@pte.hu`,
   `admission@metropolitan.hu`, Vistula, Debrecen.
2. **Zero mentors.** `matchMentor` is verified working against an empty set. It needs real
   records with a checkable `Credential_Source_URL`.
3. **Push blocked.** No git credential; commits remain local.
4. **Skills / interests / projects / achievements** are not collected by the intake wizard, so
   the matcher scores on budget, country, English and timeline only.
