# File 13 — Founder Acceptance Testing: Launch Checklist
Production readiness audit, 2026-07-19. Status legend: ✅ Ready · 🟡 Needs founder input · 🔴 Blocking launch.
Evidence: automated sweep of all 19 built pages + claims-guard + manual persona review. Update statuses in place as items close.

## Branding
| Item | Status | Notes |
|---|---|---|
| Logo | 🟡 | Text wordmark live (clean, deliberate). Founder logo files never provided; decide: keep wordmark (recommended for now) or supply files |
| Colors | ✅ | Tokenized; derived from approved legacy visual language; rebrand = one file (`tokens.css`) |
| Typography | ✅ | System stacks (zero webfont bytes) + serif display accent; brand typeface optional later |
| Visual consistency | ✅ | Cross-site audit passed (commit 88e2b04); one design system across 19 pages |

## Business
| Item | Status | Notes |
|---|---|---|
| Claims verification | ✅ | File 08 library + claims-guard green on 19/19 pages; every number founder-approved |
| Contact information | 🟡 | Phones + official@ live on site; **founder must confirm official@richenquest.com actually sends/receives** (File 07 task A — never confirmed) |
| Company information | ✅ | 2024 operations vs Jan 2026 incorporation consistent sitewide |
| CIN | 🟡 | Not provided; needed for footer legal strip + partner credibility |
| GST | 🟡 | Not needed on-site; needed in Zoho Books at M4+ |
| Registered office | 🟡 | Not provided; needed for legal pages/footer |
| Office hours | 🟡 | Published "10:00–19:00 IST · Mon–Sat" from internal SOPs — confirm |

## Content
| Item | Status | Notes |
|---|---|---|
| Grammar / Spelling | ✅ | Automated scan: 0 genuine defects (31 flags all false positives) |
| Tone | ✅ | One voice sitewide: verified-claims, parent-directed, no hype |
| Trust signals | 🟡 | Structures live (integrity band, consent-first stories, founder block); testimonials/photos/GBP rating await consents + assets |
| CTA consistency | ✅ | WhatsApp primary everywhere; tel/mailto secondary; zero fake workflows |

## Technical
| Item | Status | Notes |
|---|---|---|
| Lighthouse | 🟡 | Formal run lands with CI tooling in M4; evidence strongly indicates ≥95 (pages 26–29KB, CSS 41KB, JS 4KB, no webfonts) |
| Core Web Vitals | ✅ | By construction (text LCP, no layout shift sources, ~0 main-thread JS); verify with field data post-launch |
| Mobile responsiveness | ✅ | Verified: sticky bar, nav, tiles, no horizontal overflow |
| Structured data | ✅ | 28/28 JSON-LD valid: EducationalOrganization sitewide, FAQPage ×8, ContactPage |
| Sitemap | ✅ | 17 URLs, www canonical host, auto-generated |
| robots.txt | ✅ | Allows all, disallows /styleguide/, points to sitemap |
| Canonical URLs | ✅ | 19/19 → https://www.richenquest.com |
| Open Graph | ✅ | 19/19 + branded 1200×630 og:image + twitter card |
| Favicons | ✅ | SVG favicon + apple-touch-icon sitewide |
| 404 | ✅ | Branded, helpful routes |
| Security headers | 🔴 | Host-level config; **Catalyst project doesn't exist yet**. First M4 task after founder creates it (CSP/HSTS plan in File 09 §7; fallback documented) |

## Legal
| Item | Status | Notes |
|---|---|---|
| Privacy Policy | 🔴 | Drafted, DPDP+GDPR structured — but stamped "Draft pending legal review". Founder (ideally + lawyer) must review before the label can come off |
| Terms | 🔴 | Same — includes honest-outcomes rule + falsified-documents refusal |
| Refund Policy | 🔴 | Same — process-based by design (no invented percentages); founder may add specific terms |
| DPDP compliance | 🟡 | Policy drafted; **grievance officer name** pending; consent banner required before any analytics script loads (M4 build) |
| GDPR review | 🟡 | Covered in policy; consent gating built in M4 |

## Lead Generation
| Item | Status | Notes |
|---|---|---|
| WhatsApp | ✅ | Live real workflow, page-aware prefill, Italy number |
| Email | 🟡 | Live everywhere — pending founder confirmation that official@ works |
| Zoho Forms | 🔴 | Zoho One not activated. M4 acceptance requires form → CRM end-to-end |
| Zoho CRM | 🔴 | Same — File 01 build not started (business Milestone 2) |
| Zoho Bookings | 🟡 | Slot reserved on /contact/; WhatsApp scheduling works meanwhile |
| Lead tracking | 🔴 | Until CRM exists, leads live in WhatsApp/inbox untracked — the #1 funnel gap |

## Analytics
| Item | Status | Notes |
|---|---|---|
| Google Analytics 4 | 🟡 | Not in approved C4 set — founder decision + consent banner + File 10 allowlist update needed |
| Google Search Console | 🟡 | Setup at M4 (DNS/meta verification) — needs domain access |
| Microsoft Clarity | 🟡 | Approved (C4); wiring + consent gate land in M4 |
| Meta Pixel | 🟡 | Optional; same consent requirements; decide with ad plans |

## Launch
| Item | Status | Notes |
|---|---|---|
| DNS | 🔴 | Registrar access needed for cutover; runbook documented (File 11 M4) |
| SSL | 🟡 | Catalyst-managed once project + domain exist |
| Redirects | 🟡 | Apex→www exists on Zoho today (http); recreate as https 301 at Catalyst |
| Backup | 🔴 | **The entire repository exists on one laptop.** GitHub remote never created. Highest-leverage 10-minute fix on this list |
| Rollback plan | ✅ | Static artifact + git tags; redeploy previous tag ≈ instant |

---

## Production Readiness Score: **70 / 100**
Technical 95 · Content & brand 90 · Business & claims 85 · Legal 55 (drafted, unreviewed) · Lead generation 45 (real but untracked channels; no CRM) · Launch infrastructure 30 (no host, no remote, no DNS). Engineering is essentially launch-grade; the gap is founder-side infrastructure and sign-offs.

## Launch Risk Assessment
1. **CRITICAL — single-machine repo.** All work exists only on this Mac. One hardware failure erases the platform. Fix: create the GitHub repo today.
2. **HIGH — the legacy site is still live with banned claims** ("500+ students", "100+ partner universities", fake form) while File 07 partnership emails point universities at richenquest.com. Every day of delay is a credibility contradiction. Fix: fast cutover, or edit the Zoho Sites hero copy now (I can supply the exact block).
3. **HIGH — Zoho activation lead time.** Zoho One setup, CRM build (File 01), and later WhatsApp BSP approval take days, not hours. Start now or M4 stalls.
4. **MEDIUM — Catalyst capabilities unverified.** The M0 spike (headers, redirects, CI deploy) was deferred because no Catalyst project exists. Assumptions are documented with fallbacks, but this is the first thing to prove in M4.
5. **MEDIUM — legal pages unreviewed**; grievance officer unnamed.
6. **LOW — brand assets, analytics, testimonials** — all post-launch-capable.

## Final Founder Action List (ordered)
1. **Today, 10 min:** create private GitHub repo; I push immediately. (Kills the critical risk.)
2. **5 min:** send a test email to/from official@richenquest.com and confirm.
3. **30 min:** create the Zoho Catalyst project in your account; grant access.
4. **1–2 h:** review the three legal pages; send CIN, registered office, grievance officer name; confirm office hours.
5. **2–3 h (+ vendor wait):** activate Zoho One (India DC, File 00 Day 1) so Forms/CRM/Bookings wiring can start.
6. **10 min:** confirm DNS registrar access for cutover day.
7. **5 min:** decide GA4 yes/no and Meta Pixel yes/no (Clarity already approved).
8. **Ongoing:** logo files, Google Business Profile, testimonial consents.

## Estimated effort to public launch
- **Engineering (me):** ~2.5–3 working days after unblocks — Catalyst spike + deploy pipeline (1d), Zoho embeds + end-to-end lead test (0.5d), consent banner + analytics wiring (0.5d), redirects + Search Console + DNS cutover + monitoring (0.5–1d).
- **Founder:** ~4–6 hours of active work (list above) plus vendor waiting periods.
- **Realistic public launch: about one week** after actions 1–6 land — Zoho activation is the critical path.
