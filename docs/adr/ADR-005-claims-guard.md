# ADR-005 — Claims-guard: the Verified Claims Library enforced in CI

**Status:** Accepted 2026-07-19

## Context
File 08 establishes RichenQuest's integrity system: only verified claims may appear in any
outbound material, with specific bans (inflated student counts, visa success rates,
present-tense "AI-powered", "partner of X" before signature). Company policy documents don't
enforce themselves, and the website is the most public claim surface the company has.

## Decision
1. `website/src/data/claims.json` is the machine-readable mirror of File 08 Part B and the only
   permitted source of company facts in templates. Changes require founder sign-off →
   update File 08 → then the code PR, in that order.
2. `scripts/claims-guard.mjs` scans the **built** HTML (post-data-injection, i.e., what users
   actually see) and fails CI on banned patterns: "hundreds of students", any percentage tied
   to visa/success, "AI-powered", partnership claims naming institutions absent from the
   signed-partners allowlist (currently empty), and student-placement counts that don't match
   the verified figure.

## Consequences
- File 08 becomes an enforced system rather than a hope; AI-generated content in the future
  passes the same gate (File 09 §9).
- Known limitation: regex screening produces false negatives (clever paraphrase) and occasional
  false positives (legitimate market statistics). It is a net under human review, not a
  replacement — File 10 §7 keeps reviewers responsible for every factual sentence.
- The 2026-07-17 trust-asset list ("100+ students", partner logos) remains blocked until the
  founder reconciles it with File 08 (File 09 risk R2).
