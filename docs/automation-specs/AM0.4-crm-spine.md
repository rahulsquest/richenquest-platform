# AM0.4 — CRM Spine (build-ready runbook)
Milestone: AM0 Foundation · Owner: **Automation Owner + AI CTO (spec)** · Effort: ~3–4h · **The keystone.**
Source spec: **File 01** (this runbook turns File 01 into executable tasks with current-cycle values).
Everything in File 16 (leads, cases, automations, dashboards) plugs into this.

---

## 1. Prerequisites (confirm before building)

**A. Fast foundation items — confirm done, or complete first (~2.5h if not):**
- **AM0.2 Directory:** all 5 core users provisioned; role hierarchy CEO → Manager → Counselor/Ops/
  Finance; **2FA enforced** (non-negotiable — you hold passports/financials, File 00); data-sharing
  "Private with role hierarchy."
- **AM0.8 Cliq channels:** `#leads`, `#wins`, `#finance-approvals`, `#ops-alerts`, `#daily-updates`.
  (`#leads` and `#ops-alerts` are used by AM0.4's workflows + heartbeat.)

*The CRM **structure** (modules, fields, pipeline) can be built now regardless; the **workflow** layer
needs A confirmed because it references users and Cliq channels.*

**B. One business input needed from founder (the File 00 questionnaire gap):**
- **Team roster:** the 5 core members' names + roles (for the Assigned Counselor lookup + round-robin
  assignment). Also unblocks AM0.2.
- **Service Package picklist:** confirm the tiers. Proposed default from File 08: `Counseling only` ·
  `Standard Package (₹1,80,000)` · `Custom — per quote`. Adjust if you have named tiers.

## 2. Modules (File 01 §2)
- **Leads** — new inquiries (pre-payment).
- **Contacts** — converted students + parents.
- **Deals → renamed "Student Cases"** — one deal = one student journey.
- (University Partnerships module is AM3, not here.)

## 3. Custom fields — with current-cycle values (File 01 §3 + corrections)

**Leads:**
| Field | Type | Options |
|---|---|---|
| **Lead Type** | Picklist | **Student (default/active)**, Parent, University, Partner Institution, Recruitment Agent, Corporate, Employer, Government, Organization, Training Partner *(IF-3: multi-type-ready per Constitution; only Student is workflow-active today)* |
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
| Service Package | Picklist | Counseling only, Standard Package (₹1,80,000), Custom — per quote *(confirm)* |
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
   `#leads` alert. Round-robin assignment among counselors. *(This is the seam AM1.1 extends.)*
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
