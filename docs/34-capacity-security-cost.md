# File 34 — Capacity, security, cost & final engineering audit

Phases 3, 4, 5 and 7. **Only objectively verified findings are stated as fact**; estimates are
labelled as estimates, and things I could not measure are named as such rather than guessed.

---

## PHASE 3 — Capacity planning

### The measurement I could not take, and why it matters

I attempted to measure per-operation API cost by reading the quota, running the founder dashboard
(~17 calls), and re-reading. **The counter did not move.** The reason:

```json
{"last_refreshed_time":"2026-08-15T22:56:17+05:30",
 "consumed_limit":513,
 "next_refresh_time":"2026-08-15T23:00:00+05:30"}
```

**`consumed_limit` is a cached snapshot refreshed on the hour, not a live counter.**

Two consequences:

1. **Per-operation cost cannot be measured at sub-hour granularity.** The capacity figures below are
   therefore **reasoned estimates**, not measurements, and are labelled so.
2. **Quota alerting can be up to 60 minutes stale.** An alert threshold must leave headroom for an
   hour of unseen consumption — a burst that starts at 22:01 is invisible until 23:00. This
   materially affects the R-6 alerting design and is recorded in File 28.

### Estimated capacity by scale

Assumptions stated so they can be challenged: one student case generates ~40 API operations across
its life (intake, ~8 stage changes with audit and tasks, journey moves, reads); a counselor
generates ~200/day; portals are excluded because ADR-009 forbids them reading CRM directly.

| Scale | Students | Counselors | Est. daily API | vs 60,000 | Verdict |
|---|---:|---:|---:|---|---|
| Today | 0 | 0 | ~500 | 0.9% | ample |
| Early | 100 | 3 | ~1,500 | 3% | ample |
| Growth | 1,000 | 10 | ~8,000 | 13% | comfortable |
| Scale | 10,000 | 50 | ~45,000 | **75%** | **read model required** |
| Target | 10,000 + portals | 100 | **>100,000** | **>160%** | **exceeds ceiling** |

**The ceiling is reached between 1,000 and 10,000 students**, and portals push it over regardless
of student count. This is exactly what ADR-009 predicted; these numbers put a scale on it.

**Quota grows with user licences.** Hiring raises the ceiling; students never do.

### Other limits

| Resource | Known | Status |
|---|---|---|
| Records | Zoho limits vary by edition — **not verified for this plan** | 21 records today; no risk near-term |
| **Schedules** | **20**, verified | 0 used. Enough for daily sweeps and health checks |
| **Custom modules** | Creation verified working | 0 used. ADR-010 needs 1 |
| Functions | No documented cap encountered | 16 deployed |
| Storage | **Not verified** — `__limits` supports only `feature=API` | unknown; no attachments yet |
| WorkDrive | **Not verified** | provisioned, zero files |
| Applications at 10k students | ~50,000 records (5 each) | the largest projected table |

### Upgrade recommendations, in trigger order

1. **At sustained >30,000 calls/day (50%)** — build the read model (ADR-009). This is the one
   non-negotiable architectural change.
2. **Before the first portal ships** — regardless of quota. A portal reading CRM directly is the
   fastest route to the ceiling.
3. **At ~1,000 students** — replace page-and-filter Deluge with COQL predicates (File 28 D-5);
   `archiveExpiredPartnership` and `partnershipKPIs` both scan whole modules.
4. **When hiring counselors** — licences raise the ceiling; budget them as capacity, not just cost.
5. **Verify record and storage limits** before assuming headroom. Currently unknown.

---

## PHASE 4 — Security audit

### Verified posture

| Area | Finding | Rating |
|---|---|---|
| **Secrets in repo** | None. `zapikey` URLs deliberately inactive, values recorded nowhere. `backups/` gitignored | **Good** |
| **API exposure** | 16 functions, all OAuth-only. No API-key endpoint active | **Good** |
| **Custom backend** | None (ADR-003) — no server to patch, no credential to rotate, no PII tier | **Good** |
| **Website PII** | None stored; browser posts directly to Zoho | **Good** |
| **Users** | 3 active: 1 Administrator (CEO), 2 Standard (Operations) | **Adequate** |
| **Profiles** | 2 — Zoho defaults, unmodified | **Adequate at this size** |
| **Roles** | CEO → Manager → {Operations, Marketing, Counselor}; CEO → Finance | **Good structure, unused** |
| **Audit trail** | Every mutation writes `[audit]` with actor, from→to, reason | **Good** |
| **Backups** | Automated + verified (File 31) | **Improved, incomplete** |

### Findings

**S-1 · Two users are indistinguishable — MEDIUM**
`tech@` and `partnerships@` both display as **"RichenQuest Global"**. Ownership, audit entries and
task assignment all render display names, so **the audit trail cannot tell them apart**. For a
compliance artifact, an ambiguous actor is a defect. **Fix: rename one. Two minutes.**

**S-2 · Everything runs as one Administrator — MEDIUM**
All platform work, all deploys, all probes execute as the CEO account. No service account, no
separation between human and automation activity. At one operator this is pragmatic; at a team it
means you cannot tell a person from a script in the audit log.

**S-3 · Session-based transport — MEDIUM (structural)**
Deploy, health and backup all depend on an authenticated browser session (File 28 S-1). It is not
*insecure* — it is a human's live session, never persisted — but it means **no unattended
operation** and bus-factor 1.

**S-4 · Backups contain PII and live on one laptop — HIGH**
`backups/` holds names, emails and phone numbers in plain CSV inside a zip. Gitignored, correctly.
But unencrypted on a laptop, and **no off-machine copy exists**. Under DPDP that is a personal-data
store with no access control beyond the OS. **Encrypt and move off-machine.**

**S-5 · No retention policy — MEDIUM (compliance)**
Nothing is ever deleted by design. DPDP expects defined retention and the right to erasure. There
is no policy for live records *or* for the new backups (File 31 §6 covers backup retention only).

### GDPR / DPDP position

| Requirement | State |
|---|---|
| Consent recorded | **Partial** — `Consent_Policy_Version` captured per submission; the affirmative boolean is inferred from a hard client-side gate, not transmitted (File 18 §5) |
| Consent demonstrable | Partial — *which policy* and *when* are recorded; *that they ticked* is inferred |
| Right to access | Achievable — COQL by email returns everything |
| Right to erasure | Achievable in CRM; **backups would need separate purging**, and no procedure exists |
| Data minimisation | **Weak** — 68 fields on Leads, most unused |
| Retention | **Absent** |
| Breach detection | **Absent** — no alerting of any kind |

**Overall security rating: adequate for current scale, with one HIGH finding (S-4).** The
architecture is genuinely defensive — no server, no secrets, no PII on the web tier. The gaps are
operational: unencrypted local PII, ambiguous actors, and no retention policy.

---

## PHASE 5 — Cost model

**I will not state specific prices.** Zoho, Cloudflare and WorkDrive pricing varies by region,
currency and negotiated terms, and inventing figures would be worse than none. What follows is the
**cost model** — the drivers and how they scale. Confirm actual figures with each vendor.

### Current, verified

| Component | State | Cost driver |
|---|---|---|
| **Zoho One Enterprise** | `paid: false`, trial, 10 licences purchased | **per user per month** |
| **Cloudflare Pages** | Live, static site | free tier; bandwidth/build minutes at scale |
| **WorkDrive** | Provisioned, 0 files | included in Zoho One; storage tiers above |
| **Books** | Test mode | included in Zoho One |
| **GitHub** | Private repo | free tier sufficient |
| **Custom infrastructure** | **None** (ADR-003) | **zero** — the largest cost avoided |

### How cost scales

| Scale | Primary driver | Shape |
|---|---|---|
| 100 students, 3 staff | Zoho licences × 3 | ~linear, small |
| 1,000 students, 10 staff | Zoho licences × 10 | linear in headcount, **flat in students** |
| 10,000 students, 50 staff | licences × 50 **+ read model infrastructure** | step change at the read model |
| 10,000 + portals | above **+ portal hosting/compute** | new cost category |

**The structural point: cost scales with employees, not students** — the same property as the API
quota. Student growth is close to free until the read model, which is the one genuine step change
ADR-009 predicts. Books moving to production adds no licence cost (already in Zoho One) but does add
accounting/GST compliance cost, which is a business cost rather than an infrastructure one.

**Cheapest meaningful optimisation available today: none.** There is nothing being paid for that is
not used. The trial is free, hosting is free, and there is no idle infrastructure — because there is
no infrastructure.

---

## PHASE 7 — Final engineering audit

Only findings verified this session or previously recorded with evidence.

### Technical debt — current

| # | Debt | Impact | Blocking? |
|---|---|---|---|
| D-1 | 11 native Task actions duplicate `createFollowUpTasks` | Two answers to "what happens at a stage change" | No — licence-gated |
| **D-2** | **No CI; deploy needs a browser** | Bus-factor 1, no unattended operation | **Yes, for a second engineer** |
| D-3 | 0/20 schedules used; nothing runs automatically | Backups, sweeps and health checks are all manual | No |
| D-4 | Dashboard components not API-creatable | "University Partnership KPIs" is an empty shell | No |
| D-5 | Page-and-filter in Deluge | Correct at 17 records, wrong at 50,000 | At ~1,000 students |
| D-6 | 3 of 16 functions unasserted | "13/13" overstates coverage | No |
| D-7 | Consent boolean inferred, not transmitted | Compliance gap | No |
| D-8 | APIs unversioned | Cheap now, expensive after the second client | **Before first portal** |
| D-9 | Books in test mode | No finance possible | Yes, for finance |
| D-10 | No sandbox verified | Probes run against production | No |
| **D-11 · NEW** | **Lead → Case link is audit text, not a field** | **The primary funnel conversion metric cannot be computed** | No, but it blinds the funnel |
| **D-12 · NEW** | **Quota readings up to 60 min stale** | Alert thresholds need an hour of headroom | No |

### Architectural risks

1. **API ceiling** (ADR-009) — the only decision that does not survive 100×. Mitigated by design,
   not yet by implementation.
2. **Two divergent automation paths** — UI writes fire workflow rules, Deluge writes do not
   (measured, File 22 §D-1). Every future automation must know which path it is on.
3. **Audit-as-Notes** — correct per record, unqueryable across records. Blocks forensic and
   time-series analytics.

### Single points of failure

Unchanged from File 28: session transport (S-1), one org (S-2), one admin (S-3),
`generateAuditLog` (S-4), no event consumer (S-5). **Plus one new:**

**S-6 · The backup exists in exactly one place.** It closed the data-loss risk against Zoho-side
failure and introduced a new concentration: a single unencrypted copy on one laptop.

### Performance & maintenance risks

- **Performance:** no latency-sensitive path exists. The only measurable risk is D-5 at scale.
- **Maintenance:** documentation is strong (34 files) and logic is version-controlled and asserted.
  The real risk is **documentation drift** — 34 files must stay true, and only `platform-health.sh`
  and `verifyPlatform` are self-checking. Everything else is prose that can quietly go stale.

### Verdict

**The platform is correct, documented, verifiable and honest about its limits.** Its weaknesses are
uniformly operational rather than architectural: nothing runs on a schedule, nothing alerts, and one
laptop holds both the deploy path and the only backup.

**Highest-value remaining engineering work, in order:**

1. Get the backup off the machine and encrypted (S-4, S-6) — **not engineering, but first**
2. Schedules (D-3) → unlocks automated backup, sweeps and health checks
3. Alerting on `ok:false` (R-6) → turns detection into notification
4. CI without a browser (D-2) → removes the structural SPOF
5. Rename the duplicate user (S-1) → two minutes, protects every future audit record
