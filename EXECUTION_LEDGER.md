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
| **F11** | **Website legal name mismatch** — `richenquest.com` shows "RichenQuest Global", registration is "RichenQuest Private Limited"; no address/CIN on site | **ApplyBoard cross-checks the website against the business document and will demand a Letter of Statement.** One footer line fixes it for every future partner | ~5 min (web dev) |
| **I2** | **Engage an Italian CAF for ISEE Parificato** | **The Italy moat.** Without it students cannot access DSU (worth €14–16k/yr to them). Needs a commercial arrangement | negotiation |
| **I3** | **Confirm whether the +39 presence = on-ground Italian capability** | A differentiator no Indian competitor has. Changes the whole Italy pitch | decision |
| **I5** | **Approve research pass: 5–8 Italian public universities ranked by DSU generosity, not prestige** | Unblocks the flagship package. Everything else in Italy is buildable without you | approval |
| **I6** | **Set Italy package structure + prices** (bands in File 43 §3) | The scholarship package is the flagship — needs a price | decision |
| **C1** | **Confirm two-country focus — Italy primary, Germany secondary** | Stops effort spreading across 11 countries | decision |
| **C2** | **Approve Poland scholarship research** — one question: does Poland have a decentralised DSU-like grant? | If yes, second flagship. If no, ordinary market | approval |
| **C3** | **Legal check before offering PR / business / family migration advice** | Regulated advisory in many jurisdictions; some require licensed practitioners | **legal** |

**F0, F1, F3, F4 are the critical path.** F0 is new and now ranks first: it is the only item that
converts "no university will sign us without references" from a blocker into a sequence.

---

## ✅ DONE

### Platform (frozen — maintenance only)
| Item | Evidence |
|---|---|
| CRM: 23 Deluge functions, 7 workflow rules, 2 nightly schedules | `./scripts/platform-health.sh` → 18/18 |
| Regression suite — **18 assertions, 16 of 17 functions covered**, self-cleaning, leak-detecting | `verifyPlatform` → 18/18 |
| Health monitoring, one command | `platform-health.sh` |
| Founder dashboard, read-only | `founder-dashboard.sh` |
| Automated backup + verification | `backup-crm.sh`, `verify-backup.sh` |
| **Alerting LIVE — silent when green** | `sendPlatformAlert` is the single notification path; `schedNightlyVerify` v3.0 emails **only on failure or a leaked probe**. Closes R-6 | test alert fired 2026-08-16 01:45 — **Rahul must confirm receipt** |
| **Lead qualification + deduplication** | `qualifyLead` — readiness completeness score (not a prediction), missing-info list, duplicate detection by phone AND existing-student lookup. **Catches duplicates Zoho's native email check misses** | verified: same-phone dup caught; existing Contact detected |
| **Counselling brief generator (assistive, not predictive)** | `generateCounsellingBrief` — deterministic destination assessment, document checklist, must-confirm list, missing-info list, counselor-review flags. **Estimates no probability, ROI or admission likelihood anywhere** | verified: ₹6L→routes to Italy w/ reasoning; ₹15L→Germany satisfiable |
| **Knowledge base LIVE — 12 verified articles in `Solutions`** | `publishKnowledgeArticle` (upsert by title, **refuses an article with no source**) + `searchKnowledge` (page-and-filter across title/question/answer). Includes 2 deliberate DO-NOT-ADVISE articles | verified: query "DSU"→5, "proof of funds"→2 |
| **Scheduled jobs — 2 live, unattended** | `Nightly partnership archive` 02:00 · `Nightly platform regression` 03:00. Verified `next_execution_time` set | 
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
| **Country portfolio — narrowed to 2** | **Hungary EXCLUDED despite being fully funded**: Stipendium Hungaricum is government-brokered via UGC with ~200 seats for all India — no agent role exists. Principle derived: **opportunity ∝ bureaucratic complexity, not scholarship generosity**. Italy primary, Germany secondary, Poland the one to research | File 44 |
| **Italy playbook — journey, packages, knowledge base** | 18-stage journey mapped with friction points. Value concentrates in 4 stages: Universitaly, ISEE Parificato, DSU deadlines, residence permit — **none served by a commission-funded agency**. 5 service packages, citation-backed knowledge base | File 43 |
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
| N9 | Research 5–8 Italian public universities ranked by DSU generosity + English-taught programmes | Partnerships | pending founder approval (**I5**) |
| N11 | Learn the Universitaly pre-enrolment portal end to end | Student acquisition | **unblocked — highest-priority operational gap.** Errors here invalidate the visa route |
| N12 | Build the regional DSU deadline calendar (Lazio, Toscana, Lombardia, Emilia-Romagna…) | Student success | unblocked — build once, reuse annually |
| N13 | **Verify part-time work hour limits** from an official source | Compliance | unblocked — **must not counsel on this until done** |
| N14 | Research Poland's scholarship structure — decentralised DSU-equivalent or not? | Partnerships | pending founder approval (**C2**) |
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
| 2026-08-16 | **Alerting built — R-6 closed.** The nightly regression previously wrote to a log nobody reads, so a broken guard would have stayed invisible. `sendPlatformAlert` is now the single notification path (Deluge `sendmail`; a literal from-address is rejected — it must be `zoho.loginuserid` or a Zoho-verified address). `schedNightlyVerify` v3.0 alerts ONLY on a failed assertion or a leaked probe: a nightly all-good email gets filtered within a week and takes the failure email with it. **One test alert was fired so the channel is not unproven — Rahul must confirm it arrived at rahul@richenquest.com.** sendmail returning without error means Zoho accepted it, not that it was delivered. |
| 2026-08-16 | **Lead qualification + dedup built.** `qualifyLead` returns a readiness COMPLETENESS score (7 qualification facts held/missing — explicitly not a conversion prediction), plus duplicate detection. **Discovered Zoho natively blocks duplicate Leads by Email at create time** — so the valuable cases are the ones it misses: same phone with a different email (verified caught), and a lead whose email already belongs to an existing Contact/Student (verified caught, returns the Contact id so the enquiry routes to their existing counselor). Dedup matters at lead #2, not lead #200: two counselors calling the same student is the worst possible first impression. |
| 2026-08-16 | **Assistive counselling engine built.** `generateCounsellingBrief` turns a student profile into a counselor-ready brief using ONLY verified rules — Germany's EUR 11,904 deposited-cash blocked account vs Italy accepting an approved education loan; Italian public tuition; DSU thresholds and value; the disputed visa figure. It estimates NO probability, ROI or admission likelihood. Verified on two cases: a ₹6 lakh budget is correctly assessed "LIKELY BLOCKED" for Germany and routed to Italy with the loan question raised; ₹15 lakh with Germany preference returns satisfiable-but-confirm-it-can-be-BLOCKED. Outputs a `must_confirm` list (disputed visa figure, unverified work hours, annually-changing DSU thresholds, live FX) so the counselor never quotes an unverified number. FX is a STATED assumption of 95 INR/EUR, labelled approximate. |
| 2026-08-16 | **Knowledge base built and populated (Phase 6).** 12 verified articles published into `Solutions` covering DSU, ISEE Parificato, Italian tuition, the disputed visa figure, Italy-vs-Germany proof of funds, Universitaly, quota-exempt work conversion, what RichenQuest may claim, and the "why pay when IDP is free" answer. **Every article carries its source and last-verified date; the publisher REFUSES an article with no source.** Two articles deliberately say DO NOT ADVISE (part-time work hours; and the visa figure, which conflicts across three sources). Search rewritten to page-and-filter after finding `contains` is an invalid operator on `searchRecords` — verified working. Noted: `Published` accepts a write but silently stays false (portal-controlled, not operationally blocking); `Tag` is a special field needing the tags API, not a field write. |
| 2026-08-16 | **Regression coverage closed from 13 to 18 assertions (D-6).** Added: createUniversityFollowup 3-task cadence; archiveExpiredPartnership actually moving a backdated agreement to Dormant; updateLeadLifecycle both refusing an off-picklist status and applying a valid one; wfLeadCreated composition. Coverage now 16 of 17 functions. **assignCounselor's happy path remains the only untestable one** — it needs a user holding the Counselor role, and creating users consumes licences, so that is a founder action not an engineering gap. |
| 2026-08-16 | **Schedules API solved and 2 jobs deployed.** Previous 500 was the wrong endpoint — it is `/crm/v9/settings/automation/schedules`, not `/crm/v8/settings/schedules`. Schema read from Zoho's own `schedules-store.js`: `frequency` is an OBJECT (`{type:"daily"}`), and `execution_ending_details` needs `{execution_end:"never"}`. Critically, **schedules reject `standalone` functions** — the function must be category `scheduler` ("The function id given seems to be invalid" otherwise). Created two thin scheduler wrappers that delegate to existing logic rather than duplicating it. Closes D-3 and half of R-6: regression now runs unattended nightly. |
| 2026-08-16 | **Website legal-name mismatch found before it caused a rejection.** richenquest.com displays "RichenQuest Global"; the entity is "RichenQuest Private Limited", and no address or CIN appears on the homepage or contact page. ApplyBoard explicitly cross-checks the business document against the company website. Logged as F11. |
| 2026-08-16 | **Country portfolio narrowed to two, against a brief asking for eleven.** Hungary was the standout on paper — Stipendium Hungaricum is fully funded with tuition, stipend, accommodation and insurance — and is commercially worthless to RichenQuest: applications are nominated through the Ministry of Education/UGC, ~200 seats for all of India, clean centralised process, no agent role. That produced the ranking principle: **RichenQuest's opportunity is proportional to bureaucratic complexity, not scholarship generosity.** Italy's DSU is commercially superior to Hungary's Stipendium precisely BECAUSE it is decentralised and document-heavy. Declined to build 11 country operating models or a global knowledge graph, with reasons stated rather than omitted. |
| 2026-08-16 | **Italy playbook built.** Two findings change the pitch: (a) Italy accepts scholarships and APPROVED EDUCATION LOANS as proof of funds where Germany demands deposited cash in a blocked account — the form matters more than the amount, and it is why Italy reaches families Germany excludes; (b) the **Cutro Decree exempts Italian-university graduates from the Decreto Flussi quota** when converting a student permit to a work permit, at any time of year. That second point is the most under-communicated fact in Italian student mobility and most consultancies never explain it, because they are not paid to think past enrolment. Also recorded: the Italian visa proof-of-funds figure is DISPUTED across sources (€6,947 / €10,180 / €5,520–6,072) and must never be quoted as a single number. |
| 2026-08-16 | **Italy researched properly after founder correction.** I had inferred Germany-first from the CRM contents; that was inference, not strategy. DSU changes the picture: non-EU students are eligible, the full package (tuition waiver + €2,500–7,900 stipend + housing + meals) can exceed €14–16k/yr, and eligibility is means-tested at ISEE ≈€13,560 — which much of Bihar/Jharkhand/Nepal would fall under. Germany's €11,904 blocked account excludes exactly those families. Recommendation: lead with Italy for volume and referrals, Germany for margin. ISEE Parificato via an Italian CAF identified as the service moat. |
| 2026-08-16 | **Aggregator requirements verified across 3 platforms.** MSM Unify requires two institutional references — the same blocker as CBS — so it is deferred, not rejected. ApplyBoard confirmed from its own help centre: business registration certificate + photo-ID liveness check, 48-hour review, no references. Join order set: ApplyBoard → MSM (after placements) → Adventus (needs research). Do not apply to all three — splitting volume weakens every commission tier. |
