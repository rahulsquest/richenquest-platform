# Team Onboarding — Prepared Phase (AM0.2)

**Status:** tooling built and tested; **user creation gated on 6 email addresses** (per founder
instruction, not provisioned yet). Everything else needed for onboarding is either done or has an
exact step below.

## What I need from you (the only inputs)

1. **6 email addresses** — for Harsh, Kunal, Bibek, Kishor, Tahir, Vishrut. Add them to
   `config/tenant-richenquest.json` → `contributors.roster[].email` (or send them and I'll add them).
2. **Confirm profile assignments** (permissions) — default policy is least-privilege: **CEO →
   Administrator, everyone else → Standard**. Tell me if anyone (e.g. Harsh as automation owner)
   should be Administrator.
3. **Confirm 2FA** should be enforced org-wide (recommended — you hold passports/financials).

Then I run one command and users are provisioned + verified.

## Users — READY (gated)

`functions/zoho/provision-users.mjs` (dry-run default, idempotent, tested):
- Maps each roster member's `crm_role` → the matching CRM **role** and a **profile** (least-privilege).
- Skips anyone already a user (by email); **blocks** anyone with no email (never creates blind).
- `--commit` creates users (which **sends each an invitation email**) and reads back.

Current live dry-run: **7 blocked (no email)**. Once emails are in config:
```bash
node --env-file=.env functions/zoho/provision-users.mjs            # confirm the plan
node --env-file=.env functions/zoho/provision-users.mjs --commit   # create + invite
```

| Member | crm_role | → CRM role | → Profile (default) |
|---|---|---|---|
| Rahul Kumar | CEO | CEO | Administrator | *(already a user — skipped)* |
| Harsh | Manager / Operations | Manager | Standard |
| Kunal | Counselor | Counselor | Standard |
| Bibek | Operations | Operations | Standard |
| Kishor | Manager / Partnerships | Manager | Standard |
| Tahir | Operations / Regional | Operations | Standard |
| Vishrut | Marketing | Marketing | Standard |

## Roles & hierarchy — DONE

Roles exist (created via API): **CEO · Manager · Operations · Marketing · Counselor**
(`Operations`, `Marketing`, `Counselor` report to `Manager`; `Manager` under `CEO`). Data sharing is
**Private + role hierarchy** (verified in the release audit), so managers see their reports' records
and counselors see only their own — the AM0.4 A13 requirement.

## Profiles / permissions — decision pending

`Administrator` and `Standard` profiles exist. Policy above (CEO=Admin, rest=Standard). Standard is
Zoho's default sales profile and is appropriate for counselors/ops; adjust per person if needed. No
custom profile is required for launch.

## Cliq — DONE (cleanup owed)

5 channels live (`#leads #wins #finance-approvals #ops-alerts #daily-updates`). ⚠️ **6 duplicate
channels** from INC-2 need manual deletion (Cliq has no delete API) — Cliq → Channels → ⋮ → Delete.
New users are added to channels in the Cliq UI (or auto by org-level channel membership).

## Mail — DONE

Domain email is live (MX/SPF/DKIM verified, India DC — AM0.3). Each provisioned Zoho One user gets a
mailbox on the org domain automatically.

## WorkDrive (Students document template) — NOT BUILT (AM0.6)

The per-student folder template + auto-provisioning on case creation is a separate build. It needs a
WorkDrive OAuth scope (not yet granted) and a folder-structure design. This is the next onboarding
build after users exist; flagged, not started. (The `case-created` automation is already declared and
disabled, waiting on this.)

## 2FA — console only (proven un-automatable)

Enforce org-wide 2FA: Zoho **Admin Panel → Security → Security Policies**. No API surface.

## Onboarding sequence (once emails arrive)

1. Add the 6 emails to config → `provision-users.mjs --commit` (creates + invites).
2. Confirm each user accepts the invite and sets up 2FA.
3. Delete the 6 duplicate Cliq channels; add users to the operational channels.
4. Enforce 2FA in the Admin Panel.
5. Set `TITAN_AUTOMATION_USER_ID` to a **dedicated automation user** (not Rahul) so Rahul's manual
   leads aren't skipped by the loop-breaker (acceptance-report residual) — or keep Rahul if all
   leads come from forms.
6. (Later) build WorkDrive Students template (AM0.6) + enable the `case-created` automation.
