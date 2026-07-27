# AM0.4 — CRM Spine (build-ready runbook)
Milestone: AM0 Foundation · Owner: **Automation Owner + AI CTO (spec)** · Effort: ~3–4h · **The keystone.**
Source spec: **File 01** (this runbook turns File 01 into executable tasks with current-cycle values).
Everything in File 16 (leads, cases, automations, dashboards) plugs into this.

---

## 1. Prerequisites (confirm before building)

**A. Fast foundation items — confirm done, or complete first (~2.5h if not):**
- **AM0.2 Directory:** provision the **7 team members** (config/tenant-richenquest.json → team) with the
  role hierarchy CEO (Rahul) → Managers (Harsh Ops, Kishor Partnerships) → Counselor (Kunal) /
  Operations (Bibek, Tahir) / Marketing (Vishrut) [/ Finance — unassigned, see open items];
  **2FA enforced** (non-negotiable — you hold passports/financials, File 00); data-sharing "Private
  with role hierarchy." **Licensing (OI-2):** don't hardcode seat assumptions — provision the users
  that current licences allow, assign roles to them, add more seats/guest access later. Ownership is
  role-based (OI-3): Finance Owner = Rahul (temporary, transferable by reassigning the role).
- **AM0.8 Cliq channels:** `#leads`, `#wins`, `#finance-approvals`, `#ops-alerts`, `#daily-updates`.
  (`#leads` and `#ops-alerts` are used by AM0.4's workflows + heartbeat.)

*The CRM **structure** (modules, fields, pipeline) can be built now regardless; the **workflow** layer
needs A confirmed because it references users and Cliq channels.*

**B. Business inputs — ✅ RECEIVED 2026-07-22** (captured in `config/tenant-richenquest.json`):
- **Team roster:** 7 members with roles + CRM-role + digital-employee-pod mapping. ✅
- **Service Packages:** the 7 confirmed packages (see §3). ✅
- **Lead types + assignment rule:** Option A + configurable assignment. ✅
  *Remaining confirmations (non-blocking for structural build): the v1 assignment routing defaults,
  Finance-role owner, and the 7-vs-5 headcount/licence items (open items in AUTOMATION-LOG).*

## 2. Modules (File 01 §2)
- **Leads** — new inquiries (pre-payment).
- **Contacts** — converted students + parents.
- **Deals → renamed "Student Cases"** — one deal = one student journey.
- (University Partnerships module is AM3, not here.)

## 3. Custom fields — with current-cycle values (File 01 §3 + corrections)

**Leads:**
| Field | Type | Options |
|---|---|---|
| **Lead Type** | Picklist | **Student (default/active)**, Parent, University, Partner Institution, Recruitment Agent, Corporate, Employer, Government, Organization *(Option A approved 2026-07-22; only Student is workflow-active; values from config/tenant-richenquest.json)* |
| **Market** (residence) | Picklist | India, Nepal, Pakistan, Bangladesh, Sri Lanka, Bhutan, Other *(IF-2: multi-market per Constitution)* |
| Lead Source Detail | Picklist | Website Form, WhatsApp, Instagram, Facebook, LinkedIn, YouTube, TikTok, Google Ads, Walk-in, Referral, Education Fair, Other |
| Interested Country | Multi-select | Italy, Germany, France, Spain, Hungary, Latvia, Lithuania, Ireland, Netherlands, Malta, Poland, Other Schengen, UK, Australia, New Zealand, Singapore, Japan, South Korea, Other *(IF-2: config values — maintained as a picklist now, KG-backed later; never hardcoded in logic)* |
| Interested Level | Picklist | Bachelor's, Master's, Diploma, PhD, PR/Immigration, Other |
| **Intended Intake** | Picklist | **Sep 2026, Jan 2027, May 2027, Sep 2027, 2028+, Undecided** *(IF-1: current-cycle correction — File 01 predated Jul 2026)* |
| Budget Range | Picklist | <10L, 10–20L, 20–35L, 35L+ |
| Preferred Language | Picklist | English, Hindi, Nepali, Other |
| WhatsApp Number | Phone | |
| UTM Source / Medium / Campaign | Single line ×3 | (populated by website form hidden fields — attribution, AM2.3) |

**Student Cases (Deals):**
| Field | Type | Options |
|---|---|---|
| Destination Country | Picklist | (same country set) |
| Course & University (final) | Single line | |
| Assigned Counselor | User lookup | (needs team roster) |
| Service Package | Picklist | Initial Counselling, University Shortlisting, Admission Assistance, Scholarship Assistance, Visa Assistance, End-to-End Premium, Custom Institutional Services *(confirmed 2026-07-22)* |
| Document Status | Picklist | Not Started, Collecting, **APS Applied, APS Received** (Germany), AI Pre-checked, Verified, Complete |
| Lane (Germany) | Picklist | Commission (Private), Service-fee (Public), n/a *(File 05)* |
| Visa Status | Picklist | N/A, Preparing, Lodged, Biometrics Done, Approved, Refused |
| Next Deadline | Date | (drives AM1.3 deadline guardian) |

## 4. Pipeline — Student Cases (File 01 §4, 11 stages)
New Inquiry (10%) → Counseling Booked (20%) → Counseling Done (30%) → Agreement Sent (40%) →
**Agreement Signed — CLIENT (60%)** → Documents in Progress (65%) → Applications Submitted (70%) →
Offer Received (80%) → Visa Filed (90%) → Visa Approved — Won (100%) · Closed Lost (0%, mandatory
Lost Reason: Went Silent / Chose Competitor / Budget / Not Eligible / Postponed / Visa Refused).

## 5. Workflows — build these 5 (File 01 §5); each gets an #ops-alerts heartbeat
1. **Instant lead response** (Leads, on create): welcome email + Task "Call new lead" today/Highest +
   `#leads` alert. **Configurable Assignment Engine (NOT static routing — founder OI-4):** driven by
   `config/tenant-richenquest.json → assignment_engine`. **Phase 1 (now, native):** Zoho CRM Assignment
   Rules on field criteria (language / market / destination country / lead type / department /
   expertise) **+ manual override** (always available). **Phase 2 (later, custom function):**
   workload-balancing + availability. **Phase 3:** performance-based. v1 default (confirm): Student →
   Kunal; Pakistan-market → also notify Tahir; overflow → Bibek. *(This is the seam AM1.1 extends.)*
   *Multi-type guard (Constitution): scope workflow to `Lead Type = Student` so non-student lead types
   (University, Agent, Corporate…) don't trigger student-response logic when added later. Templates are
   language-aware per Preferred Language (English/Hindi/Nepali).*
2. **Stale lead rescue** (Leads, 3-day no activity): check-in email + task; 7-day silence → Nurture.
3. **Stage-triggered client updates** (Cases, on stage change): Agreement Sent→sign+follow-up;
   Signed→onboarding + Ops task (WorkDrive folder) + `#wins`; Offer/Visa→congrats + `#wins`.
4. **Overdue task escalation** (Tasks): +1d→owner reminder; +3d→manager Cliq. *(= AM1.6)*
5. **Deadline guardian** (Cases, Next Deadline −7d then −2d): counselor task + Cliq alert. *(= AM1.3)*

> Blueprint upgrade (stage-skip prevention) is deferred to Week 3+ per File 01 §4 — not in AM0.4.

## 6. Deliverables
- Leads, Contacts, Student Cases modules configured with the fields above.
- 11-stage pipeline with probabilities + mandatory Lost Reason.
- The 5 workflow rules active, each posting a heartbeat to `#ops-alerts` on run.
- Round-robin assignment rule across counselors.
- A seeded **test Lead** and **test Student Case** used for the acceptance test.

## 7. Acceptance criteria (File 16 AM0.4 success)
AM0.4 is "Live" only when:
- [ ] A **test Lead** created → workflow 1 fires: welcome email sent, "Call new lead" task created &
      assigned (round-robin), `#leads` alert posted — all within seconds.
- [ ] A **test Student Case** moved through all 11 stages → each stage's action fires (workflow 3);
      Agreement Signed produces the onboarding + Ops folder task + `#wins` post.
- [ ] Overdue-task escalation (workflow 4) and deadline guardian (workflow 5) verified on the test case.
- [ ] Data sharing confirmed Private+hierarchy (a counselor sees only their own records).
- [ ] Each workflow's `#ops-alerts` heartbeat observed (proves failure-monitoring exists).
- [ ] Test records deleted or clearly marked TEST (leads are never really deleted — marked).

## 8. Failure-recovery + heartbeat (lifecycle requirement)
- Each workflow posts a lightweight success ping to `#ops-alerts` (or a daily "workflows ran N times"
  audit) so a silently-broken rule surfaces.
- Nightly reconciliation once AM1.1 is live: Forms submissions vs CRM Leads → gap alert (a lead lost
  to a failed create must never be invisible).
- Manual fallback: SOP-01 (New Lead Handling, File 04) remains the human path if a workflow is down.

## 9. On sign-off
Founder signs off → I mark AM0.4 ✅ in AUTOMATION-LOG and issue **AM1.1 (Speed-to-Lead)** — the first
revenue-impacting automation, which extends workflow 1 with WhatsApp (needs AM0.9 BSP, run in parallel).

---

# EXECUTION RUNBOOK (for Harsh) — do these in order

Notes: Zoho CRM console labels vary slightly by edition; where a path differs, the **target** is named
so you can find it. Values marked *(config)* come from `config/tenant-richenquest.json` — that file
wins if anything ever disagrees. Capture the evidence noted at each step (screenshot/export) — I verify
against it. No custom code/functions in AM0.4; everything is native Zoho.

### STEP 0 — Prerequisites (confirm before building)
- 0a. **Users & roles (AM0.2):** the 7 contributors *(config → contributors.roster)* exist; role
  hierarchy CEO (Rahul) → Managers (Harsh, Kishor) → Counselor (Kunal) / Operations (Bibek, Tahir) /
  Marketing (Vishrut). **2FA enforced** (Directory → Security Policies).
- 0b. **Cliq channels (AM0.8):** `#leads`, `#wins`, `#finance-approvals`, `#ops-alerts`, `#daily-updates`.
- **Evidence 0:** screenshot of the Users list (roles visible) + the Cliq channel list.

### STEP 1 — Rename module Deals → "Student Cases"
- Setup → Customization → **Modules and Fields** → hover **Deals** → **Rename** → singular
  "Student Case", plural "Student Cases".
- **Evidence 1:** screenshot showing the renamed module in the module list.

### STEP 2 — Leads: create custom fields *(config-sourced values)*
Open **Leads** → Fields (layout editor) → add each (type · options):
- Lead Type — Picklist — Student *(default)*, Parent, University, Partner Institution, Recruitment
  Agent, Corporate, Employer, Government, Organization
- Market — Picklist — India, Nepal, Pakistan, Bangladesh, Sri Lanka, Bhutan, Other
- Lead Source Detail — Picklist — Website Form, WhatsApp, Instagram, Facebook, LinkedIn, YouTube,
  TikTok, Google Ads, Walk-in, Referral, Education Fair, Other
- Interested Country — Multi-select — Italy, Germany, France, Spain, Hungary, Latvia, Lithuania,
  Ireland, Netherlands, Malta, Poland, Other Schengen, UK, Australia, New Zealand, Singapore, Japan,
  South Korea, Other
- Interested Level — Picklist — Bachelor's, Master's, Diploma, PhD, PR/Immigration, Other
- Intended Intake — Picklist — Sep 2026, Jan 2027, May 2027, Sep 2027, 2028+, Undecided
- Budget Range — Picklist — <10L, 10–20L, 20–35L, 35L+
- Preferred Language — Picklist — English, Hindi, Nepali, Other
- WhatsApp Number — Phone
- UTM Source / UTM Medium / UTM Campaign — Single line ×3
- **Evidence 2:** screenshots of the Lead picklist value editors for Lead Type, Market,
  Interested Country, Intended Intake.

### STEP 3 — Student Cases: create custom fields
Open **Student Cases** → Fields → add:
- Destination Country — Picklist (same country set as Interested Country)
- Course & University (final) — Single line
- Assigned Counselor — User lookup
- Service Package — Picklist — Initial Counselling, University Shortlisting, Admission Assistance,
  Scholarship Assistance, Visa Assistance, End-to-End Premium, Custom Institutional Services *(config)*
- Document Status — Picklist — Not Started, Collecting, APS Applied, APS Received, AI Pre-checked,
  Verified, Complete
- Lane (Germany) — Picklist — Commission (Private), Service-fee (Public), n/a
- Visa Status — Picklist — N/A, Preparing, Lodged, Biometrics Done, Approved, Refused
- Next Deadline — Date
- **Evidence 3:** screenshot of the Student Cases field list + the Service Package picklist editor.

### STEP 4 — Student Cases pipeline (Stage-Probability) + Lost Reason
- Setup → Customization → **Pipelines** (or Modules and Fields → Student Cases → **Stage-Probability
  Mapping**). Set stages/probabilities exactly:
  New Inquiry 10 · Counseling Booked 20 · Counseling Done 30 · Agreement Sent 40 · **Agreement
  Signed 60** · Documents in Progress 65 · Applications Submitted 70 · Offer Received 80 · Visa Filed
  90 · Visa Approved — Won 100 · Closed Lost 0.
- Add **Lost Reason** picklist (Went Silent, Chose Competitor, Budget, Not Eligible, Postponed, Visa
  Refused).
- **Validation Rule:** Lost Reason **required when** Stage = Closed Lost (Modules and Fields →
  Student Cases → Validation Rules).
- **Evidence 4:** screenshot of the stage list with probabilities + the validation rule.

### STEP 5 — Duplicate check (dedupe foundation for Speed-to-Lead)
- Leads → make **Email** a duplicate-check/unique field (Setup → Data Administration → Duplicate
  Check Preferences, or field-level "Do not allow duplicate values"). Secondary: Phone.
- **Evidence 5:** screenshot of the duplicate-check setting on Email.

### STEP 6 — Assignment Rule (Assignment Engine, Phase-1 native — OI-4)
- Setup → Automation → **Assignment Rules** → new rule on Leads, entry = "Lead Type is Student".
- Criteria-based routing *(config → assignment_engine)*: default owner **Kunal**; if **Market =
  Pakistan** → assign/notify **Tahir**; overflow → **Bibek**. Manual reassignment always allowed.
- **Evidence 6:** screenshot of the assignment rule criteria.

### STEP 7 — Workflow Rules (Setup → Automation → Workflow Rules) — build all 5
For each, add an action posting a short ping to Cliq `#ops-alerts` (heartbeat).
- **WF1 Instant lead response** — Module Leads · On Create · **condition Lead Type = Student** ·
  Actions: send email (template "Welcome – 60 Second Reply"); create Task "Call new lead" due today,
  priority Highest, owner = record owner; Cliq `#leads` "🔔 New lead: ${Last Name} — ${Interested
  Country} — call within 5 min".
- **WF2 Stale lead rescue** — Leads · time-based: Lead Status = Contacted AND no activity 3 days ·
  Action: "Checking in" email + owner task; at 7 days → set Status = Nurture.
- **WF3 Stage-triggered updates** — Student Cases · on Stage change · Agreement Sent → signing email
  + "follow up if unsigned 48h" task; Agreement Signed → onboarding email + Ops task "create WorkDrive
  folder" + Cliq `#wins`; Offer Received/Visa Approved → congrats email + `#wins`.
- **WF4 Overdue task escalation** — Tasks · Due Date +1d & not Completed → email owner; +3d → Cliq DM
  owner's manager.
- **WF5 Deadline guardian** — Student Cases · Next Deadline −7d → counselor task + Cliq alert; −2d →
  priority Highest.
- **Evidence 7:** screenshot of the Workflow Rules list (all 5 active) + one rule's action detail.

### STEP 8 — Data sharing
- Setup → Security Control → **Data Sharing Settings** → Leads & Student Cases = **Private** (role
  hierarchy grants managers upward visibility).
- **Evidence 8:** screenshot of the data-sharing settings.

### STEP 9 — Acceptance test (seed + run)
1. Create a **test Lead**: Lead Type Student, Market India, Interested Country Italy, Email a test
   address you control. → Observe WF1.
2. Create a **test Student Case**, move it stage-by-stage through all 11. → Observe WF3 at Agreement
   Signed.
3. Create an overdue test Task; set a test Next Deadline 7 days out. → Observe WF4/WF5.
- **Evidence 9 (the core proof):**
  - 9a: the received **welcome email** + the **"Call new lead" task** (showing assignee) + the
    **`#leads`** message.
  - 9b: at Agreement Signed — the **onboarding email/task** + **`#wins`** message.
  - 9c: an **`#ops-alerts`** heartbeat from a workflow run.
  - 9d: logged in as Kunal (or any counselor), confirm they **cannot** see another counselor's test lead.

---

# ACCEPTANCE CHECKLIST (I mark PASS/FAIL against your evidence)

| # | Criterion | Evidence required | Result |
|---|---|---|---|
| A1 | Prereqs: 7 users + roles + 2FA; 5 Cliq channels | Evidence 0 | ☐ |
| A2 | Module Deals renamed to Student Cases | Evidence 1 | ☐ |
| A3 | Lead fields + picklists match config exactly | Evidence 2 | ☐ |
| A4 | Student Case fields + Service Package match config | Evidence 3 | ☐ |
| A5 | 11-stage pipeline w/ probabilities + Lost Reason validation | Evidence 4 | ☐ |
| A6 | Email duplicate-check active | Evidence 5 | ☐ |
| A7 | Assignment rule = configurable criteria (Student; Pakistan→Tahir; overflow Bibek) | Evidence 6 | ☐ |
| A8 | All 5 workflows active, each with `#ops-alerts` heartbeat | Evidence 7 | ☐ |
| A9 | Data sharing Private + hierarchy | Evidence 8 | ☐ |
| A10 | Test lead fires WF1 (email + task + `#leads`) within seconds | Evidence 9a | ☐ |
| A11 | Agreement Signed fires WF3 (onboarding + `#wins`) | Evidence 9b | ☐ |
| A12 | `#ops-alerts` heartbeat observed | Evidence 9c | ☐ |
| A13 | Counselor sees only own records | Evidence 9d | ☐ |

**PASS rule:** AM0.4 is marked ✅ only when A1–A13 are all satisfied by evidence. Any gap → I list the
exact defect + corrective step, milestone stays IN PROGRESS. Missing/partial evidence = not verifiable
= not PASS (I never mark complete without evidence).
