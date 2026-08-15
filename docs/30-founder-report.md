# File 30 — Founder report

**2026-08-15.** One report: what exists, what is proven, what is waiting on you, and what the
platform cannot do. Every figure was read from the live system today, not recalled.

---

## 1. Where the platform stands

**Verified state** (`./scripts/platform-health.sh`, 2026-08-15 22:07):

```
16 Deluge functions   REST-exposed, OAuth
 8 workflow rules      all active
 0 schedules           0 of 20 slots used
 0 watch subscriptions no event consumers yet
 0 custom modules      Application awaiting approval
 8 dashboards
   regression          PASS 13  FAIL 0  ok=True
   API quota           467 / 60,000  (0.8%)
```

**One-line summary:** a correct, well-documented, verifiable platform that still needs a human to
look at it. Everything it does, it does right. It cannot yet tell you when something is wrong.

---

## 2. Completed and verified

Each item below was proven against live records, and every probe deleted.

| Capability | Evidence |
|---|---|
| **Lead intake** | Probe lead → `Lead_Status` set (was `null` for every lead), call task raised with merged subject, correct owner and due date |
| **Student identity** | Two Cases from separate calls resolved to one `student_id`; matched on email and phone independently |
| **Student Case pipeline** | 11 stages; `Closed Lost` without a reason refused; unknown stage refused; `Probability` auto-maps |
| **Post-admission journey** | Forward-only; `Arrived` refused before visa approval; both axes coexist without disturbing each other |
| **University partnerships** | Stage-driven cadence (day 4/9/16), reply SLA, onboarding tasks, renewal guard — 7 tasks verified on a probe |
| **Communication history** | Outbound advances `Identified → Contacted`, inbound `→ In Discussion`; invalid channel refused |
| **Agreement lifecycle** | Renewal to `Active` with future expiry; past expiry refused; expiry sweep archives without deleting |
| **Partnership KPIs** | `total:17, Identified:17, contactable:1, uncontactable:16` — matches the pipeline exactly |
| **Validation** | One validator, six rule types; unknown rule type fails loudly rather than passing |
| **Audit** | Every mutation writes `[audit]` with actor, from→to, reason |
| **Regression suite** | 13 assertions, self-cleaning, leak-detecting |
| **Health command** | Single command covering quota, functions, rules, schedules, watches, modules, dashboards, regression |

**Two defects were found by the new tooling on its first run** — a test that asserted nothing while
leaking two records, and a probe function still deployed from days earlier. Both fixed. That is the
tooling working as intended.

## 3. Architecture proven by testing, not assumption

Four capabilities were verified against the live tenancy and the probes removed:

- **Custom modules are available** — module created, lookups to Deals/Accounts/Contacts created, a
  record held a live lookup, related list auto-appeared. This unblocked the Application design.
- **WorkDrive is provisioned** with a working REST API, and `zoho.workdrive.uploadFile` is a real
  Deluge task.
- **Change notifications work** (`actions/watch`) — the event backbone.
- **The API ceiling is 60,000/day** and scales with user licences, not students.

Three earlier "no API" conclusions in this project came from **guessed URLs**. The method is now:
read what Zoho's own UI requests, or compile a probe and read the error.

---

## 4. Waiting on you

| # | Decision | Blocks | Effort |
|---|---|---|---|
| **F-1** | **Approve ADR-010** (Application module) — field list, intake values, and "one `Offer Accepted` per Case" | University conversion metrics; the partnership programme has no conversion data without it | Review only |
| **F-2** | **Take Books out of test mode + GST registration** | All finance, revenue and invoicing. Every figure there is currently fictional | Founder action |
| **F-3** | **Hire/assign a Counselor** | `assignCounselor`'s happy path has **never executed** — no user holds the role | Founder action |
| **F-4** | **Zoho plan upgrade** *(optional)* | Workflow→function binding (File 22 §D-1). **Not blocking** — deferred by your instruction | Commercial |
| **F-5** | **Decide on `Big Deal Rule`** | Zoho's factory default is active on Student Cases and will email "We have got a Major Deal" on every won case with a fee | Minutes |
| **F-6** | **Provide outreach proof points** — years active, students guided, visa success rate, certifications | Four university outreach emails cannot be written; automation raises tasks for humans instead of sending unverifiable claims | Founder input |
| **F-7** | **Webform embed HTML** | `Consent_Given`/`Consent_Timestamp` LEADCF indices, so affirmative consent is *recorded* rather than inferred | 2 minutes in console |

## 5. Deferred by decision — not forgotten

| Item | Why | Where |
|---|---|---|
| Workflow→function migration | Licence-gated; you deferred it | File 22 §D-1 with a per-rule switch-on table |
| Blueprint on the pipeline | `updateStudentCaseStage` already enforces the guarantees in code | File 22 §D-2 |
| Dashboard components | Schema unsolved; `partnershipKPIs()` covers the need | File 22 §D-4 |
| Event consumers, retry, dead-letter | No consumer exists — building them would be speculative | File 26 §S-3 |
| Read model | Not needed until a portal exists; the constraint is recorded so no one designs against a false assumption | ADR-009 |

---

## 6. Limitations — the honest list

1. **The API ceiling is absolute.** 60,000/day, org-wide, scaling with licences not students. Every
   other decision survives 100×. This one does not, and no code fixes it.
2. **No data backup.** Logic is recoverable from git; **business data is not recoverable at all.**
   This is the single most serious gap in the platform.
3. **No alerting.** Health checking is pull-only. Nothing tells anyone when something breaks.
4. **Deploy needs a browser session.** No CI, no unattended deploy, bus-factor 1.
5. **Regression covers 13 of 16 functions.** "13/13 passing" means *the assertions pass*, not that
   the platform is exhaustively tested.
6. **Consent is inferred, not transmitted** for the affirmative boolean.
7. **No retention policy** exists, and DPDP expects one.
8. **Probing runs against production.** No sandbox verified.

## 7. ADR status

| ADR | Subject | Status |
|---|---|---|
| 001 | Static vanilla stack | **Valid** — frozen scope (ADR-008) |
| 002 | Zero-dependency build | **Valid** — still gates the frozen site |
| 003 | Zoho backend, no database | **Valid, narrowed by ADR-009** — holds for writes and logic; portals must not read CRM directly |
| 004 | Catalyst hosting + CI/CD | **Superseded by ADR-007** |
| 005 | claims-guard | **Valid** — and now the governing rule for the knowledge corpus too |
| 006 | Slate vs Client hosting | **Valid as evidence**, superseded operationally by ADR-007 |
| 007 | Cloudflare Pages | **Valid** — implemented and verified |
| 008 | Website frozen | **Valid** — actively enforced |
| 009 | API ceiling + read model | **Valid** — the governing constraint |
| 010 | Application module | **PROPOSED** — awaiting F-1 |

No ADR needs revision. 004 is superseded; 006 is historical evidence.

---

## 8. Engineering maturity

| Dimension | Level | Reasoning |
|---|---|---|
| Correctness | **High** | Guards are enforced in code and asserted automatically |
| Documentation | **High** | 30 files; a new team can operate without hidden knowledge |
| Verification | **Medium-High** | Automated, but 3 functions unasserted and no sandbox |
| Observability | **Medium** | Excellent pull-based health; **no push alerting** |
| Recoverability | **Low** | Logic yes, **data no** |
| Automation of ops | **Low** | Nothing runs on a schedule |
| Scalability | **Medium** | Sound design, hard quota ceiling |

**Overall: production-ready for current load; not ready for unattended operation.**

Four things close that gap, none large: **backups (R-1)**, **scheduled health checks (D-3)**,
**alerting (R-6)**, **CI without a browser (D-2)**.

## 9. Recommended order

1. **Backups** — the only gap that is unrecoverable if it bites.
2. **Approve ADR-010** — unblocks the metric the partnership programme is missing.
3. **Books out of test mode** — unblocks the entire finance domain.
4. **Scheduled health + alerting** — turns detection into notification.
5. **CI without a browser** — removes the structural bus-factor.

Everything else is genuinely optional until the company grows into it.
