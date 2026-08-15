# File 26 — Event model and scale review

Companion to File 25. Same rule: capability claims are tested, probes deleted.

---

## G-7 · Event model

### What was tested

Zoho CRM has a change-notification API, and **it works on this plan**:

```
GET    /crm/v8/actions/watch                        204   (none subscribed)
POST   /crm/v8/actions/watch                        201   subscribed
         { channel_id, events:["Deals.create","Deals.edit"],
           channel_expiry, notify_url }
DELETE /crm/v8/actions/watch?channel_ids=…          200   unsubscribed
```

Probe subscription created against `Deals.create` / `Deals.edit` and **deleted immediately**;
`GET` re-confirmed `204`.

That is a real event producer: CRM will POST to an external URL when records change, with no
polling and no API-credit cost per read.

### The three producers, and which to use

| Producer | Fires on | Delivers to | Use for |
|---|---|---|---|
| **`actions/watch`** | record create / edit / delete | external HTTPS callback | integration events crossing a system boundary |
| **Workflow rule** | create / edit / field change / date | in-CRM actions | in-CRM reactions (tasks, email, field updates) |
| **Function call** | explicit invocation | whatever it calls | business transitions the platform itself performs |

**They are not interchangeable, and conflating them is the trap.** A workflow rule fires when a
record changes *in the UI*; it does **not** fire when a Deluge function changes the same record —
measured and recorded in File 22 §D-1. `actions/watch` sits below that distinction: it observes
the *data*, not the *actor*, so it fires either way.

**Therefore: `actions/watch` is the event backbone. Workflow rules are local reactions, not events.**

### Event schema

One envelope for every event, versioned from day one — an unversioned event contract is a
migration you cannot stage across multiple consumers.

```json
{
  "event": "StudentCase.StageChanged",
  "version": 1,
  "id": "evt_<uuid>",
  "occurred_at": "2026-08-15T14:03:12+05:30",
  "actor": { "type": "user|function|system", "id": "…" },
  "subject": { "module": "Deals", "id": "1292318000000912001" },
  "data": { "from": "New Inquiry", "to": "Agreement Sent" },
  "trace": { "source": "updateStudentCaseStage", "source_version": "1.1" }
}
```

`event` is `Entity.PastTenseVerb`. Past tense matters: an event is a **fact that has happened**, not
a request. `StageChanged`, never `ChangeStage`.

### Catalogue

| Event | Producer | Consumers | Status |
|---|---|---|---|
| `Lead.Created` | Web-to-Lead → workflow | lead triage, assignment | live as a rule |
| `Lead.StatusChanged` | `updateLeadLifecycle` | audit, reporting | live |
| `Student.Created` | `resolveStudent` | audit, future portal provisioning | live |
| `StudentCase.Created` | `createStudentCase` | audit, counselor notify | live |
| `StudentCase.StageChanged` | `updateStudentCaseStage` | tasks, audit, KPIs | live |
| `StudentCase.JourneyAdvanced` | `advanceStudentJourney` | tasks, audit | live |
| `Application.Created` / `.OfferReceived` | — | offer comparison, partnership KPIs | **blocked on G-5** |
| `Document.Uploaded` / `.Verified` / `.Expiring` | — | checklist, reminders | **blocked on G-3** |
| `Agreement.Signed` / `.Expiring` / `.Expired` | `renewPartnership`, `archiveExpiredPartnership` | onboarding, renewal | live |
| `Partnership.ContactLogged` | `logPartnershipContact` | timeline, KPIs | live |
| `Task.Overdue` | workflow rule (date-based) | escalation | live |
| `Payment.Received` | — | revenue, milestone unlock | **blocked: Books in test mode** |
| `SuccessStory.Approved` | — | marketing — **consent-gated, never automatic** | not built by design |

**Eight live, four blocked on entities that do not exist yet, one deliberately manual.**

### Delivery guarantees — what must be built, honestly

`actions/watch` delivers *at-least-once* and a callback can fail. Nothing today consumes it, so
none of the following exists yet, and each must exist **before** the first consumer ships:

- **Idempotency.** Every consumer keys on `event.id` and ignores repeats. Without it, a retried
  `StageChanged` raises the stage-entry task twice.
- **Retry.** Zoho retries on non-2xx; the consumer must be safe to retry, not merely reachable.
- **Ordering is not guaranteed.** Consumers must tolerate `OfferReceived` arriving before
  `Application.Created`. Design for reconciliation, not sequence.
- **Channel expiry.** `channel_expiry` is mandatory and finite — subscriptions **must be renewed on
  a schedule or events silently stop**. This is the single most likely way this design fails in
  production: nothing breaks loudly, events just stop.
- **Audit.** Every consumed event writes through `generateAuditLog`, so the event log and the record
  history cannot diverge.

**No consumer exists today, and none should be built until there is a place to receive it** — which
is the read-model decision deferred in ADR-009. Recording the design now prevents each future
consumer inventing its own envelope.

### S-3 · Reliability — how each silent failure is prevented

The design goal is that **no failure mode is silent**. Each row names the failure, how it is
detected, and where that detection lives.

| Failure | Detection | Status |
|---|---|---|
| **Watch subscription expires** — events stop, nothing errors | `platform-health.sh` prints every channel with its `channel_expiry` and flags that a lapsed channel stops events silently | **detection live**; auto-renewal needs a schedule (File 22 §D-3) |
| **No subscriptions at all** | health report prints `none subscribed` explicitly rather than an empty section | **live** |
| **Function regression** | `verifyPlatform` — 13 assertions, run before every deploy | **live** |
| **Probe records leaked by the harness** | harness re-reads each probe after deletion; anything still fetchable is reported in `cleanup.leaked` and forces `ok:false` | **live** |
| **Orphan probe functions left deployed** | health report lists every deployed function; a `zz*` name is visibly wrong | **live — caught `zzDelProbe` on first run** |
| **API quota exhaustion** | health report shows used/allowed with OK / WARN / CRITICAL against the ADR-009 50% trigger | **live** |
| **Schedules silently absent** | health report prints `defined: 0 / capacity 20` | **live** |
| **Duplicate event delivery** | consumer keys on `event.id` | **design only — no consumer exists** |
| **Consumer failure / dead-letter** | retry then park for inspection | **design only** |

**Retry and idempotency are deliberately unbuilt.** They belong to the event *consumer*, and there
is no consumer — building a dead-letter queue with nothing producing into it would be speculative
architecture, which the brief forbids. The contract is specified above so the first consumer
inherits it rather than inventing one.

**The honest gap:** subscription auto-renewal. Detection exists (the health report shows expiry);
automatic renewal does not, because it needs the schedules API whose create schema is still
unsolved (File 22 §D-3). Until then **renewal is an operator action driven by the health report**,
and that is written down rather than assumed.

---

## G-8 · Scale review

Reviewed against the four thresholds. **Verdict per decision, with the honest failure point.**

| Decision | 10 employees | 100 | 1,000 | 10,000 students | Holds? |
|---|---|---|---|---|---|
| **ADR-003** CRM is system of record | ✅ | ✅ | ✅ | ✅ | **Yes** — narrowed by ADR-009, not overturned |
| **ADR-009** portals read a read model | n/a | ✅ | ✅ | ✅ | **Yes** — this is the decision that saves the model |
| Business logic in Deluge functions | ✅ | ✅ | ⚠️ | ✅ | **Mostly** — see F-1 |
| `coreValidate` single validator | ✅ | ✅ | ✅ | ✅ | **Yes** |
| Audit as Notes | ✅ | ✅ | ⚠️ | ⚠️ | **Degrades** — see F-2 |
| Tasks as the work queue | ✅ | ✅ | ⚠️ | ⚠️ | **Degrades** — see F-3 |
| Application as custom module | ✅ | ✅ | ✅ | ⚠️ | **Yes, with volume cost** — 50k+ records |
| Journey axis separate from pipeline | ✅ | ✅ | ✅ | ✅ | **Yes** |
| Knowledge in `Solutions` | ✅ | ✅ | ✅ | ⚠️ | **Yes until AI retrieval** (File 25 G-6) |
| `actions/watch` event backbone | ✅ | ✅ | ✅ | ✅ | **Yes** — push, not poll |
| 60,000 API calls/day | ✅ | ⚠️ | ❌ | ❌ | **No** — the binding constraint |

### The four failure points, named

**F-1 · Deluge has no automated tests.** Correctness is proven by manual probe today. That is
adequate at 14 functions and one engineer; at 50 functions and five engineers it is how a silent
regression ships. There is no Deluge unit-test framework in this environment — the mitigation is a
`verifyPlatform()` function that exercises every guard against throwaway records and reports
pass/fail, runnable before every deploy. **Not built. Highest-value engineering work not yet done.**

**F-2 · Audit-as-Notes does not scale to forensics.** Notes are perfect for "what happened to this
record" and useless for "every stage change across all cases last quarter" — there is no efficient
cross-record query. At 10,000 students, compliance and analytics need an event store, which is the
`actions/watch` consumer above. Notes remain correct; they stop being sufficient.

**F-3 · Tasks are a to-do list, not a work queue.** No priority ageing, no reassignment on absence,
no SLA breach detection beyond one overdue email. At 100 counselors this needs real queue
semantics. `assignCounselor`'s least-loaded logic is the right seed and is already isolated in one
function — but load is currently counted per *lead*, which will not survive cases, applications and
documents competing for the same counselor's time.

**F-4 · The API ceiling is absolute** (ADR-009). 60,000/day is org-wide and scales with **user
licences, not students**. Every other decision here survives 100x; this one does not, and no amount
of code fixes it. It is the reason the read model is mandatory rather than optional.

### What changes if nothing else changes

At **1,000 employees / 10,000 students** the platform does not fall over architecturally — it falls
over on **quota**. The entity model, the function layer, the validation and the event design all
hold. That is the correct shape of a scaling problem: a known ceiling with a known mitigation,
rather than a redesign.

**No new ADR is required.** ADR-009 already records the constraint and the decision; F-1 to F-3 are
engineering work, not architectural reversals.

---

## Open, in priority order

1. ~~**`verifyPlatform()`**~~ — **built and passing 13/13** (F-1 closed). Run via
   `./scripts/platform-health.sh`.
2. **Application module** (File 25 G-5) — verified, awaiting agreed field list.
3. **Event consumer + read model** — one decision, unblocks F-2 and ADR-009 together.
4. **Knowledge ingest** (File 25 G-6) — independent, low risk.
5. **Finance** — founder-only: Books out of test mode.
