# COUNSELLOR-FEEDBACK-TEMPLATE.md

Completed during report review, **before** anything is sent to the student. One row per
correction. If nothing is wrong, record zero corrections — that is the most valuable row in
the table.

---

## Correction log

| Field | Example |
|---|---|
| Student / case | RQ-260823-1234 |
| Opportunity | University of Pécs |
| **What the engine said** | *"English requirement not recorded — confirm before advising on IELTS"* |
| **What is actually true** | PTE publishes IELTS 6.0 for this programme |
| **Classification** | `DATA_ERROR` |
| Evidence | international.pte.hu URL |
| Would this have misled the student? | **yes / no** |
| Time to correct | 5 min |

**"Would this have misled the student?"** is the column that separates a cosmetic issue from a
dangerous one. A wrong figure a student would have acted on is a different severity from an
awkward sentence, and the count of yes-answers is the pilot's real safety metric.

## Classification — decide in this order

```
Was the underlying data wrong or missing?
        │ yes → DATA_ERROR
        │ no
        ▼
Was the data right but the conclusion wrong?
        │ yes → LOGIC_ERROR
        │ no
        ▼
Was the conclusion right but unclear to the student?
              → UX_ERROR
```

**Check DATA first, always.** Most apparent logic failures are missing fields wearing a
disguise, and "the engine is wrong" is a more satisfying diagnosis than "we did not verify the
record", which makes it the more dangerous one.

| Class | Fix | Who | When |
|---|---|---|---|
| `DATA_ERROR` | Verify against source, update the record | Ops | same day |
| `UX_ERROR` | Reword the report — **never the score** | Ops | same week |
| `LOGIC_ERROR` | Change the engine | Founder | **only at 3 independent students** |

## The LOGIC_ERROR threshold — why it is strict

With ten students, one case is 10% of the sample. A single vivid failure will feel like a
pattern and it usually is not. Three independent students showing the same correction is
evidence; one is an anecdote, and an engine tuned to an anecdote stops generalising.

**Log every LOGIC_ERROR immediately. Act on none of them until the third.** If the third
never comes, that is the finding.

## Per-student summary — 60 seconds

| | |
|---|---|
| Corrections: DATA __ · LOGIC __ · UX __ | |
| Any that would have misled the student? | yes / no |
| Report approved unchanged? | yes / no |
| **Review time** (minutes) | __ |
| **Students 1–3 only — pre-read research estimate** | __ min *(before opening the report)* |
| Anything the engine should have known and did not? | free text → the missing-intelligence list |

## Escalate immediately, do not wait for three

- An **unverified figure** appeared in a report
- A **closed** opportunity was presented as actionable
- Any **probability or guarantee** language reached the output
- A student was recommended something **outside their stated budget** without it being flagged

These are stop-rule breaches. They halt the pilot; they are not corrections.

## One thing to record even when nothing is wrong
**What did the report save you from doing?** Free text, one line. It is the only qualitative
evidence of counsellor value the pilot will produce, and it will be more persuasive than the
time estimate — which is self-reported, n=10, and should be presented as weak.
