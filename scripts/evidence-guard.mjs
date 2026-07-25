/**
 * Evidence guard — makes Constitution Article 6.3 structural.
 *
 * The claims-guard asks "is this statement permitted?" against a list of banned
 * patterns. That is a deny-list, and a deny-list cannot catch a figure nobody
 * thought to ban — which is exactly how "33 destinations" sat on the homepage
 * from the RC-1 cut with no entry in any register and no basis on record.
 *
 * This guard inverts it. Instead of asking what is forbidden, it asks whether
 * every headline figure can produce its evidence:
 *
 *   1. Every headline figure carries a provenance mark.
 *   2. Every provenance mark actually links somewhere.
 *   3. Every mark's target anchor EXISTS on the standards page.
 *      (A citation pointing at nothing is worse than no citation.)
 *   4. No published claim is past its review date.
 *
 * Run: node scripts/evidence-guard.mjs   (requires a prior build)
 */

import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "website", "dist");
const EVIDENCE = path.join(ROOT, "website", "src", "data", "evidence.json");
const STANDARDS = path.join(DIST, "standards", "index.html");

if (!existsSync(DIST)) {
  console.error("✗ evidence-guard: website/dist not found — run `node website/build.mjs` first.");
  process.exit(1);
}

const problems = [];
const evidence = JSON.parse(await readFile(EVIDENCE, "utf8"));
const claims = evidence.claims ?? {};

/** Positions where a figure is presented as a headline claim about RichenQuest. */
const HEADLINE_RE = /<span class="stat__value"[^>]*>([\s\S]*?)<\/span>\s*<span class="stat__label"/g;

const files = [];
for (const e of await readdir(DIST, { withFileTypes: true, recursive: true })) {
  if (e.isFile() && e.name.endsWith(".html")) files.push(path.join(e.parentPath, e.name));
}

// Refuse to pass on a partially-written dist (the build rewrites it wholesale).
const srcPages = [];
for (const e of await readdir(path.join(ROOT, "website", "src", "pages"), {
  withFileTypes: true,
  recursive: true,
})) {
  if (e.isFile() && e.name.endsWith(".html")) srcPages.push(e.name);
}
if (files.length < srcPages.length) {
  console.error(
    `✗ evidence-guard: ${files.length} built page(s) vs ${srcPages.length} source page(s) — ` +
      "output looks incomplete; rebuild before trusting this check."
  );
  process.exit(1);
}

// ---- Rules 1 & 2: headline figures carry a working provenance mark ----------
const referencedAnchors = new Set();

for (const file of files.sort()) {
  const rel = path.relative(DIST, file);
  const html = await readFile(file, "utf8");

  for (const m of html.matchAll(HEADLINE_RE)) {
    const inner = m[1];
    if (!/class="fact\b/.test(inner)) {
      problems.push(
        `${rel}: headline figure "${inner.replace(/<[^>]*>/g, "").trim().slice(0, 40)}" has no provenance mark.\n` +
          `      Publish it via {{ fact.<id> }} after adding the claim to src/data/evidence.json.`
      );
    }
  }

  // Every mark must link somewhere, and we collect the targets for rule 3.
  for (const m of html.matchAll(/<a class="fact__src"([^>]*)>/g)) {
    const href = /href="([^"]*)"/.exec(m[1])?.[1];
    if (!href) {
      problems.push(`${rel}: a provenance mark has no href — a citation must point somewhere.`);
      continue;
    }
    const anchor = href.split("#")[1];
    if (anchor) referencedAnchors.add(anchor);
  }
}

// ---- Rule 3: every referenced anchor exists on the standards page -----------
if (referencedAnchors.size) {
  if (!existsSync(STANDARDS)) {
    problems.push(
      `standards page missing, but ${referencedAnchors.size} provenance mark(s) point at it.`
    );
  } else {
    const standards = await readFile(STANDARDS, "utf8");
    for (const anchor of [...referencedAnchors].sort()) {
      if (!standards.includes(`id="${anchor}"`)) {
        problems.push(
          `standards/index.html: no entry with id="${anchor}", but provenance marks link to it.\n` +
            `      Either add the claim to src/data/evidence.json or stop publishing the figure.`
        );
      }
    }
  }
}

// ---- Rule 4: no published claim is past its review date ---------------------
const today = new Date().toISOString().slice(0, 10);
for (const [id, c] of Object.entries(claims)) {
  if (c.status === "retired") continue;
  if (!c.review_by) {
    problems.push(`evidence.json: claim "${id}" has no review_by date (Constitution 21.2).`);
    continue;
  }
  if (c.review_by < today) {
    problems.push(
      `evidence.json: claim "${id}" was due for review on ${c.review_by} (today ${today}).\n` +
        `      Re-verify it and set a new date, or withdraw the figure. Stale evidence is not evidence.`
    );
  }
}

// ---- Report -----------------------------------------------------------------
if (problems.length) {
  console.error(`✗ evidence-guard: ${problems.length} problem(s):\n`);
  for (const p of problems) console.error(`  · ${p}`);
  process.exit(1);
}

const unverified = Object.entries(claims).filter(
  ([, c]) => c.status !== "verified" && c.status !== "retired"
);
console.log(
  `✓ evidence-guard: ${referencedAnchors.size} provenance mark target(s) resolve; ` +
    `${Object.keys(claims).length} claim(s) registered, all within review date`
);
if (unverified.length) {
  console.log(
    `  ℹ ${unverified.length} claim(s) registered as NOT YET VERIFIABLE and shown as such: ` +
      unverified.map(([id]) => id).join(", ")
  );
}
