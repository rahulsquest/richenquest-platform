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

const sections = [];

// Security headers apply to every response.
sections.push(
  "# ─── security (generated from infra/security-headers.json) ───\n" +
    block("/*", security.headers)
);

// Cache rules, most-specific first. `_headers` matches in file order.
const cacheRules = cache.rules.flatMap((rule) =>
  rule.match
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean)
    .map((pattern) => ({ pattern, value: rule["Cache-Control"], why: rule._why }))
);

// `*.html` is not a valid _headers pattern — express it as the catch-all instead.
const normalisePattern = (p) => (p === "*.html" ? "/*" : p);

// CRITICAL: `_headers` applies the FIRST matching rule per header name, so the
// catch-all must come LAST. Without this, /* would swallow /sitemap.xml and
// /robots.txt and serve them max-age=0 instead of their intended 3600.
const ordered = cacheRules
  .map((r) => ({ ...r, pattern: normalisePattern(r.pattern) }))
  .sort((a, b) => (a.pattern === "/*" ? 1 : 0) - (b.pattern === "/*" ? 1 : 0));

let lastWhy = null;
sections.push(
  "# ─── caching (generated from infra/cache-headers.json) ───\n" +
    ordered
      .map(({ pattern, value, why }) => {
        const comment = why === lastWhy ? "" : `# ${why}\n`;
        lastWhy = why;
        return comment + block(pattern, { "Cache-Control": value });
      })
      .join("\n")
);

const header = [
  "# GENERATED FILE — DO NOT EDIT.",
  "# Source: infra/security-headers.json + infra/cache-headers.json",
  "# Regenerate: node scripts/gen-edge-config.mjs",
  "#",
  "# Order matters: Cloudflare Pages and Netlify apply the FIRST matching rule per",
  "# header name, so the broad /* security block is listed before the narrower",
  "# cache rules, and asset rules precede the HTML fallback.",
  "",
].join("\n");

await writeFile(path.join(DIST, "_headers"), header + sections.join("\n\n") + "\n");

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
  `✓ gen-edge-config: wrote _headers (${Object.keys(security.headers).length} security + ` +
    `${cacheRules.length} cache rules) and _redirects (apex → ${canonicalHost})`
);
