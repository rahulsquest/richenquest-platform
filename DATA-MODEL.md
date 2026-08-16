# The Canonical Student Data Model

**One source of truth. Every module reads and writes this.**
**v1.1 · 17 Aug 2026 · Zoho CRM, org 60074018310**

> ## 🔒 SCHEMA FROZEN — migration executed and verified, 17 Aug 2026
>
> | | |
> |---|---|
> | **Applications module** | ✅ created, **11 fields** — lookups to Deals and Accounts |
> | **Contacts** | ✅ **8 fields** — consent ×3, parent ×3, attribution ×2 |
> | **Student Case** | ✅ **6 fields** — passport, node contact, attribution ×2, outcome confidence, competitor |
> | **`normalizeInput`** | ✅ deployed. **8/8 unit checks pass** |
> | **Regression** | ✅ **18/18 PASS, 0 leaked probes** · visaOpsSweep ok · readinessSweep ok |
>
> **No field is added from here without a defect report showing an existing field cannot carry the
> information.** Next work is consumption: Student 360, counsellor workspace, parent PDF.

---

## 1. Entities and cardinality

```
CONTACT  (the person — immutable identity, survives forever)
   │
   ├── 1:N ── LEAD           (an enquiry. Pre-decision. Dies on conversion)
   │
   └── 1:N ── STUDENT CASE   (Deals — ONE INTAKE ATTEMPT)
                  │
                  └── 1:N ── APPLICATION   🆕 (one university, one attempt)
                                 │
                                 └── N:1 ── ACCOUNT (university)
```

**🆕 APPLICATION is new in v1.1 and it closes the largest gap in the model.**

The Case previously held `Course_University_Final` — a single text field. **That records the
destination and destroys the funnel.** A student applies to four universities and takes one; with a
single field we know only the one, so we can never answer *"of 47 applications to Debrecen, how many
became offers?"* — **which is precisely the question the outcomes registry exists to answer.**

**Each Application carries its own deadline, documents, fee, offer and rejection**, because each
genuinely has them. Modelling four applications inside one Case means four deadlines in one date
field, which fails at the second university.

**The decision that makes this model work: a Student Case is one *intake attempt*, not one student.**

A student who misses February and goes in September is **one Contact, two Cases.** Modelling it as one
case that "slipped" destroys the February outcome — and the February outcome (why it failed) is the
data the company exists to collect.

| Entity | Holds | Lifetime |
|---|---|---|
| **Contact** | Identity, consent, parent, referrer | **Forever.** Never deleted |
| **Lead** | The enquiry as submitted | Until conversion |
| **Student Case** | One attempt at one intake | Until won, lost, or superseded |
| **Account** | University intelligence | Forever, re-verified on `Review_Date` |

---

## 2. CONTACT — the person

| Field | Type | Req | Source | Owner | Immutable | Privacy |
|---|---|:-:|---|---|:-:|---|
| `Last_Name` | text | ✅ | form | student | — | PII |
| `Phone` · `WhatsApp_Number` | phone | ✅ | form | student | — | PII |
| `Email` | email | — | form | student | — | PII |
| `Mailing_City` | text | ✅ | form | student | — | PII |
| 🔴 `Consent_Given_On` | datetime | ✅ | **form** | system | **YES** | **legal** |
| 🔴 `Consent_Version` | text | ✅ | form | system | **YES** | **legal** |
| 🔴 `Parent_Name` | text | — | counsellor | counsellor | — | PII |
| 🔴 `Parent_Phone` | phone | — | counsellor | counsellor | — | PII |
| 🔴 `Parent_Reporting_Consent` | boolean | — | **student** | student | — | **legal** |
| `Referred_By_Node` | text | — | form | system | **YES** | internal |

**Validation:** a Contact cannot be created without `Consent_Given_On`. **Immutable fields are never
edited — a correction creates a new consent record, because the point of a consent log is that it
records what was true at the time.**

## 3. LEAD — the enquiry

**Every field below is written by `parseInquiry` from the form. None is typed by a human.**

| Field | Type | Source | AI/Human | Validation |
|---|---|---|---|---|
| `Academic_Percentage` | double | form | student | 0–100 |
| `Backlogs` · `Study_Gap_Years` · `Work_Experience_Years` | number | form | student | ≥0 |
| `Current_Education` | text | form | student | — |
| `English_Status` | picklist | form | student | **must match CRM value exactly** |
| **`Passport_Status`** | picklist | form | student | **drives a task if ≠ Valid** |
| `Budget_Range` | picklist | form | student | `<10L`\|`10-20L`\|`20-35L`\|`35L+` |
| `Parents_Annual_Income` | picklist | form | student | **decides DSU eligibility** |
| `Funding_Source` | multiselect | form | student | — |
| `Interested_Level` · `Intended_Intake` · `Interested_Country` | picklist | form | student | — |
| `Accommodation_Preference` | picklist | form | student | — |
| `Career_Goal` | text | form | student | — |
| **`Lead_Source_Detail`** | text | form | student | **the trust node's name — the growth model depends on it** |
| `Lead_Status` | picklist | `updateLeadLifecycle` | **system** | never hand-edited |
| `Description` | textarea | form + parser | mixed | holds every unmapped answer |

**Update frequency: write-once at creation, then read-only except `Lead_Status`.** A lead is a
*record of what was said at enquiry* — editing it destroys the baseline the counselling was built on.

## 4. STUDENT CASE — one intake attempt

| Group | Fields | Source | Owner |
|---|---|---|---|
| **Identity** | `Deal_Name` · `Stage` · `Closing_Date` · `Assigned_Counselor` | conversion | counsellor |
| **Plan** | `Destination_Country` · `Course_University_Final` · `Service_Package` · **`Course_Start_Date`** | counsellor | counsellor |
| **Documents** | `Document_Status` | counsellor | ops |
| **Visa ops** | `Visa_Appointment_Status` · `Appointment_Date` · `Appointment_Center` · `Biometric_Status` · `Passport_Submitted` · `Passport_Dispatch` · `Passport_Received` · **`Visa_Decision`** | counsellor | counsellor |
| **Computed** | **`Visa_Ops_Risk`** · `Next_Deadline` | **`visaOpsSweep`** | 🤖 **AI — never hand-edited** |
| **Journey** | `Student_Journey_Stage` · `Residence_Permit_Status` · `Post_Arrival_Setup` | counsellor | ops |
| **Scholarship** | `Scholarship_Status` | counsellor | counsellor |
| **🔴 Outcome** | **`Refusal_Grounds`** · `Cost_Quoted_INR` · `Cost_Actual_INR` · `Accommodation_Outcome` | counsellor | **counsellor — mandatory at close** |

**`Refusal_Grounds` is verbatim and immutable once written.** A paraphrased refusal ground is worthless
for the outcome dataset and dangerous in an appeal.

## 4b. 🆕 APPLICATION — one university, one attempt

**Zoho custom module. Identified as a gap in File 25 and never built; now justified.**

| Field | Type | Source | Owner | Notes |
|---|---|---|---|---|
| `Student_Case` | lookup → Deals | system | system | parent |
| `University` | lookup → Accounts | counsellor | counsellor | |
| `Programme` | text | counsellor | counsellor | |
| `Application_Deadline` | date | Account | 🤖 copied from `Next_App_Deadline` | |
| `Submitted_On` | date | counsellor | counsellor | **immutable once set** |
| `Application_Status` | picklist | counsellor | counsellor | Not started · In progress · **Submitted** · Offer · Rejected · Withdrawn |
| `Outcome_On` | date | counsellor | counsellor | |
| `Rejection_Reason` | textarea | university | counsellor | **verbatim** |
| **`Fee_Paid_INR`** | double | counsellor | counsellor | **Non-refundable money, per application. This is what a family actually loses** |
| `Scholarship_Applied` · `Scholarship_Outcome` | picklist | counsellor | counsellor | |

**`Fee_Paid_INR` sums to the Case's `Cost_Actual_INR`.** Without it, "what did this actually cost"
misses every application fee — and application fees are the money spent *before any answer*, which is
the number families are least prepared for.

## 5. ACCOUNT — university

**Already canonical.** 30 fields, of which the load-bearing ones are the **five independent confidence
dimensions** (`Confidence_Admissions/Finance/Accommodation/Visa/Employment`), `Serves_Core_Segment`,
`Verified_On`, `Source_URL`, `Review_Date`, and the computed `Readiness_Status`.

**Rule: `Confidence` is never averaged across dimensions.** That averaging is what let a ₹15.89 L
figure be published with a "Medium" label while its finance dimension was LOW.

---

## 5b. 🔴 Zoho does NOT enforce picklist values

**Verified by probe, 17 Aug 2026.** `parseInquiry` wrote **`Masters`** into `Interested_Level`, whose
only valid value is **`Master's`**. **The record saved. No error, no warning.**

**This is the most dangerous class of bug in the system**, because `leadToPlan` matches the exact
string — so that lead can never be planned, and **nothing in the record looks wrong.** A counsellor
opens it, sees "Masters", and cannot understand why the matcher returns an error.

| Consequence | Rule |
|---|---|
| The CRM will not catch a bad value | **The form is the only guard. It emits CRM-exact values, always** |
| A curly apostrophe surviving WhatsApp would break it | **`parseInquiry` normalises `Master`/`Masters`/`Master’s` → `Master's`** — verified |
| Any future integration writing to a picklist | **Must normalise. Assume nothing validates** |

## 6. 🔴 DUPLICATES — defects to fix

| # | Duplicate | Problem | Resolution |
|---|---|---|---|
| **D1** | **`Visa_Status`** *(Preparing/Lodged/Biometrics Done/Approved/Refused)* **vs `Visa_Decision`** *(Pending/Approved/Refused/Withdrawn/Returned Incomplete)* | **Two fields, overlapping values, no precedence.** A report cannot know which to trust, and both can say different things | **`Visa_Decision` is canonical. Retire `Visa_Status`** — it predates Phase 9 |
| **D2** | `Assigned_Counselor` vs record **Owner** | Two ownership semantics; SLA queries can disagree | **`Assigned_Counselor` is canonical for work. Owner stays for permissions only** |
| **D3** | `Document_Status` carries `APS Applied`/`APS Received` | **Germany-specific values in a generic field.** Italy and Poland have no APS | Keep, but **country pre-step belongs in the checklist, not the status enum** |
| **D4** | `Interested_Country` (Lead, multi) → `Destination_Country` (Case, single) | Not a duplicate — a narrowing. **But no rule says when it narrows** | **Set at case creation. Changing it after `Course_Start_Date` is set must create a NEW case** |

## 7. 🔴 MISSING — gaps that block real operation

| # | Missing | Why it matters | Priority |
|---|---|---|---|
| **M1** | **`Consent_Given_On` · `Consent_Version`** | **DPDP Act 2023.** We collect family income with no consent record | **P0 — legal** |
| **M2** | **`Parent_Name` · `Parent_Phone`** | The experience design sends parents their own messages. **There is nowhere to put a parent's number** | **P0** |
| **M3** | **`Parent_Reporting_Consent`** | Constitution 11. Without it, the boundary is a policy nobody can audit | **P0** |
| **M4** | **`Passport_Status` on the Case** | It lives only on the Lead. **The campaign's critical-path field is lost at conversion** | **P1** |
| **M5** | **`Node_Contact` on the Case** | `Lead_Source_Detail` is Lead-only. **The 3× edge needs to know who to notify at Offer and Visa** | **P1** |
| **M6** | Stage entry dates — `Applied_On`, `Offer_Received_On` | Timelines are inferred from stage history, which is unqueryable. **The outcome dataset needs real medians** | P2 |
| **M7** | `Permit_Expiry_Date` | Renewal is the recurring revenue line. **No date, no reminder** | P2 |
| **M8** | **`Acquisition_Source`** *(immutable)* + **`Acquisition_Detail`** on **Contact and Case** | Teacher · student referral · GBP · seminar · website · walk-in · parent. **`Lead_Source_Detail` is Lead-only, so attribution dies at conversion and CAC can never be computed** | **P1** |
| **M9** | **`Competitor_Chosen`** | IDP · LeapScholar · KC Overseas · AECC · self-applied · unknown. **Only capturable at the moment of loss, and worth more each year** | **P1** |
| **M10** | **`Outcome_Confidence`** | **Verified by document · verified by university · student-reported · unknown.** This is the field that separates a registry from hearsay | **P1** |
| — | ~~`Lost_Reason`~~ | **ALREADY EXISTS on Deals.** Values not confirmed — CRM unreachable. **Review the picklist and make it mandatory at Closed Lost, with notes required on "Other"** | audit |

## 8. 🔴 SHOULD NEVER EXIST

| Never | Why |
|---|---|
| Admission / scholarship / visa **probability or score** | **Constitution 12.** A field invites a number; a number becomes a promise |
| **Student conduct** — attendance, marks abroad, spending | **Constitution 11.** We report on our work, never on the student |
| Any field ranking a university by **what it pays us** | **Constitution 9.** `Lane` is borderline — **audit it: if it ever appears in a shortlist query, delete it** |
| Free-text "notes" duplicating a structured field | Two truths, one record |

## 9. Automation → model map

| Automation | Reads | Writes | Entity |
|---|---|---|---|
| **`parseInquiry`** | raw text | **all Lead fields** | Lead |
| `qualifyLead` | Lead | `Lead_Status`, note | Lead |
| `assignCounselor` | Lead | Owner | Lead |
| `leadToPlan` | Lead | *(nothing — read-only)* | Lead |
| `studentActionPlan` | **Account** | nothing | Account |
| **`visaOpsSweep`** | Case: `Course_Start_Date`, `Destination_Country` | **`Visa_Ops_Risk`, `Next_Deadline`** | Case |
| `opsWatch` | Case + Account | nothing — alerts only | both |
| `readinessSweep` | Account | `Readiness_Status`, `Research_Complete_Pct`, `Readiness_Gaps` | Account |
| `qualityGate` | text | nothing | — |
| `schedFounderDigest` | Leads, Cases, Accounts | nothing | all |

**Two fields are AI-owned and must never be hand-edited: `Visa_Ops_Risk` and `Readiness_Status`.** Both
are recomputed daily; a manual edit is silently overwritten within 24 hours, which is worse than being
rejected.

## 10. Migration plan

**Nothing below can execute today — CRM is unreachable via both MCP and the browser channel.**

| Step | Action | Risk | Reversible |
|---|---|---|---|
| **1** | Add `Consent_Given_On`, `Consent_Version` (Contact) | none | yes |
| **2** | Add `Parent_Name`, `Parent_Phone`, `Parent_Reporting_Consent` (Contact) | none | yes |
| **3** | Add `Passport_Status`, `Node_Contact` (Case) | none | yes |
| **4** | Add consent capture to the form + privacy notice | **blocks launch until done** | yes |
| **5** | Update `parseInquiry` to write consent | none | yes |
| **6** | **Deprecate `Visa_Status`** — stop writing, keep reading for 90 days, then delete | **low, but check no report reads it** | **yes, until deleted** |
| 7 | Add `Applied_On`, `Offer_Received_On`, `Permit_Expiry_Date` | none | yes |
| 8 | Audit `Lane` against shortlist queries | none | — |

| **9** 🆕 | **Create the APPLICATION custom module** + move `Course_University_Final` to it | medium | yes, while empty |
| **10** | Add `Acquisition_Source`, `Acquisition_Detail`, `Competitor_Chosen`, `Outcome_Confidence` | none | yes |
| **11** | Audit `Lost_Reason` values; make mandatory at Closed Lost | none | yes |

**Steps 1–5 are launch-blocking. Steps 9–11 must also happen before student #1** — not because they
block operation, but because **a schema change with no records to migrate is free and one with records
is not.** Steps 6–8 can wait.

---

## 🔒 SCHEMA FREEZE

**After this migration the model is frozen.** No field is added without a defect report showing an
existing field cannot carry the information.

**The reason is not tidiness.** Every schema change after student #1 means a migration, a re-test of
`parseInquiry`, and a window where old and new records disagree. **The model is now sufficient for
Student 360, the counsellor workspace, the parent timeline, the client portal and the university
workspace — all five read this model without modification.**

**Next work is consumption, not design.**
