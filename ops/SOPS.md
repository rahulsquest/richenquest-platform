# RichenQuest — Standard Operating Procedures v1.0

Ten SOPs. Each states Owner, Inputs, Outputs, Checklist, SLA, Escalation, Automation.

**Two rules that override every SOP below:**
1. If `caseState()` reports a **hard block**, that is the work. Nothing else on the case
   proceeds until it clears. The system will not let you hide it and neither should you.
2. **Never tell a family something you have not verified.** "I will check and come back
   today" is always an acceptable answer. A confident wrong answer is not.

---

## SOP-1 · New enquiry

| | |
|---|---|
| **Owner** | Assigned counsellor (auto-assigned by `assignCounselor`) |
| **Inputs** | Lead created by `submitApplication()` from the wizard |
| **Outputs** | Contacted lead, counselling call booked, `Lead_Status` updated |
| **SLA** | **First call within 48 hours.** Two attempts minimum, at different times of day |
| **Escalation** | No contact after 3 attempts across 5 days → manager reassigns |
| **Automation** | `parseInquiry` · `qualifyLead` · `assignCounselor` · `createFollowUpTasks` · task "CALL WITHIN 48H" |

**Checklist**
- [ ] Open `student360()` **before** dialling. Do not open the raw CRM record.
- [ ] Read the whole file. You may not ask a question the wizard already answered.
- [ ] If `passport_urgent`, that is your opening topic — not your closing one.
- [ ] Confirm name spelling against passport, and the WhatsApp number by sending one message.
- [ ] Set `Intended_Intake` and, if known, `Course_Start_Date`. **Without a start date
      nothing can be planned backwards and every deadline on the case is invisible.**
- [ ] Book the counselling call with the parent invited.
- [ ] Update `Lead_Status`. A lead left at "-None-" is a lead nobody is working.
- [ ] Send WhatsApp template 2 (document checklist) the same day.

---

## SOP-2 · Counselling session

| | |
|---|---|
| **Owner** | Counsellor |
| **Inputs** | `student360()` payload, budget, level, countries |
| **Outputs** | Written shortlist with true costs, agreed intake, signed Service Agreement |
| **SLA** | Shortlist sent **within 3 working days** of the session |
| **Escalation** | Shortlist not sent in 5 days → manager |
| **Automation** | `student360` · `leadToPlan` · `studentActionPlan` · `qualityGate` on the written output |

**Checklist**
- [ ] Parent present or explicitly excused by the student.
- [ ] State the **total** cost before tuition — the number they will actually spend.
- [ ] Every figure quoted carries its source and date. If it is not verified, say so.
- [ ] Only recommend universities where `Confidence` is High or Medium. **Never quote
      tuition for a university whose tuition is unverified.**
- [ ] Explain the timeline backwards from the start date, not forwards from today.
- [ ] Name at least one real risk in their profile. A counselling call with no risks
      named was a sales call.
- [ ] Confirm the refund policy verbally and point to the clause.
- [ ] Log the agreed intake and next step in the CRM before the day ends.

---

## SOP-3 · Document verification

| | |
|---|---|
| **Owner** | Operations |
| **Inputs** | Uploaded documents |
| **Outputs** | `Document_Status` = Verified, gaps listed to the student |
| **SLA** | Every document reviewed **within 24 hours** of upload |
| **Escalation** | Suspected forgery → founder immediately, **before** any contact with the student |
| **Automation** | Worker auto-tags on upload · `readinessSweep` · `caseState` raises `DOCUMENTS_INCOMPLETE` |

**Checklist per document**
- [ ] Legible, all four corners visible, no cropping of seals or signatures.
- [ ] Name matches the passport **exactly**, including middle names and spelling.
- [ ] Date of birth matches across every document.
- [ ] Marksheets cover every year, with no missing semester.
- [ ] Degree certificate or a provisional certificate, not just a marksheet.
- [ ] MOI letter on college letterhead, signed, dated within 12 months.
- [ ] English test result within its validity window on the intake date, not today.
- [ ] Passport valid for at least the course duration plus 6 months.

**If a document looks altered:** stop. Do not accuse, do not proceed, do not upload it to
any university. Escalate to the founder the same day. **Forwarding a forged document to a
university or a mission implicates us, not only the student.**

---

## SOP-4 · Application submission

| | |
|---|---|
| **Owner** | Counsellor, checked by Operations |
| **Inputs** | Verified documents, student's written approval of each university |
| **Outputs** | Application records with `Submitted_On`, portal confirmations saved |
| **SLA** | Submitted **no later than 10 days before** the university deadline |
| **Escalation** | Inside 10 days → manager approval required to proceed |
| **Automation** | Applications module · `caseState` raises `DEADLINE_PASSED` |

**Checklist**
- [ ] Written approval from the student for **this specific university and course**.
- [ ] Application fee explained and paid by the student before submission.
- [ ] Every field cross-checked against the passport.
- [ ] Create the Application record **before** submitting, with the deadline filled in.
- [ ] Set `Submitted_On` the same day. **An application with no submission date reads to
      the engine as never submitted and will raise a false `DEADLINE_PASSED`.**
- [ ] Save the portal confirmation or acknowledgement email to the record.
- [ ] Tell the student it is submitted, and when a decision is realistically expected.

---

## SOP-5 · Offer management

| | |
|---|---|
| **Owner** | Counsellor |
| **Inputs** | Offer letter |
| **Outputs** | Offer explained, decision recorded, deposit paid, `Stage` = Offer Received |
| **SLA** | Student informed **within 24 hours**; comparison meeting within 3 days |
| **Escalation** | Acceptance deadline inside 7 days and no response → manager calls the parent |
| **Automation** | `caseState` → `OFFER_IN_HAND` · `student360` next action = discuss with parent |

**Checklist**
- [ ] Read every condition. Conditional offers are conditional on something specific — name it.
- [ ] Note the acceptance deadline and the deposit amount and deadline separately.
- [ ] Compare offers side by side on **total cost**, not tuition.
- [ ] Parent in the conversation. They hold the money.
- [ ] Explain what the deposit buys and whether it is refundable. Usually it is not.
- [ ] Record the decision in writing before any money moves.

---

## SOP-6 · Visa filing

| | |
|---|---|
| **Owner** | Operations, with the counsellor |
| **Inputs** | Offer, funds evidence, insurance, accommodation proof |
| **Outputs** | Complete file, appointment attended, `Visa_Decision` recorded |
| **SLA** | File complete **before** the appointment is booked, never after |
| **Escalation** | `Visa_Ops_Risk` = Amber → daily review. Red → SOP-8 immediately |
| **Automation** | `visaOpsPlan` nightly · `caseState` hard-blocks `APPOINTMENT_WITHOUT_DOCUMENTS` |

**Checklist**
- [ ] Full checklist for **that mission**, that country, that visa category, checked today.
- [ ] Funds evidence meets the exact stated amount and seasoning period.
- [ ] Insurance covers the full stay, not the first month.
- [ ] **The student signs every declaration themselves.** We never sign, and we never
      complete a declaration on their behalf.
- [ ] Physical file checked, page by page, against the mission's own list, before travel.
- [ ] Student briefed on the likely questions and told to answer truthfully and briefly.
- [ ] `Visa_Decision` recorded the day it arrives.

**Never:** book through a queue-jumping service, use a bot for appointment slots, or
access a portal with the student's credentials on their behalf.

---

## SOP-7 · Refusal handling

| | |
|---|---|
| **Owner** | Counsellor, escalated to founder on the same day |
| **Inputs** | The refusal letter |
| **Outputs** | `Refusal_Grounds` recorded **verbatim**, decision on appeal / reapply / redirect |
| **SLA** | Grounds recorded **within 24 hours**. Student called within 1 hour of us learning |
| **Escalation** | Every refusal goes to the founder. No exceptions |
| **Automation** | `caseState` hard-blocks `REFUSAL_NOT_RECORDED` — the case cannot progress until logged |

**Checklist**
- [ ] Get a photograph of the **entire** letter, including every listed ground.
- [ ] Record the grounds **word for word**. Do not summarise, do not paraphrase, do not
      "clean up" the wording. **This is the most valuable data the company will ever
      hold and it cannot be reconstructed later.**
- [ ] Classify: *curable* (a document, a form error, insufficient funds evidence) or
      *substantive* (intent to return, credibility, funding source).
- [ ] Check the appeal window — it is short and it is absolute.
- [ ] Call the student. Do not send this as a message first.
- [ ] Add to the de-identified refusal log for every future student's benefit.

---

## SOP-8 · Timing-lost cases

| | |
|---|---|
| **Owner** | Counsellor; founder informed the same day |
| **Inputs** | `caseState` hard block `TIMING_LOST` |
| **Outputs** | Family told, intake changed or engagement ended, refund assessed |
| **SLA** | Family called **the day the block is raised**. Not the next Friday |
| **Escalation** | Automatic — the case sits at the top of HIGH until it clears |
| **Automation** | `visaOpsSweep` nightly · `buildWorkQueue` bands it HIGH regardless of score |

**Checklist**
- [ ] Verify the computation before calling. Check `Course_Start_Date` is actually correct.
- [ ] Call. Never deliver this by message.
- [ ] Say it plainly: the intake is very likely not reachable. Do not offer false hope.
- [ ] Offer the next intake, and explain what carries over.
- [ ] Check Refund Policy §4.4: **if our own audit timeline shows we advised them to
      proceed after the last safe filing date had already passed, that is a 100% refund
      of our fee and we pay it without being asked.**
- [ ] Record the conversation and the outcome the same day.

---

## SOP-9 · Scholarship workflow

| | |
|---|---|
| **Owner** | Counsellor |
| **Inputs** | Student profile, verified scholarship schemes only |
| **Outputs** | Applications submitted, `Scholarship_Status` updated |
| **SLA** | Eligible schemes identified before applications are submitted, not after |
| **Escalation** | Scholarship deadline inside 14 days → manager |
| **Automation** | `qualityGate` blocks any unverified scholarship claim |

**Checklist**
- [ ] Only schemes verified against the awarding body's own published page.
- [ ] Record the source URL and the date checked on the record.
- [ ] **Never state or imply a probability of award.** "You meet the stated criteria" is
      the strongest claim permitted.
- [ ] Never present a scholarship as part of the budget plan. Budget must work without it.
- [ ] Italy DSU and similar regional schemes have deadlines *earlier* than the university's.
- [ ] Tell the student the realistic decision date and that it may come after they must
      pay a deposit.

---

## SOP-10 · Arrival support

| | |
|---|---|
| **Owner** | Operations |
| **Inputs** | Visa approved, flight booked |
| **Outputs** | Accommodation confirmed, registration done, **residence permit filed in the legal window** |
| **SLA** | **This is a legal deadline, not an administrative one** — see below |
| **Escalation** | Permit not filed at 50% of the window elapsed → founder |
| **Automation** | `caseState` → `SETTLING` · next irreversible milestone = permit window |

**Residence permit windows — verify per country before every arrival**

| Country | Window from arrival |
|---|---|
| Italy | 8 days |
| Hungary | 30 days |
| Malta | 3 months |

**Checklist**
- [ ] Accommodation confirmed **in writing** before the flight.
- [ ] Student has the address, a local contact, and a printed copy of every document.
- [ ] Arrival checklist sent 7 days before departure.
- [ ] Registration appointment identified **before** they land.
- [ ] Permit application filed inside the window. Missing it puts their legal right to
      remain at risk and cannot be fixed by apologising to a university.
- [ ] Confirm they have arrived and are safe. Then tell the person who referred them.
