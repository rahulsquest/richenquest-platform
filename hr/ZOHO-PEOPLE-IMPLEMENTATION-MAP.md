# ZOHO-PEOPLE-IMPLEMENTATION-MAP.md — 2026-08-23

## PART 1 — Audit result: I cannot configure Zoho People from here

Three probes, all executed:

| Route | Result |
|---|---|
| **MCP connector for Zoho People** | **Does not exist.** Connected Zoho products are CRM, Books, Desk, Projects. No People connector |
| **People public API** via the open session | **`code 7202 — Provided authentication token is invalid`**. People requires an OAuth token; unlike CRM, a session cookie is not sufficient |
| **People internal endpoints** with the `CSRF_TOKEN` cookie | 400 / 404 on every candidate. The CRM technique (`X-ZCSRF-TOKEN` + session) does **not** transfer to People |

The org is live and reachable in the browser — `people.zoho.in/richenquestglobal` — but **only to a human clicking in it.**

### A second, independent blocker
**Zoho People letter templates are authored in the UI, not through an API.** Even with a valid
OAuth token there is no endpoint that creates a letter/document template. Template design is a
console operation in every Zoho People edition.

**So this task cannot be completed by automation, by me or by any integration.** What follows
is the content and the exact configuration steps for a human to apply in the console — which
is the only form this deliverable can honestly take.

---

## 🔴 STOP — assets and legal facts that are missing

Per the brief's instruction to stop only the affected part and list what is missing:

| # | Missing | Needed for | Why I have not substituted |
|---|---|---|---|
| 1 | **The RichenQuest logo** | every document header | The only image in the repo is `favicon.svg`: a gradient rounded square containing the letter **"R"** in Helvetica. That is a generated placeholder, not a logo. **Please attach the brand pack** — I will not design a replacement |
| 2 | **CIN / company registration number** | offer letters, appointment letters, payslips | `{{REG_NO}}` unresolved. An Indian offer letter normally carries it |
| 3 | **GSTIN** *(or a confirmed exemption)* | payslip footer if used | `{{GSTIN}}` unresolved |
| 4 | **Registered office** vs Boring Road | legal header | Boring Road is on record; whether it is the *registered* office is unconfirmed |
| 5 | **Authorised signatory name + designation** | all letters and certificates | Rahul Kumar is the grievance officer; the HR signatory is not recorded |
| 6 | **PF / ESI / PT applicability** | payslips | **Not assumed.** If not configured in Zoho Payroll, no statutory line appears |
| 7 | **Tagline** *"Where Ambitions Meet Opportunities"* | document footer | **0 occurrences** in the repo — it is new here, not existing brand. Confirm before it goes on legal documents |

---

## Brand facts that ARE available — from `website/src/assets/css`

| Token | Value | Use |
|---|---|---|
| `--color-brand` | **#1D4ED8** | headers, rules |
| `--color-brand-deep` | **#1E3A8A** | wordmark, signature block |
| `--color-brand-strong` | #1E40AF | emphasis |
| `--color-accent` | **#B45309** | certificate seal accent, sparingly |
| `--color-border` | #D8DFEB | table rules |

**This is the real website palette** and gives one document design language across all seven
templates without inventing anything.

---

## What Zoho People natively provides — use these, do not rebuild

| Document | Native capability | Verdict |
|---|---|---|
| Employee offer letter | **Letter Templates** + Offer Letter in Onboarding | **native** |
| Intern offer letter | Same, second template | **native** |
| Internship certificate | Letter Template gated on a status field | **native + condition** |
| **Employee payslip** | **Zoho Payroll** — real salary structure, statutory components | **NEVER hand-build.** If Payroll is not configured, there is no payslip, and a static template pretending to be one is a fabricated financial record |
| Intern stipend statement | Depends on whether interns exist in Payroll | **audit required** — see below |
| University proposal | Not an HR document — **Zoho Writer**, sent by email | Writer |
| Appointment letter | Letter Template, **separate from the offer** | native |

### The payslip question the console must answer first
1. Is **Zoho Payroll** subscribed and configured for this org?
2. Are PF / ESI / PT / TDS actually enabled, or is this a small org below thresholds?
3. Are interns paid **through Payroll**, or by direct transfer outside it?

**If Payroll is not configured, stop at the payslip.** Producing a document titled "Salary
Slip" with hand-entered figures and invented statutory deductions would be a fabricated
financial record — the single most serious thing in this entire task.

If interns are paid outside Payroll, the document must be titled **"INTERNSHIP STIPEND
STATEMENT"**, never "Salary Slip", and must carry no PF/ESI/TDS lines at all.

---

## Merge-field syntax — verify before mass use

Zoho People letter templates insert fields from a picker; the stored form is
`${FormName.FieldLabel}`, e.g. `${Employee.First Name}`.

**I could not verify the exact tokens for this org** because the API rejected me — field labels
differ per org and per customised form. **Build the first template using the editor's own field
picker**, then copy that syntax for the rest. Do not hand-type tokens from this document.

The templates below use `${...}` placeholders with the *intent* named, so a human can pick the
matching field.

---

## PART 8 — Internship workflow, using existing structures

**Do not create a new module.** Zoho People **Recruitment/Candidate** covers applied →
selected, and **Employee** with `Employment Type = Intern` covers onboarding → completion.

Statuses: `Applied · Shortlisted · Interview · Selected · Offer Sent · Offer Accepted ·
Onboarding · Active · Completed · Extended · Withdrawn · Terminated`

**Certificate gate: `Internship Status = Completed`.** No other value generates a certificate.
An unfinished internship must not produce one, and this is a workflow condition, not a
convention.

## PART 10 — Signature
Zoho Sign is a **separate subscription**. **Not verified as available.** Configure e-sign only
after confirming the People ↔ Sign integration is active; until then, letters are signed by
hand or with a signature image.

## PART 14 — Access control
Payslips: employee sees **only their own**; HR/Admin generates. Managers get no salary
visibility by default. Certificates: HR/Admin + signatory. University proposal: authorised
staff. **Configure in Zoho People roles — do not rely on template-level restriction.**
