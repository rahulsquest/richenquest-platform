/**
 * Tests for the CSS minifier in build.mjs.
 *
 * This exists because of a real defect: an earlier version stripped whitespace
 * around `+`, turning `clamp(2.4rem, 1.6rem + 3.6vw, 3.5rem)` into
 * `clamp(2.4rem,1.6rem+3.6vw,3.5rem)`. That is an INVALID value, so browsers
 * discarded the entire declaration — silently taking out the whole fluid type
 * scale on every page. Counting rules did not catch it, because the rule still
 * parsed; only its value was dropped.
 *
 * The lesson encoded here: a minifier must be tested on VALUES, not structure.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { minifyCss } from "./build.mjs";

test("preserves whitespace around + and - inside clamp/calc", () => {
  const out = minifyCss(":root{--x: clamp(2.4rem, 1.6rem + 3.6vw, 3.5rem);}");
  assert.match(out, /1\.6rem \+ 3\.6vw/, "the + operator must keep its spaces");

  const calc = minifyCss(".a{width: calc(100% - var(--pad));}");
  assert.match(calc, /100% - var\(--pad\)/, "the - operator must keep its spaces");

  const nested = minifyCss(".a{padding: max(1rem, min(2rem, 1rem + 2vw));}");
  assert.match(nested, /1rem \+ 2vw/);
});

test("still tightens around structural punctuation", () => {
  const out = minifyCss(".a , .b { color : red ; }");
  assert.equal(out, ".a,.b{color:red}");
});

test("strips comments but never inside strings", () => {
  assert.equal(minifyCss("/* gone */.a{color:red}"), ".a{color:red}");
  assert.match(
    minifyCss('.a::after{content:"/* kept */"}'),
    /content:"\/\* kept \*\/"/,
    "comment-like text inside a string is content, not a comment"
  );
});

test("preserves a data URI containing its own url(...) and parentheses", () => {
  // The grain texture is an inline SVG whose filter references url(#n) — a
  // naive scan to the first ")" truncates it and corrupts the stylesheet.
  const css = `.g{background-image:url("data:image/svg+xml,%3Csvg%3E%3Crect filter='url(%23n)' opacity='0.35'/%3E%3C/svg%3E")}`;
  const out = minifyCss(css);
  assert.match(out, /url\(%23n\)/, "inner url(#n) survives");
  assert.match(out, /%3C\/svg%3E"\)\}$/, "the data URI is not truncated");
});

test("preserves significant spaces inside unquoted values", () => {
  const out = minifyCss(".a{box-shadow:0 1px 2px rgb(22 35 58 / 0.08)}");
  assert.match(out, /0 1px 2px/, "space-separated lengths must survive");
  assert.match(out, /rgb\(22 35 58 \/ 0\.08\)/, "modern rgb() space syntax must survive");
});

test("drops the final semicolon in a block", () => {
  assert.equal(minifyCss(".a{color:red;}"), ".a{color:red}");
});

test("media query conditions keep their required spaces", () => {
  const out = minifyCss("@media (min-width: 40em) and (max-width: 64em){.a{color:red}}");
  assert.match(out, /@media \(min-width:40em\) and \(max-width:64em\)/);
});
