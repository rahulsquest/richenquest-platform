# RichenQuest — QA Checklists v1.0

Every item is measurable: it is a count, a date difference, a yes/no, or a field value.
Nothing here asks anyone to rate quality out of ten.

Sampling: **100% of cases weekly until student #20**, then 25% random monthly.

---

## QA-1 · Lead quality

| # | Measure | Pass |
|---|---|---|
| 1 | Hours from Lead creation to first call attempt | ≤ 48 |
| 2 | Call attempts before marking uncontactable | ≥ 3, on ≥ 2 different days |
| 3 | `Lead_Status` is not `-None-` | Yes |
| 4 | Lead has an Owner | Yes |
| 5 | `Intended_Intake` populated | Yes |
| 6 | `Lead_Source_Detail` (who referred) populated | Yes |
| 7 | `Consent_Given` is true | **Yes — mandatory** |
| 8 | Fields captured by the wizard | ≥ 20 |

## QA-2 · Counselling

| # | Measure | Pass |
|---|---|---|
| 1 | Working days from counselling to written shortlist | ≤ 3 |
| 2 | Universities recommended with `Confidence` = Low | **0** |
| 3 | Cost figures quoted without a source on the record | **0** |
| 4 | Total cost stated (not tuition only) | Yes |
| 5 | Parent present or explicitly excused, recorded | Yes |
| 6 | At least one risk named to the family, recorded | Yes |
| 7 | `Course_Start_Date` set | Yes |
| 8 | Service Agreement signed before first invoice | Yes |

## QA-3 · Application

| # | Measure | Pass |
|---|---|---|
| 1 | Days between submission and university deadline | ≥ 10 |
| 2 | Written student approval on record before submission | Yes |
| 3 | Application record created before submission | Yes |
| 4 | `Submitted_On` populated the same day | Yes |
| 5 | Portal confirmation saved to the record | Yes |
| 6 | Applications where `Application_Deadline` is empty | **0** |
| 7 | Name on application matches passport exactly | Yes |

## QA-4 · Visa

| # | Measure | Pass |
|---|---|---|
| 1 | Cases at `Visa_Ops_Risk` = Red | **0** |
| 2 | Appointments booked while `Document_Status` ≠ Complete | **0** |
| 3 | Mission checklist re-verified within 30 days of filing | Yes |
| 4 | Declarations signed by the student, not staff | **Yes — absolute** |
| 5 | `Visa_Decision` recorded within 24h of receipt | Yes |
| 6 | Refusals with `Refusal_Grounds` empty after 24h | **0** |

## QA-5 · Document review

| # | Measure | Pass |
|---|---|---|
| 1 | Hours from upload to review | ≤ 24 |
| 2 | Name matches passport across every document | Yes |
| 3 | DOB consistent across every document | Yes |
| 4 | English evidence valid on the **intake date** | Yes |
| 5 | Passport valid for course duration + 6 months | Yes |
| 6 | Documents forwarded to a university before verification | **0** |
| 7 | Suspected forgeries escalated same day | 100% |

## QA-6 · Communication

| # | Measure | Pass |
|---|---|---|
| 1 | Friday updates sent, as % of active cases | **100%** |
| 2 | Hours to first response to a student message (working hours) | ≤ 4 |
| 3 | Messages containing an unverified claim | **0** |
| 4 | Messages promising or implying an outcome | **0** |
| 5 | Parent updates sent without `Parent_Consent` | **0** |
| 6 | WhatsApp STOP requests honoured within 1 working day | 100% |
| 7 | Bad news delivered by call, not message | 100% |

## QA-7 · Student experience

| # | Measure | Pass |
|---|---|---|
| 1 | Questions the student was asked twice | **0** |
| 2 | Days from submission to first human contact | ≤ 2 |
| 3 | Student can state their case number when asked | Yes |
| 4 | Student can state their total cost when asked | Yes |
| 5 | Student can state their next deadline when asked | Yes |
| 6 | Cases with a HIGH band item untouched > 3 days | **0** |
| 7 | Complaints acknowledged within 3 working days | 100% |
| 8 | Actual cost vs quoted cost variance at enrolment | ≤ 10% |

**Item 5 is the truest test in this document.** A student who cannot name their next
deadline is not being managed, however good the CRM looks.
