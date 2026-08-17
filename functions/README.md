# CRM Functions — the backend layer

**Reference: File 21.** That document has the API, the return shapes, the verification evidence
and the Deluge gotchas. This file is just the rules for working in here.

`src/*.dg` is the **source of truth**. What runs in Zoho CRM is deployed from these files. If CRM
and this directory disagree, this directory is right and CRM is stale.

## What changed from the original scaffold

This directory was scaffolded for **Catalyst** serverless functions. Catalyst hosting was
evaluated and rejected (ADR-006, ADR-007), and the backend need is met instead by **Zoho CRM
Functions** — Deluge, deployed into CRM, exposed over REST. Same outcome, no separate runtime to
operate, and ADR-003 stays intact: still no server, no database, no custom infrastructure.

## Current functions

| File | Purpose |
|---|---|
| `createFollowUpTasks.dg` | The task-creation primitive. Everything else that needs a task calls this |
| `generateAuditLog.dg` | Audit entry as a Note on the record |
| `updateLeadLifecycle.dg` | Validated, audited single entry point for `Lead_Status` |
| `assignCounselor.dg` | Least-loaded active Counselor; refuses when there are none |
| `createUniversityFollowup.dg` | Partnership day 4/9/16 cadence, on demand |
| `archiveExpiredPartnership.dg` | Scheduled sweep: lapsed agreements → Dormant |
| `visaOpsPlan.dg` | Phase 9 backward planner. Course start − country lead time → risk flag + next deadline. Task **only on a risk transition** |
| `studentActionPlan.dg` | The 60-second onboarding. Shortlist + reasons + timeline + risks + parent points. **Only reads Confidence High/Medium records** |
| `opsWatch.dg` | Phase 10.7 daily sweep. Six watches, one digest, **silent when clear** |
| `visaOpsSweep.dg` | Re-plans every open case nightly at 05:30. **Must run before `opsWatch`** — it writes the field the watch reads |
| **`student360.dg`** | **The operating console.** One call → header, risks, ONE next action, applications, money, attribution. **Read-only** |
| **`normalizeInput.dg`** | **The single normalisation layer.** Every integration writing a picklist goes through it — Zoho does not validate |
| `parseInquiry.dg` | WhatsApp inquiry → Lead + qualify + assign + tasks. **Newline-independent by design** |
| `readinessSweep.dg` | University Readiness Scoreboard. **Computed from field completeness, never set by hand.** Rewrites status every run |
| `leadToPlan.dg` | Lead id → full action plan. Translates level/budget/intake and reports every assumption it made |
| `qualityGate.dg` | Department 8. Compliance / claims / source checks on any customer-facing draft. **PASS is not approval** |

## Rules for adding one

1. **Compose, don't restate.** If a function needs a task, call `createFollowUpTasks`. The reason
   this layer exists is that the same logic was previously spread across 11 workflow actions.
2. **Return JSON, always.** `{"ok":bool, …}` or a result map. Callers should never have to parse
   prose. Collect per-item errors rather than throwing away good work.
3. **Refuse rather than guess.** `assignCounselor` returns `no active counselors` instead of
   assigning to an admin. A wrong write is worse than no write.
4. **Audit anything that mutates.** Call `generateAuditLog` on every state change.
5. **Doc comment goes *inside* the braces.** Deluge will not parse a block comment before the
   signature.
6. **Never commit a `zapikey` URL.** Zoho generates one per function that authenticates by key in
   the query string. It grants CRM write access. OAuth only in this repo.
7. **Verify against live records, then delete the probes.** Compiling is not evidence. Every
   function in the table above was executed and its effect confirmed by COQL.
8. **Create with a STUB, then PUT the real script.** Posting the real script on create returns
   `500 INTERNAL_ERROR` — the create path does not compile reliably. **The PUT is a proper syntax
   checker and will reject broken Deluge**, which is how a `days_left` typed TEXT by its `""`
   initialiser was caught before it ever ran. `deploy-function.sh` does this automatically.
9. **Deluge infers a variable's type from its FIRST assignment.** Initialising a number to `""` makes
   it TEXT and every later comparison fails to compile.
10. **Deploy = create-if-absent, then PUT the script.** Creating twice silently produces
   `<name>1`. Use `scripts/deploy-function.sh <Name> <param:type>…`, which encodes two traps:
   **`api_name` is ignored on create and rejected as `DUPLICATE_DATA` on update**, so it is never
   sent; and **a freshly created function answers every execute call with `NOT_ACTIVE`** until
   `rest_api: [{type: oauth, active: true}]` is PUT. Creating is not the same as exposing.
   See File 21 §6.

11. **Compute the rule ONCE, in the lowest layer, and derive every surface from it.**
   `student360` v1 and `caseState` each decided independently what counted as a risk. Two copies
   of the same rules drift the first time one is edited and the other is not — the same failure
   `normalizeInput` exists to prevent for picklists. `student360` v2 asks `caseState` and renders
   the answer; `buildWorkQueue` does the same. One file to change when a rule changes.
12. **A priority formula that only multiplies urgency ranks slow-to-fix blockers last.**
   The first queue run put `NO_PASSPORT` — which blocks everything — in LOW, because its deadline
   was five months out. Urgency measures how soon the deadline is; it does not measure how long
   the fix takes. `caseState` floors severity-1 blockers at 15 so they surface while there is
   still time to clear them.

13. **The session-REST channel dies the moment the front Chrome tab leaves `crm.zoho.in`.**
   Publishing an artifact navigates that tab, so a deploy or cleanup running afterwards
   silently POSTs to claude.ai and "succeeds" against the wrong host. Cleanup was left
   half-done exactly once this way. Switch the tab back before trusting any result:

   ```
   osascript -e 'tell application "Google Chrome"
     repeat with w from 1 to (count of windows)
       repeat with t from 1 to (count of tabs of window w)
         if (URL of tab t of window w) contains "crm.zoho.in" then
           set active tab index of window w to t
           set index of window w to 1
           return "SWITCHED"
         end if
       end repeat
     end repeat
     return "NONE"
   end tell'
   ```

14. **`GET` cannot carry a body.** `zpost.sh` always sends one, so settings reads fail with
   a `fetch` TypeError that looks like an auth problem. Use `zget.sh`.

## Verifying a change

```
POST https://crm.zoho.in/crm/v7/functions/<lowercased_name>/actions/execute?auth_type=oauth
```

Arguments are query parameters named exactly as in the Deluge signature. Then confirm the effect
with COQL — the function's own return value is a claim, not proof.
