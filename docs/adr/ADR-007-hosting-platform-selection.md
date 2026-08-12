# ADR-007 — Hosting platform selection (replacement for Catalyst Client)

**Status:** Proposed — recommendation is evidence-backed, but adoption needs founder account
ownership and DNS delegation. Follows ADR-006 (Client Hosting rejected).

## Decision
Select the replacement hosting platform for the RichenQuest static site.

## Method
Catalyst **Slate** was verified **empirically** — linked, deployed, and measured at
`https://rq-site-ysgqnszn.onslate.in` (build `0682e065`, Development). Cloudflare Pages, Netlify
and Vercel were verified from **official documentation** only; deploying to them requires accounts
this session does not own, so their column is documented-capability, not measured.

## Decision matrix

| # | Requirement | Catalyst Client | Catalyst Slate | Cloudflare Pages | Netlify | Vercel |
|---|---|---|---|---|---|---|
| 1 | Root deployment | **FAIL** `/app` forced | **PASS** measured | PASS | PASS | PASS |
| 2 | Clean URLs | **FAIL** | **PASS** `/about/`→200 | PASS | PASS | PASS |
| 3 | Directory index | **FAIL** | **PASS** measured | PASS | PASS | PASS |
| 4 | Custom 404 | PASS | **FAIL** soft-404 | PASS | PASS | PASS |
| 5 | Security headers (CSP) | **FAIL** no mechanism | **FAIL** no mechanism | PASS `_headers` | PASS `_headers` | PASS `vercel.json` |
| 6 | Cache-Control | **FAIL** absent | **FAIL** HTML 1 yr | PASS per-path | PASS | PASS |
| 7 | Custom 404 status code | PASS 404 | **FAIL** returns 200 | PASS | PASS | PASS |
| 8 | Canonical stability | **FAIL** | **PASS** | PASS | PASS | PASS |
| 9 | robots / sitemap at root | **FAIL** 400 | **PASS** both 200 | PASS | PASS | PASS |
| 10 | JSON-LD | PASS | PASS | PASS | PASS | PASS |
| 11 | Asset routing | **FAIL** all 404 | **PASS** all 200 | PASS | PASS | PASS |
| 12 | Deployment workflow | **FAIL** dev only | **PASS** `--production` | PASS git-push | PASS | PASS |
| 13 | Rollback | **FAIL** | Unverified | PASS one-click | PASS | PASS |
| 14 | Custom domains | Unverified | PASS documented | PASS free | PASS | PASS |
| 15 | Operational complexity | High | **Medium-high** | **Low** | Low | Low |

**Score: Client 3/15 · Slate 9/15 · Cloudflare Pages 15/15.**

## Evidence — Catalyst Slate (measured 2026-08-13)
Large improvement over Client, and three defects that are not configurable.

**Passes.** Root serving with no prefix. `/about/`, `/destinations/italy/` → 200. All assets,
`favicon.ico`, `robots.txt`, `sitemap.xml` → 200 at root. **HTTP/2**. **Brotli**
(`content-encoding: br`). `ETag` present. `x-frame-options: DENY`, HSTS with preload,
`x-content-type-options: nosniff`.

**Defect 1 — soft-404 (SEO-critical).** `/definitely-not-a-page` returns **HTTP 200** serving
`index.html`, not the branded 404. Google treats this as a soft 404 and can index unlimited junk
paths. Client Hosting handled this correctly; Slate regresses it.

**Defect 2 — HTML cached for one year (operationally critical).**
`cache-control: public, max-age=31536000` is returned on **HTML**, not just hashed assets. After
launch, a content or legal-page correction would be invisible to returning visitors for up to a
year. This is worse than Client's missing cache headers, and it contradicts
`infra/cache-headers.json`, which requires HTML to revalidate.

**Defect 3 — no CSP mechanism.** No `Content-Security-Policy`, `Referrer-Policy` or
`Permissions-Policy`, and `slate-config.toml` carries only `framework` and `deployment_name`.
The strict CSP in `infra/security-headers.json` remains undeliverable.

**Operational friction.** Slate requires `<source>/.catalyst/slate-config.toml`, i.e. inside
`website/dist` — which `build.mjs` wipes on every run. Any CI deploy must re-link or restore that
file after each build. Same structural conflict as `client-package.json`.

**Also present on both Catalyst surfaces:** the platform injects `zalb_*` and
`ZD_CSRF_TOKEN` (`SameSite=None`) cookies into a site that sets none, which breaks the zero-cookie
position the privacy policy depends on and would require a cookie disclosure.

## Evidence — Cloudflare Pages (documented)
- Root serving and clean URLs: *"`/contact.html` will be redirected to `/contact`"*, and
  `/about/index.html` → `/about/`.
- Custom 404: hierarchical lookup — *"will attempt to find the closest 404 page"*.
- Custom headers via a `_headers` file: *"parsed by Cloudflare Pages and its rules will be applied
  to static asset responses"*, with documented CSP and
  `Cache-Control: public, max-age=31556952, immutable` examples. Limit: 100 rules, 2,000 chars/line.
- `_redirects` for redirect rules; one-click rollback; free custom domains and SSL.

This closes every defect: real 404 status, per-path Cache-Control (revalidating HTML, immutable
assets), and a delivery mechanism for the strict CSP already written in `infra/`.

## Recommendation
**Cloudflare Pages**, with Zoho retained for CRM/Books/WorkDrive and Catalyst retained for future
`functions/`. It is the only candidate that satisfies all fifteen requirements, and it has the
lowest operational complexity: `_headers` and `_redirects` are files in the repo, so the security
and cache policies already written in `infra/` become deployable artifacts under review.

This narrows ADR-004's platform-consolidation rationale to the **backend only**. That is the correct
trade: the consolidation argument was never worth shipping a site that cannot serve correct status
codes, cache headers, or a CSP.

**Slate is the fallback** if staying inside Zoho is judged more important than the three defects.
It is genuinely usable — 9/15, and a working site — but launches with a soft-404, a one-year HTML
cache, and no CSP.

## Founder intervention required
Per the escalation rule: **account ownership and DNS delegation**.
1. A Cloudflare account (free tier is sufficient).
2. DNS delegation for `richenquest.com` to Cloudflare, or a CNAME for the Pages project.

No billing is required — the free tier covers this site.

## Effort estimate
- Cloudflare Pages migration once the account exists: **3–4 h** (project setup, `_headers`
  and `_redirects` generated from `infra/`, CI rewiring, full matrix re-verification).
- Slate fallback instead: **2–3 h**, and ships with the three defects above.
