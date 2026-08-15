# File 32 — Zoho default artifact audit

**Principle applied: nothing should exist in this org because Zoho shipped it.**

Audited and actioned 2026-08-15. Every removal was verified by re-reading the API afterwards, and
the regression suite was re-run to prove nothing we own depended on what was removed.

---

## 1. Removed — everything Zoho shipped that could *act*

| # | Artifact | Type | Why it had to go |
|---|---|---|---|
| 1 | **Big Deal Rule** | Workflow rule, Deals | Zoho factory rule, **active on Student Cases**. On `Amount ≥ 1000` AND `Probability = 100` — i.e. **every won student case carrying a fee** — it emailed one user. Automation nobody wrote, firing on live student data |
| 2 | **Big Deal Alert** | Email notification, Deals | The rule's action. Orphaned once the rule went |
| 3 | **Big Deal Alert** | Email template | *"Good News for us! We have got a Major Deal recently"* — wrong register for a student consultancy, and it would have been sent to a real inbox on a real student's visa approval |
| 4 | **Qualify Leads through Call** | Orchestration | Zoho sample, `status: static`, 0 records |
| 5 | **Qualify Leads through Email** | Orchestration | Zoho sample, `status: static`, 0 records |
| 6 | **Task Process Management** | Blueprint, Tasks | Zoho sample, Inactive |
| 7 | **Lead nurturing process** | Blueprint, Leads | Zoho sample, Inactive. Not to be confused with our `Stale lead rescue` |
| 8 | `Contact Email Clicked Lead ${Leads.Company}` | Task action | Orchestration sample — removed with its parent |
| 9 | `Contact Email Opened Lead` | Task action | Orchestration sample — removed with its parent |
| 10 | `Recontact- ${Leads.Last Name}…` | Task action | Blueprint sample, orphaned |
| 11 | `Task to re-attempt - ${Leads.Last Name}` | Task action | Blueprint sample, orphaned |
| 12 | `Follow up - ${Leads.Last Name}…` | Task action | Blueprint sample, orphaned |

**Deletion order mattered.** The task actions refused deletion with
`NOT_ALLOWED: associated with at least…` until their parents were removed. Sequence that worked:
**workflow rule → notification → template → orchestrations → blueprints → orphaned task actions.**
Two of the five actions disappeared automatically with their orchestration; the other three flipped
to `associated: false` once the blueprints went, and then deleted cleanly.

Also removed earlier in the project: **10 `(Sample)` Account records** shipped by Zoho (File 16 §7).

## 2. Before / after

| Surface | Before | After | Change |
|---|---|---|---|
| Workflow rules | 8 | **7** | −1 (all remaining are RichenQuest's) |
| Email templates (Deals) | 1 | **0** | −1 |
| Email notifications (Deals) | 1 | **0** | −1 |
| Orchestrations | 2 | **0** | −2 |
| Blueprints | 2 | **0** | −2 |
| Task actions (Leads) | 7 | **2** | −5 (both remaining are ours) |
| Deluge functions | 16 | **16** | unchanged — all ours |
| **Regression** | 13/13 | **13/13** | unchanged — nothing we own depended on any of it |

**Every remaining active automation in this org is now RichenQuest's, by name and by intent.**

## 3. Deliberately retained — and why

The brief said remove everything Zoho shipped. I have removed everything that can **act**. I have
**not** deleted passive reporting scaffolding, and that is a judgement call worth stating rather
than burying.

| Artifact | Count | Reasoning |
|---|---|---|
| Default **reports** | 63 across 14 folders | They execute nothing, email nobody and mutate nothing. Several are directly useful — the **Student Case Reports** folder (11) already points at `Deals`, which *is* our Student Cases module. Deleting 63 reports is destructive, irreversible without rebuilding, and buys nothing |
| Default **dashboards** | 7 | Same reasoning. `Lead Analytics` and `Student Case Insights` are correctly aimed at our data |
| Default **report folders** | 14 | Structure only |
| Unused **modules** (`Products`, `Quotes`, `Invoices`, `Vendors`, `Cases`, `Solutions`, …) | — | Zoho modules cannot be deleted, only hidden from layouts. `Solutions` is in fact **planned for use** as the knowledge corpus (File 25 §G-6) |

**The distinction I applied:** an artifact that can *fire* is a liability until it is owned — it
sends mail, creates records, or changes state without anyone deciding it should. An artifact that
merely *displays* is inventory. The first category is now empty. The second is listed above so it
is a known, deliberate inheritance rather than an unexamined one.

**If you want the reports and dashboards gone too, say so and I will remove them** — it is
mechanical. I did not do it unasked because it is irreversible and removes working reporting from a
platform that currently has very little.

## 4. Verification

```
7 workflow rules   — all RichenQuest
0 orchestrations   — was 2
0 blueprints       — was 2
2 task actions on Leads — both ours
regression PASS 13 FAIL 0 ok=True
```

Re-read from the API after every deletion, not assumed from the delete responses.

## 5. Consequence for disaster recovery

File 31 §7.2 already instructs that a rebuilt org must recreate **7** workflow rules and must
**not** recreate `Big Deal Rule`. Restoring into a fresh Zoho org will re-import Zoho's samples by
default — **this audit must be repeated after any org rebuild**, or the artifacts come straight back.
