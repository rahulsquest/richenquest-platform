# File 10 — Development Standards & Naming Conventions
Binding for every contributor and every commit. Status: **v1 ACTIVE 2026-07-19**.
Why-decisions live in `docs/adr/`; this file is the *how*.

---

## 1. Principles

1. **Accuracy over speed** (File 08). Wrong information shipped fast is a liability.
2. **Boring technology, deliberately.** Version 1 is HTML5, CSS3, vanilla ES6+ JavaScript. No
   frameworks, no npm runtime dependencies (ADR-001, ADR-002). New dependencies require an ADR
   plus founder approval.
3. **Stateless website, Zoho backend** (ADR-003). If a feature seems to need a website database,
   stop and redesign it around Zoho — or write an ADR arguing the exception.
4. **Progressive enhancement.** Every page must be readable and navigable with JavaScript
   disabled. JS adds convenience, never carries content.
5. **Small diffs, reviewed.** All changes land via PR to `main`. No direct pushes.

## 2. Naming conventions

| Thing | Convention | Example |
|---|---|---|
| Files & folders | `kebab-case` | `cta-band.html`, `study-in-germany/` |
| CSS classes | BEM: `block__element--modifier` | `site-header__toggle--open` |
| CSS custom properties | `--category-name` | `--color-brand`, `--space-4` |
| JS variables/functions | `camelCase`; exported factories `initX()` | `initNav()` |
| JS files | one module per concern in `assets/js/modules/` | `nav.js`, `lazy-embed.js` |
| JSON data keys | `snake_case` | `verified_placements` |
| Data attributes (JS hooks) | `data-*`, never styling classes | `data-nav-toggle` |
| Git branches | `feat/…`, `fix/…`, `chore/…`, `docs/…` | `feat/destinations-hub` |
| Commits | Conventional Commits | `feat(website): add germany destination page` |
| URLs | lowercase, hyphenated, trailing slash, no `.html` | `/destinations/germany/` |

**JS hooks vs styling:** JavaScript selects only `data-*` attributes or IDs — never BEM classes.
This lets CSS refactors and JS evolve independently.

## 3. HTML rules

- Semantic elements first (`header/nav/main/section/article/footer`); one `<h1>` per page;
  heading levels never skip.
- Every page starts with a `<!--meta … -->` block declaring at minimum `title` and
  `description` — the build **fails** without them (SEO is enforced, not optional).
- No inline styles. No inline event handlers (`onclick=…`). No inline `<script>` except
  build-injected structured data (JSON-LD).
- **Escaping belongs in templates, never in `src/data/*.json`.** The build inserts token
  values verbatim (`build.mjs` header). A `{{ token }}` in page text or an attribute wants
  `&amp;`; the *same* token inside a `<script type="application/ld+json">` block does not —
  script content is raw text, so an entity there ships literally to search engines. Write
  `&amp;` in the `.html` file that needs it and keep the JSON value plain. Likewise, never
  put non-breaking spaces in data to stop a phone number wrapping — use `.tel` (CSS).
- Images: `alt` always (empty `alt=""` only for decorative), `width`/`height` attributes to
  prevent layout shift, `loading="lazy"` below the fold.
- Forms and embeds are added ONLY via the shared components (`form-embed`, future
  `salesiq-embed`) so integration behavior stays in one place.

## 4. CSS rules

- **Load order is the cascade:** `tokens.css` → `base.css` → `components/*` → `pages/*`.
  The build concatenates in exactly that order into one `site.css`.
- All colors, spacing, font sizes, radii, shadows come from tokens. A raw hex value or px
  magic number in a component file is a review-blocker.
- One file per component in `assets/css/components/`, named after its block
  (`header.css` styles `.site-header`).
- Mobile-first: base styles are the small-screen experience; enhance inside
  `@media (min-width: …)` using the breakpoints documented in `tokens.css`.
- No `!important`, no ID selectors, max nesting depth 2, no CSS frameworks or resets beyond
  `base.css`.
- Budget: total CSS ≤ 50 KB gzipped (CI will warn at 40 KB once Lighthouse CI lands in M1).

## 5. JavaScript rules

- ES modules only; entry point `assets/js/main.js` imports from `assets/js/modules/`.
  No globals, no `var`.
- Every module exports an `init…()` that (a) exits silently if its markup is absent,
  (b) never throws for missing elements — pages must not break because a component isn't used.
- No external scripts except Zoho embeds, which load **lazily** through the dedicated embed
  modules (facade pattern — see ADR-001 consequences). Approved exceptions (File 11 decision
  C4): Microsoft Clarity — consent-gated, post-launch only. Nothing else without an ADR.
- Public functions get a one-line JSDoc. Comments explain constraints, not narration.
- Budget: total site JS (ours, excluding Zoho embeds) ≤ 30 KB gzipped.

## 6. Component authoring (the contract)

A component = up to four artifacts, all named after its block:

```
website/src/components/cta-band.html        ← markup partial (required)
website/src/assets/css/components/cta-band.css  ← styles (required if styled)
website/src/assets/js/modules/cta-band.js   ← behavior (only if needed)
```

- The partial begins with a comment header: what it is, where it's used, tokens it expects.
- Included in layouts/pages via `<!-- @include components/cta-band.html -->`.
- Data reaches components via `{{ token }}` substitution from `website/src/data/*.json`.
  The v1 engine intentionally has **no loops or conditionals** (ADR-002): if a component needs
  them, bring the case to review — don't work around it with JS-rendered content.

## 7. Data & claims governance (the most important section)

- `website/src/data/claims.json` mirrors the Verified Claims Library
  (`docs/08-fact-audit-and-claims-library.md` Part B). It is the ONLY permitted source for
  company facts (numbers, history, partnerships, fees) in any page or component.
- Changing `claims.json` requires **founder sign-off first**, then updating `docs/08`, then the
  code PR — in that order.
- `scripts/claims-guard.mjs` runs in CI on the built HTML and fails the build on banned
  patterns (unverified student counts, visa-success percentages, present-tense "AI-powered",
  "partner of X" without a signed agreement in the allowlist). The guard is a safety net, not a
  substitute for review — reviewers still check every factual sentence.
- Never place personal data in URLs. Forms collect only the fields specced in File 01.

## 8. Accessibility checklist (per PR)

WCAG 2.1 AA target: keyboard-reachable interactive elements with visible focus · `aria-expanded`/
`aria-controls` on toggles · color contrast ≥ 4.5:1 (tokens are pre-checked; don't override) ·
skip-link first in DOM · forms labelled · no information conveyed by color alone ·
`prefers-reduced-motion` respected for any animation.

## 9. Performance budgets (enforced from M1 via Lighthouse CI)

LCP < 2.5 s on mid-range mobile · Lighthouse ≥ 90 all categories · images served as
AVIF/WebP with dimensions set · fonts self-hosted, max 2 families, `font-display: swap` ·
Zoho widgets never load before first interaction/idle (lazy embed modules).

## 10. Git & review workflow

1. Branch from `main` (`feat/…`), keep PRs under ~400 changed lines where possible.
2. CI must pass: build, claims-guard (HTML validation, link check, Lighthouse from M1).
3. PR checklist (template to be added in M1): standards followed · a11y checklist · no new
   dependencies · claims.json untouched or founder-approved · CHANGELOG updated for
   user-visible changes.
4. Squash-merge; `main` auto-deploys to Catalyst Development. Production = release tag +
   manual approval (File 09 §6).
5. Secrets live only in GitHub Actions secrets / Catalyst env config. A credential in code or
   git history is an incident (see SOP-07 escalation).

## 11. Definition of done (any feature)

Builds clean · CI green · works without JS · keyboard-accessible · claims-safe · documented
(component header comment + CHANGELOG line) · reviewed by someone who didn't write it (or by
the founder while the team is small).
