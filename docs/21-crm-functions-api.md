# File 21 — CRM Functions: the backend layer

**This is the backend every client calls** — website, mobile, admin panel, AI assistant, portals.
Fourteen Deluge functions, deployed to Zoho CRM,
each exposed over REST. No server, no container, no database — ADR-003 holds exactly as written.

Source of truth is `functions/src/*.dg` in this repo. What runs in CRM is deployed *from* those
files; if the two ever disagree, the repo is right and CRM is stale.

---

## 1. Why functions and not more workflow rules

Before this, task creation existed as **11 near-identical workflow Task actions** — one per
subject/offset/priority combination. Every new follow-up meant another console object, and the
logic ("what is a follow-up task") existed nowhere as a single statement.

`createFollowUpTasks` is now that single statement. `createUniversityFollowup` calls it rather than
restating the cadence. Workflow rules remain where they belong — as *triggers* — and the behaviour
they fire lives in one place.

---

## 2. The functions

All are `standalone` category, Deluge, REST-enabled with **OAuth**. All return a JSON string.

### `createFollowUpTasks(module_name, record_id, spec_json)`
The primitive. `spec_json` is a JSON list of `{"days":n,"subject":"...","priority":"..."}`.
Creates one Task per entry, due `today + days`, linked back to the record.

```
→ {"count":2,"created":["1292318000000904002","1292318000000903002"],"errors":[]}
```

`priority` defaults to `Normal`. Errors are collected per-task, not thrown — a bad entry does not
lose the good ones.

### `generateAuditLog(module_name, record_id, action, detail)`
Writes an audit entry as a **Note on the record**. Notes were chosen over a custom module because
they are already permission-scoped to the record and need no new infrastructure.

```
→ {"ok":true,"note_id":"1292318000000909001"}
```

### `updateLeadLifecycle(lead_id, new_status, reason)`
The single entry point for changing lead status. Validates against the live picklist, treats a
no-op as success, writes an audit note with the reason.

```
→ {"ok":true,"from":"Attempted to Contact","to":"Contacted","reason":"...","audit":"..."}
→ {"ok":false,"error":"status not in Lead_Status picklist: Nurture"}
```

A frontend can call this without knowing the picklist or the audit convention.

### `assignCounselor(lead_id)`
Assigns to the **least-loaded active Counselor** (fewest owned leads not in a closed status).
Least-loaded was chosen over the specified round-robin because it degenerates to round-robin when
loads are equal, and is better when they are not.

```
→ {"ok":false,"reason":"no active counselors"}
```

**That is the current live response, and it is correct.** No user holds the Counselor role yet
(3 active users: one CEO, two Operations). The function refuses rather than assigning a student
lead to whoever happens to be an admin. It starts working the moment a counselor exists — no code
change.

### `createUniversityFollowup(account_id)`
The day 4 / 9 / 16 partnership cadence, on demand — for restarting a sequence when a dormant
university re-engages, without round-tripping through a stage change. Delegates to
`createFollowUpTasks`.

```
→ {"ok":true,"account":"…","tasks":"{\"count\":3,\"created\":[…],\"errors\":[]}"}
```

### `archiveExpiredPartnership()`
No arguments, so it can be attached to a **Schedule** (20 slots available, none used). Any Account
past `Agreement_Expires_On` and not already Dormant becomes `Dormant` / `Expired`, with an audit
note. Nothing is ever deleted — File 01's rule is that relationships go dormant, not away.

```
→ {"scanned":18,"archived":["FNPROBE Expired University"],"errors":[]}
```

### `createStudentCase(student_name, destination, service_package, counselor_id, lead_id)`
Opens a Student Case — **a Deal** — at `New Inquiry`. Student Cases *are* the Deals module
(File 01 §4); the pipeline and fields already existed, this is the guarded way in. Optional
arguments take `""`. Sets `Document_Status: Not Started`, `Visa_Status: N/A`, and a 120-day
`Closing_Date`.

```
→ {"ok":true,"case_id":"1292318000000912001","stage":"New Inquiry"}
→ {"ok":false,"error":"student_name is required"}
```

A `lead_id` is recorded in the audit trail only — the Lead is **not** converted or deleted, because
leads are never destroyed (File 01 §5.2).

### `updateStudentCaseStage(case_id, new_stage, lost_reason)`
The guarded pipeline transition. Enforces three things the picklist cannot: the stage exists;
**`Closed Lost` requires a `lost_reason`** from the approved six; and the boundary is audited with
the from/to pair. Raises a stage-entry task — via `createFollowUpTasks` — only at the four stages
where a human genuinely must act (Agreement Sent, Agreement Signed, Offer Received, Visa Filed).
Creating a task at every boundary would train people to ignore them.

```
→ {"ok":true,"from":"New Inquiry","to":"Agreement Sent","tasks":"{\"count\":1,…}"}
→ {"ok":false,"error":"Closed Lost requires a lost_reason from: Went Silent,Chose Competitor,…"}
→ {"ok":false,"error":"unknown stage: Bogus"}
```

### `partnershipKPIs()`
Every partnership figure in one call. Exists as a function rather than only a dashboard because a
number that can be *fetched* is reusable — CRM dashboard, future frontend and a scheduled digest
all read the same figures and cannot disagree.

```
→ {"total":17,"by_stage":{"Identified":17},"by_agreement":{"None":17},
   "contactable":1,"uncontactable":16,
   "expiring_30_days":[],"expired_active":[],"generated_at":"…"}
```

`contactable: 1 / uncontactable: 16` is the live number and it is the outreach blocker in one
figure: 16 of 17 universities have no `International_Office_Email`, so no automation can contact
them. `expired_active` should always be empty — anything in it is an agreement that lapsed without
being archived.

### `logPartnershipContact(account_id, channel, direction, summary, next_action_days)`
Records one interaction **and** advances the pipeline. Communication history lives as Notes on the
Account, prefixed `[contact]` so it is filterable and distinct from `[audit]`. A dedicated custom
module was rejected: Notes are already timeline-rendered, permission-scoped and searchable.

`channel` ∈ `email|call|meeting|form|linkedin|other` · `direction` ∈ `outbound|inbound` ·
`next_action_days` `""` for none.

```
→ {"ok":true,"note_id":"…","stage":"Contacted","task":"{\"count\":1,…}"}
→ {"ok":false,"error":"channel must be one of: email,call,meeting,form,linkedin,other"}
```

**Deliberate side effect:** first *outbound* contact moves `Identified → Contacted`; an *inbound*
reply moves it to `In Discussion`. Logging what happened and recording where it leaves the
relationship is one action — splitting them is how pipelines end up lying.

### `renewPartnership(account_id, new_expiry, signed_on)`
Closes the loop `archiveExpiredPartnership` opens. Refuses an expiry in the past — renewing into
the past would simply be re-archived by the next sweep.

```
Agreement Signed → Active → (expiry passes) → Dormant/Expired
                      ^                              |
                      +------ renewPartnership ------+
```

```
→ {"ok":true,"account":"…","from_stage":"In Discussion","expires":"2027-08-15"}
→ {"ok":false,"error":"new_expiry must be in the future; got 2020-01-01"}
```

### `coreValidate(rules_json, values_json)` — the one validator
Every platform function declares its input contract **as data** and calls this, instead of
hand-rolling `if x == null`. Before it existed, six functions each carried their own required /
enum / date checks with slightly different wording — the exact duplication this platform is meant
not to have.

```
rules  [{"field":"case_id","type":"id"},
        {"field":"stage","type":"enum","values":["A","B"]},
        {"field":"expiry","type":"date_future"}]
values {"case_id":"12345","stage":"A","expiry":"2027-01-01"}

→ {"ok":true}
→ {"ok":false,"errors":[{"field":"case_id","code":"NOT_AN_ID","message":"…"}]}
```

Types: `required` · `id` · `enum` · `date` · `date_future`.
Codes: `REQUIRED` · `NOT_AN_ID` · `ENUM` · `NOT_A_DATE` · `NOT_FUTURE` · `UNKNOWN_RULE`.

Because rules are data, a **conditional** contract is just a different list — `updateStudentCaseStage`
adds the `lost_reason` rules only when the target stage is `Closed Lost`.

**An unknown rule type is an error, not a pass.** A typo in a contract must never silently weaken
validation.

### `advanceStudentJourney(case_id, journey_stage, note)`
The post-admission lifecycle: `Pre-Departure → Accommodation Confirmed → Arrived → Enrolled →
Success Story → Alumni`. Deliberately **not** Deal stages — see File 23 for why. Forward-only, and
nothing may reach `Arrived` unless the case is `Visa Approved — Won`.

```
→ {"ok":true,"from":"Accommodation Confirmed","to":"Arrived","tasks":"{\"count\":1,…}"}
→ {"ok":false,"error":"cannot reach Arrived while the case is at Agreement Sent; visa must be approved first"}
→ {"ok":false,"error":"journey only moves forward; already at Pre-Departure"}
```

---

## 3. Calling them

```
POST https://crm.zoho.in/crm/v7/functions/<api_name>/actions/execute?auth_type=oauth
```

`api_name` is the **lowercased** display name (`createfollowuptasks`, `updateleadlifecycle`, …).
Arguments go as query parameters, named exactly as in the Deluge signature.

**Auth.** Only OAuth is enabled. Zoho also generates a `zapikey` URL per function that authenticates
with a key in the query string; **it is deliberately left inactive and its value is not recorded in
this repo** — a URL that grants write access to CRM does not belong in version control, and a
frontend that needs one should obtain it server-side, never ship it in page source.

**Scope required:** `ZohoCRM.functions.execute.READ` plus whatever the function touches.

---

## 4. Verification — what was actually run

Every function was executed against live records, not just compiled.

| Function | Evidence |
|---|---|
| `createFollowUpTasks` | 2 tasks, due Aug 17 / Aug 20 from a same-day call, priorities High/Highest, both linked to the probe lead |
| `updateLeadLifecycle` | `Attempted to Contact → Contacted` with audit note `…903004`; separately **refused** `Nurture` with a readable error |
| `generateAuditLog` | note `…909001` created directly |
| `assignCounselor` | returned `no active counselors` and changed nothing — the correct refusal |
| `createUniversityFollowup` | 3 tasks created through the delegated primitive |
| `archiveExpiredPartnership` | `scanned:18, archived:1` — archived only the probe, left all 17 real universities untouched |
| `createStudentCase` | case opened at New Inquiry; separately **refused** an empty `student_name` |
| `coreValidate` | all-valid case passed; a 4-rule case returned all four distinct error codes; an unknown rule type returned `UNKNOWN_RULE` rather than passing |
| `advanceStudentJourney` | `Pre-Departure` allowed pre-win; `Arrived` **refused** pre-win; backwards **refused**; `Graduated` **refused**; after winning, `Accommodation Confirmed → Arrived` allowed and raised the check-in task |
| `updateStudentCaseStage` (refactored) | after moving to `coreValidate`: all previous guards intact **plus** a new `NOT_AN_ID` check the hand-rolled version never had |
| `partnershipKPIs` | returned `total:17, Identified:17, contactable:1` — matches the pipeline exactly; re-run after probe deletion confirmed baseline restored |
| `logPartnershipContact` | outbound email moved `Identified → Contacted` + raised the task; inbound moved it to `In Discussion`; **refused** channel `telepathy` |
| `renewPartnership` | set `Active` / `Signed` / expires 2027-08-15; **refused** an expiry of 2020-01-01 |
| `updateStudentCaseStage` | `New Inquiry → Agreement Sent` raised the chase task; **refused** `Closed Lost` with no reason and **refused** an unknown stage; valid `Closed Lost` + `Budget` set `Probability: 0` |

All probes deleted afterwards: 3 probe records (lead, account, case), 8 probe tasks (all
cascaded), 5 probe functions. Confirmed by COQL returning zero rows on Leads probes, Tasks, and
Deals; the university pipeline reads 17 / all `Identified`.

---

## 5. Deluge facts learned the hard way

Each of these cost a failed deploy or a failed run. They are not in the obvious documentation.

| Fact | Consequence |
|---|---|
| **Block comments cannot precede the signature.** | `no viable alternative at input 'string standalone'`. Doc comments go *inside* the braces. |
| **`script` on POST returns 500.** | Create with `name`/`display_name`/`category`/`language`, then **PUT** the script separately. |
| **`name` sets `api_name`**, not `api_name` itself. | Passing `api_name` is ignored; you get `untitled_function`. |
| **The script must carry the full signature** on PUT, not just the body. | Params cannot be declared via `arguments`/`params`/`parameters` — none are real fields. |
| **Deluge in CRM functions has no `while`.** | Paging is a bounded `for each` over an explicit page list. |
| **`searchRecords` rejects `less_than` on a date field.** | `INVALID_QUERY / invalid operator found`. Page and filter in Deluge instead. |
| **Tasks relate to Leads via `What_Id` + `$se_module`**, not `Who_Id`. | `Who_Id` is Contacts-only and returns `INVALID_DATA` for a Lead. |
| **Creating a function twice appends a digit** (`createfollowuptasks1`). | Deploy must look up the existing id first, or you silently get duplicates. |
| **Deluge compiles server-side on save.** | The API is a real syntax checker — a rejected PUT means broken code never deployed. |

---

## 6. Deployment

`functions/src/*.dg` → CRM, via the session-REST channel (File 19 §2b):

```
POST /crm/v2/settings/functions                 # create if absent
PUT  /crm/v2/settings/functions/<id>            # push script + rest_api
GET  /crm/v2/settings/functions?type=org        # list (type=org is required)
DELETE /crm/v2/settings/functions/<id>?source=crm
```

Note the namespace is **`crm/v2/settings`** for functions — not v8 or v9 like the automation
objects. It came from Zoho's own `function-model.js`.

---

## 6b. Phase 1 migration — BLOCKED BY LICENCE (founder-only: payment)

**Goal:** make every workflow rule a thin trigger that calls a Deluge function, so business logic
exists once. **Status: blocked, with the boundary identified precisely.**

Workflow rules *do* support a function action — `"functions"` is a valid action type, and the
action family `/crm/v8/settings/automation/functions?module=Leads` returns `200`. Creating one is
what fails:

```
POST /crm/v8/settings/automation/functions
  {…,"language":"deluge"}                → MANDATORY_NOT_FOUND: script
  {…,"language":"deluge","script":"…"}   → NOT_ALLOWED "permission denied"
```

`NOT_ALLOWED` on the `script` field, consistently, for both body-only and full-signature forms.

**Why it is a licence limit, not a payload bug.** The org reports:

```
license_details: { paid: false, paid_type: "free", trial_type: "zohooneenterprise" }
```

Custom functions *in workflow rules* are a paid-edition feature in Zoho CRM, while standalone
functions are not — which matches exactly what is observed: seven standalone functions deploy and
execute fine, and only the workflow-action binding is refused. **This is a payment boundary, one
of the four founder-only categories.**

Scoped honestly, per the File 15 lesson: what is proven is that *this org, on this licence,
cannot create a workflow function action through this endpoint*. Confirming the licence is the
cause requires a paid plan to test against. **Cannot verify further from here.**

**What this costs.** The seven live workflow rules keep their native actions, so the 11 task
actions remain. The duplication removal Phase 1 asked for is not achievable on the current plan.

**What still holds.** The shared logic exists and is authoritative for everything *not* triggered
by a workflow rule — the REST API layer, on-demand calls, and future schedules. When the plan is
upgraded, migration is mechanical: create one function action per rule, then strip the rule's
native actions. The functions are already written.

**Also parked:** `POST /crm/v8/settings/schedules` returns `500 INTERNAL_ERROR` on the payload
tried. The endpoint lists fine (`200`, 20 slots free). Schema not yet determined — not proven
blocked, just not solved.

## 6c. Reports and Dashboards — endpoints DISCOVERED, not absent

I previously recorded that `/crm/v8/settings/reports` and `/settings/dashboards` returned
`INVALID_REQUEST` and flagged them as "not located". They were not located because **I was
guessing URLs again**. Located properly, by reading what the CRM UI itself requests
(`performance.getEntriesByType('resource')` on the Reports and Dashboards tabs):

| Surface | Real endpoint |
|---|---|
| Reports | `GET /crm/v8/Reports?category=everything` |
| Report folders | `GET /crm/v8/Reports/Folders?per_page=2000` |
| Report config | `GET /crm/v8/Reports/Configuration` |
| Dashboards | `GET /crm/v2.2/Analytics?category=everything` |
| Dashboard metadata | `GET /crm/v2.2/Analytics/metadata` |
| Run a component | `POST /crm/v2.2/Analytics/<id>/Components/<cid>/actions/run` |

They are **module-style paths, not `/settings/*` paths** — which is exactly why the guesses
failed. Both return `200`.

Already present in the org: report folders including **Student Case Reports** and **Lead
Reports**; dashboards including **Org Overview**, **Lead Analytics** and **Student Case Insights**.
Building new reporting should extend these, not duplicate them.

**Creating a dashboard works** — `University Partnership KPIs` (`1292318000000918001`) created via
`POST /crm/v2.2/Analytics` with `access_type: "public"` (`private` and `organization` are rejected;
`shared` needs an extra dependent field). **Adding components does not yet** — see File 22 §D-4.

This is the third time a guessed URL produced a false "no API" conclusion (File 15 row 11, the
Setup wizard route, and this). The rule stands: **read what the UI requests; never infer absence
from a URL you invented.**

## 7. Open items

- **`assignCounselor` is unproven on the happy path.** It cannot be until a user holds the
  Counselor role. The refusal path is verified; the assignment path is **not**.
- **`archiveExpiredPartnership` is not scheduled yet.** It runs correctly on demand. Attaching it
  to one of the 20 Schedule slots is the next step.
- **No function is wired to a workflow rule yet.** The rules still fire their own Task actions.
  Migrating them to call `createFollowUpTasks` would remove the remaining duplication — that is
  the natural follow-on, and it is deliberate that it has not been done blind: the rules are
  currently verified working, and swapping their actions should be done one at a time with a probe
  each.
- **Student Cases module does not exist.** Functions targeting it cannot be written yet.
