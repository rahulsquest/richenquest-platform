# HONEST-REFUSAL-PROTOCOL.md — 2026-08-23

What happens when RichenQuest has **no verified recommendation** for a student.

This is not an error path. With 2 verified opportunities it is a **likely** path, and the way
it is handled is a deliberate experiment.

---

## The hypothesis being tested

> **Families reward honesty about gaps.**

If true, saying *"we don't have a verified Italian option and we won't guess"* increases
trust, and verification-first is a moat.

If false, it reads as incompetence, and the principle is an expensive one that needs
rethinking — better learned at student 3 than student 300.

**This is the riskiest assumption in the product.** It has never been tested on a real family.

---

## What the student sees — already implemented

`studentReport` returns this when nothing passes the gate:

> **WHAT FITS YOU**
> Nothing yet. We only show options where we have verified the tuition, the living cost and
> the deadline against the university's own published pages. We do not show estimates.
> That is a gap on our side and we are closing it. Your counsellor will tell you when an
> option is ready.

Three things it does deliberately: **names the gap as ours**, **states the standard** so the
refusal is principled rather than apologetic, and **commits to a follow-up**.

The rest of the report still generates — profile, strengths, roadmap, next action. **A refusal
is not an empty page.**

---

## What the counsellor explains

Say it plainly, early, and without apologising for the standard.

> "I want to be straight with you. For Italy specifically, we don't yet have a single
> university where we've verified the tuition, the living cost and the scholarship deadline
> against the university's own pages. Until we have, I'm not going to show you numbers,
> because a wrong number here costs your family lakhs.
>
> What I can tell you is what Italy *requires* — and that part I do know."

Then give real value:

1. **The pathway**, from `ITALY-PATHWAY-MODEL.md` — the DSU grant is worth €14–16k; the
   regional bando deadline closes **before** the university's; documents must be legalised by
   the Prefettura and that takes months; the permit window on arrival is **8 days**.
2. **The timing truth** — Italy is a **September** market. A February start cannot access DSU.
3. **What we have verified** — Debrecen and Pécs, with sources and dates.
4. **What happens next** — we have written to the institutions; you will hear either way.

## What may be shown

| Allowed | Why |
|---|---|
| Verified opportunities in other countries | fully sourced |
| Country **requirements** for the country they want | verified, and not a price |
| The **timeline** and its deadline types | verified |
| Named gaps and who we have asked | true and checkable |
| Profile strength, roadmap, next actions | independent of any opportunity |

## What must never happen

| Never | Because |
|---|---|
| An estimated tuition or living cost | the exact failure the gate exists to prevent |
| A figure from an aggregator presented as verified | it is not verified |
| A university named with numbers we have not sourced | invites them to research a number we invented |
| *"Roughly around…"* / *"typically about…"* | an estimate wearing a hedge |
| A guessed deadline | the most expensive possible error |
| Substituting a country they did not ask for, without saying so | a silent bait-and-switch |
| Apologising for the standard | the standard is the product |

**The last two matter most.** Quietly steering an Italy student to Hungary because Hungary is
what we have is a bait-and-switch even when the Hungarian option is good. Say the substitution
out loud: *"You asked about Italy. I'm showing you Hungary because it's what I can verify. Tell
me if that's not useful."*

---

## Measuring the trust effect

Cohort A, question 8 of `STUDENT-FEEDBACK-TEMPLATE.md`:

> *We told you we do not have verified Italian options yet. How did that make you feel about
> us?* **more confident / less confident / no difference — and why**

Also captured: did they stay engaged? did they still complete their profile? did they refer
anyone?

| Result | Reading | Action |
|---|---|---|
| ≥2 of 3 "more confident" | hypothesis holds; refusal is an asset | make it explicit in marketing |
| Mixed | depends on delivery, not principle | improve the script, keep the standard |
| ≥2 of 3 "less confident" | **hypothesis fails** | founder decision — the standard stays, the *presentation* must change. **Never resolve this by lowering the gate** |

**The gate is not on the table regardless of the result.** If honesty costs trust, the fix is
to close the data gap faster or explain better — never to start estimating. A pilot that
concludes "we should guess more" has misread its own evidence.

---

## Why this is worth a third of the pilot
Every competitor shows a long list. RichenQuest will sometimes show one option or none. If
that is fatal, it is the single most important thing to learn, and no amount of engineering
answers it. Only a family can.
