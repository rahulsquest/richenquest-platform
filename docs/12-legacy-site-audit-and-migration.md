# File 12 — Legacy Website Audit & Migration Decisions
Audit of www.richenquest.com (Zoho Sites, archived 2026-07-19 → `docs/legacy-content/`).
Status: findings final; migration decisions **pending founder approval** (presented 2026-07-19).

## Snapshot
Single-page site, client-side rendered by 552 KB of inline JS (incl. 520 KB base64 photos —
49% of the 1.06 MB page). One h1, 9 h2 sections, Inter + serif display, dark premium visual
language. WhatsApp float + tel/mailto links. Microsoft Clarity present. **No Zoho Forms/CRM/
SalesIQ/Bookings. The lead form is non-functional** (preventDefault → clears fields → fake
success message; literal `TODO: connect to Zoho` in code). No robots.txt, no sitemap.xml,
no structured data. Apex 301s to www over **http** (not https).

## Verdicts (keep / improve / redesign / remove)
| Area | Verdict | Why |
|---|---|---|
| Visual language (deep blue, serif display accents, premium dark hero) | **KEEP** — fold into design-system tokens | It's distinctive, photographs well, matches "premium/trustworthy"; discarding it wastes brand equity already live |
| Content: FAQs, scholarships (DSU/DAAD/MEXT…), services, 6-step process, universities directory (33 countries/384 unis) | **KEEP (migrate + fact-check)** | Genuinely good, Europe-first, matches Strategy §5/§8; becomes data files in the new build |
| Universities directory framing | **IMPROVE** | Relabel honestly: it's a directory of institutions we can apply to, NOT "partner universities" |
| Team section (6 real people, Italy presence) | **KEEP (with consent + role accuracy)** | "Founder on the ground in Europe" is the un-copyable trust story (Strategy §3) |
| Testimonials (5 named students, Italy-heavy) | **KEEP structure; content gated** | Real names/universities but consent undocumented → File 11 C2: written consent before re-publish |
| Architecture (1-page, JS-rendered, base64 images) | **REDESIGN** | Kills SEO (content invisible pre-JS), kills LCP on mid-range Android, unmaintainable |
| Hero claims panel (500+/100+/33/85%) | **REMOVE** | File 08 violations (see below) |
| Fake lead form | **REMOVE — replace with real Zoho Forms→CRM** | Currently loses every lead silently; worst possible funnel failure |
| "RichenQuest Global" branding + info@ email | **FOUNDER DECISION** | Conflicts with claims library: legal name RichenQuest Private Limited, official@richenquest.com |

## Claims violations found live (File 08)
1. "Trusted by 500+ students worldwide" + "Students placed abroad 500+" — verified figure is 15.
2. "100+ partner universities" (meta description + hero + stats) — signed partners: 0.
3. "Scholarship success 85%" — banned percentage-claim category.
4. "33 countries · 384 universities" — acceptable ONLY as directory inventory, not as reach/partnership claims.
5. Country-fact statements (UK 2-yr Graduate Route etc.) — broadly right today but must be date-stamped and tracked (UK shortens to 18 months for applicants from Jan 2027).

## Migration plan (SEO-safe, function-preserving)
1. **M1 (homepage):** rebuild homepage on the new design system; keep the kept content/visual
   language; claims-guard-clean copy; REAL Zoho Forms embed (or interim mailto/WhatsApp CTA
   until Zoho org is live — never a fake form). Extend tokens with legacy brand hues + serif
   display option pending founder brand call.
2. **M2–M3:** distribute legacy content to its proper pages (services→/services/, team+story→
   /about/, FAQs+scholarships→destination guides + resources, directory→/destinations/ hub).
3. **Cutover (M4):** single-page → multi-page. Old site is one URL (/) with #anchors → no URL
   equity to lose beyond /; redirect www→apex or keep www (founder choice), force https on
   apex 301, ship robots.txt + sitemap + JSON-LD from day one. Keep Clarity (C4). Zoho Sites
   subscription retires after DNS cutover to Catalyst.
4. Testimonial photos/base64 assets: re-request originals + written consent (ledger item);
   never re-embed base64.

## Open founder items from this audit
① Brand name on site: "RichenQuest Global" vs legal/claims-library naming — pick one public brand.
② info@ vs official@ email. ③ Phone numbers +91 76312 07948 / +39 327 186 6329 — confirm as
official CTA numbers. ④ Testimonial + team photo consents. ⑤ www vs apex as canonical host.
