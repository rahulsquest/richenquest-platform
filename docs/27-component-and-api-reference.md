# File 27 — Component & API reference

**The operating manual.** Everything deployed, what it does, how to call it, how it fails, and how
to verify it. Written so a new engineering team can run this platform without asking anyone.

**Authority:** this file supersedes the function catalogue in File 21 §2–3. File 21 remains the
record of *how the platform was built* and the Deluge gotchas learned doing it. Where they differ,
**this file is current**.

**State verified 2026-08-15 22:07** via `./scripts/platform-health.sh`:
16 functions · 7 workflow rules · 0 schedules · 0 watches · 0 custom modules · 8 dashboards ·
regression 13/13 · API quota 467/60,000 (0.8%).

---

## 1. Authentication and limits

```
POST https://crm.zoho.in/crm/v7/functions/<api_name>/actions/execute?auth_type=oauth
```

- `api_name` is the **lowercased** display name — `createstudentcase`, not `createStudentCase`.
- Arguments are **query parameters**, named exactly as in the Deluge signature.
- **Every argument is positional-by-name and mandatory in the URL.** Optional ones take `""`.
- Auth: OAuth only. Scope `ZohoCRM.functions.execute.READ` plus whatever the function touches.
- `zapikey` URLs exist per function but are **deliberately inactive** and their values are recorded
  nowhere in this repo — they grant CRM write access from a query string.
- **Org limit: 60,000 API calls / 24 h, org-wide, shared by every client** (ADR-009). Each function
  consumes several calls per invocation; budget accordingly.

Every function returns a JSON **string**, in one of three shapes:

| Shape | Meaning |
|---|---|
| `{"ok":true, …}` | success, plus function-specific fields |
| `{"ok":false,"errors":[{field,code,message}]}` | input validation failed (`coreValidate`) |
| `{"ok":false,"error":"…"}` | business rule or lookup failure |

Error codes from `coreValidate`: `REQUIRED` · `NOT_AN_ID` · `ENUM` · `NOT_A_DATE` · `NOT_FUTURE` ·
`UNKNOWN_RULE`.

---

## 2. Function reference

Owner is **platform** for all 16 unless stated. Source of truth is `functions/src/*.dg`; CRM is
deployed *from* the repo, and if they disagree the repo is right.

### 2.1 Platform services

#### `coreValidate(rules_json, values_json)`
**Purpose** The one validator. Every function declares its input contract as data rather than
hand-rolling checks.
**Inputs** `rules_json` — list of `{field, type, values?}`; `values_json` — map of field → value.
**Types** `required` · `id` · `enum` · `date` · `date_future`.
**Outputs** `{"ok":true}` or `{"ok":false,"errors":[…]}`.
**Business rules** An unknown rule type returns `UNKNOWN_RULE` — a typo must never silently weaken
validation. Blank passes `enum` unless `required` is also declared.
**Failure modes** Malformed JSON throws at parse time — a caller bug, and loud by design.
**Dependencies** none. **Depended on by** 6 functions.
**Rollback** Redeploy previous `.dg`. No data effect.
**Verification** `verifyPlatform` checks 1 and 2.
**Version** 1.0 (2026-08-15).

```
rules  [{"field":"case_id","type":"id"},{"field":"stage","type":"enum","values":["A","B"]}]
values {"case_id":"12345","stage":"A"}
→ {"ok":true}
```

#### `generateAuditLog(module_name, record_id, action, detail)`
**Purpose** Immutable audit entry as a Note on the record, titled `[audit] <action>`.
**Why Notes** Already timeline-rendered, permission-scoped to the record, no new schema.
**Outputs** `{"ok":true,"note_id":"…"}`.
**Business rules** Never edited or deleted by any function. Called by every mutating function.
**Failure modes** If the parent record does not exist the Note create fails and `ok:false` is
returned — the caller decides whether that is fatal.
**Rollback** none required; entries are additive.
**Verification** `verifyPlatform` check 9 asserts an `[audit]` note exists on a probe case.
**Version** 1.0.

#### `verifyPlatform()`
**Purpose** The regression suite. 13 assertions across every guard.
**Inputs** none — builds its own fixtures, all prefixed `VERIFYPROBE`.
**Outputs** `{"pass":n,"fail":n,"ok":bool,"checks":[…],"cleanup":{deleted,leaked}}`.
**Business rules** Deletion is confirmed by **re-reading** each probe; anything still fetchable is
reported in `cleanup.leaked` and forces `ok:false`. Ids are harvested regardless of pass/fail.
**Failure modes** A guard that stops refusing bad input reports `FAIL` with the raw response.
**Dependencies** every other function.
**Rollback** n/a — read/write of probe data only.
**Verification** it *is* the verification. Run before every deploy.
**Version** 1.1 — 1.0 contained a test that asserted nothing and leaked two records.

### 2.2 Lead and student lifecycle

| Function | Purpose | Key guards | Verified by |
|---|---|---|---|
| `resolveStudent(full_name, email, phone)` | Find-or-create the Student as a Contact — one stable person id | matches **email → phone → create**; **never on name alone** | check 3 |
| `updateLeadLifecycle(lead_id, new_status, reason)` | Single entry point for `Lead_Status` | status must be in the live picklist; no-op is success; audited with reason | manual (File 21 §4) |
| `createStudentCase(student_name, student_email, student_phone, destination, service_package, counselor_id, lead_id)` | Opens a Student Case (Deal) at `New Inquiry`, bound to a Student | requires name; **fails closed** — no identity, no Case | checks 4, 5 |
| `updateStudentCaseStage(case_id, new_stage, lost_reason)` | Sales-pipeline transition | stage must exist; **`Closed Lost` requires a reason**; audited from→to; raises stage-entry tasks | checks 6, 7 |
| `advanceStudentJourney(case_id, journey_stage, note)` | Post-admission journey | **forward only**; **nothing reaches `Arrived` unless the case is `Visa Approved — Won`** | check 8 |
| `assignCounselor(lead_id)` | Least-loaded active Counselor | **refuses when no user holds the Counselor role** — never assigns to an admin | not covered — see §4 |
| `wfLeadCreated(lead_id)` | Trigger body for the lead-intake rule | delegates to `updateLeadLifecycle` + `createFollowUpTasks` | not covered — see §4 |

**Lifecycle rules worth restating** (full reasoning in File 23):
- A Lead is **never** converted or deleted. `createStudentCase` records `lead_id` in the audit only.
- The journey axis is deliberately **not** Deal stages — a case is won at visa approval, and
  putting arrival/alumni on the pipeline would corrupt `Probability` and every conversion report.

### 2.3 Work and partnerships

| Function | Purpose | Key guards | Verified by |
|---|---|---|---|
| `createFollowUpTasks(module_name, record_id, spec_json)` | **The only** task creator | per-task errors collected, not thrown; `priority` defaults `Normal` | checks 7, 11 (indirect) |
| `logPartnershipContact(account_id, channel, direction, summary, next_action_days)` | Interaction history **and** pipeline advance | channel/direction enums; summary required; outbound `Identified→Contacted`, inbound `→In Discussion` | checks 10, 11 |
| `renewPartnership(account_id, new_expiry, signed_on)` | Renewal back to `Active` | **refuses an expiry in the past** — it would be re-archived that night | check 12 |
| `archiveExpiredPartnership()` | Nightly sweep of lapsed agreements | never deletes — `Dormant`/`Expired` only | not covered — see §4 |
| `createUniversityFollowup(account_id)` | Day 4/9/16 cadence on demand | delegates to `createFollowUpTasks` | not covered — see §4 |
| `partnershipKPIs()` | All partnership figures in one call | read-only | check 13 |

**`createFollowUpTasks` spec format** — the platform's most reused contract:

```json
[{"days":4,"subject":"Partnership follow-up 1 of 3 - Acme University","priority":"High"}]
```

Tasks relate to **every** module via `What_Id` + `$se_module`, including Leads. `Who_Id` is
Contacts-only and returns `INVALID_DATA` for a Lead — verified.

---

## 3. Workflow rule reference

All 7 are **active**, and all 7 are RichenQuest's. Zoho's factory `Big Deal Rule` was removed 2026-08-15 (File 32). Rules are triggers; they do **not** fire on Deluge writes (File 22 §D-1) —
that divergence is the strongest argument for the deferred D-1 migration.

| Rule | Module | Trigger | Condition | Actions | Business purpose |
|---|---|---|---|---|---|
| **Instant lead response** | Leads | on create | all leads | Email `Welcome - Instant Reply`; field update `Lead_Status`; task `Call new lead` | Speed-to-lead. Before it, every lead had `Lead_Status: null` and nothing could filter on status |
| **Stale lead rescue** | Leads | `date_or_datetime`, 3 days on `Modified_Time` | status `Attempted to Contact` OR `Contacted` | task `Follow up (3 days silent)` | Unanswered leads resurface instead of dying quietly |
| **Partnership outreach cadence** | Accounts | `field_update` on `Partnership_Stage` → `Contacted` | same | 3 tasks at day +4/+9/+16 | Structured outreach without auto-sending unverifiable claims |
| **Partnership reply SLA** | Accounts | `field_update` → `In Discussion` | same | task `REPLY within 4 hours`, Highest | A university that replies must be answered same-day |
| **Partner onboarding** | Accounts | `field_update` → `Agreement Signed` | same | 3 tasks: file agreement, load programs, brief counselors | Signing is the start of work, not the end |
| **Agreement renewal guard** | Accounts | `date_or_datetime`, 30 days **before** `Agreement_Expires_On` | — | task `renew or close` | Agreements lapse silently otherwise |
| **Overdue task reminder** | Tasks | `date_or_datetime`, 1 day past `Due_Date` | status ≠ Completed | email to `${!Tasks.Owner}` | Managers see exceptions only; nobody plays follow-up police |

**Verification** — flip the trigger on a probe record, assert the effect, delete the probe. Three
date-triggered rules (Stale lead rescue, Agreement renewal guard, Overdue task reminder) **cannot
be fired on demand** and are verified by configuration read-back only.

---

## 4. Coverage gaps in the regression suite — stated plainly

`verifyPlatform` covers **13 of 16** functions. Four are **not** asserted:

| Function | Why not | Risk |
|---|---|---|
| `assignCounselor` | Happy path is untestable — no user holds the Counselor role. Only the refusal is reachable | **Medium.** The assignment path has *never* executed successfully |
| `archiveExpiredPartnership` | Would need a probe account with a past expiry, plus a KPI re-read; not yet written | Low — logic verified manually 2026-08-15 |
| `createUniversityFollowup` | Thin delegation to a covered function | Low |
| `wfLeadCreated` | Fires through a workflow rule; asserting it means creating a real Lead | Low–medium |
| `updateLeadLifecycle` | Covered indirectly via `wfLeadCreated`, not directly asserted | Low |

**These are the honest edges of "13/13 passing."** The suite proves what it asserts, not that the
platform is exhaustively tested.

---

## 5. Module reference

| Module | Purpose | Key relationships | Lifecycle | Owner |
|---|---|---|---|---|
| `Leads` | Unqualified inbound interest | → Tasks, Notes | `Lead_Status` picklist; never deleted | Counselor |
| `Contacts` | **The Student** — one stable person id | ← Deals via `Contact_Name` | created by `resolveStudent` | Counselor |
| `Accounts` | University / partner | → Agreements (fields), Notes, Tasks | `Partnership_Stage`: Identified → … → Active / Dormant | Partnerships |
| `Deals` *(labelled Student Cases)* | The engagement | ← Contacts; → Tasks, Notes | **two axes**: `Stage` (11, sales) and `Student_Journey_Stage` (6, post-admission) | Counselor |
| `Tasks` | Unit of work | ← every module via `What_Id` | `Not Started` → `Completed` | assignee |
| `Notes` | Audit `[audit]` + communication `[contact]` | ← every module | append-only by convention | system |
| `Solutions` | Knowledge articles — **available, unused** | — | `Published` boolean | Operations |
| `Cases` | Support tickets — **available, unused** | — | — | Support |

**API contract for all modules:** standard Zoho record APIs (`/crm/v8/<Module>`), COQL for reads.
**Business logic must not bypass the functions** — direct record writes skip validation and audit.

---

## 6. How to verify the whole platform

```bash
./scripts/platform-health.sh                 # full check incl. regression
./scripts/platform-health.sh --no-regression # read-only, writes nothing
```

Reports quota (with the ADR-009 50% trigger), functions and REST state, rules per module,
schedules, **watch expiry**, custom modules, dashboards, and the regression result.

**Transport note for a new team:** `zcall()` currently drives an authenticated Chrome tab because
no client-side OAuth token exists in this environment (File 19 §2b). Transport is isolated in that
one function — with a token it becomes a two-line `curl` and nothing else changes.
