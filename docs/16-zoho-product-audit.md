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
- [ ] **University Partnerships custom module** (File 02) — no `createModule` API exists.
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
