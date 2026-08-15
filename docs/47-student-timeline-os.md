# File 47 — Student Timeline OS

**The brief describes a single 19-stage journey from Lead to Alumni. This file maps it onto what the
CRM actually holds, closes the gaps that mapping exposed, and states plainly which stages should not
be built yet.**

---

## 1. Why the 19 stages are not one picklist

The obvious implementation is a single `Timeline_Stage` field with nineteen values. **It is the wrong
one, and the reason is already written into `advanceStudentJourney`:**

> *"These are deliberately NOT Deal stages. A Student Case is genuinely won at 'Visa Approved — Won';
> bolting arrival and alumni onto the sales pipeline would corrupt Probability, forecasting and every
> conversion report."*

A single picklist would also make three impossible things impossible to record: a student whose visa
is approved but whose scholarship is still pending, a student who has arrived but whose residence
permit has not issued, and a refusal that is under appeal rather than lost. **All three are normal.**

> **A student is not at one point on a line. They are at a point on each of several parallel tracks,
> and the tracks move at different speeds.**

So the Timeline OS is a **read model** — a view assembled from four axes that already exist, not a
twentieth field to keep in sync:

```
AXIS 1  Deals.Stage                   commercial pipeline, Lead -> Visa Approved - Won
AXIS 2  Document / Visa / Biometric / Passport / Decision fields   visa operations (Phase 9)
AXIS 3  Deals.Student_Journey_Stage   post-visa journey, Pre-Departure -> Alumni
AXIS 4  Scholarship_Status            runs in parallel with all three, on its own clock
```

## 2. The mapping

| # | Brief stage | Where it lives | Status |
|---|---|---|---|
| 1 | **Lead** | `Leads` module + `qualifyLead` | ✅ built |
| 2 | **Counselling** | `Stage` → Counseling Booked / Counseling Done | ✅ built |
| 3 | **University Shortlist** | `generateCounsellingBrief` → `Stage` = Counseling Done | ✅ built |
| 4 | **Application** | `Stage` = Applications Submitted | ✅ built |
| 5 | **Offer Letter** | `Stage` = Offer Received | ✅ built |
| 6 | **Scholarship** | **`Scholarship_Status`** — Identified · **ISEE Parificato Started** · Submitted · Awarded · Not Awarded · **Deadline Missed** | ✅ **added by Phase 9** |
| 7 | **Visa Documents** | `Document_Status` + File 46 §A | ✅ built |
| 8 | **Visa Appointment** | `Visa_Appointment_Status`, `Appointment_Date`, `Appointment_Center` | ✅ **added by Phase 9** |
| 9 | **Biometrics** | `Biometric_Status` | ✅ **added by Phase 9** |
| 10 | **Visa Decision** | `Visa_Decision` + `Passport_Submitted` / `Dispatch` / `Received` → `Stage` = Visa Approved — Won | ✅ **added by Phase 9** |
| 11 | **Flight Booking** | `Student_Journey_Stage` = Pre-Departure | ✅ built |
| 12 | **Accommodation** | `Student_Journey_Stage` = Accommodation Confirmed | ✅ built |
| 13 | **Arrival** | `Student_Journey_Stage` = Arrived — **gated on Visa Approved — Won** | ✅ built |
| 14 | **Residence Permit** | `Residence_Permit_Status` | ✅ **added by Phase 9** |
| 15 | **Bank Account** | `Post_Arrival_Setup` | ✅ **added by Phase 9** |
| 16 | **SIM Card** | `Post_Arrival_Setup` | ✅ **added by Phase 9** |
| 17 | **Internship** | — | ⛔ **not built — see §4** |
| 18 | **Job** | — | ⛔ **not built — see §4** |
| 19 | **Alumni** | `Student_Journey_Stage` = Success Story → Alumni | ✅ built |

**Seventeen of nineteen stages are now modelled.** Phase 9 added the six that were genuinely missing,
and stage 6 turned out to be the most commercially important of them: **ISEE Parificato has its own
deadline, on its own clock, and missing it costs a student €14,000–16,000 a year** — File 43 §2.
Before today that had nowhere to live except a note.

**Note stage 12.** Accommodation sits *after* the visa decision on the brief's line, but for a DSU
student it is decided by the scholarship, and DSU housing is not guaranteed even to winners. This is
precisely why the axes are separate: on a single line, that student is unrepresentable.

## 3. Ordering constraints that are not obvious from the line

The brief's arrow diagram implies each stage follows the previous one. **Four of them do not, and
getting the order wrong wastes a week or an intake.**

| Constraint | Consequence of getting it wrong |
|---|---|
| **Country pre-step precedes the appointment** — Universitaly, APS, AVATS, e-Konsulat | The slot is wasted. This is the most common avoidable loss |
| **Germany: APS precedes everything**, 4–8 weeks | A student "ready to apply" is actually two months away |
| **Italy: bank account needs codice fiscale AND the permit receipt** | Stages 15 and 14 are not independent; doing 15 first fails at the counter |
| **Scholarship deadlines are often BEFORE arrival, and regional** | Stage 6 can expire while stages 7–13 are still running. It does not wait its turn |

## 4. Stages 17 and 18 — deliberately not built

**Internship and Job are the right long-term ambition and the wrong thing to build today.**

- File 42 §5 places employer and internship partnerships at **Stage 4 — 250 to 1,000 students.**
- File 44 §4: *"These require alumni to exist. No employer partners with an agency that has placed
  nobody."*
- RichenQuest currently has **zero students in any destination.**

Fields for stages 17–18 would hold no data for years, would be designed without knowing what the work
actually looks like, and would have to be redesigned when it arrives. **Adding them would be the
scope expansion this project has flagged in three consecutive reviews.**

**They get built when the first student reaches stage 19.** That is not a deferral for its own sake —
it is that the first real internship placement will tell us what to model, and nothing before it will.

## 5. What automates around the timeline

| Trigger | Automation | Built? |
|---|---|---|
| Nightly, every open case | **`visaOpsPlan`** — backward-plan from `Course_Start_Date`, set `Visa_Ops_Risk` and `Next_Deadline`, raise a task **only on a risk transition** | ✅ source written |
| Stage change | `updateStudentCaseStage` → stage-entry tasks + audit | ✅ built |
| Journey change | `advanceStudentJourney` → briefing / check-in / success-story tasks | ✅ built |
| Arrival | Post-arrival compliance clock — **Italy 8 days, Hungary 30, Malta 3 months** | ⚠️ **checklist only** (File 46 §E). Deliberate: the deadline differs per country and per student's actual arrival date, and a wrong legal deadline is worse than a human one |
| Any stage | `generateAuditLog` | ✅ built |

**The single most valuable automation in the whole timeline is the one that fires before anything has
gone wrong.** `visaOpsPlan` turns Red on a case where nothing has visibly failed — the student is
responsive, the counsellor is working, and the intake is already lost. **That is the failure this
company will actually have, and it is now the one thing the system watches for by itself.**

## 6. What the Timeline OS does not do

| Not doing | Why |
|---|---|
| Predict a visa decision, an approval likelihood, or a processing date | Standing instruction: **assistive AI, not predictive.** And RichenQuest has no historical data — a prediction would be a fabrication with a number attached |
| Auto-advance stages on a timer | A stage means someone confirmed something happened. A timer that advances a stage makes the CRM lie |
| Message students automatically | Standing instruction: **no auto-publishing; everything customer-facing needs human approval.** The system raises the task; a person sends the message |
