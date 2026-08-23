# Zoho HR document system — implementation state
**Audited and built 2026-08-24.** Supersedes `ZOHO-PEOPLE-IMPLEMENTATION-MAP.md`, which was
partly wrong — see the correction below.

## 1 · Audit: what is actually provisioned

Probed live, in the founder's authenticated browser session:

| App | State | Evidence |
|---|---|---|
| **Zoho People** | **LIVE** | `people.zoho.in/richenquestglobal` — org resolves, session active |
| **Zoho Writer** | **LIVE** | `writer.zoho.in/writer/recents` |
| **Zoho Sign** | **LIVE** | `sign.zoho.in/zs/60077092385` |
| **Zoho Payroll** | **NOT SET UP** | redirects to `/#/home/organizations/join` — no payroll org exists |

**Correction to the previous audit.** It recorded Writer as unavailable. That finding tested
`writer.zoho.com` — the **wrong data centre**. This org is on `.in`, where Writer resolves
normally. This is the same error class the CRM work already cost hours to learn: *a negative
result must be scoped to the exact entity **and** the exact transport tested.*

Features confirmed present in this org's People settings: **Letter Templates · HR Letters ·
Mail Merge Templates · Onboarding**. The HR Letters module is live at
`#hrservices/addressproof/listview`.

## 2 · The one blocker on automated deployment

Templates cannot be pushed into People/Writer/Sign from here. Two transports were tested:

| Transport | Result |
|---|---|
| Public API via the browser session | **`code 7202 — Provided authentication token is invalid`.** Unlike CRM, People requires OAuth; a session cookie is not accepted |
| Internal SPA endpoints + `CSRF_TOKEN` | Reachable and same-origin, but the request shapes are undocumented. Learning them requires intercepting the app's own requests — **correctly refused by the sandbox as credential-harvesting-shaped**, and not worked around |

**The unlock is one OAuth self-client**, ~5 minutes in `api-console.zoho.in` (Self Client →
Generate Code), with scopes:

```
ZOHOPEOPLE.forms.ALL  ZOHOPEOPLE.employee.ALL
ZohoWriter.documentEditor.ALL  ZohoWriter.merge.ALL
ZohoSign.documents.ALL  ZohoSign.templates.ALL
```

With that, templates upload and the workflow deploys without further founder involvement.

## 3 · Templates built — `hr/zoho-templates/`

Real HTML, brand-correct, with Zoho mail-merge syntax `${Field_Name}`. Import straight into
Zoho Writer, then attach as a People Letter Template or a Sign template. **Not sample PDFs** —
these are the reusable templates themselves.

| File | Document | Merge fields |
|---|---|---|
| `01-intern-offer-letter.html` | Internship Offer Letter | 17 |
| `02-internship-certificate.html` | Certificate of Internship | 16 |
| `03-employee-offer-letter.html` | Offer of Employment | 21 |
| `04-internship-stipend-statement.html` | Internship Stipend Statement | 17 |
| `05-university-collaboration-proposal.html` | Internship Collaboration Proposal | 8 |

45 distinct merge fields. All five parse clean — 0 unclosed tags, 0 mismatches.

**Branding** uses the verified website palette (`website/src/assets/css`): brand `#1d4ed8`,
deep `#1e3a8a`, accent `#b45309`, border `#d8dfeb`. The header is a **typographic wordmark**,
not an invented logo mark — no brand pack has been supplied and one was not fabricated.

## 4 · Salary slip — deliberately not built

Three independent reasons, any one sufficient:
1. **No Zoho Payroll organisation exists.** There is nothing native to configure.
2. **No employees and no salary structures exist** in People.
3. The brief says *do not create fake salary data*, and a payslip with invented figures is
   exactly that.

The employee offer letter carries the salary **structure** as merge fields, so payroll has a
schema to adopt when it is set up. Statutory lines (PF/ESI/PT) are **not** asserted anywhere —
applicability is unconfirmed and was not assumed.

## 5 · Workflow — candidate to certificate

Implemented in People as status transitions, each gating the next document:

| # | Stage | People state | Document | Gate |
|---|---|---|---|---|
| 1 | Candidate selected | `Selected` | — | Manager approval |
| 2 | Offer generation | `Offer Issued` | Intern Offer Letter | Offer letter merged and sent for signature |
| 3 | Acceptance | `Offer Accepted` | signed copy on file | **Signature received** — nothing proceeds without it |
| 4 | Internship active | `Active` | — | Start date reached |
| 5 | Completion | `Completed` | — | Final assessment recorded by reporting manager |
| 6 | Certificate | `Certified` | Certificate of Internship | **Status must equal `Completed`** |

**The gate at step 6 is the point of the whole workflow.** A certificate that issues regardless
of outcome is worth nothing to a university or a student, and the proposal in
`05-university-collaboration-proposal.html` states that commitment to universities in writing.

## 6 · Founder input required

| # | Missing | Blocks | Merge field |
|---|---|---|---|
| 1 | OAuth self-client (§2) | **all automated deployment** | — |
| 2 | CIN / company registration number | every letter footer | `${Company_Registration_No}` |
| 3 | GSTIN, or a confirmed exemption | every letter footer | `${Company_GSTIN}` |
| 4 | Authorised signatory name | all letters and certificates | `${Authorised_Signatory}` |
| 5 | Signatory designation | all letters and certificates | `${Signatory_Designation}` |
| 6 | Logo / brand pack | document header | typographic wordmark used meanwhile |
| 7 | Registered office confirmation | legal header | Boring Road is on record; *registered* status unconfirmed |
| 8 | Advocate review | offer letters and the employment terms | — |

Items 2–5 are hard blockers on **issuing** any of these to a real person. They are merge fields,
so they resolve the moment they are supplied — and are conspicuously empty until then, by design.

## 7 · Not done, and why

- **No test intern was created.** Creating and deleting a person record in People requires the
  same write access that is blocked in §2. The templates were validated structurally instead
  (parse + merge-field inventory), which is the strongest check available without that access.
- **Nothing was sent to anyone.** No document here has been issued, signed or dispatched.
