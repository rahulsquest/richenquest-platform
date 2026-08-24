# RichenQuest SaaS — API contract

**Captured 2026-08-25 from live engine runs**, not from reading source. Every shape below
came back from a real Zoho function execution against a synthetic profile, since deleted.

`app/api/worker.js` returns each engine's JSON **untouched**. It never reshapes a payload —
a reshape is where a second, divergent version of the truth starts. No scoring, ranking or
eligibility logic exists in the gateway or the browser.

## `GET /home` → `studentdashboard`

*the entire Student Home screen in one call*

| key | shape |
|---|---|
| `header` | `{ student, case_number, goal, level, intake, profile_completeness, missing_fields }` |
| `intelligence` | `{ academic, goals, budget_band, readiness }` |
| `top_opportunities` | `[2] { opportunity, data_completeness, type, country, match_score, score_meaning, score_breakdown, confidence, confidence_meaning … }` |
| `opportunity_count` | `int` |
| `portfolio_health` | `str` |
| `roadmap` | `{ now, next_30_days, next_3_months, next_6_months, basis }` |
| `recommended_mentor` | `{  }` |
| `mentor_status` | `str` |
| `case_state` | `str` |
| `blockers` | `[0] empty` |
| `next_action` | `str` |
| `history` | `{ applications, application_count, note }` |
| `provenance` | `{ assembled_at, engines, scores_are, data_rule }` |
| `ok` | `bool` |

## `GET /profile` → `studentintelligence`

*canonical profile + strength breakdown*

| key | shape |
|---|---|
| `identity` | `{ name, email, phone, city, case_number, parent_name, parent_consent }` |
| `academic` | `{ qualification, percentage, backlogs, study_gap_years, work_experience_years, english_status }` |
| `goals` | `{ level, course_or_career, intake, countries, accommodation }` |
| `finance` | `{ budget_band, family_income_band, funding_sources, budget_ceiling_eur, budget_basis }` |
| `readiness` | `{ passport, passport_blocking, consent_given, consent_version, english_evidence, documents_declared }` |
| `ielts_numeric` | `float` |
| `has_moi` | `bool` |
| `dimensions` | `{ skills, interests, preferred_domain, project_count, projects_detail, achievement_level, achievements_detail, extracurriculars, languages_spoken … }` |
| `profile_strength` | `int` |
| `profile_strength_breakdown` | `[5] str` |
| `profile_strength_meaning` | `str` |
| `attribution` | `{ source, referred_by }` |
| `history` | `{ applications, application_count, note }` |
| `profile_completeness` | `float` |
| `fields_present` | `int` |
| `fields_total` | `int` |
| `missing_fields` | `[3] str` |
| `completeness_meaning` | `str` |
| `record_id` | `str` |
| `module` | `str` |
| `assembled_at` | `str` |
| `ok` | `bool` |

## `GET /opportunities` → `matchopportunities`

*ranked + not_rankable, with why_excluded*

| key | shape |
|---|---|
| `profile_strength` | `int` |
| `profile_completeness` | `float` |
| `ranked` | `[2] { opportunity, data_completeness, type, country, match_score, score_meaning, score_breakdown, confidence, confidence_meaning … }` |
| `rankable_count` | `int` |
| `not_rankable` | `[19] { opportunity, country, missing, why_excluded }` |
| `not_rankable_count` | `int` |
| `ranking_factors` | `str` |
| `weights` | `str` |
| `portfolio_health` | `str` |
| `computed_at` | `str` |
| `ok` | `bool` |

## `GET /roadmap` → `studentroadmap`

*NOW / 30d / 3m / 6m*

| key | shape |
|---|---|
| `now` | `[0] empty` |
| `next_30_days` | `[1] { action, reason, priority, effort, dependency }` |
| `next_3_months` | `[2] { action, reason, priority, effort, deadline, dependency }` |
| `next_6_months` | `[1] { action, reason, priority, effort, dependency }` |
| `anchor_opportunity` | `str` |
| `anchor_deadline` | `str` |
| `timeline_basis` | `str` |
| `profile_completeness` | `float` |
| `profile_strength` | `int` |
| `generated_at` | `str` |
| `ok` | `bool` |

## `GET /report` → `studentreport`

*student-facing lines + counsellor_review + approval gate*

| key | shape |
|---|---|
| `report_lines` | `[77] str` |
| `line_count` | `int` |
| `rendering_note` | `str` |
| `counsellor_review` | `{ student, profile_completeness, opportunity_count, blockers, must_check }` |
| `approved` | `bool` |
| `approval_rule` | `str` |
| `generated_at` | `str` |
| `ok` | `bool` |

## `GET /mentor` → `matchmentor`

*verified_mentor_count drives the honest empty state*

| key | shape |
|---|---|
| `recommended_mentor` | `{  }` |
| `all_matches` | `[0] empty` |
| `verified_mentor_count` | `int` |
| `unverified_mentors` | `[0] empty` |
| `status` | `str` |
| `generated_at` | `str` |
| `ok` | `bool` |
