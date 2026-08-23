# Mentor import — how to add a real mentor

**The dataset is empty and stays empty until real people with checkable credentials exist.**
`matchMentor` returns an explicit `NO VERIFIED MENTORS AVAILABLE` state, which is correct.

Mentors live on the **Vendors** module with `Record_Role = "Mentor"`.

## The validation rule, enforced in code

`matchMentor` will not recommend a mentor unless **all three** are true:

1. `Credentials_Verified = true`
2. `Credential_Source_URL` is present
3. `Credential_Verified_On` is set

Anything short of that is returned in `unverified_mentors[]` with the exact missing fields
and is never shown to a student. Introducing a student to someone whose claimed expertise
nobody checked is a trust failure no match quality compensates for.

## What counts as a credential source
A page a third party controls and anyone can open: a LinkedIn profile, a university staff
page, an employer's team page, a published paper. **Not** a CV the person sent us, and not
their own website.

## Columns

| Column | Type | Notes |
|---|---|---|
| `Vendor_Name` | text | The mentor's name |
| `Record_Role` | picklist | Must be `Mentor` |
| `Expertise` | multiselect | `;`-separated. 12 allowed values |
| `Industry_Sector` | text | Free text |
| `Education_Background` | text | Degree and institution |
| `Mentor_Countries` | multiselect | Countries they have **lived or studied in** |
| `Mentor_Languages` | multiselect | 15 points in matching — a mentor who can explain a refusal in the family's language is worth more than another year of experience in English |
| `Years_Experience` | integer | |
| `Student_Segments` | multiselect | `Bachelor's` `Master's` `PhD` `Gap Students` `Low Budget` `Career Switchers` |
| `Availability` | picklist | `Available` `Limited` `Unavailable` `Unknown` |
| `Credentials_Verified` | boolean | **Leave FALSE until checked** |
| `Credential_Source_URL` | url | Required before verification |
| `Credential_Verified_On` | date | Set on the day it was checked |

## Process
1. Import with `Credentials_Verified = FALSE`.
2. Open the credential URL and confirm the claims.
3. Only then set `Credentials_Verified = TRUE` and `Credential_Verified_On`.

Step 2 is the whole point. Do not batch-set the flag.
