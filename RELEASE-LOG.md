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

## Changes since RC-1

| Date | Class | Change | Commit | Approval |
|---|---|---|---|---|
| — | — | *No changes yet — RC-1 is the current state.* | — | — |
