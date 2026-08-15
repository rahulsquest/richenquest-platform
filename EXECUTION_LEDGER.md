# EXECUTION LEDGER

**The single record of work done and work pending.** New documents are not created for tasks —
they are logged here. Reference material lives in `docs/`; send-ready work lives in `outreach/`.

**Status 2026-08-16 · Students 0 · Revenue ₹0 · Leads ever 0 · Partnerships 0**

---

## 🔴 BLOCKED ON FOUNDER — nothing else can start until these move

| # | Decision / action | Blocks | Effort |
|---|---|---|---|
| **F0** | **Register with ApplyBoard** — `applyboard.com/new_associate`. **Run the 10-min pre-flight check first** (`outreach/` Part 0) | **The reference chicken-and-egg.** Verified: needs only a business registration certificate + ID verification, **no institutional references**. 48-hour review. 1,500+ institutions incl. Germany & Ireland | ~40 min |
| **F1** | **Set the price.** File 40 recommends **₹1,20,000** for the first ten students | Every sales conversation. Cannot counsel a lead without it | 1 decision |
| **F2** | **Commission stance** — File 40 recommends *disclosed and rebated* | What the outreach asks universities for; whether the independence claim can be made | 1 decision |
| **F3** | **Send Wave 1** — 6 emails, written and waiting in `outreach/READY-TO-SEND.md` | All partnership progress. Longest lead time in the business | ~30 min |
| **F4** | **Register with Fintiba** — `pi.fintiba.com/partners/register` | Fastest revenue line. Self-serve form, no references required | ~20 min |
| **F5** | **Claim Google Business Profile** | Highest-intent free lead channel | ~1 hr |
| **F6** | **Message 50 past students** for referrals | Cheapest leads available; the 1,000+ base already exists | ~2 hrs |
| **F7** | **Ask 10 past students for Google reviews** | Zero reviews is the biggest credibility gap vs IDP/AECC | ~1 hr |
| **F8** | **Copy `backups/` off this laptop, encrypted** | Only unrecoverable risk in the business | ~10 min |
| **F9** | **Write a refund policy** | Most competitors don't publish one — cheap, real trust signal | ~1 hr |
| **F10** | **Books out of test mode + GST** | All invoicing and revenue reporting | admin |
| **I2** | **Engage an Italian CAF for ISEE Parificato** | **The Italy moat.** Without it students cannot access DSU (worth €14–16k/yr to them). Needs a commercial arrangement | negotiation |
| **I3** | **Confirm whether the +39 presence = on-ground Italian capability** | A differentiator no Indian competitor has. Changes the whole Italy pitch | decision |

**F0, F1, F3, F4 are the critical path.** F0 is new and now ranks first: it is the only item that
converts "no university will sign us without references" from a blocker into a sequence.

---

## ✅ DONE

### Platform (frozen — maintenance only)
| Item | Evidence |
|---|---|
| CRM: 16 Deluge functions, 7 workflow rules, all verified | `./scripts/platform-health.sh` → 13/13 |
| Regression suite, self-cleaning, leak-detecting | `verifyPlatform` |
| Health monitoring, one command | `platform-health.sh` |
| Founder dashboard, read-only | `founder-dashboard.sh` |
| Automated backup + verification | `backup-crm.sh`, `verify-backup.sh` |
| 12 Zoho factory artifacts removed | File 32 |
| Student identity resolution, lifecycle, partnership automation | Files 21, 23 |

### Business
| Item | Result | Where |
|---|---|---|
| University research | **11 of 17 contactable** (was 1). All 17 resolved — verified contact or documented reason | File 35, CRM |
| University contacts imported with provenance | Every record carries its source URL | CRM `Description` |
| Competitive intelligence | Market ₹30k–1.5L paid, or **free via commission**. RichenQuest at ₹1.8L is above the ceiling | File 38 |
| Commission economics | **10–15% of first-year tuition**, ≈₹1.36L on a €12k programme — what IDP earns invisibly | File 40 |
| Business model recommendation | **Model D — premium advisory, commission disclosed & rebated**, staged entry at ₹1.2L | File 40 |
| Lead generation plan | 8 channels ranked by cost per qualified lead; 30 leads in 6 weeks at ~zero cash | File 38 |
| Sales engine | Qualification, consultation flow, objection handling, WhatsApp sequences, closing playbook | File 39 |
| **Wave 1 outreach — 6 customised emails** | **Written, send-ready** | `outreach/READY-TO-SEND.md` |
| **Wave 2 outreach — template + 5 targets** | **Written, send-ready** | `outreach/READY-TO-SEND.md` |
| **Fintiba partner route** | Self-serve registration found; €200/qtr min payout, paid Jan/Apr/Jul/Oct | `outreach/READY-TO-SEND.md` C1 |
| **Expatrio partner route** | No public agency application — direct email drafted | `outreach/READY-TO-SEND.md` C2 |
| Ancillary revenue thesis | Loan, forex, insurance, accommodation — student spends ₹30–40L, RichenQuest monetises one event | File 41 §3 |
| **Aggregator comparison — 3 platforms, requirements verified** | **ApplyBoard: business registration + ID only, NO references, 48hr review — RichenQuest qualifies today. MSM Unify: requires TWO institutional references (same wall as CBS). Adventus: requirements not published.** Join order and pre-flight checklist written | `outreach/READY-TO-SEND.md` Part 0 |
| Education loan referral verified | GyanDhan: **₹3,000/referral + ₹10,000 bonus per 5**, self-serve, no agency agreement | `outreach/` Part C3 |
| **Italy strategy + revenue stack** | **DSU pays non-EU students €14–16k/yr package incl. tuition waiver, stipend, housing, meals.** Italy reaches RichenQuest's low-income demographic that Germany's €11,904 blocked account excludes. Revenue/student: Germany ≈₹2.59L, Italy ≈₹1.23L — two different businesses | File 42 |

---

## ⏳ NEXT — unblocked, in priority order

Executed automatically as capacity allows. Nothing here needs a founder decision first.

| # | Task | KPI it moves | Status |
|---|---|---|---|
| N1 | Research the 4 browser-blocked universities (SRH, NCI, DBS, Macromedia) | Partnerships | needs a human browser — **founder or assistant, ~20 min** |
| N2 | ~~Verify education-loan referral programmes~~ | Revenue | **done** — GyanDhan ₹3,000/referral + ₹10,000 per 5. Formal B2B channel terms still unknown; ask them |
| N3 | Verify RBI-authorised forex/remittance partner programmes and draft outreach | Revenue | pending |
| N4 | Verify Coracle / Flywire / Wise agent programmes **before** drafting anything | Revenue | pending — *not assumed to exist* |
| N7 | ~~Verify Adventus / MSM Unify recruiter terms~~ | Partnerships | **done** — MSM needs 2 references (blocked until placements exist); Adventus not published. Edvoy / Abcodo / UniApply still unverified |
| N8 | ~~Italy question~~ | Partnerships | **ANSWERED — Italy is a core market.** Researched: File 42. DSU makes Italy structurally better suited to RichenQuest's demographic than Germany |
| N9 | Research 5–8 Italian public universities ranked by DSU generosity + English-taught programmes | Partnerships | pending founder approval (I4) |
| N10 | Research private Italian institutions (design/fashion/business) — these **do** pay agent commission unlike public universities | Revenue | pending |
| N5 | Counselor training pack (condense Files 39 + 23 into a day-one manual) | Satisfaction, Referral | **do when hiring starts, not before** |
| N6 | Visa & scholarship document checklists | Satisfaction | **do when first student signs** |

---

## 🚫 DELIBERATELY NOT DOING

Recorded so it is a decision, not an oversight.

| Item | Why not |
|---|---|
| Service tier design (Basic/Premium/VIP/Concierge…) | No customer has said what they'll pay for. Designing 20 product lines pre-revenue guarantees a rewrite |
| Hiring plans, KPI scorecards, department structure | Cannot size a team before conversion is measured |
| Continuous competitive monitoring | No customers to defend yet. Re-run the scan at 50 students |
| Expansion roadmap | Two orders of magnitude premature |
| More strategy documents | File 41: the constraint is execution, not knowledge |
| Any new engineering | Platform is complete for 100× current load |

---

## 📊 REVIEW RHYTHM

**Weekly** — `./scripts/founder-dashboard.sh`, then `./scripts/platform-health.sh`
Look at, in order: overdue tasks → new leads → case stages → partnership movement → regression → quota → backup age.

**On every partnership reply** — log it with `logPartnershipContact`, and **record any commission
figure in the account `Description`**. Those numbers are the missing input to the entire financial
model.

**At 30 leads** — replace the assumed 10% conversion with the real number. Every projection becomes
a forecast instead of a guess.

---

## LOG

| Date | Entry |
|---|---|
| 2026-08-15 | Platform frozen. Backup + verification built and run. 12 Zoho artifacts purged. |
| 2026-08-15 | University research: contactability 1 → 11 of 17; all 17 resolved with provenance. |
| 2026-08-15 | Competitive research: market is free-via-commission or ₹30k–1.5L paid. ₹1.8L is above ceiling. |
| 2026-08-15 | Business model validated. Recommendation: Model D, staged from ₹1.2L. |
| 2026-08-16 | Fintiba partner programme found — self-serve, no reference requirement. Expatrio has no public agency route; direct email drafted. |
| 2026-08-16 | Wave 1 (6) and Wave 2 (5) outreach written and send-ready. Ledger established. |
| 2026-08-16 | **ApplyBoard verified — 1,500+ institutions incl. Germany/Ireland, no stated reference requirement. Promoted to F0, ahead of everything.** Aggregator commission is lower than direct, but it creates the university references that unlock the direct agreements. |
| 2026-08-16 | GyanDhan education-loan referral verified: ₹3,000 per successful referral plus ₹10,000 every 5, self-serve, paid on disbursal. |
| 2026-08-16 | **Italy researched properly after founder correction.** I had inferred Germany-first from the CRM contents; that was inference, not strategy. DSU changes the picture: non-EU students are eligible, the full package (tuition waiver + €2,500–7,900 stipend + housing + meals) can exceed €14–16k/yr, and eligibility is means-tested at ISEE ≈€13,560 — which much of Bihar/Jharkhand/Nepal would fall under. Germany's €11,904 blocked account excludes exactly those families. Recommendation: lead with Italy for volume and referrals, Germany for margin. ISEE Parificato via an Italian CAF identified as the service moat. |
| 2026-08-16 | **Aggregator requirements verified across 3 platforms.** MSM Unify requires two institutional references — the same blocker as CBS — so it is deferred, not rejected. ApplyBoard confirmed from its own help centre: business registration certificate + photo-ID liveness check, 48-hour review, no references. Join order set: ApplyBoard → MSM (after placements) → Adventus (needs research). Do not apply to all three — splitting volume weakens every commission tier. |
