/**
 * Edge config generator — turns the infra/ policy specs into deployable files.
 *
 * infra/security-headers.json and infra/cache-headers.json have been correct but
 * INERT since they were written: no hosting layer ever consumed them (ADR-006/007).
 * This script emits them as `_headers` and `_redirects` in website/dist, the format
 * Cloudflare Pages and Netlify both parse natively.
 *
 * Single source of truth: edit the JSON in infra/, never the generated files.
 * Zero dependencies (ADR-002). Run after a build:
 *
 *   node website/build.mjs && node scripts/gen-edge-config.mjs
 */

import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "website", "dist");

if (!existsSync(DIST)) {
  console.error("✗ gen-edge-config: website/dist not found — run `node website/build.mjs` first.");
  process.exit(1);
}

const readJson = async (rel) => JSON.parse(await readFile(path.join(ROOT, rel), "utf8"));
const security = await readJson("infra/security-headers.json");
const cache = await readJson("infra/cache-headers.json");

/** Cloudflare Pages / Netlify `_headers`: a path pattern, then indented "Name: value" lines. */
const block = (pattern, pairs) =>
  [pattern, ...Object.entries(pairs).map(([k, v]) => `  ${k}: ${v}`)].join("\n");

// VERIFIED against a live Cloudflare Pages deployment on 2026-08-13:
//   1. Cloudflare joins duplicate header values with a comma — "If a header is
//      applied twice in the _headers file, the values are joined with a comma
//      separator" — and a SECOND block for the same path pattern overrides the
//      first. An earlier version of this script emitted two `/*` blocks (one
//      security, one HTML cache). The second silently discarded EVERY security
//      header, and assets came back as
//        cache-control: public, max-age=0, must-revalidate, public, max-age=31536000, immutable
//      so browsers honoured max-age=0 and nothing was cached.
//   2. Therefore: exactly ONE block per path pattern, and `/*` carries security
//      headers ONLY. Cloudflare already serves HTML as
//      "public, max-age=0, must-revalidate" by default, so the `*.html` rule in
//      infra/cache-headers.json is intentionally not emitted — emitting it would
//      concatenate onto every asset and defeat their immutable caching.
const rules = new Map();
rules.set("/*", { ...security.headers });

for (const rule of cache.rules) {
  for (const raw of rule.match.split(",").map((m) => m.trim()).filter(Boolean)) {
    if (raw === "*.html") continue; // Cloudflare's default already covers HTML
    rules.set(raw, { ...(rules.get(raw) ?? {}), "Cache-Control": rule["Cache-Control"] });
  }
}

const header = [
  "# GENERATED FILE — DO NOT EDIT.",
  "# Source: infra/security-headers.json + infra/cache-headers.json",
  "# Regenerate: node scripts/gen-edge-config.mjs",
  "#",
  "# EXACTLY ONE block per path pattern. Cloudflare joins duplicate header values",
  "# with commas, and a repeated path pattern overrides the earlier block, so a",
  "# second /* block would silently discard the security headers above it.",
  "# /* carries security headers only — Cloudflare already defaults HTML to",
  "# public, max-age=0, must-revalidate.",
  "",
].join("\n");

const headersOut =
  header + [...rules.entries()].map(([p, pairs]) => block(p, pairs)).join("\n\n") + "\n";

// Cloudflare Pages documents hard limits: 100 rules, 2,000 characters per line.
// Fail the build rather than ship a file the edge will silently truncate.
const outLines = headersOut.split("\n");
const ruleLines = outLines.filter((l) => l.startsWith("/"));
const duplicates = ruleLines.filter((l, i) => ruleLines.indexOf(l) !== i);
if (duplicates.length > 0) {
  console.error(
    `✗ gen-edge-config: duplicate path pattern(s): ${[...new Set(duplicates)].join(", ")}`
  );
  process.exit(1);
}
if (ruleLines.length > 100) {
  console.error(`✗ gen-edge-config: ${ruleLines.length} rules exceeds the Cloudflare limit of 100.`);
  process.exit(1);
}
const overLong = outLines.filter((l) => l.length > 2000);
if (overLong.length > 0) {
  console.error(`✗ gen-edge-config: ${overLong.length} line(s) exceed the 2,000-character limit.`);
  process.exit(1);
}

await writeFile(path.join(DIST, "_headers"), headersOut);

/** `_redirects`: apex→www and any future rules. One hop, explicit status. */
const site = await readJson("website/src/data/site.json");
const canonicalHost = new URL(site.url).host; // www.richenquest.com
const apex = canonicalHost.replace(/^www\./, "");
const redirects = [
  "# GENERATED FILE — DO NOT EDIT. Regenerate: node scripts/gen-edge-config.mjs",
  "#",
  `# Canonical host is ${canonicalHost} (site.json). The apex must 301 to it in ONE`,
  "# hop so link equity and the canonical tags agree. 301 = permanent, cached.",
  `https://${apex}/*  https://${canonicalHost}/:splat  301!`,
  "",
].join("\n");

await writeFile(path.join(DIST, "_redirects"), redirects);

console.log(
  `✓ gen-edge-config: wrote _headers (${ruleLines.length} unique path rules) and ` +
    `_redirects (apex → ${canonicalHost})`
);
