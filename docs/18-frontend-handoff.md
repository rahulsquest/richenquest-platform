# File 18 — Frontend Developer Handoff

**For the developer building the replacement frontend.** Everything here is backend/contract
truth, verified against production on 2026-08-13. The prototype at `richenquest.pages.dev` is
reference only — read `website/src/components/lead-form.html` as a working implementation, then
build your own.

**Read File 17 first.** It is the lead-capture contract. This file is the wider handoff.

---

## 1. Architecture you are inheriting

**ADR-003 is accepted and non-negotiable: Zoho is the backend. The website stores nothing.**
No database, no submission handler, no server. The browser POSTs directly to Zoho. If you add a
backend you take on a credential to protect, a service to run, and PII on a tier that currently
holds none.

```
Visitor → your frontend → Zoho CRM Web-to-Lead → Leads → assignment rule → counselor
```

## 2. Environment / configuration values

These are **not secrets** — they ship in page source — but they **change whenever the webform is
edited in the Zoho console**.

| Key | Current value | Source |
|---|---|---|
| Webform action | `https://crm.zoho.in/crm/WebToLeadForm` | `site.json → zoho_webform_action` |
| `xnQsjsdp` | webform key | `site.json → zoho_webform_key` |
| `xmIwtLD` | webform digest | `site.json → zoho_webform_digest` |
| `actionType` | `TGVhZHM=` (constant) | base64 of `Leads` |
| `returnURL` | your thank-you page, absolute | `site.json → zoho_webform_return_url` |
| Honeypot | field `aG9uZXlwb3Q`, empty, hidden | Zoho spam trap |

After any webform edit: `node scripts/import-webform.mjs <pasted.html>` rewrites all of the above
plus the `LEADCF` map. Do not hand-edit them.

**Org identifiers — the products do NOT share one.** CRM `zgid 60074018310` · Books org
`60077090038` · Desk org `60077092565` (portal `richenquestpvtltd`).

## 3. Lead schema (CRM `Leads`)

67 fields, 15 custom. The ones that matter to a frontend:

| CRM field | Type | Frontend notes |
|---|---|---|
| `Last_Name` | text(80) | **Mandatory.** Put the full name here |
| `Company` | text | **Mandatory in the webform.** Students have none — send literal `Individual` |
| `Email` | email(100) | Not enforced by Zoho. **Enforce client-side** or the lead is uncontactable |
| `Phone` | phone(30) | Same |
| `Lead_Type` | picklist | Allowlist `Student`/`Parent` only — see §6 |
| `WhatsApp_Number` | phone | **live** — send as `LEADCF9` |
| `Lead_Source_Detail` | picklist | **live** — send as `LEADCF3`, but the only valid web value is `Website Form` |
| `UTM_Source` · `UTM_Medium` · `UTM_Campaign` | text | **live** — `LEADCF10` / `LEADCF11` / `LEADCF12` |
| `Consent_Policy_Version` | text | **live** — `LEADCF13` |
| `Consent_Given` · `Consent_Timestamp` | boolean/datetime | on the webform canvas, **`LEADCF` index still unresolved** — cannot be sent yet |
| `Interested_Country` | multiselect | exists in CRM, **not on the webform** |
| `Interested_Level` · `Intended_Intake` · `Budget_Range` · `Preferred_Language` | picklist | ditto |
| `Lead_Status` | picklist | **set automatically to `Attempted to Contact` on create** by workflow rule `Instant lead response` (since 2026-08-15). Do not send it from the frontend |

## 4. What the webform accepts TODAY — and the trap

**Accepted (as of 2026-08-15):** `Last Name` · `Company` · `Email` · `Phone` · `Description` ·
`LEADCF1` (→ `Lead_Type`) · `LEADCF3` (→ `Lead_Source_Detail`) · `LEADCF9` (→ `WhatsApp_Number`) ·
`LEADCF10/11/12` (→ `UTM_Source/Medium/Campaign`) · `LEADCF13` (→ `Consent_Policy_Version`).

The authoritative list is `website/src/data/webform-fields.json`; read it rather than this
paragraph, because the mapping changes whenever the webform is edited.

**Everything else is silently discarded.** Zoho enforces the webform's field list server-side and
returns **HTTP 200 anyway**. Proven: a POST carrying `Email`, `Phone`, `Description` and
`Lead Source` against a webform lacking them returned 200, created the lead, and stored all four as
`null`.

**Never treat HTTP 200 as proof of capture.** Do not render inputs for fields the webform does not
carry — a message box that stores nothing is worse than no message box.

## 5. Consent model — legal, currently incomplete

India's DPDP Act 2023 and the EU GDPR both require consent to be **demonstrable**: that it was
given, *when*, and *to what*. Three CRM fields now exist for exactly this.

**Partially closed as of 2026-08-15.** `Consent_Policy_Version` is live and every submission
carries it (`LEADCF13`), so *which policy* was agreed to is now recorded in CRM, and `Created_Time`
records *when*. `Consent_Given` and `Consent_Timestamp` are on the webform canvas but their
`LEADCF` indices could not be resolved by probing (boolean and datetime fields reject probe
values), so they cannot be sent yet.

Until they are:

- Keep the consent checkbox a **hard client-side gate** — no submit without an affirmative tick.
  Because it is a hard gate, a lead reaching CRM from this form necessarily consented.
- Link it to `/legal/privacy/`.
- Understand the affirmative boolean is still **inferred, not transmitted**. Resolving the last two
  indices needs the generated embed HTML (File 19 §1).

## 6. Lead Type — use an allowlist, never a copy

Zoho's picklist also carries `University`, `Partner Institution`, `Recruitment Agent`, `Corporate`,
`Employer`, `Government`, `Organization`. Do not surface these on a student form.

`Partner Institution` is **blocked by `scripts/claims-guard.mjs`** under File 08: no signed
institutional agreements exist, so partner-language is banned sitewide — including inside HTML
comments, because comments ship to the browser.

## 7. UTM schema

`UTM_Source`, `UTM_Medium`, `UTM_Campaign` exist in CRM as plain text. Read `utm_source`,
`utm_medium`, `utm_campaign` from `location.search` and pass them through **once the webform
carries them**. Until then they are discarded — do not add hidden inputs that pretend otherwise.

Note: WhatsApp deep links already carry page context via prefill, so today WhatsApp is the only
attributed channel.

## 8. Content Security Policy

A direct POST to Zoho **requires**:

```
form-action 'self' https://crm.zoho.in https://crm.zoho.com
```

The launch policy was `form-action 'self'`, which silently blocks every submission — no error in
the page, none in CRM. Whatever stack you use, carry this directive.

Full policy in `infra/security-headers.json`; `scripts/gen-edge-config.mjs` renders it plus the
cache policy into Cloudflare/Netlify `_headers`. Reuse both — they encode verified behaviour,
including that Cloudflare **joins duplicate header values with commas and lets a repeated path
pattern override the earlier one**.

## 9. Deployment (reference, not prescription)

Prototype runs on Cloudflare Pages, project `richenquest`, account
`bcb90a75882c0ac261dda5fc70e6e59e`. `.github/workflows/deploy-pages.yml` activates when
`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` exist as repo secrets.

Catalyst hosting was evaluated and **rejected** — ADR-006 (Client: `/app` prefix forced, no
directory-index, assets 404) and ADR-007 (Slate: soft-404s, HTML `max-age=31536000`, no CSP
mechanism). Read those before proposing a host; both failures were measured, not assumed.

## 10. Integration checklist

- [ ] Send all five accepted fields; `Company` = `Individual`
- [ ] Honeypot present, hidden, empty
- [ ] `returnURL` absolute and pointing at a page that exists on the **current** origin
- [ ] Consent checkbox as a hard gate
- [ ] `Lead_Type` allowlisted to Student/Parent
- [ ] CSP carries the Zoho `form-action`
- [ ] Client-side required: name, email, phone
- [ ] No inputs rendered for discarded fields
- [ ] Re-run `import-webform.mjs` after any webform change

## 11. Acceptance tests

**AT-1 — capture.** Submit the form. Then, via CRM API:

```sql
select id, Last_Name, Company, Email, Phone, Lead_Type, Created_Time
from Leads where Last_Name = '<probe>' limit 3
```

PASS = record exists **and `Email` and `Phone` are non-null**. Delete the probe after.
This is the assertion that was silently failing before 2026-08-13.

**AT-2 — HTTP 200 is not capture.** Submit with an extra field the webform lacks. Confirm 200 **and**
that the field is `null` in CRM. This is the trap; prove you understand it.

**AT-3 — CSP.** With the policy applied, submit and confirm the request is not blocked. Removing the
Zoho `form-action` must break it — if it doesn't, your CSP isn't being applied.

**AT-4 — honeypot.** Submit with `aG9uZXlwb3Q` non-empty; Zoho should treat it as spam.

**AT-5 — returnURL.** Confirm the browser lands on a real page, not a 404.

**AT-6 — consent gate.** Confirm submit is impossible without ticking consent.

## 12. End-to-end verification checklist

- [ ] AT-1 through AT-6 pass
- [ ] All status codes correct: pages 200, unknown paths **404** (not 200 — soft-404s are an SEO defect)
- [ ] Redirects resolve in **one hop**
- [ ] Security headers present: CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy
- [ ] Cache-Control per path; hashed assets `immutable`, HTML `must-revalidate`
- [ ] `robots.txt` and `sitemap.xml` at **origin root**
- [ ] Every JSON-LD block parses; **no HTML entities, no U+00A0** (this shipped broken once — the
      slogan read `Global Education &amp; Career Mobility` to search engines)
- [ ] Canonicals self-referencing and pointing at the serving host
- [ ] Lighthouse **mobile** profile — not desktop. The CI config once scored desktop while labelled
      mobile because `emulatedFormFactor` is a Lighthouse 5 key that LH 6+ silently ignores
- [ ] `noindex` on thank-you and any styleguide; excluded from sitemap
- [ ] Deployment integrity: live asset hash matches a local build of the deployed commit

## 13. Things that will bite you

1. **HTTP 200 means nothing.** Verify in CRM.
2. **Webform keys rotate** on every console edit.
3. **`claims-guard` is a real build gate.** It fails CI on unverified company claims, including in
   comments. `claims.json` is the only permitted source of company facts.
4. **CSP `form-action` omission fails silently.**
5. **Cloudflare `_headers` concatenates duplicates**, and a repeated path pattern overrides the
   earlier block — a second `/*` once voided every security header.
6. **Data files must stay presentation-neutral.** Escaping belongs in templates; an `&amp;` in
   `site.json` corrupted 28 JSON-LD blocks because entities are not decoded inside
   `<script type="application/ld+json">`.
