# AM0.4 — Engineering Incident Register

Incidents raised during the 2026-07-23 AM0.4 automation session. Each records root
cause, impact, remediation, and the prevention now enforced in code.

---

## INC-1 — Stage picklist de-associated from the layout (production)

**Severity:** High (production CRM temporarily unusable for Student Cases)
**Detected:** during post-write verification, by a discrepancy between two read endpoints.

**Root cause.** A `PATCH /settings/fields/{id}` carrying `pick_list_values` is treated by Zoho as
the **complete layout-associated set**, not as a partial patch. Sending one option at a time (to
rename stages individually) caused each call to de-associate every option it omitted. This behaviour
is not stated in the API documentation and was assumed rather than verified.

**Impact.** After a sequence of single-option renames, the `Stage` field on Deals retained only
**1 of 9** layout-associated values. All 9 values still existed in the field's value pool, so no
historical data was lost, but the pipeline was unusable until repaired. No records existed at the
time (sample data had been purged), so no record data was affected.

**Detection.** `/settings/fields?module=Deals` reported 1 stage while
`/settings/fields/{id}/pick_list_values` reported 9. The audit treats any disagreement between these
two endpoints as a signal, since one reflects layout association and the other the raw pool.

**Remediation.** One atomic `PATCH` carrying all options (each by `id`, `actual_value` preserved)
restored full association; the pipeline was then completed to 11 stages. Verified by read-back.

**Prevention.**
- `functions/zoho/provision-pipeline.mjs` has **no single-option update path**. `planPipeline` always
  emits the complete set, and the contract is documented at the top of the file.
- Test `planPipeline sends the COMPLETE set (atomic) — never a partial list` fails if a future change
  emits a partial payload.
- `release-audit.mjs` compares the associated set against the raw pool and fails on any orphan.

---

## INC-2 — Duplicate Cliq channels created (production)

**Severity:** Medium (cosmetic clutter; requires manual cleanup, no data impact)
**Detected:** by comparing returned channel ids across runs.

**Root cause.** Cliq channel creation was assumed to be idempotent — that a duplicate name would be
rejected — and that assumption was written into the code's error handling *before being verified*.
It is false: `POST /channels` with an existing name succeeds and creates a second channel with the
same display name and a new id. Compounding this, Cliq exposes **no delete endpoint**
(`DELETE /channels/{id}` → `request_url_invalid`), so the mistake is not self-correctable.

**Impact.** 11 channels created where 5 were intended: `#leads` ×3, `#wins` ×2,
`#finance-approvals` ×2, `#ops-alerts` ×2, `#daily-updates` ×2. All are empty. Requires 6 manual
deletions in the Cliq UI (Channels → open duplicate → ⋮ → Delete Channel).

**Remediation.** Cannot be automated — no delete API exists. Manual cleanup is listed in HANDOFF.md.

**Prevention.**
- `services/cliq.mjs` `provisionChannels()` lists existing channels first and creates only what is
  missing; matching is case-insensitive and tolerates Cliq's returned `#` prefix.
- If the channel list **cannot be read**, it **aborts** rather than creating blind, because an
  unverified create is unrecoverable. Verified live: it correctly refuses while the token lacks
  `ZohoCliq.Channels.READ`.
- Three tests cover abort-on-unreadable, create-only-missing, and dry-run-creates-nothing.

---

## INC-3 — Release audit reported a false clean (tooling)

**Severity:** Medium (audit integrity — would have masked real defects)
**Detected:** by cross-checking an audit "pass" against a known-true fact.

**Root cause.** The first version of `release-audit.mjs` wrapped reads in a `safe()` helper that
degraded any API error to an empty result. The workflow-rules endpoint exists only on **API v8**,
while the client pinned **v7**, so the read failed and the audit reported "0 workflow rules — clean".
That was indistinguishable from a genuine clean, and it also hid the pre-existing "Big Deal Rule".

**Impact.** No production impact. One audit run reported a false clean for two checks.

**Remediation.** `safe()` replaced with `tryRead()`, which returns an explicit `unreadable` marker;
every check that cannot read now **fails** with `UNREADABLE <reason>` instead of passing. Added CRM
API-version support (`serviceBase(service, dc, version)` / `zohoRequest(..., {apiVersion})`) so v8
endpoints are addressable, plus a check asserting the pre-existing rule is intact.

**Prevention.** Two tests pin the version behaviour. Principle now enforced in the audit: *a check
that cannot read must never report a pass.*

---

## Change record — intentional destructive action

**Zoho sample data purged.** 10 sample Deals and 10 sample Leads (Zoho's stock demo records —
"Maclead (Sample)", "Truhlar And Truhlar Attys", etc.) were deleted to allow pipeline stage surgery,
which Zoho blocks while records reference the stages. Records were matched against an explicit
allow-list of known sample names, never a blanket delete. **Rollback:** Zoho's Recycle Bin retains
deleted records (default 60 days) — restore via Setup → Data Administration → Recycle Bin.
