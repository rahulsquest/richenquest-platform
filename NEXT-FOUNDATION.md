# NEXT-FOUNDATION.md

What the next session should build on, and what it must not repeat.

## Load-bearing, do not re-derive
- **One decision engine.** `caseState()` owns state, blockers, band and next action.
  `student360`, `buildWorkQueue`, `recordStateEvent` and now `matchOpportunities` are all
  siblings that consume it. Adding a second engine is the failure this design exists to
  prevent.
- **One normalisation layer.** `normalizeInput()` governs 10 fields across 11 call sites.
  Zoho does not enforce picklists and rejects bad numerics loudly — both bugs have already
  been paid for once.
- **Verification gate.** Nothing without `Source_URL` + `Verified_On` + complete required
  fields may be shown to a family. Now enforced in code by `matchOpportunities`.
- **Fit ≠ probability.** Every ranked row carries `score_meaning`. Never remove it.

## Immediate continuation (in order)
1. Open a `crm.zoho.in` tab → `./scripts/deploy-function.sh matchOpportunities lead_or_contact_id:string module:string`
2. Create a labelled synthetic Lead, run the engine, verify every row has evidence, delete it.
3. `studentRoadmap()` — NOW / 30 / 90 / 180 days, consuming `caseState` + `matchOpportunities`. Do not re-decide priority.
4. Mentor model — needs a module, which needs the browser channel.
5. Student dashboard — a renderer only, like the Counsellor Dashboard.

## Traps already discovered — do not rediscover
- COQL requires a `WHERE` clause; without it the error prints as an empty result and reads as zero.
- A wrong field name returns null for every record, not an error.
- Deluge has no `while` loop, no comparator sort, and infers type from first assignment.
- Deploy = create stub, then PUT the real script; the PUT is the syntax checker.
- `0682e065` is a build hash, not a commit. `fix/structured-data-integrity` and
  `release/rc-1` must not be merged.

## The standing non-technical constraint
The platform has no students. Engineering is not the bottleneck and has not been for weeks.
