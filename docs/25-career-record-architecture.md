# The Career Record — System Architecture

**Version 1.0 · 2026-07-25 · Phase 4/5 foundation**
Governed by [the Constitution](20-constitution.md) · builds on [Trust Infrastructure](24-trust-infrastructure.md).

The Career Record is the permanent, chronological, auditable history of an individual's
international career. **It is the only source of truth.** The website consumes it, the
dashboard renders it, the CRM manages it, the Partner Portal reads a permitted slice of it,
the AI layer analyses it. No interface owns it. Not even RichenQuest owns it — the
individual does.

---

## 0. The five decisions that cannot be retrofitted

Everything else here is detail. These five would be ruinously expensive to add later, so
they are in v1 or the design has failed.

1. **The log is the truth; everything else is a projection.** Not "we also keep an audit
   log". There is no separate mutable table that is *really* the state.
2. **Per-subject hash chaining.** Tamper-evidence must be structural. A company whose
   entire position is auditability cannot ask to be believed about its own history.
3. **Erasure by crypto-shredding, not deletion.** Append-only and the right to erasure are
   in direct conflict. Resolved at the storage layer (§11.4) — impossible to bolt on.
4. **Permissions as recorded grants, reads as recorded events.** "Privacy is architecture"
   means an access decision is itself part of the record.
5. **The export format *is* the internal format.** Lock-in becomes structurally impossible
   rather than promised against.

---

## 1. CAREER RECORD ARCHITECTURE

```
                    ┌──────────────────────────────────────────┐
   WRITE PATH       │            COMMAND SERVICE               │
                    │  validate → authorise → invariants →     │
                    │  hash-chain → append (atomic, seq CAS)   │
                    └───────────────────┬──────────────────────┘
                                        │ append-only, never UPDATE/DELETE
                    ┌───────────────────▼──────────────────────┐
                    │        THE EVENT LOG  (source of truth)  │
                    │   immutable · ordered per subject ·      │
                    │   hash-chained · schema-versioned        │
                    └───────────────────┬──────────────────────┘
                                        │ replay / subscribe
        ┌───────────────────────────────┼───────────────────────────────┐
        ▼                               ▼                               ▼
┌───────────────┐            ┌──────────────────┐            ┌──────────────────┐
│  PROJECTIONS  │            │  IDENTITY VAULT  │            │  DOCUMENT STORE  │
│ (read models, │            │  PII, per-subject│            │ content-addressed│
│  rebuildable) │            │  encryption keys │            │  hash in events  │
└───────┬───────┘            └──────────────────┘            └──────────────────┘
        │ permission-filtered views
   ┌────┴─────┬──────────┬───────────┬──────────┐
   ▼          ▼          ▼           ▼          ▼
 Website  Dashboard    CRM     Partner Portal  AI Layer
(public   (subject   (counsellor  (scoped,    (suggestions
 figures)  timeline)   ops)      time-boxed)   only)
```

**Rules that give this its properties:**

- The write path is the **only** way in. No interface writes storage directly.
- Projections are **derived and disposable**. Any of them can be dropped and rebuilt by
  replay. If a projection disagrees with the log, the log is right.
- PII never enters the event payload. Events carry a pseudonymous `subject_id`; names,
  contact details and identity documents live in the vault (§11.4).
- Documents are never inlined. Events carry `sha256` + a storage pointer, so tampering with
  a stored file is detectable without the file.

---

## 2. EVENT MODEL

### 2.1 The envelope

Every event, of every type, has the same envelope. Payload varies; envelope never does.

```jsonc
{
  "event_id":       "01JQ8ZK3M7N4P5R6S7T8V9W0X1",  // ULID: time-sortable
  "subject_id":     "sub_7f3a9c",                   // the individual, pseudonymous
  "seq":            42,                             // per-subject monotonic
  "type":           "recommendation.issued",
  "schema_version": 1,

  "occurred_at":    "2026-07-25T09:14:00Z",         // when it happened in the world
  "recorded_at":    "2026-07-25T09:16:22Z",         // when we wrote it

  "actor": {
    "kind":  "human",                               // human | ai | system | partner
    "id":    "usr_kunal",
    "role":  "counsellor",
    "on_behalf_of": null                            // set when acting for another
  },

  "evidence":   [ { "ref": "dest:germany@2026-07-19", "kind": "published_data",
                    "hash": "sha256:9f2c…" } ],
  "disclosure": { "shown": true, "register_version": "2026-07-25",
                  "statements": ["We hold no commercial relationship with…"] },

  "payload":    { /* type-specific, see 2.3 */ },

  "classification": "care_team",                    // drives permissions (§3.3)
  "corrects":       null,                           // event_id, for corrections
  "caused_by":      "01JQ8ZK…",                     // provenance chain across events

  "prev_hash": "sha256:4a1b…",                      // previous event for THIS subject
  "hash":      "sha256:c7e9…"                       // canonical hash of all the above
}
```

**Why ULID and not UUID:** event ids sort chronologically, so the log is readable and
range-scannable without a secondary index. At 250M events that matters.

**Why both `occurred_at` and `recorded_at`:** a counselling session held on Monday and
recorded on Tuesday is one event with two true timestamps. Conflating them makes history
subtly wrong, and it is unfixable later.

**Why `seq`:** enables compare-and-set appends (§10.3). Two counsellors writing
simultaneously cannot silently interleave.

### 2.2 Immutability and corrections

There is no update and no delete. Three mechanisms cover everything:

| Need | Mechanism |
|---|---|
| A fact was wrong | `*.corrected` event with `corrects: <event_id>` and the new value. Both remain. Projections show the corrected value **and** that a correction exists. |
| A fact ceased to be true | A new event stating the new state. Nothing is retracted. |
| Legally-required erasure | The event skeleton and hash chain remain; the PII it referenced becomes unrecoverable (§11.4). |

The projection surfaces corrections rather than hiding them. **A silently-corrected record
is indistinguishable from a rewritten one**, which defeats the point.

### 2.3 The event catalogue

Namespaced `domain.past_tense`. Adding a type is additive; changing one requires a new
`schema_version` with an upcaster (§9.4).

| Domain | Types |
|---|---|
| `profile` | `created` · `updated` · `reviewed` · `corrected` |
| `consent` | `given` · `withdrawn` · `guardian_linked` |
| `counselling` | `session_held` · `summary_issued` · `note_added` |
| `document` | `submitted` · `verified` · `rejected` · `expired` · `superseded` |
| `recommendation` | `issued` · `acknowledged` · `declined` · `withdrawn` · `outcome_recorded` |
| `application` | `prepared` · `submitted` · `withdrawn` · `outcome_received` |
| `admission` | `offered` · `accepted` · `declined` · `deferred` |
| `scholarship` | `identified` · `applied` · `awarded` · `refused` |
| `visa` | `applied` · `interview_held` · `granted` · `refused` · `appealed` |
| `arrival` | `confirmed` · `accommodation_secured` |
| `internship` | `started` · `completed` |
| `employment` | `started` · `changed` · `ended` |
| `mentorship` | `matched` · `session_held` · `ended` |
| `career` | `milestone_recorded` · `qualification_earned` |
| `access` | `granted` · `revoked` · `exercised` · `denied` |
| `ai` | `suggestion_generated` · `suggestion_accepted` · `suggestion_rejected` |
| `record` | `exported` · `checkpoint_written` · `erasure_executed` |

### 2.4 The recommendation — the reason this system exists

The test is: **in 2036, answer "why was this recommended?" without relying on anyone's
memory.**

```jsonc
{
  "type": "recommendation.issued",
  "occurred_at": "2026-07-25T09:14:00Z",
  "actor": { "kind": "human", "id": "usr_kunal", "role": "counsellor" },
  "evidence": [
    { "ref": "dest:germany@2026-07-19", "kind": "published_data", "hash": "sha256:9f2c…" },
    { "ref": "doc:transcript@v2",        "kind": "subject_document", "hash": "sha256:1d4e…" },
    { "ref": "claim:students-guided",    "kind": "public_claim",  "hash": "sha256:77af…" }
  ],
  "disclosure": { "shown": true, "register_version": "2026-07-25",
                  "statements": ["We hold no commercial relationship with…"] },
  "payload": {
    "recommended":  [ { "option": "dest:germany", "rank": 1, "rationale": "…" } ],
    "alternatives_considered": [
      { "option": "dest:ireland", "rejected_because": "tuition exceeds stated budget by ~€12,000/yr" },
      { "option": "dest:netherlands", "rejected_because": "no February intake for this programme" }
    ],
    "risks_explained": [
      { "risk": "APS verification can add 8–10 weeks", "acknowledged": true },
      { "risk": "Blocked account requirement ≈ €11,900/yr", "acknowledged": true }
    ],
    "criteria_version": "matcher@1.3.0",
    "reproducible": true,
    "ai_suggestion_ref": "01JQ8Z…"        // null when no AI was involved
  }
}
```

**Acknowledgement and outcome are separate events, not fields** — because they happen
later, sometimes years later, and a field would have to be mutated to hold them. That
mutation is exactly what this architecture forbids.

```
recommendation.issued ──▶ recommendation.acknowledged   (caused_by, days later)
                     └──▶ recommendation.outcome_recorded (caused_by, years later)
```

**Reproducibility** is a real property, not a label: `criteria_version` plus the pinned
`evidence` hashes mean the same inputs can be re-run through the same ruleset in 2036 and
must yield the same output. If they do not, either the evidence or the criteria changed —
and both are recorded.

### 2.5 Invariants enforced at the write path

Refusals, not warnings. These are checked before anything is appended.

| # | Invariant | Constitution |
|---|---|---|
| I1 | `recommendation.issued.actor.kind` **must be `human`** | 6.7, 12.1 |
| I2 | Every `recommendation.issued` carries ≥1 `evidence` entry | 6.3 |
| I3 | Every `recommendation.issued` carries `disclosure.shown: true` | 5.4 |
| I4 | `seq` must equal current head + 1 (CAS) | integrity |
| I5 | `prev_hash` must equal the current chain head | integrity |
| I6 | `corrects` must reference an existing event for the same subject | integrity |
| I7 | AI actors may only write `ai.*` and `*.suggested` types | 12.1, 12.2 |
| I8 | No AI-analysis event on a subject flagged `minor` | 12.3, DPDP |
| I9 | Partner actors may only append `partner_contributable` types | 14.5 |
| I10 | `occurred_at` may not be in the future | integrity |

---

## 3. PERMISSION MODEL

### 3.1 Roles

| Role | Nature |
|---|---|
`subject` | The individual. Owns the record. Full read, always. Cannot delete history.
`guardian` | Parent/guardian, explicitly linked by a `consent.guardian_linked` event. Scoped, expires at majority.
`counsellor` | Care team. Read/write within assignment.
`partner` | University/employer. Narrow, purpose-bound, time-boxed, **never** full timeline.
`administrator` | Operational. Cannot read counselling notes without a logged break-glass grant.
`auditor` | Read-only, chain verification, may read metadata without payload PII.
`ai_service` | Read a filtered slice; write only `ai.*`.

### 3.2 Grants are events

A grant is not a row someone can flip. It is an append-only event:

```jsonc
{ "type": "access.granted",
  "payload": { "grantee": "partner:uni_debrecen", "role": "partner",
               "purpose": "admission_assessment",
               "scope": { "types": ["document.verified","application.submitted"],
                          "classification_max": "partner_shareable" },
               "expires_at": "2026-12-31T00:00:00Z",
               "granted_by": "sub_7f3a9c" } }
```

Revocation is `access.revoked`. **The history of who could see what is itself auditable** —
which is the only way "we never shared your data" can be a checkable statement.

### 3.3 Classification drives visibility

Every event carries a `classification`. Access = role capability ∩ classification ceiling.

| Classification | Meaning | Visible to |
|---|---|---|
`public` | Non-identifying, publishable | anyone
`subject` | The individual's own | subject, guardian (if minor)
`care_team` | Operational advisory detail | subject, assigned counsellors
`partner_shareable` | Deliberately shareable with a named partner for a stated purpose | subject, counsellor, granted partner
`restricted` | Identity documents, financials, safeguarding | subject, named counsellor + logged access
`internal` | Governance, audit metadata | administrator, auditor

**Default deny.** An event type without an explicit classification cannot be written (I11).

### 3.4 Every read is an event

Any non-subject read of `care_team` or above appends `access.exercised` — who, when, what
scope, under which grant. This makes the steering audit (Constitution 5.5) computable, and
it means a student can be shown exactly who looked at their file.

---

## 4. DATA MODEL

Three stores, deliberately separate, because they have different lifetimes and different
legal obligations.

| Store | Contents | Mutability | Lifetime |
|---|---|---|---|
**Event log** | Envelopes + non-identifying payloads | append-only | permanent |
**Identity vault** | Names, contacts, identifiers, per-subject keys | mutable, versioned | erasable |
**Document store** | Files, content-addressed by sha256 | write-once | erasable |

Events reference the other two by opaque handle. This separation is what makes §11.4
possible: destroy a subject's key and the vault becomes noise while the log stays whole.

**Reference syntax** — stable, resolvable, version-pinned:

```
dest:germany@2026-07-19     published destination data, as of a date
claim:students-guided       an Evidence Register claim (Phase 3)
doc:transcript@v2           a document version in the store
usr_kunal                   an actor
partner:uni_debrecen        an institution
```

Note the continuity: `claim:` references resolve into the **same Evidence Register the
public website renders provenance marks from**. A figure means the same thing whether it is
on the homepage or inside someone's record. That was the point of Phase 3.

---

## 5. AUDIT MODEL

### 5.1 Hash chain

Per subject, `hash = sha256(canonical_json(event − hash))`, and `prev_hash` = previous
event's hash. Canonicalisation is strict: sorted keys, no insignificant whitespace, UTF-8,
explicit nulls. Any alteration to any past event breaks every subsequent hash.

### 5.2 Checkpoints and external witness

Periodically (and on export), a `record.checkpoint_written` event records the chain head.
Checkpoint digests across all subjects are aggregated into a **daily digest published
publicly**. Anyone holding an old published digest can prove we have not rewritten history
before that date — including against us.

This is the difference between "we don't alter records" and "we *cannot* alter records
undetectably".

### 5.3 What an auditor can verify without seeing PII

Chain integrity · that every recommendation had human authorship, evidence and disclosure
· access history · correction history · that projections match a replay. All from envelopes
and metadata alone.

---

## 6. AI INTEGRATION MODEL

**AI advises; a named human decides.** Architecturally, not by policy.

- AI writes **only** `ai.suggestion_generated` (I7). There is no code path by which an AI
  actor can author a `recommendation.issued` (I1).
- Every suggestion records `model_id`, `model_version`, `inputs_hash`, `evidence[]`,
  `criteria_version` and its own confidence. A suggestion with no evidence is rejected at
  the write path.
- A human decision that used a suggestion **must** cite it (`ai_suggestion_ref`), and
  `ai.suggestion_accepted` / `_rejected` records the judgement. **The rejection rate is a
  monitored metric** — an AI nobody ever overrides is an AI making the decisions.
- `ai.*` events are visibly distinguished in every projection. There is no rendering mode
  where AI and human judgement look the same.
- Subjects flagged `minor`: no AI analysis at all (I8), satisfying DPDP's prohibition on
  profiling children.
- EU AI Act: we never build or operate applicant screening for institutions
  (Constitution 12.2). That is enforced by the absence of any partner-facing scoring
  projection — not by a promise.

---

## 7. TIMELINE ARCHITECTURE

The timeline is not a page. It is the canonical projection: an ordered, filtered, grouped
fold over the subject's events.

```
timeline(subject_id, viewer_role, grants, now) → TimelineEntry[]
```

Each entry exposes exactly the founder's fields, all derived, none stored twice:

| Field | Source |
|---|---|
Type · Time · Actor | envelope
Evidence | `evidence[]`, resolved to human-readable references
Decision | payload
Disclosure | `disclosure`
Outcome | linked `*.outcome_recorded` via `caused_by`
Linked documents | `doc:` references resolved to permitted handles
Future follow-up | open `*.due` obligations not yet satisfied

**Properties that follow from being a projection:** it is identical in every interface
because it is one function; it is cheap to change because nothing is migrated; and it can
be recomputed for a past date — *"what did this record look like when that advice was
given?"* — because the log has not moved.

---

## 8. EXPORT ARCHITECTURE

**Designed first, on purpose.** The export format is the internal format, so lock-in is not
a policy we promise against — it is structurally unavailable to us.

```
richenquest-record-<subject>-<date>/
  manifest.json          subject, range, counts, chain head, tool version
  events.jsonl           every event, one per line, in order, verbatim
  documents/<sha256>/…   every referenced document, named by content hash
  identity.json          the subject's own PII (their data, in the clear, to them)
  verify.mjs             standalone verifier — no RichenQuest code, no network
  README.md              plain-language explanation of the format
```

`verify.mjs` recomputes the hash chain and every document hash and prints a pass/fail. It
depends on nothing but a JS runtime. **A student can verify their record's integrity ten
years after leaving, with RichenQuest gone.**

Exports are themselves events (`record.exported`), so the record shows when it was taken.
Machine-readable and standards-aligned where standards exist (Europass, verifiable
credentials) — Constitution 23.1.

---

## 9. API ARCHITECTURE

### 9.1 Shape

Commands and queries are separated, because they have different authorisation, different
consistency needs and different audit obligations.

```
POST /v1/records/{subject_id}/events        append (idempotent)
GET  /v1/records/{subject_id}/timeline      projection, permission-filtered
GET  /v1/records/{subject_id}/events        raw log (auditor / subject / export)
POST /v1/records/{subject_id}/access        grant / revoke
GET  /v1/records/{subject_id}/export        signed archive
GET  /v1/verify/{subject_id}                chain status, no payloads
```

### 9.2 Idempotency

Every append carries a caller-generated `idempotency_key`. Retries are safe — a
counsellor's flaky connection must never double-record a recommendation.

### 9.3 Concurrency

Appends declare `expected_seq`. A mismatch returns `409` with the current head; the caller
re-reads and retries. No last-write-wins anywhere.

### 9.4 Versioning

`schema_version` per event. Readers run **upcasters** — pure functions from version *n* to
*n+1* — so old events are never migrated in place. The log from 2026 is still readable in
2036 without having been touched.

---

## 10. DATABASE DESIGN

### 10.1 A storage port, not a database choice

```js
EventStore = {
  append(subjectId, event, { expectedSeq, idempotencyKey }),
  read(subjectId, { fromSeq, toSeq }),
  head(subjectId),
  scanAll({ fromEventId })   // for projection rebuild
}
```

Today it is backed by Catalyst Data Store, because that is where RichenQuest already runs.
It will not be in 2036, and that is fine: **because the log is append-only, migration is a
replay, not a migration.** This is the single biggest reason to be event-sourced here.

### 10.2 Target relational shape (the 2036 form)

```sql
CREATE TABLE events (
  subject_id   text        NOT NULL,
  seq          bigint      NOT NULL,
  event_id     text        NOT NULL UNIQUE,
  type         text        NOT NULL,
  occurred_at  timestamptz NOT NULL,
  recorded_at  timestamptz NOT NULL,
  classification text      NOT NULL,
  actor_kind   text        NOT NULL,
  envelope     jsonb       NOT NULL,
  prev_hash    text,
  hash         text        NOT NULL,
  PRIMARY KEY (subject_id, seq)
) PARTITION BY HASH (subject_id);

-- No UPDATE or DELETE grant exists for the application role.
-- Append-only is enforced by privilege, not by discipline.
REVOKE UPDATE, DELETE ON events FROM app_writer;
```

Partitioning by `subject_id` is right for the access pattern: reads are almost always "one
person's history". Projections live in separate tables and are rebuildable, so they may be
indexed freely without touching the log.

### 10.3 Sizing at 1M individuals

~250 events × ~1.5 KB = **≈375 GB** of log, plus documents in object storage. That is an
unremarkable single partitioned Postgres cluster in 2036 terms, with older partitions
archived to cold storage — chain intact, because hashes travel with the events.

---

## 11. SECURITY ARCHITECTURE

### 11.1 Threat model — including us

The adversaries that matter: an attacker seeking identity documents; a partner seeking
advantage; **an insider quietly altering a record**; and a future RichenQuest under
commercial pressure to revise its own history. The last two are why the chain and the
published digest exist.

### 11.2 Boundaries

Write path is the only entry. Interfaces hold scoped, short-lived credentials. Partner
access is purpose-bound and time-boxed. Break-glass administrator access requires a
recorded grant and pages an accountable human.

### 11.3 Data at rest

Log: encrypted at rest. Vault: per-subject envelope encryption. Documents: encrypted,
content-addressed, no guessable names.

### 11.4 Erasure vs immutability — the hard problem, solved deliberately

DPDP and GDPR grant erasure. Append-only forbids deletion. Both are non-negotiable, so the
resolution is at the storage layer:

- All PII lives in the vault, encrypted under a **per-subject key**.
- The event log holds only pseudonymous ids and non-identifying payloads.
- Erasure destroys the subject's key. The PII becomes cryptographically unrecoverable;
  the event skeleton and hash chain remain valid and verifiable.
- `record.erasure_executed` records that it happened, when, and under what request.

The result: the individual's right to disappear is honoured **and** the audit trail proves
we did not rewrite anything. Neither is sacrificed. This cannot be retrofitted — it dictates
where every field lives — which is why it is decision #3 in §0.

### 11.5 Minors

`minor` flag from date of birth in the vault: guardian grants required, AI analysis blocked
(I8), partner sharing restricted, and automatic re-evaluation at majority.

---

## 12. FUTURE SCALABILITY PLAN

### 12.1 The 2036 test, answered honestly

**Would this architecture still be correct at 1M+ individuals?**

**Yes**, and specifically:

| Dimension | Verdict |
|---|---|
Data volume | ~375 GB log. Fine, partitioned. ✅
Read load | Projections absorb it; log reads are point-lookups by subject. ✅
Write load | Appends are per-subject serialised, globally parallel. No hot partition. ✅
New event types | Additive. ✅
New interfaces | New projection, no schema change. ✅
New geographies | Vault is regionally shardable; log is pseudonymous, so residency is a vault question. ✅
Storage change | Replay. ✅
Regulatory change | Classification + vault separation absorb most of it. ✅

**What would strain it, and the answer:**

1. **Global cross-subject analytics** — the log is partitioned for per-person reads. Answer:
   a separate analytics projection into a columnar store, fed from the log. Never query the
   log for aggregates.
2. **Very long chains** (a 40-year record) — verification cost grows linearly. Answer:
   checkpoints let a verifier start from the last trusted digest instead of genesis.
3. **A partner ecosystem wanting write access at scale** — answer: partners append only
   `partner_contributable` types through the same write path (I9), never into the log
   directly. Already covered.
4. **Multi-tenancy** if RichenQuest ever licenses this — `subject_id` is already opaque;
   add a tenant dimension to partitioning. Non-breaking.

### 12.2 What I would refuse to add, ever

- A mutable "current state" table treated as truth.
- Deleting or editing events for convenience.
- An AI code path that can author a recommendation.
- A partner-facing applicant scoring projection (Constitution 12.2).
- Any field in the log that identifies a person directly.

### 12.3 Build order

| Stage | Scope |
|---|---|
**1. Core (now)** | Event schema, hash chain, invariants, storage port, projection, export + verifier |
**2. Dashboard (Phase 4)** | Timeline projection for `subject`; counselling and recommendation events written by the CRM |
**3. Record (Phase 5)** | Documents, identity vault, crypto-shredding, export UI |
**4. CRM (Phase 6)** | Counsellor write surfaces on top of the same API |
**5. Partner (Phase 7)** | Grants, scoped projection, contribution types |
**6. AI (Phase 8)** | Suggestion events, override-rate monitoring, steering audit |

Stage 1 is implemented and tested in `functions/record/` alongside this document, because an
architecture whose central invariants are not executable is a hypothesis.

---

*Constitution references are to [docs/20-constitution.md](20-constitution.md).*
