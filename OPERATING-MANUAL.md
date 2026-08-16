# The RichenQuest Operating Manual

**Written so a new employee can run operations without the founder in the room.**
**Version 1.0 · 16 August 2026 · owner: Rahul Kumar**

---

## 0. The honest premise

**The KPI is 100 successful students. It will not happen in 100 days, and pretending otherwise would
make this manual useless.**

| | |
|---|---|
| **Days 1–100** *(to 24 Nov 2026)* | **The February cohort: 3–8 students** — and the machine that produces the rest |
| **To Sep 2027** | **The September cohort: 60–90 students** — Italy, Germany, full portfolio, DSU |
| **100 successful students** | **Realistically late 2027 / early 2028** |

**Why February is small and still essential:** the window for new February leads closes around
**4 October** (a family needs ~4 weeks from first contact to a submitted application, and Debrecen
closes 1 November). **The company's real risk is not a small February. It is a zero February** —
which walks into September 2027 with no reviews, no case studies and no proof.

> **Days 1–100 buy the first students, the first reviews, and a system that works. Not the hundred.**

---

## 1. Activity audit — who does what

| Activity | Classification |
|---|---|
| Pricing · commercial negotiation · university and CAF relationships · legal decisions | **FOUNDER — only** |
| Seminar delivery | **COUNSELLOR** *(pack: `marketing/PRESENTER-PACK.md`)* |
| First call within 48h | **COUNSELLOR** |
| Counselling session · parent meeting | **COUNSELLOR**, founder for ₹25L+ cases |
| Lead entry, CRM hygiene, document chasing, scheduling | **OPS/INTERN** |
| Shortlist, timeline, risk list, document list | **AUTOMATE** — `leadToPlan` |
| Visa deadline tracking, risk flags, stale-data alerts | **AUTOMATE** — `visaOpsSweep`, `opsWatch`, `readinessSweep` |
| Turning verified facts into content | **CONTENT** — re-cut only, never new claims |
| Compliance check on any customer-facing draft | **AUTOMATE** — `qualityGate`, then a human approves |
| **Building more automation, more research, more documents** | **🔴 REMOVE** |
| **Countries outside Italy · Hungary · Poland · Czechia · one German** | **🔴 REMOVE** |
| **Financial-services partnerships** | **🔴 REMOVE until 10 enrolled students** |
| Work-visa / recruitment | **🔴 REMOVE — unlicensed (Emigration Act 1983)** |

**The rule that keeps this honest: if the founder does it twice, it becomes an SOP. If it happens
twice a week, it becomes someone else's job.**

## 2. The team — 5 people, ₹5 lakh, 100 days

| Role | Owns | Daily | Weekly KPI |
|---|---|---|---|
| **Founder** | Price, partnerships, negotiation, ₹25L+ cases | Dashboard (§6), 1 partner conversation | 1 university reply · 1 institute booked |
| **Counsellor A** *(presenter)* | Seminars + first calls | Every lead <48h old called | **≥15% capture** · 100% called in 48h |
| **Counsellor B** | Counselling, parents, documents | 2 counselling sessions | Applications started |
| **Ops** | CRM, documents, scheduling, follow-ups | Every slip entered same day | **0 leads older than 48h uncalled** |
| **Content** | Article → 11 formats, GBP, WhatsApp | 1 asset re-cut | 3 published/week |

### Budget — ₹5,00,000 over 100 days

| | |
|---|---|
| Team (5 × ~₹30k/mo × 3.3 mo) | **₹4,00,000** |
| Seminars — travel, printing, slips (12) | ₹60,000 |
| CRM licences (3 users) | ₹16,000 |
| Phone, data, misc | ₹15,000 |
| **Contingency** | **₹9,000** |

> **There is no paid-advertising line, deliberately.** At this budget every rupee of ad spend is a
> rupee not spent on a seminar, and **a seminar converts at 15% while cold ads convert at fractions of
> a percent.** Paid acquisition starts when there is a fee, a review and a known conversion rate — not
> before.

## 3. The Student Success Pipeline

| # | Stage | Owner | Automation | KPI | **Failure point** | Recovery |
|---|---|---|---|---|---|---|
| **1** | **Lead generation** | Counsellor A | — | ≥15% capture | **No seminar booked** | Founder books one that week. **Nothing else matters** |
| **2** | Qualification | Ops | `qualifyLead` | 100% called <48h | **Slip left in a bag** | Same-day entry rule, checked at 18:00 |
| **3** | **Counselling** | Counsellor B | **`leadToPlan`** | ≥40% of qualified booked | **Wrong person in the room** | Ask *"who else decides?"* on the first call |
| **4** | Application | Counsellor B + Ops | Document checklist | Submitted before deadline | 🔴 **DOCUMENT COLLECTION — the predicted failure** | **Ask about the passport on call 1.** No passport = nothing proceeds |
| **5** | Offer | Ops | — | Offer received | University silence | Chase weekly, log in CRM |
| **6** | **Visa** | Counsellor B | **`visaOpsSweep`** | Filed before the safe date | **Filed too late** | Risk turns Red automatically **before** anything visibly fails |
| **7** | Departure | Ops | — | Pre-departure done | Passport still with mission | SOP-5 |
| **8** | Arrival | Ops | — | **Permit within the legal window** | **Italy 8 days · Hungary 30 · Malta 3 mo** | File 46 §E |
| **9** | **Review** | Counsellor B | — | **≥60% leave a review** | Asked too late | **Ask in week 2 after arrival**, not at graduation |
| **10** | **Referral** | Counsellor B | — | **≥1 referral per 3 students** | Never asked | Ask at review, script in `REFERRAL-ENGINE.md` |

**Stage 4 is where this will break.** It is written down now so it is not a surprise in October.

## 4. Marketing — only channels that produce students in 90 days

| Rank | Channel | Expected leads | Cost | Time | Speed |
|---|---|---|---|---|---|
| **1** | **Coaching institute / school seminars** | **10–25 per event** | ₹5k | 2h to book | **days** |
| **2** | **Referrals — past students, teachers** | 1–3 per 10 messages | ₹0 | 1h | days |
| **3** | **Google Business Profile** | 2–5/month, **highest intent** | ₹0 | 1h + verification | 2–4 wks |
| **4** | **WhatsApp — the True Cost article** | organic, unmeasured | ₹0 | 0 | days |
| 5 | Parent webinars | 5–15 | ₹0 | 3h | weeks |
| 6 | Instagram / LinkedIn / Shorts | low near-term | ₹0 | ongoing | **months** |
| 7 | SEO | high later | ₹0 | ongoing | **6–12 months** |
| 🔴 | **Paid ads** | — | high | — | **DELETE — no fee, no conversion data** |

**Ranks 1–4 are the whole plan for 100 days.** 5–7 are built with spare capacity because they compound
later; **they will not produce a February student.**

## 5. Content machine — one source of truth

**`marketing/ARTICLE-what-a-europe-masters-actually-costs.md` is the source.** Everything else is that
text re-cut.

```
VERIFIED FACT (CRM record, dated, sourced)
   └─► the Article  ──► carousel · reel script · LinkedIn · WhatsApp
                   ──► parent PDF · student guide · seminar slide
                   ──► newsletter · SEO page · knowledge article
```

**Three rules, non-negotiable:**

1. **No format introduces a claim the article does not contain.**
2. **Everything passes `qualityGate`, then a named human approves.**
3. **A fact changes → every format changes.** The article is edited first, never a downstream asset.

## 6. Founder dashboard — every morning, nothing else

```
New leads (24h)         ___     Applications       ___
Uncalled >48h           ___ ⚠   Offers             ___
Counselling booked      ___     Visa cases at risk ___ ⚠
Seminars booked (14d)   ___ ⚠   Revenue booked     ___
Content published (7d)  ___     Reviews · referrals ___

HIGHEST RISK       ______________________________
TODAY'S ONE THING  ______________________________
```

**Three ⚠ lines are the only ones that trigger action.** If *seminars booked in the next 14 days* is
zero, that is the day's one thing — **regardless of what else is on the list.**

## 7. Friday review — four questions, 20 minutes

1. **What generated students?** → double it
2. **What wasted time?** → stop it
3. **What should stop immediately?**
4. **What should double next week?**

**Plus one discipline that has already paid for itself: challenge one verified fact and try to
disprove it.** It caught a ₹9 lakh error in this company's own cost model within a day of publishing.

## 8. The 100 days, week by week

| Wk | Dates | The one thing | Everything else |
|---|---|---|---|
| **1** | 17–23 Aug | **SET THE FEE.** Send Debrecen email | Publish article · start presenter training |
| **2** | 24–30 Aug | **BOOK 3 SEMINARS** | 10 referral messages · GBP claim |
| **3** | 31 Aug–6 Sep | **SEMINAR 1** | Debrief <24h · first calls |
| **4** | 7–13 Sep | Seminars 2–3 | First counselling sessions |
| **5** | 14–20 Sep | **First applications started** | ⚠️ last week for cautious families |
| **6** | 21–27 Sep | Seminars 4–5 | Document collection begins |
| **7** | 28 Sep–4 Oct | 🔴 **LAST FEBRUARY SEMINAR** | After this: pitch March & September |
| **8** | 5–11 Oct | **Convert only** | **Passport check every case** |
| **9** | 12–18 Oct | Applications submitted | Italy research starts |
| **10** | 19–25 Oct | Chase offers | Italy university #1 |
| **11** | 26 Oct–1 Nov | 🔴 **1 NOV — DEBRECEN CLOSES** | February done |
| **12** | 2–8 Nov | **Visa filing** — safe date 18 Nov | Italy university #2 |
| **13** | 9–15 Nov | Visa cases · retrospective | September plan written |
| **14** | 16–24 Nov | **September 2027 build begins** | Seminars now pitch September |

**The one thing column is the whole manual.** If a week's one thing did not happen, nothing else that
week counted.

## 9. Escalation — when to stop and get the founder

- Any question about **fees, discounts or refunds** — the price is the founder's alone
- A university or institute wants a **written agreement**
- A family mentions a **previous visa refusal**
- Anyone asks about **work visas, PR or migration** — **regulated, we do not advise**
- **A number we published turns out to be wrong** → **founder same day, public correction within 48h**

**The last one is not damage control. It is the product** — File 68.

## 10. The five sentences nobody at RichenQuest may say

1. *"You'll definitely get admission / a scholarship / a visa."*
2. *"Your chances are good."*
3. A total cost that excludes unverified living costs.
4. *"We're partnered with that university."* — `claims.json` records none.
5. *"We can get you a faster visa appointment."*

**Instead: *"I don't know — I'll confirm and send it in writing."*** That answer has never lost this
company a student. **A wrong answer has no upside at all.**

---

## The answer to the final question

**₹5 lakh, 5 people, 100 days, no funding — what happens every week?**

> **Weeks 1–2: remove the two blockers only the founder can remove — the price, and the email.**
> **Weeks 3–7: run one seminar a week and call every lead within 48 hours.**
> **Weeks 8–11: stop selling February and convert what exists. Chase passports, not leads.**
> **Weeks 12–14: file the visas, run the retrospective, and turn the whole machine toward September 2027.**

**Expected outcome: 4–6 seminars, 60–120 leads, 8–15 applications, 3–8 February students, and the
first reviews this company has ever had.**

**Then the same machine, pointed at a nine-month runway and a portfolio that includes Italy, produces
the other ninety.**
