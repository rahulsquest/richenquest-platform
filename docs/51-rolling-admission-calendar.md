# File 51 — The rolling admission calendar

**The founder's instruction: stop optimising around a single intake.** This file is the operating
calendar that replaces it, and it is built from verified deadlines rather than from a marketing year.

---

## 1. The principle

> **Destinations do not share a schedule. Treating them as if they do is what produces a February
> campaign for a country whose scholarship closed in September.**

File 50 established this the hard way: Italy's DSU deadlines close in late summer, so Italy cannot
serve a February intake at all. **That is not an Italy quirk — it is what every destination looks
like once you check.** The calendar below makes each destination's real clock explicit.

## 2. The rolling year

| Window | Campaign | Destinations | Why these, now |
|---|---|---|---|
| **Aug–Nov 2026** *(now)* | **Feb / Mar 2027 intake** | **Hungary · Poland** | Debrecen's deadline is ~1 Nov 2026; Vistula's spring window closes ~Feb for a March start. **Both are live right now** |
| **Jan–Apr 2027** | **Sep 2027 intake** | **Italy · Germany** | Germany's APS takes 4–8 weeks and must precede everything. **Italy's real deadline is the DSU window, not the university's** |
| **May–Jul 2027** | **DSU execution + Sep 2027 visas** | **Italy** | 🔴 **The DSU bandi publish Jul–Sep. ISEE Parificato and the CAF must already exist by then** |
| **Aug–Nov 2027** | **Feb / Mar 2028 intake** | Hungary · Poland | The cycle repeats |

### The two dates that actually run the year

**1 November 2026** — Debrecen's application deadline (⚠️ pending confirmation). Everything in the
current campaign works backwards from it.

**July 2027** — the DSU bandi window. **The CAF relationship (I2) must be in place before it.** That
converts I2 from a five-mission-old priority with no date into a dated dependency: **a CAF
conversation started by spring 2027, or Italy misses another year.**

## 3. Why this changes marketing, not just planning

| Without the calendar | With it |
|---|---|
| "Study in Europe" content year-round, converting nobody in particular | **Hungary/Poland content Aug–Nov; Italy/Germany content Jan–Apr** |
| Italy promoted in a February campaign it cannot serve | Italy promoted when its scholarship is actually applicable |
| Partnership outreach whenever there is time | **Outreach timed to land before the university's own admissions rush** |
| Counsellors answering "when should I start?" from instinct | Answered from the destination's own clock |

**The single most valuable sentence this calendar produces**, and no commission-funded competitor can
say it:

> *"For your budget, the right move is Italy in September 2027 — not because we can't send you in
> February, but because the scholarship that makes Italy affordable closes in early autumn."*

## 4. What is scheduled against it

| Mechanism | Role |
|---|---|
| `Review_Date` on every university record | Set inside the campaign window for that destination — Debrecen 2026-09-15, Vistula 2026-09-30 |
| `opsWatch` daily 06:30 | Flags any record past its `Review_Date` **while it is still being offered to students** |
| `visaOpsSweep` daily 05:30 | Backward-plans every open case from its own course start date |
| SOP-0 (File 46) | The per-intake re-verification pass, run at the top of each window |

**The calendar is not a document that has to be remembered. Every date in it is already a field the
daily sweeps watch.**

## 5. Honest limits

- **2027 dates are largely unpublished.** Vistula's 2027 spring dates are not out; Debrecen's 1 Nov 2026 is still pending. **The windows above are structural; the specific dates get confirmed at SOP-0.**
- **Only 4 universities have verified data**, so "Hungary · Poland" currently means Debrecen and Vistula. The calendar is right; the inventory behind it is thin.
- **Germany's Jan–Apr window assumes APS at 4–8 weeks**, which is a secondary figure. Confirm before the window opens.
