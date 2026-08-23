# OPPORTUNITY-DATA-QUALITY.md — 2026-08-23

**Internal. Not student-facing.** Generated live by `opportunityQuality()`.

## Coverage

| Metric | Value |
|---|---|
| Total opportunities | 21 (+2 Service Vendors excluded) |
| **Fully rankable** | **1** |
| Tuition verified | 4 |
| Living cost verified | 2 |
| Deadline verified | **1** ← the binding constraint |
| Domain verified | **4** (was 2) |
| Source URL present | 6 |
| Verification date present | 6 |
| IELTS data present | 4 |
| Levels data present | 4 |
| Eligibility summary present | **0** |

**Missing-gate-field distribution:** `{0: 1, 2: 4, 4: 2, 5: 14}`

## The two gaps are not the same thing

**Gate fields** — tuition, living cost, deadline, source URL, verified date. Missing any one
means the opportunity is **not rankable at all** and is never shown.

**Confidence fields** — domains (20 pts), IELTS (15), levels (15). Missing these does **not**
block rankability; it removes their weight from the denominator, so the score is out of less
than 100. Ops must not conflate them: filling domains on an unrankable record changes nothing
visible.

## Phase 5 — the cheapest path from 1 to 5

Four records are **exactly two gate fields** from rankable. Nothing else is close.

| Opportunity | Missing | Contact | Effect | Priority |
|---|---|---|---|---|
| Budapest Metropolitan | living cost, deadline | `admission@metropolitan.hu` | → rankable | **HIGH** |
| University of Pécs | living cost, deadline | `international@pte.hu` | → rankable | **HIGH** |
| EU Business School | living cost, deadline | euruni.edu admissions | → rankable | **HIGH** |
| Vistula Warsaw | tuition, deadline | `cooperation@vistula.edu.pl` | → rankable | **HIGH** |
| Global College Malta | 4 fields | none on record | low | LOW |
| University of Szeged | 4 fields | `international@szte.hu` | low | LOW |
| 14 others | all 5 | none | — | LOW |

**Four emails move rankable from 1 to 5.** No other action comes close: the next cheapest
record needs four fields and has no contact address.

## What changed in this pass

`Domains_Offered` populated for **Debrecen** and **EU Business School**, from sources
actually fetched:

| Record | Domains | Source |
|---|---|---|
| Debrecen | Health/Nursing, Medicine/Dentistry, Business/Management, Engineering, Natural Sciences | `edu.unideb.hu` faculty list + `eng.unideb.hu` |
| EU Business School | Business/Management, Finance/Accounting, Social Sciences, Design/Media | `euruni.edu` specialisation list |

**One domain was deliberately excluded.** EU Business School names an "Artificial
Intelligence for Business" specialisation, but it is a *business* specialisation, not a
technical degree. Tagging it `Data Science / AI` would match Data Science students to a
programme that is not what they mean. A false positive here costs a family real money.

**Debrecen's Computer Science was not added either** — plausible from reputation, absent from
the pages I actually fetched. Reputation is not evidence.

## Measured effect

Confidence on the top recommendation rose from **80/100 to 100/100** for four of five test
profiles, because Debrecen's domain dimension is now scorable.

Profile B's score **fell from 100 to 80** — correctly. Debrecen is now *known* not to offer
Design/Media, so a previously unscored dimension became a scored zero. Better data made the
answer less flattering and more true. That is the system working.
