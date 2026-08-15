# File 31 — Backup and disaster recovery

**Closes File 28 R-1, the platform's highest-priority risk.** Before this, business data was
recoverable from nowhere.

**Status 2026-08-15: automated CRM backup built, run, and verified against real data.**
Restore is documented but **not yet rehearsed** — that distinction is kept explicit throughout.

---

## 1. What was objectively verified

| Capability | Result |
|---|---|
| `POST /crm/bulk/v8/read` | **201** — job accepted |
| `GET /crm/bulk/v8/read/<id>` | **200** — `COMPLETED`, with `count` and `download_url` |
| `GET .../result` | **200** — `application/zip` containing CSV |
| Page size | **200,000 records per job** — ample headroom |
| Field discovery | `GET /crm/v8/settings/fields?module=X` |
| Attachments per record | `GET /crm/v8/<Module>/<id>/Attachments` → **204** (none exist yet) |
| `/crm/v8/settings/backup`, `/data_backup` | **not valid endpoints** — Zoho's console Data Backup was **not** located via API |

**Bulk Read is the export mechanism.** Zoho's console "Data Backup" feature may also exist in the
UI; it was not found through the API and is therefore **not** part of this procedure. Nothing here
depends on an unverified capability.

Three field types are rejected by Bulk Read even though `settings/fields` returns them —
`Address`, `Coordinates`, `nearby_distance__s` and their Mailing/Billing/Shipping variants. The
script **drops whatever field the API names and retries**, rather than carrying a hard-coded
exclusion list that would silently go stale as the schema changes. Dropped fields are printed on
every run.

---

## 2. CRM backup — BUILT

```bash
./scripts/backup-crm.sh                 # all 6 modules
./scripts/backup-crm.sh Leads Deals     # selected
./scripts/verify-backup.sh              # verify the most recent
```

**First real run, 2026-08-15:**

```
Leads      4 rows · 68 columns      Deals   0 rows · 40 columns
Contacts   0 rows · 57 columns      Tasks   0 rows · 21 columns
Accounts  17 rows · 56 columns      Notes   0 rows · 11 columns
✓ every archive opens · row counts reconcile with manifest · Id column present
```

Output: `backups/<UTC date>/<Module>.zip` plus `manifest.json` recording module, record count,
byte size and job id.

**Fields are discovered per run**, so the backup captures whatever the schema is that day. A
curated field list would quietly stop backing up new fields — the failure you only discover when
restoring.

### ⚠ Backups contain student PII and are git-ignored

`backups/` is in `.gitignore`. **Never commit them.** Git history is permanent, widely cloned, and
cannot be selectively redacted; a single commit of student emails and phone numbers is unwindable.
They belong in encrypted off-machine storage (§6).

## 3. Attachments and documents — procedure, not yet needed

No attachments exist in CRM today (`/Attachments` → `204`), so there is nothing to back up. When
documents start being attached:

1. For each record: `GET /crm/v8/<Module>/<id>/Attachments` → list of `{id, File_Name}`.
2. `GET /crm/v8/<Module>/<id>/Attachments/<attachment_id>` → bytes.
3. Store under `backups/<date>/attachments/<Module>/<record_id>/<File_Name>`.

**Not implemented, deliberately** — automating retrieval of zero files would be untested code
pretending to be a safeguard.

## 4. WorkDrive — strategy, dormant

WorkDrive is provisioned and its REST API verified (File 25 §G-3), but **no RichenQuest student
files are stored there yet**.

When they are: enumerate via `GET /api/v1/privatespace/<id>/files?page[offset]=&page[limit]=`, then
download each. Note WorkDrive is a **different origin** (`workdrive.zoho.in`), so it needs its own
session or OAuth scope — the CRM backup script cannot simply be pointed at it.

**Zoho retains its own copies with versioning.** The genuine risk is account loss, not file
corruption, so this ranks below CRM data and below getting the CRM backup off this machine.

## 5. Books — strategy, blocked

**Books is in `test` mode.** Every figure in it is fictional (File 16 §2), so there is nothing
worth backing up and backing it up would create a file that looks like financial records and is not.

When Books goes live: MCP tools already exist (`list_invoices`, `list_customer_payments`,
`list_contacts`, `list_expenses`) and are sufficient for a JSON export on the same daily cadence.

**Financial records carry statutory retention obligations in India** that exceed anything in this
document. Do not design Books retention without accounting advice — that is a founder-owned
decision, not an engineering one.

---

## 6. Retention policy

| Class | Keep | Where | Rationale |
|---|---|---|---|
| Daily CRM export | 30 days | encrypted off-machine | recovery from recent accidental damage |
| Weekly (Monday) | 12 weeks | encrypted off-machine | recovery from damage noticed late |
| Monthly (1st) | 24 months | encrypted, access-restricted | audit and dispute resolution |
| Pre-migration snapshot | permanent | encrypted, offline | the only copy of the pre-migration world |
| Books exports | **per statutory requirement** | encrypted | see §5 |

**Two rules that matter more than the schedule:**

1. **A backup on the same laptop as the operator is not a backup.** It survives deletion in Zoho
   but not theft, loss or disk failure. The current backup is **on this machine only** — the
   verification script says so explicitly and will keep saying so.
2. **Deletion is part of retention.** Holding student PII beyond need is a DPDP liability, not
   caution. There is still **no data retention policy for CRM itself** (File 28 R-7) — this file
   covers *backups*, not the live records.

---

## 7. Restore procedure

**Not yet rehearsed. Read this before you need it, not during.**

### 7.1 Partial restore — some records lost

1. `./scripts/verify-backup.sh <date>` — never restore from an unverified archive.
2. Unzip the module CSV.
3. Identify the missing ids: compare backup `Id` column against a live COQL query.
4. Re-import **only** those rows via CRM Import (Setup → Data Administration → Import), mapping
   `Id` so records keep their identity.
5. Verify: COQL count matches pre-loss count; spot-check five records field by field.
6. `./scripts/platform-health.sh` — confirm 13/13 still passes.

**Ids are the whole game.** Every `[audit]` Note, every lookup and every function reference is keyed
by record id. Restoring rows with *new* ids produces data that looks right and has lost every
relationship — worse than the loss, because it hides it.

### 7.2 Total loss — org gone

1. Provision a new CRM org.
2. Recreate schema **exactly**: modules, then custom fields with **identical `api_name`s**, then
   picklist values. Sources: File 24 (entities), File 27 §5 (modules), ADR-010 if approved.
   A mismatched `api_name` breaks every function that references it.
3. Deploy functions from `functions/src/*.dg` (RB-01). Function ids will differ; **record the new
   ids** — File 21 §6 becomes stale immediately.
4. Recreate the 8 workflow rules (File 27 §3) — **excluding** `Big Deal Rule`, which is a Zoho
   factory artifact, not ours.
5. Import data in dependency order: **Contacts → Accounts → Leads → Deals → Tasks → Notes.**
   Deals reference Contacts; Notes and Tasks reference everything. Importing out of order orphans
   the lookups.
6. Recreate the webform; **keys rotate**, so run `node scripts/import-webform.mjs`, rebuild and
   redeploy the website.
7. `./scripts/platform-health.sh` — require `PASS 13 FAIL 0`.
8. Re-verify consent fields and re-point any watch subscriptions.

**Realistic recovery time: one to two days**, dominated by schema recreation and import validation,
not by the restore itself.

### 7.3 Verification checklist

`./scripts/verify-backup.sh` automates the first three. The last two are **deliberately unchecked**
and will stay that way until they are genuinely done:

```
[x] every archive opens and parses as CSV
[x] row counts reconcile with the manifest
[x] every file carries an Id column
[ ] OFF-MACHINE COPY
[ ] restore rehearsed into a sandbox
```

---

## 8. Honest gaps

| Gap | Why it matters | Owner |
|---|---|---|
| **Backups are on one laptop** | Protects against Zoho-side loss only. Does not survive theft, loss or disk failure | founder — choose encrypted storage |
| **No restore has ever been rehearsed** | An unrehearsed restore is a plan, not a capability | platform, once a sandbox exists |
| **No sandbox** (File 28 R-5) | Nowhere to rehearse without touching production | platform — availability untested |
| **Backup is not scheduled** | Requires someone to run it. It is only as current as the last manual run | platform — blocked on File 22 §D-3 |
| **No CRM retention policy** | Distinct from backup retention. DPDP expects one | founder + platform |

**The single most valuable next action is not more engineering — it is copying `backups/` somewhere
off this machine.** Everything else in this file is already better than it was this morning.
