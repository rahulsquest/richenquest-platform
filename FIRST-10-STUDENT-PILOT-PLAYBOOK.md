# FIRST-10-STUDENT-PILOT-PLAYBOOK.md — 2026-08-23

Supersedes `FIRST-10-STUDENT-PILOT-PLAN.md`, `PILOT-METRICS.md` and
`ops/STUDENT-PILOT-CHECKLIST.md`, which are removed to keep one source of truth.

---

## ⚠️ Cohort A cannot run as specified — checked, not assumed

| Check | Result |
|---|---|
| Italian opportunities in CRM | **0** |
| Countries present | Hungary 4 · Germany 12 · Ireland 3 · Poland/NL/Malta/Spain 1 each |
| Fully rankable today | **2 — Debrecen and Pécs, both Hungary** |

An Italy-focused cohort would return *"no verified options"* for every student. That tests
nothing about scholarship pathway intelligence, and it burns ten scarce first students on a
question the system cannot yet answer. Italy is also a **September 2027** market — recorded
☠️ DEAD for February.

### Two honest options

**Option 1 — defer Cohort A to September 2027.** Correct, and it costs the pilot its most
differentiated test.

**Option 2 — RECOMMENDED. Redefine Cohort A as the *honest-refusal* cohort.**
Recruit 3 students who want Italy. Tell them plainly: *"We do not have verified Italian
options yet. Here is what we do have, here is what Italy would require, and here is why we
will not guess."* Then measure whether that **builds or destroys trust**.

That is a real experiment with a real result either way, and it tests the single riskiest
assumption in the whole product: **that families reward honesty about gaps.** If they do not,
the verification-first thesis is in trouble and it is better to learn that at student 3 than
at student 300.

**Revised cohorts:** A — 3 Italy-interest (honest-refusal test) · B — 7 general Europe
(matching, comparison, roadmap).

---

## Responsibilities

| Role | Owns |
|---|---|
| **Student** | consent · profile completion · feedback |
| **Counsellor** | review **before** anything is sent · corrections + classification · approval |
| **Ops** | fixing DATA errors · verification emails · CRM hygiene |
| **Founder** | the LOGIC-error decision at 3 occurrences · stop-rule calls |
| **Engine** | profile, matching, ranking, roadmap, report — **never the last word** |

---

## Student journey

```
Portal link ─→ consent ─→ 11-step wizard (~10 min, save & resume)
   ↓ automatic
case number + counsellor name + callback time, within minutes
   ↓ within 48h
counsellor call — they have READ the file, no repeated questions
   ↓ within 3 working days
student report: options, why, what's missing, roadmap, next action
   ↓
feedback (4 ratings + 3 questions)
   ↓
outcome events as things actually happen
```

## Counsellor journey — per student

**Before the call**
- [ ] Open `student360`, never the raw CRM record
- [ ] **Record your pre-read research estimate** — see the baseline note below

**Before anything reaches the student**
- [ ] Run `studentReport` (returns `approved: false` by design)
- [ ] Every figure has a source URL and a verification date
- [ ] No opportunity shown has `deadline_status` CLOSED
- [ ] Nothing reads as a guarantee or a probability
- [ ] Ranking explanation matches what the student would expect
- [ ] Nothing contradicts the call
- [ ] Log every correction with its classification
- [ ] Record `REPORT_APPROVED`, then send

### ⚠️ The baseline problem — decide before student #1
The brief asks for *counsellor time saved*. **That cannot be measured without a "before".**
Once a counsellor has used the report they cannot un-know it, so the baseline must be captured
first.

**Method:** for students **1–3 only**, the counsellor writes down *"how long would I normally
spend researching this student's options?"* **before** opening the report. Rough is fine —
an honest 30-second estimate beats a precise number invented afterwards. Students 4–10 record
review time only, and the comparison is 1–3 estimate vs 4–10 actual.

---

## Correction rule — unchanged and non-negotiable

| Class | Action | Threshold |
|---|---|---|
| `DATA_ERROR` | verify the record, fix same day | immediate |
| `UX_ERROR` | change wording or layout, never the score | immediate |
| `LOGIC_ERROR` | change the engine | **3 independent students, minimum** |

One student never justifies a logic change. Tuning to one person is how a system stops
generalising — and with 10 students, one loud case is 10% of the sample and will feel like a
pattern when it is noise.

## Stop rules — halt the pilot immediately

1. An **unverified figure** reaches a student.
2. A **closed intake** is presented as reachable.
3. A student is given an **admission, visa or scholarship probability**.
4. A **mentor** is recommended without verified credentials.

These are not metrics. They are the product's promises, and breaking one is worse than
running no pilot at all.

## Honest expectation
With 2 verified opportunities, most students will see **one or two options, both Hungarian**.
The pilot does not hide that. The real question is narrower and more useful than "does the
engine work": **is a verified, explained, single option more useful to a family than the long
unverified lists they get everywhere else?**
