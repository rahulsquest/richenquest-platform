# ADR-004 — Zoho Catalyst hosting; GitHub trunk-based CI/CD

**Status:** Accepted (founder decision, 2026-07-19; supersedes the 2026-07-17 Vercel/Cloudflare
recommendation)

## Context
Hosting was finalized after the planning documents: Catalyst hosts the website and will host
future backend APIs, serverless functions, AI services, and automations. GitHub is the source
of truth for code, review, and deployment workflow.

## Decision
- One Catalyst project (India DC, matching Zoho One), environments: Development + Production.
  Web Client Hosting serves `website/dist/`; `functions/` holds future serverless code.
- Trunk-based development: feature branch → PR → CI gates (build, claims-guard; HTML
  validation/link check/Lighthouse from M1) → squash-merge to `main` → auto-deploy to
  Development. Production deploys only from a release tag behind a manual approval environment.
- Deployment uses the Catalyst CLI from GitHub Actions with a token stored in Actions secrets.

## Consequences
- Website, APIs, and AI services share one platform, one billing relationship (existing Zoho
  credits), one auth story — the "designed around Zoho" principle extended to infrastructure.
- Catalyst web hosting is less battle-tested for static marketing sites than Vercel/Cloudflare;
  the M0 spike must verify custom-domain setup, redirect rules, custom headers, caching, and
  CI deploys, with documented fallbacks (e.g., meta-tag CSP) for any gap found.
- Vendor concentration in Zoho is accepted strategically; the site itself is portable static
  files, so the exit cost from Catalyst hosting specifically is near zero.
