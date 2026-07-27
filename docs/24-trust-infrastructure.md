# Trust Infrastructure

**Version 1.0 · 2026-07-25 · Phase 3 foundation**
Governed by [the Constitution](20-constitution.md).

The Constitution is not a document people are asked to remember. It is machinery they
cannot bypass. This file describes that machinery and the contract every RichenQuest
interface consumes.

> **A user should feel the Constitution without reading it.**
> **Every important claim leaves evidence behind.**

---

## 1. Why this exists rather than a style rule

`claims-guard` is a **deny-list**: it checks copy against banned patterns. A deny-list
cannot catch a figure nobody thought to ban.

That is not hypothetical. **"33 destinations" was published on the homepage from the RC-1
cut onward with no entry in any register and no basis recorded anywhere.** It passed every
check we had, because no rule forbade it. It was found on 2026-07-25 only because the
Evidence Register forced every number to name its source.

The lesson: **trust cannot be enforced by forbidding lies. It has to be enforced by
requiring evidence.**

---

## 2. The two registers — the source of truth for every interface

Both are plain JSON, deliberately: the website build reads them today; the student
dashboard, CRM and Partner Portal read the same files later. **A figure means the same
thing in every interface, or it is a bug.**

### `website/src/data/evidence.json` — the Evidence Register

Every figure RichenQuest publishes anywhere, with:

| Field | Meaning |
|---|---|
| `value` | Exactly as published |
| `statement` | What the figure is |
| `status` | `verified` · `unverified` · `retired` |
| `basis` | The record behind it, in prose |
| `verified_by` / `verified_on` | Who checked it, when |
| `review_by` | When it goes stale (Constitution 21.2) |

`unverified` is a deliberately uncomfortable state: the figure still renders, but with a
dashed mark, and it is listed as unverifiable on `/standards/`. It is meant to be resolved
or withdrawn, not lived in.

### `website/src/data/disclosure.json` — the Disclosure Register

Every commercial relationship and the basis of each, plus the policy statements.
**Currently empty by fact, not by omission** — no signed agreement exists. The machinery is
live: adding the first entry makes every interface start disclosing it automatically.

---

## 3. What the machinery does automatically

### 3.1 Evidence generates provenance marks

A page author writes:

```html
<span class="stat__value">{{ fact.students-guided }}</span>
```

and the build emits the figure, its provenance mark, and a link to its record. There is no
way to publish the number *without* the mark, because the only way to get the number is to
ask for the claim — and **an unknown claim id fails the build.**

`{{ factValue.<id> }}` gives the bare value for places markup cannot go (meta
descriptions). It carries no provenance, so it is never used in body copy.

### 3.2 Claims link to evidence

Every mark points at `/standards/#<claim-id>`. The Standards page is **generated from the
registers**, so the published standards cannot drift from what the registers say. Editing
that page cannot change a figure; only the register can.

### 3.3 Recommendations carry disclosure

The matcher renders a disclosure line on **every** result, derived from the register —
never hand-written, never collapsible. A disclosure the reader must open is not a
disclosure (Constitution 5.4).

### 3.4 Commercial relationships display where required

When the first agreement is signed, it is added to the register and to the matcher's
`RELATED` map. `validate-disclosure-data.mjs` fails CI if those disagree, so a relationship
can never be recorded while the tool still tells students there is none.

---

## 4. The guards

Each answers a different question. They are not interchangeable.

| Guard | Question | Type |
|---|---|---|
| `claims-guard` | Is this statement permitted? | deny-list |
| `voice-guard` | Is this how RichenQuest speaks? | deny-list |
| **`evidence-guard`** | **Can every figure produce its record?** | **require-list** |
| `validate-disclosure-data` | Does every recommendation disclose? | sync check |
| `validate-matcher-data` | Does the tool rank on published facts? | sync check |

`evidence-guard` enforces four rules:
1. Every headline figure carries a provenance mark.
2. Every mark links somewhere.
3. **Every mark's target anchor exists.** A citation pointing at nothing is worse than no citation.
4. No published claim is past its review date. Stale evidence is not evidence.

All guards refuse to pass on a partially-written `dist/`, so an incomplete build cannot
report a false pass.

**Negation-awareness.** Our most important copy *denies* things — "we cannot guarantee
admission", "no limited seats". The Standards page exists to enumerate what we refuse to
say. A guard that flagged those would train people to delete exactly the disclaimers the
Constitution requires, so the banned-vocabulary rules are scoped to the containing
sentence: a denial in a *previous* sentence cannot launder a real claim. This boundary is
tested, because it is the whole correctness of the guard.

---

## 5. The contract for the next three interfaces

Anything built in Phases 4–8 inherits these obligations. They are not UI suggestions.

1. **Never render a figure about RichenQuest from a literal.** Read the Evidence Register and render its provenance with it.
2. **Never render a recommendation without its disclosure**, resolved from the Disclosure Register at render time.
3. **Never present an unverified figure as verified.** The register's `status` travels with the value.
4. **A named human is attached to every recommendation** (Constitution 6.7) — the record carries who advised, not just what was advised.
5. **The individual's record is exportable in full**, including the evidence behind anything we told them (Constitution 6.5, 23.2).
6. **Every claim leaves evidence behind**: an advisory action writes what was recommended, on what basis, by whom, and what disclosure was shown.

Point 6 is the bridge to the **Career Record**: the student-facing product is, structurally,
the same idea as this register — a claim is worthless without its provenance. The website
proves the pattern on public figures; the dashboard applies it to a person's own history.

---

## 6. Known open items

| Item | State |
|---|---|
| `destinations-covered` (33) | **Unverified.** Withdrawn from the homepage 2026-07-25 and replaced with `destination-guides-published` (7), which is countable and CI-enforced. Produce the documented list or retire the claim by 2026-08-25. |
| Disclosure Register | Empty by fact. First signed agreement activates the machinery with no code change. |
| Provenance across all pages | Homepage headline figures are covered. Destination-page reference data is third-party factual data governed by `validate-matcher-data.mjs`; extending marks to it is a Phase 3 continuation. |
| Steering audit (Article 5.5) | Not yet built. Requires recommendation logs, which arrive with the dashboard. |

---

*Consumed by: the website (now) · Student Dashboard (Phase 4) · Career Record (Phase 5) · CRM (Phase 6) · Partner Portal (Phase 7) · AI layer (Phase 8).*
