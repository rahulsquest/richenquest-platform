# STUDENT-INTELLIGENCE-SCHEMA.md

The canonical student model. **No field in this schema is new.** It is a projection over
CRM fields that already exist, exactly as `student360` projects a Student Case.

`studentIntelligence(record_id, module)` → the payload below. Every other Intelligence
function consumes it; none re-reads the raw record.

## Sections and their existing CRM sources

| Section | Fields | Source |
|---|---|---|
| `identity` | name, email, phone, city, case_number, parent_name, parent_consent | Leads/Contacts |
| `academic` | qualification, percentage, backlogs, study_gap_years, work_experience_years, english_status | Leads/Contacts |
| `goals` | level, course_or_career, intake, countries, accommodation | Leads/Contacts |
| `finance` | budget_band, family_income_band, funding_sources, **budget_ceiling_eur** | Leads/Contacts + derived |
| `readiness` | passport, passport_blocking, consent_given, consent_version, english_evidence, documents_declared | Leads/Contacts |
| `history` | applications, outcomes | Applications module (Contacts only) |
| `attribution` | source, referred_by | Leads/Contacts |

## Derived values, and why they are derived rather than stored

**`budget_ceiling_eur`** — the band's **lower** bound at a planning rate of 1 EUR = 92 INR.
Lower bound is deliberate: recommending against the top of a band is how families end up
short in November. Carries `budget_basis` stating it is a planning figure, never to be
quoted.

**`ielts_numeric` / `has_moi`** — English as a comparable number so the matcher can test it
against a published minimum.

**`profile_completeness`** — percentage of 16 intelligence fields populated, with
`missing_fields` naming the exact gaps. Carries `completeness_meaning`: it exists to tell a
student what to fill in next, and is **never used to rank students**.

## Skills, interests, projects, achievements, languages

**Not yet modelled, and deliberately not stubbed.** The brief lists them; the CRM has no
fields for them and the intake wizard does not collect them. Adding empty fields would make
the schema look complete while every record stayed null, and the matcher would silently
score against nothing.

They enter the model when the wizard collects them. Until then `matchOpportunities` scores
only on data that actually exists: budget, country, English and timeline.

## Consent gate

`studentDashboard` refuses to assemble a payload when `consent_given` is not true, mirroring
`caseState`'s `CONSENT_MISSING` hard block. A student who has not consented does not get an
intelligence profile built about them.
