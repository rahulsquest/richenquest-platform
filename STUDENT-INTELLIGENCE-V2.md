# STUDENT-INTELLIGENCE-V2.md

`studentIntelligence` v2.0. Audit-first: every dimension below was checked against real data
before it was given weight.

## Dimension register

| Dimension | Source field | Type | Provenance | Affects matching | Required |
|---|---|---|---|---|---|
| Academic profile | `Current_Education`, `Academic_Percentage`, `Backlogs`, `Study_Gap_Years`, `Work_Experience_Years` | text/double/int | student-declared | strength 30 | yes |
| Skills | `Skills` | multiselect 16 | student-declared | strength 20 | no |
| Interests | `Interests` | multiselect 10 | student-declared | mentor only | no |
| Projects | `Project_Count`, `Projects_Detail` | int + textarea | student-declared | strength 20 (count only) | no |
| Achievements | `Achievement_Level`, `Achievements_Detail` | ordered picklist + text | student-declared | strength 15 (level only) | no |
| Extracurriculars | `Extracurriculars` | multiselect 9 | student-declared | strength 15 (shared) | no |
| Languages | `Languages_Spoken`, `Preferred_Language` | multiselect + picklist | student-declared | strength 15 (shared), mentor | no |
| Career goals | `Career_Goal` | text | student-declared | mentor only — free text is not scorable | no |
| Preferred domain | `Preferred_Domain` | picklist 12 | student-declared | **FIT 20** | **yes** |
| Preferred countries | `Interested_Country` | multiselect 19 | student-declared | **FIT 20** | yes |
| Financial constraints | `Budget_Range`, `Parents_Annual_Income`, `Funding_Source` | picklists | student-declared | **FIT 30** | yes |
| Timeline | `Intended_Intake`, opportunity `Next_App_Deadline` | picklist + date | student + **verified source** | separate axis | yes |
| Readiness | `Passport_Status`, `English_Status`, `Consent_Given` | picklists + bool | student-declared | separate axis + **FIT 15** (English) | yes |
| Documents/evidence | `Description`, Applications module | text | student-declared | not scored | no |
| Learning preferences | **none** | — | — | **not modelled** | — |

**Learning preferences were not created.** No opportunity attribute exists to match them
against, so the field would look meaningful and score nothing. That is the empty-schema trap
the brief warns about.

## Two independent 100-point axes

**FIT** (in `matchOpportunities`) — student ↔ opportunity. Needs both sides.

**PROFILE STRENGTH** (here) — the student alone, independent of any opportunity:

| Component | Weight | Calculation |
|---|---|---|
| Academics | 30 | ≥75% or ≥8 CGPA → 30 · ≥60% or ≥6.5 → 20 · else 10 |
| Skills | 20 | 5 per skill, capped |
| Projects | 20 | 7 per project, capped |
| Achievements | 15 | International 15 · National 12 · State 9 · District 6 · School 3 |
| Extracurriculars + languages | 15 | activities 8 + two or more languages 7 |
| **Total** | **100** | |

**They are never blended.** A student can have an outstanding portfolio and be a poor fit for
a specific programme, or a weak portfolio and a perfect fit. One number would hide both.

**CGPA is never converted to a percentage.** A value ≤10 is banded on its own scale — the
conversion factor varies by university and is not guessed.

Live results: Profile A 78/100 · B 80 · C 79 · D 0 (nothing recorded) · E 79.

## Completeness vs strength
`profile_completeness` counts populated fields (now 22 checks, up from 16) and exists to tell
a student what to fill in. `profile_strength` measures standing. Neither is a probability and
neither ranks students against each other.
