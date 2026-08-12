# ADR-006 — Catalyst hosting model: Slate vs Client (production deploy path)

**Status:** Proposed — decision required before **Phase 3 (production launch)**. Does not block
Phase 0, Phase 1 or Phase 2. Amends ADR-004.

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
