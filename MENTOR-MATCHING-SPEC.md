# MENTOR-MATCHING-SPEC.md

`matchMentor(record_id, module)` — deterministic. Mentors live on the **Vendors** module,
`Record_Role = "Mentor"`.

**Why Vendors.** It already existed, was unused, and is Zoho's module for external parties.
Twelve fields were added to it — the same extend-don't-duplicate decision made for
Opportunities on Accounts.

## Fields created (12, live in CRM)
`Record_Role` · `Expertise` (12 values) · `Mentor_Countries` (9) · `Mentor_Languages` (6) ·
`Industry_Sector` · `Education_Background` · `Years_Experience` · `Student_Segments` (6) ·
`Availability` · `Credentials_Verified` · `Credential_Source_URL` · `Credential_Verified_On`

## Verification gate
A mentor is matchable only when **all three** hold: `Credentials_Verified` is true, a
`Credential_Source_URL` exists, and a `Credential_Verified_On` date exists.

Introducing a student to someone whose claimed expertise nobody checked is a trust failure
that no match quality compensates for. Unverified mentors are returned in
`unverified_mentors[]` with their exact gaps.

## Scoring — 100 points

| Component | Max | Rule |
|---|---|---|
| Expertise ↔ stated career goal | 40 | substring match either direction |
| Destination country | 25 | mentor has lived/studied where the student is going |
| Student segment | 30 | level 10 · gap students 10 · low budget 10 |
| Shared language | 15 | Hindi, Bhojpuri, Maithili or Nepali |

Language scores because explaining a visa refusal in the family's own language is worth more
than another year of experience in English.

A verified mentor with no specific match still returns, flagged `caution` — recommend only
if nothing better exists.

## Live state
**Zero mentors exist.** `matchMentor` returns
`"NO VERIFIED MENTORS AVAILABLE... none has been invented."`

No mentor records were created. Fabricating a mentor — a real person's name, credentials and
experience — would be the single most damaging invention possible in this system.

## Founder action
Add real mentors to Vendors with `Record_Role = Mentor` and a checkable
`Credential_Source_URL` (LinkedIn, university staff page, employer page). The matcher works
the moment verified records exist.
