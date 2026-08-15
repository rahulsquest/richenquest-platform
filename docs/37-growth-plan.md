# File 37 — Growth plan: 10 students → 100 → 10 partnerships → ₹1 crore

Written as an operating plan, not an engineering document. Every figure is either taken from
`claims.json` (verified) or labelled as a **planning assumption** to be replaced with real data
after the first 30 days of live traffic.

---

## 1. The revenue arithmetic — and a correction to the goal sequence

**Verified input:** standard package fee **₹1,80,000** (`claims.json`, "varies by destination and
scope").

```
₹1,00,00,000 ÷ ₹1,80,000  =  55.6  →  ~56 students at full fee
```

**₹1 crore does not arrive at 100 students. It arrives at about 56.**

The stated sequence — *10 → 100 → 10 partnerships → ₹1 crore* — puts the revenue milestone last,
but it is reached **before** 100 students. Corrected sequence:

```
10 students  →  ~56 students (₹1 crore)  →  100 students (~₹1.8 crore)
```

That matters for planning: **100 students is a ~₹1.8 crore business**, and the ₹1 crore milestone
should be expected around the 50-student mark, not treated as a distant goal beyond 100.

**Two caveats, stated because they change the number:**

1. Not every student pays the standard fee — the claim itself says it varies. If the real blended
   average is ₹1,20,000, ₹1 crore needs **83 students**, not 56. **Track blended average fee from
   student one**; it is the single most important number in this model and nobody knows it yet.
2. **Revenue lags signature by months.** A student signed in August may enrol the following
   September and pay in instalments. ₹1 crore of *bookings* and ₹1 crore of *collected cash* are
   different dates, likely 6–12 months apart. Plan cash on collection, not on signature.

## 2. The second revenue line nobody has priced yet

Service fees are one income stream. **University commission is the other**, and it is the entire
economic reason partnerships matter.

An agent typically earns a percentage of first-year tuition. **I will not state a rate** — it is
negotiated per institution and published nowhere reliable. But the structure is what counts:

```
Student with no partnership   →  service fee only
Student to a partner uni      →  service fee  +  commission
```

If commission approaches the service fee, **a partnered student is worth roughly twice an
unpartnered one** — and ₹1 crore then needs half the students. That is the difference between a
consultancy and an agency.

**Concrete action:** the Wave 1 outreach emails should ask the commission question early, in the
qualifying exchange. It is a normal question that partnerships desks expect, and asking it late
wastes a cycle. Suggested addition to Email 2:

> *"If a partnership is possible, could you share the commission structure and payment terms you
> offer recruitment partners for the India/Nepal market?"*

**Until commission rates are known, every revenue projection is a fee-only projection** — i.e. the
pessimistic case. That is the right way round.

## 3. Funnel model — assumptions, clearly labelled

RichenQuest has **zero funnel data**. The CRM has held no real lead since it went live. So the
numbers below are **planning placeholders**, not forecasts, and should be replaced with actuals
after 30 days.

**Assumed conversion (typical for this sector — correct these with real data):**

| Stage | Assumed rate |
|---|---|
| Lead → consultation booked | 40% |
| Consultation → signed | 25% |
| **Lead → paying student** | **~10%** |

| Target | Students | Leads needed (at 10%) | Leads/month over 6 months |
|---|---:|---:|---:|
| First 10 | 10 | ~100 | ~17 |
| **₹1 crore** | **~56** | **~560** | **~93** |
| First 100 | 100 | ~1,000 | ~167 |

**~17 leads a month gets you the first 10 students.** That is a modest, achievable number — and it
is the whole of the near-term problem.

**The most valuable measurement in the next 90 days is not revenue. It is the real conversion
rate.** Once 30 leads have been through the funnel, replace the 10% assumption with the actual,
and every number above becomes a forecast instead of a guess. The platform already records what is
needed: `Lead_Status`, case `Stage`, and `Lost_Reason` on every closed-lost case.

## 4. The binding constraint right now

Working backwards from "first 10 students":

| Requirement | Status |
|---|---|
| A way to capture leads | ✅ live and verified end-to-end |
| A CRM to work them | ✅ live, automated, audited |
| Someone to counsel them | ✅ founder can personally handle 10 |
| Universities to apply to | ✅ students can apply anywhere; partnership is not required to serve a student |
| **Leads** | ❌ **zero real leads have ever entered the system** |

**The constraint for the first 10 students is lead generation. Nothing else.**

Not the platform — it is finished. Not counselors — one person covers 10 students. Not
partnerships — a student can be served without one; partnership improves *economics*, not
*capability*.

**This is the single most important finding in this document.** Effort spent on anything other
than generating the first ~100 leads does not move the first-10 milestone.

### What that implies about sequencing

The stated order puts partnerships before revenue. **Economically, partnerships and students should
run in parallel, because they solve different problems:**

- **Students** → cash now, and the proof points that make partnership applications credible.
- **Partnerships** → better economics per student later, and access.

And there is a dependency the goal order hides: **partnership applications ask for evidence you can
only get by serving students** (§5). Serving students first makes partnerships easier. Waiting for
partnerships before recruiting students inverts the dependency.

## 5. Partnership strategy — sequence by barrier, not by desirability

**The chicken-and-egg, verified:** CBS International's agent application requires *"at least 2
references of a university you are working with"* plus a business licence (File 35 §1).
`claims.json` records `partnerships.signed: []`. **RichenQuest cannot complete that application
today** — and CBS is the *best* contact in the pipeline.

Expect the same from other established institutions. **The first partnership is structurally the
hardest; the tenth is easy.**

### Three routes past it, in order of practicality

1. **Send students first, formalise after.** Most universities accept applications from any agent
   and will discuss representation once you have sent well-prepared applicants. **This is the
   route that fits RichenQuest today** — it uses the students you are about to recruit as the
   reference you currently lack.
2. **Aggregators** (File 02 §4 already flags this). Aggregators sign small agencies without
   university references and provide access to many institutions at once, at a lower commission
   split. **Faster, cheaper to enter, worse economics** — a reasonable first partnership while
   direct ones are built.
3. **Ask directly what the requirement is.** Some of the eleven will have no reference requirement.
   Wave 1's second question — *"is there an agent application process you would like us to complete
   first?"* — surfaces this in the first exchange. Sequence by who answers "no formal process".

### Outreach priority, revised on economics rather than politeness

| Wave | Universities | Why first |
|---|---|---|
| **1** | CBS · Vistula · UE · IU · Gisma · MBS | Real partnership desks. Ask about **process and commission** in the first two emails |
| **2** | Griffith · Arden · Wittenborg · Constructor | Admissions inboxes — open by asking *who* owns partnerships |
| **3** | BSBI | General inbox; lowest signal |
| **4** | SRH · NCI · DBS · Macromedia | 20 minutes of browser research first (File 35) |

**Realistic expectation:** 11 approaches, sector-typical reply rates, and a reference requirement at
several. **Two to four live conversations is a good outcome from Wave 1**, and one signed
partnership in 90 days would be genuinely good going.

**10 partnerships is a 12–18 month goal, not a 90-day one** — unless the aggregator route is taken,
which can deliver access to many institutions through one agreement. That is the honest read.

## 6. What to do in the next 90 days

Ordered by revenue impact per hour of founder time.

| # | Action | Why | Owner | Impact |
|---|---|---|---|---|
| 1 | **Turn on one lead source** and run it consistently | Zero leads is the only thing blocking the first 10 students | founder/marketing | **Unblocks everything** |
| 2 | **Send Wave 1 outreach** (6 emails), ask process + commission | Starts the longest-lead-time workstream; answers price the whole partnership model | founder | High, compounding |
| 3 | **Record the blended average fee** from student one | ₹1 crore is 56 students at ₹1.8L and 83 at ₹1.2L. Nobody knows which | founder | Decision quality |
| 4 | **Measure real conversion** after 30 leads | Replaces the 10% assumption; makes every projection real | founder | Decision quality |
| 5 | **Research the 4 blocked universities** | 20 minutes → pipeline complete | anyone | Medium |
| 6 | **Hire counselor #1 at ~25 active students** | Founder capacity runs out there, not at 100 | founder | Prevents the ceiling |
| 7 | Backup off-machine · delete test leads · rename duplicate user | Housekeeping that gets riskier as data grows | founder | Risk reduction |

**Deliberately not on this list:** anything requiring engineering. The platform is complete for this
scale, and building more of it does not generate a single lead.

## 7. Decision framework

For every proposed activity in the next 90 days:

1. **Does it produce leads, conversations with universities, or a number we do not have?**
   If no — it is not a priority now.
2. **Does it need engineering?** If yes, it is almost certainly not the constraint. Re-check §4.
3. **Can it be claimed truthfully?** `claims.json` governs everything external. Growth pressure is
   exactly when claims get inflated, and a partnership won on an overstatement is worse than none.

### Review rhythm

Weekly (File 36 §3): overdue tasks → new leads → case stages → partnership movement.
Monthly: blended fee, real conversion rate, cost per lead, partnership replies.

**Three numbers decide whether this plan is working**, and none is revenue:

```
leads per month   ·   lead → student conversion   ·   blended average fee
```

Revenue is the product of those three. Watch them, not the total.
