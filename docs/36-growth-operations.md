# File 36 — Growth operations: data quality, staffing, and the weekly founder report

Companion to File 35. Covers data quality after import (Priority 4), operational readiness for the
first 100 students (Priority 3), and the founder reporting rhythm (Priority 5).

---

## 1. Data quality — 38 → 79, and the honest reason it is not 90

### Accounts: 42 → 84

| Field | Before | After | Weight |
|---|---:|---:|---:|
| `Account_Name` | 100% | 100% | 1 |
| `Partnership_Stage` | 100% | 100% | 1 |
| `Partnership_Type` | 100% | 100% | 1 |
| `Agreement_Status` | 100% | 100% | 1 |
| `Website` | 12% | **100%** | 1 |
| **`International_Office_Email`** | 6% | **73%** | 3 |
| `International_Office_Contact` | 6% | 20% | 1 |
| **Provenance (source URL in `Description`)** | 0% | **100%** | 1 |

Scored over 15 universities (the two service providers are out of scope by design):
`(100×6 + 73.3×3 + 20) ÷ 10` = **84 / 100**.

**The new provenance row matters as much as the email row.** Every record can now be re-checked
against the page it came from. A CRM field with no source is an assertion; with a source it is
evidence.

### Leads: still 0 — and this is the blocker to 90+

All four Leads remain the **stale `deploy-verify-*` test records** from 28 July. They are 100% test
contamination and they drag the overall score down regardless of how good Accounts becomes.

> **Overall data quality: 79 / 100** (Accounts 84, Leads 0, weighted by record count)
>
> **Deleting the four test leads takes this to ~84 immediately.** Reaching **90+** additionally
> needs the four human-browser university contacts (File 35 §1) — roughly 20 minutes of work.

**I have not deleted the leads.** They are the entire contents of the module, they are safely in
`backups/2026-08-15/Leads.zip`, and wiping a module is a founder decision, not a cleanup task. Say
the word and it is one call.

### Duplicates, orphans, relationships

| Check | Result |
|---|---|
| Duplicate universities | **0** |
| Duplicate emails | **0** — all 11 addresses distinct |
| Orphan records | **0** |
| Broken lookups | **0** |
| Records with no provenance | **0** |

Clean. `resolveStudent` makes duplicate students structurally difficult, and the university set was
imported once from a controlled CSV.

---

## 2. Operational readiness for 100 students

### The bottleneck is people, and the number is three

A counselor carries **30–40 active cases** in this business — a case is months long and
document-heavy, not a transaction.

| Students | Counselors | Ops/admin | Notes |
|---:|---:|---:|---|
| 25 | 1 | 0 | founder can still counsel personally |
| 50 | 2 | 0.5 | document chasing starts to dominate |
| **100** | **3** | **1** | **the target** |
| 200 | 5–6 | 2 | a manager becomes necessary |

**At 100 students you need three counselors and one operations person.** The platform needs no
change to support that — the constraint is entirely hiring.

### Workload distribution

`assignCounselor` already implements **least-loaded** assignment (fewest owned leads not in a closed
status), which degenerates to round-robin when loads are equal. That is the right default and needs
no change.

**Two cautions:**

1. **The assignment branch has never executed.** No user holds the Counselor role, so only the
   refusal path has ever run. **RB-03 (File 29) must be followed on the first hire** — verify it
   with a probe lead on day one rather than discovering it during a real intake.
2. **Load is counted per *lead*, not per case.** At 100 students, counselors will be carrying cases,
   applications and document chases that the load calculation cannot see. It will still balance, but
   it will balance on the wrong number. Worth revisiting once real load exists — **not before**,
   because tuning it against zero data is guesswork.

### The five bottlenecks, ranked

| # | Bottleneck | Effect at 100 students | Owner | Effort |
|---|---|---|---|---|
| 1 | **No counselors** | Hard cap at ~30 students. Everything else is theoretical until this moves | founder | hiring |
| 2 | **Books in test mode** | No invoicing, no revenue tracking, no financial reporting | founder | admin + GST |
| 3 | **No real leads yet** | The funnel is verified but operationally unproven — first live intake is the real test | marketing | — |
| 4 | **4 universities uncontactable** | Partnership pipeline capped at 11 | research | ~20 min |
| 5 | **Backup on one laptop** | Data risk grows with every real student added | founder | minutes |

**Bottleneck 5 gets worse specifically as this succeeds.** Today the backup protects 21 records; at
100 students it protects the business. Move it off-machine before the students arrive, not after.

### Capacity headroom

At 100 students, ~3 counselors: **~1,500 API calls/day against 60,000 (3%)**. No platform
constraint whatsoever at this scale. The ADR-009 ceiling is a problem for 10,000 students, not 100.

---

## 3. Weekly founder report

Run these two, in this order. Together they take about three minutes.

```bash
./scripts/founder-dashboard.sh      # business state — read-only, safe any time
./scripts/platform-health.sh        # platform state + regression (writes probes, cleans up)
./scripts/backup-crm.sh             # weekly at minimum
./scripts/verify-backup.sh          # never trust an unverified backup
```

### What to actually look at, in order

| # | Signal | Where | Action if wrong |
|---|---|---|---|
| 1 | **Overdue tasks** | dashboard → WORK | Anything overdue means a student or university is waiting. Fix before anything else on this list |
| 2 | **Leads today / this week** | dashboard → PIPELINE | Zero for a week with marketing running means the funnel is broken, not quiet |
| 3 | **Case stage breakdown** | dashboard → PIPELINE | Cases stuck in one stage for weeks are the early signal of a process gap |
| 4 | **Partnership stage movement** | dashboard → PARTNERSHIPS | Should move every week during outreach. Static means outreach stopped |
| 5 | **Regression PASS/FAIL** | health | Any FAIL: stop, read the detail, roll back (RB-01) |
| 6 | **API quota %** | dashboard/health | >50% is the ADR-009 trigger. Remember it can be **up to an hour stale** |
| 7 | **Backup age** | dashboard → PLATFORM | Flags STALE beyond 1 day |
| 8 | **ATTENTION block** | dashboard | Standing issues; each line disappears only when genuinely fixed |

### Monthly, additionally

- Re-run the **data quality** checks in §1 — coverage percentages, duplicates, orphans.
- Re-read **File 28** risk register — has anything changed status?
- **Rehearse a restore** once a sandbox exists (File 31 §8). Until then, the DR plan is unproven.

### What the report should never become

A number nobody acts on. Every line above has an action attached; if a signal is consistently
green and nobody looks at it, drop it from the routine rather than letting the report grow into
decoration.

---

## 4. Immediate next actions

Ordered by value per minute of founder time:

1. **Copy `backups/` off this laptop, encrypted** — minutes, and it is the only unrecoverable risk.
2. **Send Wave 1 outreach** — six real partnership desks are waiting (File 35 §2). Log each with
   `logPartnershipContact`; the cadence then runs itself.
3. **Delete the 4 test leads** — one call, takes data quality to ~84.
4. **Research the 4 blocked universities** in a browser — ~20 minutes, completes the pipeline.
5. **Rename one "RichenQuest Global" user** — two minutes, protects every future audit record.
6. **Hire counselors** — the only thing standing between this platform and 100 students.
