# Opportunity Verification Requests — prepared 2026-08-23

Four emails. Each asks **only** for the fields the data-quality report proves are missing.
No pleasantries about partnerships, no agent enquiry — a short factual request gets answered;
a sales email does not.

**Do not create placeholder values while waiting.** The record stays non-rankable until a
reply arrives. That is correct behaviour, not a gap to paper over.

---

## 1 · University of Pécs — `international@pte.hu`
**Missing:** living cost, application deadline · **Have:** tuition (verified 2026-08-23)

> **Subject: Living cost estimate and application deadline — English-taught master's, 2027 intake**
>
> Dear International Centre,
>
> We are an education consultancy in Patna, India advising students on English-taught
> programmes at Pécs. We have your published tuition from
> international.pte.hu/admission/fees.
>
> Two things we could not find published:
>
> 1. Your current estimate of monthly or annual **living costs** for an international
>    student in Pécs.
> 2. The **application deadline** for the February 2027 and September 2027 intakes.
>
> We quote families a full first-year cost with the source of every figure, so we would
> rather cite you than estimate.
>
> Thank you,
> Rahul Kumar · RICHENQUEST PVT LTD · Boring Road, Patna, Bihar, India
> support@richenquest.com · +91 76312 07948

---

## 2 · Budapest Metropolitan University — `admission@metropolitan.hu`
**Missing:** living cost, application deadline · **Have:** tuition + IELTS (verified 2026-08-17)

> **Subject: Living cost estimate and February 2027 deadline**
>
> Dear Admissions,
>
> We advise Indian students on English-taught programmes and have your published tuition
> from metropolitan.hu/en/tuition-fees.
>
> 1. Do you publish a **living-cost estimate** for international students in Budapest? We
>    have seen the figure of around EUR 500 per month on your site, but we would like a
>    costed breakdown we can cite rather than a general statement.
> 2. Your site lists Fall 2026 deadlines only. What is the **application deadline for the
>    February 2027 intake** for non-EU applicants?
>
> Thank you,
> Rahul Kumar · RICHENQUEST PVT LTD · support@richenquest.com · +91 76312 07948

---

## 3 · Vistula University Warsaw — `cooperation@vistula.edu.pl`
**Missing:** current tuition, application deadline · **Have:** living cost

> **Subject: Current tuition schedule and 2027 intake deadlines**
>
> Dear Admissions,
>
> The most recent tuition schedule we can find publicly is your 2023/24 PDF. We do not quote
> stale figures to families.
>
> 1. Your **current tuition** for English-taught bachelor's and master's programmes for
>    non-EU students, 2026/27 or 2027/28.
> 2. The **application deadlines** for the February 2027 and October 2027 intakes.
>
> Thank you,
> Rahul Kumar · RICHENQUEST PVT LTD · support@richenquest.com · +91 76312 07948

---

## 4 · University of Debrecen — `info@edu.unideb.hu`
**Missing:** nothing — this is a **confirmation**, not a gap
**Have:** tuition, living cost (USD 800/mo published), deadline 2026-11-01, domains

> **Subject: Confirming the 1 November 2026 application deadline**
>
> Dear Admissions,
>
> We currently advise students using these figures from your published pages: tuition from
> EUR 5,520/year, living costs based on your published USD 800 per month, and an application
> deadline of **1 November 2026**.
>
> Could you confirm that deadline still stands for the February 2027 intake, and that the
> living-cost figure is current?
>
> Thank you,
> Rahul Kumar · RICHENQUEST PVT LTD · support@richenquest.com · +91 76312 07948

---

## Ops tracking — update the CRM when replies arrive

| # | Record | Fields to set on reply | Effect |
|---|---|---|---|
| 1 | University of Pécs | `Living_Cost_EUR_Year`, `Next_App_Deadline`, `Verified_On` | **→ rankable** |
| 2 | Budapest Metropolitan | `Living_Cost_EUR_Year`, `Next_App_Deadline`, `Verified_On` | **→ rankable** |
| 3 | Vistula Warsaw | `Tuition_Min/Max_EUR_Year`, `Next_App_Deadline`, `Source_URL`, `Verified_On` | **→ rankable** |
| 4 | Debrecen | `Verified_On` refresh only | stays rankable |

**All four replies → fully rankable goes from 1 to 5.**

Also set `Domains_Offered` + `Domains_Source` for Vistula if the reply names its faculties
(+20 points of score confidence, does **not** affect rankability).
