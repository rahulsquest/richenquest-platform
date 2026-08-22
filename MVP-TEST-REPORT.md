# MVP-TEST-REPORT.md

**Date 2026-08-23.** Every line is either EXECUTED (command run, output observed) or
BLOCKED with the reason. Nothing is marked passed by inference.

## Executed and passing

| # | Test | Result | Evidence |
|---|---|---|---|
| 1 | Website build reproducible | **PASS** | `d4a8fecd` on three separate runs |
| 2 | Claims guard | **PASS** | 20 pages clean |
| 3 | Link integrity | **PASS** | 984 internal references resolve |
| 4 | Edge config generation | **PASS** | 9 path rules + redirects |
| 5 | Live site responds | **PASS** | `richenquest.pages.dev` HTTP/2 200 |
| 6 | Live asset hash = local build | **PASS** | live `site.css?v=d4a8fecd` |
| 7 | Critical routes | **PASS** | 10/10 return 200 |
| 8 | Real 404 | **PASS** | `/nosuchpage-404test` → 404 |
| 9 | Live security headers | **PASS** | HSTS, CSP, XFO, XCTO on Pages |
| 10 | No wildcard CORS | **PASS** | `ALLOWED_ORIGIN` pinned, fails closed |
| 11 | No secrets in public repo | **PASS** | no credential patterns in tracked files |
| 12 | No placeholders | **PASS** | zero `{{TOKEN}}` / `910000000000` in source |
| 13 | CRM API reachable | **PASS** | MCP connector authenticated (was failing in prior sessions) |
| 14 | Opportunity model created | **PASS** | 3 fields created on Accounts |
| 15 | Opportunity model backfilled | **PASS** | 23/23 records typed; 2 correctly marked Service Vendor |
| 16 | Unpushed commits scope-safe | **PASS** | 0 Project Titan paths, `website/` untouched |

## BLOCKED — tooling, not logic

| # | Test | Blocked by |
|---|---|---|
| 17 | Deploy `matchOpportunities` | **No `crm.zoho.in` browser tab.** `scripts/deploy-function.sh` drives Deluge deployment through an authenticated Chrome tab (osascript → `X-ZCSRF-TOKEN`). The MCP connector exposes records and fields but **no function-create capability**. |
| 18 | Synthetic-student end-to-end run (Part D) | Depends on 17 |
| 19 | Roadmap generation | Not written — depends on 17 landing first |
| 20 | Mentor model | **No module-create capability** in MCP; browser channel down |
| 21 | Student dashboard | Deferred — would render an engine that is not yet deployed |
| 22 | Push 10 local commits | **No git credential.** `git push --dry-run` → *could not read Username*; osxkeychain holds no entry |
| 23 | Repo secrets / branch protection / production reviewer | **`gh` CLI not installed, `brew` not available**, and no token in the keychain to call the REST API |

## Honest position on Part C and Part D

The **data model is live and verified in the CRM**. The **matching engine is written and
architecturally complete** — 320 lines, deterministic, explainable, verification-gated —
but it is **source only. It has not been deployed and it has not been executed.**

I will not report a synthetic-student journey as passing when the engine behind it never
ran. Part D is genuinely not done.

## Unblocking step (30 seconds, founder)

Open **`https://crm.zoho.in`** in Chrome and leave the tab open. That single action restores
the Deluge deployment channel, after which items 17–19 and 21 can be completed and Part D
executed.
