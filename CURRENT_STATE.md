# CURRENT_STATE.md

**Compiled 2026-08-23 by audit, not from memory.** Every claim below was produced by a
command whose output is quoted in the release report. Anything not verified says NOT VERIFIED.

## The single most important finding

This repository contains **two divergent product lines** that both continued after the RC-1
cut at `4cfabaa` (2026-07-20):

| Line | Tip | vs origin/main | Contents |
|---|---|---|---|
| `main` | `df22b78` (local) | — | Static website (20 pages, live), Zoho Deluge engine, portal, legal/ops/revenue docs |
| `origin/release/rc-1` | `bff61d0` | +79 / −105 | A different platform: Node/Express Career Record API, PostgreSQL, KMS, identity vault, "Project Titan" |

`release/rc-1` is **not behind** main in the ordinary sense — it is a **separate
implementation**. Commit `964d005` on that branch reads *"branch model — release/rc-1
active, main frozen for production"*, which is the inverse of how the repository has
actually been used since. **This is a founder decision, not an engineering one, and I have
not merged, rebased or deleted anything.**

## Completed and verified

- **Website build** — reproducible. `node website/build.mjs` → 20 pages, hash `d4a8fecd`,
  identical across two consecutive runs.
- **Live production site** — `https://richenquest.pages.dev` returns **HTTP 200** and serves
  `site.css?v=d4a8fecd`, an **exact match for the local build**.
- **Routes** — `/`, `/about/`, `/contact/`, `/destinations/hungary/`, `/legal/privacy/`,
  `/legal/refund/` all 200. Unknown path returns a real **404**, not a soft 404.
- **Assets** — `site.css`, `main.js`, `favicon.svg` all 200 with correct content types.
- **Security headers live** — HSTS, strict CSP (`default-src 'self'`, `frame-ancestors
  'none'`), `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`,
  `Permissions-Policy`.
- **CI gates pass locally** — claims-guard (20 pages clean), check-links (984 internal
  references resolve), gen-edge-config (9 path rules).
- **No wildcard CORS** — `portal/worker.js` `ALLOWED_ORIGIN` is
  `https://apply.richenquest.com`, fails closed.
- **Zoho Deluge engine** — 28 functions in `functions/src/`, intake chain verified end to end
  on a live probe (case `RQ-260817-9014`, 23 fields, consent recorded, owner assigned).

## Partially complete

- **`origin/main` is 10 commits behind local `main`.** All ten are Deluge/docs/portal work.
  `git diff origin/main..HEAD -- website/` is **empty**, which is precisely why the live site
  still matches: the website is untouched by the unpushed commits.
- **Production deploy path for Catalyst** — halted by design in `deploy-prod.yml`, citing
  ADR-006. Correct behaviour, but see below: Catalyst is no longer the hosting model.

## Blocked (founder action required)

- **GitHub repository secrets and environment protection rules — NOT VERIFIED.** `gh` CLI is
  not installed on this machine, so `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`,
  `CATALYST_TOKEN`, `CATALYST_ORG` and the `production` environment's required-reviewer rule
  could not be inspected. Their *existence is inferred* from the site being live; that is
  evidence the Cloudflare pair works, and **no evidence at all** about the reviewer rule.
- **Pushing the 10 local commits** triggers `deploy-pages.yml` (fires on push to `main`).
  Safe in content terms — website unchanged, so the rebuild is byte-identical — but it is an
  outward-facing deployment and is the founder's call.

## Obsolete

- **Catalyst Client hosting** — disqualified by ADR-006 (live evidence).
- **Catalyst Slate** — scored 9/15, superseded by ADR-007.
- **`origin/fix/structured-data-integrity`** — 13 commits, **fully superseded**. Of the files
  it touches: 27 identical in HEAD, 15 differ **with HEAD newer in every case**, 1 absent
  (`.claude/settings.json`, deliberately gitignored at `.gitignore:23`). **Nothing on this
  branch is genuinely missing.** Recommend deletion, not merge.
- **`0682e065`** — the old Catalyst Slate build hash. Superseded, see below.

## ⚠️ Live defect found during this audit

**`https://rq-site-ysgqnszn.onslate.in` is still publicly serving the superseded
`0682e065` build**, with **zero CSP headers** and HTML cached `max-age=31536000` (one year).
A decommissioned host is still serving RichenQuest-branded content that is ten days stale and
unprotected. This was not previously recorded anywhere.

## Next verified action

Decommission the Slate deployment, then have the founder authorise the push of the 10 local
commits. Neither requires code changes.
