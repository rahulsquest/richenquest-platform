# File 71 — Value-based pricing architecture

**Supersedes File 70.** Pricing by intake was wrong — a family does not buy "February", it buys an
outcome. This prices the work.

---

## 1. The principle

> ### RichenQuest charges for deliverables it controls. It never charges for outcomes it does not.

| We control — chargeable | We do not control — never a payment trigger |
|---|---|
| A complete, correct application submitted before the deadline | Whether the university says yes |
| A complete visa file, correctly assembled, filed in time | Whether the consulate approves |
| **A DSU application submitted before the regional deadline** | **Whether DSU is awarded** |
| A residence permit filed inside the legal window | Processing speed |

**This is why the stage gates sit where they do**, and it is the whole difference between a fee that
survives a refusal conversation and one that does not.

## 2. The packages

**Loaded delivery cost: ₹398/hour** — ₹30,000/month salary, 176 hours, 60% billable, +40% overhead.
**CAC ₹1,667/student** — ₹5,000 per seminar ÷ 3 conversions. **Both are stated assumptions, to be
replaced with real data by student 30.**

| | Package | Effort | Price | Delivery cost | **Contribution** |
|---|---|---:|---:|---:|---:|
| **P0** | **Clarity Report** | 3 h | **₹2,500** | ₹1,193 | **see §3** |
| **P1** | **Admission** | 12 h | **₹35,000** | ₹4,773 | **₹28,561 · 82%** |
| **P2** | **Admission + Visa** | 25 h | **₹60,000** | ₹9,943 | **₹48,390 · 81%** |
| **P3** | **Scholarship — Italy DSU** | 45 h | **₹1,20,000** | ₹17,898 | **₹1,00,436 · 84%** |
| **P4** | **Complete Launch** | 55 h | **₹1,60,000** | ₹21,875 | ₹1,36,458 · 85% |
| **A1** | Post-Arrival add-on | 8 h | **₹25,000** | ₹3,182 | ₹20,152 · 81% |

### Deliverables, outcome, and when money changes hands

**P0 — Clarity Report · ₹2,500**
**Deliverables:** True Cost report with every figure sourced and dated · verified shortlist with
reasons for inclusion **and exclusion** · timeline with the last safe visa filing date · risk list ·
what we have not verified.
**Measurable outcome:** *the family can make a decision they could not make before* — including the
decision not to go.
**Charged:** in full, up front. **Fully credited against any package bought within 60 days.**

**P1 — Admission · ₹35,000** · ₹10,000 on engagement → **₹25,000 on offer received**
**Deliverables:** application management to 3 universities · document preparation and review ·
university liaison · country pre-step (Universitaly / APS / AVATS / e-Konsulat) · deadline tracking.
**Outcome:** an offer in hand. **75% of the fee is contingent on it.**

**P2 — Admission + Visa · ₹60,000** · ₹15,000 engage → ₹25,000 on offer → **₹20,000 on visa decision**
**Deliverables:** all of P1 · visa file assembly · appointment support · interview preparation ·
document deficiency handling · backward-planned timeline.
**Outcome:** a complete visa file, filed before the last safe date.
**⚠️ The final stage is waived if a refusal is attributable to a documentation error of ours.**
**We do not charge for our own mistakes.**

**P3 — Scholarship, Italy DSU · ₹1,20,000** · ₹20,000 engage → ₹40,000 on offer → **₹40,000 on DSU application submitted** → ₹20,000 on visa decision
**Deliverables:** all of P2 · **ISEE Parificato coordination** · regional DSU deadline management ·
DSU application preparation and submission · document translation coordination.
**Outcome: the DSU application is submitted, complete, before the regional deadline.**
**Explicitly NOT the award.** Against a grant worth **€14–16k/year**, a ₹1.2 lakh fee is a
straightforward conversation — but the family must be told, in writing, that we are paid for the
submission and not the result.

**P4 — Complete Launch · ₹1,60,000** — P3 plus accommodation, arrival, residence permit, tax number,
bank account. **Outcome: permit filed inside the legal window** (Italy 8 days, Hungary 30, Malta 3
months) **and a working bank account.**

**A1 — Post-Arrival · ₹25,000** — for students admitted elsewhere. **The stage every competitor stops
at.**

## 3. What the arithmetic caught

**P0 at ₹2,500 has NEGATIVE contribution — minus ₹360 — once acquisition cost is loaded onto it.**

**So P0 is not a product. It is an acquisition instrument**, and its CAC belongs to the package that
follows it, not to itself.

**Resolution: P0 is priced at ₹2,500 and credited in full against any package within 60 days.**

| It does three things at once | |
|---|---|
| **Filters** | A family that will not pay ₹2,500 will not pay ₹60,000. **It removes tyre-kickers before they consume 3 counsellor hours** |
| **Commits** | Having paid, the family is invested — a well-documented effect on conversion |
| **Costs nothing on conversion** | Credited in full |

**And it lets RichenQuest do the honest thing profitably**: telling a family *"Europe does not work on
your budget"* is currently unpaid work. **At ₹2,500 it is a service, delivered properly, and the
family leaves with something worth having.**

## 4. Mix matters more than price

| 100 students | Revenue |
|---|---|
| All P2 | **₹60 lakh** |
| 60% P2 · 20% P1 · 20% P3 | ₹67 lakh |
| **Italy-led: 50% P3 · 30% P2 · 20% P1** | **₹85 lakh** |

> **The same 100 students are worth ₹25 lakh more if the mix is Italy-led.** That is the commercial
> case for Italy stated in revenue rather than in student benefit — and it is a 42% swing from mix
> alone, with no change to price or volume.

## 5. Optimising on real data — students 1 to 30

**Every number above is an assumption until students prove it.** Four things get measured, and each
has a decision rule attached **before** the data arrives, so the rule is not written to fit the result.

| # | Measure | Decision rule |
|---|---|---|
| **1** | **Quote → close rate, per package** | **>60% → the price is too low, raise 20%.** **<25% → too high, or the wrong package was offered.** 25–60% is correct |
| **2** | **Effort variance** — actual hours vs estimate | **>40% over on any package → the price is wrong, not the counsellor.** This is what silently destroys margin |
| **3** | **Stage completion** — how many reach offer, visa, DSU | A stage nobody reaches is a stage we should not be charging at |
| **4** | **Where the objection lands** — the number they push back on | If it is always the engagement fee, the problem is trust, not price |

**Instrumentation, using fields that already exist:** `Service_Package` on the Student Case records
which package · stage gates map to existing pipeline stages · `Lead_Source_Detail` gives CAC by
channel. **No new CRM work is required to measure any of this.**

**Review at student 10, 20 and 30. Do not change prices before student 10** — under ten data points
any pattern is noise.

## 6. What is deliberately not in this architecture

| Not doing | Why |
|---|---|
| Discounts for early payment | Trains families to negotiate. **The staged structure is already the concession** |
| Commission-funded free counselling | It is the competitor model and the reason they cannot tell a family the truth |
| Success fees on scholarships | **We would be charging for an outcome we do not control.** §1 |
| Different prices by intake | **The error this file corrects** |
| Price differentiation by university | Invites the question *"are you recommending this because it pays you more?"* — the exact suspicion True Cost exists to defeat |

**All prices in force from today unless vetoed. Reversible at student 10.**
