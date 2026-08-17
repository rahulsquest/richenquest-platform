# SECTION 4 · Sales System

Copy-paste ready. Prices per `00-PRICING-ASSUMPTION.md`.

---

## 4.1 Proposal *(cover page + the table that sells)*

```
STUDY ABROAD PROPOSAL
{{student_name}} · Case {{case_no}} · {{date}}

WHAT YOU TOLD US
{{level}} in {{course}}, starting {{intake}}. Budget {{budget}}.
Countries considered: {{countries}}.

WHAT WE RECOMMEND

  {{university}} — {{programme}}
  Tuition ............................. ₹{{tuition}}    ({{source}}, checked {{date}})
  Rent × 12 ........................... ₹{{rent}}
  Living × 12 ......................... ₹{{living}}
  Health insurance .................... ₹{{insurance}}
  Visa + residence permit ............. ₹{{visa}}
  Flight .............................. ₹{{flight}}
  Setup (deposit, SIM, bedding) ....... ₹{{setup}}
  RichenQuest fee ..................... ₹{{fee}}
  ─────────────────────────────────────────────────
  TOTAL FIRST YEAR .................... ₹{{total}}

  Proof of funds you must SHOW ........ ₹{{funds}}   (returned to you)
  ─────────────────────────────────────────────────
  CASH YOUR FAMILY MUST ARRANGE ....... ₹{{cash}}

YOUR TIMELINE — worked backwards from {{course_start}}
  Documents complete ........ {{docs_by}}
  Application submitted ..... {{apply_by}}
  Offer expected ............ {{offer_by}}
  Visa filed by ............. {{file_by}}

THE HONEST RISKS IN YOUR FILE
  1. {{risk_1}}
  2. {{risk_2}}

WHAT WE NEED FROM YOU
  {{checklist}}

OUR FEE — {{package_name}} ({{package_code}}) ₹{{fee}}
  Stage 1  on signing ................. ₹{{s1}}  (25%)
  Stage 2  first application submitted  ₹{{s2}}  (35%)
  Stage 3  offer received & accepted .. ₹{{s3}}  (25%)
  Stage 4  visa file complete ......... ₹{{s4}}  (15%)

We do not guarantee admission, scholarships or visas. Every figure above carries its
source and the date we checked it. Third-party costs change without notice.
```

---

## 4.2 Quotation *(one page, no narrative)*

```
{{ENTITY}} · {{ADDRESS}} · {{EMAIL}} · {{PHONE}}
QUOTATION  RQ/EST/26-27/{{n}}   Date {{date}}   Valid 30 days
For: {{student_name}}   Case {{case_no}}

  Study-abroad consultancy — {{package_name}} ({{package_code}})    ₹{{fee}}
                                                        TOTAL      ₹{{fee}}

Payable: 25% signing · 35% first application · 25% offer · 15% visa file.

NOT INCLUDED — paid by you directly to third parties:
university application fees · tuition deposit · proof of funds · visa fee ·
insurance · courier · translation · attestation.

Estimated total first-year cost, {{country}}: ₹{{total}}
Sources: {{sources}}, checked {{verified_date}}.

Refunds per our Refund Policy, which forms part of the Service Agreement.
We do not guarantee admission, scholarship or visa outcomes.
```

---

## 4.3 Payment Link Message

> {{first_name}}, as agreed — **{{package_name}}, ₹{{fee}}**, in four stages.
>
> **Today is stage 1 only: ₹{{stage1}}.**
>
> Agreement (please read the refund table, it's short): {{agreement_link}}
> Payment: {{payment_link}}
>
> Stages 2, 3 and 4 are invoiced only when that work is actually delivered. If you stop
> before then, the refund table applies. Receipt comes within 24 hours.

---

## 4.4 Invoice Email

**Subject:** Invoice RQ/INV/26-27/{{n}} — {{case_no}}

> Dear {{first_name}},
>
> Attached is invoice **RQ/INV/26-27/{{n}}** for **₹{{amount}}** — {{package_name}},
> stage {{stage}} of 4: {{stage_name}}.
>
> Pay to: {{bank_details}}
> Or: {{payment_link}}
>
> This covers RichenQuest fees only. University, visa and third-party fees are paid by you
> directly to those parties.
>
> {{counsellor}} · RichenQuest

---

## 4.5 Receipt

```
{{ENTITY}}
RECEIPT  RQ/RCT/26-27/{{n}}   {{date}}

Received from {{student_name}} (Case {{case_no}}) the sum of ₹{{amount}}
({{amount_words}}) by {{method}} on {{payment_date}}, towards invoice
RQ/INV/26-27/{{inv}} — stage {{stage}}, {{stage_name}}.

Balance on this engagement: ₹{{balance}}

For {{ENTITY}}  ______________________
```

---

## 4.6 Welcome Kit *(sent with the first receipt)*

> **Welcome to RichenQuest, {{first_name}}.**
>
> **Case number {{case_no}}** — quote it in any message.
> **Counsellor** {{counsellor}}, {{WA_NUMBER}}, {{hours}}.
>
> **What happens now**
> 1. {{first_step}} — by {{date_1}}
> 2. Documents verified within 24 hours of you sending them
> 3. Applications submitted at least 10 days before {{deadline}}
>
> **Your one job this week:** {{top_missing_document}}
>
> **What you'll get from us**
> A written update every Friday, whether or not there is news. The full cost of anything
> before you commit to it. And early warning if the timing stops working.
>
> **What we will never do**
> Guarantee admission or a visa · sign anything on your behalf · quote a figure without
> telling you where it came from.
>
> **Your data.** Ask us any time to show what we hold, correct it, or delete it. Reply
> WITHDRAW to withdraw consent.

---

## 4.7 Client Agreement *(signature page — full terms in `legal/LEGAL-PACK.md` §3)*

```
STUDENT SERVICE AGREEMENT
Between {{ENTITY}} and ____________________  Date __________
Case {{case_no}}

Package: [ ] RQ-GUID ₹15,000   [ ] RQ-STD ₹35,000
         [ ] RQ-COMP ₹60,000   [ ] RQ-VISA ₹25,000        Fee ₹__________

Paid in four stages: 25 / 35 / 25 / 15.

I confirm I have read and received:
  [ ] The service scope (what RichenQuest will and will not do)
  [ ] The Refund Policy, including the refund table
  [ ] The Privacy Notice
  [ ] The statement that admission and visa outcomes are NOT guaranteed

Student ______________  Parent/Guardian ______________  {{ENTITY}} ______________
```

---

## 4.8 Refund Process *(operational, 4 steps)*

1. Claim to {{EMAIL}} with case number → **acknowledge within 3 working days**
2. Ops pulls `Case_Events` timeline + stage reached
3. **Check §4.4 first** — if the timeline shows we advised an already-unreachable intake,
   it is a **100% refund, no further assessment**, paid without being asked
4. Otherwise apply the refund table → founder approves → decision in writing within 15
   working days → paid within 15 of the decision, to the originating account → credit note

---

## 4.9 Payment Reminder *(chase the date, never the money)*

**Day 3**
> {{first_name}}, your {{university}} deadline is {{deadline}} — {{days}} days away. I'm
> not chasing the payment, I'm chasing the date. Shall I hold your place in this week's
> application batch?

**Day 7**
> {{first_name}}, I need a decision by {{date}} to submit before {{deadline}}. After that
> the only honest option is the next intake. Yes or no is fine — I just can't plan on
> silence.

**Day 10 — close it**
> {{first_name}}, I'm closing your file for {{intake}} so I stop taking up your time.
> No hard feelings. Apply for your passport anyway, and if you want to look at
> {{next_intake}} later, message me and I'll reopen it.

---

## 4.10 Lost Lead Recovery *(run at day 30 and day 90 only)*

**Day 30 — the useful message, not the needy one**
> {{first_name}}, no pitch. {{university}}'s deadline for {{next_intake}} is {{deadline}},
> and I know a few families who missed it last year by not knowing. Thought you'd want the
> date. If you've gone with someone else, genuinely good luck.

**Day 90 — intake reset**
> {{first_name}}, {{next_intake}} applications are opening. If studying abroad is still on
> your mind, your file is still here and you won't have to fill anything in again. If it
> isn't, tell me and I'll delete your data.

---

## 4.11 Referral Request *(after an outcome, never before)*

**To the student**
> {{first_name}}, now you're settled — if anyone asks you about studying abroad, send them
> {{PORTAL_URL}}. They'll get the same full-cost breakdown you got, before committing to
> anything. If they mention your name, I'll tell you when they get their offer.

**To the referrer — the highest-leverage message in the business**
> {{referrer_name}}, {{first_name}} — the student you sent us — landed in {{city}} last
> week and has started classes. Thank you. I thought you'd want to know it worked out.
