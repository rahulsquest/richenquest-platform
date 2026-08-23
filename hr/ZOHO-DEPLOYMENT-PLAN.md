# Zoho HR deployment — blocked, and exactly how to unblock it
**2026-08-24.** Deployment was attempted under the OAuth-only constraint and stopped at a gate
Zoho itself enforces. Nothing here was deployed.

## The blocker

Creating the OAuth self-client requires **MFA OTP re-verification on the founder's authenticator
app**. `api-console.zoho.in` redirects to:

> *"Since you're trying to perform a sensitive operation, we need re-verification to let you
> proceed. Enter the MFA OTP generated on your authenticator app"*

That gate was not entered and not bypassed. Zoho has classified credential creation as an action
requiring a present human, and that judgement is correct.

Both APIs were re-confirmed closed without OAuth:

| Call | Result |
|---|---|
| `GET /people/api/forms/employee/getRecords` | `7202 — Provided authentication token is invalid` |
| Writer document API via session | `7201 — Incorrect URL` (documented API is OAuth-only) |

**Every task in the brief — template import, field mapping application, workflow configuration,
Sign setup, synthetic intern — requires write access behind this one gate.** No partial
deployment is possible.

## Founder action — approximately 5 minutes

1. `api-console.zoho.in` → complete the MFA prompt.
2. **Self Client** → Create (or open the existing one).
3. **Generate Code** with scopes:
   ```
   ZOHOPEOPLE.forms.ALL
   ZOHOPEOPLE.employee.ALL
   ZohoWriter.documentEditor.ALL
   ZohoWriter.merge.ALL
   ZohoSign.documents.ALL
   ZohoSign.templates.ALL
   ```
   Duration 10 minutes, scope description anything.
4. Exchange the code for a refresh token:
   ```
   curl -X POST 'https://accounts.zoho.in/oauth/v2/token' \
     -d 'grant_type=authorization_code' \
     -d 'client_id=<CLIENT_ID>' \
     -d 'client_secret=<CLIENT_SECRET>' \
     -d 'code=<GENERATED_CODE>'
   ```
5. Hand over `client_id`, `client_secret`, `refresh_token`.

The code expires in minutes; the refresh token does not. **Treat all three as credentials** —
they are CRM-grade write access to employee records.

## Field mapping — ready to apply, not yet applied

45 merge fields across the five templates. Sources below are **proposed**; each is confirmed in
one call once OAuth exists:
`GET https://people.zoho.in/people/api/forms/employee/fields`

### From the People employee record (standard fields)

| Merge field | Proposed People field | Used in |
|---|---|---|
| `${Employee_Name}` | `FirstName` + `LastName` | employee offer |
| `${Employee_ID}` | `EmployeeID` | employee offer |
| `${Intern_Name}` | `FirstName` + `LastName` | intern offer, certificate, stipend |
| `${Intern_ID}` | `EmployeeID` | intern offer, certificate, stipend |
| `${Designation}` | `Designation` | employee offer |
| `${Department}` | `Department` | all letters |
| `${Reporting_Manager}` | `Reporting_To` | all letters |
| `${Joining_Date}` | `Dateofjoining` | employee offer |
| `${Work_Location}` | `Work_location` | employee offer |
| `${Employment_Type}` | `Employee_type` | employee offer |

### Custom fields to create in People

Intern-specific data has no standard home. Create on the employee form (or a dedicated Interns form):

| Merge field | Type | Notes |
|---|---|---|
| `${Role}` | Single line | intern role, distinct from Designation |
| `${Start_Date}` `${End_Date}` | Date | internship period |
| `${Duration}` | Single line | e.g. "12 weeks" |
| `${Work_Mode}` | Picklist | On-site / Hybrid / Remote |
| `${Stipend}` | Single line | **must accept the literal `Unpaid`** — the offer letter's unpaid clause keys off it |
| `${Notice_Period}` `${Probation_Period}` | Single line | |
| `${Offer_Date}` `${Acceptance_Deadline}` | Date | |
| `${Certificate_No}` `${Certificate_Date}` | Single line / Date | certificate only |
| `${Work_Completed}` `${Performance_Summary}` | Multi line | written at completion |
| `${Statement_No}` `${Statement_Date}` `${Stipend_Period}` `${Stipend_Amount}` `${Payment_Date}` `${Payment_Mode}` `${Payment_Reference}` | mixed | stipend statement |
| `${Basic_Annual}` `${HRA_Annual}` `${Special_Allowance_Annual}` `${Other_Allowance_Annual}` `${CTC_Annual}` | Currency | **leave empty until Zoho Payroll exists** |

### Organisation constants — set once

`${Company_Registration_No}` · `${Company_GSTIN}` · `${Authorised_Signatory}` ·
`${Signatory_Designation}` — **all four still unsupplied.** Not invented. Any document merged
today renders them blank.

### Proposal-only, entered per approach

`${University_Name}` · `${Contact_Person}` · `${Proposal_Date}` · `${Cohort_Size}` ·
`${Internship_Duration}`

## Workflow to configure once unblocked

| Stage | People status | Document | Gate |
|---|---|---|---|
| Selected | `Selected` | — | manager approval |
| Offer generation | `Offer Issued` | Intern / Employee offer letter | merged, sent via Sign |
| Acceptance | `Offer Accepted` | signed copy | **signature received** |
| Active | `Active` | — | start date reached |
| Completed | `Completed` | — | assessment recorded |
| Certificate | `Certified` | Certificate of Internship | **status must equal `Completed`** |

Employee path ends at `Offer Accepted` → employee record created.

## Not done

No template imported. No field created. No workflow configured. No Sign template. **No synthetic
intern created and therefore none to delete** — no test data exists in People.
