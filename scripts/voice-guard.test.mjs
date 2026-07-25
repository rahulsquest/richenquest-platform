/**
 * Tests for the voice guard's negation scoping.
 *
 * This exists because the rule is genuinely subtle and gets it wrong in both
 * directions if written carelessly:
 *   · too strict → flags our own disclaimers ("we cannot guarantee admission"),
 *     which would train people to delete exactly the sentences the
 *     Constitution requires (6.3, 13.6);
 *   · too loose  → a denial in an earlier sentence launders a real overclaim.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { isNegated } from "./voice-guard.mjs";

/** Locate the guarantee-word the guard would match, then ask if it is negated. */
function negatedAtGuarantee(text) {
  const m = /\bguarantee[ds]?\b/i.exec(text);
  assert.ok(m, `test string contains no guarantee word: ${text}`);
  return isNegated(text, m.index);
}

test("denials are not flagged — plain negation", () => {
  assert.equal(negatedAtGuarantee("We do not and cannot guarantee admissions, visas or scholarships."), true);
  assert.equal(negatedAtGuarantee("We never guarantee a visa outcome."), true);
});

test("denials are not flagged — negation far back in the same sentence", () => {
  // The live case from legal/terms: the "No" is ~60 characters before the match.
  assert.equal(
    negatedAtGuarantee("No statement by any member of our team should be read as such a guarantee."),
    true
  );
});

test("denials are not flagged — second occurrence in a listing", () => {
  // The live case from services: the FIRST "guaranteed" sits right after "No",
  // the second is far enough away that a character-window check would miss it.
  const text = "No guaranteed-admission or guaranteed-visa claims — from us or anyone we work with.";
  const second = text.indexOf("guaranteed", text.indexOf("guaranteed") + 1);
  assert.equal(isNegated(text, second), true);
});

test("real overclaims ARE flagged", () => {
  assert.equal(negatedAtGuarantee("Guaranteed admission to top universities."), false);
  assert.equal(negatedAtGuarantee("Our process delivers guaranteed visa approval."), false);
});

test("a denial in a PREVIOUS sentence does not launder a later claim", () => {
  // The failure mode that matters: scoping must stop at the sentence boundary.
  assert.equal(
    negatedAtGuarantee("We cannot promise this. Guaranteed results follow our method."),
    false
  );
});

test("an em-dash clause boundary also scopes the negation", () => {
  assert.equal(
    negatedAtGuarantee("We are careful and evidence-led — guaranteed outcomes are what we sell."),
    false
  );
});
