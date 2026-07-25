# Release Log — RC-1 onward

Every change to this repository after the RC-1 cut is recorded here, one row per change,
newest first. This log exists to make the release auditable: at any moment we can answer
"what changed since RC-1, why, and who approved it".

## RC-1 baseline

| | |
|---|---|
| **Tag** | `v1.0.0-rc.1` (at `361be95`, the release-log commit) |
| **Product baseline** | `b235870` — the release-log commit adds no product code |
| **Cut** | 2026-07-19 |
| **Scope** | 19 pages, feature-complete (M1–M3), production pipeline in place |
| **Verification at cut** | build ✓ 19 pages · claims-guard ✓ 19/19 · link check ✓ 908 internal refs · working tree clean |
| **Known open items** | `docs/13-launch-checklist.md` (founder actions 1–8; legal pages carry a visible "draft pending review" label) |

## Change policy (RC-1 → launch)

Permitted without further approval — **one concern per commit**:

| Class | Meaning |
|---|---|
| `fix` | Bug fix — something behaves incorrectly |
| `security` | Security hardening or vulnerability fix |
| `perf` | Performance improvement |
| `a11y` | Accessibility improvement |
| `legal` | Legal/compliance update (policy text, DPDP/GDPR requirements) |
| `deploy` | Production deployment / infrastructure task |
| `integration` | GitHub, Zoho, Catalyst, analytics wiring |
| `copy` | Critical copy correction (factual error, claims-governance issue, broken meaning) |

Anything else — new features, UI redesign, content expansion, refactors of working code —
**requires explicit founder approval**, recorded in the "Approval" column below.

Rules: no unrelated improvements bundled into release commits; every change re-runs
build + claims-guard + link check before commit; stability outranks polish. When in doubt,
do not change it.

## Branch model (set 2026-07-19)

| Branch | Role |
|---|---|
| `main` | Reserved to represent **production**. Frozen at the RC-1 cut (`4cfabaa`). Receives the RC-1 work only when the founder explicitly approves the production cutover. |
| `release/rc-1` | Active branch. All permitted RC-1 changes land here. |

Note on the live site: **www.richenquest.com is served by Zoho Sites** (WYSIWYG, server
`ZGS`) and has no connection to this repository — no branch here powers it. The live site can
only change by editing it inside Zoho Sites, or at DNS cutover. Nothing in git can affect it
before then.

CI implication: `deploy-dev.yml` currently triggers on pushes to `main`, so work on
`release/rc-1` will not auto-deploy. Harmless today (no Catalyst project, deploy is
secret-gated); revisit when Catalyst exists — founder decision, not an automatic change.

## Changes since RC-1

| Date | Class | Change | Commit | Approval |
|---|---|---|---|---|
| 2026-07-25 | `redesign` | **Premium redesign — design system, flagship homepage, and the destination matcher.** (1) **Brand**: the provisional palette (R6) is resolved from the RichenQuest logo — real cyan→blue→violet ramp, signature gradients, glass/elevation/motion tokens; the placeholder amber accent is replaced by the logo's violet. (2) **New components**: `motion.css` (native scroll-driven reveals + parallax, JS `reveal.js` now stands down where supported so only one system owns opacity), `surface.css` (night bands, aurora, grain, glass), `showcase.css` (bento, tiles, stats, rail, quote), `orbit.css` + `components/visual-orbit.html` (the hero illustration — inline SVG, zero requests). (3) **Homepage** fully rewritten: 11 sections, transparency-based trust, honest platform roadmap. (4) **`/match/` — a real working tool**: deterministic, explainable, client-side destination matcher over the verified destination data, with a no-JS fallback; added to the main nav; `scripts/validate-matcher-data.mjs` wired into CI so its inlined facts can never drift from `src/data/destinations/*.json`. (5) **Global lifts** (no markup churn): `page-hero`, `card`, glass `site-header`, `cta-band`. (6) **Build**: CSS is now minified (`minifyCss` in `build.mjs`) — verified structurally lossless against the browser parser (592 rules / 44 media / 7 supports / 15 keyframes identical) — keeping the shipped stylesheet at 56.7 KB, inside the 60 KB `lighthouserc.json` budget (10.4 KB gzipped). (7) **A11y**: 44 px touch targets on coarse pointers. **NOT changed:** no testimonials, no university-affiliation wording, no invented statistics — trust is built from transparency, process and the founder's voice. Gates green: build 20 pages · claims-guard 20/20 · link-check 1019 refs · matcher-data in sync · no horizontal overflow at 360 px. | *this commit* | **Founder-directed redesign 2026-07-25** (brief + explicit "full 19-page redesign now") |
| 2026-07-22 | `copy` | Removed team-size headcount from public site (About team card + styleguide stat tile); team now described qualitatively. Founder rule OI-1: team size is not a public marketing claim (File 08 + File 19 A2). claims-guard + build + link-check green. | *this commit* | Founder OI-1 2026-07-22 |
| 2026-07-19 | `integration` | Server-side Zoho OAuth layer (`functions/zoho/`): token manager with auto-refresh + 401 retry, generic API client, per-DC/service base resolution, clients for CRM/Mail/Bookings/Analytics/Forms/SalesIQ/Flow, CLI scripts (auth-url/exchange-code/verify), `.env.example`, CI syntax-gate for functions, docs/14 §10–13. Secrets in `.env` only (gitignored); nothing reaches the browser or live site (verified absent from `dist`) | *this commit* | Founder instruction |
| 2026-07-19 | `integration` | Client-side Zoho integration layer, dormant by default: `data/integrations.json` config (no hard-coded IDs/URLs), modules for Forms/Bookings/SalesIQ with Zoho-host URL validation + consent gate, embed components with real-workflow fallbacks, Bookings slot wired into `/contact/`, setup guide `docs/14-zoho-integration.md` | `26ed0d9` | Founder instruction |
| 2026-07-19 | `deploy` | Created `release/rc-1` branch; froze `main` at the RC-1 cut so production cutover stays an explicit founder decision | `964d005` | Founder instruction |
