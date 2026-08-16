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
8. **Deploy = create-if-absent, then PUT the script.** Creating twice silently produces
   `<name>1`. Use `scripts/deploy-function.sh <Name> <param:type>…`, which encodes two traps:
   **`api_name` is ignored on create and rejected as `DUPLICATE_DATA` on update**, so it is never
   sent; and **a freshly created function answers every execute call with `NOT_ACTIVE`** until
   `rest_api: [{type: oauth, active: true}]` is PUT. Creating is not the same as exposing.
   See File 21 §6.

## Verifying a change

```
POST https://crm.zoho.in/crm/v7/functions/<lowercased_name>/actions/execute?auth_type=oauth
```

Arguments are query parameters named exactly as in the Deluge signature. Then confirm the effect
with COQL — the function's own return value is a claim, not proof.
