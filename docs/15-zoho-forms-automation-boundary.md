# File 15 — Zoho Forms: automation boundary and the single unlocking action

**Investigated:** 2026-08-13. Every automation path was attempted before escalating.

## Exhaustive path matrix (final check, 2026-08-13)

| # | Path | Supported? | Can create webform? | Can retrieve HTML? | Can retrieve xnQsjsdp/xmIwtLD/action? | Fully automatable? |
|---|---|---|---|---|---|---|
| 1 | Zoho CRM Core APIs | YES | NO | NO | NO | records/fields only |
| 2 | Zoho CRM Metadata APIs (v8) | YES | NO | NO | NO | NO — v8 metadata covers modules, fields, layouts, custom views, related lists. Webforms are **not** a covered entity |
| 3 | Zoho CRM Webform APIs | **NO — do not exist** | — | — | — | — |
| 4 | Zoho Deluge | YES (product) | NO | NO | NO | Cannot reach the private Forms API — no OAuth scope exists |
| 5 | Zoho Flow | YES (product) | NO | NO | NO | No MCP server connected; console-configured |
| 6 | Zoho Catalyst | YES (product) | NO | NO | NO | MCP server present but **unauthenticated** this session |
| 7 | Zoho Developer APIs | YES | NO | NO | NO | Extension/widget APIs; no webform entity |
| 8 | Zoho Marketplace | YES | NO | NO | NO | Publishing an extension still requires console auth and does not expose webforms |
| 9 | Browser automation in this environment | **NO** | — | — | — | Tool search run 4×: only Figma design tools and Zoho data tools. No browser control, computer-use, Playwright, Puppeteer or Selenium |
| 10 | MCP servers | YES (CRM/Books/Desk/Projects) | NO | NO | NO | Searched 3×; no form-creation tool on any server |
| 11 | Direct Zoho REST from shell | **NO** | — | — | — | `GET zohoapis.in/crm/v3/settings/modules` → **401**. MCP holds the token server-side; no client-side token exists |

Additional zero-action alternatives probed and eliminated:
- **Zoho Bookings** public portal — `richenquest.zohobookings.in` and `.com` both **404**; no portal exists.
- **Zoho Forms** public portal — no subdomain resolves.
- **Deriving LEADCF indices from field metadata** — impossible. Custom Leads fields expose only
  `api_name` and `id`; there is no `column_name`, index or LEADCF hint. The mapping exists solely
  in the generated HTML.

## Paths attempted, with evidence

| Path | Result |
|---|---|
| Zoho Forms REST API | API is **not officially released**. A private API backs the GUI, but **"There is no OAuth scope made available by Zoho that works with the private Forms API"** — so it is unreachable even from Deluge. |
| Zoho CRM Web Forms API | No create endpoint. Web Forms are a console feature: `Setup → Developer Space → Webforms → Create Webform`. |
| MCP tool surface | Searched three times. Connected servers are CRM, Books, Desk, Projects. **No form-creation tool on any of them.** CRM exposes `createFields` (fields, not forms), `createRecords`, `createTags` only. |
| Direct Zoho REST from the shell | `GET zohoapis.in/crm/v3/settings/modules` → **HTTP 401**. The MCP server holds the OAuth token server-side; no client-side token exists, so arbitrary REST calls are impossible. |
| Browser automation / computer-use | Tool search run three times. Only Figma design tools and Zoho data tools exist. **No browser control, no Playwright/Puppeteer/Selenium, no computer-use.** |
| Zoho Catalyst | MCP server present but **unauthenticated** in this session; cannot run Deluge or functions. |

**Conclusion:** creating the webform is genuinely console-only. It is not an engineering gap.

## The single action that unlocks everything

Creating **one** CRM Web Form yields three values. Every form on the site — contact,
counselling, university collaboration, internship, partnership, career — then POSTs to the same
endpoint with the same keys, distinguished by a hidden `Lead Source Detail` value. One console
action, six site forms, zero further founder work.

Copy from the generated form's HTML:

| Value | Where it appears |
|---|---|
| `zoho_webform_action` | the `<form action="…">` URL, e.g. `https://crm.zoho.in/crm/WebToLeadForm` |
| `zoho_webform_key` | `<input name="xnQsjsdp" value="…">` |
| `zoho_webform_digest` | `<input name="xmIwtLD" value="…">` |

Also copy the **`LEADCF…` name for each custom field** (WhatsApp Number, Interested Country,
Interested Level, Intended Intake, Budget Range, Preferred Language, consent). Zoho assigns these
indices at generation time — they cannot be predicted, which is why
`components/lead-form.html` uses named placeholders for them.

## Why the component is not yet on any page

`components/lead-form.html` exists and is complete, but is **included by no page**. With blank
keys it would POST nowhere and silently discard submissions — the exact defect File 12 records on
the legacy site ("preventDefault → clears fields → fake success message"). Shipping that would be
worse than having no form.

## Post-action automation is already built and proven

`scripts/import-webform.mjs` parses the pasted HTML and writes everything itself — the three
config values into `site.json` and a full `LEADCF → CRM field` map into `webform-fields.json`.
**No manual mapping, no hand-edited config, no HTML editing.**

Proven against a synthetic webform before asking for anything:

```
✓ import-webform: action + xnQsjsdp + xmIwtLD written to site.json;
  4 LEADCF field(s) mapped (3 labelled)
  {'LEADCF7': 'WhatsApp Number', 'LEADCF3': 'Interested Country',
   'LEADCF9': 'Budget Range', 'LEADCF12': None}
```

The test values were then reverted; no placeholder keys are committed.

## What is already done for it

- `components/lead-form.html` — full markup on the existing design system (`form.css`), stock
  Web-to-Lead field names, consent checkbox linked to the privacy policy, WhatsApp fallback.
- `site.json` — three empty config keys with an inline warning.
- **CSP updated** — `form-action` now permits `crm.zoho.in` / `crm.zoho.com`. This was mandatory:
  the launch CSP is `form-action 'self'`, which would have silently blocked every submission.
  Verified live in `_headers`. No other directive relaxed.


---

# WEBFORM IMPORTED — AND A CRITICAL FINDING (2026-08-13)

The founder generated webform `1292318000000846014`. Keys imported into `site.json`:
`action https://crm.zoho.in/crm/WebToLeadForm` · `xnQsjsdp` · `xmIwtLD`.

**The generated form exposes only two fields: `Company` and `Last Name`.** Zero `LEADCF` fields.

## Experiment: does Web-to-Lead accept fields absent from the webform config?

A live POST was submitted carrying `Company`, `Last Name`, **plus** `Email`, `Phone`,
`Description` and `Lead Source`.

**Result: HTTP 200, lead created — and every unlisted field silently discarded.**

```
Company     = RQ-AUTOTEST          (in config)  -> STORED
Last_Name   = ZZAutotestProbe      (in config)  -> STORED
Email       = autotest.probe@…     (not in config) -> null
Phone       = +919999999999        (not in config) -> null
Description = Probe…               (not in config) -> null
Lead_Source = Web Form             (not in config) -> null
```

Test record `1292318000000855001` deleted after verification.

**Conclusion: the webform's field list is authoritative and enforced server-side, and violations
fail silently with a success response.** Wiring the site form now would have captured a name and a
company and nothing else — every lead uncontactable, with no error anywhere. This is the same
"green but wrong" failure class as the corrupted JSON-LD and the desktop-scoring perf gate.

Phase 2 therefore cannot complete until the webform carries the real fields. This is not
recoverable in software: `createFields` creates CRM fields (they already exist); it cannot add a
field to a webform, and no webform API exists in any Zoho product.

## Importer bug found and fixed by real input

`import-webform.mjs` initially matched nothing. Zoho renders attributes as `name = 'x' value = 'y'`
with spaces around `=` and single quotes; the regexes assumed `name="x"`. Now whitespace- and
quote-tolerant, and verified against the real payload.
