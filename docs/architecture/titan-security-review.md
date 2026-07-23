# Titan — Security Review

**Scope:** the automation runtime written this phase (`functions/titan/`, `functions/catalyst/`, and
the `functions/zoho/` additions that support it). **Date:** 2026-07-24. Read-only review of shipped
code plus the fixes applied from it. Living document — extend on each material change.

## Findings

### SEC-1 — Forgeable webhook token (FIXED)
**Severity:** Medium. **Status:** fixed 2026-07-24.
**Finding:** the callback token was derived as `rq-${subscription.name}`. Subscription names live in
`config/automation-events.json`, which is not secret, so the token was predictable — an attacker who
knew a channel name could forge a notification that passed the token check.
**Blast radius (bounded by existing design):** the payload is ID-only and the engine always
re-hydrates from CRM with its own credentials (R7), so a forged event could **not inject data**. It
could, at most, trigger processing of a record whose id the attacker supplies — spurious work, not a
breach. Still, the token's defence-in-depth value was nil.
**Fix:** token is now `HMAC-SHA256(TITAN_WEBHOOK_SECRET, channel_id)` truncated to Zoho's 50-char
limit (`functions/titan/webhook-auth.mjs`) — unpredictable without the server-side secret, stateless
(recomputed per request, no per-channel storage), and the engine **fails closed** if the secret is
absent (rejects rather than accepts). Provisioner refuses to run without the secret.
**Regression tests:** a name-derived token is now rejected; token depends on secret + channel_id;
no-secret → `no_secret` rejection.

### SEC-2 — COQL string interpolation (HARDENED)
**Severity:** Low (inputs were already trusted). **Status:** hardened 2026-07-24.
**Finding:** `buildQuery` interpolates `module` and the datetime into a COQL string. Both were
trusted (module from config, datetime from `toZohoDateTime`), so not exploitable — but a future
config change or refactor could turn this into COQL injection.
**Fix:** `buildQuery` now validates `module` against `^[A-Za-z][A-Za-z0-9_]*$` and the datetime
against a digits/`:+-T.` character class, throwing on anything else. Two regression tests.

## Controls already in place (verified during review)

| Control | Where | Protects |
|---|---|---|
| No payload trust — always re-hydrate from CRM | `engine.mjs` §4 | forged/replayed events (R7) |
| Constant-time token compare | `engine.constantTimeEqual` | token timing leak |
| Fail-closed idempotency | `engine.mjs` §3, store contract | duplicate side effects (R2/R12) |
| Loop-breaker on automation-authored writes | `engine.isOurOwnWrite` | credit-exhaustion loop (R9) |
| PII never logged (recursive scrub, depth-capped) | `logger.scrub` | data leakage via logs |
| Record ids URL-encoded in CRM reads | `crm.getRecord` | path injection |
| Flow webhook host allowlist (https + Zoho hosts only) | `services/flow.mjs` | SSRF to arbitrary hosts |
| Secrets from env only, never logged; `.env` 600 + gitignored | `config.mjs`, filesystem | credential exposure |
| No secret in git history | full-history scan | credential exposure |
| Zero runtime dependencies | whole tree | supply-chain surface |

## Residual risks (accepted, tracked)

- **Zoho does not sign notifications (no HMAC of the body).** The token is a shared secret, not a
  signature; a replayed *genuine* notification would re-pass. Mitigated by idempotency (a replay of
  the same record version is a no-op) — accepted, since the correctness authority is reconciliation.
- **Delivery guarantees remain [UNKNOWN]** (architecture review Phase 2). Reconciliation is the
  compensating control, not a code fix.
- **Webhook secret rotation** is manual: rotating `TITAN_WEBHOOK_SECRET` requires re-provisioning
  channels so their tokens match. Documented; automate if rotation cadence demands it.
