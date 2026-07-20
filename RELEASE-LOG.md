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
| 2026-07-19 | `integration` | Zoho integration layer, dormant by default: `data/integrations.json` config (no hard-coded IDs/URLs), modules for Forms/Bookings/SalesIQ with Zoho-host URL validation + consent gate, embed components with real-workflow fallbacks, Bookings slot wired into `/contact/`, setup guide `docs/14-zoho-integration.md` | *this commit* | Founder instruction |
| 2026-07-19 | `deploy` | Created `release/rc-1` branch; froze `main` at the RC-1 cut so production cutover stays an explicit founder decision | `964d005` | Founder instruction |
