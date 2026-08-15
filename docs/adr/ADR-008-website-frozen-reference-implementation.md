# ADR-008 — The website is frozen as a reference implementation

**Status:** ACCEPTED · 2026-08-15
**Supersedes:** nothing. **Constrains:** ADR-001, ADR-002, ADR-005, ADR-007 (they now describe a
frozen artifact, not an active product).

## Context

The Cloudflare Pages site (`richenquest.pages.dev`) is complete against its original brief: 20
pages, CSP and cache policy verified live, claims-guard green, mobile Lighthouse gates passing,
and a lead funnel proven end to end into CRM. A replacement frontend is planned and will be built
by someone else.

Continuing to add frontend features would produce work that the replacement discards. Meanwhile
the parts of the system that *survive* a frontend rewrite — the CRM schema, the automation layer,
the lead-capture contract, the consent model — are where the remaining leverage is.

## Decision

**The website is feature complete and frozen as a reference implementation.**

1. No new frontend features. The site stays live as the working reference for the lead-capture
   contract and as the current public presence.
2. Changes are permitted only when they fall into one of four categories:
   - **Security** — CSP, headers, dependency or disclosure issues.
   - **Correctness** — the site states something untrue, broken, or newly non-compliant.
   - **Contract drift** — the webform keys rotate, or `webform-fields.json` changes, and the
     reference implementation would otherwise be lying to the next developer.
   - **Reusability** — the change produces an artifact the production website will consume
     (a contract, a schema, a token set, a documented behaviour).
3. Anything not in those four categories is out of scope, regardless of how small.

**Engineering effort moves to the backend and automation platform** (File 20): university
collaboration, internal CRM automation, reporting and dashboards, document automation, the
knowledge base and SOP corpus, and the Zoho-native services a future frontend can consume.

## Consequences

**Good**
- Work stops being throwaway. Everything built from here survives the rewrite by construction.
- The next frontend developer inherits a *stable* reference — File 17 and File 18 stop moving.
- The highest-value gap (a CRM that captures leads but barely acts on them) gets the attention.

**Bad, accepted**
- The prototype will slowly age against the brand. Accepted: it is explicitly a prototype, and
  ADR-007's hosting choice makes replacing it cheap.
- Some polish items in File 13 will never be done. They are recorded as deliberately dropped, not
  forgotten.

**Neutral**
- The build gates (`build.mjs`, `claims-guard.mjs`, `gen-edge-config.mjs`) stay in CI. They are
  cheap, and they are what keeps the reference honest.

## Compliance

A change to `website/` must state which of the four permitted categories it falls under, in the
commit message. Absent that, it should not be made.
