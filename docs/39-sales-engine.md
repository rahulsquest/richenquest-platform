# File 39 — Sales engine

Scripts, sequences and playbook for converting a lead into a student. **Everything here uses only
facts in `claims.json`.** Where a counselor would normally reach for a success rate or a partner
name, this document gives them something true to say instead.

**What may be said:** operating since 2024 · 1,000+ students **guided** (never *placed*) · 5 core
full-time plus 20–25 wider network · Patna, Bihar · serving Bihar, Jharkhand, eastern UP and Nepal ·
15 verified placements, records available on request · free 30-minute consultation · working hours
10:00–19:00 IST, Mon–Sat.

**What may never be said:** any university partnership or representation · any visa success rate ·
any placement figure beyond 15 · any ranking or accreditation claim · any promise of admission or
visa outcome.

---

## 1. Qualification checklist

Run in the first 5 minutes. Its purpose is **to disqualify quickly**, because a counselor's scarcest
resource is hours, not leads.

| # | Question | Qualifies if | Red flag |
|---|---|---|---|
| 1 | Which country, and why that one? | any considered answer | "anywhere that's cheap" — expectation problem |
| 2 | What are you studying / studied, and what marks? | matches entry requirements | large gap to any realistic option |
| 3 | English test — taken, booked, or not yet? | taken or booked | not started **and** intake is imminent |
| 4 | Which intake are you targeting? | ≥6 months away | <3 months away — usually too late to do well |
| 5 | Have you discussed the budget with your family? | yes, with a figure | no — **the payer is not in the conversation** |
| 6 | Total budget including living costs, not just tuition? | realistic for the destination | tuition-only thinking |
| 7 | Who decides — you, or parents? | identified | unclear |
| 8 | Are you speaking to other consultants? | either answer is fine | — |

**Record in CRM:** `Interested_Country`, `Interested_Level`, `Intended_Intake`, `Budget_Range`,
`Lead_Type` (Student/Parent). All fields already exist.

**Disqualify politely and immediately** when the intake is unreachable or the budget is far below
the destination's real cost. Say so plainly — *"Honestly, for September you'd be rushing the
application and I don't think you'd get your best outcome. Let's plan for January."* A deferred
student who trusts you is worth more than a rushed one who blames you.

## 2. The consultation — 30 minutes, structured

The welcome email promises "a free 30-minute consultation covering your goals, your budget and
realistic options — ending with a written summary you keep, whether or not you work with us."
**Deliver exactly that.** The written summary is the differentiator and it is already promised.

| Minutes | Purpose |
|---|---|
| 0–5 | Rapport + qualification (§1) |
| 5–12 | **Listen.** Goals, family expectations, constraints. Do not pitch |
| 12–20 | Realistic options — 3 to 5 universities, with honest cost ranges |
| 20–25 | The parts most agencies skip: blocked account, insurance, accommodation reality, part-time work rules |
| 25–30 | What working together looks like, fee, and next step |

**Send the written summary within 24 hours**, whether or not they sign. It is the single most
persuasive asset in the process — it is proof of competence rather than a claim of it, and most
competitors do not do it.

## 3. Objection handling

### "Other consultants are free. Why do you charge?"

**This is the objection. Expect it every time** — IDP, AECC and Leap Scholar all counsel free
(File 38 §1).

> "That's a fair question, and you should ask it. Free consultancies are paid commission by the
> universities they place you with. That's a legitimate business model — but it means their
> shortlist is influenced by who pays them. When you pay us, we work for you. If the right answer is
> a university that pays us nothing, that's still the answer you'll get from us.
>
> I'd also say: take the free consultation as well. Compare the shortlists. If theirs is better,
> take it — you'll have lost nothing."

**Why this works:** it is true, it names the competitor's incentive without insulting them, and
inviting comparison signals confidence. **If the founder chooses Position C** (fee + disclosed
commission, File 38 §1), this script must change to *"we do take commission from some universities,
and we'll tell you exactly which"* — the script must never outrun the actual model.

### "₹1,80,000 is too expensive."

> "It's a real amount of money and I won't pretend otherwise. Here's what it covers — [walk the
> service list]. What matters more is the comparison: against total cost of study of ₹25–40 lakh, the
> expensive mistake isn't the counselling fee, it's applying to the wrong course, missing a
> scholarship deadline, or a visa refusal that costs you a whole intake.
>
> If the fee is genuinely out of reach, tell me — I'd rather structure it or be honest that we're
> not the right fit than have you stretch."

**Log the outcome.** If the case is lost, `Lost_Reason: Budget` is mandatory. **If Budget dominates
the first 20 losses, the price is the constraint** — that is the empirical answer to File 38 §1's
pricing question, and it is worth more than any argument.

### "How many students have you placed?"

> "We've guided over 1,000 students since 2024 across counselling, admissions, documentation and
> visa preparation. We have 15 placements we can evidence with records, and we'll show them on
> request. I could quote a bigger number — plenty of agencies do — but we only say things we can
> prove."

**Never inflate this.** The honesty *is* the differentiator, and the number is verifiable.

### "Which universities are you partnered with?"

> "None yet, and I'd rather tell you that than invent a list. We're in conversation with several,
> and we'll say so the moment anything is signed. In practice it doesn't limit you — we apply
> directly, so you're not restricted to a partner list. That's arguably an advantage."

**`partnerships.signed` is `[]` and `claims-guard` bans partner language.** This answer turns the
gap into a genuine benefit — an unpartnered agency has no incentive to steer.

### "Can you guarantee admission / a visa?"

> "No, and anyone who does is either lying or doesn't understand the process. What we control is
> that your application is complete, honest and well-prepared, and that you apply where you have a
> realistic chance. What we can't control is the decision."

### "I'll think about it."

> "Of course. Can I ask what you're weighing — the fee, the destination, or the timing? If it's
> timing, note the [intake] deadline is [date]; working backwards, we'd want documents started by
> [date]."

Then **set a real follow-up date and log it.** "Think about it" without a date is a lost lead.

## 4. Follow-up cadence

Automated at the lead level: **Instant lead response** creates a same-day call task and sends the
welcome email; **Stale lead rescue** re-surfaces anything silent for 3 days. Neither needs building.

| Day | Action | Channel |
|---|---|---|
| 0 | Welcome email (automatic) + call within business hours | Email + phone |
| 0–1 | If no answer: WhatsApp — *"Tried calling about your [country] plans — when suits?"* | WhatsApp |
| 1 | Consultation held | Call / in person |
| 2 | **Written summary sent** | Email + WhatsApp |
| 4 | *"Any questions after reading the summary?"* | WhatsApp |
| 7 | Deadline-anchored nudge: intake dates, scholarship cutoffs | WhatsApp |
| 14 | Value, not chase: relevant article or cost update | WhatsApp |
| 21 | Direct: *"Should I keep this open, or are you going another way?"* | Call |
| 30 | Move to `Contact in Future` — **never delete** | CRM |

**WhatsApp, not email, is the working channel** in this market. Email is for the summary and formal
documents.

**The day-21 question matters most.** A clear "no" is more valuable than a maybe: it frees the
counselor and produces a `Lost_Reason` you can learn from.

## 5. WhatsApp sequences

Short. Written the way a person writes.

**First contact, no answer to call**
> Hi {name}, this is {counselor} from RichenQuest — you enquired about studying in {country}. Tried
> calling. When's a good time today or tomorrow? Happy to do a quick 30-min call, no charge.

**After the consultation**
> {name}, good speaking today. Sending your written summary by email now — universities, realistic
> costs, and the timeline for {intake}. Read it and ask me anything, even if you decide not to work
> with us.

**Deadline nudge**
> {name}, quick one — {university} closes applications for {intake} on {date}. To do it properly
> we'd want your documents started by {date}. Still keen?

**Parent-directed** (the payer is often not the student)
> Namaste {parent name}, I'm {counselor} from RichenQuest, Patna. I spoke with {student} about
> studying in {country}. Happy to explain the costs and the process to you directly — many parents
> prefer that. When suits?

## 6. Closing playbook

**Close on the summary, not on the call.** The written summary does the persuading; the close is
just asking.

> "You've got the summary. The next step is the agreement and the first instalment, then we start
> on documents this week — which matters, because {deadline} is the real constraint. Shall I send it
> across?"

**Three closing rules:**

1. **Never close on urgency you invented.** Use real deadlines — intake dates, scholarship cutoffs,
   visa processing times. A manufactured deadline is a lie that surfaces later.
2. **Close the payer.** If parents pay, they must be in the conversation before the close, not after.
3. **Take the no.** *"That's fine — can I ask what tipped it?"* produces the `Lost_Reason` that
   improves the next twenty conversations.

**On signature:** `createStudentCase(...)` opens the case at `New Inquiry` and binds the student
identity. `updateStudentCaseStage` moves it through the pipeline, raising the right tasks. All live.

## 7. Counselor onboarding — day one

Give a new counselor these, in order:

1. **This file** — what to say, and what may never be said.
2. **`claims.json`** — the only source of company facts. *"If it isn't in here, we don't say it."*
3. **File 23** — the student lifecycle, so they understand the stages they are moving.
4. **CRM basics** — every stage change goes through the functions, never by editing fields directly,
   because that skips validation and the audit trail.
5. **RB-03 (File 29)** — on the first counselor hire, verify `assignCounselor` works. Its assignment
   path has **never executed**.

**The one rule that matters most:** *if you cannot prove it, do not say it.* Every claim in this
document is verifiable, and that is the product.
