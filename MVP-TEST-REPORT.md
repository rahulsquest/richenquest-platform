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

---

# Addendum — 2026-08-23, blocker-closing pass

## Step 5 executed (the only step not credential-blocked)

**Verified and written to CRM:** University of Pécs tuition — EUR 2,200–3,900/semester for
business and social sciences (EUR 4,400–7,800/yr), application fee EUR 100–200. Source:
`international.pte.hu/admission/fees`, the university's own published fee table.
`Verified_On` 2026-08-23.

**Deliberately NOT written:** METU living cost. METU's only published figure is the
promotional phrase *"only EUR 500 per month or even less"* — marketing copy, not a costed
breakdown. Writing it would have pushed METU through the matching engine's verification
gate and put a marketing claim into a family's cost total. `Confidence_Finance` set to LOW
with the reason recorded instead.

**Operational finding:** METU's only published deadlines are Fall 2026 — non-EU 30 June
2026 (**passed**) and EU/visa-free 31 August 2026. No February 2027 date is published.

## Opportunity completeness after this pass

| State | Count | Which |
|---|---|---|
| Fully rankable (tuition + living + deadline + source + verified date) | **1** | Debrecen |
| Tuition verified with source and date | **4** | Debrecen, METU, EU Business School, Pécs |
| Living cost recorded | 3 | Debrecen, Vistula, (Pécs pending) |
| Deadline recorded | 1 | Debrecen |

The binding gap is unchanged and now confirmed twice: **tuition is published; living costs
and deadlines are mostly not.** Four fetch attempts across `pte.hu` and `metropolitan.hu`
returned link stubs or navigation hubs. This is an email task, not a research task.

## Steps blocked, with the evidence

| Step | Blocked by |
|---|---|
| 1 DNS | Zone is on **GoDaddy** (`ns71/ns72.domaincontrol.com`), not Cloudflare. No GoDaddy credential, no Cloudflare credential, `wrangler` not installed |
| 2 Slate | `zcatalyst-cli 1.27.0` has no remote delete; `slate:unlink` is local-only |
| 3/4 CRM engine | No `crm.zoho.in` tab → Deluge deploy channel down. MCP has records/fields but **no function-create** |
| 6 GitHub | `gh` absent, `brew` absent, osxkeychain holds no github.com credential |
| 7 Push | `git push --dry-run` → *could not read Username* |
