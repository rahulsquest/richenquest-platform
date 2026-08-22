# OPPORTUNITY-DATA-SPEC.md

Opportunities live on the **Accounts** module. `Opportunity_Type` generalises it from
"universities" to every opportunity class.

**Why not a new module.** Accounts already held tuition range, living cost, application fee,
deadline, IELTS minimums, source URL, verification date and five per-dimension confidence
fields. A parallel module would have duplicated all of it and split the verification gate
across two places — the failure this codebase has already paid for twice.

## Types
`University Programme` · `Scholarship` · `Internship` · `Research` · `Competition` ·
`Fellowship` · `Summer School` · `Exchange` · `Job` · `Service Vendor`

`Service Vendor` exists because Expatrio and Fintiba are blocked-account providers, not
institutions. The matcher skips them; without the type they inflated the portfolio count.

## Required for an opportunity to be RANKABLE

| Field | Why |
|---|---|
| `Tuition_Min_EUR_Year` | No cost, no honest total |
| `Living_Cost_EUR_Year` | Tuition alone is the misleading number the whole brand opposes |
| `Next_App_Deadline` | No deadline, no backward plan |
| `Source_URL` | A figure without a source is not verified |
| `Verified_On` | A source without a date goes stale silently |

Missing any one → the opportunity is returned in `not_rankable[]` with the exact fields
missing. **It is never scored, never shown, and never estimated.**

## Optional but used when present
`Tuition_Max_EUR_Year` · `Application_Fee_EUR` · `IELTS_Min_UG` / `IELTS_Min_PG` ·
`English_Waiver_Route` · `Funding_Amount_EUR` · `Eligibility_Summary` · `University_Country`
· `Confidence` and the five `Confidence_*` dimensions

## Live state — 2026-08-23

| Metric | Value |
|---|---|
| Records | 23 (21 University Programme, 2 Service Vendor) |
| Fully rankable | **1** — University of Debrecen |
| Tuition verified with source + date | 4 — Debrecen, METU, EU Business School, Pécs |
| Living cost recorded | 3 |
| Deadline recorded | 1 |

**The engine is not starved by design — it is starved by input.** The gate is working
exactly as specified and there is almost nothing to rank.

## Verification finding, confirmed across two sessions
Tuition **is** published by universities. Living costs and deadlines mostly are **not** —
fetches against `pte.hu` and `metropolitan.hu` returned link stubs and navigation hubs.
Closing this is an **email** task, not a research task.

One refusal worth recording: METU's only living-cost figure is the promotional phrase
*"only EUR 500 per month or even less"*. That was **not** written to the record. Writing it
would have pushed METU through the gate and put marketing copy into a family's cost total.
