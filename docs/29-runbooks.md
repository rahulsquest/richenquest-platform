# File 29 — Operational runbooks

Procedures for running the platform. Each is written to be followed by someone who has **not** built
it. Where a step cannot currently be automated, that is stated rather than glossed.

**Before anything:** `./scripts/platform-health.sh --no-regression` — know the state first.

---

## RB-01 · Deploy a function change

**Trigger** A `.dg` file changed in `functions/src/`.

1. Edit the file in the repo. **The repo is the source of truth**; never edit in the Zoho console —
   the next deploy overwrites it and the change is lost with no trace.
2. Deploy: create-if-absent, then PUT the script.
   ```
   POST /crm/v2/settings/functions            # only if it does not exist
   PUT  /crm/v2/settings/functions/<id>       # script + rest_api
   ```
   **Creating twice silently produces `<name>1`.** Always look up the existing id first.
3. Deluge compiles server-side on save — a rejected PUT means broken code never deployed.
4. Run `./scripts/platform-health.sh`. **Require `PASS 13 FAIL 0 ok=True` and `leaked: []`.**
5. Commit. The commit message must say what changed and how it was verified.

**Rollback** `git checkout <previous> -- functions/src/<fn>.dg`, redeploy, re-run the suite.
Functions are stateless — rollback is immediate and safe. **Data written by a bad version is not
rolled back**; check the `[audit]` notes for what it did.

---

## RB-02 · Onboard a new employee

1. Zoho CRM → Setup → Users → add user, assign **Role** and **Profile**.
   Roles: `CEO → Manager → {Operations, Marketing, Counselor}`, `CEO → Finance`.
2. Confirm: `GET /crm/v8/users?type=ActiveUsers` shows the user with the expected role.
3. Give access to this repo (read at minimum — it is the operating manual).
4. Point them at File 27 (what exists), File 28 (what is risky), this file (how to operate).

**Note:** adding users **increases the API quota** (credits scale with licences) — the one lever
that raises the ADR-009 ceiling.

## RB-03 · Onboard a counselor (first one is special)

Steps as RB-02 with role **Counselor**, then:

4. **Re-verify `assignCounselor`.** Its happy path has *never executed* (File 28 R-8) — until a
   counselor exists it only ever returned `no active counselors`.
   ```
   POST /crm/v7/functions/assigncounselor/actions/execute?auth_type=oauth&lead_id=<probe lead id>
   ```
   Expect `{"ok":true,"assigned_to":"…","load":n}`. **Delete the probe lead afterwards.**
5. Extend `verifyPlatform` with an assignment assertion, redeploy, re-run.

---

## RB-04 · Add a university

Preferred: `POST /crm/v8/Accounts` with `Account_Name`, `Partnership_Stage: "Identified"`,
`Partnership_Type`, and `International_Office_Email` **if known**.

**The email matters more than the record.** 16 of 17 universities have none, and outreach
automation has nothing to send to without it — `partnershipKPIs()` reports this as
`uncontactable`.

Then let automation do the rest: log the first outbound contact through
`logPartnershipContact(...,"email","outbound",...)`, which advances `Identified → Contacted` and
starts the day 4/9/16 cadence. **Do not set `Partnership_Stage` by hand** — it skips the audit
entry and, if set in the UI, fires the workflow rule as well as any function you later run.

## RB-05 · Add a new destination country

1. Add the country to the `Destination_Country` picklist on `Deals`
   (`POST /crm/v8/settings/fields?module=Deals`, or Setup UI).
2. Add universities per RB-04.
3. Knowledge: add visa rules and requirements as `Solutions` articles (unused module, File 25 §G-6).
4. **Check `claims.json`** — if marketing will name the country, the claim must be verifiable
   first. `claims-guard` fails the website build otherwise, by design.

---

## RB-06 · Renew watch subscriptions ⚠ **silent-failure risk**

`channel_expiry` is mandatory and finite. **On expiry, events simply stop. Nothing errors.**

1. `./scripts/platform-health.sh --no-regression` → `WATCH SUBSCRIPTIONS`.
2. For any channel near expiry:
   ```
   POST /crm/v8/actions/watch
   {"watch":[{"channel_id":"<same id>","events":[…],
              "channel_expiry":"<new ISO8601>","notify_url":"<same>"}]}
   ```
3. Re-run the health check and confirm the new expiry.

**Frequency:** at least weekly while any consumer exists. This is manual until the schedules
create-schema is solved (File 22 §D-3). **Today there are no subscriptions and no consumers**, so
nothing is at risk yet — the procedure exists so the first consumer is not the one that discovers
this.

## RB-07 · Quota exhaustion

**Detect** `GET /crm/v8/__limits?feature=API`, or the health report's OK/WARN/CRITICAL.

| Level | Action |
|---|---|
| < 50% | normal |
| 50–80% | **ADR-009 trigger.** Read model stops being a design note and becomes work |
| > 80% | stop non-essential automation; skip `--no-regression` runs; identify the consumer |
| 100% | writes fail. Wait for the rolling window, or add user licences (credits scale with licences) |

**Most likely cause at scale:** a client reading CRM directly that should read a read model, or a
Deluge function paging where it should query (File 28 D-5).

---

## RB-08 · Incident response

1. **Assess** — `./scripts/platform-health.sh`. It reports quota, every function, every rule,
   watches, and runs the regression suite.
2. **Classify**
   - regression `FAIL` → a guard broke. Roll back the function (RB-01).
   - quota `CRITICAL` → RB-07.
   - watches missing/expired → RB-06.
   - unexpected function in the list → an unowned deploy. Investigate before deleting.
3. **Contain** — deactivate the offending workflow rule (`status.active: false`) or roll back the
   function. Do **not** edit records to "fix" symptoms; that destroys the audit trail.
4. **Diagnose** — read the `[audit]` Notes on affected records. Every mutation writes actor,
   from→to and reason.
5. **Recover** — redeploy the known-good `.dg` from git and re-run the suite.
6. **Record** — what broke, how it was detected, what would have detected it sooner. If detection
   was a human noticing, that is the actual finding.

## RB-09 · Disaster recovery ⚠ **incomplete — read this before you need it**

**Recoverable today:** all business logic (`functions/src/*.dg`), all configuration-as-code, all
documentation — from git.

**NOT recoverable today: the data.** There is no backup, export or restore procedure
(File 28 R-1). If records are mass-deleted or the account is lost, the data is gone.

**Interim manual export** — run and store the output outside Zoho:
```sql
select id, Last_Name, Email, Phone, Lead_Status, Created_Time from Leads where Last_Name is not null
select id, Deal_Name, Stage, Student_Journey_Stage, Contact_Name from Deals where Deal_Name is not null
select id, Account_Name, Partnership_Stage, Agreement_Status, Agreement_Expires_On from Accounts where Account_Name is not null
select id, Last_Name, Email, Phone from Contacts where Last_Name is not null
```
Notes carry the audit trail and must be exported per parent record.

**To close this properly:** verify Zoho's own Data Backup on this plan, or schedule the COQL export
to versioned storage. Until one exists, **rehearsed recovery is not possible** — and an unrehearsed
restore is not a recovery plan.

## RB-10 · Credential rotation

- **Zoho webform keys** (`xnQsjsdp`, `xmIwtLD`) rotate on **every** webform edit and the old ones
  stop working immediately. After any edit: re-run `node scripts/import-webform.mjs <pasted.html>`,
  rebuild, redeploy the site.
- **Function `zapikey` URLs** — inactive by design and unrecorded. If one is ever activated,
  treat it as a live credential: never commit it, rotate by regenerating in the console.
- **Cloudflare / GitHub tokens** — repo secrets; rotate in the respective consoles.

There is **no long-lived platform credential in this repo**, which is why rotation is short.

## RB-11 · CRM migration / org change

Out of scope to execute, but the constraints must be known before anyone plans it:

- **Record ids are org-specific.** Every id in File 21 §6, File 25 and every `[audit]` Note becomes
  meaningless in a new org.
- **Functions are portable** (`functions/src/*.dg`); **function ids are not**.
- **Webform keys change**, so the website must be rebuilt and redeployed.
- **Custom field `api_name`s must be recreated identically** or every function breaks.
- Migration order: modules and fields → picklists → functions → workflow rules → data → re-run
  `verifyPlatform` → re-point the website.

Treat as a project, not a task.
