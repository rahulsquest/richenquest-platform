# COUNTRY-INTELLIGENCE-IMPLEMENTATION-PLAN.md — 2026-08-23

**Planning only. No schema deployed, no engine changed, no scoring touched.**

**Blocking input not yet available:** 6 verification emails sent, **0 replies** (inbox checked
2026-08-23; nothing received in 48h). EDISU's answer on advance ISEE Parificato changes the
Italy branch, so §3.2 is designed **both ways** rather than assuming one.

---

## 1 · Architecture

Four fact families, never merged, each with its own owner and update cycle:

```
Countries                 ← the state.        Slow-changing, authoritative
    │
    ├── Scholarship_Programmes   ← regional bodies. Annual bando cycle
    │        │
    ├── Accounts (opportunities) ← universities.    Annual fee/deadline cycle
    │
    └── RichenQuest guidance     ← ours.            Changes as we learn
```

**Why not one table.** A university's tuition, a region's bando deadline and a state's permit
window have different sources, different refresh rhythms and different people who can be
wrong about them. Merging them means one stale figure silently contaminates three claims and
nobody can tell which source failed.

**RichenQuest guidance stays in markdown, not in the CRM.** It is the one layer we author
rather than verify, and it must never be able to masquerade as a sourced fact inside a
recommendation payload.

---

## 2 · Data ownership

| Fact | Owner | Source of truth | Refresh | Who may change it |
|---|---|---|---|---|
| Tuition, university deadline, domains | University | its own published pages | annual | Ops, with a source URL |
| **Bando deadline, ISEE threshold, grant value** | **Regional body** | regional bando | **annual, and it moves** | Ops, with a source URL |
| Permit window, proof-of-funds, APS | State | ministry / mission | rarely | Ops, with a source URL |
| Sequencing, lead times, "start legalisation now" | **RichenQuest** | our own experience | as we learn | anyone — **but it is never presented as a verified fact** |

---

## 3 · Schema proposal — every field names its consumer

**Rule applied: a field with no consuming engine is not proposed.** Each row below names the
function that reads it. Where a consumer requires an engine change, that is stated and
deferred.

### 3.1 `Countries` — 1 record per country, 3 on day one

| Field | Type | Purpose | Source | Refresh | Validation | **Consumer** |
|---|---|---|---|---|---|---|
| `Country_Name` | text | key | — | — | unique, matches existing picklist values exactly | all |
| `Permit_Window_Days` | integer | legal deadline after arrival | ministry | rare | 1–365 | `studentRoadmap` (6-month horizon), `caseState` (SETTLING milestone — **engine change, deferred**) |
| `Proof_Of_Funds_EUR` | double | cash the family must arrange | mission | annual | > 0 | `studentReport` (cash-to-arrange line), `studentRoadmap` (3-month action) |
| `Proof_Is_Shown_Not_Spent` | boolean | separates shown from spent | mission | rare | — | `studentReport` — the distinction families get wrong |
| `Special_Certificate` | text | e.g. **APS** | ministry | rare | ≤120 chars | `studentRoadmap` (NOW action), `matchOpportunities` risk flag — **deferred** |
| `Special_Certificate_Lead_Weeks` | integer | makes it schedulable | ministry | rare | 1–104 | `studentRoadmap` — decides which horizon it lands in |
| `Legalisation_Authority` | text | e.g. Prefettura | state | rare | ≤120 | `studentReport` document guidance |
| `Top_Failure_Point` | text | drives the warning | ours + evidence | as learned | ≤200 | `studentReport` "what can block your journey" |
| `Source_URL` · `Verified_On` | website · date | provenance gate | — | — | **both required or the record is unusable** | `opportunityQuality`, `opportunityRefresh` |

**Populated day one, from facts already verified:** Italy 8-day permit + Prefettura · Germany
€11,904 shown-not-spent + APS · Hungary 30-day permit. **No empty record.**

### 3.2 `Scholarship_Programmes` — 1 per regional body

| Field | Type | Purpose | Source | Refresh | Validation | **Consumer** |
|---|---|---|---|---|---|---|
| `Body_Name` | text | ER.GO, EDISU… | — | — | unique | all |
| `Country` | lookup → Countries | placement | — | — | required | `matchOpportunities` — **deferred** |
| `Region` | text | the real unit | — | — | ≤120 | `studentReport` |
| **`Bando_Deadline`** | date | **the deadline that forfeits the money** | regional bando | **annual** | must be a real date; **never inferred** | `studentRoadmap` binding-deadline logic — **engine change, deferred** |
| `ISEE_Threshold_EUR` | double | eligibility floor | bando | annual | > 0 | `matchOpportunities` eligibility — **deferred** |
| `Grant_Value_EUR` | double | what is at stake | bando | annual | > 0 | `studentReport` |
| `Requires_Advance_ISEE` | picklist Yes/No/Unknown | **the EDISU question** | bando | annual | defaults **Unknown** | `studentRoadmap` — decides whether a CAF step exists at all |
| `Accommodation_Capacity` | picklist High/Med/Low/Unknown | the real tie-break | bando/body | annual | defaults Unknown | region selection (human, not engine — **no engine consumer yet, so this is the one field I would defer**) |
| `Source_URL` · `Verified_On` | website · date | provenance | — | — | both required | `opportunityQuality` |

> **Honest note on `Accommodation_Capacity`:** it has no engine consumer today. By the rule
> above it should be **deferred**, even though the strategy calls it the tie-break. It becomes
> a field when region selection is automated, not before. Keeping it in markdown until then.

**Both branches of the EDISU answer are already handled** by `Requires_Advance_ISEE`:
`Yes` → roadmap inserts a CAF/ISEE step with months of lead time. `No` → that step is skipped
and Piemonte becomes the recommended region. `Unknown` → roadmap warns rather than guessing.
**No redesign is needed whichever way the reply goes.**

### 3.3 `Accounts` — 2 fields

| Field | Type | Purpose | Validation | **Consumer** |
|---|---|---|---|---|
| `Is_Public` | boolean | predicts affordability **and** verifiability | — | `opportunityQuality` (tiering), Ops research prioritisation |
| `Scholarship_Body` | lookup → Scholarship_Programmes | links a university to who controls its student's money | optional | `studentRoadmap`, `studentReport` — **deferred** |

### 3.4 Requirement Library — **markdown, not CRM**
`COUNTRY-REQUIREMENT-GAPS.md` and `ITALY-PATHWAY-MODEL.md` already hold it. It is guidance,
it changes as we learn, and it has no consuming engine. **Putting it in the CRM would give
authored opinion the appearance of a verified fact.**

---

## 4 · Validation rules

1. **Provenance gate, unchanged:** any Country or Scholarship record without `Source_URL`
   **and** `Verified_On` is unusable and must not be read by any engine.
2. **Deadlines are never inferred.** A missing `Bando_Deadline` stays empty. `Unknown` is a
   valid, honest state; a guessed date is not.
3. **`Requires_Advance_ISEE` defaults to `Unknown`**, never to `No`. The convenient default
   is the dangerous one.
4. **Country names must match the existing picklists exactly** — Zoho does not enforce
   picklist values, so a mismatch fails silently. This is the bug class already paid for
   twice.
5. **Staleness:** `opportunityRefresh` extends to flag Country and Scholarship records
   verified >90 days ago. Bandi are annual — a 12-month-old bando deadline is wrong, not old.

---

## 5 · Integration plan

```
Countries ─┐
           ├─→ studentRoadmap ──→ studentDashboard ──→ studentReport
Scholarship┘         ↑                    ↑
                     │                    │
Accounts ──→ matchOpportunities ──────────┘──→ student360
                     ↑
           studentIntelligence
```

**Sequenced so nothing breaks:**

| Step | Change | Engine impact |
|---|---|---|
| A | Create both modules, populate, verify | **none** — no engine reads them yet |
| B | `Is_Public` + backfill 21 records | **none** — not in any scoring path |
| C | `studentRoadmap` reads Countries | roadmap only; FIT untouched |
| D | `studentRoadmap` reads `Bando_Deadline`, computes the **binding** deadline | roadmap only |
| E | `studentReport` surfaces cash-to-arrange and the binding deadline | renderer only |
| F | *Only if evidence supports it:* eligibility uses `ISEE_Threshold_EUR` | **first scoring change — full regression** |

Steps A–E change **no score**. Step F is the only one that touches matching, and it is last.

---

## 6 · Migration risks

| # | Risk | Why it matters | Mitigation |
|---|---|---|---|
| 1 | **A country link becomes a gate field** | Debrecen and Pécs would instantly become **unrankable** — a self-inflicted regression that takes the portfolio from 2 to 0 | The verification gate stays exactly the 5 existing fields. **Country data is never a gate field.** |
| 2 | **`data_completeness` denominator shifts** | It is hard-coded `/9` and is ranking tie-break #4. Adding Accounts fields to that count silently lowers every existing record and reorders recommendations | Do **not** add new fields to the completeness count in the same change. Separate change, separate regression. |
| 3 | **`caseState` DEADLINE_PASSED semantics** | A passed *scholarship* deadline is not a passed *application* deadline. Conflating them would tell a student their intake is dead when only the funding is | New distinct blocker `SCHOLARSHIP_DEADLINE_PASSED`, **hard block for the money, not for the intake**. Deferred to step D. |
| 4 | **Roadmap anchor changes meaning** | Anchor currently = top-ranked reachable opportunity. With bando deadlines the *binding* date may belong to a different entity | Anchor stays the opportunity; the **binding deadline is reported separately**, so nothing silently re-anchors. |
| 5 | **Picklist mismatch on `Country`** | Saves silently, never matches, invisible in the record | Validation rule 4; verify against `settings/fields` before writing, as done for every prior schema change. |
| 6 | **Building before EDISU replies** | Could design the CAF step into the roadmap and then find Piemonte does not need it | `Requires_Advance_ISEE` makes both branches data-driven. **No code is conditional on the answer.** |

---

## 7 · Implementation order

| # | Action | Gate | Scoring change |
|---|---|---|---|
| 0 | **Wait for the 6 replies** | — | — |
| 1 | `Countries` module + 3 populated records | facts already verified | no |
| 2 | `Is_Public` + backfill | none | no |
| 3 | `Scholarship_Programmes` + ≥1 record | needs a verified bando deadline | no |
| 4 | `opportunityRefresh` covers the new modules | after 1 and 3 | no |
| 5 | `studentRoadmap` reads country requirements | after 1 | no — regression on roadmap only |
| 6 | Binding-deadline logic + `SCHOLARSHIP_DEADLINE_PASSED` | after 3 | no FIT change; `caseState` regression required |
| 7 | `studentReport` surfaces both | after 5–6 | renderer only |
| 8 | **Revisit matching** | evidence from real students | **yes — full 36-check regression** |

**Steps 1–7 change no score.** Step 8 happens only when real students have shown it is needed,
under the existing rule: student data exists, opportunity data exists, logic is explainable.

## What this plan deliberately does not do
No AI claim · no new scoring dimension · no field without a consumer · no CRM home for
authored guidance · no gate weakening · no work started before the replies that would shape it.
