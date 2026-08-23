# FOUNDING-50.md — 2026-08-23

## 🔴 Blocker found while designing this — the referral field is broken

The Founding 50 is referral-driven, and **referral tracking does not currently work.**

`parseInquiry` writes the referrer's **name** ("Mr Anil Kumar, teacher") into
`Lead_Source_Detail` — which is a **picklist** whose only valid values are
`Website Form · WhatsApp · Instagram · Facebook · LinkedIn · YouTube · TikTok · Google Ads ·
Walk-in · Referral · Education Fair · Other`.

Zoho does not enforce picklists. The name **saves silently and never matches a filter.** The
field this repo repeatedly calls *"the single most valuable field on the Lead"* is being
quietly corrupted on every submission — the same silent-failure class already paid for twice
with `Interested_Level` and `Parents_Annual_Income`. I introduced it.

**The fix is one field and about two minutes**, but schema is frozen, so it needs a decision:

| Field | Gets |
|---|---|
| `Referred_By_Name` *(new text)* | "Mr Anil Kumar, teacher, Patna" |
| `Lead_Source_Detail` *(existing picklist)* | `Referral` |
| `Lead_Source` *(existing)* | `External Referral` |

**Until this is approved, referrers must be recorded by hand.** Do not launch a referral
programme on a field that silently discards its input.

---

## Ideal student profile — the Founding 50

| | |
|---|---|
| **Who** | ₹10–25L family budget · Bihar, Jharkhand, UP, Nepal · Bachelor's complete or final year |
| **Intake** | Feb 2027 (verifiable now) or **Sep 2027** (the Italy cohort) |
| **Signals they fit** | asks about *total* cost, not tuition · has been quoted by another agent and distrusts it · parent is involved · no passport yet is fine |
| **Signals they do not** | wants a guarantee · wants the cheapest possible regardless of outcome · budget under ₹10L (say so honestly — Europe does not work) |

**Deliberately not filtered on:** marks, backlogs, gaps, English. Profile B in testing scored
**58% with 2 backlogs and still reached FIT 100.** Academics gate less than families assume,
and saying so is itself a differentiator.

## The offer — structure proposed, pricing is a founder decision

**Do not promise a discount without approval.** Three structures, in order of preference:

| # | Offer | What we give | What we ask | Risk |
|---|---|---|---|---|
| **A** | **Free Clarity Report** *(recommended)* | verified full-cost breakdown + roadmap + honest go/no-go | 20 min of feedback | none — the ledger already made this free |
| B | Founding rate on a paid package | a stated reduction | feedback + a review after outcome | **needs approval; sets a price anchor** |
| C | Standard pricing, founding-cohort access | earlier access, direct founder line | feedback | slowest to convert |

**Recommend A.** The ledger already overturned charging for the Clarity Report — *"charging
for the truth excludes exactly the families most likely to need it."* It costs no cash, is
honest, and it buys the one thing the pilot actually needs: **feedback from real families**.

**Never offered:** guaranteed admission · guaranteed visa · guaranteed scholarship ·
"we'll get you in" · a refund promise beyond the written Refund Policy.

## Qualification — 4 questions, in this order

1. **Budget** — is the honest total ≥ ₹10L? *(below this, say so and close the file kindly)*
2. **Intake** — named, and ≥ 4 months out?
3. **Passport** — held or applied? *(neither is fine on day one; it becomes the first action)*
4. **Parent** — aware and contactable?

**All four = qualified.** Three or fewer = keep in touch, do not counsel yet. This is already
`FIRST-10-STUDENT-PILOT-PLAYBOOK.md`'s definition; it does not change for volume.

## Feedback — the actual product of the first 50
Students 1–10 run the full pilot instrumentation. Students 11–50 answer **three questions
only**: did you understand why we recommended it · did you learn something new · was anything
recommended that you already knew was wrong.

## Referral mechanism — after outcomes, never before

**Two moments, and only two:**

1. **The student succeeds** → *"If anyone asks you about studying abroad, send them this link.
   If they mention your name, I'll tell you when they get their offer."*
2. **Tell the referrer their student succeeded** → the highest-leverage message in the
   business (`OPERATING-MANUAL.md` §11 records **3.4× vs 2.0×** against simply asking for a
   referral).

**No incentive, no reward, no affiliate scheme.** Paying for referrals in education is how
the agent industry lost its credibility, and it would contradict everything the verification
gate is for.

## Milestones
**1–10** pilot, full instrumentation, trust validation.
**11–25** repeatability — does it work without the founder in every call?
**26–50** referral share ≥ 30% is the signal the product spreads on its own. Below 15%, it
does not, and that is the finding.
