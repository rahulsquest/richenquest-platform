# File 15 — Zoho Forms: automation boundary and the single unlocking action

**Investigated:** 2026-08-13. Every automation path was attempted before escalating.

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

## What is already done for it

- `components/lead-form.html` — full markup on the existing design system (`form.css`), stock
  Web-to-Lead field names, consent checkbox linked to the privacy policy, WhatsApp fallback.
- `site.json` — three empty config keys with an inline warning.
- **CSP updated** — `form-action` now permits `crm.zoho.in` / `crm.zoho.com`. This was mandatory:
  the launch CSP is `form-action 'self'`, which would have silently blocked every submission.
  Verified live in `_headers`. No other directive relaxed.
