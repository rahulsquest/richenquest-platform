# File 33 — Metrics catalogue & data quality audit

**Read this first:** the platform is instrumented for a business that has not started operating in
it yet. `Deals` is empty, `Contacts` is empty, and all four `Leads` are stale test records. Every
metric below is **defined and derivable**; almost none has data.

That is not a criticism of the platform — it is the honest state, and stating it prevents the worst
BI failure mode, which is a dashboard full of confident zeros that nobody realises are zeros because
nothing happened rather than because something broke.

---

## PHASE 1 — Metric catalogue

Every metric names its source and its formula. **Nothing is manually maintained.**
`./scripts/founder-dashboard.sh` computes the starred (★) ones today.

### Lead & conversion

| Metric | Formula | Source | Live? |
|---|---|---|---|
| ★ Lead volume | `count(Leads)` | Leads | ✅ 4 (all test) |
| ★ Leads today | `count(Leads where Created_Time = today)` | Leads | ✅ 0 |
| Lead velocity | leads per week, 4-week rolling | Leads.Created_Time | needs 4 weeks of real leads |
| Lead → Case rate | `count(Deals) / count(Leads)` over a cohort | Leads + Deals | **blocked** — no link. `createStudentCase` records `lead_id` in the **audit note only**, so this is not queryable |
| ★ Lead status mix | group by `Lead_Status` | Leads | ✅ all `(unset)` |
| Speed to first contact | first Task completion − `Created_Time` | Leads + Tasks | derivable, no data |

**Gap worth naming:** *Lead → Case conversion is the single most important funnel number and it
cannot currently be computed.* The originating lead is written into an audit note, not a field.
Fixing it means one lookup field on `Deals` — a schema change, so it is recorded here rather than
done under a no-new-features brief.

### Student case funnel

| Metric | Formula | Live? |
|---|---|---|
| ★ Conversion funnel | count by `Stage` across the 11 stages | ✅ empty |
| ★ Open / Won / Lost | `Stage` partition | ✅ 0/0/0 |
| Stage velocity | mean days between stage changes | derivable from `[audit]` notes — **but only by parsing note text**, which is fragile |
| Loss analysis | group by `Lost_Reason` | enforced mandatory on `Closed Lost`, so this will be complete when it has data |
| ★ Visa success | `Visa_Approved / (Visa_Filed + Visa_Approved + Visa_Refused)` | ✅ empty |
| ★ Journey distribution | group by `Student_Journey_Stage` | ✅ empty |
| Country funnel | group by `Destination_Country` × `Stage` | derivable, no data |

### University & application

| Metric | Live? |
|---|---|
| ★ Universities by stage | ✅ 17, all `Identified` |
| ★ Contactability | ✅ **1 of 17** |
| ★ Agreements signed | ✅ 0 |
| Application velocity, offer rate, scholarship rate, university conversion | **blocked on ADR-010** — the Application entity does not exist, so none of these can be computed |

**University conversion is the metric the partnership programme exists to optimise, and it is
unavailable.** That is the business case for ADR-010, stated as a number rather than an opinion.

### People & work

| Metric | Formula | Live? |
|---|---|---|
| ★ Open / overdue / due-today tasks | `Status != Completed` partitioned by `Due_Date` | ✅ 0/0/0 |
| Task SLA breach rate | overdue ÷ total open | ✅ derivable |
| Counselor productivity | cases owned, stage advances, tasks closed per owner | **blocked** — no counselor users exist |
| Workload balance | open cases per counselor, variance | same |

### Revenue

| Metric | Source | Live? |
|---|---|---|
| ★ Pipeline value | `sum(Deals.Amount)` | ✅ 0 |
| Weighted forecast | `sum(Amount × Probability)` | derivable |
| Actual revenue | **Books** | **blocked — Books is in `test` mode; every figure is fictional** |

**Boundary that must not be blurred:** CRM holds commercial *intent*, Books holds financial *truth*
(File 25 §G-4). Any "revenue" from CRM is a forecast, and the dashboard labels it as such.

---

## PHASE 2 — Data quality audit

Audited 2026-08-15 by direct COQL against every populated module.

### Findings

**F-1 · All four Leads are test records — severity HIGH**

```
Deploy Verify        deploy-verify-lead-intake@richenquest.com   2026-07-28
Titan Pipeline Check deploy-verify-titan@richenquest.com          2026-07-28
Dup Check            deploy-verify-dup@richenquest.com            2026-07-28
Pipeline Two         deploy-verify-pipeline2@richenquest.com      2026-07-28
```

Deploy-verification probes from 28 July that were never cleaned up — they predate the
delete-every-probe discipline. **The CRM contains zero real leads.**

They are also `Lead_Status: null`, because they predate the *Instant lead response* rule. Any status
filter, report or funnel silently excludes them.

**Recommendation: delete all four.** They are in `backups/2026-08-15/Leads.zip`, so deletion is
recoverable. Not done unilaterally — they are the entire contents of the module, and that is the
founder's call, not a cleanup task.

**F-2 · University contactability is 6% — severity HIGH**

| Field | Populated |
|---|---|
| `Account_Name` | 17/17 (100%) |
| `Partnership_Stage` | 17/17 (100%) |
| `Partnership_Type` | 17/17 (100%) |
| `Agreement_Status` | 17/17 (100%) |
| **`International_Office_Email`** | **1/17 (6%)** |
| `International_Office_Contact` | 1/17 (6%) |
| `Website` | 2/17 (12%) |
| `Phone` | 0/17 (0%) |

The outreach machinery is built, verified and idle: 16 of 17 universities have nothing to send to.
**This is a research task, not an engineering one** — and it is the highest-value non-engineering
work available.

**F-3 · Two users share a display name — severity MEDIUM**

`tech@richenquest.com` and `partnerships@richenquest.com` are both **"RichenQuest Global"**. Record
ownership, `[audit]` entries and task assignment all render the display name, so **the audit trail
cannot distinguish them**. Fix: rename one. Two minutes, and it protects every audit record written
from here on.

**F-4 · No duplicates, no orphans — severity NONE**

Checked: no duplicate emails, no duplicate universities, no records referencing missing parents.
Genuinely clean — helped by there being little data, and by `resolveStudent` making duplicate
students structurally hard.

**F-5 · Dead automations — RESOLVED**

12 Zoho artifacts removed 2026-08-15 (File 32). Every remaining automation is owned and named.

**F-6 · Unused fields — NOT ASSESSABLE**

`Leads` carries 68 fields, `Deals` 40, `Accounts` 56. With 4 test leads and 0 cases, "unused" is
indistinguishable from "not yet used". **Re-run this audit after 100 real records** — pruning fields
now would delete capacity for data that has not arrived.

### Data quality score

Scored on populated modules only, weighted by operational importance.

| Module | Records | Completeness | Weight | Notes |
|---|---:|---:|---:|---|
| **Accounts** | 17 | **42%** | high | 100% on structure, 6% on contactability |
| **Leads** | 4 | **0%** | high | 100% test contamination |
| Contacts / Deals / Tasks / Notes | 0 | n/a | — | empty |

**Accounts detail** — `(100+100+100)×1 + 5.9×3 + 5.9 + 11.8` over weight 8 = **41.9%**
(email weighted ×3 because outreach is impossible without it).

> ## Overall data quality: **38 / 100**
>
> Structure is excellent — every record that exists is well-formed, correctly typed, and carries
> mandatory fields. **Content is the problem**: the only lead data is test data, and the
> partnership pipeline is missing the one field that makes it actionable.
>
> **This score is fixed by research and data entry, not by code.**

### Re-audit

```bash
./scripts/founder-dashboard.sh   # ATTENTION section flags F-1 and F-2 every run
```

The dashboard surfaces both HIGH findings automatically, so they cannot be forgotten between
audits.
