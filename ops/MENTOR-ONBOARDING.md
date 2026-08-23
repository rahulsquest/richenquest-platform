# Mentor onboarding workflow

**0 mentors exist. No mentor has been invented.** This is the process for adding real ones.

## Stages

| # | Stage | Owner | Gate |
|---|---|---|---|
| 1 | **Application** | mentor | Form below completed |
| 2 | **Credential check** | Ops | A page a *third party* controls is opened and read |
| 3 | **Expertise tagging** | Ops | Mapped to the 12 `Expertise` values |
| 4 | **Availability** | mentor | `Available` / `Limited` / `Unavailable` |
| 5 | **Matching eligibility** | automatic | `matchMentor` includes them only after stage 2 |

## Mentor application form — the questions

1. Full name
2. Current role and employer
3. Highest qualification, and the institution
4. Countries you have **lived or studied in** (not visited)
5. Languages you can hold a difficult conversation in
6. Years of experience
7. Which students can you genuinely help? *(bachelor's / master's / PhD / gap students / low budget / career switchers)*
8. **A link where someone can verify your background** — LinkedIn, a university staff page, an employer page, a published paper
9. How much time can you give per month?
10. Why do you want to mentor?

Question 8 is mandatory. Without it the record cannot pass stage 2.

## Verification checklist — Ops, per mentor

- [ ] The credential URL opens, and is on a domain the mentor does **not** control
- [ ] The name on the page matches the application
- [ ] The claimed role/employer appears on the page
- [ ] The claimed qualification is supported, or explicitly marked unverified
- [ ] Countries claimed are consistent with the record
- [ ] Screenshot or archived link stored against the record
- [ ] `Credential_Verified_On` set to the date it was actually checked
- [ ] `Credentials_Verified` set true **only after every box above**

**Do not batch-set the flag.** The check is the product.

## Database structure — `Vendors`, `Record_Role = "Mentor"`
12 fields already exist. See `MENTOR-MATCHING-SPEC.md`. Import template:
`ops/MENTOR-IMPORT-TEMPLATE.csv`.

## The rule enforced in code
`matchMentor` requires `Credentials_Verified` **and** `Credential_Source_URL` **and**
`Credential_Verified_On`. Anything short of all three is returned in `unverified_mentors[]`
and never shown to a student.
