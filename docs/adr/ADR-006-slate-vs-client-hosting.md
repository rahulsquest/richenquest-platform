# ADR-006 — Catalyst hosting model: Slate vs Client (production deploy path)

**Status:** **ACCEPTED** 2026-08-13 — Catalyst **Web Client Hosting is disqualified** by live
evidence. Supersedes the earlier "decide before production" framing: the first real deployment
proved Client Hosting cannot serve this site at all. Amends ADR-004.

## Decision
Choose how RichenQuest reaches the Catalyst **Production** environment:
migrate web hosting from **Client** to **Slate**, or keep **Client** and promote through the
Catalyst console.

## Context
ADR-004 records "One Catalyst project (India DC), environments: Development + Production. Web
Client Hosting serves `website/dist/`", with production deploys from a release tag behind a manual
approval environment, driven by the Catalyst CLI from GitHub Actions.

Execution found that assumption does not hold for Client hosting. `.github/workflows/deploy-prod.yml`
was written against it and cannot work as specified; it is currently halted and fails loudly rather
than deploying to the wrong environment.

## Evidence
Verified against `zcatalyst-cli` 1.27.0 (installed, authenticated) on 2026-08-13.

- No `--env` flag exists anywhere in the CLI:
  `catalyst deploy --env production …` → `error: unknown option '--env'`
- `catalyst deploy` targets the **Development** environment, per its own `--help`.
- A production path exists, but only for Slate:
  - `catalyst deploy slate --production` — *"Deploy the slate app to production environment."*
  - `lib/deploy/features/slate.js:103–105` also honours `ZC_ENVIRONMENT=production`.
- That support is Slate-only. Environment references per deploy feature:
  `slate.js` 3 · `client.js` 0 · `apig.js` 0 · `index.js` 0.
  `ZC_ENVIRONMENT` appears exactly once in the entire package, in `slate.js`.
- `catalyst.json` configures this project as a **client** (`client.source = website/dist`).
- There is no `promote` or `publish` command in the 46-command CLI surface.
- Client deploys to Development are unaffected and work: `catalyst deploy --only client …` loads
  `catalyst.json` without complaint and reaches authentication.

## Options considered

**A. Migrate hosting to Slate.**
`catalyst slate:link --source website/dist --name <name>` links an existing local application to
Slate. Production deploys then run from CI as `catalyst deploy slate --production`.
*For:* restores the ADR-004 model exactly — CI-driven Development and Production, tag-triggered
release, and a real rollback path (re-deploy a prior tag), which is what the roadmap needs.
*Against:* changes the hosting product after the site is built; Slate's behaviour for custom
headers, redirects, caching and clean URLs is **unverified** and would need the same
deployment-verification pass Phase 2 performs for Client.

**B. Keep Client, promote via the Catalyst console.**
*For:* no change to a working Development pipeline; smallest immediate move.
*Against:* production releases become a manual console action — not reproducible, not auditable in
git, no tag-triggered deploy, and the rollback story in ADR-004 and File 13 ("re-deploy previous
tag ≈ instant") stops being true. Whether the console even offers client promotion is
**unverified** — it requires console access this session does not have.

## Recommendation
**Option A, subject to Phase 2 evidence.** It is the only option that preserves the reproducible,
auditable, tag-driven release process ADR-004 committed to, and rollback is a launch-critical
property for a site that will carry statutory disclosures and legal pages.

The migration should not be attempted before Phase 2 completes. Phase 2 verifies transport,
headers, status codes, redirects and caching against a live Client deployment; that evidence is
exactly what determines whether Slate can meet the same bar. Migrating first would discard the
baseline the comparison depends on.

If Phase 2 shows Client hosting cannot deliver the required headers either, this ADR merges into
that finding and the decision becomes "Slate or a non-Catalyst edge (Cloudflare) in front".

## Phase in which the decision becomes mandatory
**Phase 3 — production launch.** Until then `deploy-prod.yml` stays halted by design.
Phases 0, 1 and 2 all operate on the Development environment and are unaffected.

## Consequences
- Deferred: no hosting work happens before Phase 3, per the no-speculative-architecture rule.
- ADR-004's "environments: Development + Production" is accurate as a *platform* statement but not
  as a *CLI capability* statement for Client hosting. This ADR records that correction; ADR-004 is
  amended, not superseded.
- `deploy-prod.yml` carries the same evidence inline, so the constraint is discoverable from the
  workflow that trips over it.


---

# ACCEPTED — 2026-08-13

## Compatibility matrix (measured, not inferred)
Deployment under test: `https://richenquest-60076829044.development.catalystserverless.in/app/`
(zcatalyst-cli 1.27.0, Development environment, build hash `0682e065`).

| # | Launch requirement | Client Hosting | Evidence |
|---|---|---|---|
| 1 | Root deployment (no `/app`) | **FAIL** | `/` → 302 → `/app/`. `/app` is structural: CLI's own server hardcodes `app.use('/app', …)` (`lib/serve/server/lib/web_client/server.js:129`). Community report: *"catalyst does not allow hosting client or functions at the root path and only allows hosting from /app/\* path"* |
| 2 | Clean URLs | **FAIL** | `/app/about/` → 404; `/app/about/index.html` → 200 |
| 3 | Directory index resolution | **FAIL** | `/app/destinations/italy/` → 404; `…/index.html` → 200 |
| 4 | Custom 404 | **PASS** | `/app/definitely-not-a-page` → HTTP 404 + our branded page |
| 5 | Security headers | **PARTIAL** | Platform sets HSTS (`max-age=64072000; includeSubDomains; preload`), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`. **No CSP, Referrer-Policy or Permissions-Policy, and no mechanism to add them** — `client-package.json` accepts only name/version/homepage; no header keys exist anywhere in the CLI |
| 6 | Cache-Control | **FAIL** | **Absent entirely** on hashed assets. `infra/cache-headers.json` has no delivery mechanism |
| 7 | Canonical URL stability | **FAIL** | Page advertises `<link rel="canonical" href="https://www.richenquest.com/">` while living at `/app/index.html` |
| 8 | robots / sitemap | **FAIL** | `/robots.txt` → **400** at origin root; crawlers read only the root. `sitemap.xml` served as `application/octet-stream` |
| 9 | JSON-LD | **PASS** | Inline in HTML; unaffected by hosting |
| 10 | Asset routing | **FAIL** | `/assets/css/site.css`, `/assets/js/main.js`, `/assets/img/icons.svg`, `/favicon.ico` all **404**. The site renders unstyled with no JavaScript |
| 11 | SEO parity | **FAIL** | Consequence of 1, 2, 3, 7, 8, 10 |
| 12 | Production deploy workflow | **FAIL** | No `--env` flag; no promote command; `client.js` contains zero environment references |

**Result: 8 FAIL, 1 PARTIAL, 2 PASS.** No configuration can close any FAIL.

### Additional defects found in the same pass
- **HTTP/1.1 only** — no HTTP/2 or HTTP/3.
- **gzip only** — `Accept-Encoding: br,gzip` returns gzip; no Brotli.
- **`HEAD` returns 400** — breaks uptime monitors and crawlers that probe with HEAD.
- **The platform injects three cookies** (`zalb_*`, `ZD_CSRF_TOKEN` with `SameSite=None`,
  `JSESSIONID`) into a site that sets none. This destroys the zero-cookie privacy position the
  privacy policy relies on, and would require a cookie disclosure.

## Decision
Catalyst **Web Client Hosting is rejected** for this site. The `/app` mount and the absence of
directory-index resolution are each independently disqualifying, and neither is configurable.

## Recommended replacement: Catalyst **Slate**, pending empirical verification
Rationale: it keeps ADR-004's platform-consolidation rationale intact, and it is the only Catalyst
surface with a verified production environment — `catalyst deploy slate --production`, plus
`ZC_ENVIRONMENT=production` (`lib/deploy/features/slate.js:103-105`). Slate natively targets
Astro/Next/Vite-class static output, which implies directory-index and root serving.

**Not yet proven.** Slate's clean-URL, root-serving, header and cache behaviour is undocumented;
the same twelve-point matrix must be re-run against a real Slate deployment before acceptance.

**Fallback if Slate also fails:** static hosting on a platform that guarantees these properties
(e.g. Cloudflare Pages) with Zoho retained for CRM/Books/WorkDrive. This narrows ADR-004's
consolidation to the backend only, which is the correct trade if the platform cannot serve a
marketing site correctly.

## Migration steps
1. `catalyst slate:link --source website/dist --name richenquest` (Development first).
2. Re-run the twelve-point matrix against the Slate URL.
3. If matrix passes: point `deploy-dev.yml` at `catalyst deploy slate`, and un-halt
   `deploy-prod.yml` with `catalyst deploy slate --production`.
4. Re-verify headers and add whatever CSP/Cache-Control mechanism Slate exposes.
5. Delete the Client app (`client:delete`) once Slate is verified.

## Effort estimate
- Slate link + first deploy + matrix re-run: **2–3 h**
- Workflow rewiring + re-verification: **1–2 h**
- If Slate fails and Cloudflare Pages is adopted instead: **1 day**, plus a DNS decision (founder)

## Phase in which the decision becomes mandatory
**Now.** Superseded the original Phase 4 gate — there is no working staging deployment without it.
