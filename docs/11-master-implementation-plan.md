# File 11 — FINAL MASTER IMPLEMENTATION PLAN
The single blueprint for the RichenQuest Digital Platform, Version 1.
Status: **v1 PROPOSED 2026-07-19 — awaiting founder approval; on approval, this document governs execution.**

Merges: `/docs` files 00–10 (business systems, claims library, approved architecture, standards) + the Website Strategy & Research document (2026-07-17 artifact) + founder directives of 2026-07-19. Where documents conflict, §2 records the conflict and the final decision.

---

## 1. What we are building (one paragraph)

A conversion-engineered, Europe-first public website — the first module of the RichenQuest Digital Operating Platform — in pure HTML5/CSS3/vanilla ES6+, built by our zero-dependency pipeline, hosted on Zoho Catalyst, with every lead flow terminating in Zoho (Forms → CRM → Automation → Email/WhatsApp → Analytics), governed by the Verified Claims Library, and structured so the Student Portal, Admin Dashboard, and AI services attach later without a rebuild.

## 2. Conflict register — final decisions

| # | Conflict | Sources | FINAL DECISION | Why |
|---|---|---|---|---|
| C1 | Astro+Tailwind on Vercel/Cloudflare vs vanilla stack on Catalyst | Strategy §7/§11 vs founder 2026-07-19 | **Vanilla HTML/CSS/JS on Catalyst. Closed — no further framework discussion.** | Founder's later decision is the latest source of truth; ADR-001/002/004 record it. The strategy doc's *reasons* (CWV on cheap Androids, low JS) are honored — vanilla ships even less JS than Astro. |
| C2 | Trust content ("100+ students", partner logos, review scores, testimonials) vs File 08 (verified figure 15; "partner of X" banned pre-signature) | Strategy §3/§9 + 2026-07-17 session vs File 08 | **File 08 governs, permanently.** The competitor *playbook structures* (proof strip, testimonial blocks, review badge) are built as components, but each ships **only when its content passes the claims library**: testimonials need written consent; partner logos need signed agreements + permission; review badge needs a real Google Business Profile rating. Claims-guard enforces at build time. | The strategy doc itself warns "investors and journalists verify public numbers." Structure now, claims when earned. |
| C3 | Flagship destination: Italy (strategy) vs Germany (Files 05/07) | Strategy §1/§5 vs docs | **Both, as dual flagships with different jobs.** Italy = *content flagship* (DSU funding story, founder-in-Italy credibility — the strongest SEO/trust angle nobody else covers; Lane B service-fee revenue). Germany = *commercial flagship* (private-university commission lane, APS content, feeds the File 07 partnership milestone). Both launch with maximum depth; the other five Tier-1 pages follow. | The two documents optimize different funnels (B2C content vs B2B commissions); the website needs both, and neither cannibalizes the other. |
| C4 | "No third-party scripts except Zoho" (File 10 §5) vs strategy's Microsoft Clarity + Google Search Console | File 10 vs Strategy §10 | **Approved exceptions, post-launch only:** Microsoft Clarity (behavior heatmaps) loaded after consent; Search Console (no on-page script; DNS/meta verification). Attention Insight is used on design mockups pre-launch, never on the live site. File 10 §5 gains an explicit allowlist. | The UX validation loop (S10) is core to the strategy; both tools are free and industry-standard. Consent gating preserves the privacy posture. |
| C5 | "Zero dependencies" vs CI needs (HTML validation, Lighthouse budgets) | ADR-002 vs testing needs | **Zero-dependency rule applies to everything that ships or builds the site.** CI-only analyzers (html-validate, Lighthouse CI, pinned versions) run in GitHub Actions and never touch the artifact. Internal link checking is our own zero-dep script. | The rule's purpose is supply-chain safety of the product; CI analyzers don't enter the product. |
| C6 | Redirects "from old URLs" at cutover (strategy §9) vs "website has not been developed yet" (founder) | Strategy vs founder 2026-07-19 | **OPEN — founder to confirm** whether richenquest.com currently serves anything. If yes: harvest indexed URLs pre-cutover and map redirects in M4. If no: no redirect work. | Only the founder knows the domain's current state. |
| C7 | Form fields: File 01 §7 (7 fields incl. message) vs strategy §10 (2-step, ≤7 fields) | File 01 vs Strategy | **Merged spec:** one Zoho Forms qualifying form, 2 steps. Step 1: Destination country · Study level · Intake (three taps, zero friction). Step 2: Name · Phone/WhatsApp · Email · DPDP consent. Message field dropped from the qualifying form (stays on the Contact page form). Hidden fields: UTM source/medium/campaign + page context → CRM Lead fields per File 01 §3. | Both documents want the same thing; this satisfies the ≤7-field evidence and the CRM field map simultaneously. |

## 3. Final technology architecture (settled — reference only)

Static multi-page site · pure HTML5/CSS3/vanilla ES6+ (ADR-001) · zero-dependency build pipeline `website/build.mjs` (ADR-002) · Zoho is the entire backend, website stateless (ADR-003) · Catalyst Dev+Prod hosting, GitHub trunk-based CI/CD (ADR-004) · claims-guard gate (ADR-005) · future APIs/AI as Catalyst functions on the CRM event backbone (File 09 §8–9) · no database on the web tier, ever (File 09 §10).

## 4. Website architecture — the merged sitemap

| Page / section | Job | Milestone |
|---|---|---|
| **Home** | Europe-first pitch: hero (promise + proof + CTA above fold) → proof strip → "the map has changed" narrative (cited public data) → journey steps → Tier-1 destination cards → testimonials (gated per C2) → founder credibility → vision teaser → CTA | M1 |
| **Destinations hub** | Europe-first index of all destination guides; the SEO engine's front door | M3 |
| **Destination guides** (Tier 1: Italy, Germany, France, Hungary, Ireland, Netherlands, Japan) | Deep guides: tuition/costs (real numbers, cited), DSU/scholarships (Italy), APS + blocked account (Germany), intakes, English-taught programs, visa steps, FAQs (FAQPage schema), consultation CTA + qualifying form on every page | M3 |
| **From Nepal** | Dedicated landing: NOC guidance, NPR cost framing, Japan (#1 corridor) + Europe; hreflang-ready | M3 |
| **Services** | Featured journey (admissions, scholarships, student visa, pre-departure) + secondary (work/business/tourist visas); **package transparency, no price matrix** (Strategy §8): what's included per stage, "fees depend on destination and scope," free-consultation route | M2 |
| **Success Stories** | Named testimonials with photos/universities/outcomes — built as structure in M2, populated only with consented stories (C2) | M2 (structure) |
| **About & Vision** | The investor/partner page: founder story (India → Italy), team, verified numbers only, partnership status line from claims.json, AI roadmap as "what we're building next" — one section, no AI-washing | M2 |
| **Contact / Book** | Zoho Bookings embed + qualifying form + WhatsApp + phone/hours | M2 |
| **Legal** | Privacy (DPDP + GDPR), Terms, Refund policy; footer carries full legal identity (legal name, CIN, registered office) once founder supplies CIN/address | M2 |
| **Blog / Resources** | DSU explainers, intake calendars, cost comparisons — structure in M5, content velocity engine thereafter | M5 |
| Persistent on every page | WhatsApp float (page-aware prefill) · sticky mobile bottom bar ("Book free consultation" + WhatsApp in thumb zone) · header CTA · footer legal identity | M1 |

## 5. Component architecture (build inventory)

**Existing (M0):** base layout · head · header/nav · footer · cta-band · button.

**M1:** hero · proof-strip (claims-safe stat tiles) · journey-steps · destination-card · whatsapp-fab · sticky-mobile-bar · section primitives.
**M2:** form-embed (Zoho qualifying form wrapper, lazy) · bookings-embed · package-card · testimonial-card (consent-gated) · faq-accordion (native `<details>`) · founder-note · breadcrumbs.
**M3:** destination-guide layout (costs table, intake timeline, visa-steps list, FAQ block with JSON-LD) · destinations-menu (header dropdown, Europe-first) · partner-strip (dormant until signed partners exist).
**M4+:** salesiq-embed (lazy facade) · newsletter-signup (Campaigns) · post layout (blog).

Rules recap (File 10 §6): partial + CSS file (+ optional JS module) per component; data via tokens; JS hooks on `data-*` only; every embed wrapped in exactly one component so swaps are one-file changes. The v1 engine stays includes+tokens; **the agreed trigger to consider a loop/collection feature is Tier-2 rollout pain in M5, via a new ADR** (ADR-002).

## 6. Zoho integration architecture (merged File 01/03/04 + Strategy §7)

```
Visitor → page → [qualifying form (Zoho Forms, 2-step, UTM hidden fields)]
                → CRM Lead (fields per File 01 §3, source tagged)
                → Workflow 5.1: instant email + task + Cliq #leads alert (5-min SLA)
                → WhatsApp BSP templates on stage changes (File 03)
                → Zoho Analytics founder/manager dashboards (File 01 §8)
        → [SalesIQ chat: File 04 flows, lazy-loaded, consent-gated]
        → [Bookings: "Free Counseling — 30 min" everywhere]
        → [Campaigns: nurture drip for non-bookers (File 03 §3.3)]
        → [wa.me float: page-aware prefill → BSP inbox → CRM]
```

Dependency: live embeds require Zoho One activation (business Milestone 2, File 07). The site builds with placeholder slots; **M4 cannot complete without the live Zoho org.** A/B tests are judged on consultation bookings in CRM — never on opinions (Strategy §10).

## 7. UX design contract (binding — from Strategy §10, now part of standards)

1. Low visual complexity, prototypical education-site structure — parents must "get it" in the 17–50 ms first impression.
2. F-pattern discipline: headings carry meaning in their first two words; key facts in the first two lines of every section; scannable bullets for costs/steps.
3. Hero = promise + proof + "Book free consultation" with **zero scrolling**; the CTA repeats after every major value block.
4. Photography: real students/team, gaze oriented toward headlines/CTAs; no stock-photo staring.
5. Qualifying form: 2 steps, ≤7 fields total (C7 spec).
6. Mobile-first: sticky bottom bar in the thumb zone; tap targets ≥44 px; performance budget honored on a ₹12,000 Android, not our laptops.
7. Validation loop: predicted-attention check on hero mockups pre-launch → Clarity heatmaps/scroll maps post-launch → one-variable A/B judged in CRM.

File 10 (standards) remains binding for code; this section is its UX counterpart. File 10 §5 allowlist updated per C4.

## 8. Milestones, development order, acceptance criteria

Supersedes File 09 §13 numbering. Each milestone ends with a founder walkthrough on the Catalyst Dev URL; production deploys only at M4.

### M0 — Foundation ✅ COMPLETE (2026-07-19)
Repo, standards, ADRs, build pipeline, claims-guard (negative-tested), core components, CI. **Outstanding external items:** GitHub remote (founder creates repo) · Catalyst project (founder's Zoho account) · both block nothing before M4 but should land during M1.

### M1 — Design direction + Homepage (first build milestone)
Order: ① brand tokens from founder assets (or approved refresh) ② hero + proof-strip + journey-steps + destination-card components ③ full homepage assembly (UX contract §7) ④ whatsapp-fab + sticky-mobile-bar (numbers pending founder) ⑤ CI upgrades: html-validate, zero-dep link checker, Lighthouse CI budgets (C5).
**Done:** homepage passes CI + Lighthouse ≥90 mobile; hero mockup passes predicted-attention check (CTA + proof in hot zones); founder sign-off on visual identity.

### M2 — Core pages + legal
Order: ① Services (package transparency) ② About & Vision ③ Contact/Book ④ Success Stories structure ⑤ Privacy (DPDP+GDPR consent language, drafted for founder review), Terms, Refund ⑥ form-embed + bookings-embed components (live if Zoho org ready, placeholder otherwise).
**Done:** every page claims-guard clean; consent language founder-approved; nav/footer complete with legal identity (needs CIN + office address).

### M3 — Destination engine + Nepal
Order: ① destination-guide layout + data schema ② **Italy** (content flagship: DSU deep-dive) ③ **Germany** (commercial flagship: APS, blocked account, public-vs-private lanes per File 05) ④ France, Hungary, Ireland, Netherlands, Japan ⑤ From Nepal landing ⑥ destinations hub + Europe-first menu.
**Done:** 7 Tier-1 guides + Nepal page live on Dev; FAQPage JSON-LD valid; each guide ends in qualifying form + CTA; adding a country requires only JSON + one page file.

### M4 — LAUNCH
Order: ① Catalyst production environment + custom domain + TLS ② live Zoho wiring: form→CRM→workflow 5.1→dashboard verified with a test lead end-to-end ③ SEO: Organization/EducationalOrganization JSON-LD, sitemap submission, Search Console, C6 redirects if needed ④ Clarity (consent-gated) ⑤ DNS cutover runbook: lower TTL 48h prior → deploy prod → switch DNS → verify TLS/pages/form → submit sitemap → 48h monitoring.
**Done:** richenquest.com live on Catalyst Production; a real form submission appears in CRM with correct source attribution and triggers the instant-response workflow; rollback tested (redeploy previous release tag).

### M5 — Growth engine
Tier-2 destination cadence (2–3/week; revisit engine collections per ADR-002 if painful) · blog/resources structure + first cited cost-comparison posts · Campaigns nurture wiring · A/B discipline live · Google Business Profile review collection running (founder-driven).

### M6+ — Platform modules
Catalyst functions (branded form proxy, webhook bridges) · Student Portal decision (Creator vs Catalyst app on subdomain) · Admin dashboard = Zoho Analytics + CRM views first, custom only if proven insufficient · AI modules per File 09 §9 sequence with File 04 guardrails. Each module additive; each starts with an ADR.

## 9. Testing strategy

**Automated, every PR:** build (fail-loud tokens/meta) → claims-guard → html-validate (CI-only, C5) → internal link check (zero-dep script) → Lighthouse CI budgets (LCP <2.5s, ≥90 scores, JS ≤30KB, CSS ≤50KB).
**Manual, every milestone:** File 10 §8 accessibility checklist · device pass on a mid-range Android over throttled 4G (DevTools + at least one real device) · Safari/Chrome/Firefox render check · keyboard-only walkthrough.
**Integration (M4):** end-to-end lead test — submit form with UTM params → verify CRM Lead fields, source attribution, workflow 5.1 email/task/Cliq fire → verify dashboard count. Test leads carry Lead Source Detail = "Other" + a TEST marker per File 01 (leads are never deleted — they're marked).
**Post-launch:** Clarity heatmaps/scroll-depth review in the Monday founder rhythm (File 00) · one-variable A/B judged on CRM bookings · monthly Lighthouse re-audit.

## 10. Deployment strategy

Trunk-based: PR → CI gates → squash to `main` → auto-deploy Catalyst **Development** → founder review on Dev URL → release tag + manual approval → **Production**. Rollback = redeploy previous tag (static artifact, near-instant). Secrets only in GitHub Actions secrets + Catalyst env. DNS cutover per M4 runbook. Post-M6, functions deploy through the same pipeline with per-function versioning.

## 11. Founder dependency ledger (what only you can provide, by when)

| Needed by | Item |
|---|---|
| M1 start | Brand assets (logo, colors, photos) or green-light for a proposed refresh · WhatsApp/phone number for CTAs |
| M1–M2 | GitHub repo created · Catalyst project created (your Zoho login) · Zoho One activation status (business Milestone 2) · Zoho credit type/expiry check (Strategy §7 caveat) |
| M2 | CIN + registered office (footer legal identity, also unblocks File 07) · decision on C6 (does richenquest.com serve anything today?) · privacy-policy review |
| M2–M3 | Testimonial consents (5–8 students, written) · claims decisions: File 08 open items ① ② · any publishable proof points for the proof strip |
| M4 | Domain registrar access for DNS cutover · Google Business Profile created/claimed |

---

*Approval of this document = approval to execute M1 immediately, then M2–M4 in order, pausing only at milestone walkthroughs and for the ledger items above.*
