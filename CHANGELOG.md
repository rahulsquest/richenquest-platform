# Changelog

All notable changes to the RichenQuest platform. Format: [Keep a Changelog](https://keepachangelog.com).

## [Unreleased]

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
