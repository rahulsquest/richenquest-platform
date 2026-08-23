# PILOT-SCORECARD.md — 2026-08-23

Supersedes `PILOT-METRICS-DASHBOARD.md`, which is removed — one instrument, not two.

**A spreadsheet, not a dashboard.** With ten students, rows are faster to read than a screen
and impossible to get wrong. Build a screen when reading rows becomes impractical.

---

## The sheet — one row per student

### Student
| Column | Source | Type |
|---|---|---|
| Case number | `Case_Number` | id |
| Cohort | A (honest-refusal) / B (general) | — |
| **Profile completion %** | `studentIntelligence` | number |
| **Trust rating** | feedback Q3 | 1–5 |
| **Usefulness rating** | feedback Q4 | 1–5 |
| **Learned something new** | feedback Q6 | yes / no |
| **Found a wrong recommendation** | feedback Q5 | yes / no + what |

### Counsellor
| Column | Source | Type |
|---|---|---|
| **Review time** (min) | logged | number |
| *Students 1–3:* pre-read research estimate | logged **before** the report | number |
| **Corrections** | DATA / LOGIC / UX counts | 3 numbers |
| **Would have misled the student?** | safety check 5 | **yes / no — mandatory** |
| Report approved unchanged | — | yes / no |

### System
| Column | Source | Type |
|---|---|---|
| **Missing data** | `missing_fields` + `not_rankable` reasons | list |
| **Recommendation errors** | corrections where misleading = yes | count |
| **Verification failures** | unverified figure reached a report | **count — must be 0** |
| Opportunities shown | `opportunity_count` | number |

---

## First student data plan

### Students 1–3 — **trust validation**
**Question:** does a family believe us, and does honesty about gaps help or hurt?

Watch: trust rating · Q8 for Cohort A · did they stay engaged after being told "we don't
have that" · the counsellor's pre-read baseline.

**Not** watching: conversion, satisfaction averages, correction counts. Three students cannot
support any of those.

**These three are the highest-information students in the whole pilot** and cannot be
repeated — the first impression of the product happens once.

### Students 4–10 — **pattern discovery**
**Question:** what goes wrong repeatedly?

Watch: the **same** correction appearing 3+ times · which `missing_fields` recur · whether
corrections per student fall · which opportunities keep failing the gate.

The threshold from the correction rule applies here and only here: **3 independent students
before any logic change.** Students 1–3 can *contribute* to a count of three; they cannot
reach it alone.

---

## ⚠️ What this sample can and cannot say

**Can say:** whether students understood the explanations · whether anyone was misled ·
which data is missing most often · whether one correction repeats · whether honesty about
gaps helped or hurt.

**Cannot say:** conversion rate · time saved as a percentage · student satisfaction as a
population figure · that any change *improved* anything · anything with statistical
significance.

> **n=10 is a case series, not a study.** One counsellor, one market, one intake, a
> self-estimated baseline. Every number here is directional. Quoting "RichenQuest improves X
> by Y%" from this sample would be exactly the overclaim the product refuses everywhere else —
> and it would be the first thing a serious investor pulled apart.

**The honest framing:** *"We ran ten students. Here is what broke, here is what they told us,
and here is what we changed."* That is more persuasive than a fabricated percentage, and it
is true.

---

## Review points
**After student 3** — trust read. Continue, adjust the script, or stop.
**After student 10** — full read against the success and failure criteria in the playbook.

## The single number that decides whether to continue
**Verification failures. It must be 0.** Everything else is a finding to work with. That one
is a broken promise, and it invalidates the pilot rather than informing it.
