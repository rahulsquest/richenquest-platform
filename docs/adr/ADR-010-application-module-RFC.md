# ADR-010 / RFC — The Application module

**Status: PROPOSED — awaiting founder approval. Do not create the module until this is accepted.**

A module's `api_name` is permanent once created. That is why this is an RFC and not a commit.

**Prerequisite verified** (File 25 §G-5): custom modules, lookups to `Deals`/`Accounts`/`Contacts`,
records holding live lookups, and auto-created related lists were all tested against this tenancy
and the probe deleted. The capability is not in question — only the shape.

---

## 1. Why this entity must exist

A Student Case applies to **many** universities. Today that is one text field,
`Course_University_Final`, so the model can record the *outcome* but never the *process* — and the
process is the work: five applications, three offers, one accepted, two declined.

Concretely, without it the business cannot answer:

- Which universities actually convert our students? (drives the whole partnership programme)
- What is our offer rate per university, per intake, per country?
- Which applications are stalled and with whom?
- What did the student decline, and why?

`partnershipKPIs` currently reports pipeline *stage* counts because there is no application data to
report on. This entity is what turns that into a conversion metric.

## 2. Shape

**Module:** `Applications` · singular `Application` · plural `Applications`

```
Contacts (Student) ──┐
Deals (Student Case) ─┼──> Applications ──> Accounts (University)
```

### 2.1 Field list

| Field label | API name | Type | Notes |
|---|---|---|---|
| Application Name | `Name` | text | system-required; set to `{Student} → {University} ({Intake})` |
| Student Case | `Student_Case` | lookup → `Deals` | related list "Applications" |
| Student | `Student` | lookup → `Contacts` | denormalised from Case for direct querying |
| University | `University` | lookup → `Accounts` | related list "Applications" |
| Program | `Program` | text(200) | course name as applied |
| Level | `Level` | picklist | Bachelor's · Master's · Diploma · PhD · Foundation |
| Intake | `Intake` | picklist | Jan 2027 · May 2027 · Sep 2027 · Jan 2028 · Undecided |
| Status | `App_Status` | picklist | see §2.2 |
| Submitted On | `Submitted_On` | date | |
| Decision On | `Decision_On` | date | |
| Offer Type | `Offer_Type` | picklist | Unconditional · Conditional · — |
| Offer Conditions | `Offer_Conditions` | textarea | what must still be met |
| Offer Deadline | `Offer_Deadline` | date | **drives reminders — a missed deadline is a lost place** |
| Scholarship Amount | `Scholarship_Amount` | currency | |
| Scholarship Notes | `Scholarship_Notes` | textarea | conditions, renewal terms |
| Deposit Required | `Deposit_Required` | currency | |
| Deposit Paid On | `Deposit_Paid_On` | date | **CRM records the date only — the money lives in Books (File 25 §G-4)** |
| Rejection Reason | `Rejection_Reason` | picklist | Academic · English · Documents · Funds · Late · Course Full · Other |
| Portal Reference | `Portal_Reference` | text(100) | the university's own application id |
| Notes | `Description` | textarea | native |

**Deliberately absent:** any money *balance*, any visa field, any document field.
Visa is a Case-level fact (a student gets one visa, not one per application). Documents get their
own entity (File 25 §G-3). Balances belong to Books. Putting any of them here would duplicate a
source of truth.

### 2.2 Lifecycle

```
Draft ─> Submitted ─> Under Review ─┬─> Offer Received ─┬─> Offer Accepted ─> Enrolled
                                    │                   ├─> Offer Declined
                                    │                   └─> Offer Lapsed      (deadline passed)
                                    ├─> Rejected
                                    └─> Withdrawn
```

**Rules enforced by function, not by picklist:**

1. `Offer Received` requires `Offer_Type` and `Decision_On`.
2. `Offer Accepted` is permitted on **at most one** application per Student Case. Accepting a
   second must refuse — a student enrols once, and letting the data say otherwise breaks every
   conversion metric downstream.
3. `Rejected` requires `Rejection_Reason` — same discipline as `Closed Lost` on the Case.
4. `Offer Lapsed` is set **only** by the scheduled sweep, never by hand.
5. Transitions are forward-only except an explicit `reopenApplication`, which is audited.

### 2.3 Case ↔ Application coupling

Accepting an offer should move the **Case** to `Offer Received`, and enrolment should move it to
the journey axis. That coupling lives in `updateApplicationStatus` — **one** place — not in a
workflow rule, because Deluge writes do not fire workflow rules (File 22 §D-1).

## 3. REST contract

| Function | Signature | Guards |
|---|---|---|
| `createApplication` | `(case_id, university_id, program, level, intake)` | case + university must exist; no duplicate open application for the same case+university+intake |
| `updateApplicationStatus` | `(application_id, new_status, detail_json)` | §2.2 rules; audited; cascades to Case |
| `recordOffer` | `(application_id, offer_type, conditions, deadline, scholarship_amount)` | requires deadline; sets status |
| `applicationsForCase` | `(case_id)` | read; returns all with offers, for comparison |
| `sweepLapsedOffers` | `()` | scheduled; `Offer_Deadline` past and still `Offer Received` → `Offer Lapsed` + task |

All return the standard envelope `{ok, …}` / `{ok:false, errors:[…]}`, validate through
`coreValidate`, and audit through `generateAuditLog`. No new validation or audit logic.

## 4. Automation

| Trigger | Action |
|---|---|
| `Offer Received` | task "Advise student on offer" +1d Highest; task "Offer expires" at `Offer_Deadline − 7d` |
| `Offer Accepted` | task "Collect deposit"; Case → `Offer Received`; audit |
| `Submitted` | task "Chase university" +14d if still no decision |
| Nightly | `sweepLapsedOffers` |

All tasks via `createFollowUpTasks`. No new task actions.

## 5. Reporting this unlocks

- **University conversion:** applications → offers → accepted, per university. The metric the
  partnership programme currently has no data for.
- **Offer rate by intake and level** — where to focus recruitment.
- **Deposit conversion** — offers accepted vs deposits paid.
- **Stalled applications** — submitted, no decision, past SLA.

Dashboard: extend the existing **University Partnership KPIs** dashboard rather than creating
another (File 21 §6c: the org already has eight; duplication is the failure mode).

## 6. Permissions

| Profile | Access |
|---|---|
| Administrator | full |
| Standard (counselors) | read/write own Cases' applications |
| Future Partner Portal | **never direct** — read model only (ADR-009) |

## 7. Scale

At 10,000 students × ~5 applications = **50,000 records**, plus lookups on three modules and
`sweepLapsedOffers` paging nightly.

This is real API-budget consumption against the 60,000/day ceiling (ADR-009). The nightly sweep
must filter server-side, **not** page-and-filter in Deluge the way `archiveExpiredPartnership` does
— that pattern is correct at 17 accounts and wrong at 50,000 applications. Use a COQL query with a
date predicate.

## 8. Rollback

Module deletion is asynchronous (`202 SCHEDULED`, verified). Rollback within the first days is
clean because no other entity depends on it yet. **After applications carry offer decisions, there
is no rollback** — that data exists nowhere else. The point of no return is the first real offer
recorded, not module creation.

## 9. What I need from you

1. **Approve or amend the field list** (§2.1) — `api_name`s are permanent.
2. **Confirm the intake values** (§2.1). I used Jan/May/Sep 2027 + Jan 2028 from File 01 §3; if
   real intakes differ, they should be right before 50,000 records use them.
3. **Confirm rule 2** — one `Offer Accepted` per Case. I believe it is right; if students ever
   hold two firm places deliberately, say so now.

On approval I will create the module, deploy the five functions, extend `verifyPlatform` with
their guards, and run the regression suite before reporting done.
