# COUNTRY-REQUIREMENT-GAPS.md — 2026-08-23

**Gap report only. No schema changed.** Each row is a requirement that is real, material to a
student's timeline or money, and **not represented anywhere in the CRM**.

## Italy

| Requirement | In CRM? | Impact if missing |
|---|---|---|
| **Regional DSU bando deadline** (distinct from the university deadline) | **NO** | The bando closes **first** and forfeits €14–16k. `Next_App_Deadline` holds only the university's date |
| Regional body (ER.GO / EDISU / ERDIS / ERSU) | **NO** | The body decides process, not the university |
| ISEE Parificato required in advance? | **NO** | Differs by region — the hardest step where it applies |
| Consular documents legalised by Prefettura | **NO** | Months of lead time; late = total ineligibility |
| ISEE threshold (ER.GO: €25,000) | **NO** | Determines eligibility before anything else |
| Accommodation capacity | **NO** | A *fuori sede* grant without a bed is partial |
| Residence permit window: **8 days** | Documented in SOP-10, **not a field** | Legal right to remain |
| Year-two credit compliance | **NO** | Loses the grant annually |

## Germany

| Requirement | In CRM? | Impact if missing |
|---|---|---|
| **APS certificate** (mandatory for Indian applicants) | **NO** | Takes **months**. Any German recommendation without it understates the timeline and can cost the intake |
| Blocked account **€11,904/yr** | Captured as living cost ✅ | Cash to *arrange*, not spend — different from cost |
| Semester fee | **NO** | Minor but real |
| One-time registration fee (IU: €1,500) | **NO** | Material at private institutions |
| Public vs private distinction | **NO** field | Drives affordability and verifiability, and is the single best predictor of both |

## Hungary

| Requirement | In CRM? | Impact if missing |
|---|---|---|
| **Per-programme deadlines** (PTE confirmed) | Partly — one date per record | A record-level date can be wrong for the programme the student wants |
| Stipendium Hungaricum eligibility | **NO** | A funded route not currently modelled |
| Residence permit window: 30 days | SOP-10, not a field | Legal |
| Entrance/application fee | Field exists, mostly empty | Non-refundable cost a family must be told before applying |

## The three gaps that would change a recommendation today

1. **Italy: the DSU bando deadline.** The engine would show a university deadline as *the*
   deadline while the money-forfeiting one passed earlier. **This is the most dangerous gap
   in the system** — it is exactly the class of error `caseState` treats as a hard block, but
   the data does not exist to detect it.
2. **Germany: APS.** Months of hidden lead time on every German recommendation.
3. **Public/private flag.** One boolean that predicts affordability *and* verifiability, and
   would have let the portfolio be tiered without reading 21 records by hand.

## Recommendation
Do not recommend **Italy** or **Germany** to any student until gaps 1 and 2 are modelled.
Hungary is safe today with the per-programme caveat already recorded on the Pécs record.

**Schema change is a separate, scoped decision.** Adding fields now, mid-pilot, would change
what `matchOpportunities` sees without a regression pass behind it.
