# RichenQuest Titan — Production Handover

**Date:** 2026-07-24 · **Status:** Automation platform LIVE (Catalyst Development environment).
The speed-to-lead event pipeline is operational end-to-end and self-maintaining.

---

## 1. What is live right now

```
New Lead in Zoho CRM
   → actions/watch channel 1001  (Zoho pushes the event)
   → titan-webhook (Catalyst Advanced I/O, public HTTPS)
        · verifies HMAC token  · acks 200 fast  · dispatches async
   → Titan engine: dedupe → hydrate from CRM → loop-break → onLeadCreate
        · assigns per config  · posts to Cliq #leads
   ↺ titan-reconcile (Catalyst job, every 15 min via cron)
        · sweeps CRM for missed events (correctness authority)
        · renews the watch channel before it lapses
        · posts #ops-alerts on any gap
```

**Verified live (2026-07-24):**
- Webhook liveness: `POST {}` → 202; a signed synthetic event processed (idempotency written); a
  **forged-token event was rejected** (HMAC auth works in production).
- Data Store round-trip (write/read/delete) ok; env vars present; CRM auth ok.
- Event subscription active (channel 1001, `Leads.create`), read-back verified.
- Cron `titan_reconcile_15min` created; `runCron` submits jobs; reconcile has written checkpoints
  (`titan_meta` = 2), proving the job executes; `dead_letter` = 0.

## 2. Resource inventory (Catalyst project **Project-Rainfall**, `53691000000013024`, IN DC)

| Resource | Name / ID | Notes |
|---|---|---|
| Webhook function | `titan-webhook` (Advanced I/O) | URL: `…/server/titan-webhook/` |
| Reconcile function | `titan-reconcile` (Job) | target of the cron |
| Job Pool | `titanpool` (`53691000000041111`) | Functions, 256 MB — **console-created** |
| Cron | `titan_reconcile_15min` (`53691000000052003`) | Periodic, every 15 min, dynamic |
| Data Store tables | `titan_idempotency`, `titan_meta`, `titan_dead_letter` | columns `ikey` VARCHAR(255), `ival` TEXT |
| Watch channel | `1001` → speed-to-lead | expires ~24h, auto-renewed by the cron |

**Environment:** deployed to the Catalyst **Development** environment. Function env vars
(ZOHO creds, `TITAN_WEBHOOK_SECRET`, `TITAN_AUTOMATION_USER_ID`) are baked at deploy from local `.env`
via `build.mjs` (never in git). `.env` and `dist/` are gitignored.

## 3. Operate it

All from the repo root. Redeploy is reproducible:
```bash
node --env-file=.env functions/catalyst/build.mjs      # bake env + assemble bundles
bash functions/catalyst/redeploy.sh                     # link + install + deploy (functions only)
```
Local verification (no deploy):
```bash
node --test "functions/**/*.test.mjs"                   # 86 tests
node --env-file=.env functions/zoho/release-audit.mjs   # production CRM vs repo
node --env-file=.env functions/zoho/verify-crm.mjs      # AM0.4 acceptance evidence
node --env-file=.env functions/zoho/provision-notifications.mjs   # dry-run channel plan
```
Live diagnostics (gated — append `?key=<TITAN_WEBHOOK_SECRET from .env>`):
- `GET …/titan-webhook/health` — env/CRM/datastore health + counts
- `GET …/titan-webhook/verify-scheduling[?run=1]` — crons, counts, channel expiry, trigger a run
- `GET …/titan-webhook/setup-scheduling` — idempotent cron (re)creation

## 4. Monitoring

- **`#ops-alerts`** (Zoho Cliq): the reconcile cron posts here when it finds missed/failed records.
- **Reconciliation yield** (`titan_meta` checkpoints advancing + `reconcile.missed` metric) is the
  key SLI — sustained `missed > 0` is the empirical measure of Zoho's undocumented delivery loss and
  decides whether a native fallback is ever needed (arch review Phase 2).
- **`titan_dead_letter`** rows = events that failed all retries; should stay 0.
- **Reconcile heartbeat** (added 2026-07-25): `/verify-scheduling` → `reconcile_heartbeat.age_seconds`. The
  reconcile job writes this every run, so `age_seconds` should stay under ~2× the 15-min interval
  (~1800s). A stale/rising `age_seconds` or `null` means the self-healing layer has stopped **even though
  nothing has errored** — this is the silent-failure detector for the whole cron/renewal path. (It was
  added after a 2026-07-25 incident where channel 1001 sat un-renewed inside its renewal window overnight;
  the renewal window was also widened, `renewal_hours` 6→12.)
- Health endpoint counts for a quick liveness check.

## 5. Extending it (config-driven, no new infra)

- **Enable another automation:** implement its handler in `functions/titan/handlers/`, register it in
  `handlers/index.mjs`, set the subscription `enabled: true` in `config/automation-events.json`
  (currently `lead-updated`, `case-stage-change`, `case-created` are disabled pending handlers),
  then `provision-notifications.mjs --commit` + redeploy. CI (`validate-automation-events.mjs`)
  hard-fails an enabled subscription with no handler.
- **New tenant:** a second `config/tenant-*.json` + its own credentials; the engine, handlers, and
  provisioners are already tenant-agnostic (ADR-006, ecosystem strategy).

## 6. Security posture

HMAC-authenticated webhook (per-channel token, `functions/titan/webhook-auth.mjs`); ID-only payloads
always re-hydrated from CRM (no payload trust); constant-time compares; fail-closed idempotency;
loop-breaker; PII never logged; secrets in env only; zero runtime dependencies in the core; diagnostic
routes secret-gated. Full review: [architecture/titan-security-review.md](architecture/titan-security-review.md).

## 7. Honest residuals — what is NOT done

| Item | Status | Path |
|---|---|---|
| **Catalyst environment** | **Development**, not Production | Promote (see full runbook below). ⚠️ NOT just "deploy to prod": the reconcile cron is a **dynamic** SDK cron and Catalyst **cannot migrate dynamic crons to Production** — a naive promote leaves the reconcile job with no cron firing it. |
| Remaining 3 automations | handlers not built (disabled) | §5 — needs business rules + (for cases) WorkDrive/Mail |
| `onLeadCreate` Lead_Status value | writes `"Attempting Contact"` — verify it matches the CRM picklist | confirm against Leads status values before relying on it |
| AM0.4 console items | manual (proven un-automatable) | Lost Reason validation rule; 5 native workflows (superseded by this engine); 2FA — see `automation-specs/AM0.4-automation-proofs.md` |
| Team users | 1 of 7 in CRM | provide 6 emails → API provisioning |
| Cliq duplicate channels | 6 duplicates from INC-2 | manual delete (no Cliq delete API) |
| `getAllCron` listing | returns `[]` (SDK shape quirk) | cosmetic — the cron is confirmed **firing autonomously** (2026-07-25: the reconcile heartbeat advanced with no forced run) + via `runCron`/console; revisit the parse if a UI needs it |

## 8. First-week checklist

1. Create a real test Lead (Type = Student) → confirm within seconds: `#leads` alert, the lead
   updated by the automation, `titan_idempotency` grows, `dead_letter` stays 0. (This is AM0.4 A10.)
2. Watch `#ops-alerts`, the reconciliation `missed` count, and **`reconcile_heartbeat.age_seconds`**
   (should stay < ~1800s) for 7 days (roadmap Stage 1) to measure real delivery reliability before
   enabling more automations or promoting to Production.
3. Confirm the channel expiry keeps advancing (renewal working) — `verify-scheduling` `channels[].expiry`.

## 9. Production promotion runbook

Do this **before real lead traffic goes live**. Development runs the cron but with caveats (dynamic
crons don't migrate; a quiet stretch once left a channel un-renewed overnight — 2026-07-25 incident);
Production runs scheduled crons on a guaranteed schedule with no execution cap.

**Founder / console prerequisites** (I cannot do these — the SDK can neither create Job Pools nor
Data Store tables, and dynamic crons are un-migratable):
1. In the Catalyst **Production** environment, create the three Data Store tables — `titan_idempotency`,
   `titan_meta`, `titan_dead_letter` — each with two custom columns `ikey VARCHAR(512)` and `ival TEXT`
   (same schema as Development; see `functions/catalyst/datastore-adapter.mjs`).
2. In Production, create a **Functions** Job Pool named exactly **`titanpool`**.
3. In Production, create a **pre-defined cron** (console, *not* SDK/dynamic) — every 15 min → submit
   the `titan-reconcile` job to `titanpool`. (Pre-defined crons migrate/persist; the current dynamic
   one does not.)

**Then I execute:**
4. `node --env-file=.env functions/catalyst/build.mjs` + deploy the two functions to the **Production**
   environment (`catalyst deploy` targeting prod).
5. Repoint the watch channel: set `ZOHO_NOTIFY_URL` to the **prod** webhook URL and re-run
   `provision-notifications.mjs --commit` so channel 1001's `notify_url` points at production.
6. Verify: `/health` + `/verify-scheduling` on the prod URL (env ok, CRM ok, datastore round-trip ok,
   `reconcile_heartbeat.age_seconds` < ~1800 and advancing on its own, channel expiry advancing,
   `dead_letter` = 0); create one real test Lead end-to-end (AM0.4 A10); then decommission the Dev
   channel to avoid double-delivery.

Architecture references: [ADR-006](adr/ADR-006-event-driven-automation.md) ·
[titan-event-architecture-review.md](architecture/titan-event-architecture-review.md) ·
[titan-operations-and-roadmap.md](architecture/titan-operations-and-roadmap.md).
