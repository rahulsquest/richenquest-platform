/**
 * RichenQuest static site builder — zero dependencies (ADR-002).
 *
 * Pipeline:
 *   1. Load all JSON in src/data/ into a nested context (data/site.json → {{ site.* }}).
 *   2. For each src/pages/**\/*.html:
 *        - parse the required <!--meta … --> block (title/description enforced, File 10 §3)
 *        - resolve <!-- @include path --> partials recursively (relative to src/)
 *        - substitute {{ dot.path }} tokens — unknown tokens FAIL the build
 *        - wrap in its layout (default: layouts/base.html) and write with clean URLs
 *          (about.html → dist/about/index.html; 404.html stays dist/404.html)
 *   3. Concatenate CSS in cascade order (tokens → base → components/* → pages/*) → site.css.
 *   4. Copy JS modules, images, fonts, and public/ files verbatim.
 *   5. Generate sitemap.xml; stamp a content hash for cache busting ({{ build.hash }}).
 *
 * Deliberately NOT supported: loops, conditionals, expressions (see ADR-002).
 * Data files are trusted repo content — values are inserted without HTML escaping.
 */

import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WEBSITE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(WEBSITE, "src");
const OUT = path.join(WEBSITE, "dist");

const INCLUDE_RE = /<!--\s*@include\s+([\w./-]+)\s*-->/g;
const TOKEN_RE = /\{\{\s*([\w][\w.-]*)\s*\}\}/g;
const META_RE = /^<!--meta\s*\n([\s\S]*?)\n-->\s*\n?/;
const MAX_INCLUDE_DEPTH = 10;

/** Recursively list files under dir with the given extension, as dir-relative paths. */
async function listFiles(dir, ext) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile() && entry.name.endsWith(ext)) {
      out.push(path.relative(dir, path.join(entry.parentPath, entry.name)));
    }
  }
  return out.sort();
}

/** data/site.json → ctx.site; data/destinations/germany.json → ctx.destinations.germany */
async function loadData() {
  const dataDir = path.join(SRC, "data");
  const ctx = {};
  for (const rel of await listFiles(dataDir, ".json")) {
    const keys = rel.slice(0, -".json".length).split(path.sep);
    let node = ctx;
    for (const key of keys.slice(0, -1)) node = node[key] ??= {};
    node[keys.at(-1)] = JSON.parse(await readFile(path.join(dataDir, rel), "utf8"));
  }
  return ctx;
}

function lookupToken(ctx, dotted, where) {
  const value = dotted.split(".").reduce((o, k) => (o == null ? undefined : o[k]), ctx);
  if (value === undefined || value === null) {
    throw new Error(`Unknown token {{ ${dotted} }} in ${where} — tokens must resolve (File 10 §6)`);
  }
  if (typeof value === "object") {
    throw new Error(`Token {{ ${dotted} }} in ${where} is an object/array; tokens must be scalar`);
  }
  return String(value);
}

function renderTokens(html, ctx, where) {
  return html.replace(TOKEN_RE, (_, key) => lookupToken(ctx, key, where));
}

async function resolveIncludes(html, where, depth = 0) {
  if (depth > MAX_INCLUDE_DEPTH) throw new Error(`Include depth > ${MAX_INCLUDE_DEPTH} at ${where} (cycle?)`);
  const parts = [];
  let last = 0;
  for (const m of html.matchAll(INCLUDE_RE)) {
    parts.push(html.slice(last, m.index));
    const incFile = path.join(SRC, m[1]);
    if (!existsSync(incFile)) throw new Error(`Missing include "${m[1]}" referenced from ${where}`);
    parts.push(await resolveIncludes(await readFile(incFile, "utf8"), m[1], depth + 1));
    last = m.index + m[0].length;
  }
  parts.push(html.slice(last));
  return parts.join("");
}

function parseMeta(source, file) {
  const m = source.match(META_RE);
  if (!m) throw new Error(`${file}: missing <!--meta --> block at top of page (File 10 §3)`);
  const meta = {};
  for (const line of m[1].split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const sep = trimmed.indexOf(":");
    if (sep === -1) throw new Error(`${file}: malformed meta line "${trimmed}"`);
    meta[trimmed.slice(0, sep).trim()] = trimmed.slice(sep + 1).trim();
  }
  if (!meta.title || !meta.description) {
    throw new Error(`${file}: meta must declare "title" and "description" (SEO is enforced, File 10 §3)`);
  }
  return { meta, body: source.slice(m[0].length) };
}

/** Clean-URL routing. */
function routeFor(relPage) {
  const rel = relPage.split(path.sep).join("/");
  if (rel === "404.html") return { url: "/404.html", out: "404.html", inSitemap: false };
  if (rel === "index.html") return { url: "/", out: "index.html", inSitemap: true };
  let base = rel.slice(0, -".html".length);
  if (base.endsWith("/index")) base = base.slice(0, -"/index".length);
  return { url: `/${base}/`, out: `${base}/index.html`, inSitemap: true };
}

/** Concatenate CSS in cascade order: tokens → base → components/* → pages/* (File 10 §4). */
async function buildCss() {
  const cssDir = path.join(SRC, "assets", "css");
  const ordered = ["tokens.css", "base.css"];
  for (const group of ["components", "pages"]) {
    for (const f of await listFiles(path.join(cssDir, group), ".css")) {
      ordered.push(path.join(group, f));
    }
  }
  let css = "";
  for (const rel of ordered) {
    const file = path.join(cssDir, rel);
    if (!existsSync(file)) continue;
    css += `/* ─── ${rel.split(path.sep).join("/")} ─── */\n` + (await readFile(file, "utf8")) + "\n";
  }
  return css;
}

export async function build() {
  const started = Date.now();
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  const data = await loadData();

  // Assets + cache-bust hash (content-derived so unchanged deploys keep caches warm)
  const css = await buildCss();
  let jsConcat = "";
  const jsDir = path.join(SRC, "assets", "js");
  for (const rel of await listFiles(jsDir, ".js")) {
    jsConcat += await readFile(path.join(jsDir, rel), "utf8");
  }
  const hash = createHash("sha256").update(css + jsConcat).digest("hex").slice(0, 8);

  await mkdir(path.join(OUT, "assets", "css"), { recursive: true });
  await writeFile(path.join(OUT, "assets", "css", "site.css"), css);
  if (existsSync(jsDir)) await cp(jsDir, path.join(OUT, "assets", "js"), { recursive: true });
  for (const dir of ["img", "fonts"]) {
    const from = path.join(SRC, "assets", dir);
    if (existsSync(from)) await cp(from, path.join(OUT, "assets", dir), { recursive: true });
  }
  const publicDir = path.join(SRC, "public");
  if (existsSync(publicDir)) await cp(publicDir, OUT, { recursive: true });

  // Pages
  const layoutCache = new Map();
  const sitemapUrls = [];
  const pages = await listFiles(path.join(SRC, "pages"), ".html");
  if (pages.length === 0) throw new Error("No pages found in src/pages/");

  for (const rel of pages) {
    const where = `pages/${rel.split(path.sep).join("/")}`;
    const { meta, body } = parseMeta(await readFile(path.join(SRC, "pages", rel), "utf8"), where);
    const route = routeFor(rel);
    const ctx = {
      ...data,
      page: { ...meta, url: route.url },
      build: { hash, year: String(new Date().getFullYear()) },
    };

    const renderedBody = renderTokens(await resolveIncludes(body, where), ctx, where);

    const layoutName = meta.layout || "base";
    if (!layoutCache.has(layoutName)) {
      const layoutFile = path.join(SRC, "layouts", `${layoutName}.html`);
      if (!existsSync(layoutFile)) throw new Error(`${where}: layout "${layoutName}" not found`);
      layoutCache.set(layoutName, await resolveIncludes(await readFile(layoutFile, "utf8"), `layouts/${layoutName}.html`));
    }
    ctx.page.content = renderedBody; // body is fully rendered; safe to inject as a token value
    const pageHtml = renderTokens(layoutCache.get(layoutName), ctx, `layouts/${layoutName}.html`);

    const outFile = path.join(OUT, route.out);
    await mkdir(path.dirname(outFile), { recursive: true });
    await writeFile(outFile, pageHtml);
    if (route.inSitemap && meta.sitemap !== "false") sitemapUrls.push(route.url);
  }

  // Sitemap (needs site.url in data/site.json)
  if (data.site?.url) {
    const entries = sitemapUrls.map((u) => `  <url><loc>${data.site.url}${u}</loc></url>`).join("\n");
    await writeFile(
      path.join(OUT, "sitemap.xml"),
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`
    );
  }

  console.log(`✓ built ${pages.length} page(s) → website/dist (hash ${hash}, ${Date.now() - started} ms)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  build().catch((err) => {
    console.error(`✗ BUILD FAILED: ${err.message}`);
    process.exit(1);
  });
}
