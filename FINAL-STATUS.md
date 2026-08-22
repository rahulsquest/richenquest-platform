# FINAL-STATUS.md — 2026-08-23

## Production: NO-GO

Not because the software is broken. The verified build is live and healthy at
`richenquest.pages.dev`. NO-GO because **the domain customers actually visit is not that
deployment.**

### Blocker 1 — the customer-facing domain runs the rejected platform
```
www.richenquest.com → slate-7264000000004029-in.nimbuspop.com → nimbuspop.com
rq-site-ysgqnszn.onslate.in → nimbuspop.com          (same infrastructure)
```
It serves a **different site**: 1,058,885 bytes vs 31,002, no `site.css` reference, **zero
CSP headers**, HTML cached one year. ADR-007 chose Cloudflare Pages and is recorded ACCEPTED
and IMPLEMENTED — it *was* implemented, at `pages.dev`, but **the DNS cutover never
happened**, so the decision was never enforced. Full detail in `PRODUCTION-DEFECT.md`.

### Blocker 2 — production protection rules NOT VERIFIED
`gh` not installed, `brew` unavailable, no token in the keychain. Repo secrets, branch
protection and the `production` reviewer rule could not be inspected. Not inferred.

### Blocker 3 — 10 commits cannot be pushed
`git push --dry-run` → *could not read Username for https://github.com*. No credential.

## Exact commit hash
`9abdd21` (local `main`, 12 ahead of `origin/main` = `419d126`) plus this documentation
commit. **Not pushed** — see Blocker 3.

## Verified production URL
`https://richenquest.pages.dev` — HTTP/2 200, `site.css?v=d4a8fecd`, matching the local
build exactly. **This is not the customer-facing domain.**

## Existing system — completed this session
Full audit against live evidence; `PRODUCTION-DEFECT.md` recording a previously unknown live
defect; all local CI gates re-run and passing; secret-leak scan of the public repo clean;
Catalyst CLI authenticated and both projects enumerated; `slate:unlink` confirmed
**local-only**, so Slate decommission is genuinely a console action.

## SaaS MVP — what is actually done
**Done and live in the CRM:** the Opportunity data model. `Opportunity_Type` (10 values),
`Eligibility_Summary`, `Funding_Amount_EUR` created on Accounts and **all 23 records
backfilled** — 21 University Programme, 2 correctly reclassified Service Vendor.

**Written, architecturally complete, NOT deployed:** `matchOpportunities.dg` (320 lines) —
deterministic, explainable, verification-gated, with `score_meaning` on every row preventing
a fit score from being read as a probability.

**Not done:** roadmap generator, mentor model, student dashboard, synthetic-student journey.
All depend on the Deluge deployment channel.

## Known limitations
1. The matching engine has **never executed**. Written ≠ working.
2. Only **1 of 23** opportunities is fully verified (Debrecen), so the engine would today
   rank one item and correctly exclude 22.
3. `apply.richenquest.com` is **NXDOMAIN** while `worker.js` pins `ALLOWED_ORIGIN` to it.
   Fails closed — safe, but the portal origin does not exist.
4. No AI provider abstraction was written; the engine is fully deterministic and needs none.

## Founder actions
1. **Open `https://crm.zoho.in` in Chrome and leave it open** — 30 seconds, unblocks Deluge
   deployment and Part D.
2. **Repoint `www.richenquest.com` at Cloudflare Pages**, then delete both Slate apps.
3. **Provide a git credential** (or push the 12 commits).
4. **Install `gh` and authenticate** so protection rules can be verified.
5. Create `apply.richenquest.com`, or change `ALLOWED_ORIGIN` to the origin actually used.

## Next 3 highest-value tasks
1. **DNS cutover.** Every security control built is currently protecting a URL no customer
   visits.
2. **Verify 4 more opportunities.** The engine's output quality is capped at 1 rankable item
   until then; the gate is working exactly as designed and starving on input.
3. **Deploy and run `matchOpportunities` against a synthetic student**, completing Part D.
