# File 09 — Technical Architecture (APPROVED)
RichenQuest platform foundation: website · Zoho · Catalyst · GitHub · future AI
Status: **v1.1 APPROVED by founder 2026-07-19**, with amendments: Version 1 uses pure HTML5/CSS3/vanilla ES6+ only — no frameworks (Astro/React/Next/Eleventy all excluded unless explicitly approved later). Decision D1 resolved as a zero-dependency custom build step — see docs/adr/ADR-002. RichenQuest is to be treated as a Digital Operating Platform; the public website is one module of it.

---

## 0. Guiding principles

1. **Zoho is the backbone, not an add-on.** Every website CTA terminates in a Zoho system (CRM, Bookings, SalesIQ, Campaigns, WhatsApp via BSP). The website holds no data.
2. **Static-first.** The marketing site is pre-built HTML5/CSS3/JS served from Catalyst hosting. No server rendering, no website database. Dynamic capability arrives later as Catalyst serverless functions — additive, never a rebuild.
3. **One fact, one home.** CRM owns leads/students/partnerships; Books owns money; WorkDrive owns documents; Analytics reads from all. The website reads facts from a single `claims.json` sourced ONLY from File 08's Verified Claims Library.
4. **AI-ready, not AI-dependent.** Humans run operations now (File 00). The event surface (CRM workflows/webhooks + Catalyst functions) is designed so AI modules subscribe to events later without touching the website or CRM structure.
5. **Accuracy over speed** (File 08). A CI "claims-guard" blocks deployment of any page containing banned claims.

---

## 1. System overview

```
                        ┌─────────────────────────────────────────┐
                        │              VISITOR (66–80% mobile)     │
                        └───────────────────┬─────────────────────┘
                                            │ HTTPS
                        ┌───────────────────▼─────────────────────┐
                        │   ZOHO CATALYST — Web Client Hosting     │
                        │   static HTML/CSS/JS (richenquest.com)   │
                        └──┬────────┬─────────┬─────────┬─────────┘
             Zoho Forms    │        │         │         │   wa.me links
             (embedded) ───┘   SalesIQ    Bookings   Campaigns      │
                  │           (lazy chat)  (embed)   (signup)       ▼
                  ▼                │          │         │      WhatsApp BSP
      ┌──────────────────┐         │          │         │      (AiSensy/WATI…)
      │    ZOHO CRM      │◄────────┴──────────┴─────────┘           │
      │ (system of record)│◄──────────────────────────────────────┘
      └──┬───────────┬───┘
         │           │                    FUTURE (Phase 2+)
   Zoho Books   Zoho Analytics      ┌────────────────────────────┐
   WorkDrive    (dashboards)        │ Catalyst Functions /api/v1 │
   Vault                            │ webhooks · AI services      │
                                    └────────────────────────────┘

  GitHub (source of truth for code) ──► GitHub Actions CI ──► Catalyst CLI deploy
                                        (build · validate · claims-guard)
```

---

## 2. Production repository structure

Single GitHub repository (monorepo) — right-sized for a 5-person company; splits later only if a separate app (portal) demands it.

```
richenquest/
├── README.md                     # onboarding: setup, build, deploy in <10 min
├── CHANGELOG.md                  # every release, human-readable
├── docs/                         # business + technical docs (files 00–09, ADRs)
│   └── adr/                      # Architecture Decision Records (one file per big decision)
├── website/                      # the static marketing site
│   ├── src/
│   │   ├── _includes/
│   │   │   ├── layouts/          # base.html, page.html, destination.html, post.html
│   │   │   └── components/       # header, footer, hero, cta-band, form-embed,
│   │   │                         # destination-card, package-card, faq-accordion,
│   │   │                         # whatsapp-fab, breadcrumbs, testimonial, stats-band
│   │   ├── _data/
│   │   │   ├── site.json         # nav, contact, socials, office info
│   │   │   ├── claims.json       # ONLY File-08-approved facts — single source for numbers
│   │   │   ├── services.json     # packages & inclusions
│   │   │   └── destinations/     # germany.json, ireland.json, … one file per country
│   │   ├── assets/
│   │   │   ├── css/              # tokens.css → base.css → components/ → pages/
│   │   │   ├── js/               # small vanilla ES modules (nav, lazy-embed, utm, forms)
│   │   │   ├── img/              # optimized at build (AVIF/WebP + fallback)
│   │   │   └── fonts/            # self-hosted (no third-party font CDN)
│   │   └── pages/                # index, about, services, destinations/, nepal,
│   │                             # partners (B2B), book, contact, blog/, legal/
│   ├── package.json
│   └── (build config — see Decision D1)
├── functions/                    # Catalyst serverless — empty scaffold until Phase 2
│   ├── README.md                 # rules for adding functions (auth, logging, versioning)
│   └── …                         # api-lead/, webhooks/, ai/ arrive later
├── scripts/
│   └── claims-guard.mjs          # CI scan of built HTML against File 08 banned claims
├── catalyst.json                 # Catalyst project config (hosting + functions targets)
├── .github/
│   └── workflows/
│       ├── ci.yml                # PR: build, HTML validate, link check, Lighthouse, claims-guard
│       ├── deploy-dev.yml        # merge to main → Catalyst Development environment
│       └── deploy-prod.yml       # release tag + manual approval → Production
└── .gitignore / .editorconfig / LICENSE (private)
```

---

## 3. Website architecture

### 3.1 Rendering model
Multi-page static site (MPA), not an SPA. Reasons: SEO is the growth engine for an education consultancy; the audience is majority mid-range Android mobile (finding from the 2026-07-17 website strategy session); static pages are the fastest and cheapest thing Catalyst can serve; zero server attack surface.

### 3.2 Component model (Decision D1 — RESOLVED 2026-07-19)
"Modular reusable components" in a pure HTML/CSS/JS site requires a **build step** that assembles pages from shared partials at build time. The founder excluded all frameworks (Astro, Eleventy, React, Next.js) for Version 1, so D1 resolves to a **zero-dependency custom build script** (`website/build.mjs`): Node.js is used strictly as a build tool; the deployed output is 100% framework-free static HTML/CSS/JS. Capabilities are deliberately minimal — `@include` partials + `{{ token }}` data substitution only; loops/conditionals are excluded until a real page proves the need. Rationale and consequences: docs/adr/ADR-002. Raw duplicated HTML per page remains rejected — 20+ pages sharing header/footer by copy-paste guarantees drift.

### 3.3 Design system
- `tokens.css`: CSS custom properties for color, type scale, spacing, radii, shadows — the brand lives in one file.
- BEM class naming; one CSS file per component; no CSS framework (satisfies "CSS3", keeps payload small, no utility-class lock-in).
- Vanilla ES modules for behavior; **progressive enhancement** — every page works with JS disabled except live embeds. Sitewide JS budget ≤ 30 KB gzipped.
- Self-hosted fonts (max 2 families), system-font fallback.

### 3.4 Page inventory (launch scope)
Home · About (claims-library facts only) · Services & Packages · Destinations hub · Tier-1 destination pages (deep) · **Study in Germany** flagship (public-vs-private two-lane honesty positioning, APS guidance, blocked account/insurance explainers — File 05) · **Nepal landing page** · Partner With Us (B2B — feeds University Partnerships module) · Book Free Counseling · Contact · Blog/Resources (structure only at launch) · Legal (Privacy DPDP+GDPR, Terms, Refund policy) · 404.

Destination pages are **data-driven**: adding a country = one JSON file + prose. No code changes. (Tier composition — which countries launch deep vs later — is a content decision, see Open Decisions.)

### 3.5 Performance, SEO, accessibility
- Budgets: LCP < 2.5 s on mid-range mobile, Lighthouse ≥ 90 all categories, CI-enforced via Lighthouse CI.
- Zoho widgets are the heaviest assets on any Zoho-integrated site → **facade/lazy pattern**: SalesIQ loads after first interaction or idle timeout; form iframes load on scroll-into-view (IntersectionObserver).
- SEO: unique meta + OpenGraph per page; JSON-LD (Organization, FAQPage per destination); XML sitemap; canonical URLs; hreflang-ready structure for future /hi/ /ne/ locales.
- WCAG 2.1 AA: semantic HTML, focus states, contrast-checked tokens, form labels.

---

## 4. Zoho integration architecture

| Zoho service | Integration on website | Data destination |
|---|---|---|
| **Forms** | Embedded (lazy iframe) inside a single `form-embed` component; hidden fields carry UTM + page context | Native Forms→CRM mapping to Lead fields per File 01 §7. **No local DB — ever.** |
| **SalesIQ** | Brand snippet, lazy-loaded; bot flows per File 04 | Chats + captured leads → CRM |
| **Bookings** | "Book Free Counseling — 30 min" CTA on every page; embed on /book | Counselor calendars; confirmations via Zoho |
| **Campaigns** | Newsletter signup component (double opt-in — GDPR) | Campaigns lists; nurture drip File 03 §3.3 |
| **WhatsApp (BSP)** | `wa.me` click-to-chat FAB + inline CTAs with **page-aware prefilled text** (e.g. Germany page prefills a Germany inquiry) | BSP inbox → native BSP↔CRM integration |
| **Analytics** | UTM discipline (documented convention) + Lead Source Detail hidden-field mapping | Founder/manager dashboards per File 01 §8 |

Two forms only at launch (File 01 §7): full inquiry form and short book-counseling form. The `form-embed` component wraps the Zoho embed, so a future swap to fully-branded forms (posting to a Catalyst function → CRM API) is a one-component change, invisible to every page.

**Dependency note:** embeds require the Zoho org to be live (File 00 Week 1 / Milestone 2). Website build proceeds in parallel; wiring the real embed codes is a late-milestone task.

---

## 5. Catalyst architecture

- **One Catalyst project** (India DC — matches Zoho One India DC choice in File 00), two environments: **Development** and **Production**.
- **Web Client Hosting** serves `website/dist`. Custom domain `richenquest.com` + `www` with managed TLS.
- **Functions** (Phase 2+, scaffold only now): Advanced I/O (Node.js) for `/api/v1/*`; Event/Cron functions for automations; Catalyst Zia services or external LLM APIs for AI modules.
- **Data Store / File Store / Cache**: reserved for future portal sessions, AI job logs, caches — never master data (that's CRM's job).
- **M0 spike (required):** verify on a live Catalyst project — custom security headers support, redirect rules, 404 handling, cache behavior, deploy-from-CI with a CLI token. Anything Catalyst hosting can't do gets a documented fallback (e.g., meta-tag CSP) before we commit page architecture.

## 6. GitHub & CI/CD

- Trunk-based: short-lived feature branches → PR → CI must pass → squash-merge to `main`.
- `main` auto-deploys to Catalyst **Development**. Production deploys only from a release tag with a manual approval gate (GitHub environment protection).
- CI on every PR: build → HTML validation → internal link check → Lighthouse CI budgets → **claims-guard**.
- Branch protection on `main` (PR + passing checks required). Conventional commit messages. Catalyst CLI token + any future Zoho secrets live in GitHub Actions secrets only.

### Claims-guard (content governance as code)
`scripts/claims-guard.mjs` scans built HTML for File 08's banned patterns — e.g. "hundreds of students", any "% visa success", "AI-powered" (present tense), "partner of &lt;institution&gt;" not on the signed-partners allowlist — and **fails the build**. `claims.json` is the only permitted source for company facts in templates. File 08 stops being a policy document and becomes an enforced system.

---

## 7. Security architecture

| Layer | Controls |
|---|---|
| Transport | HTTPS only, HSTS |
| Headers | CSP allowlisting Zoho embed domains; X-Content-Type-Options; Referrer-Policy; Permissions-Policy (Catalyst-configured; M0 spike confirms mechanism) |
| Secrets | None in frontend, ever. GitHub Actions secrets + Catalyst env vars; Zoho OAuth **self-client** server-side only (Phase 2) |
| Forms/spam | Zoho Forms CAPTCHA + honeypot; future API endpoints rate-limited + input-validated at function layer |
| Supply chain | Minimal dependencies; lockfiles; Dependabot; no third-party scripts except Zoho |
| Org | 2FA mandatory on GitHub and Zoho (File 00 Day 1); least-privilege Catalyst roles; Vault for shared credentials |
| Privacy | DPDP (India) + GDPR (EU leads, File 05 §6): privacy policy, consent gating for non-essential tracking before SalesIQ starts a session where required, data minimization (only File 01 lead fields collected), instant honoring of Email Opt Out, all PII in Zoho India DC, documented data-subject-request procedure |

## 8. API architecture (Phase 2+, contract-first)

None needed at launch — embeds cover everything. When APIs arrive:

- `/api/v1/*` on Catalyst Advanced I/O functions; OpenAPI spec versioned in the repo **before** implementation; JSON only.
- Auth: Zoho OAuth self-client for server→Zoho calls; Catalyst user auth when the student portal exists. Webhook receivers verify signatures. All endpoints idempotent where retried, structured logs with request IDs.
- First candidates, in order: ① branded lead-capture proxy (replaces form iframes) ② CRM webhook bridge (stage change → WhatsApp template, if the BSP's native mapping proves limiting) ③ student status endpoint (portal).

## 9. Future AI architecture

**Principle: CRM is the event backbone.** AI modules are stateless Catalyst functions triggered by CRM webhooks/workflows or explicit API calls; they write back through the same audited surface. The CRM spec already anticipates this — Document Status has an **"AI Pre-checked"** value (File 01 §3).

Sequenced candidates:
1. SalesIQ Answer Bot on curated FAQ resources (File 04, no LLM) → later LLM-powered Zobot with File 04 guardrails hard-coded: never predict visa outcomes, never case-specific immigration advice, always route to human below confidence.
2. Document pre-check: OCR (Catalyst Zia) + LLM checklist against SOP-03 rules → sets "AI Pre-checked"; a human still sets "Verified" (two-eyes rule preserved).
3. Nurture email drafting (File 03 §3.3), founder weekly brief generation (File 03 §4), lead scoring.

Guardrails codified in the repo: allowed-actions list per module, human approval for anything outbound, audit logs to Catalyst Data Store, claims-guard applied to AI-generated public text. Because the site is static and integrations are event-based, every AI module is additive.

## 10. Database strategy

- **Website: zero databases** (hard requirement, honored permanently for the marketing site).
- Systems of record: **CRM** (leads, student cases, partnerships) · **Books** (invoices/payments) · **WorkDrive** (documents) · **Campaigns** (marketing lists) · **Vault** (credentials). One fact lives in exactly one system.
- **Zoho Analytics** is the read layer (auto-sync from CRM + Books) — dashboards per File 01 §8.
- **Catalyst Data Store** enters only in Phase 2+ for operational state that belongs to no Zoho product (AI job logs, portal sessions, short-TTL caches). It never duplicates CRM master data.

## 11. Scalability

- **Traffic:** static + CDN absorbs campaign/press spikes with no action and near-zero cost.
- **Content:** destinations/programs are data files — Tier 2/3 rollout (2–3 pages/week) needs no developer.
- **Team:** component library + claims-guard means contributors can ship content PRs safely.
- **Platform:** marketing site stays static forever; the future student portal launches as a **separate app** (Catalyst AppSail or Zoho Creator — decide when real) on a subdomain, sharing the same CRM backbone. The two never entangle.
- **Zoho quotas:** native embeds (Forms/SalesIQ/Bookings) don't consume CRM API limits; quota planning starts only when custom API functions arrive.
- **i18n:** URL structure reserves /hi/ and /ne/ for future Hindi/Nepali versions with hreflang.

---

## 12. Risks & open items

| # | Risk / open item | Mitigation / needed decision |
|---|---|---|
| R1 | Catalyst hosting capabilities (headers, redirects) unverified | M0 spike is the first task; fallbacks documented before page build |
| R2 | **Claims conflict:** 2026-07-17 session listed publishable trust assets ("100+ students", partner logos incl. EU Business School, Univ. of Debrecen) that File 08 bans (verified figure = 15; "Partner of X" banned pre-signature; audit item 6 corrected the EU Business School phrasing) | Founder reconciles before any trust content ships; claims-guard enforces the outcome |
| R3 | Zoho org not yet activated (Milestone 2 pending) | Build site in parallel with placeholder embed slots; wire real embeds when org is live |
| R4 | Zoho credits may not cover renewals/add-ons (flagged 2026-07-17) | Founder confirms credit type & expiry with Zoho |
| R5 | Flagship destination ambiguity: Italy (website session) vs Germany (Files 05/07) | Content decision — see Open Decisions; architecture is indifferent |
| R6 | Brand assets (logo, palette, photography) not in repo | Needed before M1 design-system work |

## 13. Implementation roadmap (each milestone ends with founder review)

| Milestone | Scope | Done means |
|---|---|---|
| **M0 — Foundation** | `git init` + GitHub repo, Catalyst project (Dev+Prod), CI skeleton, Catalyst capability spike, design tokens drafted from brand assets | A hello page auto-deploys to Catalyst Development from a merged PR |
| **M1 — Core site** | Design system + component library; Home, About, Services, Book, Contact; Zoho embed slots; claims-guard live | Lighthouse ≥ 90; all CI gates green; founder walkthrough on Dev URL |
| **M2 — Destination engine** | Destinations hub + Tier-1 deep pages (Germany flagship w/ two-lane content), Nepal landing page, Partner-With-Us B2B page | New destination addable by JSON+prose only; B2B form feeds Partnerships pipeline |
| **M3 — Launch** | Legal pages (DPDP/GDPR), SEO/schema/sitemap, real Zoho embeds wired, analytics verified end-to-end (form → CRM → dashboard), performance hardening, DNS cutover | richenquest.com live on Catalyst Production; a test lead flows website → CRM → dashboard |
| **M4 — Growth** | Blog/resources + Campaigns nurture integration, Tier-2 destination cadence, A/B & heatmap tooling | Nurture-ready content engine operating weekly |
| **M5+ — Platform** | Catalyst functions (branded forms proxy, webhook bridges), portal decision, AI modules per §9 | Each module additive; no rebuild |

Business alignment: File 07's Milestone 1 (IU + GUS applications) cites richenquest.com — universities **will** open the site during agent due diligence. M1–M3 are therefore also partnership infrastructure, not just marketing.

---

*Approval needed on: D1 build tooling (§3.2) · R2 claims reconciliation · R5 flagship destination · R4 credit confirmation · brand assets (R6). Everything else is ready to execute as specified.*
