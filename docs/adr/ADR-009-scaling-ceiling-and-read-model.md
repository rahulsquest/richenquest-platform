# ADR-009 — The API ceiling, and where "Zoho is the backend" stops holding

**Status:** ACCEPTED · 2026-08-15
**Relates to:** ADR-003 (Zoho is the backend, no custom database) — **narrowed, not overturned.**

## Context

The mandate is a platform that reaches 10,000+ students and eight frontends *without a rewrite*.
Testing that claim means finding the binding constraint before it is hit, not after.

**Measured, not estimated** — `GET /crm/v8/__limits?feature=API`:

```json
{"period":"last_24_hours","feature":"API",
 "consumed_limit":335,"allowed_limit":60000}
```

**60,000 API calls per rolling 24 hours.** That is ~2,500/hour, ~0.7/second sustained.

Two properties of that number decide the architecture:

1. **It is org-wide.** Every client — website, admin panel, mobile app, four portals, every Deluge
   function that reads or writes, every integration — draws from the same 60,000.
2. **It scales with *user licences*, not with students.** Zoho grants API credits per paid user.
   Adding 10,000 students adds load and buys **zero** additional credit. Adding employees buys
   credit but adds load too.

That second property is the whole problem. Student-facing surfaces are pure demand with no supply.

### The arithmetic

Rough, deliberately generous to the current design:

| Source | Daily calls |
|---|---|
| 100 employees × ~200 CRM operations | 20,000 |
| Automation: 14 functions, most doing 2–5 reads/writes per invocation | 5,000–15,000 |
| 10,000 students × 2 portal views/day (status check) | 20,000 |
| Parent portal, partner portal, reporting, integrations | 10,000+ |
| **Total** | **55,000–65,000** |

The platform reaches the ceiling at roughly the scale it is being asked to reach — and a single
badly-written portal screen that fires five calls per page view moves that from "tight" to
"broken" without any change in student numbers.

`archiveExpiredPartnership` already illustrates the shape: it pages *all* Accounts and filters in
Deluge, because `searchRecords` rejects `less_than` on a date. Correct at 17 accounts. At 5,000
partner records it is 25 API calls per nightly run, and the same pattern applied to students would
be thousands.

## Decision

**Zoho CRM remains the system of record. It does not remain the read path for high-volume,
low-value reads.**

1. **Writes and business logic stay in CRM.** Every mutation continues to go through the Deluge
   functions — validation, audit and business rules stay in one place. ADR-003 holds here.
2. **The static website continues to post directly to Zoho.** One form post per lead is
   negligible. ADR-003 holds here too, unchanged.
3. **Any student-, parent-, or partner-facing portal MUST NOT read CRM directly.** Those surfaces
   are read-amplifying and credit-free. They read from a **read model** — a projection of CRM data,
   refreshed by CRM, serving reads without consuming CRM credit.
4. **The read model is not chosen here.** It is a real decision with real trade-offs and it should
   be made when a portal is actually specified, against that portal's shape. Candidates, with what
   is already known:
   - **Cloudflare Workers + KV/D1** — the org already runs on Cloudflare (ADR-007), edge-local,
     cheap. Introduces a second store to keep consistent.
   - **Zoho Catalyst DataStore/Cache** — stays inside Zoho's identity and billing. Note Catalyst
     was rejected for *hosting* (ADR-006, ADR-007); that judgement was about static hosting
     behaviour and says nothing about its datastore.
   - **Zoho Analytics** — right for *reporting* reads specifically; wrong for per-student lookups.
5. **Nothing may be designed that assumes unlimited CRM reads.** This ADR exists so that
   constraint is visible before a portal is built on a false assumption, not after.

## Consequences

**Good**
- The ceiling is known, measured, and written down before it is hit.
- ADR-003's real value — one place for business logic, no PII sprawl, no server to operate — is
  preserved for everything that actually depends on it.
- Portal work now starts from the right question ("what is the read model?") instead of
  discovering the limit in production.

**Bad, accepted**
- A read model is a second copy of data, and second copies go stale. Whichever option is chosen
  needs an explicit freshness contract — a student seeing yesterday's visa status is a support
  ticket at best.
- It is genuinely more infrastructure than ADR-003 envisaged. That is the honest cost of eight
  frontends and 10,000 students; pretending otherwise would be the more expensive choice.

**Neutral**
- Nothing changes today. There are no portals, `Deals` is empty, and consumption is 335/60,000.
  This is a constraint recorded ahead of need.

## Verification

- Ceiling re-read at any time: `GET /crm/v8/__limits?feature=API`.
- **Trigger for action:** sustained consumption above ~30,000/day (50%) means the read model stops
  being a design note and becomes the next piece of work.
- Before any portal ships, its expected daily call volume must be estimated and checked against
  remaining headroom. An unestimated portal is not ready to build.

## Rollback

Nothing to roll back — no code changed. If a paid plan materially raises the ceiling, re-read the
limit and revise the trigger threshold. **Raising the ceiling does not repeal the reasoning:**
read-amplifying surfaces still consume credit that student growth never replenishes.
