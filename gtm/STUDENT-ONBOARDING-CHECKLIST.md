# STUDENT-ONBOARDING-CHECKLIST.md — 2026-08-23
*Phase 2. Uses existing CRM fields only. No new module.*

## The flow, with what is automatic marked

```
Lead received            [AUTO — submitApplication: Lead, case number, owner, 2 tasks]
   ↓
Qualification            [HUMAN — 4 questions]
   ↓
Profile collection       [AUTO — 11-step wizard, 32 mapped fields]
   ↓
Intelligence generated   [AUTO — studentIntelligence]
   ↓
Matching + roadmap       [AUTO — matchOpportunities, studentRoadmap]
   ↓
Counsellor review        [HUMAN — the gate. studentReport returns approved:false]
   ↓
Student discussion       [HUMAN]
   ↓
Feedback                 [HUMAN — 4 ratings, 3 questions]
   ↓
Outcome tracking         [AUTO + HUMAN — 21 Event_Type values]
```

**Six of nine steps are already automatic.** The three that are not are the three that should
never be: qualifying a person, checking a recommendation before a family sees it, and having
the conversation.

## Student onboarding checklist — per student

**Within 5 minutes of submission (automatic — verify, don't do)**
- [ ] Lead created with case number `RQ-YYMMDD-NNNN`
- [ ] Owner assigned *(check the `tier` — if it says `Operations`, no counsellor role exists yet)*
- [ ] Two tasks raised: 48-hour call, and passport if `passport_urgent`
- [ ] Consent recorded with timestamp + policy version
- [ ] WhatsApp acknowledgement sent

**Within 48 hours — the SLA**
- [ ] Call attempted. **3 attempts across 2 different days before marking uncontactable**
- [ ] `Lead_Status` updated — a lead left at `-None-` is a lead nobody is working
- [ ] **Qualify:** budget ≥ ₹10L · intake named and ≥4 months out · passport held or applied · parent contactable
- [ ] `Course_Start_Date` set — **without it every deadline on the case is invisible**
- [ ] Document checklist sent *(only what is actually missing)*

**Within 3 working days**
- [ ] `studentIntelligence` completeness ≥ 70% — if not, ask for the named `missing_fields` first
- [ ] `studentReport` generated
- [ ] **Safety review — all 5 checks, including "would this mislead the student?" answered in words**
- [ ] `REPORT_APPROVED` → `REPORT_SENT`
- [ ] Discussion held with the parent present

**Ongoing**
- [ ] Friday update sent, **whether or not there is news**
- [ ] Corrections logged and classified
- [ ] Feedback collected after the call, never incentivised

## Counsellor operating checklist — daily, 20 minutes
- [ ] Work queue: **clear every HIGH before touching MEDIUM**
- [ ] Any lead >48h with no attempt → call now
- [ ] Any document uploaded yesterday → verify within 24h
- [ ] Any case with a deadline <21 days → confirm it moved
- [ ] Every student message answered within 4 working hours
- [ ] Any `CORRECTION_LOGIC` at 3 occurrences → escalate

## Follow-up process — the cadence

| When | Action | Rule |
|---|---|---|
| Day 0 | Auto acknowledgement | automatic |
| Day 0–2 | Call, up to 3 attempts | different times of day |
| Day 3 | Attempt 3 message | *"I'll leave your file open 7 days"* |
| Day 10 | Close honestly | *"I'm closing this so I stop taking your time"* |
| Day 30 | One useful message | a deadline they'd want — **not a pitch** |
| Day 90 | Intake reset | *"…or tell me and I'll delete your data"* |
| **Every Friday, active cases** | **Written update** | **100%, including "nothing moved"** |

**Never a fourth chase.** Persistence past three attempts converts nobody and costs the
referral.

## What must never happen
An unverified figure reaching a student · a closed intake presented as reachable · any
probability or guarantee · a mentor without verified credentials · a report sent without
counsellor approval.

**Each of these halts the pilot**, not just the send.
