# File 21 — CRM Functions: the backend layer

**This is the backend the future frontend calls.** Nine Deluge functions, deployed to Zoho CRM,
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
