# War room — the seven weeks to 1 November

> ## ✅ THE DEADLINE IS NOW VERIFIED
> **University of Debrecen, from its own page (`edu.unideb.hu`), 16 Aug 2026:**
> *"for January/February 2026/2027 intake: all programs: **1st November 2026**"*
> **September 2027 intake: 15 May 2027.** Application fee **USD 150, non-refundable** — confirmed.
>
> Every date below is built on that. The hedge has been removed from all six content assets.

---

## The campaign calendar

**Today: 16 August 2026.** Debrecen closes in **11 weeks**. But lead generation closes sooner, because
a family needs ~4 weeks from first hearing about a university to a submitted application.

| Week | Dates | What it is for | Hard stop |
|---|---|---|---|
| **W1** | 17–23 Aug | **Book seminars.** Send 3 partner emails + first 10 referral messages | — |
| **W2** | 24–30 Aug | **Seminar 1.** Debrief within 24h | — |
| **W3** | 31 Aug – 6 Sep | Seminars 2–3. First counselling calls | — |
| **W4** | 7–13 Sep | Seminars 4–5. **Applications start going in** | — |
| **W5** | 14–20 Sep | Seminars 6–7 | ⚠️ **Last week to catch a cautious family** (loan needed, first-generation) |
| **W6** | 21–27 Sep | Conversion focus. Fewer new seminars | — |
| **W7** | 28 Sep – 4 Oct | **LAST USEFUL FEBRUARY SEMINAR** | 🔴 **After this, pitch March/September only** |
| W8–11 | 5 Oct – 1 Nov | **No new February leads. Convert what exists.** Documents, applications, submissions | 🔴 **1 Nov — Debrecen closes** |
| — | 18 Nov | **Last safe visa filing** for a February start | 🔴 |

**Read W7 as the real deadline.** After 4 October, a February pitch is selling an intake the student
cannot reach — and Vistula's March intake (closes ~10 Feb) plus September 2027 (closes 15 May) are
the honest offers.

### What "one bottleneck at a time" means in practice

| If this is true on a Monday | The week's bottleneck is |
|---|---|
| No seminar booked for the next 14 days | **Booking.** Nothing else matters |
| Seminars booked, <10 leads captured per seminar | **The talk.** Debrief and fix slides |
| Leads captured, not being called within 48h | **Follow-up speed.** A 5-day-old lead is a cold lead |
| Counselling happening, no applications starting | **The document ask.** See §3 |
| Applications started, not submitted | **Document collection.** The longest pole in this campaign |

---

## 1. Capture slip — print this

**The seminar kit assumed a capture slip existed. It did not.** A seminar without a form is a seminar
without leads. Six fields, because these are exactly what `leadToPlan` needs to produce a full plan
before the counsellor calls back.

```
┌────────────────────────────────────────────────────────────┐
│  RICHENQUEST — FREE PROFILE CHECK                          │
│  We'll tell you which requirements you meet, and which     │
│  you don't. In writing. No cost.                           │
│                                                            │
│  Name  ____________________________________________        │
│                                                            │
│  WhatsApp number  __________________________________       │
│                                                            │
│  Class / Degree  ___________________________________       │
│                                                            │
│  Family budget for the whole course  (tick one)            │
│    ☐ under ₹10 lakh    ☐ ₹10–20 lakh                       │
│    ☐ ₹20–35 lakh       ☐ above ₹35 lakh                    │
│                                                            │
│  English  (tick one)                                       │
│    ☐ No test yet   ☐ Studied in English medium             │
│    ☐ IELTS 5.5     ☐ IELTS 6.0    ☐ IELTS 6.5+             │
│                                                            │
│  When do you want to start?  (tick one)                    │
│    ☐ Feb/Mar 2027   ☐ Sep 2027   ☐ Not sure                │
│                                                            │
│  Study gap since last exam:  ______ years                  │
│                                                            │
│  ☐ I agree to be contacted on WhatsApp about this          │
└────────────────────────────────────────────────────────────┘
```

**Print, don't QR.** A hall in Patna with 100 people has poor signal and a QR code converts a room
into a queue of failures. **Paper works.**

**The consent tick is not optional.** It is the record that the contact was invited.

### Same-day entry rule

**Every slip becomes a Lead the same evening**, with `Lead_Source_Detail` = the institute's name.
A slip in a bag on Monday is a lost lead by Thursday.

---

## 2. First call script — lead → counselling *(O2)*

**Call within 48 hours.** Run `leadToPlan` on the record **before** dialling — you should already know
the shortlist and the three questions to ask.

> **"Namaste, [name]. Rahul from RichenQuest — we met at [institute] on [day]. Two minutes, not a
> sales call. I've already looked at what you wrote on the slip."**

**Then, in this order:**

**1. Confirm, don't re-ask.** *"You wrote ₹10–20 lakh and February. Is that the whole budget for the
course, or per year?"* — **This one question changes the entire shortlist.** Families routinely write
the annual figure.

**2. Give something before asking for anything.** *"Based on what you wrote, here's what actually
fits — and here's what doesn't and why."* Read one shortlisted university **and one exclusion with
its reason.** The exclusion is what makes the shortlist credible.

**3. The three questions the slip cannot answer:**
- *"Was your college teaching in English?"* — decides the MOI waiver route
- *"Has anyone in the family looked at an education loan?"* — decides Germany vs Hungary/Poland entirely
- *"Who else decides this with you?"* — **if a parent decides, the next call must include them.** A counselling session with the wrong person is a wasted session

**4. Name the deadline, honestly.**
> *"Debrecen closes on 1 November — that's confirmed, from their own page. Working backwards, we'd
> need your documents by early October. That's tight but it's doable. If it slips, the honest answer
> is March or September, not a rush."*

**5. Book a specific time, with the parent.** *"Can we do 30 minutes on [day] at [time]? Please have
[parent] there — most of my questions are about money and they'll want to hear the answers directly."*

### What not to say — every one of these loses a family later

| Never | Say instead |
|---|---|
| "Your chances are good" | *"You meet these requirements and not those."* |
| "You'll get a scholarship" | *"These discounts exist. The merit one starts in Year 2, so budget Year 1 fully."* |
| "Total cost is about X" | *"Tuition is X. Living costs for Hungary we haven't verified and won't guess at."* |
| "We'll get you a faster visa slot" | *"Nobody legitimately can. We start early so you don't need one."* |
| "We're partnered with them" | *"We've verified their requirements against their own site. We've asked about a formal partnership."* |

---

## 3. Counselling → application *(O3)* — where this campaign will actually stall

**Prediction, stated now so it can be checked in November: the campaign will not fail at leads or at
counselling. It will fail at document collection.** A family that says yes in September and cannot
produce transcripts, passport and funds evidence by early October misses 1 November.

**So the counselling session ends with a document deadline, not a follow-up.**

| At the end of every session | |
|---|---|
| Create the Student Case with **`Course_Start_Date`** set | `visaOpsSweep` immediately gives a last-safe-filing date |
| Hand over the document list **with a date against each item** | Not "soon" |
| **Passport first.** If they don't have one, that is the campaign's critical path | A new passport can take weeks and nothing proceeds without it |
| Tell them the **USD 500 non-refundable** figure before they commit | Not on the day it is charged |

**The passport question should move to the first call.** *"Does the student have a current passport?"*
— if no, everything else is theoretical.

---

## 4. Debrief — within 24 hours of every seminar

| Record | Feeds |
|---|---|
| Attendance · slips · **slips ÷ attendance** | Campaign tracker |
| **Every question, verbatim** | Student FAQ |
| **Every parent concern, in the words used** | Parent FAQ |
| Objections, and what answer worked | Objection handling |
| **Which slide lost the room / got phones out** | Seminar kit |
| **Any question nobody could answer** | 🔴 **The most valuable output — a verified gap, found free** |

**Rule: any question asked at two seminars becomes a knowledge article that week.**

---

## Executive dashboard *(report only these)*

| | |
|---|---|
| Seminars completed | **0** |
| Leads generated | **0** |
| Counselling sessions | **0** |
| Applications | **0** |
| Offers | **0** |
| University replies | **0** |
| Applications at risk | **0** |
| Expected enrolments | **0** |
| Revenue booked | **₹0** |

**Every line moves from one action: booking the first seminar.**
