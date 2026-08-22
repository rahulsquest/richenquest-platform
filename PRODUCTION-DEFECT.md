# ⚠️ PRODUCTION DEFECT — the customer-facing domain is NOT the verified deployment

**Found 2026-08-23 by DNS + live header inspection. Not previously recorded anywhere.**

## The finding

`www.richenquest.com` — the domain customers actually visit — is **not** served by Cloudflare
Pages. It is served by **Catalyst Slate**, the platform ADR-006 and ADR-007 rejected.

```
www.richenquest.com
  → CNAME slate-7264000000004029-in.nimbuspop.com
  → CNAME nimbuspop.com            (169.148.146.124)

rq-site-ysgqnszn.onslate.in
  → CNAME nimbuspop.com            ← SAME infrastructure
```

## Evidence — two different websites

| | www.richenquest.com (live to customers) | richenquest.pages.dev (verified) |
|---|---|---|
| `<title>` | RichenQuest Global — Study Abroad, Scholarships & Global Careers | RichenQuest — Global Education & Career Mobility Platform |
| Size of `/` | **1,058,885 bytes** | 31,002 bytes |
| References `site.css` | **no (0 matches)** | yes, `?v=d4a8fecd` |
| Content-Security-Policy | **ABSENT (0 headers)** | present, strict |
| Cache-Control on HTML | **`public, max-age=31536000`** (1 year) | `public, max-age=0, must-revalidate` |
| Platform | Catalyst Slate (rejected by ADR-007) | Cloudflare Pages (accepted by ADR-007) |

The two are **not the same site at different versions**. They are different builds of
different vintage. The correct, secure, claims-guarded 20-page build is live only at
`pages.dev`, where no customer will ever see it.

## Why this matters

1. **No CSP on the customer-facing domain.** The strict policy that has been written,
   generated and verified is delivered to nobody.
2. **HTML cached for one year.** A correction to a price or a legal page will not reach
   returning visitors. This is the exact defect ADR-007 scored as a Slate FAIL.
3. **Claims-guard is not protecting production.** The gate runs against `website/src`, which
   builds the Pages site. The Slate site was never subject to it.
4. **ADR-007 is recorded as ACCEPTED and IMPLEMENTED.** It is accepted, and it is
   implemented at `pages.dev` — but the DNS cutover never happened, so in practice the
   decision was never enforced.

## Second finding — `apply.richenquest.com` does not exist

```
Host apply.richenquest.com not found: 3(NXDOMAIN)
```

`portal/worker.js` sets `ALLOWED_ORIGIN = "https://apply.richenquest.com"`. That fails
closed, so it is not a security hole — but the student application origin does not resolve,
so the worker path cannot serve anyone.

## Founder actions (console/DNS only — no code change)

1. **Repoint `www.richenquest.com`** (and the apex) at the Cloudflare Pages project
   `richenquest`. This is the ADR-007 cutover that was decided but never executed.
2. **Delete both Slate deployments** — `rq-site-ysgqnszn.onslate.in` and the app behind
   `www`. The CLI cannot do this: `slate:unlink` removes only *local* configuration and
   there is no remote delete command in zcatalyst-cli 1.27.0. Console action.
3. **Create `apply.richenquest.com`** pointing at the portal, or change `ALLOWED_ORIGIN` to
   the origin actually used.

Until 1 and 2 are done, RichenQuest's public website is unprotected and stale.
