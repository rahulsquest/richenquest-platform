# Changelog

All notable changes to the RichenQuest platform. Format: [Keep a Changelog](https://keepachangelog.com).

## [Unreleased]

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
