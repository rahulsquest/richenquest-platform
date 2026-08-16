# The Growth Register

**Every lead source is an experiment with rules written before the data arrives.**
**Updated weekly. Owner: COO. Version 1.0 · 17 August 2026**

---

## 0. The constraint that shapes everything below

**At RichenQuest's volume, you cannot A/B test your way to an answer.**

Binary outcome, 95% confidence interval on an observed rate:

| Attempts | If the true rate is 20%, we observe | |
|---:|---|---|
| 10 | 0.0% – 44.8% | **useless** |
| 20 | 2.5% – 37.5% | **useless** |
| 30 | 5.7% – 34.3% | workable |
| 100 | 12.2% – 27.8% | reliable |

**And comparison is worse.** To separate a channel that works (25%) from one that fails (8%), the
intervals **still overlap at N = 60**.

> ### So the stop rules here are absolute and economic, never comparative.
> **"Channel A beats channel B" is undecidable at our volume. "Channel A produced zero in thirty
> attempts" is decidable** — 0/30 puts the true rate under 10% with 95% confidence.
>
> **Zero-tests and absolute floors work at small N. Rankings do not.** Any growth framework that asks
> us to compare conversion rates across channels this quarter is asking us to read noise.

**Two consequences, both binding:**

1. **Never kill a channel on a low rate. Kill it on a zero rate, or on cost per qualified lead breaching an absolute floor.**
2. **Never run more than two experiments at once.** Five people cannot run four experiments; they can only run four experiments badly, and then none of them is measurable.

---

## 0b. Trust nodes, not channels — and the ignition threshold

**A channel is a place. A trust node is a person who already holds the customer's trust.** The
register measures **people**, not platforms.

**Modelling the loop produced one non-obvious number.**

*Assumptions, stated: 250 parents reached per node forward · 1.5% enquire cold · **4.5% once that node
has produced one successful student from its own school** · 30% qualify · 25% enrol. One cycle ≈ one
intake ≈ 6 months.*

| Starting nodes | Cycle 1 | Cycle 2 | Cycle 3 | Cycle 4 | |
|---:|---:|---:|---:|---:|---|
| **1** | 0.3 | 0.8 | 1.8 | 3.5 | 🔴 **never ignites** |
| **5** | 1.4 | 4.0 | 8.8 | 17.6 | ✅ compounds |
| **13** | — | **10** | — | — | ✅ **10 students within a year** |
| 20 | 5.6 | 16.0 | 35.1 | 70.4 | ✅ |

> ### The trust network has a minimum ignition size: 4 nodes to produce one student, 13 to reach ten within a year.
>
> **Below that it does not compound slowly — it fizzles.** One node produces 0.3 students in cycle 1,
> which in reality is zero, and a loop that never produces its first student never warms a single node.

**The compounding mechanism is not student → friend.** It is: **a node that produced a student stops
forwarding a report and starts telling a story.** That is the 3× — and it is why the first student
matters far more than the first hundred leads.

**Operational consequence: contacting one teacher is not a smaller version of contacting twenty. It is
a different outcome — nothing.** E1's minimum sample of 30 is therefore not just statistical rigour;
**it is below the ignition threshold at anything less.**

## 1. The register

**Every experiment carries all six fields before it starts. An experiment without a stop rule is an
activity.**

### ⚠️ CORRECTION — E1 conflated two hypotheses

**I set one sample size for two different questions. That was wrong, and it would have wasted weeks.**

| Question | Sample needed | Why |
|---|---|---|
| *"What is the forward **rate**?"* | **30+** | Estimating a rate needs volume — §0 |
| *"Is there a universal **blocker**?"* | **12** | Unanimity needs only unanimity |

**If the true willingness rate were 20%, the chance of 12 consecutive refusals is 6.9%.** So **12
refusals citing the same reason** — *"I don't forward third-party material"* — is a **~93%-confidence
kill on the approach**, and it takes twelve conversations, not thirty.

**And if nodes forward happily but no parent enquires, the network is fine — the asset or the
call-to-action is wrong.** Killing the network there would be the most expensive mistake available.

**So E1 splits into E1a and E1b.**

### E1a · Will trust nodes forward? — 🟢 ACTIVE

| | |
|---|---|
| **Node types — discover, do not assume** | Teachers · **coaching owners** · principals · college faculty · **alumni** · **parents of past students** · career counsellors · NGO leaders. **The first working node type may not be a teacher, and the experiment must be able to find that out** |
| **Hypothesis** | A trust node will forward a free, honest report because it raises their standing and costs them nothing |
| **Success metric** | **Forwarded ÷ contacted** |
| **🛑 KILL EARLY** | **12 consecutive refusals with the same stated objection → stop and redesign the ask.** Do not continue to 30 |
| **🛑 KILL FULL** | 0 forwards in 30 → the approach is wrong for every node type tried |
| **🔀 PIVOT** | **If one node type forwards and another does not, drop the failing type — do not average them.** Log the objection verbatim every time |
| **📈 SCALE** | ≥6 forwards in 30 → 100 nodes |
| **Time cap** | 21 days |

### E1b · Do recipients become qualified leads? — ⚪ BLOCKED ON E1a

| | |
|---|---|
| **Hypothesis** | A parent who reads the report enquires |
| **Starts when** | **10 forwards have happened.** Not before — there is nothing to measure |
| **Success metric** | **Qualified leads ÷ estimated parents reached** |
| **🛑 STOP** | **0 enquiries from 10 forwards → the ASSET or the CTA is wrong, NOT the network.** Fix the report's ending, keep the nodes |
| **📈 SCALE** | ≥1% enquiry rate → the loop works; pour everything into node count |

**Separating these two is the difference between "nobody will forward it" and "the report has no
call-to-action" — and the fix for each is the opposite of the fix for the other.**

### E1-old · Teacher-seeded WhatsApp — 🔴 SUPERSEDED by E1a/E1b

| | |
|---|---|
| **Node types in scope** | Teachers · coaching owners · principals · college faculty · career counsellors. **Ranked by parent-group access, not by seniority** |
| **Hypothesis** | A teacher will forward a free, honest cost report into their parent groups because it raises their standing and costs them nothing |
| **Unit** | One teacher contacted individually |
| **Minimum sample** | **30 teachers before any decision** |
| **Success metric** | **Teachers who forwarded** ÷ teachers contacted. *Not sends. Not opens.* |
| **🛑 STOP RULE** | **0 forwards in 30 contacts → kill.** Or 0 qualified leads from 50 forwards → the report is wrong, not the channel |
| **📈 SCALE RULE** | **≥6 forwards in 30 → go to 100 teachers.** ≥3 qualified leads → this is the engine; stop testing others |
| **Cost cap** | ₹0 |
| **Time cap** | **21 days.** If 30 contacts are not made in 21 days, the constraint is capacity, not the channel |
| **⚠️ Ignition floor** | **Below 13 nodes the loop cannot reach 10 students in a year.** 30 contacts at a ~40% forward rate gives ~12 active nodes — **the sample size and the ignition threshold are the same number by coincidence, and both say 30** |

### E2 · Google Business Profile — 🟡 BACKGROUND

| | |
|---|---|
| **Hypothesis** | High-intent local search produces qualified leads with no outbound effort |
| **Minimum sample** | **6 weeks live** — it cannot rank faster |
| **Success metric** | Qualified leads per month from GBP |
| **🛑 STOP RULE** | **Cannot be killed early.** Verification is one-time and permanent; **the only failure is never starting it** |
| **📈 SCALE RULE** | ≥3 qualified leads/month → invest in reviews |
| **Cost cap** | ₹0 |
| **Note** | **Runs as background, does not count against the concurrency limit**, because it requires no ongoing effort |

### E3 · Past-student referral — ⚪ QUEUED

| | |
|---|---|
| **Hypothesis** | 1,000+ students guided, never once asked, will introduce someone |
| **Minimum sample** | **30 messages** |
| **Success metric** | Introductions received ÷ messages sent |
| **🛑 STOP RULE** | **0 introductions in 30 messages → kill.** The base is colder than assumed |
| **📈 SCALE RULE** | ≥4 in 30 → message 200 |
| **Trigger to start** | **E1 reaches its 30-contact decision** |

### E4 · Coaching institute seminar — ⚪ QUEUED

| | |
|---|---|
| **Hypothesis** | An in-person seminar converts far better than a forward |
| **Minimum sample** | **3 seminars** — fewer is anecdote |
| **Success metric** | **Capture slips ÷ attendance** |
| **🛑 STOP RULE** | **<8% capture across 3 seminars → the talk is wrong.** Fix the talk before killing the channel |
| **📈 SCALE RULE** | ≥15% → book 10 |
| **Trigger to start** | **A teacher from E1 offers.** Do not cold-book — let E1 produce the invitation |

**E4's trigger is the point of the whole register: a seminar booked by a teacher who already forwarded
our report costs one conversation. A cold-booked seminar has cost six weeks and has not happened.**

---

## 2. Concurrency

| Slot | Now |
|---|---|
| **Active 1** | **E1 — teacher WhatsApp** |
| **Active 2** | *(empty — deliberately)* |
| Background | E2 — GBP |
| Queued | E3, E4 |

**The second slot stays empty until E1 reaches 30 contacts.** Filling it now would mean two
half-measured experiments instead of one decided.

---

## 3. Killed, with the reason recorded

| Channel | Reason | Reversible? |
|---|---|---|
| Paid advertising | No fee data, no conversion rate. **Cannot measure what we cannot price** | Yes — after 30 students |
| SEO | 6–12 months to first lead. **Outside the horizon that matters** | Yes — start at 100 students |
| Instagram · YouTube · Threads | Months to build an audience; no compounding before November | Yes |
| Reddit · Quora | Wrong geography. **Bihar parents are not there** | No |
| Telegram | No existing communities to enter | No |
| LinkedIn · Medium | **Not where the buyer is.** The buyer is a parent in a WhatsApp group | Partly — useful for university partners, not families |

**A killed channel keeps its reason so it is not silently re-proposed in three months.**

---

## 3b. Trust Multiplier Score — measure people, not platforms

**One row per node. This is the register's real output.**

```
NODE                      Priya Sharma, Physics, DAV Patna
Contacted                 2026-08-18
Forwarded                 YES          <- the only free signal
Parents reached (est.)    ~200
Enquiries produced        3
Qualified                 2
Students enrolled         1
Referrals since           4
Seminar invited           YES
STATUS                    WARM  (has a success story of their own)
```

| Status | Meaning | What we do |
|---|---|---|
| **COLD** | Contacted, no forward | One follow-up at day 10, then stop |
| **ACTIVE** | Forwarded at least once | Send the next report first |
| **WARM** | **Produced a successful student** | **3× conversion. Invest here before any new channel** |
| DORMANT | Was active, two cycles silent | Re-approach with a new report, never a reminder |

**The comparison that matters is between people, not channels.** One WARM teacher outperforms every
social platform in this register combined — and unlike a platform, **they get better each cycle.**

**Instrumentation already exists:** `Lead_Source_Detail` = the node's name. **No new CRM field is
required to compute any row above.**

## 4. The metric that measures learning, not activity

> ### Experiments **decided** per month.

Not experiments started, not channels tried, not leads. **An experiment is decided when it reaches its
minimum sample and its stop or scale rule fires.**

| | Healthy |
|---|---|
| **Experiments decided / month** | **≥ 1** |
| Experiments abandoned before minimum sample | **0** |
| Experiments running without a stop rule | **0** |
| **Median days from start to decision** | **falling** |
| **WARM nodes** | **rising.** The only number that compounds |

**A company that decides two experiments a month learns 24 things a year. A company that runs eight
channels simultaneously learns nothing and calls it momentum.**

**The failure mode this metric catches:** abandoning E1 at 12 contacts because it "doesn't seem to be
working." At 12 contacts nothing seems to be working — §0 proves it.

---

## 5. Weekly review — six lines, ten minutes

```
Active experiment           ______  attempts ____ / minimum ____
Metric so far               ______
Stop rule fired?            Y / N        Scale rule fired?  Y / N
Decided this month          ____
Anything abandoned early?   ______   (this is the failure to catch)
Next experiment to start    ______   (only if a slot is free)
```

**One rule governs the review: do not look at a rate before the minimum sample.** Reading 3/12 and
forming a view is how a working channel gets killed and a dead one gets scaled.
