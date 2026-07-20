# Zoho server-side integration layer

Server-side OAuth + API clients for Zoho One, used by Catalyst functions.
**Not part of the website build** — nothing here reaches the browser or the live
site. Zero runtime dependencies (native `fetch`, Node ≥ 20 / Catalyst).

## Layout
```
functions/zoho/
├── config.mjs        data-centre map, env reading/validation, redaction
├── http.mjs          fetch-with-timeout, JSON parsing, ZohoError
├── oauth.mjs         token manager — auto-refresh, in-memory cache (pluggable)
├── client.mjs        zohoRequest() — authed fetch, 401 retry, per-service base URL
├── index.mjs         barrel export
├── services/
│   ├── crm.mjs       createOrUpdateLead (dedupe), getLead, search, addNote  ← the important one
│   ├── mail.mjs      sendMail (transactional)
│   ├── bookings.mjs  services / availability / appointments
│   ├── analytics.mjs addRows / exportView
│   ├── forms.mjs     read-only (submissions push to CRM via the embed)
│   ├── salesiq.mjs   thin operational reads (chat is the widget)
│   └── flow.mjs      triggerFlow(webhook) — Flow is webhook-triggered, no CRUD API
└── scripts/
    ├── auth-url.mjs      prints the authorization URL
    ├── exchange-code.mjs grant code → refresh token (printed locally only)
    └── verify.mjs        proves the refresh works
```

## One-time OAuth setup
Full walkthrough: `docs/14-zoho-integration.md` §10–12. In short:
```bash
cp .env.example .env                 # fill ZOHO_CLIENT_ID / _SECRET / _REDIRECT_URI / _SCOPES
node --env-file=.env functions/zoho/scripts/auth-url.mjs        # open the URL, approve
node --env-file=.env functions/zoho/scripts/exchange-code.mjs <code>   # prints ZOHO_REFRESH_TOKEN
# paste that line into .env
node --env-file=.env functions/zoho/scripts/verify.mjs          # ✓ working
```

## Using it from a Catalyst function
```js
import { crm } from "../zoho/index.mjs";
const { id, action } = await crm.createOrUpdateLead(
  { Last_Name: name, Email: email, Phone: phone },
  { source: "Website Form" }
);
```
Access tokens refresh automatically; you never handle them. Secrets come from
Catalyst environment variables in production (the same names as `.env`).
