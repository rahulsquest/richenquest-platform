# ADR-006 — Automation is event-driven code, not console-configured workflow rules

**Status:** Proposed → **AMENDED 2026-07-23** by the Titan architecture review
([titan-event-architecture-review.md](../architecture/titan-event-architecture-review.md)).
Supersedes the workflow-rule mechanism assumed by File 01 §5 / AM0.4 §5. Does not change the
*behaviour* those workflows specify, only where that behaviour lives.

> ## ⚠️ AMENDMENT — this ADR as originally written is INSUFFICIENT
>
> The design review validated the *mechanism* but found this ADR understated the risk. Official
> Zoho documentation **does not state** delivery guarantees, retry behaviour, duplicate handling, or
> ordering for `actions/watch`, and two official sources **contradict each other** on channel expiry
> (v8 reference: max one week; Kaizen #14 and Vertical Solutions v6: max one day).
>
> Consequently, **pure event-driven (Architecture B) is rejected.** The accepted design is
> **Architecture C (Hybrid)**: events as the low-latency path, plus a **scheduled reconciliation
> sweep as the correctness authority**, plus one temporary native-workflow fallback retired only
> after 30 days of measured delivery data.
>
> The reconciliation component is **not optional** and was absent from this ADR's original
> "Consequences" section, which listed reconciliation as merely "load-bearing". It is the mechanism
> by which the system is correct at all.
>
> Full analysis, risk register (R1–R14), architecture comparison, and phased roadmap:
> [titan-event-architecture-review.md](../architecture/titan-event-architecture-review.md) ·
> [titan-operations-and-roadmap.md](../architecture/titan-operations-and-roadmap.md)

## Context

AM0.4 §5 specifies five automations (instant lead response, stale-lead rescue, stage-triggered
updates, overdue-task escalation, deadline guardian) as **native Zoho CRM Workflow Rules**,
configured by hand in the console.

While automating AM0.4 we proved that mechanism cannot be provisioned programmatically
(`docs/automation-specs/AM0.4-automation-proofs.md` §2):

- Workflow **rules and criteria** *are* creatable via CRM API **v8**; the full schema was derived
  from a live rule.
- But every rule requires at least one **action entity** in `instant_actions.actions`, referenced
  by **id**. Actions cannot be defined inline (all inline shapes → `INVALID_DATA`) and cannot be
  created (`POST /settings/automation/tasks` → `INVALID_REQUEST`; `/settings/automation/actions/*`
  → `INVALID_URL_PATTERN` on v7 and v8).

The consequence is strategic, not cosmetic. RichenQuest is Tenant Zero of a multi-tenant platform
(File 18, "Titan OS") intended to scale to multiple countries and business units. An automation
layer that can only be produced by a human clicking a console:

- cannot be reproduced for a second tenant without repeating the clicks,
- cannot be version-controlled, diffed, code-reviewed, or rolled back,
- cannot be tested before it reaches production,
- drifts silently, with no way to audit intended-vs-actual,
- caps automation complexity at what a console form can express — which excludes the AI-first
  behaviour (lead scoring, language-aware messaging, document pre-checks) that is the product thesis.

## Evidence that a better mechanism exists

Probed live against the production org on 2026-07-23:

| Probe | Result | Meaning |
|---|---|---|
| `GET /crm/v8/actions/watch` | `401 OAUTH_SCOPE_MISMATCH` | endpoint **exists**, scope-gated |
| `GET /crm/v8/actions/definitelybogus` (control) | `404 INVALID_URL_PATTERN` | non-existent paths 404 — so the 401 above is real |
| `POST /crm/v8/actions/watch` | `401 OAUTH_SCOPE_MISMATCH` | creation is scope-gated, not unsupported |
| `POST /crm/v8/settings/functions` | `400 REQUIRED_PARAM_MISSING: metadata` | Deluge function deployment is **schema-gated, i.e. supported** |

The control comparison is the load-bearing evidence: a bogus sibling path returns a *different*
error, so `/actions/watch` is a genuine endpoint rather than a 401-for-everything catch-all.

## Decision

**CRM record events push to our own code; our code owns the behaviour.**

```
Zoho CRM record event (create/edit)
      │  /actions/watch subscription  (one idempotent API call per tenant)
      ▼
Catalyst function (this repository — versioned, tested, reviewable)
      │
      ├── assignment engine (config/tenant-*.json → assignment_engine)
      ├── language-aware templates (Preferred Language)
      ├── Cliq heartbeat + alerts (services/cliq.mjs)
      ├── CRM writeback (services/crm.mjs)
      └── AI hooks (scoring, document pre-check) — the product thesis
```

Native workflow rules are retained only where they are strictly simpler than code **and** carry no
multi-tenant reproducibility requirement. They are no longer the primary mechanism.

Deluge functions (`/settings/functions`) are a viable secondary path and are **not** adopted now:
they are API-deployable but keep logic inside Zoho, splitting the codebase across two runtimes for
no gain over a Catalyst function.

## Consequences

**Gained**
- Per-tenant provisioning becomes one idempotent API call driven by `config/automation-events.json`.
- Automation logic is version-controlled, unit-testable, code-reviewed, and rollback-able.
- Complexity ceiling is removed — AI behaviour becomes possible where a console form could not go.
- Intended state is auditable against live state (same pattern as `release-audit.mjs`).

**Costs / risks**
- **Requires a public HTTPS endpoint.** Catalyst does not exist yet — this is the gating dependency.
- **Requires `ZohoCRM.notifications.ALL` scope**, absent from the current token; adding it needs one
  founder consent.
- **Channels expire and must be renewed.** Zoho notification channels carry an expiry; a renewal
  job is mandatory or automation silently stops. This is the principal operational risk and must be
  covered by monitoring before go-live, not after.
- **Delivery is at-least-once and can fail.** Handlers must be idempotent, and a reconciliation
  sweep (Forms/CRM gap check, already required by AM0.4 §8) becomes load-bearing rather than
  optional.
- Zoho disables channels after repeated delivery failures — endpoint availability is now a
  first-class SLO.

**Not changed**
- File 01's specified *behaviour* is unchanged; only its implementation surface moves.
- CRM remains the system of record (ADR-003 holds).

## Status of implementation

Infrastructure is built and unit-tested in this repository
(`services/notifications.mjs`, `provision-notifications.mjs`, `config/automation-events.json`)
and is **deliberately not executed against production**: with no public endpoint, creating a
subscription would register a channel that cannot receive deliveries and would be auto-disabled.
Execution is gated on Catalyst + the notifications scope. Until then AM0.4's five automations remain
console work, tracked as a manual action.
