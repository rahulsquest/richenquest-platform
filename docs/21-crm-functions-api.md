# File 21 — CRM Functions: the backend layer

**This is the backend the future frontend calls.** Six Deluge functions, deployed to Zoho CRM,
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

## 2. The six functions

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

All probes deleted afterwards: 2 probe records, 7 probe tasks (cascaded), 4 probe functions.
Confirmed by COQL returning zero rows and the university pipeline reading 17 / all `Identified`.

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
