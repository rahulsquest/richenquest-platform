# File 14 — Zoho One Integration (production design)
How the website connects to Zoho, what must be configured, and in what order.
Status: **scaffolding built and dormant** (2026-07-19, RC-1 `integration` class). Nothing
activates until values are filled into `website/src/data/integrations.json`.

---

## 1. The principle: configuration, not code

Every Zoho ID/URL lives in **`website/src/data/integrations.json`** and nowhere else. Values
ship **empty**, which means:

- each integration is **dormant** — no iframe, no third-party script, no network call;
- its **fallback is a real workflow** (WhatsApp / phone / email), never a fake control
  (founder decision 8);
- activation = paste a value → rebuild → deploy. **No code change, no developer.**

Secrets never enter this file. Public embed URLs are not secrets; OAuth client secrets and API
tokens belong in Catalyst environment variables / GitHub Actions secrets (§7).

**Safety rail:** `modules/config.js` only ever embeds `https://` URLs on Zoho-owned hosts
(`zoho.com|in|eu`, `zohopublic.*`, `zohobookings.*`). A typo or a bad paste cannot turn into an
injection vector — verified against lookalike domains (`zoho.in.evil.com`), suffix attacks
(`notzoho.in`), plain HTTP, and `javascript:` URIs.

## 2. Website integrations vs Zoho org configuration

Only three of the seven requested services touch the website codebase. The rest are Zoho
back-office configuration — real work, but no code:

| Service | Touches website code? | Where the work happens |
|---|---|---|
| **Zoho Forms** | ✅ yes | `integrations.json` → `forms.consultation_url` |
| **Zoho Bookings** | ✅ yes | `integrations.json` → `bookings.consultation_url` |
| **Zoho SalesIQ** | ✅ yes | `integrations.json` → `salesiq.widget_code` |
| **Zoho CRM** | ❌ no | CRM setup per File 01 (fields, stages, workflows). The website never calls CRM directly — Forms delivers the lead. |
| **Zoho Mail** | ❌ no | DNS records (MX/SPF/DKIM) at the registrar. Affects email deliverability, not the site. |
| **Zoho Flow** | ❌ no | Zoho console only. See §5 for a recommendation. |
| **Zoho Analytics** | ❌ no | Auto-syncs from CRM/Books; dashboards built in Analytics (File 01 §8). |

## 3. The lead journey (end state)

```
Visitor → website
   ├── Zoho Forms (consultation request)  ─┐
   ├── Zoho Bookings (self-serve slot)    ─┤
   ├── SalesIQ chat  ─────────────────────┤→ Zoho CRM Lead (deduplicated on email/phone)
   ├── WhatsApp (wa.me → BSP)  ───────────┤        │
   └── Email / phone  ────────────────────┘        ▼
                                        CRM Workflow Rules (File 01 §5)
                                        instant reply · owner task · Cliq alert
                                                     │
                                        Email + WhatsApp templates (File 03)
                                                     ▼
                                        Zoho Analytics dashboards (File 01 §8)
```

**Create-or-update:** Zoho Forms' CRM integration does not deduplicate by itself. Turn on
CRM → Setup → Data Administration → **Duplicate Check** with **Email** as the unique field
(secondary: Phone). Without this, a student who submits twice creates two Leads and gets two
"instant reply" emails.

## 4. Setup, service by service

Prerequisite for all of it: **Zoho One activated, India data centre** (File 00 Day 1).

### 4.1 Zoho Forms → CRM
1. Build the form with exactly the fields in File 01 §3 / File 11 decision C7 — 2 steps,
   ≤7 fields: *step 1* Destination · Study level · Intake; *step 2* Name · Phone/WhatsApp ·
   Email · consent checkbox.
2. Add **hidden fields**: `utm_source`, `utm_medium`, `utm_campaign`, `page_url`.
3. Integrations → **Zoho CRM** → map every field to the Lead fields from File 01 §3; set
   Lead Source = `Website Form`.
4. Share → **Permalink** → copy the URL → `integrations.json` → `forms.consultation_url`.
5. Consent checkbox text must match the Privacy Policy (§6 legal note).

### 4.2 Zoho Bookings
1. Create service **"Free Counseling Session — 30 min"**; connect counselor calendars;
   set availability to the published hours (10:00–19:00 IST, Mon–Sat) — and add European
   hours if the Italy counselor takes bookings directly.
2. Turn on confirmation + reminder emails (and Bookings↔CRM sync so appointments attach to
   the Lead).
3. Share → booking page URL → `integrations.json` → `bookings.consultation_url`.
   *(Already wired into `/contact/` — the WhatsApp fallback disappears automatically.)*

### 4.3 Zoho SalesIQ
1. Settings → Brands → add `www.richenquest.com` → copy the **widget code**.
2. Business hours 10:00–19:00 IST; offline mode captures lead + creates CRM record.
3. Build the Answer Bot knowledge base from File 04 §1 **before** enabling the bot — with the
   File 04 safety rules hard-coded: never predict visa outcomes, never give case-specific
   immigration advice, always route below-confidence questions to a human.
4. Paste the widget code → `integrations.json` → `salesiq.widget_code`.
   **Chat will still not load until cookie consent exists — see §6.**

### 4.4 Zoho CRM (no website work)
Build per File 01: custom fields, the 11-stage pipeline, and the five workflow rules. The
website's job ends when the Lead is created; everything after that is CRM.

### 4.5 Zoho Mail (DNS, no website work)
Add MX, **SPF**, and **DKIM** records at the registrar. Do this early and carefully: the File
07 partnership emails to IU and GUS are sent from `official@richenquest.com`, and missing
SPF/DKIM is the most common reason such mail lands in spam. Adding mail records does **not**
affect the live website — only the A/CNAME records do that, and those change only at cutover.

### 4.6 Zoho Analytics (no website work)
Connect CRM (and Books when live); build the founder "Monday 7" and manager dashboards from
File 01 §8. Website traffic analytics is a separate question — GA4/Clarity, still awaiting the
founder decision in File 13.

## 5. Recommendation: CRM Workflows first, Zoho Flow only where needed

The brief asks Zoho Flow to automate "the complete lead journey". My recommendation is to
**not** start there. Everything in the launch-critical path — instant reply email, owner task,
Cliq alert, stage-triggered emails, deadline reminders — is native **CRM Workflow Rules**
(File 01 §5), which are simpler, faster, and debuggable in one place.

Reserve **Zoho Flow** for genuine cross-app orchestration CRM cannot do alone, e.g.:
- CRM stage → create the student's WorkDrive folder structure (File 01 §6);
- CRM stage → trigger a WhatsApp BSP template (if the BSP's native CRM integration proves
  limiting);
- Bookings no-show → CRM task + nurture sequence.

Running both layers from day one means two places to look when a lead is missed. Start with
CRM Workflows; add Flow deliberately, one automation at a time, once the manual rhythm exists.

## 6. Compliance sequencing (this order matters)

1. **Consent banner before SalesIQ.** SalesIQ sets tracking cookies. Under DPDP/GDPR it must
   not load before the visitor accepts non-essential cookies. `modules/zoho-salesiq.js`
   enforces this: it requires **both** a widget code **and** stored consent, so today it
   stays off — the correct default. When the banner ships it only needs to store
   `rq-consent-analytics = granted` and dispatch `rq:consent-granted`; chat then activates
   with no rebuild.
2. **Privacy Policy must name the processors** (Zoho Forms/CRM/Bookings/SalesIQ, India DC)
   before those integrations go live. The policy already describes this — re-read it once the
   final set is switched on.
3. **Form consent text** must match the policy wording.
4. Legal pages still carry "Draft pending review" (File 13) — that label comes off only after
   founder/legal review.

## 7. Secrets policy

| Value | Secret? | Where it lives |
|---|---|---|
| Forms/Bookings permalink URLs, SalesIQ widget code | No (public embeds) | `integrations.json`, committed |
| Catalyst deploy token | **Yes** | GitHub Actions secret `CATALYST_TOKEN` |
| Zoho OAuth client id/secret, refresh tokens (future API work) | **Yes** | Catalyst environment variables — never in git |

Future server-side CRM calls (the branded form proxy, File 09 §8) use a Zoho **self-client**
OAuth grant executed inside a Catalyst function. No Zoho credential ever reaches the browser.

## 8. Activation checklist (when Zoho One is live)

- [ ] Zoho One activated, **India DC**
- [ ] CRM built per File 01 (fields, stages, 5 workflows) + **Duplicate Check on Email**
- [ ] Zoho Forms built (2-step, ≤7 fields, UTM hidden fields) and mapped to CRM
- [ ] Bookings service created and calendars connected
- [ ] SalesIQ brand added; Answer Bot knowledge loaded (File 04)
- [ ] Mail DNS: MX + SPF + DKIM verified
- [ ] Paste the three values into `integrations.json`; decide where the Forms embed appears (§9)
- [ ] Consent banner shipped (required before SalesIQ activates)
- [ ] Rebuild → deploy to Catalyst **Development** → verify
- [ ] **End-to-end acceptance test:** submit the real form with UTM parameters → confirm the
      CRM Lead appears with correct source attribution → confirm workflow 5.1 fires (email +
      task + Cliq) → confirm it surfaces on the Analytics dashboard
- [ ] Only then promote to Production (release tag + manual approval)

## 9. Open decision — where the consultation form appears

`components/form-embed.html` is built and ready but **not placed on any page**, because
placing it changes page content, which RC-1 reserves for founder approval. Options:

- **A.** A "Request a consultation" section on `/contact/` (recommended — highest-intent page,
  sits naturally above the existing channel cards).
- **B.** A dedicated `/book/` page linked from every "Book a free consultation" CTA.
- **C.** Keep WhatsApp as the only request channel and use Forms solely for partner/university
  inquiries.

Say the word and it is a one-line include.

---

## 10. Server-side OAuth layer (built 2026-07-19, `functions/zoho/`)

Two integration surfaces exist, and they are independent:

- **Client-side embeds** (`website/src/assets/js/modules/zoho-*.js`) — Forms, Bookings, SalesIQ
  as iframes/widgets. Config in `integrations.json`. **No OAuth, no secrets.** This covers the
  launch lead journey.
- **Server-side API layer** (`functions/zoho/`) — OAuth + REST clients for Catalyst functions
  (the future branded form proxy, transactional mail, webhook bridges). This is where the API
  Console app and its secrets belong. It runs on the server only; nothing reaches the browser.

### 10a. Where your Client ID / Client Secret go — never hard-coded
| | Local development | Production (Catalyst) |
|---|---|---|
| Client ID | `.env` → `ZOHO_CLIENT_ID` | Catalyst environment variable `ZOHO_CLIENT_ID` |
| **Client Secret** | `.env` → `ZOHO_CLIENT_SECRET` | Catalyst environment variable `ZOHO_CLIENT_SECRET` |
| Refresh token | `.env` → `ZOHO_REFRESH_TOKEN` | Catalyst environment variable `ZOHO_REFRESH_TOKEN` |

`.env` is gitignored (`.env`, `.env.*`, with `!.env.example` the only tracked template). The
secret never enters git, never enters the built site, and is never printed by any script (the
`redact()` helper masks token/secret-shaped strings in logs). **Do not paste the Client Secret
or Refresh Token into chat or anywhere else — only into your local `.env`.**

### 10b. Every environment variable
Template: `.env.example` (copy to `.env`). Required to obtain a token: `ZOHO_DC`,
`ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REDIRECT_URI`, `ZOHO_SCOPES`. Produced by setup:
`ZOHO_REFRESH_TOKEN`. Per-service extras, only when that client is used: `ZOHO_MAIL_ACCOUNT_ID`,
`ZOHO_ANALYTICS_ORG_ID`, `ZOHO_SALESIQ_SCREENNAME`, `ZOHO_FLOW_WEBHOOK_URL`. Each is documented
inline in `.env.example`.

## 11. Generating the Refresh Token (one time)

**Your data centre is India** (`ZOHO_DC=in`) because RichenQuest uses Zoho One India DC — so
the authorization host is `https://accounts.zoho.in`. (If you created the "rahulsquest" app at
`api-console.zoho.com` instead of `.in`, change `ZOHO_DC` to `us`; the app and the DC must match.)

1. `cp .env.example .env`, then fill `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REDIRECT_URI`
   (exactly as configured on the app), and `ZOHO_SCOPES` (start with the CRM default).
2. `node --env-file=.env functions/zoho/scripts/auth-url.mjs` → prints the authorization URL.
   For the India DC + CRM scope it looks like:
   `https://accounts.zoho.in/oauth/v2/auth?scope=ZohoCRM.modules.ALL,ZohoCRM.settings.ALL&client_id=<id>&response_type=code&access_type=offline&prompt=consent&redirect_uri=<your-redirect>`
3. Open it, sign in as the RichenQuest Zoho admin, approve. Your browser lands on the Redirect
   URI with `?code=…` in the address bar (the page may 404 — the code is still in the URL).
4. `node --env-file=.env functions/zoho/scripts/exchange-code.mjs <code>` → prints
   `ZOHO_REFRESH_TOKEN=…` **in your terminal only**. Paste that line into `.env`.
5. `node --env-file=.env functions/zoho/scripts/verify.mjs` → `✓ Zoho OAuth working`.

Scopes drift over time. `ZohoCRM.modules.ALL` / `ZohoCRM.settings.ALL` are stable; confirm the
Bookings/Mail/Analytics/Forms/SalesIQ scope strings against Zoho's current scope reference
before requesting them, and add only what each server feature needs (least privilege).

### 11a. API base URL confidence
`config.mjs` resolves per-service base URLs per DC. **CRM (`/crm/v7`) is high-confidence.**
Mail, Analytics, and SalesIQ use their own documented hosts; Bookings and Forms paths should be
confirmed against the current API reference before first live call. All are in one table in
`config.mjs` — correcting one is a one-line change, no client rewrite.

## 12. Access-token lifecycle (automatic)

`oauth.mjs` exchanges the refresh token for a short-lived access token, caches it in memory, and
refreshes it a minute before expiry — and again transparently if any call returns 401 (token
rotated server-side). Callers (`crm.createOrUpdateLead`, etc.) never see tokens. In a Catalyst
function the default in-memory cache is fine; a shared cache (Catalyst Cache) can be injected via
`setTokenCache()` if cross-invocation reuse is wanted later.

## 13. This does not touch the live site
The live `www.richenquest.com` is Zoho Sites (server `ZGS`), unrelated to this repository. The
entire `functions/zoho/` tree is server-side and is never read by `website/build.mjs` (verified:
it does not appear in `website/dist`). Nothing here can affect the live site, which changes only
at DNS cutover with your approval.
