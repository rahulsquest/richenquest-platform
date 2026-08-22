# DEPLOYMENT-CHECKLIST.md

Every row is either VERIFIED (a command was run and its output observed) or NOT VERIFIED.
No row is marked from inference. Audit date **2026-08-23**.

## Build and code integrity

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Build succeeds | **VERIFIED** | `node website/build.mjs` → 20 pages, 47 ms |
| 2 | Build reproducible | **VERIFIED** | two consecutive runs both `d4a8fecd` |
| 3 | Claims guard | **VERIFIED PASS** | 20 pages clean against Verified Claims Library |
| 4 | Internal links/assets | **VERIFIED PASS** | 984 references across 20 pages resolve |
| 5 | Edge config generation | **VERIFIED PASS** | `_headers` (9 rules) + `_redirects` written |
| 6 | HTML validation | **NOT RUN** | CI step exists; not executed locally this session |
| 7 | Lighthouse CI | **NOT RUN** | CI step exists; requires headless Chrome run |
| 8 | Working tree clean | **VERIFIED** | only the three audit docs added |

## Live deployment — Cloudflare Pages (current hosting, ADR-007)

| # | Check | Result | Evidence |
|---|---|---|---|
| 9 | Site responds | **VERIFIED** | `https://richenquest.pages.dev/` → HTTP/2 200 |
| 10 | Asset hash matches local | **VERIFIED** | live `site.css?v=d4a8fecd` = local build |
| 11 | Critical routes | **VERIFIED** | 6/6 routes 200 |
| 12 | Real 404 | **VERIFIED** | `/nosuchpage` → 404 (not soft-404) |
| 13 | Static assets | **VERIFIED** | css/js/svg all 200, correct content types |
| 14 | HSTS | **VERIFIED** | `max-age=31536000; includeSubDomains` |
| 15 | CSP | **VERIFIED** | `default-src 'self'`, `frame-ancestors 'none'` |
| 16 | Clickjacking | **VERIFIED** | `X-Frame-Options: DENY` |
| 17 | MIME sniffing | **VERIFIED** | `X-Content-Type-Options: nosniff` |
| 18 | HTML cache policy | **VERIFIED** | `public, max-age=0, must-revalidate` |

## Security

| # | Check | Result | Evidence |
|---|---|---|---|
| 19 | No wildcard CORS | **VERIFIED** | `worker.js` ALLOWED_ORIGIN = `https://apply.richenquest.com` |
| 20 | No placeholder config | **VERIFIED** | zero `{{TOKEN}}` / `910000000000` in source |
| 21 | No secrets in repo | **VERIFIED** | only `secrets.*` / `env` *references* in workflows |
| 22 | Project ID not a secret | **VERIFIED** | `53691000000016002` inline, correctly commented |
| 23 | Superseded host secured | **FAIL** | Slate host live, **0 CSP headers**, stale build |

## Credentials and protection

| # | Check | Result | Evidence |
|---|---|---|---|
| 24 | Catalyst CLI present | **VERIFIED** | v1.27.0 |
| 25 | Catalyst authenticated | **VERIFIED** | `catalyst whoami` → rahul@richenquest.com |
| 26 | Local shell credentials | **VERIFIED ABSENT** | none of the 4 env vars set (correct) |
| 27 | GitHub repo secrets | **NOT VERIFIED** | `gh` CLI not installed |
| 28 | `production` env reviewer rule | **NOT VERIFIED** | `gh` CLI not installed |
| 29 | Branch protection on `main` | **NOT VERIFIED** | `gh` CLI not installed |

## Git reconciliation

| # | Check | Result | Evidence |
|---|---|---|---|
| 30 | `ad142cd` exists | **VERIFIED** | on `fix/structured-data-integrity` |
| 31 | `d2131a5` exists | **VERIFIED** | same branch; **content already identical in HEAD** |
| 32 | `0682e065` is a commit | **VERIFIED FALSE** | not a git object — it is a build hash |
| 33 | fix-branch content missing? | **VERIFIED NO** | 27 same / 15 HEAD-newer / 1 gitignored |
| 34 | `origin/main` in sync | **NO** | local is **10 ahead, 0 behind** |
| 35 | `release/rc-1` reconciled | **NO — founder decision** | +79 / −105, separate implementation |

## Production gate (Phase 5)

| Requirement | Status |
|---|---|
| 1. Code committed | **PASS** — clean tree, 10 commits pending push |
| 2. Tests pass | **PARTIAL** — 3 gates pass; HTML validate + Lighthouse not run |
| 3. Staging works | **PASS** — live site verified, hash matches local |
| 4. Protection/reviewer verified | **BLOCKED — NOT VERIFIED** (no `gh`) |
| 5. Required secrets exist | **PARTIAL** — Cloudflare pair inferred working; unverified directly |
| 6. Security checks pass | **FAIL** — item 23, stale Slate host without CSP |
| 7. Production path verified | **PASS for Pages**, **HALTED for Catalyst** by ADR-006 |
