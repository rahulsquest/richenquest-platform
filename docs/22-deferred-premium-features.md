# File 22 — Deferred premium features

**Purpose: this file is a switch-on list.** Everything here is blocked only by the Zoho plan, is
already designed or already built, and can be enabled quickly once the org upgrades. Nothing here
is blocked by engineering.

**Current licence, read from the API:**

```
GET /crm/v8/org → license_details
  { paid: false, paid_type: "free", trial_type: "zohooneenterprise",
    users_license_purchased: 10, paid_expiry: null, trial_expiry: null }
```

Re-run that call after any upgrade, then work down this file.

---

## D-1 · Workflow rule → Deluge function binding — DEFERRED

**Status:** deferred by founder decision 2026-08-15. Treated as an optional optimisation, **not a
blocker**. All seven workflow rules stay exactly as they are; all standalone functions stay
deployed.

**What is blocked**

```
POST /crm/v8/settings/automation/functions
  {…,"language":"deluge","script":"…"}   → NOT_ALLOWED  "permission denied"
```

Consistent for body-only and full-signature forms. Standalone functions deploy and execute fine —
only the *workflow action binding* is refused, which is what a paid-edition gate on "custom
functions in workflow" looks like.

**Scoped honestly:** what is proven is that this org, on this licence, cannot create a workflow
function action via this endpoint. That the licence is the cause is the best-supported
explanation, not a verified fact — confirming it requires a paid plan to test against.

**Switch-on procedure** (roughly 30 minutes, mechanical):

1. Re-run the failing POST above. If it returns `201`, the gate is lifted.
2. For each rule, create one function action, then remove the rule's native actions:

   | Rule | Replace with | Function (already written) |
   |---|---|---|
   | Instant lead response | 1 function action | `wfLeadCreated` — **already deployed** |
   | Partnership outreach cadence | 1 function action | `createUniversityFollowup` |
   | Partnership reply SLA | 1 function action | `createFollowUpTasks` (1-entry spec) |
   | Partner onboarding | 1 function action | `createFollowUpTasks` (3-entry spec) |
   | Stale lead rescue | 1 function action | `createFollowUpTasks` |
   | Agreement renewal guard | 1 function action | `createFollowUpTasks` |
   | Overdue task reminder | leave as-is | native Email Notification — not logic |

3. Verify each with one probe record, then delete the probe. **One rule at a time** — they are
   currently verified working, and swapping all seven blind would lose that.
4. Delete the now-orphaned Task actions (11 of them) and the field update.

**What deferring costs — measured, not theoretical.** The two paths diverge:

- A stage change made **in the UI** fires the workflow rule → cadence tasks are created.
- The same change made **by a Deluge function** does **not** fire the rule — verified live: after
  `logPartnershipContact` moved a probe university `Identified → Contacted`, exactly **one** task
  existed (the one the function itself raised), not four. Deluge `updateRecord` does not
  re-trigger workflows.

So behaviour depends on *how* a record was touched. The functions compensate by raising their own
tasks, so nothing is silently lost — but until D-1 lands, "what happens at a stage change" has two
answers. **This is the single strongest argument for doing the migration once the plan allows.**

---

## D-2 · Blueprint for the Student Case pipeline — NOT YET ATTEMPTED

File 01 §4 calls for upgrading the eleven stages to a **Blueprint**, which physically blocks
stage-skipping and forces required fields at each transition.

`GET /crm/v8/settings/blueprints` returns **200**, so the API is reachable on this plan; whether
*creating* one is gated has not been tested. Not attempted because `updateStudentCaseStage`
already enforces the important guarantees in code — stage validity, mandatory `Lost_Reason` on
Closed Lost, and an audit trail on every boundary.

**Switch-on:** attempt a Blueprint create; if permitted, it adds enforcement for changes made
directly in the UI, which the function cannot police.

---

## D-3 · Scheduled function execution — SCHEMA UNSOLVED, NOT PROVEN BLOCKED

`GET /crm/v8/settings/schedules` → **200**, `schedules_count: 20`, none used. So the feature is
present and there is capacity.

`POST` with a `{name, function, start_date_time, recurrence}` payload returns **500
INTERNAL_ERROR** — a schema problem, not a permission refusal. **Do not record this as a licence
limitation.** It is unsolved, not blocked.

Wanted for: nightly `archiveExpiredPartnership`, and a daily `partnershipKPIs` digest.

**Workaround in place:** both functions are REST-callable and idempotent, so any external
scheduler can drive them until this is solved.

---

## D-4 · Dashboard components — SCHEMA UNSOLVED, NOT BLOCKED

Dashboards themselves are **creatable on this plan** — `University Partnership KPIs`
(`1292318000000918001`) was created successfully via `POST /crm/v2.2/Analytics` with
`access_type: "public"`.

Adding **components** to it is unsolved: `POST /crm/v2.2/Analytics/<id>/Components` returns
`REQUEST_BODY_NOT_READABLE` for both `Components` and `components` wrapper keys. The component
schema is deep — `buckets`, `aggregates`, `component_props.visualization_props`, `item_props.grid`
— and was read from a live component but not yet reproduced.

**The dashboard is currently an empty shell.** That is recorded rather than hidden.

**Equivalent architecture already delivered:** `partnershipKPIs()` computes every figure the
dashboard would show, in one REST call, and any surface can consume it. The numbers cannot
disagree with each other because there is one source.

---

## D-5 · Cliq notifications — NO CONNECTED SERVER

File 01 §5.1 and File 02 §1 want `#leads` and `#wins` channel posts. No Zoho Cliq MCP server is
connected, so this was never attempted. Not a licence issue — a connectivity one.

---

## What is NOT deferred

For the avoidance of doubt, these work on the current free plan and are live:

- Standalone Deluge functions — create, deploy, REST-execute (12 deployed)
- Workflow rules with native actions (7 live)
- Email templates and notifications
- Custom fields, picklists, roles
- Reports API (`/crm/v8/Reports`) and Dashboards API (`/crm/v2.2/Analytics`) — read and create
- COQL, records CRUD, Notes
