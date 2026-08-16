# File 48 — The operating system

**Phase 10.** The brief's primary goal is one sentence: *a counsellor should be able to onboard a new
student and receive a complete action plan within 60 seconds.* Everything below is measured against
that, not against the eight sub-phase headings.

---

## 1. Is the primary goal met?

**Yes, with one honest qualification.**

One call to `studentActionPlan` returns a shortlist, the reason each university is in or out,
scholarship routes, an indicative timeline with the last safe visa filing date, the document list,
risk factors, counselling notes, parent talking points, and an explicit list of what is not known.

**The qualification: the plan is only as wide as the verified data behind it.** RichenQuest holds 20
universities and **3 are verified**. The engine will not recommend the other 17, so today a plan is
fast, honest, and narrow. **Speed was the easy half. The remaining work is verification, and it is
per-university human research that no amount of engineering shortens.**

### Measured behaviour

Four profiles, run live against the deployed function:

| Profile | Result |
|---|---|
| ₹15L · Masters · Feb 2027 · **no English test** · 3-yr gap | Debrecen shortlisted — *waiver route, workable with no certificate*. EU excluded — *no waiver route published* |
| ₹45L · Bachelors · Feb 2027 · IELTS 6.5 | Both shortlisted. The affluent case is the only one where EU appears |
| ₹15L · Masters · **Sep 2026** | **WARNING: the last safe filing date for this intake has already passed** |
| ₹15L · Masters · Feb 2027 · **country = Italy** | **Empty shortlist, and a risk that says so**: *"NO VERIFIED UNIVERSITY MATCHES. Do not improvise one."* |

**The fourth case is the one that matters.** An empty result that refuses to improvise is the whole
design. A matcher that filled that gap with a plausible Italian university would be inventing exactly
what the brief forbids, at the exact moment a family is most likely to believe it.

## 2. Phase 10.1 — University Intelligence

23 fields added to Accounts. The split is deliberate:

| Structured — machine-comparable | Narrative — never machine-matched |
|---|---|
| Intakes · levels · tuition min/max · living cost · application fee · IELTS UG/PG · **English waiver route** · max study gap · scholarships · graduate work months · agent programme · commission status · next deadline · offer time · **university country** | `Intelligence_Profile` — required documents, accommodation, employability, caveats, currency notes |

**Mandated metadata on every record: `Verified_On`, `Source_URL`, `Confidence`, `Review_Date`.**

### The verification gate

> **Only `Confidence` High or Medium is visible to automation. Everything else is visible to humans
> and invisible to the matcher.**

Current state: **EU Business School High · Debrecen Medium · Global College Malta Low · 15 others
Unverified.** That is not a backlog to be embarrassed about — it is the system refusing to launder
unresearched records into student advice.

**`English_Waiver_Route` is the highest-value field in the schema** for RichenQuest's demographic,
because a large share of candidates hold no English test at all. It is the field that decides whether
a student has any option, and it is the reason Debrecen beats a nominally better-ranked school.

### Currency honesty

Debrecen prices in **USD**; the structured fields are EUR. The conversion (1 USD = 0.92 EUR, dated)
is recorded in the profile with the instruction **"the invoice is in USD — quote USD to families, not
the converted figure."** A converted number that reaches a family as a quote is a wrong quote.

## 3. Phases 10.2, 10.3 and 10.6 — one function, not three

A counsellor sitting with a family needs **one answer, not three reports to reconcile.** So matching,
the application plan and the sales copilot output are a single call.

### There is no score, deliberately

Universities are bucketed — **Strong fit · Possible, read the caveats · Excluded, with the reason** —
never scored.

> **A number implies a precision that does not exist, and it invites the question "so what are my
> chances?" — which this platform must never answer. A counsellor can defend a reason. Nobody can
> defend a 73.**

### The excluded list is a feature

Every rejected university carries its reason, in plain language: *"student asked for Italy; this is
Hungary"*, *"year one alone is approx ₹12.8 lakh against a total budget of ₹15 lakh"*, *"no February
intake"*. **Reading those out when a family asks about a university they have heard of builds more
trust than the shortlist does.** It is also the only defence against the accusation every consultancy
faces — that the shortlist is really a commission list.

### Pricing — partially blocked

10.6 asks for a pricing explanation and a payment plan. **F1 is still open: the fee is not set.**
Everything else in the copilot is built; the price is a parameter waiting for one founder decision.
File 40 recommends ₹1,20,000 for the first ten students.

## 4. Phase 10.4 — Partnership intelligence: what I built and what I did not

**Built:** contact history (`logPartnershipContact`), lifecycle (`Partnership_Stage`,
`Agreement_Status`, expiry), the renewal sweep, `partnershipKPIs`, and now commission status as a
first-class field.

**Not built: relationship health and opportunity score.** Both would be computed from meeting
frequency, response latency and commission performance.

**RichenQuest has zero signed agreements, zero commission data, and a contact history that is one
outreach wave that has not been sent.** A health score over that is a score over nothing — it would
render as a confident number derived from an empty table, which is worse than a blank field because
it looks like information.

> **Response SLA is the one metric here that will be real the moment F3 is sent**, because it is
> measured from RichenQuest's own timestamps rather than from the partner's behaviour. It becomes
> meaningful on the day the first reply arrives, and not before.

## 5. Phase 10.5 — Content engine

The rule, and it is the whole of the design:

> **Every claim in every asset must trace to a verified field on a university record or to
> `claims.json`. Nothing else may appear, in any format, ever.**

`marketing/debrecen-feb-2027-content-pack.md` is the first pack: 12 asset types, all 12 sourced,
**all 12 unapproved.** It is built for Debrecen because Debrecen is the one university RichenQuest
can currently sell to its core demographic — which is exactly what "research only what is needed"
means.

**Not generating packs for the other 19.** Fourteen would be built on Unverified records, and the
content engine would become the laundering mechanism the verification gate exists to prevent.

## 6. Phase 10.7 — Operations watch

`opsWatch`, daily 06:30, **silent when clear.** Six sweeps:

| Watch | Why it earns its place |
|---|---|
| Visa risk Amber/Red | The case looks fine. The intake is gone |
| Overdue `Next_Deadline` | — |
| **Appointment booked, documents incomplete** | SOP-1's gate was skipped. A counter rejection costs the **slot**, not the day |
| **Awaiting Slot** | The one state needing a manual portal check. Named so the workload is assignable, not invisible |
| **Stale university records** | Past `Review_Date` and still being offered to students |
| **Confidence without `Verified_On`** | A confidence rating with no evidence behind it |

**Verified by probe, not by assumption.** A clean run reports `flags: 0` and sends nothing — which
proves it runs, not that it detects. Two probe cases tripped four of the six sections and fired the
alert; both were deleted and the sweep returned to silent.

**It deliberately does not re-run `visaOpsPlan`.** A watcher that also recomputes would hide a
failure of the thing it is watching.

## 7. Phase 10.8 — Analytics: the honest position

The brief asks for ten executive dashboards and says **"no speculative metrics."** Those two
instructions are in tension, and the second one wins.

| Dashboard | Data behind it today | Verdict |
|---|---|---|
| Applications · Offers · Visas · Revenue · Lead conversion · Counsellor productivity | **zero rows** | **Not built.** An empty dashboard is not a neutral placeholder — it is a daily reminder that renders as a management artefact |
| Country demand · University demand · Scholarships | zero rows | Not built |
| Partnership performance | 20 accounts, 0 agreements | **Covered by `partnershipKPIs`** |
| **University data quality** — verified vs unverified, stale vs current | **20 rows, real today** | **Covered by `opsWatch`** |
| Platform health, quota, regression | real | **Covered by `platform-health.sh`** |

> **Building ten empty dashboards would produce something that looks like an operating system and
> measures nothing.** The three that have data are already covered by tools that push rather than
> wait to be opened — which is the better design at this size anyway.

**The trigger to build them is the first ten students, not the next brief.** At that point conversion
and counsellor productivity become measurable rather than decorative, and the dashboards will be
built against real distributions instead of guessed ones.

## 8. What is actually blocking the operating system

Not engineering. The platform now onboards a student in one call, plans their visa backwards from the
intake, watches every clock daily, and refuses to advise on unverified data.

| Blocker | Type | Effect |
|---|---|---|
| **17 unverified universities** | research — **and I can do this** | Every plan is narrow until they are verified. This is the highest-value remaining work |
| **F1 — the fee is unset** | founder decision | The sales copilot cannot produce a proposal or a payment plan |
| **F3 — Wave 1 unsent** | founder action | Partnership intelligence has nothing to measure |
| **Commission unknown, all 20** | partner negotiation | Changes ranking, changes nothing for the student |
| **V2 — Poland slot schedule** | verification | The only predictable slot timing in the portfolio |

**The honest executive line, unchanged across several reviews: the constraint is no longer the
system.** It is verified university data, one price, and one send.
