# RichenQuest — Finance Setup v1.0

## 1 · Invoice numbering

```
RQ/INV/26-27/0001
│   │    │      └─ sequential, never reused, never skipped
│   │    └──────── Indian financial year, resets to 0001 each 1 April
│   └───────────── document type: INV, RCT, EST (estimate/proposal), CRN (credit note)
└───────────────── entity prefix
```

**Rules.** Sequential with no gaps — a missing number is an audit question. Never reuse a
number, even for a cancelled invoice; cancel it and issue a credit note. Never issue an
invoice before the work stage it covers has started.

## 2 · Receipt numbering

`RQ/RCT/26-27/0001` — its own series, independent of invoices. One receipt per payment
received, issued **within 24 hours**, referencing the invoice it settles. A part-payment
gets its own receipt.

## 3 · Package codes

| Code | Package | Covers |
|---|---|---|
| `RQ-GUID` | Guidance | Profile assessment, shortlist with true costs, document checklist |
| `RQ-STD` | Standard | Guidance + applications to up to 5 universities + offer support |
| `RQ-COMP` | Complete | Standard + visa file preparation + pre-departure + arrival support |
| `RQ-VISA` | Visa only | Visa file preparation for a student with an offer already in hand |

> **FOUNDER DECISION REQUIRED — the fee for each package.** Not written here, and not
> guessed. A published price the founder has not set is a price the company is bound to.
> Set these before the first Service Agreement is signed.

## 4 · Payment stages

Fees are never taken in one payment up front. A family who has paid everything has no
leverage and we have no incentive.

| Stage | Trigger | Share of package fee |
|---|---|---|
| 1 · Engagement | Service Agreement signed | 25% |
| 2 · Applications | First application submitted | 35% |
| 3 · Offer | First offer received and accepted | 25% |
| 4 · Visa file | Visa file complete and handed over | 15% |

No stage is invoiced before the previous stage is delivered. Third-party fees (application
fees, deposits, visa fees, insurance) are **paid by the student directly** and never
routed through us — collecting them creates a trust liability and a tax question with no
benefit.

## 5 · Refund workflow

1. Claim received at the official email, quoting the case number.
2. Acknowledge within **3 working days**.
3. Operations pulls the audit timeline (`Case_Events`) and the stage reached.
4. Apply the Refund Policy table. **Check §4.4 first**: if the timeline shows we advised
   the student to proceed after the last safe filing date had passed, it is a 100% refund
   and no further assessment is needed.
5. Founder approves. Decision communicated in writing within **15 working days**.
6. Paid within **15 working days** of the decision, to the originating account only.
7. Credit note issued. Case closed with reason recorded.

## 6 · Revenue recognition

Revenue is recognised **when the stage is delivered**, not when cash arrives. Money
received for a stage not yet delivered is a liability, not income. This matters because a
refund claim against unrecognised revenue is a balance-sheet entry; against recognised
revenue it is a loss.

| Stage delivered | Recognise |
|---|---|
| Agreement signed and shortlist delivered | Stage 1 |
| First application submitted | Stage 2 |
| Offer received and accepted | Stage 3 |
| Visa file handed to the student | Stage 4 |

## 7 · Zoho Books configuration checklist

- [ ] **Take the organisation out of test mode.** Until this is done no real invoice exists.
- [ ] Set financial year to **1 April – 31 March**
- [ ] Set base currency **INR**; enable EUR/USD for reference only
- [ ] Invoice series `RQ/INV/26-27/` starting 0001; disable auto-generated defaults
- [ ] Receipt (payments-received) series `RQ/RCT/26-27/`
- [ ] Create the four items from §3 with the founder's agreed prices
- [ ] Create income accounts: Consultancy Fees, Visa Support Fees
- [ ] Payment terms: **Due on receipt**
- [ ] Bank account linked and reconciled
- [ ] Invoice template carries entity name, address, GSTIN or exemption note, and the
      refund clause reference
- [ ] Enable customer payment reminders at 3 and 7 days
- [ ] Add the CRM ↔ Books link so an invoice attaches to the Student Case

## 8 · GST

> **FOUNDER DECISION REQUIRED.** Whether {{GSTIN}} applies depends on registration status
> and turnover. Two things must be settled with a chartered accountant before the first
> invoice:
>
> 1. **Registration.** Services to Indian residents are ordinarily taxable; the threshold
>    for services is turnover-based. Below it, registration is optional.
> 2. **Place of supply.** Where a service relates to a foreign university but the
>    recipient is in India, the place of supply and any export-of-services treatment must
>    be determined — this changes whether GST is charged at all.
>
> Until answered, invoices must carry either a valid GSTIN or an explicit exemption note.
> **An invoice that is silent on GST is the one that causes a problem later.** Do not
> guess, and do not copy another consultancy's invoice.
