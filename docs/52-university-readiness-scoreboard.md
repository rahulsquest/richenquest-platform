# File 52 — The University Readiness Scoreboard

**Priority 8 asks three questions at the end of every batch. This file answers them with a number
instead of an opinion, and the answer today is uncomfortable.**

---

## 1. The result

> ### 0 universities are READY. 1 is one email away. 3 need real work. 18 are not in the portfolio at all.

| University | Status | Research | Counselling | Marketing | Partnership | Application |
|---|---|---:|:---:|:---:|:---:|:---:|
| **University of Debrecen** | 🟡 **PARTNER PENDING** | **87%** | ✅ | ✅ | ❌ | ✅ |
| EU Business School | 🟠 NEEDS VERIFICATION | 75% | ✅ | ✅ | ❌ | ❌ |
| Vistula University Warsaw | 🟠 NEEDS VERIFICATION | 62% | ❌ | ❌ | ❌ | ❌ |
| Global College Malta | 🟠 NEEDS VERIFICATION | 25% | ❌ | ❌ | ❌ | ❌ |
| University of Pécs · University of Szeged | ⚪ NOT IN PORTFOLIO | — | — | — | — | — |
| 16 others | ⚪ NOT IN PORTFOLIO | — | — | — | — | — |

**This is computed, not asserted.** `readinessSweep` derives every cell from which fields are
actually populated and rewrites the status on every run.

> **A readiness flag a human can simply tick is a vanity flag.** It goes green the week someone is
> optimistic and stays green after the data rots. **The only way to turn a university green here is
> to find the missing evidence.**

It now runs **daily at 08:00**. The brief asked for a Friday review; the *review* is a human activity
on Friday, but the *computation* costs nothing daily and means the Friday review reads a current
board rather than a six-day-old one. **A university that goes stale falls out of READY by itself.**

## 2. Priority 8, answered honestly

### Debrecen — the only serious February candidate

**1. Can a counsellor confidently sell it today?** **Yes.** Tuition, intakes, English requirement,
gap policy, scholarships and fees are all verified, and the interview waiver route is the strongest
single fact in the portfolio for this demographic.

**2. Can marketing confidently promote it today?** **Yes, with one asterisk** — the 1 Nov 2026
deadline is still `VERIFICATION PENDING` and appears in six of the twelve content assets. The pack
already carries the instruction to swap in *"applications close in early November"* if it cannot be
confirmed.

**3. Would I recommend it to a sibling?** **Yes** — and this is the only university in the portfolio
where I would say that without qualification. ~₹6.5–7 lakh/yr, IELTS 5.5 with an interview route for
a sibling holding no certificate, a 4-year gap allowance, and three reachable discounts.

**Missing evidence:** living costs, and commission/agent programme. **Only the first affects the
student.** The second affects only our margin — which is precisely why Debrecen is *PARTNER PENDING*
rather than *NEEDS VERIFICATION*: **the remaining gap is the partner's to close, not the student's to
suffer.**

### EU Business School

**1. Sell it?** Only to a family with ₹35 lakh+. **2. Promote it?** Only to that segment — and
promoting it to the core list would be actively harmful. **3. Recommend to a sibling?** **No** — not
on a ₹10–25 lakh budget, with no institutional scholarship to bridge the gap.

**Missing:** the application deadline, which is why it fails APPLICATION readiness.

### Vistula

**1. Sell it?** **No** — and the reason is a single field. **Tuition is unverified**, because their
own fee page publishes no figures. Everything else is strong: MOI waiver, 2–3 day offers, MSWiA
authorisation.

**3. Recommend to a sibling?** **I would want to** — secondary sources suggest it may be the cheapest
option available. **That is exactly why I will not say it.** An unverified low price is the most
damaging number in this business, because the family budgets on it and then discovers the truth after
they have committed.

### Global College Malta

**1/2/3: No, no, no.** 25% research, no February intake, Low confidence. **It is an existing partner
with no data, which is the most misleading combination there is** — the relationship implies a
knowledge we do not have.

## 3. What the scoreboard changed about how the system behaves

**Marketing readiness is gated on counselling readiness, deliberately.**

> **We will not advertise a university a counsellor cannot yet discuss.** That one dependency is what
> stops the content engine from writing cheques the counselling team cannot cash — the classic
> failure of every agency that markets faster than it learns.

Combined with the existing confidence gate in `studentActionPlan`, there are now two independent
locks: **a university invisible to the matcher cannot reach a student, and a university invisible to
counselling cannot reach an advert.**

## 4. The pattern in the missing evidence

**Three gaps account for almost everything red on this board**, and they are the same three every
time:

| Gap | Universities affected | Who can close it |
|---|---|---|
| **Living costs** | **all four** | Me — research, and it is now the top research task |
| **Commission / agent programme** | **all four** | **Only the partner.** One email each |
| **Tuition** | Vistula, Malta | Vistula: one email. Malta: full research |

**Not one of these needs a new feature.** Two need emails and one needs a research pass. **That is
the whole distance between a 0-READY portfolio and a working February campaign**, and it is worth
saying plainly after fourteen phases of building.

## 5. On the 10-university target

**The brief caps the portfolio at 10 and says only fully verified universities may enter.** Those two
rules together mean the realistic February 2027 portfolio is:

| Tier | Universities |
|---|---|
| **Sellable now** | **Debrecen** — 1 |
| **One email away** | Vistula, Pécs — 2 |
| **Segment-specific** | EU Business School (affluent only) — 1 |
| **Needs a research pass** | Szeged, Malta — 2 |

**A realistic ceiling of 5–6 genuinely READY universities for February 2027, not 10.** Padding to ten
would mean admitting universities that fail the sibling test, and the scoreboard would show it
anyway.

## 6. Pipeline additions this pass

**University of Pécs** and **University of Szeged** entered the CRM as `Unverified` — visible to
humans, invisible to the matcher and to marketing.

- **Pécs** runs a **published "Representatives in your Country" programme** — it meets the agency-friendly criterion outright, which very few in the portfolio do. Its official pages publish no dates or fees; they route to `international@pte.hu`. **One email could move it from Unverified to counselling-ready *and* open the partnership, because the commercial conversation already has a front door.**
- **Szeged** reports a **€35 application fee** — against Debrecen's USD 500, the lowest barrier to apply in the portfolio — and a published spring **instalment schedule** (50% by 10 Feb, 75% by 10 Mar, 100% by 10 Apr). **If confirmed, that instalment structure is a real cash-flow advantage for exactly the families RichenQuest serves.** But the figures found so far come from aggregators and from the *medical* faculty's fee pages, which are not representative of the programmes we would recommend. **Mixing them would produce a badly wrong number, so nothing is recorded as verified.**

## 7. Founder actions

| # | Action | Type | Priority |
|---|---|---|---|
| **P14-1** | **One email to each of Debrecen, Vistula, Pécs** asking commission terms and agent-programme access | outreach | **P1** — closes the single gap blocking READY on all three |
| **P13-1** | Pécs: `international@pte.hu` — spring programme list, fees, deadlines, Representatives terms | outreach | **P1** |
| **P12-1** | Vistula: `cooperation@vistula.edu.pl` — official 2027 fee schedule | outreach | **P1** |
| **F-NEW-1** | Confirm Debrecen's 1 Nov 2026 deadline | verification | **P1** |
| **F1** | Set the fee | decision | **P1** |
