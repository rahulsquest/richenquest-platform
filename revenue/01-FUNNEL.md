# SECTION 1 · Complete Lead Funnel

Prices per `00-PRICING-ASSUMPTION.md`. Sellable country today: **Hungary only.**

---

## Stage 1 · Visitor → Portal

**Owner** Founder (traffic) · **SLA** — · **Automation** none — static page
**Documents** True Cost Report (the single asset that earns the click)
**WhatsApp** *(sent by a teacher / node, forwarded to students)*
> I've been sending students this — it's a breakdown of what a European degree actually
> costs an Indian family in the first year, including rent, insurance and the visa, not
> just tuition. Free, no sign-up: {{PORTAL_URL}}

**Email** none · **Next trigger** student clicks Start Application

---

## Stage 2 · Portal → Lead

**Owner** automatic · **SLA** instant
**Automation** `submitApplication()` → `normalizeInput` → `parseInquiry` → `qualifyLead` →
`assignCounselor` → `createFollowUpTasks`. Case number issued, consent recorded.
**Documents** none

**WhatsApp — send within 5 minutes, automatic**
> Hello {{first_name}}, this is RichenQuest.
>
> We have your application. Your reference is *{{case_no}}* — quote it in any message and
> we'll find your file straight away.
>
> {{counsellor}} will call you by *{{call_by}}*. They'll have read everything you sent, so
> you won't be asked the same questions twice.
>
> Nothing to do until then.

**If `passport_urgent`, append:**
> One thing that can't wait for the call: *apply for your passport this week.* It takes
> several weeks and nothing else can move without it.

**Email** MESSAGES.md §4 · **Next trigger** CALL WITHIN 48H task in the work queue

---

## Stage 3 · Lead → Qualified Lead

**Owner** Counsellor · **SLA** **first call within 48h**, minimum 3 attempts across 2 days
**Automation** `qualifyLead` scores; `buildWorkQueue` bands it
**Documents** Student Profile + Academic Evaluation (Section 2)

**Qualified = all four true:**
1. Budget ≥ ₹10L *(below this, Europe does not work — say so and close the lead honestly)*
2. Intake named and ≥ 4 months away
3. Passport held **or** applied
4. Parent aware and contactable

**WhatsApp — no answer, attempt 1**
> {{first_name}}, this is {{counsellor}} from RichenQuest — I tried calling about your
> application {{case_no}}. When suits you today or tomorrow? I only need 20 minutes.

**WhatsApp — attempt 3 (final)**
> {{first_name}}, I've tried three times and don't want to keep bothering you. I'll leave
> your file open for 7 days. If you'd still like to talk, just reply with a time.
> If your plans have changed, tell me and I'll close it — no problem either way.

**Next trigger** counselling session booked

---

## Stage 4 · Qualified → Counselling

**Owner** Counsellor · **SLA** session within 5 days of qualification; **written shortlist
within 3 working days** of the session
**Automation** `student360()` before dialling — never the raw CRM record
**Documents** Budget Assessment · Risk Assessment · Country Preference · Counselling Notes
· Decision Sheet (Section 2)

**WhatsApp — confirmation, 1 day before**
> {{first_name}}, confirming our counselling call tomorrow at {{time}}. Two requests:
> 1. Please have your {{parent_relation}} on the call — they hold the budget and it saves
>    repeating everything later.
> 2. Keep your marksheets handy.
> It takes about 45 minutes.

**Next trigger** shortlist sent

---

## Stage 5 · Counselling → Proposal

**Owner** Counsellor · **SLA** 3 working days
**Documents** Proposal · Quotation · Action Plan
**Rule** Only universities with tuition, living cost and deadline verified. **Today that is
Debrecen only.**

**WhatsApp — with the proposal**
> {{first_name}}, your shortlist is attached — {{case_no}}.
>
> The number at the bottom is the *total* first-year cost, not tuition. Rent, food,
> insurance, the visa, the residence permit and your flight are all in it, and every figure
> says where it came from.
>
> Read it with your {{parent_relation}}. I'll call {{followup_day}} to go through it.
> If anything looks wrong, tell me — I'd rather fix it now than have you find out in
> November.

**Next trigger** closing call booked

---

## Stage 6 · Proposal → Payment

**Owner** Counsellor · **SLA** closing call within 3 days; decision within 7
**Documents** Client Agreement · Invoice · Payment Link
**Automation** none — signature and payment are human by design

**WhatsApp — payment request**
> {{first_name}}, as agreed — {{package_name}}, ₹{{fee}}, payable in four stages.
> Today is stage 1 only: **₹{{stage1}}**.
>
> Agreement: {{agreement_link}}
> Pay: {{payment_link}}
>
> You're paying for stage 1. Stages 2, 3 and 4 are only invoiced when that work is
> actually delivered. If you stop before then, the refund table in the agreement applies.

**WhatsApp — reminder, day 3**
> {{first_name}}, just a note that your Debrecen deadline is {{deadline}} — {{days}} days
> away. I'm not chasing the payment, I'm chasing the date. Shall I hold your place in this
> week's application batch?

**Next trigger** payment received → Lead converted to Contact + Student Case

---

## Stage 7 · Payment → Application

**Owner** Counsellor, checked by Ops · **SLA** submitted ≥10 days before deadline
**Automation** Applications module; `caseState` raises `DEADLINE_PASSED`
**Documents** Document Checklist · Receipt · Welcome Kit

**WhatsApp — on receipt**
> Received, thank you — receipt {{receipt_no}} attached. Your welcome kit is with it.
>
> You now have one job: {{top_missing_document}}. That's the only thing between you and a
> submitted application.

**Next trigger** all documents verified → submit

---

## Stage 8 · Application → Offer

**Owner** Counsellor · **SLA** student told within 24h of any decision
**Documents** Offer Letter Email (client-docs §6)
**Automation** `caseState` → `OFFER_IN_HAND`; next action = discuss with parent

**Next trigger** offer accepted, deposit paid → visa stage

---

## Stage 9 · Offer → Visa

**Owner** Ops · **SLA** file complete **before** the appointment is booked
**Automation** `visaOpsPlan` nightly; hard block `APPOINTMENT_WITHOUT_DOCUMENTS`
**Documents** Visa Submission Email · mission checklist verified that week

**Next trigger** `Visa_Decision` recorded

---

## Stage 10 · Visa → Arrival

**Owner** Ops · **SLA** residence permit filed inside the legal window
(Italy 8 days · Hungary 30 · Malta 3 months)
**Documents** Congratulations Email · Arrival Email · Referral Request

**WhatsApp — after arrival, the highest-leverage message in the business**
> {{referrer_name}}, {{first_name}} — the student you sent us — landed in Debrecen last
> week and has started classes. Thank you. I thought you'd want to know it worked out.

**Next trigger** Review Request + Success Story consent
