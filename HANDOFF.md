# RichenQuest — Engineering Handoff (canonical)

**Generated:** 2026-07-23, from a full repository audit (git + source + docs).
**Repo:** `/Users/uniquestrahul/Desktop/RichenQuest Project` · **Branch:** `release/rc-1` @ `40e89cc` · **Working tree:** clean.
**Method:** Built only from repository evidence. Every claim cites a source. Anything not provable from the repo is marked **UNKNOWN**. Chat history was intentionally ignored per instruction.

> ## 🏁 AM0.4 AUTOMATION COMPLETE — 2026-07-23 (read this first)
> **Acceptance: 6 PASS · 1 PARTIAL · 7 MANUAL · 0 FAIL.** Reproduce any time:
> `node --env-file=.env functions/zoho/verify-crm.mjs` (read-only, exit 0 = no failures).
>
> **Automated via API this session** (all verified by read-back, all idempotent):
> | Item | Result |
> |---|---|
> | 21 custom fields (Leads 12 + Student Cases 9, incl. Lost Reason) | ✅ live |
> | `Assigned Counselor` userlookup | ✅ live (schema said "unreliable via API" — **that was wrong**) |
> | Module rename Deals → **Student Cases** | ✅ live |
> | **11-stage pipeline** w/ exact probabilities + forecast categories | ✅ live |
> | Email duplicate-check (`unique`) | ✅ live |
> | Roles: Counselor, Operations, Marketing (under Manager) | ✅ live |
> | Assignment rule `Student Lead Routing` | 🟡 created (criteria need real user ids) |
> | Data sharing Leads/Deals = private | ✅ verified already correct |
> | Zoho sample data (10 Deals + 10 Leads) purged | ✅ removed |
>
> **Six items in `console_only` turned out to BE API-addressable** and were automated. The list in
> `config/crm-schema.json` now contains only items *proven* impossible (see Platform limits below).
>
> **New reusable engineering** (not one-off scripts):
> - `functions/zoho/provision-pipeline.mjs` — config-driven, idempotent, atomic pipeline provisioning.
> - `functions/zoho/verify-crm.mjs` — API-generated acceptance evidence (replaces screenshots).
> - `scripts/validate-crm-schema.mjs` — CI gate for schema/pipeline invariants (positive+negative tested).
> - `oauth.mjs` — file-backed token cache + single-flight refresh (Zoho rate-limits refreshes hard;
>   this eliminated the `Access Denied` lockouts hit during this session). 28/28 tests pass.
>
> ### ⚠️ Platform limits — PROVEN, not assumed
> | Blocked item | Proof |
> |---|---|
> | Lost Reason validation rule | `POST /settings/validation_rules` returns **HTTP 500 INTERNAL_ERROR** on a schema-valid payload (every required field satisfied, `alert` as text per Zoho's own `expected_data_type`), on **both v7 and v8**. Zoho-side defect. |
> | 5 Workflow Rules | Rule creation requires ≥1 **action entity**; `POST /settings/automation/tasks` → `INVALID_REQUEST` (read-only endpoint). Rules/criteria ARE creatable via **v8** — only the actions are not. |
> | Users + 2FA | `/users` → `OAUTH_SCOPE_MISMATCH` (needs `ZohoCRM.users.ALL`); 2FA enforcement lives in Zoho **Admin Panel**, which has no CRM API. |
> | Cliq channels | Needs Cliq OAuth scopes, absent from the current token. |
>
> ### 🔑 Key API contract discovered (documented in provision-pipeline.mjs)
> A `pick_list_values` PATCH is treated by Zoho as the **COMPLETE layout-associated set** — a partial
> list silently de-associates every omitted option (values survive in the pool but vanish from the
> layout). This bit us mid-session and was repaired; the provisioner now *only* sends atomic full lists.
> Renames must keep `actual_value` (the stored value) and change `display_value` only.
>
> ### 🧹 Cleanup I owe you — duplicate Cliq channels (my error)
> **AM0.8 channels are created**, but I made duplicates. I assumed Cliq would reject duplicate names
> and wrote that assumption into the code *without verifying it first*, then ran it twice plus a probe.
> Verified live: Cliq **allows duplicate names** (each POST returns a new id) and has **no delete API**
> (`DELETE /channels/{id}` → `request_url_invalid`). So only you can remove them, in the Cliq UI.
>
> | Channel | Exists | Keep | Delete |
> |---|---|---|---|
> | `#leads` | 3 | 1 | **2** |
> | `#wins` | 2 | 1 | **1** |
> | `#finance-approvals` | 2 | 1 | **1** |
> | `#ops-alerts` | 2 | 1 | **1** |
> | `#daily-updates` | 2 | 1 | **1** |
>
> **UI path:** Cliq → Channels → open the duplicate → ⋮ → Delete Channel. ~3 min, ~4 clicks each
> (6 deletions). Keep whichever copy you prefer — all are empty and equivalent.
>
> **Fixed so it cannot recur:** `services/cliq.mjs` now lists channels first and creates only what is
> missing, and **aborts** if it cannot read the channel list rather than creating blind. Verified live
> (it correctly refuses today, since the token lacks `ZohoCliq.Channels.READ`). 3 new tests cover it.
>
> ### 👤 Users — AM0.2 is genuinely NOT done
> Live org read: **1 user only** (Rahul Kumar, CEO/Administrator). 10 licences available
> (`zohooneenterprise` trial). The other 6 contributors do not exist in CRM. I cannot create them:
> `config/tenant-richenquest.json` → `contributors.roster` has **no email addresses**, and user
> creation emails real people. Supply the 6 emails and I can provision them via API (`ZohoCRM.users.ALL`
> is now granted). Roles are already created and waiting: Counselor · Operations · Marketing.
> This is also why **A7 is PARTIAL** — the assignment rule has no real assignees to route to.
>
> ### Next actions
> 1. **One re-consent** unlocks users + Cliq (URL in the final report) — optional, only if you want me
>    to provision users/channels via API rather than console.
> 2. Console work remaining (~25 min): validation rule + 5 workflows. Everything else is done.

> ## ⚡ STATUS UPDATE — 2026-07-23 (supersedes §5 B1–B3, §9 U1–U2, §14 steps 1–3 below)
> All `VERIFIED (session)`, live against production Zoho (IN DC):
> 1. **OAuth OPERATIONAL.** Fresh refresh token minted via founder consent (2nd grant code; the 1st expired in transit — grant codes live ~1–2 min). Exchange granted scopes `ZohoCRM.modules.ALL ZohoCRM.settings.ALL`, api_domain `https://www.zohoapis.in`. `verify.mjs` → ✓, access token issued, expires_in 3600s. `.env` patched (backup `.env.pre-remint.bak`, gitignored; token hashes only, never printed).
> 2. **Live CRM provisioning EXECUTED.** Dry-run plan: 19 create / 1 manual — matched spec exactly and proved the live CRM had none of our fields (confirming H1). `--commit`: **19/19 fields created, 0 failed**, each verified by post-create read-back. Follow-up dry-run: **19 skipped / 0 created** → idempotency + independent live confirmation.
> 3. **Remaining for AM0.4:** the console-only items (Deals→Student Cases rename, 11-stage pipeline + Lost Reason validation, Email duplicate-check, Assignment Rule, 5 Workflows + heartbeats, data sharing) + the manual `Assigned Counselor` user-lookup field + acceptance evidence A1–A13. API-side structural evidence for A3/A4 now exists (field creation read-back verified; picklist values sourced from config by construction).
> 4. Root-cause history of the OAuth failure (differential probes, chain-of-custody, expired-grant-code race) is preserved in §5 below for the audit trail.

> **Provenance legend** — how each fact is backed:
> - `VERIFIED (session)` — I re-ran/inspected it in this audit; output shown or cited.
> - `VERIFIED (repo)` — directly present in a committed file (path/commit cited).
> - `REPORTED` — asserted by the founder and recorded in a doc; **not** independently re-checked this session.
> - `PRIOR-SESSION` — verified in an earlier session and logged; not re-checked this session.
> - `HYPOTHESIS` — plausible inference, **not** a fact.
> - `UNKNOWN` — cannot be proven from the repository.

---

## 1. Project overview

RichenQuest is a study-abroad platform (India/Nepal/Pakistan → Europe-first destinations). This repository contains **two separable workstreams**:

1. **Marketing website** — a zero-dependency static site (`website/`), built by `website/build.mjs`, feature-complete at RC-1 (19 pages). `VERIFIED (repo)`: [RELEASE-LOG.md](RELEASE-LOG.md) lines 12–16; `git tag` shows `v1.0.0-rc.1`.
2. **Operations automation ("Titan OS")** — a server-side Zoho One integration layer (`functions/zoho/`) plus a config-driven CRM-provisioning engine, tracked in [AUTOMATION-LOG.md](AUTOMATION-LOG.md). This is the **active front of work**.

**Critical decoupling** `VERIFIED (repo)` ([RELEASE-LOG.md:47–54](RELEASE-LOG.md)): the live site **www.richenquest.com is served by Zoho Sites** (WYSIWYG, server `ZGS`) and is **not** powered by this repo. No git branch can change the live site until a DNS cutover.

Architecture is declared **frozen** (Files 16–19); changes may come only from proven implementation gaps recorded in [AUTOMATION-LOG.md §7](AUTOMATION-LOG.md). `VERIFIED (repo)`.

---

## 2. Current architecture

**Website** `VERIFIED (repo)` (ADRs in `docs/adr/`):
- ADR-001 static vanilla stack · ADR-002 zero-dependency build · ADR-003 Zoho backend, no database · ADR-004 Catalyst hosting + GitHub CI/CD · ADR-005 claims-guard.
- Build: `website/build.mjs` (8.9 KB, reads `website/src` only). CI gates in [.github/workflows/ci.yml](.github/workflows/ci.yml): build → claims-guard → link check → functions syntax-check → functions tests → config validation → HTML validation → Lighthouse.

**Zoho integration layer** (`functions/zoho/`) `VERIFIED (repo)` ([functions/zoho/README.md](functions/zoho/README.md)):
- `config.mjs` — per-DC host map (in/us/eu/au/jp/ca), env reading/validation, secret redaction. Default DC `in`.
- `http.mjs` — `fetchWithTimeout` (15 s AbortController), `parseJson`, `ZohoError`, `retryAsync` (linear backoff, transient-only).
- `oauth.mjs` — refresh-token → access-token manager, in-memory pluggable cache, 60 s early-refresh; `exchangeAuthCode` (one-time code→refresh), `verifyToken`.
- `client.mjs` — `zohoRequest()`: authed fetch, per-service base URL, one transparent 401-retry, normalized errors, never logs tokens.
- `services/` — `crm.mjs` (`createOrUpdateLead` dedupe on Email/Phone — the funnel-critical one), `crm-settings.mjs` (field metadata CRUD used by provisioning), `mail`, `bookings`, `analytics`, `forms`, `salesiq`, `flow` (webhook-triggered, host-validated).
- `scripts/` — `auth-url.mjs`, `exchange-code.mjs`, `verify.mjs`.
- **Zero runtime dependencies** (native `fetch`, Node ≥ 20). Server-side only; `index.mjs` barrel is never imported by the site build (`VERIFIED (repo)`: [functions/zoho/index.mjs:8–11](functions/zoho/index.mjs)).

**CRM provisioning engine** `VERIFIED (repo)` ([functions/zoho/provision-crm.mjs](functions/zoho/provision-crm.mjs)):
- Pure `planProvision` / `planRollback` + injectable-`api` `executeProvision` / `executeRollback` (unit-testable without network/token).
- Reads `config/crm-schema.json` (field defs) + `config/tenant-richenquest.json` (picklist source of truth).
- Modes: dry-run (default) / `--commit` / `--rollback`. Commit path: create → verify by read-back → auto-retry transient (`INTERNAL_ERROR`, `RATE_LIMIT_EXCEEDED`, `REQUEST_TIMEOUT`). Rollback deletes only `custom_field:true` fields.

**Config-as-contract** `VERIFIED (repo)` ([config/tenant-richenquest.json](config/tenant-richenquest.json)): "Tenant Zero" pattern — markets, destinations, languages, lead types, 7-person roster, ownership roles, licensing, 7 service packages, configurable assignment engine (3-phase). No geography/routing hardcoded.

---

## 3. Current implementation status

| Area | Status | Evidence |
|---|---|---|
| Marketing website (M0–M3, 19 pages) | **Complete at RC-1** | `git tag v1.0.0-rc.1`; [RELEASE-LOG.md:12–16](RELEASE-LOG.md) |
| Zoho OAuth + API client layer | **Built** | commit `41ea457`; `functions/zoho/*` |
| Client-side Zoho embeds (dormant) | **Built** | commit `26ed0d9`; `website/src/.../zoho-*.js` |
| CRM provisioning engine (API-addressable fields) | **Built + unit-verified; NOT yet run live** | commits `634cbf0`,`40e89cc`; see §7 |
| Functional test suite (Zoho layer) | **22/22 pass** | `VERIFIED (session)` — see §7 |
| Config validator + CI gate | **Passing** | `VERIFIED (session)` — see §7 |
| AM0.4 CRM spine (console-only parts) | **Not started** (awaiting execution) | [AM0.4-acceptance-report.md](docs/automation-specs/AM0.4-acceptance-report.md): 0/13 |
| AM0.5–0.10, AM1+ | **Not started** | [AUTOMATION-LOG.md §3](AUTOMATION-LOG.md) |

**Branch state** `VERIFIED (session)`: `release/rc-1` (`40e89cc`) is **20 commits ahead of `main`** (`4cfabaa`), 0 behind. `main` is frozen at the RC-1 cut and only advances on explicit founder-approved production cutover ([RELEASE-LOG.md:42–45](RELEASE-LOG.md)).

---

## 4. Completed milestones

`VERIFIED (repo)` (git tags + commits) unless noted:

- **M0 foundation** — design system, tokens, components, build system (`81f47e1`, `ba624a0`).
- **M1 homepage** (`4d6100e`, `dbedb40`, `0d2feaa`); **M2 pages** — services/about/contact/success/legal (`47d4cef`); **M3 destinations** — hub, 7 Tier-1 guides, Nepal landing (`948f2b3`).
- **FAT baseline** — tag `v0.3.0-fat` (19 pages, claims-guard green).
- **RC-1 cut** — tag `v1.0.0-rc.1` (feature-complete, production pipeline ready).
- **Server-side Zoho OAuth layer + API clients** (`41ea457`).
- **Architecture docs frozen** — Files 15–19 (`31118db`,`06de1d1`,`876f885`,`60a607c`,`0c708b7`).
- **Config Validation gate** (`7b3a276`) and **functional test suite + CI gate** (`47d077b`).
- **CRM provisioning engine** built and hardened (`634cbf0`,`40e89cc`).

**Foundation items reported/verified done (Zoho side):**
- **AM0.1 Zoho One activation, India DC** — `REPORTED` (founder-confirmed) per [AUTOMATION-LOG.md §2, §3](AUTOMATION-LOG.md).
- **AM0.3 Mail DNS (MX/SPF/DKIM), India DC** — `PRIOR-SESSION` (independent `dig` showing `mx.zoho.in` + SPF + DKIM), logged in [AUTOMATION-LOG.md:14–16](AUTOMATION-LOG.md). Not re-run this session.

> ⚠️ Note: the AM0.1 doc predates later decisions and says "**5 users**" ([AM0.1-zoho-activation.md:36–37](docs/automation-specs/AM0.1-zoho-activation.md)), while the current tenant config carries a **7-person roster** ([config/tenant-richenquest.json:26–34](config/tenant-richenquest.json)) — reconciled by OI-2 "licensing is configurable" ([AUTOMATION-LOG.md §8](AUTOMATION-LOG.md)). Treat the 7-person roster as current.

---

## 5. Current blockers

> **This is the single most important correction in this handoff.** The last log entry ([AUTOMATION-LOG.md:58](AUTOMATION-LOG.md), commit `40e89cc`, 2026-07-22) states: *"Only blocker = OAuth token (founder consent)."* **New evidence contradicts that framing.**

**B1 — OAuth token: a value is present, but it does NOT authenticate.** `VERIFIED (session)`
- Presence check of `.env` (values never printed): `ZOHO_REFRESH_TOKEN = SET (non-empty)`, and `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REDIRECT_URI`, `ZOHO_DC`, `ZOHO_SCOPES` are all set.
- `ZOHO_SCOPES = ZohoCRM.modules.ALL,ZohoCRM.settings.ALL` — includes `settings.ALL`, which provisioning requires ([services/crm-settings.mjs:5](functions/zoho/services/crm-settings.mjs)).
- **But the token is functionally invalid.** A live read-only refresh (`verify.mjs`, 2026-07-23) → **FAILED**. See B2. So the log's original "blocker = OAuth token" **still holds at the functional level** — a *value* exists, a *working token* does not.

**B2 — Refresh token REJECTED by Zoho (`invalid_code`).** `VERIFIED (session)` — 2026-07-23
- `node --env-file=.env functions/zoho/scripts/verify.mjs` → `✗ Token refresh failed: invalid_code`, exit 1.
- Read-only HTTP trace: `POST https://accounts.zoho.in/oauth/v2/token` (grant_type=refresh_token) → **HTTP 200**, body `{"error":"invalid_code"}`, no `access_token`. Failure surfaces correctly at [oauth.mjs:64](functions/zoho/oauth.mjs) — **not a code bug**.
- **Ruled out by evidence:** network/DNS/TLS/DC-host (clean 200 from `accounts.zoho.in`); malformed request (semantic OAuth error, not `invalid_request`); **bad client credentials** (Zoho returns `invalid_client` for those — we got `invalid_code`, implicating the *refresh-token value*).
- **Open sub-cause (not disambiguable from one response, do not guess):** token invalid / revoked-superseded / a single-use grant code pasted in / minted under a different app or DC. Credential shapes are all well-formed (`client_id` `1000.…` len 35; `refresh_token` `1000.<hex>.<hex>` 3 segments len 70).
- **Differential OAuth diagnosis (2026-07-23) — root cause PROVEN.** Mutating one credential at a time against `accounts.zoho.in/oauth/v2/token`: bogus client_id → `invalid_client`; bogus secret → `invalid_client_secret`; real credentials → `invalid_code`; **bogus refresh token → `invalid_code` (identical to baseline)**. Cross-DC: same client_id at `accounts.zoho.com` → `invalid_client`. Conclusion: **Client ID valid (IN DC), Client Secret correct, DC `in` correct; the stored refresh token is indistinguishable from garbage to Zoho — the token itself is dead.** App Name/Scopes/Redirect URI are not transmitted in the refresh grant and cannot affect `verify.mjs`. Redirect-URI registration is unverifiable anonymously (control probe: Zoho redirects to signin for valid AND bogus URIs alike) and console access is blocked (Chrome extension lacks site permission for api-console.zoho.in); it is validated loudly at the consent page during re-mint. **Only remaining action: founder browser consent to mint a new refresh token.**
- **Chain-of-custody verified (2026-07-23):** no local handling bug. SHA-256 of the token is **identical** across `.env` on disk → `process.env` (what `verify.mjs` uses) → HTTP POST body (`398cec48…fb6a`); structurally perfect (70 = `1000.`+32hex+`.`+32hex, single line, no CR/quotes/whitespace, encoding lossless); code path performs no trim/parse/split/encode. The only unhashable link is the historical terminal→`.env` paste (exchange-code output was never persisted; no shell history / `.env` backup exists) — but its structural integrity rules out truncation/wrap corruption. **Conclusion: the pipeline is not corrupting the token; Zoho is rejecting the value itself.**
- **Fix (founder-gated, needs browser consent):** re-mint via `auth-url.mjs` → approve → `exchange-code.mjs` → paste into `.env` → re-run `verify.mjs`.

**B3 — CRM provisioning has never been run against live Zoho.** `HYPOTHESIS` (strong)
- Acceptance report shows **0/13 verified**, with A3/A4 (the exact fields `provision-crm.mjs` creates) still ⏳ AWAITING ([AM0.4-acceptance-report.md:5,12–13](docs/automation-specs/AM0.4-acceptance-report.md)).
- No run artifacts/logs are committed (`VERIFIED (session)`: git search for run logs = none), working tree is clean. Together these strongly indicate the engine's **live commit run has not happened**. (Cannot be 100% proven — a run leaves no repo trace — hence HYPOTHESIS.)

**B4 — Console-only AM0.4 steps require a human (Harsh) in the Zoho console.** `VERIFIED (repo)`
- Not API-addressable: module rename Deals→Student Cases, 11-stage pipeline + Lost Reason validation, Email duplicate-check, Assignment Rule, 5 Workflow Rules, data-sharing Private+hierarchy ([config/crm-schema.json:29–32](config/crm-schema.json); [AM0.4-crm-spine.md STEP 1,4–8](docs/automation-specs/AM0.4-crm-spine.md)).

**B5 — AM0.2 (users/roles/2FA) and AM0.8 (Cliq channels) are unconfirmed prerequisites** for AM0.4's *workflow* layer. `VERIFIED (repo)` ([AUTOMATION-LOG.md:34–35](AUTOMATION-LOG.md): both ❓). The CRM *structure* can proceed without them; the *workflows* cannot.

---

## 6. Open bugs

**None evidenced.** `VERIFIED (session)`:
- `node --test "functions/**/*.test.mjs"` → **22 pass / 0 fail**.
- `node scripts/validate-config.mjs` → valid, exit 0.
- `find functions -name "*.mjs" | xargs -n1 node --check` → all parse OK.
- Working tree clean; no failing gate.

The only `TODO` marker in tracked files is `docs/12-legacy-site-audit-and-migration.md:10`, describing a `TODO: connect to Zoho` in the **archived legacy one-pager** — historical, not a defect in current code. No bugs are being invented to fill this section.

---

## 7. Verified facts (evidence-backed only)

Run this session (`VERIFIED (session)`):
1. **Test suite: 22 tests, 22 pass, 0 fail** (`node --test "functions/**/*.test.mjs"`). Coverage spans config/DC resolution, oauth caching+force-refresh+error surfacing, `zohoRequest` 401-retry + header + error normalization, CRM upsert dedupe/validation, provisioning plan/execute/idempotency/retry/rollback, auth-code exchange, Flow URL guard ([zoho.test.mjs](functions/zoho/zoho.test.mjs)).
2. **Config validator passes** — "7 contributors, 1 active lead type(s), 7 packages", exit 0.
3. **All `functions/**/*.mjs` pass `node --check`.**
4. **`.env` has all six Zoho vars set non-empty**, including `ZOHO_REFRESH_TOKEN`; `ZOHO_SCOPES` = `ZohoCRM.modules.ALL,ZohoCRM.settings.ALL`.
5. **Git:** `release/rc-1`@`40e89cc`, 20 ahead / 0 behind `main`@`4cfabaa`; tags `v0.3.0-fat`, `v1.0.0-rc.1` (the latter resolves to `4cfabaa`); 36 commits total; tree clean.
6. **Schema field count** ([config/crm-schema.json](config/crm-schema.json)): 20 field defs (12 Leads + 8 Student-Case), of which **1 is manual** (`Assigned Counselor`, user-lookup) → **19 API-creatable**. (This matches the mock end-to-end "19 created" in [AUTOMATION-LOG.md:58](AUTOMATION-LOG.md); it corrects the "~18" phrasing in commit `634cbf0`.)

From the repo (`VERIFIED (repo)`):
7. Website RC-1 feature-complete: 19 pages, production pipeline ([RELEASE-LOG.md](RELEASE-LOG.md)).
8. Live site is Zoho Sites, decoupled from this repo ([RELEASE-LOG.md:47–54](RELEASE-LOG.md)).
9. Zoho layer has zero runtime deps and is server-side only ([functions/zoho/README.md](functions/zoho/README.md), [index.mjs:8–11](functions/zoho/index.mjs)).
10. Default DC = India; provisioning requires `ZohoCRM.settings.ALL` ([config.mjs:24](functions/zoho/config.mjs), [crm-settings.mjs:5](functions/zoho/services/crm-settings.mjs)).

---

## 8. Strong hypotheses (NOT facts)

- **H1 — CRM provisioning has not been committed to live Zoho yet.** Basis: acceptance 0/13, A3/A4 awaiting, no run artifacts, clean tree (§5 B3). Confidence: high. Falsifiable by inspecting the live Zoho CRM Leads/Deals field list.
- **H2 — The refresh token was generated recently (between 2026-07-22 log entry and today).** Basis: `.env` mtime is 2026-07-23 and the token is now present though the 2026-07-22 log still calls it the blocker. Confidence: medium. `UNKNOWN` who generated it or with which scopes.
- **H3 — AM0.1/AM0.3 are genuinely complete.** Basis: founder report + prior-session `dig`. Confidence: medium-high, but `REPORTED`/`PRIOR-SESSION`, not re-verified here.
- **H4 — Non-CRM service API base URLs may need correction before first live call.** Basis: explicit in-code caveat ([config.mjs:36–39](functions/zoho/config.mjs)). CRM v7 is called "high-confidence"; others are "documented but confirm." Confidence: medium.

---

## 9. Unknowns (must be resolved with evidence)

- ~~**U1** — Is the refresh token **valid**?~~ **RESOLVED 2026-07-23:** NO — `verify.mjs` → `invalid_code` (see §5 B2). The token must be re-minted. (Whether the *re-minted* token will carry `settings.ALL` is confirmable only after re-mint.)
- **U2** — Has `provision-crm.mjs --commit` run against live Zoho, and what is the current live field state? (Needs a live `getFields` read or the console.)
- **U3** — AM0.2 status: do the 7 users, role hierarchy, and **enforced 2FA** exist? ([AUTOMATION-LOG.md:34](AUTOMATION-LOG.md) ❓)
- **U4** — AM0.8 status: do the 5 Cliq channels exist? ([AUTOMATION-LOG.md:35](AUTOMATION-LOG.md) ❓)
- **U5** — Zoho One seat count actually available (licensing) — config says "configurable, start with available seats"; the real number is `UNKNOWN` ([tenant config `licensing`](config/tenant-richenquest.json)).
- **U6** — Credit type + expiry (promotional vs paid wallet) — the AM0.1 "gotcha"; never reported into any committed file ([AM0.1-zoho-activation.md §1b](docs/automation-specs/AM0.1-zoho-activation.md)).
- **U7** — Are the non-CRM service bases (bookings/forms/mail/analytics/salesiq) correct for the current Zoho API? (H4.)
- **U8** — Was AM0.4's assignment `v1_default_PROPOSED` routing ever confirmed by the founder? (marked "CONFIRM" in [tenant config](config/tenant-richenquest.json:67).)

---

## 10. Files changed recently

Last 24h, working tree / most-recent commit (`VERIFIED (session)`):

- **Commit `40e89cc` (2026-07-23)** — `feat(crm): harden + fully verify provisioning pipeline`: `provision-crm.mjs` (+151/-…), `oauth.mjs` (+34), `http.mjs` (+22), `services/crm-settings.mjs` (+12), `scripts/exchange-code.mjs` (rewrite), `zoho.test.mjs` (+82), `AUTOMATION-LOG.md` (+1). 269 insertions / 80 deletions.
- Files with mtime in last 24h: `AUTOMATION-LOG.md`, `.env` (secrets — untracked), `.claude/settings.local.json`, `functions/zoho/{provision-crm,oauth,http,zoho.test,scripts/exchange-code,services/crm-settings}.mjs`.

Full `release/rc-1` delta vs `main` (`git diff --stat main...HEAD`): 52 files, +4099/−9 — chiefly `functions/zoho/*`, `config/*`, `scripts/validate-config.mjs`, `docs/automation-specs/*`, `docs/19-master-constitution.md`, and dormant `website/src/.../zoho-*` embeds.

---

## 11. Important commits

`VERIFIED (session)` (`git log`):
- `40e89cc` — harden + verify provisioning (rollback/retry/idempotency); 22/22 tests.
- `634cbf0` — autonomous CRM field provisioning engine (API-addressable part of AM0.4).
- `326de6b` — logs the capability finding: **browser UI automation ruled out** (Control_Chrome limited; claude-in-chrome unconnected) → pivot to Zoho CRM **API** for autonomy ([AUTOMATION-LOG.md:59](AUTOMATION-LOG.md)).
- `be69b93` — AM0.4 execution runbook + 13-point acceptance checklist (for Harsh).
- `3eda111` — AM0.4 running acceptance report initialized (A1–A13 awaiting).
- `47d077b` — functional test suite + CI gate.
- `7b3a276` — config validator + CI gate.
- `6900271` — removed team-size headcount from public site (founder OI-1).
- `0c708b7` — Master Constitution v1.0 accepted (File 19); architecture frozen.
- `41ea457` / `26ed0d9` — server-side / client-side Zoho layers.
- `964d005` / `4cfabaa` — branch model; RC-1 cut (`main` frozen here).

---

## 12. Outstanding TODOs

Tracked work (not code comments), by source:
- **AM0.4 console execution (Harsh)** — STEP 1–9 in [AM0.4-crm-spine.md](docs/automation-specs/AM0.4-crm-spine.md): rename module, Lead/Case fields (or run the engine), 11-stage pipeline + Lost-Reason validation, Email dedupe, Assignment Rule, 5 workflows + `#ops-alerts` heartbeats, data-sharing, seed + acceptance test.
- **Collect A1–A13 evidence** and file QA verdicts ([AM0.4-acceptance-report.md](docs/automation-specs/AM0.4-acceptance-report.md)).
- **Confirm AM0.2 + AM0.8** (U3/U4).
- **Confirm** assignment routing defaults, Finance owner, seat/licence count (U5/U8; [AM0.4-crm-spine.md:28–29](docs/automation-specs/AM0.4-crm-spine.md)).
- **Track B (long lead, start in parallel)** — AM0.9 WhatsApp BSP + Meta verification (longest pole), AM0.5 Razorpay+GST, AM0.6 WorkDrive, AM0.7 Vault, AM0.10 Analytics ([AUTOMATION-LOG.md §3](AUTOMATION-LOG.md); [AM0.1 §7](docs/automation-specs/AM0.1-zoho-activation.md)).
- **Website launch checklist** — founder actions 1–8; legal pages carry a visible "draft pending review" label ([RELEASE-LOG.md:16](RELEASE-LOG.md); `docs/13-launch-checklist.md`).
- **Doc TODO (historical)** — `docs/12` legacy-site note; no action in current code.

---

## 13. Risks

- **R1 — Live provisioning writes to production CRM.** `provision-crm.mjs --commit` creates 19 real fields. Mitigated by default dry-run, read-back verification, and `--rollback` ([provision-crm.mjs](functions/zoho/provision-crm.mjs)) — but rollback deletes only fields it can match as custom; **run dry-run first**.
- **R2 — Token/scope uncertainty (U1/U2)** could make the first live call fail or under-provision (missing `settings.ALL` grant). Verify before committing.
- **R3 — Workflow layer blocked by unconfirmed AM0.2/AM0.8 (B5).** Building workflows that reference absent users/channels will fail.
- **R4 — Non-CRM service bases unconfirmed (H4/U7).** First live Mail/Bookings/etc. call may hit a wrong base URL.
- **R5 — Single-founder credential dependency.** All Zoho access hinges on one super-admin identity ([AM0.1 §2](docs/automation-specs/AM0.1-zoho-activation.md)); no documented backup admin.
- **R6 — Live site decoupled from repo.** Site changes require Zoho Sites edits or DNS cutover; nothing in git reaches production yet ([RELEASE-LOG.md:47–54](RELEASE-LOG.md)).
- **R7 — Doc/git drift.** [RELEASE-LOG.md:11](RELEASE-LOG.md) says tag `v1.0.0-rc.1` is at `361be95`, but `git rev-list v1.0.0-rc.1` resolves to **`4cfabaa`**. Minor, but the release log's tag pointer is inaccurate.
- **R8 — Node version drift.** `.nvmrc` pins **22**; this session's local runtime is **v24.18.0**. CI uses `.nvmrc`. Low risk, worth aligning.

---

## 14. Next debugging steps

There is **no active code bug** to debug; "next steps" means the diagnostic sequence to move AM0.4 from built → live. **Steps that touch the live Zoho org need explicit founder go-ahead** (they use real credentials / write to production CRM).

1. ~~Prove the token~~ **DONE 2026-07-23 — FAILED (`invalid_code`), see §5 B2.** Next action is to **re-mint** the refresh token (founder-gated, browser consent required):
   ```bash
   node --env-file=.env functions/zoho/scripts/auth-url.mjs        # open URL, approve
   node --env-file=.env functions/zoho/scripts/exchange-code.mjs <code>   # prints ZOHO_REFRESH_TOKEN
   # paste into .env, then:
   node --env-file=.env functions/zoho/scripts/verify.mjs          # must show ✓ before step 2
   ```
2. **Resolve U2 — read live field state (read-only).** Dry-run the engine (no writes):
   ```bash
   node --env-file=.env functions/zoho/provision-crm.mjs
   ```
   The plan (create/skip/manual per field) reveals exactly what already exists in live CRM.
3. **Commit provisioning (writes 19 fields)** once 1–2 pass and the founder approves:
   ```bash
   node --env-file=.env functions/zoho/provision-crm.mjs --commit
   ```
   Rollback if needed: `… --rollback` (dry-run) then `… --rollback --commit`.
4. **Confirm AM0.2/AM0.8 (U3/U4)** — screenshots per Evidence 0.
5. **Harsh executes console-only steps (B4)** — rename, pipeline+validation, dedupe, assignment, 5 workflows, data-sharing.
6. **Seed test Lead + Student Case; collect A1–A13 evidence**; QA fills verdicts in the acceptance report.
7. On A1–A13 all ✅ → mark AM0.4 ✅ in the log, issue **AM1.1 Speed-to-Lead**.

---

## 15. Current recommended priority order

1. **Verify the token** (`verify.mjs`, read-only) — resolves the critical unknown, cheapest possible, unblocks everything. *(U1/B2)*
2. **Dry-run the provisioning engine** to read live CRM state. *(U2/B3)*
3. **Confirm AM0.2 (users/roles/2FA) + AM0.8 (Cliq)** — cheap prerequisites gating the workflow layer. *(B5/U3/U4)*
4. **Commit provisioning** (19 API fields), founder-approved, dry-run-first. *(R1)*
5. **Harsh: console-only AM0.4 build** (rename, pipeline, dedupe, assignment, 5 workflows, data-sharing). *(B4)*
6. **Acceptance test A1–A13**; file QA verdicts; mark AM0.4 ✅ only when all pass. *(§12)*
7. **In parallel, Track B** — start AM0.9 WhatsApp BSP + Meta verification (longest external lead time). *(§12)*
8. **Housekeeping (low priority):** fix RELEASE-LOG tag pointer (R7), align Node version (R8), confirm non-CRM service bases before first use (U7).

---

### Appendix — OAuth config baseline (recorded 2026-07-23 05:30:43 IST, pre-token-regeneration)
Snapshot taken before re-minting the refresh token, so a still-failing fresh token can be diagnosed against a known baseline (per founder instruction).
- **OAuth App Name:** `rahulsquest` — *repo docs, not live-verified against Zoho console.*
- **Client ID:** `1000.JH1MC…` (len 35; full value in `.env`, low-sensitivity — not committed).
- **Redirect URI:** `https://richenquest.com/oauth/callback` — ⚠️ domain is Zoho Sites, has no callback endpoint; expect a 404 after consent (code still in URL). Must match the app's registered URI exactly, or the exchange fails.
- **Data Centre:** `in` (accounts.zoho.in).
- **Scopes:** `ZohoCRM.modules.ALL,ZohoCRM.settings.ALL`.
- **If a freshly-minted token still returns `invalid_code`:** the problem is NOT the token → investigate app config (app existence/DC in `api-console.zoho.in`, client_id/secret match, redirect-URI registration, scope grant).

### Appendix — audit commands run (reproducible)
`git log --all --oneline`, `git diff --stat main...HEAD`, `git rev-list --count main..HEAD`, `git tag -l`, `git rev-list -n1 v1.0.0-rc.1`, `node --test "functions/**/*.test.mjs"`, `node scripts/validate-config.mjs`, `find functions -name '*.mjs' | xargs -n1 node --check`, `.env` key-presence grep (values never printed). Full source of `functions/zoho/*`, `config/*`, `docs/automation-specs/*`, `RELEASE-LOG.md`, `AUTOMATION-LOG.md` read directly.
