# Zoho server-side integration layer

Server-side OAuth + API clients for Zoho One, used by Catalyst functions.
**Not part of the website build** — nothing here reaches the browser or the live
site. Zero runtime dependencies (native `fetch`, Node ≥ 20 / Catalyst).

## Layout
```
functions/zoho/
├── config.mjs        data-centre map, env reading/validation, redaction,
│                     CRM API version resolution (v7 default, v8 opt-in)
├── http.mjs          fetch-with-timeout, JSON parsing, ZohoError, retryAsync
├── oauth.mjs         token manager — auto-refresh, single-flight, pluggable
│                     cache (memory, or file via ZOHO_TOKEN_CACHE_FILE)
├── client.mjs        zohoRequest() — authed fetch, 401 retry, per-service base
│                     URL, {apiVersion} override
├── index.mjs         barrel export
├── zoho.test.mjs     functional test suite (node:test, zero-dep)
├── services/
│   ├── crm.mjs          createOrUpdateLead (dedupe), getLead, search, addNote
│   ├── crm-settings.mjs field metadata CRUD — powers provisioning
│   ├── cliq.mjs         channels (duplicate-safe) + heartbeat posting
│   ├── mail.mjs         sendMail (transactional)
│   ├── bookings.mjs     services / availability / appointments
│   ├── analytics.mjs    addRows / exportView
│   ├── forms.mjs        read-only (submissions push to CRM via the embed)
│   ├── salesiq.mjs      thin operational reads (chat is the widget)
│   └── flow.mjs         triggerFlow(webhook) — no CRUD API
├── scripts/
│   ├── auth-url.mjs      prints the authorization URL
│   ├── exchange-code.mjs grant code → refresh token (printed locally only)
│   └── verify.mjs        proves the refresh works
└── (provisioning + verification — all idempotent, dry-run by default)
    ├── provision-crm.mjs      custom fields from config/crm-schema.json
    ├── provision-pipeline.mjs Stage pipeline (ATOMIC full-set — see file header)
    ├── provision-cliq.mjs     Cliq channels (lists first; aborts if unreadable)
    ├── verify-crm.mjs         AM0.4 acceptance evidence, generated from the API
    └── release-audit.mjs      production-vs-repository drift audit
```

## Operational commands
```bash
# All provisioners are DRY-RUN by default; add --commit to write.
node --env-file=.env functions/zoho/provision-crm.mjs      [--commit] [--rollback]
node --env-file=.env functions/zoho/provision-pipeline.mjs [--commit]
node --env-file=.env functions/zoho/provision-cliq.mjs     [--commit]

# Read-only verification (safe any time; exit 0 = clean).
node --env-file=.env functions/zoho/verify-crm.mjs      # acceptance evidence
node --env-file=.env functions/zoho/release-audit.mjs   # production drift audit
```

## Two Zoho API contracts you must not violate
1. **Picklist writes are atomic full-set replaces.** A `PATCH` on `pick_list_values`
   is treated as the complete layout-associated set — a partial list silently
   de-associates every omitted option. `provision-pipeline.mjs` therefore has no
   partial-update path. See `docs/automation-specs/AM0.4-incidents.md` (INC-1).
2. **Cliq channel creation is not idempotent and has no delete API.** Always list
   before creating; never create blind. See INC-2.

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
