# File 49 — Founder dependency reduction

**The brief's objective is to reduce founder dependency, not to add departments.** So this pass began
with Department 9 — the automation review — because auditing before adding is the only order that
actually removes work. **It immediately found a defect in the previous phase's own delivery.**

---

## 1. Department 9 — the automation audit, run first and run for real

A call graph was built across all 28 Deluge functions (3,481 lines). Four findings, in order of
severity.

### 1.1 🔴 `visaOpsPlan` had no caller. Nothing ever ran it.

**File 47 §5 stated "Nightly, every open case → `visaOpsPlan`" as though that were built. It was
not.** The function was written, deployed, executed against probes, verified — and then wired to
nothing.

**The consequence was worse than a missing feature.** `opsWatch` reads `Visa_Ops_Risk` and alerts on
Amber or Red. So the watcher was faithfully watching a field that nothing kept current:

> **A case would have sat Green while its last safe filing date passed, and the daily watch would
> have agreed with it. A stale green light is more dangerous than no light at all** — it converts an
> absent safeguard into a false assurance.

**Fixed.** `visaOpsSweep` re-plans every open case; `schedVisaOpsSweep` runs it daily at **05:30 —
deliberately one hour before `opsWatch` at 06:30**, because the sweep writes the field the watch
reads. Reversing them would alert on yesterday's risk.

**Verified on three probes:** an open case with a start date planned and transitioned `null → Red`;
an open case without one was reported as **unplannable rather than silently skipped**; a closed case
was skipped. CRM writes confirmed, probes deleted.

**This is the entire argument for a weekly automation review, and it earned its place on day one.**

### 1.2 🟠 `assignCounselor` had no caller. Every lead landed on the founder.

Built, deployed, orphaned. Wired into `wfLeadCreated`.

There are no Counselor users today (licence-blocked), so it currently returns `no active counselors`
and the lead correctly stays with the founder — **the designed refusal, not a failure.** The day a
Counselor licence exists, routing starts working with no code change and nobody having to remember
this file.

**Regression after the change: 18/18 pass, 0 leaked probes.**

### 1.3 🟡 `generateCounsellingBrief` and `studentActionPlan` are on a collision course

They overlap — both take budget, level, country and English status and produce an assessment plus a
document checklist. They are **not** duplicates today: one answers *"which country"* deterministically
without needing CRM data, the other answers *"which university"* from verified records.

**With 3 verified universities, the country-level answer still carries real weight.** Deleting it now
would remove the only useful answer for a student whose profile matches no verified university.

> **Merge trigger, recorded so it is not forgotten: when ≥10 universities are verified across ≥3
> countries, retire `generateCounsellingBrief` and fold its country reasoning into
> `studentActionPlan`'s empty-shortlist path.**

That is more honest than deleting it early or ignoring the overlap.

### 1.4 🟡 Two daily digests compete for the same attention

`opsWatch` at 06:30 and `schedFounderDigest` at 07:30. Both are silent when nothing moved, so today
the founder receives zero or two emails, never a steady one. **Acceptable while volume is zero;
merge them if the founder ever reports two emails in one morning.** Not merging pre-emptively —
they have genuinely different audiences (operations vs. commercial).

### 1.5 What the audit did NOT find

- **No unused custom fields.** Zoho reports one unused field on Deals: `Record_Image`, a platform default.
- **No dead code beyond 1.1 and 1.2.** The other five uncalled standalones — `qualifyLead`, `searchKnowledge`, `publishKnowledgeArticle`, `studentActionPlan`, `generateCounsellingBrief` — are legitimate human/REST entry points.
- **`verifyPlatform` is 545 lines, 16% of the codebase.** That is a healthy test-to-code ratio, not debt. It is what caught 1.2 being safe to ship.

## 2. Department 8 — the quality gate

`qualityGate(text, has_source)` is the single gate every customer-facing draft passes before reaching
a human approver.

**It does not approve anything.** It catches the specific, repeatable mistakes that would otherwise
reach a family, so the reviewer spends attention on judgement instead of proofreading for the same
six errors every time.

| Check | Blocks on |
|---|---|
| **COMPLIANCE** | guarantee · success rate · approval rate · chances of · you will get · salary package · job guarantee |
| **CLAIMS** | "placed" about students · any partnership assertion · any ranking claim |
| **SOURCE** | the author has not asserted traceability to a verified record or `claims.json` |
| **ADVISORY** *(warns, never blocks)* | percentages · money figures · IELTS/deadline/intake · living costs · migration and work rights · appointment language |

**Advisory checks warn rather than block on purpose. A gate that cries wolf gets switched off, and
then it protects nothing.**

**Verified live.** A realistic bad draft — *"We are partnered with top ranked universities and have
placed over 1000 students. 95% visa success rate. You will get a scholarship guaranteed. Salary
package up to EUR 60000."* — returned **BLOCK with 9 violations**. A paragraph from the approved
Debrecen pack returned **PASS with 2 sensible warnings**.

**PASS never means approved.** It means no known violation was detected. A named human still signs.

## 3. Department 7 — Work Visa B2B: a legal stop condition, stated precisely

The brief asks for licensed recruiters, verified employers, staffing partners, commission models and
a candidate pipeline. **I researched the regulatory position before designing any of it, and the
answer stops the department at the first step.**

> **Under the Emigration Act 1983 (India), a person may operate as a recruiting agent for emigrants
> ONLY if registered.** The Registration Certificate is granted by the **Protector General of
> Emigrants** under **sections 11–12**, renewed under section 13, and may be suspended, cancelled or
> revoked under section 14.

**RichenQuest does not hold a Registration Certificate.** Until it does, the following cannot be
operated, regardless of how they are labelled:

| Cannot operate | Why |
|---|---|
| Recruiting candidates for an overseas employer | The registered activity itself |
| Taking a fee or commission for a job placement abroad | Same |
| A candidate-to-employer matching pipeline | Same, whatever the CRM calls it |
| Partnering with a staffing firm to source candidates | Sourcing for an employer is the regulated act |

**This is a stop condition of exactly the type the brief lists — legal restriction — and it is the
correct place to stop.** The penalty structure exists because this is the area of Indian migration
with the longest history of worker exploitation. Building the pipeline first and seeking the licence
afterwards would be the wrong order in every sense.

**I am not a lawyer and this is not legal advice.** The scope of "recruitment" versus general
information-provision is exactly the kind of line that needs a practitioner, and the answer changes
what — if anything — is permissible without an RC.

### What I built instead: nothing, and here is why that is correct

**No CRM pipeline, no partner onboarding SOP, no job-matching SOP, no candidate qualification
workflow.** All four would be scaffolding for an unlicensed activity, and their existence would
create pressure to use them.

**The one thing worth doing now is the licence question itself**, and it is a founder task:

| | |
|---|---|
| **W1** | Obtain legal advice on whether RichenQuest's intended work-visa activity requires a Registration Certificate under the Emigration Act 1983, and what falls outside it |
| **W2** | If it does — decide whether to pursue an RC. It is a real business decision with real compliance overhead, not a formality |

**Only after W1 returns does Department 7 have a shape.** Designing it now would mean designing
against a guess about the law.

## 4. Departments 1, 4, 5 — already built, and the honest accounting

The brief lists these as new departments. **Most of their contents already exist**, which is the
point of "prefer improving existing assets over creating new ones."

| Asked for | Status |
|---|---|
| Student profile summary · shortlist · risks · missing info · timeline · scholarships · documents · alternatives | ✅ `studentActionPlan` |
| Counselling brief · country reasoning | ✅ `generateCounsellingBrief` |
| Lead qualification · duplicate detection | ✅ `qualifyLead` |
| Visa readiness | ✅ `visaOpsPlan` — **and now actually running** (§1.1) |
| Deadlines · offers · appointments · high-risk cases · auto tasks | ✅ `opsWatch` + `createFollowUpTasks` |
| Counsellor assignment | ✅ **newly wired** (§1.2) |
| **Payment proposal · pricing explanation · payment plan** | 🔴 **blocked on F1 — the fee is unset** |
| **Objection handling · follow-up sequences · WhatsApp and email drafts** | ⚠️ **written as content, not as code** — see below |

### Why follow-up sequences are not a function

The brief wants generated WhatsApp and email follow-ups. **The drafts exist** (Debrecen pack §10–11,
`outreach/READY-TO-SEND.md`). **Generating them per-student in Deluge would produce string-assembled
messages of markedly lower quality than the human-written templates already sitting in the repo**, and
every one would still need approval before sending.

> **The bottleneck in follow-up is not writing the message. It is that no student exists to send it
> to.** Automating the writing step saves a counsellor perhaps four minutes and risks the one channel
> where tone decides whether a family replies.

**The right build order: personalise the existing templates when there are students, not before.**

## 5. Departments 2 and 6 — content and library

**Improved rather than rebuilt.** The Debrecen pack (12 asset types) and 23 knowledge articles exist.
Every future asset now passes `qualityGate` before entering the approval queue.

**No content calendar yet, deliberately.** A calendar with one verified university is a list, not a
calendar. **It becomes worth building at ~5 verified universities**, which is the same trigger that
makes the matcher useful.

## 6. Scoreboard against the primary KPI

**"Reduce manual operational work by another 50%."** Honest accounting, since current volume is zero
students and a percentage would be arithmetic on nothing:

| Manual task removed or prevented | Who it was falling to | KPI |
|---|---|---|
| **Re-checking every case's visa timing by hand** — the safeguard that was silently not running | counsellor · founder | 4, 5, 8 |
| **Routing every new lead by hand** | founder | 5 |
| **Proofreading every draft for the same six claim errors** | founder | 5, 8 |
| **Chasing stale university data by memory** | counsellor | 3, 8 |
| **Noticing an appointment booked against an incomplete file** | counsellor | 3, 8 |
| **Designing an unlicensed work-visa business, then unwinding it** | founder | 5, 8 |

**The last row is the largest saving in this pass and it is invisible on a burndown chart.**

## 7. Founder actions

| # | Action | Type | Priority |
|---|---|---|---|
| **W1** | **Legal advice: does the intended work-visa activity need an Emigration Act RC?** Department 7 has no shape until this returns | **legal — STOP CONDITION** | **P1** |
| **W2** | If yes — decide whether to pursue a Registration Certificate | decision | P2 |
| **F1** | **Set the fee.** Still the single unblocking decision for the sales copilot | decision | **P1** |
| **F-NEW-5** | Approve the Debrecen content pack | approval | P1 |
| Q1 | Confirm the `qualityGate` banned-phrase list matches how you want RichenQuest to speak | approval | P2 |
