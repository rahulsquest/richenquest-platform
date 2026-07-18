# ADR-002 — Zero-dependency custom build script (Node as a build tool only)

**Status:** Accepted 2026-07-19 (resolves Decision D1 of File 09 §3.2)

## Context
The founder requires modular, reusable components AND forbids frameworks/SSGs (ADR-001).
Hand-duplicating headers/footers across 20+ pages guarantees drift. A build step is the only
way to get both; the question was what kind.

## Decision
A custom ~300-line Node.js script (`website/build.mjs`) with **zero npm dependencies** builds
the site: `<!-- @include … -->` partial resolution, `{{ dot.path }}` token substitution from
`src/data/*.json`, ordered CSS concatenation, sitemap generation, and content-hash cache
busting. A companion `serve.mjs` provides a local dev server with watch-rebuild. Node.js is a
build tool here, exactly like a shell script — nothing from it ships to the browser.

The template engine is deliberately minimal: **includes and tokens only**. No loops, no
conditionals, no expressions. Unknown tokens and missing page metadata fail the build loudly.

## Consequences
- Output is pure HTML/CSS/JS — satisfies the Version 1 mandate literally.
- Zero supply-chain exposure; nothing to update; the whole pipeline is readable in one sitting.
- We own this code: any new capability (loops, i18n, markdown) is a conscious, reviewed
  addition — scope creep toward "our own framework" is the known failure mode, and the
  guard-rail is that every engine feature addition requires its own ADR.
- Repeated collections (destination cards, nav from data) are hand-written in partials for now;
  if that becomes painful at Tier-2 destination scale (M4), we revisit with evidence.
