# File 16 — Zoho Product Audit (every product, verified via API)

**Audited:** 2026-08-13 against the live tenancy. Supersedes the Zoho rows in File 13 and extends
File 14 (CRM-only) to every product with an API surface available.

> **Important:** the products do **not** share one org ID. CRM, Books and Desk each carry their own.
> Any integration must use the right identifier per product.

| Product | Identifier | State |
|---|---|---|
| **CRM** | zgid `60074018310` | **Configured and in use.** See File 14 |
| **Books** | org `60077090038` | **TEST MODE** — not production |
| **Desk** | org `60077092565`, portal `richenquestpvtltd` | **Factory default** |
| **Projects** | — | **No portal exists** |
| **Forms** | — | No portal; no API (File 15) |
| **Bookings** | — | No portal — `richenquest.zohobookings.in` and `.com` both 404 |

## 1. CRM — configured, in use

Covered in File 14. Since that audit, **three consent fields were created via API** (below).
Org: RICHENQUEST PRIVATE LIMITED · INR · Asia/Kolkata · Zoho One Enterprise **trial** (`paid: false`).

## 2. Books — TEST MODE, not production

```
name                      RICHENQUEST PVT. LTD.
organization_id           60077090038
org_type / mode           "test" / "test"
plan_name                 PREMIUM TRIAL
is_quick_setup_completed  false
is_registered_for_gst     false
is_registered_for_tax     false
fiscal_year_start_month   3   (April — correct for India)
currency                  INR, ₹, #,##,##0.00
```

**Consequence:** any invoice, payment or revenue data created here is test data. Books cannot carry
real financial records until the org is switched out of test mode and GST registration is entered.
File 13 already lists GST as needed at M4+; this confirms it is still outstanding **and** that the
org itself is not production.

## 3. Desk — exists, effectively unconfigured

```
portal        richenquestpvtltd    (https://desk.zoho.in/agent/richenquestpvtltd)
orgId         60077092565
edition       ZOHOONE
departments   1 — "RICHENQUEST PVT. LTD." (default, created 2026-07-07)
chatStatus    NOT_CREATED
industry / description / website / mobile   all null or empty
```

One default department, no chat channel, no custom department structure. Usable as a support inbox
only after channels (email/chat) are connected — all console work.

## 4. Projects — does not exist

`get_portals` returns `{"result": []}`. No portal, so no task, milestone or timesheet data exists
anywhere. Every File 07 partnership-tracking assumption that relies on Projects is unfounded today.

## 5. Completed via API this session

Three consent fields created on **Leads** (`createFields`), verified queryable by COQL:

| Field | Type | Purpose |
|---|---|---|
| `Consent_Given` | boolean | Affirmative consent. Defaults `false` — never assume true |
| `Consent_Timestamp` | datetime | *When* consent was given; DPDP/GDPR require this to be demonstrable |
| `Consent_Policy_Version` | text(40) | *Which* policy version was agreed to, e.g. `2026-08-13` |

**Why this mattered:** the privacy policy commits in writing to consent-gated contact, and the CRM
had nowhere to record it. Consent was a client-side checkbox only — unprovable the moment anyone
asks. These fields close that gap and are independent of any frontend.

## 6. Console-only work — precise checklist

Nothing below has an API in the connected tool surface. Each line is a distinct console action.

### CRM
- [ ] **Webform fields** — add `Description`, `Lead Source Detail`, `UTM Source/Medium/Campaign`,
      and the three `Consent_*` fields to the Web-to-Lead form. Until then Zoho **silently
      discards** them (File 15). This one edit closes attribution, message capture and consent.
- [ ] Un-mandatory `Company` on the webform (currently worked around with a hidden `Individual`).
- [x] ~~University Partnerships custom module~~ — **NOT NEEDED.** Correction 2026-08-13: partnership tracking already exists on stock **Accounts** with 9 purpose-built custom fields. I had only checked for custom *modules* and wrongly reported it missing. Pipeline now populated — see §7.
- [ ] Workflow rules (File 01 §5.1–5.5), blueprints, validation rules — no API.
- [ ] Roles below CEO/Operations: Manager, Counselor, Finance (File 01 §1.3).
- [ ] Email templates (File 03 §3.1 "Welcome – 60 Second Reply", §3.3 nurture).

### Books
- [ ] Switch org out of **test mode** — until then no real financial data.
- [ ] Enter GST registration; complete quick setup.

### Desk
- [ ] Connect email channel to the default department; create chat if wanted.
- [ ] Department structure if support is to be split from counseling.

### Projects
- [ ] Create a portal, or formally drop Projects from the architecture.

### Other
- [ ] Zoho Forms portal — none exists; no API either way.
- [ ] Zoho Bookings portal — none exists.
- [ ] Confirm `official@richenquest.com` sends and receives (File 13, never confirmed).


## 7. University partnership pipeline — CORRECTION + populated via API (2026-08-13)

**My earlier finding was wrong.** File 16 §4 and File 14 said the University Partnerships module was
missing. Partnership tracking was already built — not as a custom module, but on stock **Accounts**,
which is the correct home for institutions. I had only queried for custom *modules*.

Nine purpose-built fields already existed:
`Partnership_Stage` · `Partnership_Type` · `Agreement_Status` · `Agreement_Signed_On` ·
`Agreement_Expires_On` · `International_Office_Contact` · `International_Office_Email` ·
`Campus_List` · `Accreditation`

Picklists were already well designed:
- **Stage:** Identified → Contacted → In Discussion → Agreement Drafted → Agreement Signed → Active → Dormant
- **Type:** Recruitment (Commission) · Service Fee (Public) · Exchange · Articulation / Pathway · Research · Memorandum of Understanding · Undefined
- **Agreement:** None · Drafted · Sent · Signed · Expired · Terminated

### What was missing was data, and that is now fixed

The module held **only 10 Zoho factory sample records** (US demo companies, all partnership fields
null). Via API:

- **Deleted** all 10 `(Sample)` records.
- **Imported all 17 targets** from `docs/06-partnerships-import-batch1.csv` — 12 Germany, 3 Ireland,
  1 Netherlands, 1 Poland — with country, contact, application URL, programs, route/lane and the
  verified research notes preserved in `Description`.

Verified by COQL: **17 records, 0 samples.**

### Two judgement calls recorded

1. **Every record is `Identified`, not `Contacted`** — even the four the CSV marked "Contact Found".
   Finding an email address is not outreach. Marking them `Contacted` would overstate the pipeline
   to anyone reading the CRM, which is the same discipline File 08 enforces on public claims.
   Each `Description` records the original CSV stage and the reason for the mapping.
2. **Fintiba and Expatrio are typed `Undefined`, not a partnership type** — they are service
   providers (blocked account + insurance), not universities. They are flagged as such in
   `Description` so nobody counts them as institutional relationships.

**Nothing here claims a partnership exists.** All 17 are prospective targets at the earliest stage,
consistent with `claims.json` (`partnerships.signed: []`) and File 08's ban on partner-university
language.
