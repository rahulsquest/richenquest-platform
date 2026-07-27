/**
 * Matcher data guard — keeps the destination matcher honest.
 *
 * The matcher ranks destinations from a DESTINATIONS constant inside
 * website/src/assets/js/modules/matcher.js (the browser needs the data inline;
 * the zero-dependency build has no loops and does not copy src/data to dist).
 * That creates a second copy of facts whose source of truth is
 * website/src/data/destinations/<slug>.json → `match`.
 *
 * This script fails CI if the two ever drift, so a corrected tuition figure in
 * the JSON can never silently leave the matcher ranking students on stale data.
 *
 * Run: node scripts/validate-matcher-data.mjs
 */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEST_DIR = path.join(ROOT, "website", "src", "data", "destinations");
const MATCHER = path.join(ROOT, "website", "src", "assets", "js", "modules", "matcher.js");

/** Fields that must agree between the JSON `match` block and the JS constant. */
const FIELDS = [
  "tuition_eur_year",
  "living_eur_month",
  "intake_months",
  "work_hours_week",
  "poststudy_months",
  "english",
];

const problems = [];

// ---- Load the source of truth ------------------------------------------------
const sources = {};
for (const file of (await readdir(DEST_DIR)).filter((f) => f.endsWith(".json")).sort()) {
  const slug = file.slice(0, -".json".length);
  const data = JSON.parse(await readFile(path.join(DEST_DIR, file), "utf8"));
  if (!data.match) {
    problems.push(`${file}: missing a "match" block (the matcher needs machine-comparable fields)`);
    continue;
  }
  sources[slug] = data.match;
}

// ---- Load the matcher's inline copy ------------------------------------------
// Imported as a module so we compare real parsed values, not a regex guess.
const { DESTINATIONS } = await import(path.toNamespacedPath(MATCHER));
const inline = Object.fromEntries(DESTINATIONS.map((d) => [d.slug, d]));

// ---- Compare ------------------------------------------------------------------
const eq = (a, b) =>
  Array.isArray(a) || Array.isArray(b)
    ? Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i])
    : a === b;

for (const [slug, src] of Object.entries(sources)) {
  const got = inline[slug];
  if (!got) {
    problems.push(`${slug}: present in src/data/destinations but missing from the matcher's DESTINATIONS`);
    continue;
  }
  for (const field of FIELDS) {
    if (!eq(src[field], got[field])) {
      problems.push(
        `${slug}.${field}: JSON has ${JSON.stringify(src[field])} but matcher.js has ${JSON.stringify(got[field])}`
      );
    }
  }
}

for (const slug of Object.keys(inline)) {
  if (!sources[slug]) {
    problems.push(`${slug}: in the matcher's DESTINATIONS but has no src/data/destinations/${slug}.json`);
  }
}

// ---- Report -------------------------------------------------------------------
if (problems.length) {
  console.error("✗ matcher-data: the matcher has drifted from src/data/destinations/\n");
  for (const p of problems) console.error(`  · ${p}`);
  console.error("\n  Fix: update the DESTINATIONS constant in matcher.js to match the JSON.");
  process.exit(1);
}

console.log(
  `✓ matcher-data: ${Object.keys(sources).length} destination(s) in sync ` +
    `(${FIELDS.length} fields each) between src/data/destinations and matcher.js`
);
