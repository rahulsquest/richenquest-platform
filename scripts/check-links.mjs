/**
 * Internal link & asset checker — zero dependencies (C5: guards the product,
 * ships nothing). Verifies every internal href/src in the BUILT site resolves
 * to a real file, including clean-URL pages, assets with cache-bust queries,
 * and SVG sprite fragments. External links are counted, not fetched (CI has
 * no business calling third parties on every push).
 *
 * Run: node scripts/check-links.mjs   (requires a prior build)
 */

import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "website", "dist");

if (!existsSync(DIST)) {
  console.error("✗ check-links: website/dist not found — run `node website/build.mjs` first.");
  process.exit(1);
}

const htmlFiles = [];
for (const entry of await readdir(DIST, { withFileTypes: true, recursive: true })) {
  if (entry.isFile() && entry.name.endsWith(".html")) {
    htmlFiles.push(path.join(entry.parentPath, entry.name));
  }
}

const REF_RE = /(?:href|src)="([^"]+)"/g;
const broken = [];
let internal = 0;
let external = 0;

for (const file of htmlFiles.sort()) {
  const rel = path.relative(DIST, file);
  const html = await readFile(file, "utf8");
  for (const m of html.matchAll(REF_RE)) {
    const raw = m[1];
    if (/^(https?:|mailto:|tel:|data:|#)/.test(raw)) {
      if (/^https?:/.test(raw)) external++;
      continue;
    }
    internal++;
    const clean = raw.split("#")[0].split("?")[0];
    if (clean === "") continue; // pure fragment
    let target;
    if (path.extname(clean)) {
      target = path.join(DIST, clean);
    } else if (clean === "/") {
      target = path.join(DIST, "index.html");
    } else {
      target = path.join(DIST, clean.replace(/\/$/, ""), "index.html");
    }
    if (!existsSync(target)) broken.push({ rel, raw });
  }
}

if (broken.length > 0) {
  console.error(`✗ check-links: ${broken.length} broken internal reference(s):`);
  for (const b of broken) console.error(`  ${b.rel} → ${b.raw}`);
  process.exit(1);
}

console.log(
  `✓ check-links: ${internal} internal reference(s) across ${htmlFiles.length} page(s) all resolve (${external} external links not fetched)`
);
