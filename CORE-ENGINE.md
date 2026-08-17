# Core Engine v1.0 — 🔒 FROZEN

**Frozen 2026-08-17.** Everything built after this date **consumes** these functions.
Nothing built after this date independently decides **risk, priority, next action,
blockers, or eligibility**.

---

## The chain

```
normalizeInput()      canonical values          — one place picklists are fixed
        ↓
parseInquiry()        ingestion                 — WhatsApp/form → Lead
        ↓
leadToPlan()          enquiry → plan            — matching, translations
        ↓
caseState()           SINGLE SOURCE OF TRUTH    — state, blockers, milestone, evidence
        ↓
student360()          one-case operating view   — renders caseState
buildWorkQueue()      team operating queue      — ranks caseState
recordStateEvent()    audit timeline            — appends caseState transitions
```

`student360`, `buildWorkQueue` and `recordStateEvent` are **siblings**, not a
sequence. All three call `caseState` and none calls another.

---

## The rule

> A new feature may **read** the engine. It may **render** the engine.
> It may not **re-decide** what the engine already decided.

Two failures this rule exists to prevent, both already survived once:

1. **Picklist drift.** Zoho does not enforce picklist values — a probe wrote
   `"Masters"` into a field whose only valid value is `"Master's"` and the record
   saved silently. `normalizeInput` exists so there is one place to fix a picklist.
2. **Rule drift.** `student360` v1 and `caseState` each decided independently what
   counted as a risk. Two copies of one rule drift the first time one is edited and
   the other is not. `student360` v2 asks and renders.

---

## Hard blocks are state, not score

Some conditions **always** dominate, however distant the deadline. What makes them
urgent is *how long they take to clear*, not *when they are due* — so multiplying
by urgency ranks them exactly backwards.

```
Hard block present?  ──YES──▶  band = HIGH.  No arithmetic.
        │
        NO
        ▼
  (6 − worst severity) × urgency   ──▶  MEDIUM ≥ 12, else LOW
```

The score still exists, but only to **order cases within a band** — `sortByScore()`
does that ordering, because Deluge cannot sort a list of maps by one of their keys.

**MEDIUM threshold is 8, calibrated not guessed.** At the original 12 the band was
empty: a soft blocker with a deadline inside 45 days scores 8 and fell to LOW, which
under-calls a this-week task as a whenever task. Since urgency 5 only occurs on Red —
now a hard block — the highest reachable soft score is 16, so 12 left MEDIUM covering
almost nothing.

### Implemented hard blocks

| Code | Trigger | Why it dominates |
|---|---|---|
| `REFUSAL_NOT_RECORDED` | `Visa_Decision = Refused`, `Refusal_Grounds` empty | The grounds are irrecoverable once memory fades |
| `CONSENT_MISSING` | `Contact.Consent_Given ≠ true` | DPDP. Cannot be cured retrospectively |
| `NO_PASSPORT` | `Passport_Status` not held | Takes weeks; blocks everything downstream |
| `TIMING_LOST` | `Visa_Ops_Risk = Red` | The intake is already unreachable |
| `APPOINTMENT_WITHOUT_DOCUMENTS` | Slot booked, documents incomplete | A counter rejection costs the slot, not the day |
| `DEADLINE_PASSED` | Application deadline passed, `Submitted_On` empty | Permanently unrecoverable |

### Soft blockers (scored)

`NO_START_DATE` (2) · `AWAITING_SLOT` (2) · `DOCUMENTS_INCOMPLETE` (3)

### ⚠️ Declared but NOT implemented

**"Payment legally required before submission"** — there is no payment field at case
level to read. Inventing one would be worse than the gap.

> **FOUNDER DECISION REQUIRED:** which countries or universities require payment
> before submission, and where that state should live. Until answered, this hard
> block does not exist and no code pretends it does.

---

## The audit timeline

`Case_Events` — append-only. Never overwritten, never updated.

| Event | Meaning |
|---|---|
| `FIRST_SNAPSHOT` | First evaluation. The timeline has a beginning, not a mid-sentence start |
| `STATE_CHANGE` | Computed state moved |
| `BAND_CHANGE` | HIGH/MEDIUM/LOW moved, with the basis recorded |
| `BLOCKER_RAISED` | Answers *when did this go wrong* |
| `BLOCKER_CLEARED` | Answers *how long did we take to fix it* |

**Writes happen on CHANGE, never on read.** `caseState` is called on every dashboard
render, queue build and PDF. If it appended on read, opening a student eleven times
would write eleven identical rows and the timeline would be worthless exactly when it
mattered. `recordStateEvent` compares against `Deals.Last_State_Snapshot`
(`"STATE|BAND|CODES"`) and writes nothing when they match — which is what makes it
safe to call as often as anyone likes.

The snapshot advances **only after** the events are written. A failed write leaves the
snapshot stale, the next run detects the same change and retries: a duplicated event is
recoverable, a missing one is not.

Verified 2026-08-17 — run 1 wrote `FIRST_SNAPSHOT`; runs 2 and 3 wrote nothing; passport
set to Valid; run 4 wrote `BLOCKER_CLEARED` + `BAND_CHANGE`; run 5 wrote nothing.

---

## What comes next is UI, not engine

1. ✅ Counsellor Dashboard — `ui/counsellor-queue.html`, renders `buildWorkQueue`
2. Manager Dashboard — aggregates `caseState`
3. Parent PDF — `student360` → render
4. Client Portal — `student360` → render
5. Real student onboarding
6. Weekly review from actual cases

**`learningEngine()` is deliberately deferred until ~20–30 real students exist.**
Building an outcomes engine before there are outcomes produces a dashboard with
nothing in it, which is the failure mode this project has already been warned about.

Progress is measured in **students moved through the engine**, not functions written.
