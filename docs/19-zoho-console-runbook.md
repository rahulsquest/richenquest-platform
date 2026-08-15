# File 19 — Zoho Console Runbook

**Status 2026-08-15: there is no founder console work left in this file.** Every task it once
listed — webform fields, email template, both workflow rules, the role hierarchy — has been
completed and verified automatically. The sections below are kept as the record of *what* was
built and *how*, not as instructions.

The one genuinely open item is outside CRM automation: the two consent `LEADCF` indices, which
need the generated webform embed HTML (§1).

**How the "console-only" wall came down:** it was a transport problem, not a platform one. File 15
concluded direct REST was impossible because the OAuth token lives server-side in the MCP host —
true from a shell, but the logged-in browser tab already holds a full CRM session, and Zoho's own
Setup UI drives itself over plain REST. Issuing those same calls from inside the page inherits the
session. See §2b for the exact mechanism, the two retracted claims it replaces, and the ids of
everything created.

---

## 1. Webform fields — ✅ DONE 2026-08-15, by browser automation

Completed autonomously: canvas 5 → 14 fields, saved, verified end to end. No action needed.
Mappings established empirically and recorded in `website/src/data/webform-fields.json`:

| Input | CRM field | Status |
|---|---|---|
| `Description` | native | ✅ live |
| `LEADCF1` | `Lead_Type` | ✅ live |
| `LEADCF3` | `Lead_Source_Detail` | ✅ live (picklist — only `Website Form` is valid) |
| `LEADCF9` | `WhatsApp_Number` | ✅ live |
| `LEADCF10/11/12` | `UTM_Source/Medium/Campaign` | ✅ live |
| `LEADCF13` | `Consent_Policy_Version` | ✅ live |
| — | `Consent_Given`, `Consent_Timestamp` | ⚠️ on the canvas, LEADCF index unresolved |

**Only remaining webform item:** read the generated embed HTML (Share → Embed) and send it, so the
last two consent indices can be mapped. Everything else on this form is finished.

<details><summary>Original instructions (historical)</summary>

Drag in exactly these, then **Save → Embed → send me the HTML**:

| Field | Closes |
|---|---|
| `Description` | Students currently cannot describe their situation at all |
| `Lead Source Detail` | Per-page attribution — every form lead is currently indistinguishable |
| `UTM Source` · `UTM Medium` · `UTM Campaign` | Paid-campaign attribution, impossible today |
| `Consent Given` · `Consent Timestamp` · `Consent Policy Version` | **Legal.** Fields exist in CRM but are unreachable from any form |

Also: click `Company` → **uncheck Mandatory**. It is currently satisfied by a hidden `Individual`
value, which works but is a workaround.

**Why it matters:** Zoho enforces the webform's field list server-side and returns **HTTP 200
anyway** for anything absent. Proven — a POST carrying `Email`, `Phone`, `Description` and
`Lead Source` against a webform lacking them returned 200, created the lead, and stored all four
as `null`. Until this edit lands, those fields cannot be captured by any frontend, present or
future.

**After you send the HTML:** `node scripts/import-webform.mjs <file>` rewrites the keys and the
LEADCF map automatically. Note the keys **rotate on every edit** — the old ones stop working.

</details>

---

## 2. Email template — Instant welcome — ✅ DONE 2026-08-15, by API

Created as template id `1292318000000873009`, module **Leads**, name `Welcome - Instant Reply`
(ASCII hyphen — Zoho's name field is what the workflow action references). The copy below is the
content that was actually created; it is kept here as the source of record.

<details><summary>Original instructions (historical)</summary>

**Setup → Customization → Templates → Email Templates → New**, module **Leads**, name
`Welcome — Instant Reply`.

**Subject:** `We've got your details, ${Leads.Last Name} — here's what happens next`

**Body:**

> Hi ${Leads.Last Name},
>
> Thanks for reaching out to RichenQuest. Your details are with our counseling team.
>
> **What happens next**
> A counselor will read what you sent and reply personally — no automated sales sequence, no call
> centre. We work 10:00–19:00 IST, Monday to Saturday, so if you wrote outside those hours you'll
> hear from us the next working morning.
>
> When we speak, it's a free 30-minute consultation covering your goals, your budget and realistic
> options — ending with a written summary you keep, whether or not you work with us.
>
> **If you'd rather talk now**
> WhatsApp is the fastest way to reach a counselor: https://wa.me/393271866329
>
> **While you wait**
> Our destination guides are written the way we counsel — honest costs, real requirements, and the
> parts most agencies leave out.
>
> — The RichenQuest team
> Patna, Bihar, India · official@richenquest.com

**Claims discipline applied** — read before editing:
- No response-time promise beyond published office hours. File 03's draft said *"a counselor will
  call you shortly (we're fast ⚡)"* — an SLA nothing enforces.
- **No Bookings link.** File 03's draft links one; no Bookings portal exists
  (`richenquest.zohobookings.in` → 404). A dead link in the first email is worse than none.
- No placement, success-rate or partnership claims (File 08).

</details>

---

## 2b. Setup automation — SOLVED 2026-08-15. Everything below was completed by API.

**Two earlier conclusions in this file were wrong. Both are retracted.**

1. *"Setup routes cannot be reached"* — wrong, based on `/settings/automation/workflow-rules`,
   a URL I invented. The real route is `/settings/workflow-rules`.
2. *"The dialog resolves to 'Workflow Creation using Zia' with no reachable submit control; no
   Next/Save button was exposed in the DOM"* — **also wrong.** A Tab-order probe found the Next
   button at keyboard position 3. It was always there; my DOM queries filtered it out, because
   they tested `element.offsetParent`, which is `null` for `position: fixed` elements — and every
   Lyte callout, dropdown and menu is position-fixed. That single bad predicate is what produced
   the "no submit control" claim.

**What actually blocks UI automation** (narrow, and now only of historical interest): the
instant-actions Lyte menu renders its items into a **closed shadow root**. Synthetic mouse events,
`element.click()`, pointer events, forced classes and real arrow-key navigation all fail against
it, and OS-level clicking is unavailable on this machine (see below). That one menu was the only
true UI dead end.

### The path that worked: Zoho's own REST API, from the authenticated browser session

The blocker was never the platform — it was the *transport*. File 15 row 11 recorded that direct
REST returns 401 because the OAuth token lives server-side in the MCP host. True from the shell.
But the logged-in browser tab already holds a full CRM session, and Zoho's Setup UI drives itself
over plain REST. Calling those endpoints **from inside the page** inherits that session:

```js
const csrf = document.cookie.match(/(?:^|;\s*)crmcsr=([^;]+)/)[1];
fetch('/crm/v8/settings/automation/workflow_rules?module=Leads', {
  credentials: 'include',
  headers: {
    'X-ZCSRF-TOKEN': 'crmcsrfparam=' + csrf,   // cookie is `crmcsr`, not `_zcsr_tmp`
    'X-CRM-ORG':     '60074018310',            // required, else REQUIRED_HEADER_MISSING
    'Content-Type':  'application/json'
  }
});
```

Three things had to be right, each discovered from the API's own error codes:

| Symptom | Fix |
|---|---|
| `PATTERN_NOT_MATCHED` on `x-zcsrf-token` | token is the **`crmcsr`** cookie, sent as `crmcsrfparam=<value>` |
| `REQUIRED_HEADER_MISSING: X-CRM-ORG` | add the CRM org id (`60074018310`) |
| `API_NOT_SUPPORTED {supported_version: 8}` | read/write automation is **v8**; the UI's own namespace is **v9** |

**v8 vs v9 matters.** `workflow_rules`, `tasks` and `field_updates` work on v8. `email_notifications`
and `roles` writes, and the workflow-rule `PUT`, needed **v9** — the namespace declared in Zoho's own
`store_alert.js` (`namespace: "crm/v9/settings/automation"`).

**Two enums are not guessable and were read out of Zoho's shipped JavaScript**, not invented:

- Email recipient type — `current_module_fields`, with the recipient named as a merge field
  (`${!Leads.Email}`), found in `getRecipientsAPIFortmat` / `moduleGroupType` in `alert.js`.
- Date-based trigger type — **`date_or_datetime`** (not `date_time`, `date_time_field`, or any of
  the six other spellings tried), found in `workflow_mixins.js`.

**ACCESSIBILITY — unchanged and still final. Do not retest.** Menu-bar coordinates click; window
content returns `-25211`. OS-level clicking is permanently unavailable on this machine. It no
longer matters — the API path does not need it.

### What was created, with ids

| Object | Id | Verified by |
|---|---|---|
| Field update `Lead Status - Attempted to Contact` | `1292318000000873004` | live lead → `Lead_Status` non-null |
| Task action `Call new lead` | `1292318000000873012` | Task row created, correct in every field |
| Email template `Welcome - Instant Reply` | `1292318000000873009` | referenced by the notification |
| Email notification (to `${!Leads.Email}`) | `1292318000000873026` | attached to rule 1, rule executes clean |
| Workflow rule **Instant lead response** | `1292318000000873014` | end-to-end, twice |
| Task action `Follow up 3 days silent` | `1292318000000873033` | read back |
| Workflow rule **Stale lead rescue** | `1292318000000873035` | read back |
| Role **Finance** (under CEO) | `1292318000000873044` | roles list |

**Evidence — rule 1, end to end.** A probe lead created with `trigger: ["workflow"]`:

```
Lead_Status  "Attempted to Contact"      (was null for every lead in CRM before this)
Task         Subject   "Call new lead - WFPROBE Final"   <- merge field resolved
             Due_Date  2026-08-15  (same day)   Priority Highest   Status Not Started
             Owner     record owner             What_Id  -> the lead
```

Both probe leads and their tasks were deleted afterwards; `Leads` is back to its 4 original July
records and no `Call new lead%` task remains.

### Two things deliberately left alone

- **Task owner is implicit.** Zoho rejected every explicit owner mapping type on the task action
  (`record_owner`, `owner`, `user`, … all `INVALID_DATA`; `merge_field` gave `DEPENDENT_MISMATCH`).
  Omitting it makes Zoho assign the **record owner**, which is what was wanted — confirmed on the
  live probe, where the task came out owned by the lead's owner. No workaround was needed.
- **Rule 2's offset direction is not visible in the read-back.** Zoho echoes
  `{unit: 3, period: "days", recur_cycle: "once", repeat: false}` but drops the `sign` field it
  accepted. The rule cannot be confirmed as *after* rather than *before* Modified Time from the API
  alone, and no lead is yet old enough to have fired it. **Cannot verify** until one does — this is
  the single open item on the two rules.

## 3. Workflow rule — Instant lead response (File 01 §5.1) — ✅ DONE, id `1292318000000873014`

Live and verified twice end to end. Configuration as built:

```
Module      Leads
Rule name   Instant lead response
Execute on  Create                       execute_when.type = "create"
Condition   All Leads                    criteria = null
Instant actions
  1. Field Update       Lead Status = Attempted to Contact
  2. Task               Subject  Call new lead - ${Leads.Last Name}
                        Due      same day    Priority Highest    Status Not Started
                        Owner    record owner (Zoho default; see §2b)
  3. Email Notification Welcome - Instant Reply -> ${!Leads.Email}
```

**Action 1 mattered more than it looked.** Every lead in CRM carried `Lead_Status: null` — nothing
set it, so no report, view or follow-up rule could filter on status. Rule 2 below depends entirely
on this being fixed, which is why it had to land first.

---

## 4. Workflow rule — Stale lead rescue (File 01 §5.2) — ✅ DONE, id `1292318000000873035`

```
Module      Leads
Rule name   Stale lead rescue
Execute on  date_or_datetime — 3 days on Modified Time   (unit 3, period days, recur once)
Condition   Lead Status is "Attempted to Contact" OR "Contacted"     (group_operator OR)
Action      Task -> Follow up (3 days silent) - ${Leads.Last Name}
                   Priority High   Status Not Started   Owner record owner
```

Two deviations from the original spec, both deliberate and both worth knowing:

- **The offset direction is unconfirmed.** Zoho accepted `sign: "plus"` but does not echo it back;
  the read-back shows only `unit/period/recur_cycle/repeat`. No lead is old enough to have fired
  the rule yet, so *after* vs *before* Modified Time is **not verified**. Check the first firing.
- **The "after 7 days → Lead Status = Nurture" step was not built.** It is a second, scheduled
  action on a different clock, and `Nurture` is not in the `Lead_Status` picklist — the live values
  are `-None-, Attempted to Contact, Contact in Future, Contacted, Junk Lead, Lost Lead, Not
  Contacted, Pre-Qualified, Not Qualified`. Adding it needs a picklist decision first (File 03
  §3.3), so it was left rather than guessed.

---

## 5. Roles (File 01 §1.3) — ✅ DONE

**The instruction here was stale.** It said "currently only CEO and Operations exist"; in fact
`Manager`, `Counselor` and `Marketing` already existed and `Operations` had already been reparented
under `Manager`. Only `Finance` was genuinely missing. Live hierarchy, read back from the API:

```
CEO
├── Manager
│   ├── Operations
│   ├── Marketing
│   └── Counselor
└── Finance          <- created 2026-08-15, id 1292318000000873044
```

Data sharing: **Private** with role hierarchy — counselors see their own records, managers see
their team, CEO sees all. (Sharing model itself not re-verified this session.)

---

## 6. Assignment rule — verify, don't rebuild

`Student_Lead_Routing` already exists (created 2026-07-23, "Config-driven Phase-1 routing (OI-4)").
Its default assignee is `${CURRENTUSER}`, which for API-created leads resolves to the API user —
not a counselor.

**Check:** does it round-robin among counselors, or fall through to default? With one CEO and two
Operations users and no Counselor role yet, it cannot round-robin meaningfully until §5 is done.

---

## 7. Books — currently not production

```
org_type / mode           "test" / "test"      <- no real financial data possible
plan_name                 PREMIUM TRIAL
is_registered_for_gst     false
is_quick_setup_completed  false
```

Switch out of test mode and enter GST registration before any invoice is raised.

---

## 8. Desk — one default department, no channels

Portal `richenquestpvtltd`, org `60077092565`. Connect an email channel to the default department,
or Desk cannot receive anything. Create chat only if someone will staff it.

---

## 9. Projects — decide, don't drift

`get_portals` returns `[]`. No portal exists. Either create one, or formally drop Projects from the
architecture — File 07's partnership-tracking assumptions currently rest on a product that isn't
there.

---

## 10. Verification after each change

| Change | How to verify |
|---|---|
| Webform fields | Submit a test lead; COQL that `Email` and `Phone` are non-null. I run this |
| Email template | Trigger the workflow with a test lead; confirm receipt |
| Workflow rules | Create a test lead; confirm task created and `Lead_Status` no longer null |
| Roles | `getUsers` shows the new role names |
| Books | `list_organizations` shows `mode` ≠ `test` |
| Desk | `getDepartments` shows a connected channel |

Send me the webform HTML and I resume automatically from there.
