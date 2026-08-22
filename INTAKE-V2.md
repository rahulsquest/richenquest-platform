# INTAKE-V2.md

## What changed
The wizard went from **10 steps to 11**. One new step — *"What you have done so far"* —
sits after course/country and before parent details.

Its framing is deliberate: *"This is the part most application forms skip… there is no wrong
answer, and 'none yet' is a real answer."* Every field on it is **optional except the
domain**, because a required field a student cannot answer produces abandonment or a lie.

## Fields added

| Field | Type | Values | Required | Affects matching |
|---|---|---|---|---|
| `Preferred_Domain` | picklist | 12 | **yes** | **FIT — 20 pts** |
| `Skills` | multiselect | 16 | no | profile strength 20 |
| `Interests` | multiselect | 10 | no | mentor matching |
| `Project_Count` | integer | — | no | profile strength 20 |
| `Projects_Detail` | textarea | — | no | evidence, not scored |
| `Achievement_Level` | picklist | 6 ordered | no | profile strength 15 |
| `Achievements_Detail` | text | — | no | evidence, not scored |
| `Extracurriculars` | multiselect | 9 | no | profile strength 15 |
| `Languages_Spoken` | multiselect | 9 | no | profile strength 15, mentor matching |

Opportunity side: `Domains_Offered` (multiselect, 11) + `Domains_Source` — **without it
`Preferred_Domain` would match against nothing.** Populated for Pécs and METU from the fee
tables actually fetched; `Domains_Source` records which page and when.

## Structured, not free text
Every scored field is a picklist, multiselect or integer, so it is usable algorithmically.
Free text (`Projects_Detail`, `Achievements_Detail`) is captured as **evidence for a human**
and is never scored — a paragraph cannot be scored honestly.

## Reused, not duplicated
`Preferred_Language` already existed and was reused. Academic history, budget, countries,
timeline, readiness and documents all already existed. **Nine fields added, zero duplicated.**

## Pipeline
`parseInquiry` label contract went from 21 to 32 labels; the 9 new fields map straight
through. Multi-selects arrive comma-separated and are split back into lists.
`Project_Count` routes through `normalizeInput` so "3 projects" becomes `3`.

## What was NOT added
**Learning preferences.** No opportunity field expresses teaching style, so it could not
affect matching, and it would have been a field that looks meaningful and scores nothing.
It enters the model when an opportunity attribute exists to match it against.
