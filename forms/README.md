> **SUPERSEDED.** The live intake is `portal/index.html` (10-step wizard, save-and-
> continue, CRM-exact values, verified end to end). This single-page form is kept only
> as a fallback. Both now carry the production number +91 76312 07948.

# forms/ — the public inquiry form

**`student-inquiry.html`** · live at **https://claude.ai/code/artifact/b59be8ea-59e9-44cd-9c04-fe85ea0084c0**
*(private until shared)*

## 🔴 FOUNDER DECISION REQUIRED — before this is used

**One line, `WA_NUMBER` at the bottom of the file.** Replace `917631207948` with RichenQuest's
WhatsApp business number — country code first, digits only. **Then republish.** The form does nothing
useful until this is done.

## How it works, and why there is no backend

**Submit composes a WhatsApp message with every answer and opens it in the student's own WhatsApp.**
They press send. It arrives from their number, so the conversation is already open and you have their
contact.

**No server, no database, no form service, no monthly fee, no data sitting with a third party.** In a
market where the first contact happens on WhatsApp anyway, this is not a workaround — it is the
shortest path from a stranger to a conversation.

## Deploying it elsewhere

| Destination | How |
|---|---|
| **The artifact URL** | Already live. Share the link |
| **richenquest.com** | Hand `student-inquiry.html` to the web developer. Self-contained, no dependencies |
| **Zoho Forms / Google Forms** | Field list below maps 1:1 |

## 🔴 A bug this build caught, and it would have broken silently

**The form's dropdown options did not match the CRM picklist values.** Nine mismatches:

| Form said | CRM expects |
|---|---|
| "I have a valid passport" | `Valid` |
| "₹10–15 lakh" | **no such band** — CRM has `<10L`, `10-20L`, `20-35L`, `35L+` |
| **"Feb / Mar 2027"** | **`Feb 2027` and `Mar 2027` are SEPARATE values** |
| "IELTS 5.5" | `5.5` |
| "Czech Republic" | **not in the CRM list at all** → `Other Schengen` |
| "Education loan planned" | `Education loan` |

**Every one would have failed silently** — the record saves, the field stays empty, and `leadToPlan`
plans against a blank budget. **Fixed: every option now shows a human label and emits the CRM value.**

**The rule going forward: the form is the CRM's mirror.** If a picklist changes, the form changes the
same day, or leads arrive half-empty and nobody notices until a shortlist is wrong.

## Field → CRM mapping

**Every field lands in an existing Leads field. No transformation, no new CRM work.**

| Form field | Leads field |
|---|---|
| Full name | `Last_Name` |
| WhatsApp | `WhatsApp_Number` · `Phone` |
| Email | `Email` |
| City / district | `City` |
| Studying now | `Current_Education` |
| Percentage / CGPA | `Academic_Percentage` |
| Backlogs | `Backlogs` |
| Study gap | `Study_Gap_Years` |
| Work experience | `Work_Experience_Years` |
| English test | `English_Status` |
| **Passport** | **`Passport_Status`** |
| Total budget | `Budget_Range` |
| **Family income** | **`Parents_Annual_Income`** |
| Funding | `Funding_Source` |
| Level | `Interested_Level` |
| Intake | `Intended_Intake` |
| Countries | `Interested_Country` |
| Accommodation | `Accommodation_Preference` |
| **Referred by** | **`Lead_Source_Detail`** — the trust-node name |
| Notes | `Description` |

## The three fields that matter most, and why

| | |
|---|---|
| **Passport** | A student without one cannot reach a near intake, whatever else is true. **Ask it before anything else** |
| **Family income** | Italy's DSU is means-tested on income, not marks. **Without it we cannot tell a low-income family about the one scholarship built for them** |
| **Referred by** | The trust node's name. **It is how the Trust Multiplier Score is computed and how we know who to thank** |

## What the form deliberately does NOT do

- **No "chances" question. No prediction.** Constitution 12
- **No cost quoted on the page.** The number depends on answers we do not have yet
- **No urgency tricks, no countdown, no "limited seats"**
- **It says free three times, and means it**
