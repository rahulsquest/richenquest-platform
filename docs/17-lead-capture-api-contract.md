# File 17 — Lead Capture API Contract

**For whoever builds the next frontend.** This survives a frontend rewrite: it describes the Zoho
boundary, not the website. Verified end-to-end against production on 2026-08-13.

ADR-003 stands: **the browser POSTs directly to Zoho.** No backend, no submission handler, no
database. Do not proxy this through a server — doing so adds a credential to protect, a service to
run, and PII on a tier that currently holds none.

---

## 1. The endpoint

```
POST https://crm.zoho.in/crm/WebToLeadForm
Content-Type: application/x-www-form-urlencoded
```

India DC (`.in`) — the org is `zgid 60074018310`. Do not use `.com`.

## 2. Required hidden fields

| Field | Value | Notes |
|---|---|---|
| `xnQsjsdp` | webform key | From `website/src/data/site.json` → `zoho_webform_key` |
| `xmIwtLD` | webform digest | → `zoho_webform_digest` |
| `actionType` | `TGVhZHM=` | base64 of `Leads`. Constant |
| `returnURL` | absolute URL | Zoho 302s the browser here after submit |
| `aG9uZXlwb3Q` | **empty string** | Zoho's spam honeypot. Must be present, hidden, and empty |

**The keys are regenerated whenever the webform is edited in the console.** They are not secrets
(they ship in page source), but they are not stable either. Re-run
`node scripts/import-webform.mjs <pasted.html>` after any webform change; it rewrites `site.json`
and the `LEADCF` map automatically.

## 3. Accepted fields — THIS IS THE CRITICAL SECTION

Zoho enforces the webform's field list **server-side and silently**. A field absent from that list
is discarded, and the request still returns **HTTP 200**.

Proven 2026-08-13: a POST carrying `Email`, `Phone`, `Description` and `Lead Source` against a
webform configured with only `Company` and `Last Name` returned 200, created the lead, and stored
`Email`, `Phone`, `Description` and `Lead_Source` as **null**.

**Never treat HTTP 200 as proof of capture.** Verify with COQL against the CRM.

### Currently accepted (webform `1292318000000846014`)

| POST name | CRM field | Required | Notes |
|---|---|---|---|
| `Last Name` | `Last_Name` | **yes** | Send the person's full name here |
| `Company` | `Company` | **yes** | Mandatory in the webform. Students have no employer — send the literal `Individual` |
| `Email` | `Email` | no* | Make it required in *your* UI; a lead without it is uncontactable |
| `Phone` | `Phone` | no* | Same |
| `LEADCF1` | `Lead_Type` | no | Picklist. Use `Student` or `Parent` only — see §5 |

\* Not enforced by Zoho. Enforce client-side.

### Currently DISCARDED — do not render inputs for these

`Description` · `Lead Source` · `UTM Source/Medium/Campaign` · `Consent_*`

Rendering a message box or UTM inputs today produces a form that **looks like it works and stores
nothing** — the exact defect File 12 records on the legacy site. Ship them only after the webform is
extended (File 16 §6), then re-run the importer.

## 4. Consent — legal requirement, currently unstorable

Three fields exist in CRM (`Consent_Given`, `Consent_Timestamp`, `Consent_Policy_Version`) but are
**not yet on the webform**, so consent cannot be recorded through this path.

Until they are added: keep the consent checkbox as a hard client-side gate — the user must
affirmatively tick before submit. Understand the limitation: **you will have no server-side proof
of consent.** The privacy policy commits to consent-gated contact, so closing this is a compliance
task, not a nice-to-have.

## 5. Lead Type picklist — use an allowlist, not a copy

Zoho's `Lead_Type` picklist includes `University`, `Partner Institution`, `Recruitment Agent`,
`Corporate`, `Employer`, `Government`, `Organization`. **Do not surface these on a student form.**

`Partner Institution` in particular is blocked by `scripts/claims-guard.mjs` under File 08: no
signed institutional agreements exist, so partner-language is banned sitewide — including in HTML
comments, since comments ship to the browser.

## 6. Content Security Policy

A direct POST to Zoho requires:

```
form-action 'self' https://crm.zoho.in https://crm.zoho.com
```

The launch policy was `form-action 'self'`, which **silently blocks every submission** — no error in
the page, no error in CRM. `infra/security-headers.json` carries the corrected directive;
`scripts/gen-edge-config.mjs` renders it into `_headers`.

## 7. Verifying a submission actually landed

The only trustworthy check. HTTP 200 means nothing.

```sql
select id, Last_Name, Company, Email, Phone, Lead_Type, Created_Time
from Leads where Last_Name = '<probe value>' limit 3
```

Run it through the CRM API, confirm `Email` and `Phone` are **non-null**, then delete the probe
record. That assertion is the acceptance criterion — it is precisely what was silently failing
before 2026-08-13.

## 8. Downstream behaviour you inherit

- Assignment rule `Student_Lead_Routing` (created 2026-07-23) owns routing. Do not set `Owner`.
- `Lead_Status` arrives `null` — no workflow sets it yet (no workflow-rule API; File 16 §6).
- Duplicate handling is Zoho's, not yours. Do not build dedupe on the frontend.
- Pipeline for converted leads is **Student Cases** (Deals, renamed), 11 stages per File 01 §4.

## 9. Reference implementation

`website/src/components/lead-form.html` in this repo is a working, deployed implementation of this
contract — including the honeypot, the hidden `Company`, the allowlisted picklist and the consent
gate. Read it before writing a new one; it encodes every trap above.
