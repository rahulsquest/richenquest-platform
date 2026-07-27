# File 15 — Operations Automation Blueprint
RichenQuest as a Zoho-run company: what to automate, in what order, and what NOT to build yet.
Status: **architecture for approval, 2026-07-19.** No code. Build one automation at a time after approval.

---

## 0. COO's point of view (read this before the catalog)

You asked me to automate the entire company. My honest job is not to say yes to all of it — it is
to tell you the order, and the things we should deliberately not build. Five hard truths first:

**1. Nothing here is buildable today. Zoho One is not activated.** This blueprint is entirely
downstream of business Milestone 2 (Zoho activation, File 00). Every automation below assumes CRM,
Books, People, etc. exist. They don't yet. The single highest-leverage action for the whole
operations plan is still: activate Zoho One (India DC) and build the CRM spine (File 01). Until
that happens, this document is a map of a city we haven't poured the foundations for.

**2. You are 5 people, not 50. Most enterprise HR automation is a trap at your size.** Recruitment
ATS, attendance systems, exit-process workflows, performance-review automation — these solve pain a
50-person company has. At 5 full-time people you hire a handful of times a year and have exits even
more rarely. Automating them now is *procrastination disguised as progress*: it feels like building
the company, but it produces machinery nobody runs. I've marked these **Future** and I'd push back
if you asked to build them first.

**3. You cannot automate a habit that doesn't exist yet.** File 00 says this and it's the most
violated rule in operations. A "daily check-in bot" fails if the team doesn't already do daily
check-ins manually. A "weekly report automation" is noise if nobody reads the weekly report. The
sequence is always: manual habit → prove it sticks → automate the habit. Build the automation
first and you get an expensive tool that formalizes a behavior nobody has.

**4. Over-automation would erode the one thing that is your brand.** Your entire positioning
(Files 04, 08, the website) is *human judgment you can verify*: two-person document verification,
honest counseling that says "wait a year," never predicting visa outcomes. Automation's job here is
to **prepare and remind around those moments — never to make the decision.** I have kept a hard
human-in-the-loop gate on every automation that touches a document, a visa, money leaving the
company, or a claim going public. If we ever automate those away to save a few minutes, we've
automated away the reason a university or a parent trusts us.

**5. 90% of the ROI is boring, not AI.** You keep reaching for AI, and I understand why — but the
value here is deterministic workflow plumbing (CRM Workflow Rules + Flow), not machine learning.
The AI that's genuinely worth it early is narrow and assistive: GenAI *drafting* (counseling
summaries, nurture emails, partnership personalization) with a human reviewing, and later Zia lead
scoring **once you have closed-loop data to train it** — which you don't yet. Selling "AI
operations" today would also violate your own claims library (File 08 bans present-tense
"AI-powered" until it's real). Build clean data pipes first; AI rides on top of them later.

**My one-line thesis:** RichenQuest's automation ROI is concentrated in *two* places — the
**student lead-to-enrollment journey** (where revenue and reputation are won or lost) and the
**founder's morning control tower** (where you see the whole company in five minutes). Build those
two spines deeply. Treat HR, most of finance, and all of "AI ops" as thin or future until scale
justifies them. A focused operations engine that runs the money-and-risk path flawlessly beats a
sprawling one that automates leave requests.

---

## 1. Operating principles (the rules every automation obeys)

1. **CRM is the spine.** Every automation reads and writes Zoho CRM. Leads, Student Cases, and
   University Partnerships live there; money in Books, documents in WorkDrive, people in People —
   but CRM is the single source of truth the others reference. We never let student data fragment
   across apps with no owner.
2. **Human gates are sacred.** Document "Verified", visa submission, money out, and any public
   claim require a named human action. Automation queues the task and blocks the path until a human
   acts; it never self-approves these.
3. **Boring before clever.** Deterministic rules first. ML/GenAI only where it demonstrably beats a
   rule and we have the data to justify it. Every "AI decision" below is labelled honestly:
   `Rule` (deterministic), `Zia-ML` (needs data history), or `GenAI` (draft-then-human-review).
4. **Manual habit before automation.** We automate a process only after the team has run it by hand
   long enough to trust the shape of it.
5. **Silent failure is the enemy.** Automated pipelines fail quietly — a lead that never got
   created, an email that never fired. Every automation has a failure-recovery path and an
   `#ops-alerts` heartbeat, so a broken automation raises its hand instead of losing a student in
   silence.
6. **Timezone-aware.** The team spans India (IST) and Italy (CET). Routing and SLAs respect both —
   a late-night IST lead can wake up on the Italy counselor's desk.
7. **DPDP-safe.** More automation = more data movement. Every flow honours consent, data
   minimization, and retention (File 13 legal). Automations touching PII are inside the Zoho India
   DC; opt-outs propagate everywhere instantly.

---

## 2. Zoho One app map — what we use, defer, and skip

| Use now (the spine) | Use soon (as habits form) | Defer / future | Skip (not our business) |
|---|---|---|---|
| CRM, Forms, SalesIQ, Bookings, Cliq, WorkDrive, Books, Analytics, Flow, Mail, Sign | Campaigns, Marketing Automation, Learn, Sign, People (leave only), Social, Desk, Survey, PageSense | Recruit, People (full HRIS), Payroll, Expense, Creator (portal), Zia-ML scoring, Projects | Inventory, Commerce, Bookings-for-retail, Subscriptions (no recurring product) |

Zia (Zoho's AI) is a capability *inside* CRM/Desk/Writer, not a separate spine — used assistively
where noted. Vault holds shared credentials (already in File 00). Directory handles identity/2FA.

---

## 3. The automation catalog

Format per automation: **Apps · Trigger · Workflow · AI · Human gate · Notifications · Reports ·
Failure recovery · ROI.** High-ROI automations are specced in full; Medium are condensed; Future
get a one-line rationale for deferral (deferring *is* the architectural decision).

### 3.1 Student Journey — the revenue spine (build first)

**S1 · Speed-to-Lead Response** — *the single most important automation in the company*
- **Apps:** Forms → CRM · Cliq · WhatsApp (BSP) · Campaigns
- **Trigger:** New Lead created (website form, WhatsApp, SalesIQ, Meta lead ad, walk-in entry)
- **Workflow:** On create → dedupe on email/phone → auto-assign (round-robin, or by Interested
  Country once counselors specialize, timezone-aware) → send instant WhatsApp `welcome_inquiry`
  template + welcome email → create Task "Call new lead" due **now**, priority Highest → post to
  Cliq `#leads` "🔔 New lead — {country} — call within 5 min".
- **AI:** `Rule` for routing/SLA today. `Zia-ML` lead scoring is **Future** (needs closed-won
  history first). `GenAI` optional: draft a first-message suggestion for the counselor.
- **Human gate:** none to fire; the *call* is human (5-min SLA).
- **Notifications:** `#leads` on create; DM to counselor; escalation DM to manager if no first
  activity in 30 min.
- **Reports:** first-response time distribution, leads-by-source, contact rate — the founder
  dashboard's lead metrics.
- **Failure recovery:** if CRM create fails, Forms retains the submission (never lost); a nightly
  reconciliation compares Forms submissions to CRM Leads and alerts `#ops-alerts` on any gap. WhatsApp
  send failure → fallback email + task flag.
- **ROI:** **HIGH.** Speed-to-lead is the #1 conversion lever in this industry and your audience
  lives on WhatsApp. This automation directly moves revenue.

**S2 · Student Case Pipeline (stage-triggered lifecycle)**
- **Apps:** CRM · Mail · WhatsApp · WorkDrive · Cliq · Books · Sign
- **Trigger:** Student Case stage change (11 stages, File 01 §4)
- **Workflow:** *Agreement Sent* → e-sign request (Zoho Sign) + "follow up if unsigned in 48h"
  task. *Agreement Signed* → onboarding email + WhatsApp + `#wins` post + Operations task "create
  WorkDrive folder from template" + raise invoice in Books. *Offer Received* / *Visa Approved* →
  congratulations email + WhatsApp + `#wins`.
- **AI:** `Rule`. `GenAI` optional to draft the stage-update message in the student's language.
- **Human gate:** invoice issuance and folder creation are human-triggered tasks in MVP (auto in
  Phase 2); agreement content is human.
- **Notifications:** stage-appropriate (student + internal channel).
- **Reports:** pipeline value by stage, stage conversion %, stage aging.
- **Failure recovery:** stage-change events that don't fire their action surface in a daily
  "cases with missing stage-actions" audit → `#ops-alerts`.
- **ROI:** **HIGH.** This is what stops students falling through cracks — the reputation engine.

**S3 · Deadline & APS/DSU Guardian** — *specifically high-value for your Europe focus*
- **Apps:** CRM · Cliq · WhatsApp · Mail
- **Trigger:** date-based — "Next Deadline" (and, for German cases, the APS deadline; for Italy, DSU
  ISEE/application windows) approaching.
- **Workflow:** 7 days out → counselor task + Cliq alert; 2 days out → priority Highest + escalate
  to manager. APS is a hard prerequisite for German student visas and the single most common
  timeline-killer (File 05) — every German case carries an APS deadline automatically.
- **AI:** `Rule`.
- **Human gate:** the counselor acts; automation only warns.
- **Notifications:** counselor, then manager on the 2-day threshold.
- **Reports:** upcoming-deadline heatmap; deadlines missed (should trend to zero).
- **Failure recovery:** a weekly "cases with no Next Deadline set" audit catches cases silently
  missing a guardian.
- **ROI:** **HIGH.** A missed APS/DSU window loses the student the entire intake — direct revenue
  and reputation loss this specifically prevents.

**S4 · Document Collection & Verification (assisted, human-verified)**
- **Apps:** CRM · WorkDrive · WhatsApp · Zia (OCR)
- **Trigger:** Agreement Signed (collection starts) / document uploaded
- **Workflow:** send checklist + upload link; on upload, mark "Collecting"; optional Zia OCR
  pre-reads passport/transcript fields and flags obvious mismatches (name vs passport, expiry) →
  sets "AI Pre-checked"; **a second human sets "Verified"** (two-eyes rule, SOP-03).
- **AI:** `Zia-ML`/OCR **assist only** — surfaces candidate issues; never the final verifier.
- **Human gate:** HARD. Two-person verification is the brand; automation cannot set "Verified".
- **Notifications:** discrepancy → task + WhatsApp `document_request` with the specific fix.
- **Reports:** document-cycle time, % first-pass clean, oldest pending docs (dashboard).
- **Failure recovery:** OCR down → flow proceeds fully manual (no dependency on AI).
- **ROI:** **MEDIUM** now (OCR assist), **HIGH** once volume makes manual pre-check the bottleneck.

**S5 · Nurture drip for un-booked / cold leads** — Campaigns/Marketing Automation; monthly value
emails (intake calendars, scholarship roundups, cost breakdowns) to "Nurture" leads. **MEDIUM ROI**
— cold leads revive at intake season *with you* because of this. Content drafted by GenAI in your
voice, human-approved (File 03 §3.3).

**S6 · Departure & Alumni** — pre-departure checklist automation (**MEDIUM**); alumni program
(referrals, testimonials-with-consent, "where are they now") is **FUTURE** — needs a critical mass
of placed students first; automating an alumni network of 15 is premature.

### 3.2 Founder Dashboard — the control tower (build early, see §4 for full design)
The single most requested deliverable; specced separately below. **ROI: HIGH.**

### 3.3 Internal Team

**I1 · Overdue-task escalation** — CRM Workflow · Cliq. Task 1 day overdue → reminder to owner; 3
days → manager DM. "Managers see only exceptions; nobody plays follow-up police" (File 01 §5.4).
**Rule.** **HIGH ROI** — cheap, prevents things rotting silently.

**I2 · Daily team check-in** — Cliq scheduled prompt in `#daily-updates`, Mon–Sat 6pm; replies in
thread; **Phase 2** a Cliq bot DMs each person and posts an AI summary at 7pm. **MEDIUM ROI**, and
explicitly *habit-first* (File 03 §4) — ship the manual scheduled message now, automate the bot only
after the habit sticks.

**I3 · Weekly/monthly rollups** — Analytics scheduled email + GenAI one-page founder brief. **MEDIUM.**

**I4 · SOP & Knowledge base** — Zoho Learn courses (SOP-01…07, File 04); new hires complete them;
"if reality differs from an SOP twice in a week, we change the SOP." **MEDIUM ROI**, low effort,
high onboarding leverage as you grow.

**I5 · Internal approvals** — CRM Approval Processes: Discount >10% locks the deal until CEO
one-tap approves; same pattern for refunds. **Human gate is the point.** **MEDIUM ROI.**

### 3.4 University Relations (the B2B commission engine, Files 02/07)

**U1 · Outreach follow-up sequence** — CRM (University Partnerships module) · Mail · Cliq. Stage
"Email 1 Sent" → auto-create follow-up tasks/emails at +4, +9, +16 days; "Engaged/Replied" → Cliq
alert + 4-hour reply SLA; "Partner — Signed" → 🎉 `#wins` + "add to course DB, brief counselors";
30 days silent after Email 4 → auto-Dormant. **AI:** `GenAI` drafts the personalization line per
university (human sends). **HIGH ROI** — this is how commission partnerships get unlocked, and the
whole value is in follow-up nobody forgets.

**U2 · Partner onboarding** — on signature: Sign for the agreement, WorkDrive+Vault filing,
commission terms into the CRM record, counselor briefing note. **MEDIUM.**

**U3 · Contract & commission-renewal reminders** — date-based alerts before agreement renewal/audit
dates. **MEDIUM** (matters once you have signed partners).

**U4 · Commission tracking & reconciliation** — track expected vs received commission per placed
student. **FUTURE** — needs signed partners actually paying first; building the ledger before the
first commission is premature.

### 3.5 Marketing

**M1 · Lead attribution** — UTM discipline on every Form + Lead Source Detail → Analytics.
**HIGH-ish / MEDIUM** — without clean attribution you spend blind; this is mostly *discipline*, not
a build, and it must exist from day one of paid traffic.

**M2 · Campaign & nurture management** — Campaigns/Marketing Automation journeys. **MEDIUM.**

**M3 · Social scheduling** — Zoho Social calendar + scheduling across channels; approvals before
publish. **MEDIUM ROI**, low effort — consistency compounds for SEO/brand.

**M4 · Web analytics** — PageSense (Zoho-native) or the already-approved Microsoft Clarity (File 11
C4) for heatmaps/funnels, consent-gated. **MEDIUM.**

### 3.6 Finance

**F1 · Invoicing** — Books, triggered at Agreement Signed (2 clicks in MVP, auto in Phase 2), GST
configured, Razorpay payment link auto-included. **HIGH ROI** — getting invoiced correctly and
fast is cash flow.

**F2 · Payment reminders** — Books auto-reminders at due−3, due, due+3, due+7. **HIGH ROI**,
near-zero effort — this is free money you're currently chasing by hand.

**F3 · Revenue dashboards** — Analytics (Books + CRM): collected MTD, outstanding, pipeline value.
Feeds the founder dashboard. **HIGH.**

**F4 · Commission payout** — paying sub-agents/collaborators their share. **FUTURE** — needs the
collaborator-payment model and volume to exist.

**F5 · Expense & Payroll** — Zoho Expense approval chains, Zoho Payroll (India). **FUTURE** at 5 FTE
— a spreadsheet and Books handle this fine until you're ~15+ people.

### 3.7 HR — deliberately thin at your size

**H1 · Leave & simple attendance** — Zoho People, leave requests + approval only. **MEDIUM** (nice,
low effort, genuinely useful even at 5). Full biometric attendance: **FUTURE**.

**H2 · Employee onboarding** — a People/Learn checklist (accounts via Directory, SOP courses, Vault
access, 2FA). **MEDIUM** — worth a lightweight checklist because your security posture (passports,
financials) demands consistent access provisioning/deprovisioning.

**H3 · Recruitment / ATS (Zoho Recruit)** — **FUTURE.** You hire a few times a year; a shared CRM
pipeline or even a spreadsheet is enough. An ATS is 10× the machinery your hiring volume needs.

**H4 · Interview scheduling** — Zoho Bookings for candidate slots. **FUTURE / trivial** — reuse the
Bookings you already set up for students; not a separate build.

**H5 · Performance management** — **FUTURE.** You need a review *cycle* to exist manually before
automating it. Automating a process you've never run is principle #4's exact trap.

**H6 · Exit process** — **FUTURE.** Offboarding checklist (revoke Directory/Vault access, reassign
records) matters for *security* the day it's needed, but it's a one-page SOP, not an automation to
build now.

**H7 · Daily reporting** — same as I2 (daily check-in). Not a separate HR system.

---

## 4. The Founder's Morning Dashboard (full design)

**Goal:** by ~8:00 IST Rahul opens one view (and gets one Cliq/email digest) and understands the
whole company in five minutes. **Apps:** Analytics (core) + CRM/Books/Bookings data + a Cliq bot for
the push digest.

| Metric | Source | Definition | Turns red when |
|---|---|---|---|
| Revenue | Books | Collected MTD vs monthly target; today's receipts | Below pace for the month |
| New leads | CRM | Today, 7-day trend, by source | Volume drop vs 4-wk avg |
| Active applications | CRM | Cases in Submitted/Offer/Visa stages | — |
| Pending documents | CRM | Cases with Document Status ≠ Complete; oldest age | Any doc pending >X days |
| Team performance | CRM | Per counselor: leads handled, avg first-response, sessions held | SLA breach |
| Overdue tasks | CRM | Count by owner | Anyone >N overdue |
| Today's meetings | Bookings/Calendar | Counseling sessions + partner calls today | — |
| Business health score | Composite (see below) | One directional index, 0–100 | Below threshold |
| Risks needing attention | Rules (Zia-ML later) | Stalled cases, deadlines <7d, leads with no first response, unsigned agreements >48h, negative-sentiment replies | Any present |

**Business health score — with an honesty caveat.** A single number is seductive and can mislead,
so it is a *transparent weighted composite*, not a black box: e.g. pipeline velocity (25%),
response-SLA compliance (20%), document-on-time rate (20%), cash collection vs target (20%),
deadline-risk (15%). It's a **direction indicator, not gospel** — the dashboard always shows the
components beneath it so a "72" is never trusted blindly. (This is the same discipline as your
claims library: no fake precision.)

**Delivery:** Analytics scheduled email at 08:00 IST + a Cliq bot digest posting the headline
numbers and *only the red items* to Rahul's DM. The push is deliberately short — the full dashboard
is one click away; the digest is the five-second read.

**AI:** `Rule`-based anomaly flags first; `Zia-ML` anomaly detection and `GenAI` narrative summary
("what changed and why it matters") layered on once there's enough history to be meaningful. **ROI:
HIGH** — this is your leverage as a founder who can't watch everything.

**Failure recovery:** if a data source is stale, the digest says so explicitly (never shows a
confident number built on missing data).

---

## 5. Consolidated ROI ranking (the build order)

**HIGH ROI — build first (revenue & risk):**
S1 Speed-to-Lead · S2 Case Pipeline · S3 Deadline/APS Guardian · Founder Dashboard (§4) ·
F1 Invoicing · F2 Payment reminders · F3 Revenue dashboard · I1 Overdue-task escalation ·
U1 Partner outreach follow-up.

**MEDIUM ROI — build as habits form:**
S4 Document assist · S5 Nurture drip · I2 Daily check-in (habit-first) · I3 Weekly rollups ·
I4 SOP/Learn · I5 Approvals · U2 Partner onboarding · U3 Contract reminders · M1 Attribution ·
M2 Campaigns · M3 Social · M4 Web analytics · H1 Leave · H2 Onboarding checklist.

**FUTURE — deferred on purpose (scale/data/volume not there yet):**
S6 Alumni · U4 Commission tracking · F4 Commission payout · F5 Expense/Payroll · H3 Recruit/ATS ·
H4 Interview scheduling (reuse Bookings) · H5 Performance · H6 Exit · Zia-ML lead scoring ·
Creator student portal.

---

## 6. Recommended phased sequence

- **Phase 0 (prerequisite, not optional):** Activate Zoho One (India DC); build CRM spine, pipeline,
  and the 5 core workflows (File 01); Books + GST + Razorpay. *Nothing below exists without this.*
- **Phase 1 — the money-and-risk spine:** S1, S2, S3, F1, F2, I1. This is where the ROI is.
- **Phase 2 — the control tower:** Founder Dashboard + F3 revenue dashboard + attribution (M1).
- **Phase 3 — the B2B engine:** U1 partner outreach + U2 onboarding (parallel to Phase 1 if
  partnership outreach is live per File 07).
- **Phase 4 — habits & marketing:** daily check-in, SOP/Learn, nurture, social, leave.
- **Phase 5+ — scale/AI:** document OCR assist at volume, Zia scoring once data exists, portal,
  alumni, commission ledger.

Build **one automation at a time**, each with its failure-recovery and an `#ops-alerts` heartbeat,
each proven on real data before the next. A working spine beats a broad, brittle web.

---

## 7. Risks & guardrails (what keeps me up at night as your COO)

1. **Building before Phase 0.** The tempting error is to design elaborate automations while Zoho is
   still off. Resist. Activation + CRM spine first, or all of this is theory.
2. **Automating the human brand away.** Hard gates stay on documents, visas, money-out, and public
   claims. Forever.
3. **Silent failure.** Every automation gets a reconciliation check + `#ops-alerts`. A lead lost to
   a broken flow is worse than no automation.
4. **Over-building for 5 people.** I will keep pushing back on enterprise HR/finance automation
   until headcount and volume justify it. Deferring is a decision, not a gap.
5. **DPDP surface area.** Each new automated data flow is reviewed for consent/retention. More
   automation, more responsibility.
6. **"AI" inflation.** We call rules rules. Zia/GenAI enters only where it beats a rule and the data
   supports it — and never in public copy until File 08 unlocks it.

---

## 8. What I recommend we do NOT automate yet (and why that's the right call)
Recruitment ATS, full attendance, performance reviews, exit workflows, commission payout, expense/
payroll, alumni network, and Zia ML scoring. Not because they don't matter — because at 5 people,
pre-launch, pre-Zoho-activation, building them consumes the exact energy the revenue spine needs,
and they automate volumes you don't have yet. We revisit each at a named trigger: ATS at ~15 FTE,
performance at the first real review cycle, commission tracking at the first signed paying partner,
Zia scoring at ~200 closed-won records. Automation you switch on at the right moment beats automation
you babysit for a year waiting for it to matter.

---

*Approve this and we build Phase 0 → Phase 1 in order, one automation at a time, each verified on
real data before the next. I'll spec each chosen automation to build-ready detail when we start it.*
