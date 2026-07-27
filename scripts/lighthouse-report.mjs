#!/usr/bin/env node
/**
 * Print every Lighthouse run's score, per URL, from .lighthouseci/.
 *
 * WHY THIS EXISTS
 * `lhci autorun` prints scores ONLY when an assertion fails. A green run says
 * "All results processed!" and nothing else, so a passing build records no
 * evidence of how close it came. That is how a threshold gate drifts toward the
 * edge unnoticed — and how, on 2026-07-27, six passes and one 0.87 failure on a
 * byte-identical site produced exactly one usable data point.
 *
 * Reads the raw reports lhci already wrote, so it costs no extra Lighthouse runs.
 * Intended to run with `if: always()`, because the numbers matter most on the
 * build that failed.
 *
 * Never exits non-zero: this reports, it does not gate. The assertions in
 * lighthouserc.json are the gate.
 *
 *   node scripts/lighthouse-report.mjs
 */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const DIR = ".lighthouseci";
const median = (nums) => {
  const s = [...nums].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const ms = (n) => `${Math.round(n)}ms`;

let files = [];
try {
  files = (await readdir(DIR)).filter((f) => /^lhr-.*\.json$/.test(f));
} catch {
  console.log(`lighthouse-report: no ${DIR}/ directory — Lighthouse did not run`);
  process.exit(0);
}
if (files.length === 0) {
  console.log(`lighthouse-report: ${DIR}/ holds no reports`);
  process.exit(0);
}

const byUrl = new Map();
for (const f of files) {
  const lhr = JSON.parse(await readFile(path.join(DIR, f), "utf8"));
  const url = lhr.finalDisplayedUrl ?? lhr.finalUrl ?? lhr.requestedUrl;
  const key = new URL(url).pathname;
  if (!byUrl.has(key)) byUrl.set(key, []);
  byUrl.get(key).push({
    performance: lhr.categories?.performance?.score ?? null,
    accessibility: lhr.categories?.accessibility?.score ?? null,
    fcp: lhr.audits?.["first-contentful-paint"]?.numericValue ?? 0,
    lcp: lhr.audits?.["largest-contentful-paint"]?.numericValue ?? 0,
    tbt: lhr.audits?.["total-blocking-time"]?.numericValue ?? 0,
    cls: lhr.audits?.["cumulative-layout-shift"]?.numericValue ?? 0,
    si: lhr.audits?.["speed-index"]?.numericValue ?? 0,
  });
}

console.log("\nLighthouse — every run, and the median the assertions use");
console.log("(threshold: performance >= 0.90 on the MEDIAN, never on a single run)\n");

for (const [url, runs] of [...byUrl.entries()].sort()) {
  const scores = runs.map((r) => r.performance).filter((s) => s !== null);
  const med = median(scores);
  const spread = Math.max(...scores) - Math.min(...scores);
  console.log(`  ${url}`);
  console.log(
    `    performance : ${scores.map((s) => s.toFixed(2)).join("  ")}` +
      `   → median ${med.toFixed(2)} ${med >= 0.9 ? "PASS" : "FAIL"}` +
      `   (spread ${spread.toFixed(2)} across ${scores.length} run${scores.length === 1 ? "" : "s"})`
  );
  if (scores.length === 1) {
    console.log("    NOTE        : one run only — the median cannot absorb an outlier");
  }
  console.log(
    `    medians     : LCP ${ms(median(runs.map((r) => r.lcp)))}  TBT ${ms(median(runs.map((r) => r.tbt)))}` +
      `  CLS ${median(runs.map((r) => r.cls)).toFixed(3)}  SI ${ms(median(runs.map((r) => r.si)))}` +
      `  FCP ${ms(median(runs.map((r) => r.fcp)))}`
  );
}
console.log("");
