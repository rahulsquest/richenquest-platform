# File 46 — Visa operations SOPs and checklists

**Companion to File 45.** File 45 establishes what is true and what is automatable. This file is what
a counsellor actually follows, written to be executed by someone who has never filed a visa before.

**Three rules govern every SOP below.**

1. **The counsellor never invents a rule.** If a requirement is not in the knowledge base with a
   source, the answer to the student is *"I'm confirming that with the consulate for your intake"* —
   which is a better answer than a wrong one, and is the only answer that survives a refusal.
2. **The student books, the student attends, the student signs.** RichenQuest prepares, checks,
   schedules and chases. It does not impersonate the applicant on a government portal.
3. **Every state change goes into the CRM the same day.** An SOP that lives in someone's head is not
   an SOP, and the backward planner is blind to work it cannot see.

---

## SOP-0 — Annual intake refresh *(runs before every intake, not per student)*

**This is the SOP the other nine depend on, and the one most likely to be skipped.**

Everything in File 45 decays: fee amounts, processing times, insurance lists, approved-document
rules, holiday calendars, portal URLs. **A knowledge base that is not re-verified becomes a
liability, because it makes wrong answers look authoritative.**

| # | Step | Output |
|---|---|---|
| 1 | For each destination with a live student, open the **mission's own site** and the **VFS country page**. Not a blog | Current fee, current processing time |
| 2 | Pull the **embassy and VFS holiday calendars** for the intake window | Dated list — held in the intake plan, **not** the knowledge base |
| 3 | Re-confirm **proof-of-funds form and amount** with the specific consulate | Written note in the case |
| 4 | Re-confirm **credential requirements per partner university** (DoV, CIMEA, legalisation) | Per-university note |
| 5 | Re-verify anything marked **VERIFICATION PENDING** in File 45 | Promote to verified, or leave pending with the date re-checked |
| 6 | Update knowledge articles that changed; **delete** ones that no longer hold | KB diff |

**Cadence:** at intake open, and again 60 days before the first appointment window.

---

## SOP-1 — Appointment booking

**Entry:** offer accepted · funds route decided · `Course_Start_Date` set.
**Exit:** `Visa_Appointment_Status = Slot Booked`, `Appointment_Date` and `Appointment_Center` set.

| # | Step | Gate |
|---|---|---|
| 1 | Run `visaOpsPlan` on the case | Read the risk flag **before** doing anything else. **Red means have the honest conversation now, not after the appointment** |
| 2 | Confirm the **country pre-step is complete** — Universitaly (Italy), APS (Germany), AVATS (Ireland), e-Konsulat registration (Poland) | **Hard gate. Do not book before this.** Booking first is the most common wasted slot |
| 3 | Determine the **correct centre by the student's residential address** | Jurisdiction is not a preference. Wrong centre = rejected at the counter |
| 4 | Run the **document checklist** (§A) to *Complete* | **Hard gate.** An incomplete file at the counter costs the slot, not the day |
| 5 | Student books the slot on the official portal, counsellor on the call | Screenshot the confirmation into the case |
| 6 | Set `Visa_Appointment_Status`, `Appointment_Date`, `Appointment_Center`. If no slot is available set **`Awaiting Slot`** | `Awaiting Slot` is a named workload, not a limbo |
| 7 | If `Awaiting Slot`: a named counsellor checks the portal **daily**, logs the check, and escalates at the planner's Amber date | **Manual by design — File 45 §1** |

---

## SOP-2 — Rescheduling

**Trigger:** student or centre initiates a change before the appointment.

1. Establish **whose rescheduling rules apply** — the portal's, and they vary by mission. Read them
   on the day; do not rely on what was true last intake.
2. **Check the fee position before touching anything.** Some routes forfeit the visa fee on
   reschedule. A reschedule that silently burns the fee is a bill the student did not agree to.
3. Re-run `visaOpsPlan` against the **new** date. **A reschedule can move a case from Green to Red in
   one click** — that is the whole reason this step exists.
4. If the new date lands past the planner's Red threshold, **escalate to the founder before
   confirming.** Deferring the intake may be the better outcome, and that is not a counsellor's call.
5. Update `Appointment_Date`; set `Visa_Appointment_Status = Rescheduled`.

---

## SOP-3 — Emergency / urgent appointment

**Be honest about what this is.** There is no reliable expedite route in this portfolio, and any
service promising one for a fee should be treated as a fraud risk.

1. Establish the genuine deadline and the consequence of missing it, in writing.
2. Check whether the mission publishes an **urgent/priority route**. Most do not for study visas.
3. If a route exists, apply through the **official channel only**, with documentary proof.
4. If no route exists, **say so plainly and move to plan B** — deferral to the next intake, or a
   later start date agreed with the university. **Most universities will defer; almost no consulate
   will hurry.** That sentence is the single most useful thing a counsellor can know here.
5. **Never engage a paid third party claiming to obtain slots.** File 45 §1.

---

## SOP-4 — Missed appointment

1. Set `Visa_Appointment_Status = Missed` **the same day.** The temptation is to leave it open; the
   planner then keeps reporting Green on a case that has stopped.
2. Establish the mission's rules on **fee forfeiture** and **rebooking eligibility**.
3. Rebook via SOP-1 from step 3. **Do not skip the checklist gate on the assumption it is still
   complete** — documents expire, and bank statements go stale fastest.
4. Re-run `visaOpsPlan`. Record the new risk level and tell the student what it means.
5. Record the cause. **A pattern of misses is an operations problem, not a run of bad luck.**

---

## SOP-5 — Passport delay

**Anchor on the three dates, and identify which interval is actually long.**

| Interval | Owner | Action |
|---|---|---|
| `Passport_Submitted` → decision | **The mission.** Not chaseable, and pretending otherwise wastes goodwill | Compare against the country's stated processing time. Only escalate **past** it |
| decision → `Passport_Dispatch` | Mission / centre | Track via the official status tracker only |
| `Passport_Dispatch` → `Passport_Received` | **Courier — the only interval RichenQuest can influence** | Chase the courier, with the tracking number, daily |

1. Tell the student the **published** processing time and that it is a range, not a promise.
2. **Do not promise a date.** RichenQuest has no historical data; a predicted date is a promise.
3. Escalate to the mission only once the published time is genuinely exceeded, in writing, with the
   reference number.
4. **Flag the travel consequence early:** from `Passport_Submitted` the student cannot travel
   anywhere — including domestic travel needing photo ID, and any family emergency. **Say this at
   submission, not when it bites.**

---

## SOP-6 — Document deficiency

**Two cases, and they are not the same problem.**

**(a) Found before submission — the good case.** This is the checklist working. Fix, re-gate, proceed.

**(b) Raised by the mission after submission — the serious case.**

1. Get the deficiency **in writing** and read it literally. Do not act on a phone paraphrase.
2. Check the **stated deadline for the cure** and set `Next_Deadline` on the case immediately.
3. Supply exactly what was asked for, in the form asked for. **Volunteering extra documents invites
   extra questions.**
4. Log the deficiency against the checklist item that missed it, and **fix the checklist** — this is
   the only mechanism by which the process gets better.

---

## SOP-7 — Courier delay

1. Confirm `Passport_Dispatch` is actually set. **If the mission has not dispatched, this is SOP-5,
   not SOP-7** — and the two get confused constantly.
2. Chase with the tracking number, daily, through the courier's official channel.
3. Escalate to the visa centre only if the courier has no record of receipt.
4. **Never advise a student to travel on the assumption the passport will arrive.**

---

## SOP-8 — Visa refusal

**The refusal itself is a fact. Everything after it is a judgement, and judgements go to the founder.**

1. Set `Visa_Decision = Refused` and record the **exact stated grounds, verbatim.** Paraphrasing a
   refusal ground is how an appeal is lost.
2. **Do not immediately re-apply.** A rushed re-application on unchanged facts is usually refused
   again and can prejudice the next one.
3. Classify the ground:
   - **Curable** — a document, a form, a funds format → re-application after fixing is reasonable.
   - **Substantive** — intent, coherence, credibility → **an appeal or a changed plan, not a re-file.**
4. **The case does not automatically become Closed Lost.** `Visa_Decision` and deal `Stage` are
   separate fields precisely so the commercial decision waits for the conversation.
5. **Founder decision required** on refund or re-application under the service agreement. This is a
   money question and a promise question, and it is not a counsellor's to make.
6. Add the ground to the refusal log. **RichenQuest's own refusals are the only refusal data it will
   ever legitimately have** — File 45 §3c.

---

## SOP-9 — Appeal

1. Establish the **appeal window and the competent authority** from the refusal letter — not from
   general knowledge, and not from this document. Windows are short and jurisdiction-specific.
2. **Assess whether legal representation is required.** In several jurisdictions appeal
   representation is a regulated activity. **RichenQuest does not give legal advice** — File 44 §6.2.
   Where the line is unclear, it is a founder and lawyer question, and a **stop condition**.
3. Assemble evidence addressing **the stated ground only.**
4. Track the deadline in `Next_Deadline` with a task at the halfway point.
5. **Give the student the honest odds, which is that they are unknown.** RichenQuest has no appeal
   history. Saying so is more trustworthy than a number, and it is the standing instruction.

---

# Checklists

## §A — Document checklist *(gate for SOP-1 step 4)*

**Universal core** — every destination:

- [ ] Passport: validity, blank pages, all previous passports
- [ ] University offer / admission letter
- [ ] **Country pre-step proof** — Universitaly (IT) · APS (DE) · AVATS summary (IE) · e-Konsulat form (PL)
- [ ] Academic transcripts and certificates, in the accepted form
- [ ] **Credential recognition where required** — DoV or **CIMEA** (IT); confirm per university
- [ ] English proficiency evidence, in the form the university and mission each accept
- [ ] **Proof of funds in the accepted form** — *form matters more than amount*; **never quote a single Italian figure**
- [ ] Accommodation evidence
- [ ] Insurance — **Malta: approved-insurer list only, from 1 Jan 2026**
- [ ] Photographs to the mission's specification
- [ ] Visa fee + centre service fee
- [ ] Completed application form, signed by the student
- [ ] Photocopy set

**Gate:** `Document_Status = Complete`. **Nothing books before this.**

## §B — Appointment checklist *(48 hours before)*

- [ ] Correct centre, correct date, correct time, printed confirmation
- [ ] Originals **and** the photocopy set, in checklist order
- [ ] Travel and arrival plan — **assume no rebooking if the student is late**
- [ ] Fee payment method confirmed against what the centre actually accepts
- [ ] Student briefed that **the passport stays behind**
- [ ] Counsellor reachable by phone throughout the appointment window

## §C — Interview checklist

**Preparation, not scripting.** A coached answer is detectable and it reads as coaching.

- [ ] Can explain **why this course, this university, this country** — in their own words
- [ ] Knows the course content, duration, and what it costs
- [ ] Can explain **who is funding it and how**, consistent with the documents filed
- [ ] Can explain the plan after graduation, honestly
- [ ] Knows every document in their own file
- [ ] Briefed that **"I don't know" is a better answer than a guess** — the file is the evidence, and an invented answer that contradicts it is fatal

## §D — Post-appointment checklist *(same day)*

- [ ] `Visa_Appointment_Status = Attended`, `Biometric_Status` set
- [ ] `Passport_Submitted` set
- [ ] Tracking / reference number recorded in the case
- [ ] Anything the counter asked for, or queried, written down verbatim
- [ ] Student told the published processing range — **as a range, with no promised date**
- [ ] Student reminded they cannot travel until the passport returns
- [ ] `visaOpsPlan` re-run

## §E — Post-arrival compliance checklist

**The stage every competitor stops at — File 44 §5.** These are legal deadlines, not admin tasks.

| Country | Deadline | Action |
|---|---|---|
| **Italy** | **8 days from arrival** | *Permesso di soggiorno* kit; Questura appointment. **The tightest window in the portfolio** |
| **Hungary** | **30 days from arrival** | Convert D-visa to residence permit |
| **Malta** | **3 months from arrival** | Residence permit |
| Germany / Poland / Ireland | **verify at SOP-0** | Registration and permit rules differ; do not assume |

Then, in order, for every destination: address registration → tax/ID number → bank account → SIM →
university enrolment confirmation → `Residence_Permit_Status = Card Issued`.

**Ordering matters and is not obvious:** in Italy the bank account needs the *codice fiscale* and the
permit receipt, so doing these in the wrong order wastes a week — File 43 §2.
