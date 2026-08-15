# File 28 — Production readiness review & technical debt register

**Reviewed 2026-08-15** against verified state, not memory: 16 functions, 8 workflow rules,
0 schedules, 0 watches, 0 custom modules, regression 13/13, quota 467/60,000.

**Overall verdict: the platform is production-ready for its current load and is *not* ready for
unattended operation.** Everything it does, it does correctly and verifiably. What it lacks is the
scheduling and alerting that would let it run without someone looking at it — and one hard ceiling
that no amount of code removes.

---

## 1. Subsystem audit

| Subsystem | Rating | Basis |
|---|---|---|
| **Security** | **Good** | No secrets in repo (`zapikey` URLs deliberately inactive and unrecorded). OAuth-only function exposure. No custom backend, so no credential to rotate or server to patch. Website holds no PII. |
| **Maintainability** | **Good** | One validator, one task creator, one audit writer. Logic lives in `functions/src/*.dg` under version control, not in a console. 13 automated assertions. |
| **Scalability** | **Constrained** | Entity model, function layer and event design all survive 100×. The **60,000/day API ceiling does not** (ADR-009). |
| **Performance** | **Adequate** | No latency-sensitive path today. Two functions page-and-filter in Deluge — correct at 17 records, wrong at 50,000 (D-3 below). |
| **Observability** | **Fair** | One command shows platform health, and it has already caught two real defects. But it is **pull-only** — nothing tells anyone when something breaks. |
| **Compliance** | **Partial** | Consent policy version captured per submission; audit trail on every mutation. `Consent_Given`/`Consent_Timestamp` still inferred, not transmitted. **No retention policy exists.** |
| **Disaster recovery** | **Weak** | Logic is recoverable from git. **Data is not backed up by us at all** — see R-1. |
| **Operational risk** | **Moderate** | Concentrated in one person's knowledge and one browser session. |

---

## 2. Single points of failure

| # | SPOF | Consequence |
|---|---|---|
| **S-1** | **The session-based transport.** All deployment and health checking runs through an authenticated Chrome tab (File 19 §2b) | No CI, no unattended deploy, no second operator without the same browser. **This is the largest structural SPOF.** |
| **S-2** | **One CRM org.** No sandbox verified | Every deploy and every probe runs against production data |
| **S-3** | **One admin user.** `assignCounselor` has no counselor pool; `Big Deal Rule` mails one person | Bus-factor 1 for both access and workflow |
| **S-4** | **`generateAuditLog`** | Every mutating function depends on it. If it silently failed, mutations would still succeed and the audit trail would quietly go incomplete |
| **S-5** | **No event consumer** | The event backbone is verified but carries nothing; anything designed to depend on events today would fail silently |

---

## 3. Risk register

Priority = Impact × Likelihood, adjusted for whether detection exists.

### R-1 · No independent data backup — **P1**
**Risk** All business data exists only in Zoho. No export, no snapshot, no restore procedure.
**Impact** Catastrophic. Accidental mass delete, a bad bulk update, or account loss is
unrecoverable. `verifyPlatform` and every probe run write to **production**.
**Likelihood** Low per event, but cumulative and permanent.
**Mitigation** Scheduled COQL export of Leads/Contacts/Accounts/Deals/Notes to versioned storage.
Zoho's own Data Backup exists but has **not been verified on this plan**.
**Owner** platform. **Effort** ~half a day. **Blocking?** For unattended operation, yes.

### R-2 · API ceiling — **P1 (structural)**
**Risk** 60,000 calls/day, org-wide, scaling with **user licences, not students**.
**Impact** At ~10,000 students the platform stops serving, and no code fixes it.
**Likelihood** Certain at scale; currently 0.8%.
**Mitigation** ADR-009 — portals read a read model, never CRM. Trigger: sustained >30,000/day.
**Detection** Live in `platform-health.sh` with OK/WARN/CRITICAL.
**Owner** founder + platform. **Blocking?** Not today.

### R-3 · Watch subscriptions expire silently — **P2**
**Risk** `channel_expiry` is mandatory and finite. On lapse, events stop; nothing errors.
**Impact** Total, silent loss of the event backbone once consumers exist.
**Likelihood** Certain without renewal automation.
**Mitigation** Detection exists (health report prints expiry). **Renewal is an operator action**
until the schedules create-schema is solved (File 22 §D-3).
**Owner** platform. **Blocking?** Blocks the first event consumer, not today.

### R-4 · `Big Deal Rule` is an unowned factory default — **P3**
**Risk** Zoho's stock rule is **active on Deals**, which is labelled *Student Cases*. On
`Amount ≥ 1000` AND `Probability = 100` — i.e. **every won student case with a fee** — it emails
"Good News for us! We have got a Major Deal recently" to one user.
**Impact** Low but real: unowned automation, wrong register for this business, and a rule nobody
wrote will fire on live student data.
**Likelihood** Certain once cases carry amounts.
**Mitigation** Decide deliberately — repurpose as a won-case alert, or deactivate. Do **not** leave
it as an accident.
**Owner** founder. **Effort** minutes.

### R-5 · Probing runs against production — **P2**
**Risk** No sandbox. `verifyPlatform` creates and deletes real records in the live org.
**Impact** Moderate. Cleanup is verified by re-read and has never leaked since v1.1 — but v1.0 did
leak two records, which is proof the risk is real rather than theoretical.
**Mitigation** All probes prefixed `VERIFYPROBE`; `cleanup.leaked` forces `ok:false`. Zoho Sandbox
availability **not tested**.
**Owner** platform.

### R-6 · No alerting — **P2**
**Risk** Health checking is pull-only. A failed regression, an exhausted quota or a lapsed watch is
invisible until someone runs the command.
**Impact** Moderate — delayed detection, not data loss.
**Mitigation** Schedule the health check and alert on `ok:false` (needs D-3).
**Owner** platform.

### R-7 · No retention policy — **P3 (compliance)**
**Risk** Nothing is ever deleted by design, and DPDP/GDPR expect defined retention.
**Impact** Compliance exposure grows with volume.
**Mitigation** Write a retention policy; implement after it exists.
**Owner** founder + platform.

### R-8 · Untested happy path in `assignCounselor` — **P3**
**Risk** The assignment branch has **never executed successfully** — no user holds the role.
**Impact** First real counselor hire exercises unproven code.
**Mitigation** Add a counselor user, then extend `verifyPlatform`.
**Owner** founder (needs a user).

---

## 4. Technical debt register

| # | Debt | Why it exists | Impact | Effort | Blocking? | Priority |
|---|---|---|---|---|---|---|
| **D-1** | Workflow rules duplicate `createFollowUpTasks` via 11 native Task actions | Rule→function binding is licence-gated (File 22 §D-1) | Two answers to "what happens at a stage change", depending on whether the write came from UI or Deluge | ~30 min after upgrade | No | P2 |
| **D-2** | No CI — deploy and verify need a browser session | No client-side OAuth token in this environment | S-1; no unattended deploy, bus-factor 1 | ~1 day with a token | **Yes, for a second engineer** | **P1** |
| **D-3** | Schedules unused (0/20); `archiveExpiredPartnership` not scheduled | `POST /settings/schedules` returns 500; schema unsolved | Nightly sweeps are manual; blocks R-3 and R-6 | ~half day | No | P2 |
| **D-4** | Dashboard components can't be created via API | `REQUEST_BODY_NOT_READABLE`; deep schema | "University Partnership KPIs" is an **empty shell**; `partnershipKPIs()` covers the need | ~half day | No | P3 |
| **D-5** | Page-and-filter in Deluge (`archiveExpiredPartnership`, `partnershipKPIs`) | `searchRecords` rejects `less_than` on dates | Correct at 17 records; **wrong at 50,000** — burns quota | ~2 h (COQL) | Not yet | P2 |
| **D-6** | 3 of 16 functions unasserted; 1 partially | Untestable (no counselor) or not yet written | "13/13" overstates coverage if read carelessly | ~half day | No | P2 |
| **D-7** | `Consent_Given`/`Consent_Timestamp` not transmitted | Webform LEADCF indices unresolved | Affirmative consent inferred from a client-side gate, not recorded | needs embed HTML | No | P2 |
| **D-8** | API layer unversioned | No second client yet | Cheap now, expensive after the second frontend ships | ~2 h | No | **P1 before first portal** |
| **D-9** | Books in test mode | Founder action | All finance fictional; no revenue reporting possible | founder | **Yes for finance** | P2 |
| **D-10** | No sandbox verified | Not investigated | R-5 | ~1 h to test | No | P3 |

---

## 5. What would have to be true for "unattended production"

1. **R-1** — backups exist and a restore has been rehearsed.
2. **D-3** — health check runs on a schedule.
3. **R-6** — failure alerts a human without being asked.
4. **D-2** — deploy and verify run without a browser.

None is large. Together they are the difference between *a platform that works* and *a platform
that can be left alone*, and that gap should not be discovered during an incident.
