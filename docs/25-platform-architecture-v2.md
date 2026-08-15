# File 25 — Platform architecture v2

**Every capability claim below was tested against the live tenancy on 2026-08-15 and the probe
deleted.** Nothing here is inferred from documentation or assumed from a URL. Three earlier "no
API" conclusions in this project came from guessed URLs (File 21 §6c); the method now is: inspect
what Zoho's own UI requests, or compile a probe and read the error.

---

## G-5 · Application domain — **architecture verified, ready to implement**

This was blocked on one question: *can this org create a custom module?* Recorded in File 24 as
"needs a licence answer first". **Answered objectively: yes.**

### What was tested

| Test | Result |
|---|---|
| `POST /crm/v8/settings/modules` | **201 Created** — needs a `profiles` array with `permission_type` |
| Module appears with `generated_type: custom` | yes — `ZZProbe_Applications`, internal `CustomModule3` |
| `createFields` with `lookup` → `Deals` | **created** |
| `createFields` with `lookup` → `Accounts` | **created** |
| `createFields` with `lookup` → `Contacts` | **created** |
| Picklist field on custom module | created |
| Record created holding a live lookup | created and COQL-queryable, resolving to the real university |
| Related list auto-appears on parent | **yes** — `Applications` on Accounts, type `custom_lookup` |
| `DELETE /crm/v8/settings/modules/<id>` | `202 SCHEDULED` — **deletion is asynchronous** |

Probe module, probe record and all probe fields removed; `custom modules remaining: []`.

### The decision

**Application becomes a custom module — a true junction entity.** Not a Deal, not a Quote, not a
subform.

```
Contacts (Student) ──┐
Deals (Student Case) ─┼──> Applications ──> Accounts (University)
                      │         │
                      │         ├─ program, intake, status
                      │         ├─ offer: received / conditions / deadline
                      │         ├─ scholarship: amount / conditions
                      │         ├─ deposit: due / paid
                      │         └─ timeline via Notes, tasks via createFollowUpTasks
```

**Why not the alternatives, explicitly:**

- **Not more fields on `Deals`.** A case applies to *many* universities. One-to-many cannot be
  modelled as columns without inventing `University_1`, `University_2`… which caps the model and
  makes "which universities convert best" unanswerable — the very metric that should drive the
  partnership programme.
- **Not `Quotes`.** Quotes carry pricing, line items, tax and a sales-document lifecycle. Every one
  of those becomes a lie about what an application is, and Finance would eventually read them.
- **Not a subform.** Subforms are rows *inside* a parent record. They cannot be owned, assigned,
  audited, or looked up from the University side — and the University side is exactly where
  partnership KPIs need them.

**Cost accepted:** each Application is a record, so 10,000 students × ~5 applications = 50,000
records and a matching share of the API budget (ADR-009). That is real and it is the right trade —
the alternative is a model that cannot answer the business's central question.

**Not implemented yet, deliberately.** The instruction is architecture before implementation, and
the field list should be agreed before a module with a permanent `api_name` is created in
production.

---

## G-3 · Document platform — **WorkDrive verified, design below**

### What was tested

WorkDrive **is provisioned**: team `bnmqh39dcaa90b1304bc7b8ddc01d703f0bf6`, private space live.
API surface read from the app's own network traffic:

```
GET /api/v1/organization/<team>/currentuser          200
GET /api/v1/organization/<team>/settings             200   JSON:API format
GET /api/v1/organization/<team>/workflows            200   [] — none defined
GET /api/v1/organization/<team>/datatemplates?filter[assignable]=true
GET /api/v1/users/<uid>/labels
GET /api/v1/privatespace/<id>/files?page[offset]=0&page[limit]=50
```

Findings that matter:

| Question | Answer |
|---|---|
| REST API | **Yes** — `workdrive.zoho.in/api/v1`, JSON:API conventions |
| Folder model | Team → private space / team folders → folders → files |
| Metadata | **`datatemplates`** — custom metadata attachable to files. This is where document type, version and verification live |
| Labels | Yes, per-user and org labels |
| Workflows | Endpoint exists, **zero defined** |
| Pagination | `page[offset]` / `page[limit]` |
| **Reachable from Deluge** | **Yes** — `zoho.workdrive.uploadFile` is a recognised integration task. Compile error was *"No. of arguments mismatch"*, i.e. the function exists |
| CRM-native fallback | `zoho.crm.attachFile` compiles — attachments on records work with no WorkDrive dependency |

**Versioning, permissions, sharing, webhooks and hard limits were NOT tested.** They are
documented Zoho features but this project's rule is that untested is unverified. They must be
probed before anything depends on them.

### The decision

**Two tiers, chosen by what the document is for.**

1. **CRM attachments** for documents that are *evidence on a record* and are read by staff in
   context — consent captures, signed agreements, offer letters. Zero new infrastructure, native
   permissions, works today via `zoho.crm.attachFile`.
2. **WorkDrive** for the *student document file* — passport, transcripts, degree, MOI, IELTS — where
   there is a folder per student, versioning matters, and a student portal will eventually need
   scoped sharing. File 01 §6 already specifies this folder structure.

**The document record itself lives in CRM, not in the file store.** A file is bytes; a *document*
is a business object with a type, a version, a status and an expiry. Storing that state only as a
filename is how document tracking rots.

```
Document (CRM)                          File (WorkDrive or attachment)
  type      Passport | Transcript | …     the bytes
  student   → Contacts
  case      → Deals
  version   integer, monotonic
  status    Requested | Received | Verified | Rejected | Expired
  expiry    date (passports and IELTS expire — this drives reminders)
  verified_by / verified_on
  audit     → generateAuditLog
```

**`expiry` is not decoration.** A passport expiring mid-application and an IELTS score aging out
are two of the most common, most expensive failures in this business. A document model without
expiry cannot prevent them.

Whether Document is a custom module or fields on a related record is the same choice as G-5 and
should be made with it.

---

## G-4 · Finance — designed, deliberately dormant

**Zoho Books reports `org_type: test` / `mode: test`.** Every figure in it is fictional
(File 16 §2). Building finance automation on it would produce confident, wrong numbers — worse
than none, because people trust dashboards.

**Nothing is implemented. This is the design, held until Books exits test mode.**

```
CRM (system of record for the RELATIONSHIP)
  Student Case ──┐
                 │  service package, agreed fee, payment plan
                 ▼
Books (system of record for the MONEY)
  Customer  ←── one per Student (or Parent, where the parent pays)
  Invoice   ←── one per milestone: registration, application, visa, success fee
  Payment   ←── against invoice
                 │
                 ▼
Revenue recognition ──> Reporting
```

**Boundary rule: CRM never stores money.** A `Deal.Amount` that disagrees with a Books invoice is
a reconciliation problem forever. CRM holds the *commercial intent* (package, agreed fee); Books
holds the *financial truth* (invoiced, paid, outstanding). Reporting joins them on a stable id.

**The parent problem.** In this market the payer is usually the parent, not the student. Books
`Customer` must therefore be able to be the Parent while the Case belongs to the Student — which
is another reason Parent needs to exist as an entity (File 24, still absent).

**Founder-only boundary:** switching Books out of test mode and entering GST registration.

---

## G-6 · Knowledge platform — `Solutions` is sufficient, with one caveat

### Assessment

`Solutions` provides `Solution_Title`, `Question`, `Answer` (textarea), `Status`, `Published`
(boolean), `Tag`, `Product_Name`, `No_of_comments`, plus `Owner`, `Created_Time`, `Modified_Time`
and the standard record APIs.

**Sufficient for:** university requirements, visa rules, SOPs, policies, FAQ. It gives storage,
publication state, tagging, ownership, timestamps, permissions and search via `searchRecords` /
COQL — with no new infrastructure and no new system to operate.

**The caveat, stated plainly: search is keyword search, not semantic search.** `searchRecords`
matches substrings. "What documents does a German student visa need?" will not match an article
titled "Germany — national visa checklist" unless the words happen to overlap. For an AI assistant
grounded on this corpus, that is a real limitation.

**Verdict: sufficient now, insufficient for AI retrieval later.** Adopt it as the corpus of record;
revisit retrieval when an AI assistant is actually specified, at which point the corpus already
exists and only the index changes. Do not build a vector store for a use case that has no consumer
yet.

### Ingestion design

```
repo (authoring surface, version-controlled, reviewed)
  docs/*.md · ADRs · claims.json · SOPs (File 04) · university data
        │
        ▼  parser: front-matter + heading split
  normalized article  { title, question, answer, tags[], source_path, source_commit, verified }
        │
        ▼  publishKnowledgeArticle()  — upsert by source_path
  Solutions (corpus of record)
        │
        ▼
  searchKnowledge(query, tags)  — one API every client calls
```

**Retained on every article, as required:**

| Field | Carried in |
|---|---|
| version | `source_commit` (git sha) in the body footer |
| source | `source_path` in `Tag` and body footer |
| verification | `Status` + `Published`; unverified content stays unpublished |
| last updated | `Modified_Time`, native |

**Upsert by `source_path`, never blind insert** — otherwise every re-run duplicates the corpus.

**One hard rule:** `claims.json` remains the only source of company facts. Publishing an article
that contradicts it would route around `claims-guard` (ADR-005) and put unverified claims in front
of staff, who would then repeat them to students.

---

## Implementation order

Ordered by dependency, not appetite:

1. **Application module** (G-5) — verified, unblocks partnership conversion metrics. Agree fields first.
2. **Document model** (G-3) — same modelling choice as G-5; probe WorkDrive versioning and sharing before committing.
3. **Knowledge ingest** (G-6) — no dependencies, immediately useful, low risk.
4. **Finance** (G-4) — blocked on a founder action.

Events and scale review: **File 26**.
