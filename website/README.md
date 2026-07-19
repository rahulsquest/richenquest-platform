# RichenQuest Website — Developer Guide

Static site, pure HTML5/CSS3/vanilla ES6+ output, zero dependencies (ADR-001/002).
Read `docs/10-development-standards.md` before your first commit. The living component
reference is **/styleguide/** on the built site — keep it current in the same PR.

## Commands (Node ≥ 20)

```bash
node build.mjs   # build → dist/
node serve.mjs   # build + http://localhost:8080 + rebuild on src changes
npm run guard    # claims-guard against the built site
```

## How a page is made

1. Create `src/pages/<name>.html` starting with a `<!--meta -->` block (`title` and
   `description` required; `layout` defaults to `base`; `sitemap: false` to exclude).
2. Body HTML uses components: `<!-- @include components/x.html -->` partials for
   singletons (header/footer/cta-band) and documented class patterns (see /styleguide/)
   for repeatables (buttons, cards, forms, badges, icons).
3. Company facts only via `{{ claims.* }}` tokens from `src/data/claims.json`
   (governance: File 10 §7 — founder sign-off before changing).
4. Page-specific styles go in `src/assets/css/pages/<name>.css`.
   CSS cascade order is build-enforced: `tokens → base → components/* → pages/*`.
5. Clean URLs are automatic: `pages/about.html` → `/about/`.

## Where things live

```
src/
├── layouts/          page shells (base.html)
├── components/       HTML partials (singleton organisms)
├── pages/            one file per route (+ /styleguide/ gallery)
├── data/             site.json, claims.json (+ destinations/ from M3)
├── public/           copied verbatim to dist root (robots.txt, favicons)
└── assets/
    ├── css/          tokens.css, base.css, components/, pages/
    ├── js/           main.js + modules/ (nav, disclosure, reveal)
    └── img/          icons.svg sprite, images (optimized before commit)
```

Adding an icon: append a `<symbol>` to `assets/img/icons.svg` (24px grid, 2px stroke,
currentColor) and add it to the /styleguide/ gallery.
