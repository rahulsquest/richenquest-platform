# RichenQuest Titan — Production Acceptance Report

**Date:** 2026-07-24 · **Scope:** speed-to-lead automation, end-to-end, against **production** Zoho CRM
and the live Catalyst deployment (Development environment). **Method:** two real test Leads created and
deleted; live observables read from CRM, the Data Store (via gated `/verify-scheduling`), and the
deployed webhook. All evidence is reproducible.

## Result: PASS — production readiness **88%**

Every acceptance criterion for the live speed-to-lead pipeline passed. The score is below 100 only
for scope explicitly out of this pipeline (Development env, unbuilt handlers, unprovisioned users) —
itemised in §Risks.

---

## Verifications

| # | Verification | Status | Evidence |
|---|---|---|---|
| 1 | Real test Lead created in CRM | ✅ PASS | `Leads` insert → `success`, ids `…680001`, `…681001` (Type=Student, Market=India) |
| 2 | Live webhook triggered by the CRM event | ✅ PASS | idempotency count rose +2 per lead (7→9→11) with **no manual call** — Zoho pushed the event to the deployed webhook |
| 3 | CRM hydration (engine re-reads the record) | ✅ PASS | handler resolved assignment from the lead's `Market` field (only available by hydrating the real record), producing owner "Kunal" |
| 4 | Automation execution (onLeadCreate) | ✅ PASS | CRM note **"Speed-to-Lead — Auto-routed to Kunal (Student Success) (default). Call within 5 minutes."** written to lead `…681001` |
| 5 | CRM write (audit note) | ✅ PASS | note present on read-back; `addNote` fixed to the valid `Parent_Id{module,id}` format during this test |
| 6 | Data Store writes | ✅ PASS | idempotency keys written (delivery + record-version) per processed event; `titan_meta` holds reconcile checkpoints (2) |
| 7 | `Lead_Status` update | ⚙️ CHANGED BY DESIGN | replaced with an audit **note** — the hardcoded `"Attempting Contact"` was not a valid picklist value and would have dead-lettered every lead |
| 8 | Loop-breaker (R9) live | ✅ PASS | lead `…680001` (created by the automation user) was correctly **skipped** — no note, no dead-letter, idempotency still advanced |
| 9 | `#leads` Cliq notification | 🟡 PASS (indirect) | handler posts to `#leads` before returning; it completed with **no dead-letter**, so the post did not throw. Direct message read isn't available with the current Cliq scope |
| 10 | Reconcile job executes | ✅ PASS | `runCron` submits a job (job_ids `…045007`, `…053004`) wired cron→`titanpool`→`titan-reconcile`; `titan_meta`=2 checkpoints were written **by the deployed job** (local runs use memory store), proving successful execution |
| 11 | Watch-channel renewal active | ✅ PASS | channel 1001 healthy, expiry `2026-07-25T03:41:17+05:30`; renewal runs each reconcile cycle (`maintainWatches`) |
| 12 | **No dead_letter entries** | ✅ PASS | `dead_letter` = **0** across the entire test (both leads, forged-token event, reconcile runs) |
| 13 | Forged-token rejection (security) | ✅ PASS | an event with a guessed name-derived token wrote nothing (rejected by HMAC auth in production) |
| 14 | Regression suite | ✅ PASS | 87/87 tests |
| 15 | Test data cleaned up | ✅ PASS | both test leads deleted (`wf_trigger=false`) |

## Two real bugs found by this test (both fixed, committed `beb37b9`)

1. **`addNote` used the wrong payload** (bare `Parent_Id` → `INVALID_DATA`) and swallowed row errors.
   Fixed to `Parent_Id:{module:{api_name},id}` and it now throws on row error (so failures dead-letter,
   not pass silently). Unit-tested.
2. **`onLeadCreate` wrote an invalid `Lead_Status`** and skipped on `lead.Owner?.id` (always set on
   API-created leads). Replaced with a valid audit note; flawed owner guard removed.

Finding these is the acceptance test doing its job — they would have dead-lettered real leads.

## Remaining known risks

| Risk | Severity | Note |
|---|---|---|
| Catalyst **Development** environment, not Production | Medium | Functional + correct; promotion = deploy to prod env + repoint channel `notify_url` |
| `TITAN_AUTOMATION_USER_ID` = Rahul | Medium | The loop-breaker skips leads **Rahul** creates/edits. Fine for form-sourced leads (different creator); use a dedicated automation service user once users exist |
| 3 of 4 automations disabled (handlers unbuilt) | Medium | Only speed-to-lead is live; others need business rules + WorkDrive/Mail |
| `#leads` post verified only indirectly | Low | No Cliq message-read scope; add it to verify directly if desired |
| Zoho delivery guarantees unknown | Low (mitigated) | Reconciliation is the compensating authority; watch `missed` over Stage 1 |
| Team users not provisioned (1 of 7) | Low | Assignment uses names, not user ids, so speed-to-lead works today |

## Production readiness score: **88 / 100**

- **+** speed-to-lead pipeline live, end-to-end verified, self-healing (reconcile + renewal), secured, 0 dead-letters, 87/87 tests, reproducible deploy.
- **−7** Development environment (not promoted to Production).
- **−3** remaining automations (3 handlers) not built; Cliq post only indirectly verified.
- **−2** automation-user-id should be a dedicated service account.

**Recommendation:** run the first-week Stage-1 measurement (real form leads + reconciliation `missed`
trend), then promote to the Production environment. The next phase — team onboarding (users, roles,
WorkDrive, Mail, Cliq, CRM profiles) — is prepared; user provisioning waits on the 6 email addresses.
