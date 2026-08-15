# File 45 — Visa Operations Center

**Phase 9.** Written to the same citation standard as Files 42–44: every operational rule is sourced,
conflicts are shown rather than resolved by picking a number, and anything unverified says so.

**Nothing in this file may be quoted to a student or parent without its caveat attached.** A wrong
number on a visa requirement does not cost credibility — it costs an intake.

---

## 1. The finding that determines what Phase 9 can actually be

The brief asks for monitoring of appointment availability. **I investigated whether that is
technically possible, and it is not — not legitimately, in any country in RichenQuest's portfolio.**

| Route investigated | Result |
|---|---|
| Public appointment API from VFS Global | **None exists.** VFS publishes no partner or developer API for slot availability |
| Public API from any mission in the portfolio | **None found** for Italy, Germany, Hungary, Poland, Malta, Ireland |
| Direct HTTP read of VFS pages | **Blocked.** A plain fetch of `visa.vfsglobal.com/ind/en/deu/premium-services` returned **HTTP 403**, and `vfsglobal.com` served a 404 to the terms path — the site is behind active bot protection |
| Official notification/waitlist service | **None found** in the portfolio. Germany's CSP is the closest thing: it queues the applicant rather than exposing slots |

**The conclusion is not "try harder".** Automated slot monitoring on these systems means defeating bot
protection on an authenticated government booking queue. That is the mechanism behind the appointment
black market that VFS and several missions publicly fight, it is a breach of the terms of use of every
site involved, and it puts a student's actual visa application at risk if the account is flagged.
**The founder's brief already excluded it, and that instruction is correct — I would recommend it
even if it had not been given.**

### What that leaves — and why it is the better system anyway

**The thing that actually loses RichenQuest students an intake is not slot scarcity. It is lead time.**

Look at what the verified numbers below add up to for one Italian applicant:

```
Universitaly pre-enrolment       must precede the visa application
CIMEA statement                  30-60 days        (secondary source)
Italy D-visa processing          UP TO 90 DAYS     (OFFICIAL - Consulate General Mumbai)
                                 ------------------
                                 a student who books an appointment 8 weeks before
                                 the course starts has already lost the intake
```

A student who walks in three months before a February start is not short of a slot — **they are
structurally too late, and no amount of monitoring fixes that.** Meanwhile a student who starts eight
months out never has a slot problem at all.

> **So Phase 9's automation is a backward planner, not a scraper.** Anchor on the course start date,
> subtract the verified country lead time, and raise the alarm on the day the student falls behind —
> months before a human would notice. That is fully automatable inside Zoho, uses no third-party
> system, breaks no terms of use, and addresses the failure mode that actually happens.

**Everything a scraper would have told us, a calendar tells us earlier.**

## 2. Country matrix

**Confidence is stated per row and it is not uniform.** Italy, Germany, Ireland, Poland and Hungary
were researched to operational depth. Romania, Latvia, Lithuania and Cyprus were not — they are in
the brief but they have no student, no partner university and no revenue attached, and inventing
detail for them would be the exact failure mode this project has spent forty-four documents avoiding.

| Country | Booking route | Appointment system | Processing time | Confidence |
|---|---|---|---|---|
| **Italy** | **VFS Global**, prior appointment only since **15 Apr 2024** | VFS portal, jurisdiction by residence | **up to 90 days from receipt** | **High — official** |
| **Germany** | **Consular Services Portal** (`digital.diplo.de`) → VFS Global | CSP questionnaire generates the appointment route | 6–12 weeks reported | **High on route, Medium on timing** |
| **Ireland** | **AVATS** online → VFS appointment within **30 days** of creating the AVATS application | AVATS + VFS | **~40 working days** first instance | Medium-high |
| **Poland** | **e-Konsulat** (`secure2.e-konsulat.gov.pl`) → VFS | e-Konsulat registration is mandatory | 15 working days, extendable to 30–60 | Medium |
| **Hungary** | VFS Global (Delhi / Mumbai jurisdictions) | D-visa first, residence permit after arrival | ~2 weeks reported | Medium |
| **Malta** | VFS Global | Type D long-stay | 15 days, up to ~3 weeks outside Delhi | Medium |
| **Romania** | **NOT RESEARCHED** | — | — | **None** |
| **Latvia** | VFS Global processes Latvia in India | **student route not researched** | — | **Low** |
| **Lithuania** | VFS Global processes Lithuania in India | **student route not researched** | — | **Low** |
| **Cyprus** | **NOT RESEARCHED.** Not in Schengen; ETIAS covers it from late 2026 for visa-exempt travellers, which does **not** apply to Indian students | — | — | **None** |

**Read the last four rows as an instruction, not an omission.** Do not counsel a student toward
Romania, Latvia, Lithuania or Cyprus off the back of this document. If one of them becomes a real
market, it gets its own research pass first.

### The country-specific facts that actually change outcomes

| Country | The fact | Why it matters | Source quality |
|---|---|---|---|
| **Italy** | **Universitaly pre-enrolment is mandatory** and must precede the visa application. AY 2026/27 pre-enrolment is **open** | An error here invalidates the visa route, not just the form | Official |
| **Italy** | Mumbai jurisdiction submits at **VFS Mumbai (Mahalaxmi) or Cochin** only, covering Maharashtra, Gujarat, Goa, MP, Chhattisgarh, Kerala, Daman & Diu, Dadra & Nagar Haveli | Jurisdiction follows the student's **residential address**, not their preference. Wrong centre = rejected at the counter | Official |
| **Italy** | **DoV vs CIMEA:** since a **28 Mar 2024** joint guideline, the qualification requirement can be met by **CIMEA comparability certification** as well as the consular **Declaration of Value** | CIMEA averages **30–60 days** against an open-ended consular DoV — potentially the single biggest schedule saving available | Guideline verified; **university acceptance varies and many still ask for both — confirm per university, every time** |
| **Germany** | **APS certificate is a prerequisite**, reported at **4–8 weeks** | It sits *before* the visa appointment. A student who has not started APS is 2 months from being able to apply, whatever the slot situation | Secondary |
| **Germany** | The official mission wording is that the majority of national visas **can** be applied for through the CSP, and that CSP applications lead to a **faster appointment and shorter processing** | Commercial blogs state CSP is now mandatory for all study visas. **The official wording is permissive, not mandatory.** Treat CSP as strongly recommended and confirm per mission | Official wording verified; **the stronger claim is NOT verified** |
| **Germany** | Blocked account **€11,904**, **deposited cash** | The wall for RichenQuest's demographic — see File 42 | Verified earlier |
| **Ireland** | Physical documents must reach VFS **within 30 days** of creating the AVATS application | A silently expiring window. Nobody chases it | Medium-high |
| **Poland** | Appointment slots are reported to be released on a **fixed published schedule** — Delhi weekly, Mumbai monthly, released in advance | If true this is the one country where slot timing is predictable and plannable | **VERIFICATION PENDING** — see §3 |
| **Malta** | From **1 Jan 2026** travel medical insurance is accepted only from an **approved insurer list** | A student who buys the wrong policy is refused on a document they thought was done | Secondary |
| **Hungary** | D-visa first, then convert to a residence permit **within 30 days of arrival** | Post-arrival compliance, not a visa task. Easy to drop | Secondary |
| **Malta** | Residence permit within **3 months** of arrival | Same | Secondary |
| **Italy** | Residence permit (*permesso di soggiorno*) within **8 days** of arrival | The tightest post-arrival window in the portfolio by a wide margin. See File 43 | Verified earlier |

## 3. Appointment intelligence — official evidence and community evidence, kept apart

The brief asks when slots open, how often cancellations occur, and what waiting periods to expect.
**These are exactly the questions where the internet is confident and wrong**, so the two kinds of
evidence are separated here and the second kind is never to be quoted to a family.

### 3a. Official, and therefore usable

| Statement | Source |
|---|---|
| Italy study visa applications are by **prior appointment only** since 15 Apr 2024, at Mumbai (Mahalaxmi) or Cochin for that jurisdiction | Consulate General of Italy, Mumbai |
| Italy **D-visa processing can reach 90 days from receipt** | Consulate General of Italy, Mumbai |
| Universitaly pre-enrolment for **AY 2026/27 is open** | Consulate General of Italy, Mumbai |
| German national visas: **majority can be applied for via the Consular Services Portal**; CSP applications lead to a **faster appointment and shorter processing**; appointments are booked at `visa.vfsglobal.com/ind/en/deu/book-an-appointment` | German Missions in India |
| Ireland: apply on **AVATS**, then submit documents to **VFS within 30 days** | Irish immigration process, corroborated |
| Poland: national (Type D) visas are registered through **e-Konsulat** | Poland in India (gov.pl) |

### 3b. Community and commercial-blog evidence — **operationally useful, never quotable**

| Claim | Status |
|---|---|
| Poland releases slots **Delhi every Wednesday 11:00**, **Mumbai on the last working day of the month, two months ahead** | **VERIFICATION PENDING.** Reported against gov.pl by search indexing, but a direct fetch of the cited official page did **not** contain the schedule. It is plausible and it is the most operationally valuable claim in this file — **a counsellor must open e-Konsulat and confirm it before it is used to plan anything** |
| German digital submission has "ended the months-long scramble for slots" | Commercial blog. Directionally consistent with the official claim that CSP is faster; **the magnitude is marketing, not data** |
| Ireland: book the VFS appointment by **May** for a **September** intake or risk a decision after the course starts | Reported as official guidance; the official page returned **HTTP 403** to a direct fetch, so it is strong-secondary. **The underlying arithmetic is sound and matches the 40-working-day figure**, so it is safe to plan by and unsafe to quote |
| Ireland Delhi VFS closed 12–14 Aug 2026, reopening 17 Aug | Time-limited notice; **decays immediately — never cache holiday notices in the knowledge base** |
| "Cancellations free up slots at 00:00" / refresh-loop folklore | **Rejected.** Unverifiable, encourages exactly the behaviour §1 rules out, and the timing changes without notice |

### 3c. Seasonal demand — reasoned, not measured

RichenQuest has **zero visa applications on record**, so it has no historical data and **any
seasonality figure it published would be fabricated.** What can be said honestly is structural:

- European intakes cluster at **September/October** and **February**, so the demand peaks are the
  **May–August** and **November–December** run-ups.
- **A February 2027 intake is filed against the November–December 2026 peak** — which is also when
  European missions take their longest holiday closures.
- **The mitigation is not to compete for the peak. It is to be finished before it starts.**

**Embassy and VFS holiday calendars are deliberately not reproduced here.** They are published
annually, they change, and a stale holiday list in a knowledge base is worse than no list because it
looks authoritative. **They belong in the yearly intake-open checklist (SOP-0, File 46), pulled fresh
from each mission's site.**

## 4. Common rejection reasons

Ranked by what is actually within RichenQuest's control, because that is what makes the list useful.

| # | Reason | Controllable? | The control |
|---|---|---|---|
| 1 | **Insufficient or wrongly-formed proof of funds** | **Yes** | Italy accepts loans and scholarships; Germany requires deposited cash. **The form matters more than the amount** — File 43 §1.1. The Italian figure is **disputed across sources: never quote one** |
| 2 | **Document set incomplete at submission** | **Yes** | The checklist gate in SOP-1. A counter rejection costs the slot, not just the day |
| 3 | **Pre-enrolment / portal step missed or wrong** (Universitaly, AVATS, e-Konsulat) | **Yes** | These are the highest-leverage errors: they invalidate an otherwise-good application |
| 4 | **Credential documents not in the accepted form** (DoV vs CIMEA, legalisation, apostille) | **Yes** | Confirm per university per intake |
| 5 | **Insurance from a non-approved provider** (Malta from 1 Jan 2026) | **Yes** | Buy after confirming the list, not before |
| 6 | Doubt over intent to return / course-choice coherence | **Partly** | Interview preparation; a coherent study plan |
| 7 | Applied too late for the course start | **Yes — and this is the one Phase 9 automates** | §1 |

**Items 1–5 and 7 are process failures, not judgement calls.** That is the argument for a visa
operations function existing at all.

## 5. What Phase 9 builds

| Layer | Built | Where |
|---|---|---|
| **CRM state** | 11 new fields on Student Cases (Deals) | §6 |
| **Backward planner** | `visaOpsPlan` — country lead-time table → dated milestones → risk flag → tasks | `functions/src/visaOpsPlan.dg` |
| **Checklists** | Document · appointment · interview · post-appointment · post-arrival | File 46 |
| **SOPs** | 9 operational procedures + SOP-0 annual refresh | File 46 |
| **Timeline** | The 19-stage Student Timeline OS, mapped onto the three existing axes | File 47 |

**Explicitly not built, and why:**

| Not built | Reason |
|---|---|
| Slot monitor / scraper / booking bot | §1. Terms of use, and it endangers the student's own application |
| Embassy or VFS holiday calendar in the KB | Decays silently, looks authoritative. Belongs in SOP-0 |
| Processing-time predictions | RichenQuest has no historical data. A predicted date is a promise |
| Approval-likelihood scoring | Standing instruction: **assistive AI, not predictive**. Never estimate a student's visa odds |

## 6. CRM schema — created and verified

Eleven fields added to **Deals** (Student Cases), all confirmed created by the API:

| Field | Type | Note |
|---|---|---|
| `Visa_Appointment_Status` | picklist | Not Required · Not Yet Eligible · **Awaiting Slot** · Slot Booked · Rescheduled · Attended · Missed · Cancelled |
| `Appointment_Date` | datetime | centre local time |
| `Appointment_Center` | text | jurisdiction follows residential address |
| `Biometric_Status` | picklist | Not Required · Pending · Captured · Re-enrolment Required · Reused from VIS |
| `Passport_Submitted` | date | **from this date the student cannot travel anywhere** |
| `Passport_Dispatch` | date | dispatched by the mission — not the same as received |
| `Passport_Received` | date | physically back with the student |
| `Visa_Decision` | picklist | Pending · Approved · Refused · Withdrawn · Returned Incomplete |
| `Residence_Permit_Status` | picklist | Not Applicable · Not Started · Appointment Booked · Application Submitted · Biometrics Given · Card Issued · Renewal Due |
| `Course_Start_Date` | date | **the anchor for all backward planning** |
| `Visa_Ops_Risk` | picklist, colour-coded | Green · Amber · Red · Not computed |

**Three deliberate design choices:**

1. **`Awaiting Slot` is a first-class state.** It is the only state that needs a human to check a
   website daily, and naming it makes that workload visible and assignable instead of invisible.
2. **`Passport_Submitted`, `Passport_Dispatch` and `Passport_Received` are three separate dates.**
   Collapsing them loses the two intervals that matter: how long the mission held the passport, and
   how long the courier did. Only the second is ever RichenQuest's fault.
3. **`Visa_Decision` is separate from the deal `Stage`.** A refusal is a visa outcome; whether the
   case is lost is a commercial decision that follows an appeal conversation. Conflating them would
   close cases that are still live.

**Outstanding:** `Destination_Country` does not offer **Romania** or **Cyprus**. The MCP surface has
no field-update operation, so these need the session-REST channel or one minute in the CRM UI. Given
§2 says neither country should be counselled yet, this is correctly low priority.

## 7. Founder decisions

| # | Decision | Type | Priority |
|---|---|---|---|
| **V1** | **Confirm the no-scraping position** in writing, so it survives the first counsellor who finds a slot-alert Telegram group | policy | **P1** |
| **V2** | Confirm the **Poland slot-release schedule** on e-Konsulat — the one pending fact worth real money | verification | **P1** |
| **V3** | Decide whether visa operations is inside the standard fee or a **priced add-on**. File 43 §3 assumes inside; Phase 9 is the largest labour block in the service | pricing | P2 |
| **V4** | Confirm no student is to be advised toward **Romania, Latvia, Lithuania or Cyprus** until researched | scope | P2 |
