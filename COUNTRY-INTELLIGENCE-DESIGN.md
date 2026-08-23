# COUNTRY-INTELLIGENCE-DESIGN.md — 2026-08-23

**Design only. Nothing deployed, no field created, no scoring changed.**

---

## 0 · The audit result that determines everything below

| Question | Answer |
|---|---|
| Is there a Country entity? | **No.** Country is a picklist *string* on `Accounts.University_Country` and `Deals.Destination_Country` |
| How many opportunity-side deadline fields exist? | **One** — `Next_App_Deadline` |
| Requirement fields? | `Eligibility_Summary` (textarea, **0/23 populated**), `Readiness_Gaps` (textarea) |

**Country-level facts currently have nowhere to live.** The APS requirement, the 8-day permit
window, DSU regional process, legalisation rules — none of these belong to a university, and
there is no record they can attach to. They exist today only in markdown.

**And one date field cannot represent five different deadlines.** That is not a gap in
coverage; it is a category error, and it is the one that can cost a family €14–16k.

---

## 1 · Italy intelligence design — facts separated by owner

The brief's instruction not to mix these is the right one, because **they have different
owners, different sources and different update cycles.**

### 1a · University facts — owner: the university
| Fact | Example (Pécs) | Source type |
|---|---|---|
| Tuition band | €4,400–7,800/yr | university fee table |
| University application deadline | 2026-09-30 | faculty page, **per-programme** |
| Programmes / domains | Engineering, Health, Business… | fee table |
| English requirement | per programme | admissions page |

### 1b · Regional scholarship facts — owner: the DSU body, **not the university**
| Fact | Example | Source |
|---|---|---|
| Regional body | ER.GO · EDISU · ERDIS · ERSU | regional |
| **Bando deadline** | closes **before** the university's | regional bando |
| ISEE threshold | **€25,000** (ER.GO, verified) | bando |
| ISEE Parificato required in advance? | **Provisionally NO in Piemonte** | EDISU — *unconfirmed, email sent* |
| Grant value | ~€14–16k incl. housing + meals | bando |
| Accommodation capacity | varies by region | regional |
| *Fuori sede* treatment | family resident abroad → highest band | bando |

**A university in Bologna and one in Turin differ more by their regional body than by
anything the university does.** This is why the region is the unit of selection.

### 1c · Visa and immigration facts — owner: the Italian state
Proof of means (DSU outcome can contribute) · **residence permit within 8 days of arrival** ·
document legalisation by the **Prefettura**.

### 1d · Operational guidance — owner: RichenQuest
When to start legalisation · which CAF · how to sequence admission against the bando ·
year-two credit compliance. **This is the only layer that is ours**, and it is the product.

---

## 2 · Country requirement framework

One shape, three countries. Fields are illustrative of the *model*, not values to import.

```
Country
├── admission        entry requirements · English routes · per-programme deadline behaviour
├── scholarship      body · deadline · threshold · documentation · value · who is eligible
├── financial        proof-of-means amount · is it spent or shown · when it must exist
├── documents        list · translation · legalisation authority · lead time
├── visa             appointment reality · typical lead time · what the student signs
├── arrival          permit window (legal) · registration
├── failure_points   ranked, with what each one costs
└── preparation      earliest sensible start, worked backwards
```

| | **Italy** | **Germany** | **Hungary** |
|---|---|---|---|
| Financial requirement | ISEE ≤ €25,000 to qualify for DSU | **€11,904 blocked account** — shown, not spent | proof of funds |
| Scholarship | **DSU, regional, €14–16k** | limited | Stipendium Hungaricum |
| Distinctive document | **legalised consular income docs** | **APS certificate** | standard set |
| Lead time on that document | **months** | **months** | weeks |
| Permit window | **8 days** | ~90 days | 30 days |
| Top failure point | **missing the bando deadline → forfeits €14–16k** | **starting APS too late → misses intake** | documents late |
| Deadline that actually binds | **scholarship**, not university | **APS**, before anything | university |

**The last row is the whole point.** In only one of these three countries is the university
deadline the binding one.

---

## 3 · Deadline intelligence model

Five categories, never collapsed into one field:

| Category | Owner | Miss it and… |
|---|---|---|
| `UNIVERSITY` | university | lose that university, this intake |
| `SCHOLARSHIP` | regional/national body | **lose the money — often irrecoverable** |
| `DOCUMENT` | consulate / Prefettura / APS | lose everything downstream |
| `VISA` | mission | lose the intake |
| `ACCOMMODATION` | regional body / university | grant without a bed |

**Rule: the binding deadline is the earliest one, not the university one.** Today the engine
reads `Next_App_Deadline` and calls it *the* deadline. For an Italian DSU student that is
wrong in the most expensive possible way — it would show a September university deadline as
open while the July bando that carried €14–16k had already closed.

`caseState` already treats `DEADLINE_PASSED` as a **hard block**. The logic to handle this
exists. **Only the data is missing.**

---

## 4 · Roadmap integration — no engine change required

```
studentIntelligence  +  matchOpportunities  +  CountryRequirement
                              ↓
                        studentRoadmap
```

`studentRoadmap` already composes and orders. It would gain three answers:

- **"What you need to do now"** — earliest-starting requirement, by lead time
- **"What can block your journey"** — country `failure_points` matched to the student's gaps
- **"Which deadline matters most"** — the earliest across all five categories, with its type
  named, e.g. *"Your binding deadline is the ER.GO scholarship bando, not the university."*

---

## 5 · Schema changes — proposed, justified, NOT applied

Each row must pass the same test the brief sets: **would it be populated, and would it change
a recommendation?**

### Proposed: a `Countries` module — 1 record per country
| Field | Type | Justification |
|---|---|---|
| `Country_Name` | text | key |
| `Permit_Window_Days` | integer | Italy 8 / Hungary 30 / Malta 90 — legal, already documented in SOP-10 but unqueryable |
| `Proof_Of_Funds_EUR` | double | Germany €11,904 verified |
| `Proof_Is_Shown_Not_Spent` | boolean | the distinction families get wrong |
| `Special_Certificate` | text | **APS** for Germany — months of hidden lead time |
| `Special_Certificate_Lead_Weeks` | integer | makes it schedulable |
| `Legalisation_Authority` | text | Prefettura for Italy |
| `Top_Failure_Point` | text | drives roadmap warnings |
| `Source_URL` / `Verified_On` | website / date | same gate as opportunities |

**Populated on day one for 3 countries from facts already verified.** Not empty.

### Proposed: a `Scholarship_Programmes` module — 1 per regional body
`Body_Name` · `Country` · `Region` · **`Bando_Deadline`** · `ISEE_Threshold_EUR` ·
`Grant_Value_EUR` · `Requires_Advance_ISEE` · `Accommodation_Capacity` · `Source_URL` ·
`Verified_On`.

**Justification:** the DSU deadline is the single most expensive missing field in the system
and it belongs to neither a university nor a country — it belongs to a regional body. There
is no existing record type it can attach to without being wrong.

### Proposed on `Accounts` — 2 fields
`Is_Public` (boolean) — predicts affordability *and* verifiability; would have tiered the
portfolio without reading 21 records by hand.
`Scholarship_Body` (lookup → `Scholarship_Programmes`) — links a university to the body that
actually controls its student's money.

### Explicitly NOT proposed
Per-category deadline fields on `Accounts`. Deadlines belong to whoever owns them —
scholarship deadlines on the scholarship record, document deadlines derived from lead times.
Five date fields on a university record would recreate the same category error in a wider
form.

---

## 6 · Implementation priority

| # | Step | Why first |
|---|---|---|
| 1 | **Wait for the 6 replies** | EDISU's answer changes the Italy design; building before it arrives risks building the wrong thing |
| 2 | `Countries` module, 3 records | Smallest change, immediately populated, unblocks APS and permit windows |
| 3 | `Is_Public` on Accounts | One boolean, one backfill, high explanatory power |
| 4 | `Scholarship_Programmes` + the bando deadline | Closes the most expensive gap — but only after ≥1 Italian record exists to attach to |
| 5 | Extend `studentRoadmap` to read country requirements | Composition only; no scoring change |
| 6 | **Revisit matching last** | Nothing here needs a weight change. If country data later earns FIT weight, it goes through the same evidence test: student data exists, opportunity data exists, logic explainable |

**Nothing above touches FIT, ranking, the verification gate or the consent gate.**
