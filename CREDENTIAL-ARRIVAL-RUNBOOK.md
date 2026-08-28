# CREDENTIAL-ARRIVAL-RUNBOOK.md

The exact sequence to run the moment Zoho CRM application OAuth credentials exist.
Nothing here can be done earlier; nothing here should be improvised on the day.

Scope: the SaaS backend + React app in `~/Documents/GitHub/RichenQuest/New Project 2`.
Not the static marketing site — that is `DEPLOYMENT-CHECKLIST.md`, a different codebase.

**Never paste a secret value into a terminal that is being logged, into a commit, or into
this file.** Every step below is written so that no secret is ever echoed.

---

## Step 0 — Prerequisites that must already be true

| # | Prerequisite | How to confirm |
|---|---|---|
| 1 | Self client created, India DC | `api-console.zoho.in` shows it |
| 2 | Exactly four scopes granted | `ZohoCRM.modules.leads.ALL`, `ZohoCRM.modules.contacts.ALL`, `ZohoCRM.settings.modules.READ`, `ZohoCRM.functions.execute.CREATE` |
| 3 | Refresh token generated | held by founder, not in this repo |

Scope 3 is the one people forget: without `settings.modules.READ` the health check reports
DEGRADED even when CRM is genuinely reachable, because it probes `crm/v8/settings/modules`.

No Accounts scope is required — the code makes no direct Accounts REST call; opportunities are
read inside Deluge, server-side.

---

## Step 1 — Configure secrets

Set in the **AppSail environment**, never in a committed file:

```
ZOHO_CRM_CLIENT_ID
ZOHO_CRM_CLIENT_SECRET
ZOHO_CRM_REFRESH_TOKEN
SESSION_SECRET            # openssl rand -hex 32
CORS_ALLOWED_ORIGINS      # https://www.richenquest.com — the browser origin, not the API host
NODE_ENV=production
```

`ZOHO_ACCOUNTS_URL` and `ZOHO_CRM_API_DOMAIN` need no value — the code already defaults to the
India DC. `ZOHO_CRM_REDIRECT_URI` is not read at runtime once a refresh token exists.

**Success:** all six present. **Failure:** any blank — stop, do not deploy.

---

## Step 2 — Deploy the backend, once

```
cd ~/Documents/GitHub/RichenQuest/New\ Project\ 2
catalyst deploy appsail
```

**Failure:** if the deploy errors, read the actual error. Do not redeploy unchanged code hoping
for a different result — that pattern cost this project several passes on the Slate domain.

---

## Step 3 — Verify DNS and API reachability

```
curl -s -o /dev/null -w "%{http_code}\n" https://api.richenquest.com/
```

**Success:** 200. **Failure:** `000` means the host does not resolve — an AppSail custom-domain
mapping is missing. That is a console action, not a code problem.

---

## Step 4 — Verify health *before anything else*

```
curl -s https://api.richenquest.com/api/health | python3 -m json.tool
```

**Success — all three, no exceptions:**
- HTTP **200**
- `"status": "HEALTHY"`
- `"crm": {"reachable": true}`

**Failure:** `503 DEGRADED` is the honest answer, not a warning to skip. `zohoAuth.detail` names
what is missing. **Do not proceed to Step 5 on a DEGRADED health.** A DEGRADED backend produces
`409 PROFILE_NOT_LINKED` on every intelligence route, which will look like a code bug and is not.

---

## Step 5 — Rebuild and redeploy the frontend against the real API

The bundle currently on Slate was built **before** the API URL guard existed and carries the
relative `/api`, which Slate answers with `index.html`. It must be rebuilt:

```
VITE_API_BASE_URL=https://api.richenquest.com/api bash scripts/deploy-production.sh
```

The script refuses to build if that variable is unset. Confirm the deployed bundle:

```
B=$(curl -s https://rq-site-ugkizspd.onslate.in/ | grep -o "assets/index-[A-Za-z0-9_-]*\.js")
curl -s "https://rq-site-ugkizspd.onslate.in/$B" | grep -o 'apiBaseUrl:"[^"]*"'
```

**Success:** prints the real HTTPS API origin. **Failure:** prints `"/api"` — the wrong artifact
shipped; do not continue.

> **Caution — this deploys to `rq-site`, which the customer domain does not currently serve.**
> `www.richenquest.com` resolves through Slate resource `7264000000019003` (`rq-site-ysgqnszn`),
> a different app; the domain and that app return a byte-identical object (same ETag, same
> `Last-Modified`), while `scripts/deploy-production.sh` deploys to `rq-site-ugkizspd`
> (`8769000000005006`). So this step makes the corrected bundle live **on the Slate app, not on
> the customer domain**. Verify the domain separately:
>
> ```
> curl -s https://www.richenquest.com/ | grep -o "assets/index-[A-Za-z0-9_-]*\.js"
> ```
>
> If that still returns the old hash, the frontend is *not* live for customers regardless of what
> this step reported, and Steps 6–10 are testing the API directly rather than through the real
> site. That binding is an open decision — see `FOUNDER-ACTIONS.md` A2 and
> `BACKEND-HANDOFF-FOR-WEBSITE-DEVELOPER.md` §3c. Do not change it here.

---

## Step 5a — Verify CORS from the real browser origin

Do not skip this because Steps 3–5 passed. **`curl` ignores CORS entirely**, so every check so far
would succeed even with a completely wrong allowed origin — the failure appears only in a real
browser, as a blocked request with no useful server-side log.

The frontend sends an `Authorization` header, which makes every call a non-simple request, so the
browser sends a preflight `OPTIONS` first. Simulate exactly that:

```
curl -s -i -X OPTIONS https://api.richenquest.com/api/home \
  -H "Origin: https://www.richenquest.com" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: authorization" | head -20
```

**Success:** a 2xx carrying `access-control-allow-origin: https://www.richenquest.com` and
`access-control-allow-credentials: true`.

**Failure:** no `access-control-allow-origin` header, or one naming a different host. That means
`CORS_ALLOWED_ORIGINS` does not match the origin the browser is actually on. The template shipped
`https://app.richenquest.com` until 2026-08-29 — a host that does not exist — so anyone who copied
it earlier will fail here. Fix the variable and restart; do not proceed to Step 6.

Repeat with a hostile origin to confirm the gate is closed, not merely permissive:

```
curl -s -i -X OPTIONS https://api.richenquest.com/api/home \
  -H "Origin: https://evil.example" \
  -H "Access-Control-Request-Method: GET" | grep -i "access-control-allow-origin" || echo "correctly refused"
```

**Success:** no allow-origin header for `evil.example`.

---

## Step 6 — One controlled signup

Use an address that is unmistakably synthetic and that nobody can reach:

```
E="rq-e2e-$(date +%s)@example.invalid"
```

`.invalid` is reserved by RFC 2606 and cannot receive mail, so this can never be confused with a
real student or accidentally emailed.

```
curl -s -X POST https://api.richenquest.com/api/auth/signup \
  -H "Content-Type: application/json" \
  -d "{\"fullName\":\"RQ E2E Test\",\"email\":\"$E\",\"password\":\"<generated>\",\"phone\":\"9000000000\"}"
```

**Capture from the response:** `token`, `user.userId`, `user.studentId`.
**Success:** HTTP 201. **Failure:** stop and read the error; do not retry blindly.

---

## Step 7 — Verify the CRM Contact was actually created

```
select Last_Name, Email, id from Contacts where Email = '<the .invalid address>'
```

**Success:** exactly one row. **Failure:** zero rows means `syncContactToCrm` failed — check the
server log for `[Auth CRM Sync Error]`. Do not proceed.

**Record the returned CRM Contact id.** Step 8 depends on it.

---

## Step 8 — THE CRITICAL TEST: leadId handoff

This is the historically broken path and the single most important assertion in this runbook.

The bug: signup wrote CRM sync status onto the **Students** table, but every intelligence route
reads `leadId`/`crmModule` from the **Users** table. The fix exists in `auth/index.js` but has
**never executed against a real CRM**, because it only runs inside the success branch of a real
sync — which has never happened.

```
curl -s https://api.richenquest.com/api/home -H "Authorization: Bearer <token>"
```

**Success:** HTTP 200 with real dashboard data.

**Failure:** `409 PROFILE_NOT_LINKED`. That exact code means `leadId` never reached the Users
table — the handoff is still broken. Capture the response, stop, and treat it as a P0 code defect,
**not** a configuration problem.

Cross-check that the identity actually matches Step 7's Contact id rather than merely being
non-null. A wrong-but-present id would pass a naive check and fail silently later.

---

## Step 9 — Intelligence, matching, roadmap, report

Same Bearer token, each expected 200:

```
/api/profile        /api/opportunities   /api/roadmap
/api/report         /api/mentor          /api/profile-score
```

**Expected substance, not just status codes:**
- `/api/opportunities` returns **1–2 Hungarian options** (Pécs, Debrecen) — the only two passing
  the five-field gate. More than two means the verification gate has been weakened; investigate.
- `match_score` and `confidence` are **separate numbers**. If they are ever equal or merged, stop.
- Nothing anywhere reads as an admission, visa or scholarship probability.
- `/api/mentor` honestly returns no verified mentors — Vendors is empty.

---

## Step 10 — Authorization tests against the live backend

Repeat the local suite against production. Create a **second** `.invalid` account for the
cross-student checks:

| Test | Expected |
|---|---|
| `GET /api/leads` as a student | **403** |
| `GET /api/leads` unauthenticated | **401** |
| Student A reads B's `/api/students/<B>` | **403** |
| A books with B's `studentId` in the body | **403** |
| `POST /api/events` `{"event":"PAGE_VIEW"}` | **200** |
| `POST /api/events` `{"event":"PAYMENT_RECEIVED"}` | **400** |
| `POST /api/payments/invoice` with `amount`/`currency`/`discount` | **409** `PRICE_NOT_CONFIGURED` |
| `POST /api/webhooks/zoho` with no token | **401** |

**Any deviation is a release blocker.** Do not adjust a test to make it pass.

---

## Step 11 — Cleanup, immediately

Delete **only** what Steps 6 and 10 created:

- CRM **Contacts** — the `.invalid` addresses
- CRM **Leads** — none should exist; if any appeared, delete those too

**Never delete Lead `1292318000001187003`** (`tech@richenquest.com`) — preserved by standing
instruction, evidence does not prove it synthetic.

**Verify deletion:**
```
select Last_Name, Email from Contacts where Last_Name is not null
select Last_Name, Email from Leads where Last_Name is not null
```

**Success:** Contacts empty; Leads returns exactly the one preserved record.
**Failure:** any `.invalid` row remaining — delete it before doing anything else. The first real
student must never share a CRM with test data.

---

## Step 12 — Evidence to capture

Keep, for the record:

1. `/api/health` full JSON showing HEALTHY + `crm.reachable: true`
2. The deployed bundle's `apiBaseUrl` string
3. Signup HTTP 201 response (redact the token)
4. The CRM Contact id from Step 7, and the identity `/api/home` resolved in Step 8 — **the proof
   the leadId handoff works**
5. `/api/opportunities` showing the two Hungarian options with separate score and confidence
6. The Step 10 table with actual observed codes
7. Post-cleanup query output proving no test records remain

---

## Rollback

Nothing here writes to a student-facing surface, so rollback is narrow:

- **Backend deploy is bad** → redeploy the previous AppSail build. The frontend keeps working;
  intelligence routes return honest 409s.
- **Frontend bundle is bad** → redeploy with the previous known-good `VITE_API_BASE_URL`.
- **Test data leaked into CRM** → Step 11 is the rollback; run it before anything else.
- **Health never reaches HEALTHY** → stop. Leave the backend deployed but do not announce, do not
  onboard a student, do not activate consent. A DEGRADED backend is safe: it refuses honestly.

---

## What this runbook does *not* unblock

Completing every step above still leaves the product unable to lawfully take a real student:

- **Consent** stays inactive until an advocate approves wording (`shared/consent.js`).
- **Pricing** stays fail-closed until the founder sets real prices.
- **The customer domain** stays stale until the Slate binding moves off resource
  `7264000000019003`.

Those are tracked in `FOUNDER-ACTIONS.md`. This runbook proves the *engine* works. It does not
make the business ready.
