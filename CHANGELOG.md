# Changelog

All notable changes to the RichenQuest platform. Format: [Keep a Changelog](https://keepachangelog.com).

## [Unreleased]

### Added — hosting migration groundwork (2026-08-13)
- `scripts/gen-edge-config.mjs` — emits `_headers` and `_redirects` into `website/dist` from
  `infra/security-headers.json` and `infra/cache-headers.json`. Those specs had been correct but
  **inert since they were written**: no hosting layer ever consumed them. They are now deployable
  artifacts generated from a single source of truth, wired into CI.
- `.github/workflows/deploy-pages.yml` — Cloudflare Pages deployment (ADR-007), skipping green
  until `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` exist.
- `docs/adr/ADR-007-hosting-platform-selection.md` — 15-point decision matrix.
  Client 3/15 · Slate 9/15 · Cloudflare Pages 15/15.

### Changed — hosting (2026-08-13)
- **Catalyst Web Client Hosting rejected** (ADR-006 ACCEPTED). Measured against a real deployment:
  `/app` prefix forced, no directory-index resolution, all assets 404, `/robots.txt` 400 at origin
  root, no Cache-Control, no CSP mechanism.
- **Catalyst Slate evaluated empirically and rejected.** It fixes routing (root serving, clean URLs,
  HTTP/2, Brotli) but returns **HTTP 200 for unknown paths** (soft-404), serves **HTML with
  `max-age=31536000`** — a legal-page fix would be invisible for a year — and exposes only five
  config fields, none for headers or routing.

### Added — Phase 1 pre-deploy polish (2026-08-12)
- `favicon.ico` (real 3-size ICO: 16/32/48) + `<link>` fallback. Browsers and several
  link-preview bots request `/favicon.ico` at root unconditionally; without it every first
  visit logged a 404.
- `infra/cache-headers.json` — the Cache-Control policy the deployment audit diffs against,
  so header verification has an expected value instead of accepting the host default.
  Hashed assets immutable/1y; images 1 week (NOT immutable — the build hash does not cover
  them); HTML must-revalidate.
- `layouts/noindex.html` — utility layout carrying `robots: noindex, nofollow`. Used by
  `/styleguide/` and `404.html`, both of which previously self-canonicalised with no robots
  directive. Uses the engine's existing `layout:` meta key; no build change needed.
- `workflow_dispatch` (with a `ref` input) on the production deploy, so rolling back to a
  previous release tag does not depend on finding an old run in the Actions UI.

### Changed — Phase 1 pre-deploy polish (2026-08-12)
- **CSP tightened for launch.** v1 loads zero third-party resources, makes no fetch/XHR
  calls, and has zero executable inline scripts and zero inline styles — so the launch policy
  is now `default-src 'self'` with no `unsafe-inline` anywhere, plus `frame-ancestors 'none'`,
  `object-src 'none'` and `upgrade-insecure-requests`. The Zoho/Clarity allowlist is preserved
  under `_csp_when_embeds_land` for M4. Corrected the note claiming `unsafe-inline` was needed
  for JSON-LD: a `ld+json` block is an HTML data block, never executed, never gated by
  `script-src`.
- `robots.txt` no longer disallows `/styleguide/`. A Disallow blocks crawling, which would
  stop Google ever reading the new `noindex` — crawl-to-noindex is what actually removes a
  page from results.
- `engines.node` raised to `>=20.12`: both build scripts use `entry.parentPath`, which does
  not exist in Node 20.0–20.11.

### Fixed — Phase 1 pre-deploy polish (2026-08-12)
- **WCAG 2.2 SC 2.4.11 (Focus Not Obscured).** The header is sticky at the top and the mobile
  action bar fixed at the bottom, with no `scroll-padding` anywhere — so a tabbed-to control,
  the skip link's `#main` target, and in-page anchors all landed underneath them. Added
  `scroll-padding-block-start: 5rem` / `-end: 6rem` (bottom inset dropped at ≥64em where the
  bar is hidden).

### Fixed — codebase audit: structured-data integrity (2026-08-12)
- **JSON-LD corruption (SEO-visible).** `site.tagline` and both phone numbers had been
  rewritten in `data/site.json` as `&amp;` and non-breaking spaces to silence two
  typographic html-validate rules. Entities are not decoded inside
  `<script type="application/ld+json">`, so all 28 structured-data blocks shipped a literal
  `"Global Education &amp; Career Mobility"` slogan and U+00A0-separated `telephone`
  values to search engines. Data restored to plain values.
- The typographic intent is preserved where it belongs: new `.tel` utility
  (`white-space: nowrap`) on the six phone *display* sites, and `&amp;` kept in the
  `<!--meta -->` titles/descriptions, which are genuine HTML contexts.
- `.htmlvalidate.json` pins the rule set: `no-raw-characters` relaxed to the actual HTML5
  requirement (ambiguous ampersands only) and the purely typographic `tel-non-breaking`
  disabled, so a linter preference can no longer push presentation into the data layer.
- File 10 §3 records the rule; `site.json` carries an inline warning.

### Fixed — codebase audit: CI gates measured the wrong thing (2026-08-12)
- **Lighthouse ran desktop, not mobile.** `lighthouserc.json` paired `"preset": "desktop"`
  with `"emulatedFormFactor": "mobile"` — the latter is a Lighthouse 5 key that LH 6+ drops
  silently, so every budget was scored on an unthrottled desktop profile (cpuSlowdown 1×)
  while reading as mobile. For phone-first India/Nepal traffic the gate was measuring the
  easy case. Now `formFactor: mobile` + `screenEmulation` + simulated throttling (4× CPU);
  all four URLs still score 100/100/100/100, LCP 1.2 s.

### Security — codebase audit (2026-08-12)
- Both deploy workflows installed `zcatalyst-cli` **unpinned** on the path to production,
  while CI analyzers were pinned. Pinned to `zcatalyst-cli@1.27.0`.
- Added least-privilege `permissions: contents: read` to all three workflows (they only
  read the repo; deploys authenticate with `CATALYST_TOKEN`).

### Added — codebase audit (2026-08-12)
- `.gitignore` now covers `.lighthouseci/` and `.npm-cache/` (local CI-analyzer artifacts
  that were untracked and one `git add -A` away from being committed).
- `catalyst.json` (hosting config referenced by both deploy workflows) is now tracked.

### Kept from the same working tree — verified correct, not reverted
- WCAG H32: the styleguide demo form's `type="submit"` button (a form with no submit
  button is unreachable by keyboard).
- `aria-label` on the two `<aside>` landmarks in /about/; `<!DOCTYPE html>` casing;
  Italy guide title "DSU Grants" (DSU is need-based, matching the page's own copy).

### Added — M3: destination engine + Nepal (2026-07-19)
- Destinations hub (/destinations/): Tier-1 flagship cards fed by data files,
  Tier-2/3 listed honestly as "guides coming" (no dead links), Nepal callout.
- Deep flagship guides: Italy (DSU explained properly — need-based, by right,
  ~€6,000/yr varying by region; Universitaly process; 12 sample universities)
  and Germany (APS day-one rule, blocked account ≈ €11,900 with update hedge,
  public-vs-private lanes per File 05, DAAD/Deutschlandstipendium).
- Tier-1 guides on the standard template: France, Ireland, Netherlands,
  Hungary, Japan — quick-facts tiles from data/destinations/*.json, honest
  ballparks + counselor-confirmation framing, FAQPage JSON-LD each.
- /nepal/ landing: NOC 3-step guidance, Japan corridor (#1 for Nepali
  students), Europe corridor, Nepal-specific counseling pitch.
- Header Destinations dropdown (disclosure pattern, 9 links); footer +
  homepage destination cards wired to guides; homepage NL/HU card split.
- 19 pages, 17 sitemap URLs; claims-guard clean; link check + metas verified.

### Added — M2: core pages + legal (2026-07-19)
- New pages on the design system: /services/ (featured journey, package transparency —
  written quote, no price matrix), /about/ (story with 2024-operations vs 2026-incorporation
  distinction, team structure without names pending consent, founder, honest one-section
  vision, For Universities), /contact/ (real channels only: WhatsApp/phones/email, 3-step
  expectations, locations, ContactPage JSON-LD), /success-stories/ (consent-first policy,
  anonymized snapshots from verified records), /legal/privacy|terms|refund (drafts pending
  founder/legal review — refund page is process-based, no invented percentages).
- New shared component: page-hero (slim brand-gradient interior header).
- Header/footer navigation updated to real pages; footer legal strip links legal pages.
- 10 pages total; claims-guard clean sitewide; zero broken internal links; M1 untouched.

### Added — M1: production homepage (2026-07-19)
- Premium homepage on the design system: dark gradient hero with serif display accent
  (legacy visual language preserved per File 12), claims-safe proof strip (1,000+ guided ·
  33 study destinations · India/Italy team · 2-person verification), "map has changed"
  Europe narrative, 6-step journey, services, destinations preview (Italy + Germany
  flagships), scholarships (DSU/DAAD/MEXT/Erasmus Mundus), integrity band (2024
  operations vs 2026 incorporation), FAQ accordion with FAQPage JSON-LD.
- Founder decisions encoded: brand "RichenQuest" + tagline; canonical
  https://www.richenquest.com; official@ email; both India + Italy numbers displayed;
  every CTA a real workflow (WhatsApp/tel/mailto — no forms until Zoho org is live);
  testimonials withheld pending consent.
- New components: FAQ accordion (native details/summary), mobile sticky action bar;
  header tagline + section nav; footer contact block; EducationalOrganization JSON-LD.
- Page weight: 26 KB HTML vs 1.06 MB on the legacy site.

### Added — M0 complete: full design system (2026-07-19)
- Complete token architecture (`tokens.css`): brand/neutral/semantic color palette,
  fluid type scale, 4px spacing scale, radii, elevation, motion tokens, z-index layers,
  documented breakpoints (40/64/80em).
- Layout system (`layout.css`): sections, auto-fit + fixed grids, split, stack, cluster.
- Component libraries: buttons (variants/sizes/states), forms (fields, selects, choices,
  error states via `aria-invalid`), cards (destination/package/testimonial/stat-tile),
  badges, icon system (14-icon SVG sprite, stroke-based, currentColor).
- Upgraded navigation: sticky header, icon-swap mobile toggle, dropdown pattern via new
  generic `disclosure.js`; upgraded 3-column footer with contact rows.
- Animation guidelines + `reveal.js` scroll reveal (reduced-motion aware, JS-optional).
- Living style guide at `/styleguide/` demonstrating every token and component with
  canonical markup (excluded from sitemap).
- GitHub PR template with the File 10 checklist; `website/README.md` developer guide.

### Added — Master plan (2026-07-19)
- Final Master Implementation Plan (`docs/11-master-implementation-plan.md`, PROPOSED):
  merges `/docs` business systems, the 2026-07-17 website strategy document, and the approved
  architecture into one roadmap with a conflict register (C1–C7), merged sitemap, component
  inventory, UX design contract, milestones M1–M6, testing and deployment strategy.

### Added — Milestone M0 foundation (2026-07-19)
- Approved technical architecture (`docs/09-technical-architecture.md`, v1.1) and five
  Architecture Decision Records (`docs/adr/ADR-001`…`ADR-005`).
- Development standards, naming conventions, and component authoring guide
  (`docs/10-development-standards.md`).
- Production folder structure: `website/`, `functions/` (scaffold), `scripts/`, `.github/workflows/`.
- Zero-dependency static build system (`website/build.mjs`): HTML partial includes,
  `{{ token }}` data substitution from JSON, CSS concatenation, sitemap generation,
  cache-busting hashes. Local dev server with watch mode (`website/serve.mjs`).
- Design token system (`tokens.css`, provisional palette pending brand assets) and core
  component set: base layout, head, header with accessible mobile nav, footer, CTA band, buttons.
- `claims.json` — the machine-readable Verified Claims Library (mirrors `docs/08` Part B).
- Claims-guard CI gate (`scripts/claims-guard.mjs`): build fails if banned/unverified company
  claims appear in the built site.
- GitHub Actions: CI workflow (build + claims-guard); Catalyst deploy workflow scaffold.
- Placeholder homepage (M0 pipeline proof — to be replaced by the real homepage in M1).
