# PILOT-OPERATIONS-RUNBOOK.md — 2026-08-23

The procedure to follow with a student in front of you. Strategy, cohorts and responsibilities
live in `FIRST-10-STUDENT-PILOT-PLAYBOOK.md`; this is the sequence.

---

## BEFORE THE STUDENT

### B1 · Consent — automatic, and it gates everything
Recorded by the wizard as `Consent_Given` + `Consent_Timestamp` + `Consent_Policy_Version`.

**Verify it exists before doing anything else.** `studentDashboard` already refuses to
assemble a payload without it and returns *"consent not recorded — no intelligence payload
assembled"*. If you see that, the answer is to obtain consent, never to work around it.

### B2 · Profile completion
Run `studentIntelligence`. Read two numbers:

| | Meaning | If low |
|---|---|---|
| `profile_completeness` | how much they told us | **< 70%** → ask for the named `missing_fields` before generating anything |
| `profile_strength` | their standing, 0–100 | not a gate — never used to rank students |

Generating a report from a 40%-complete profile produces a thin recommendation and burns a
pilot student. **Complete the profile first.**

### B3 · Counsellor preparation
- [ ] Open `student360` — **not** the raw CRM record
- [ ] Read the whole file. **You may not ask a question the wizard already answered**
- [ ] **Students 1–3 only:** write down your research-time estimate *before* opening the
      report. Once you have read it you cannot un-know it, and the baseline is gone

---

## DURING

### D1 · Generate the report
`studentReport` returns `approved: false` **by design**. It is not sendable until a human
clears it.

### D2 · ⚠️ SAFETY REVIEW — the gate

**Every box, every student, before anything is sent. A "no" stops the send.**

| # | Check | Fails if |
|---|---|---|
| 1 | **Source verified** | any figure lacks a `source_url` **and** `verified_on` |
| 2 | **Deadline valid** | any shown opportunity has `deadline_status: CLOSED`, or a date nobody sourced |
| 3 | **Financial fit checked** | `financial_fit` is UNAFFORDABLE and the report does not say so plainly |
| 4 | **Recommendation understandable** | you could not explain the ranking to this family in one sentence |
| 5 | **"Would this mislead the student?"** | **answered explicitly — yes or no, written down** |

Check 5 is not rhetorical. **It must be answered in words for every student**, because it is
the only question that separates a cosmetic flaw from one that costs a family money.

**Any of these four = stop the pilot, not just the send:**
an unverified figure reached a report · a closed intake presented as reachable · probability
or guarantee language appeared · a mentor was recommended without verified credentials.

### D3 · Record approval, then send
`REPORT_APPROVED` → `REPORT_SENT`. Both are `Case_Events`.

### D4 · Student discussion
- Walk the report **in the student's order**, not the document's — start with what they asked about
- State the **total** cost before tuition, and name the source out loud
- Name the **binding deadline** and say which kind it is
- Say one true thing that is not good news. A conversation with no risk in it was a sales call
- Ask **"what did I not explain well?"** — not "do you have questions?", which reliably gets "no"

---

## AFTER

### A1 · Feedback — within 24 hours
`STUDENT-FEEDBACK-TEMPLATE.md`. Collected **after** the call so they rate the product, not the
person. Never incentivised. Logged as `STUDENT_FEEDBACK`.

### A2 · Correction classification — same day
`COUNSELLOR-FEEDBACK-TEMPLATE.md`. Check **DATA first, always** — most apparent logic failures
are missing fields in disguise.

| Class | Action | Threshold |
|---|---|---|
| `CORRECTION_DATA` | verify + fix the record | same day |
| `CORRECTION_UX` | reword — **never the score** | same week |
| `CORRECTION_LOGIC` | change the engine | **3 independent students** |

**Log every LOGIC error immediately. Act on none until the third.** If the third never comes,
that is the finding.

### A3 · Outcome logging
Real events only, as they happen: `OPPORTUNITY_VIEWED` · `OPPORTUNITY_SHORTLISTED` ·
`APPLICATION_SUBMITTED` · `OFFER_RECEIVED` · `VISA_APPROVED` · `ENROLLED`, and the rest of
the 21.

**Do not log an event that has not happened.** The outcome dataset is the only asset here
that compounds, and a single invented row makes all of it untrustworthy.

---

## Daily, during the pilot — 10 minutes
- [ ] Any lead > 48h with no call attempt → call now
- [ ] Any report generated but not reviewed → review or say why
- [ ] Any `CORRECTION_LOGIC` reached 3 occurrences → escalate to founder
- [ ] Any stop-rule breach → halt, do not continue to the next student
