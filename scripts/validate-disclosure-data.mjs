/**
 * Disclosure sync guard — Constitution Article 5.4.
 *
 * The matcher runs in the browser, so it carries an inline copy of which
 * destinations have a disclosable commercial relationship. This fails CI if that
 * copy disagrees with src/data/disclosure.json, so a newly signed agreement can
 * never be recorded in the register while the tool keeps telling students there
 * is no relationship.
 *
 * Run: node scripts/validate-disclosure-data.mjs
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REGISTER = path.join(ROOT, "website", "src", "data", "disclosure.json");
const MATCHER = path.join(ROOT, "website", "src", "assets", "js", "modules", "matcher.js");

const register = JSON.parse(await readFile(REGISTER, "utf8"));
const source = await readFile(MATCHER, "utf8");

const problems = [];

// The register's relationships are the source of truth.
const registered = (register.relationships ?? []).map((r) => r.destination).filter(Boolean).sort();

// Parse the matcher's inline RELATED map.
const m = /const RELATED = Object\.freeze\(\{([\s\S]*?)\}\);/.exec(source);
if (!m) {
  problems.push("matcher.js: could not find the RELATED disclosure map — did its shape change?");
} else {
  const inline = [...m[1].matchAll(/["']?([a-z-]+)["']?\s*:/g)].map((x) => x[1]).sort();
  const missing = registered.filter((d) => !inline.includes(d));
  const extra = inline.filter((d) => !registered.includes(d));
  for (const d of missing) {
    problems.push(
      `"${d}" has a relationship in disclosure.json but the matcher does not disclose it — ` +
        "students would be shown a recommendation with no disclosure."
    );
  }
  for (const d of extra) {
    problems.push(`matcher.js discloses a relationship for "${d}" that is not in disclosure.json.`);
  }
}

// The statements shown to students must match the register's wording.
for (const [key, expected] of [
  ["none", register.no_relationship_statement],
  ["prefix", register.relationship_statement_prefix],
]) {
  if (expected && !source.includes(expected)) {
    problems.push(`matcher.js disclosure text for "${key}" does not match disclosure.json.`);
  }
}

if (problems.length) {
  console.error(`✗ disclosure-data: ${problems.length} problem(s):\n`);
  for (const p of problems) console.error(`  · ${p}`);
  process.exit(1);
}

console.log(
  `✓ disclosure-data: matcher disclosure in sync with the register ` +
    `(${registered.length} disclosable relationship(s); reviewed ${register.last_reviewed})`
);
