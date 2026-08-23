# Payslips and Stipend Statements — READ BEFORE BUILDING ANYTHING

## 🔴 The employee payslip is NOT a template task

**Use Zoho Payroll. Do not build this as a letter template.**

A payslip is a financial record. If it is assembled from hand-typed fields it is not a record
of anything — it is a document that looks like one. Every figure must come from a configured
salary structure and a real pay run.

### Audit these in the console before proceeding

| # | Question | If NO |
|---|---|---|
| 1 | Is **Zoho Payroll** subscribed and configured? | **STOP.** No payslip exists to generate |
| 2 | Are salary structures defined per employee? | STOP |
| 3 | Are **PF / ESI / PT / TDS** enabled, or is the org below threshold? | **Show no statutory line at all.** Never print a zero or an invented deduction |
| 4 | Has a pay run actually been processed? | A payslip before a pay run is fiction |

**Never manufacture:** PF · ESI · TDS · professional tax · bonus · any deduction.
If a component is not configured, **it does not appear on the document**. An absent line is
honest; a fabricated one is a false financial record given to an employee and potentially to a
bank or a tax authority.

**Zoho Payroll generates and distributes payslips natively.** There is nothing to design.

---

## Intern stipend statement — only if interns are paid OUTSIDE Payroll

**Title it exactly:** `INTERNSHIP STIPEND STATEMENT`
**Never:** "Salary Slip", "Payslip", "Pay Statement".

An intern stipend is not wages. Titling it as salary misrepresents the engagement and could be
used against the company in a dispute about employment status.

---

**RICHENQUEST PVT LTD**
Boring Road, Patna, Bihar, India

## INTERNSHIP STIPEND STATEMENT

| | |
|---|---|
| Intern Name | ${Intern.First Name} ${Intern.Last Name} |
| Intern ID | ${Intern.Employee ID} |
| Internship Period | ${Internship Start Date} — ${Internship End Date} |
| Stipend Period | ${Stipend Period} |
| Payment Date | ${Payment Date} |

| Description | Amount (₹) |
|---|---|
| Gross Stipend | ${Gross Stipend} |
| Approved Deductions | ${Approved Deductions} |
| **Net Amount Paid** | **${Net Stipend}** |

*This statement records a stipend paid for a learning engagement. It is not salary or wages and
does not evidence an employer–employee relationship. No statutory deductions are applied unless
separately stated above.*

____________________
${Authorised Signatory Name} · ${Authorised Signatory Designation}

---

**If interns ARE paid through Zoho Payroll:** do not use this template. Use Payroll's own
output and rename the document type there, so the figures come from the pay run.
