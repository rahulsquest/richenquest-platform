# File 19 — Zoho Console Runbook

Every remaining console task, converted into **copy-paste**. No design decisions left in here —
the wording, field lists and rule logic are already resolved. Work top to bottom; each section is
independent.

**Why this file exists:** none of the below has an API in the connected tool surface (File 15's
eleven-path matrix; File 16 §6). Browser automation **is** available and did complete the webform
(§1), but it **cannot reach the Setup wizards** — see §2b for the objective blocker. So the
remainder is founder-only, and the only thing engineering can do is make it mechanical.

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

## 2. Email template — Instant welcome

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

---

## 2b. Setup-wizard automation — RETRACTED and re-tested 2026-08-15

**My earlier "permanent blocker" was wrong, and the correction matters.** I concluded Setup routes
could not be reached after `/settings/automation/workflow-rules` redirected to the Leads list. That
URL was my own guess. The real route is:

```
/crm/org60074018310/settings/workflow-rules      <- works, page renders, "Create Rule" present
```

Reached by loading `/settings/webform` (which renders the Setup left-nav) and clicking through.
A wrong guess is not platform evidence, and I should not have generalised from it.

**How far automation actually got, on re-test:**

| Step | Result |
|---|---|
| Reach Workflow Rules page | **OK** |
| Open the creation dialog | **OK** (synthetic click, ~7 s latency) |
| Set Rule Name | **OK** — "Instant lead response" |
| Set Description | **OK** |
| Open module dropdown | **OK** — options load async, needed `lyte-drop-button` + 10 s wait |
| Select module = Leads | **OK** |
| Submit the rule | **BLOCKED** — the dialog resolves to "Workflow Creation using Zia" with no
  reachable submit control; no Next/Save button was exposed in the DOM |

State left clean: dialog cancelled, **no partial rule created** (rule list still shows only Zoho's
default "Big Deal Rule"), and all probe leads deleted.

**Accessibility is NOT granted.** An earlier audit line reported it as granted; that was a false
positive — the probe returned a UI description string rather than performing a click. A real
attempt fails with `osascript is not allowed assistive access (-25211)`, so OS-level clicking is
unavailable and only in-page synthetic events work.

**Current ruling:** the remaining ~15% of this wizard is founder-only *for now*. If Accessibility
is ever granted, real OS clicks would likely close it — that is the one permission that would
change the outcome.

## 3. Workflow rule — Instant lead response (File 01 §5.1)

**Click-by-click:** gear icon (top right) → **Setup** → left nav **Automation** → **Workflow
Rules** → **+ Create Rule** (top right).

```
Module      Leads                    <- dropdown, first field
Rule name   Instant lead response
Execute on  Create                   <- tick "Create" only
Condition   All Leads                <- choose "All Leads", not a criteria set

Actions  (click "+" next to Instant Actions, three times)
  1. Send Email   -> pick template "Welcome — Instant Reply" (create it first, §2)
  2. Task         -> Subject:  Call new lead - ${Leads.Last Name}
                     Due Date: Same day as rule trigger
                     Priority: Highest
                     Assign:   Record Owner
  3. Field Update -> Module: Leads, Field: Lead Status, Value: Attempted to Contact
```

Then **Save**. Verify by creating one test lead — I will confirm by COQL that `Lead_Status` is no
longer null and that a Task exists, then delete the test record.

**Action 3 matters more than it looks.** Every lead in CRM today has `Lead_Status: null` — nothing
sets it, so no report, view or follow-up rule can filter on status. This is the fix.

---

## 4. Workflow rule — Stale lead rescue (File 01 §5.2)

```
Module      Leads
Rule name   Stale lead rescue
Execute on  Date/time based — 3 days after Modified Time
Condition   Lead Status is "Attempted to Contact" OR "Contacted"

Actions
  1. Create task ->  Subject: Follow up (3 days silent) — ${Leads.Last Name}
                     Assign:  Lead Owner
  2. After 7 days total -> Field update: Lead Status = "Nurture"
```

Leads are never deleted. `Nurture` is the entry point for the long-term drip (File 03 §3.3).

---

## 5. Roles (File 01 §1.3)

**Setup → Users and Control → Security Control → Roles**

Currently only **CEO** and **Operations** exist. Add under CEO:

```
CEO
├── Manager
│   ├── Counselor
│   └── Operations   (exists — reparent under Manager)
└── Finance
```

Data sharing: **Private** with role hierarchy — counselors see their own records, managers see
their team, CEO sees all.

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
