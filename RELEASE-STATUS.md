# RELEASE-STATUS.md

**Audit date:** 2026-08-23 · **Auditor:** release manager pass, evidence-driven
**Verdict:** **NO-GO for a new production deploy today.** Two blockers, one of them a live
security defect. Neither is a code change.

## Verdict detail

Production hosting is **already live and healthy** — that is the thing most worth stating
plainly. `https://richenquest.pages.dev` is serving build `d4a8fecd`, which matches the local
build byte-for-byte, with a strict CSP and a real 404. Nothing needs to be shipped to make
the site correct.

NO-GO applies to **cutting a new release**, for these reasons:

### BLOCKER 1 — Superseded host still live and unprotected
`https://rq-site-ysgqnszn.onslate.in` returns HTTP 200 serving build `0682e065`
(2026-08-13), with **no Content-Security-Policy header at all** and HTML cached for one year.
It is RichenQuest-branded, ten days stale, and reachable by anyone. Found during this audit;
not previously recorded.
**Founder action:** delete the Slate deployment in the Catalyst console.

### BLOCKER 2 — Production protection rules NOT VERIFIED
`gh` CLI is unavailable on this machine, so the `production` environment's required-reviewer
rule, branch protection on `main`, and the repository secrets could not be inspected. Phase 5
requirement 4 cannot be satisfied by inference.
**Founder action:** `brew install gh && gh auth login`, or confirm in
Settings → Environments → production.

## The asset hash question, answered

`0682e065` is **not present in the current build, and should not be.**

- It is **not a commit** — no such git object exists. It is a build content-hash.
- It was the **Catalyst Slate Development** build, recorded in ADR-006 and ADR-007.
- **7 commits changed `website/` after it** (`e17ab2b..HEAD`), all the Zoho Web-to-Lead work:
  contact form wiring, the shared form include across 12 pages, thank-you page,
  `Consent_Policy_Version` mapping.
- Current verified hash is **`d4a8fecd`**, reproducible locally and **live on Cloudflare
  Pages right now**.
- Catalyst hosting was **rejected by ADR-006 and replaced by ADR-007**. Targeting `0682e065`
  would mean reverting ten days of lead-capture work onto a disqualified platform.

## Branch reconciliation

| Branch | Decision | Basis |
|---|---|---|
| `main` (local, `df22b78`) | **Authoritative** | 10 ahead of origin, 0 behind |
| `origin/fix/structured-data-integrity` | **Obsolete — delete, do not merge** | 27 files identical in HEAD, 15 with HEAD newer, 1 gitignored. Nothing missing. |
| `origin/release/rc-1` | **FOUNDER DECISION — untouched** | +79/−105 vs main; a *different* platform (Node/Express/PostgreSQL/KMS), not a stale copy |

`release/rc-1` carries commit `964d005`: *"branch model — release/rc-1 active, main frozen
for production"*. Repository usage since has been the exact inverse. Someone must decide
which line is the product. I did not merge, rebase, or delete anything.

## What is genuinely production-ready

Website build · live Pages deployment · security headers · routing and 404 · claims guard ·
link integrity · edge config · the Zoho Deluge intake engine (28 functions, chain verified
end to end) · no wildcard CORS · no placeholders · no secrets in the repository.
