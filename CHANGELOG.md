# Changelog

All notable changes to the RichenQuest platform. Format: [Keep a Changelog](https://keepachangelog.com).

## [Unreleased]

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
