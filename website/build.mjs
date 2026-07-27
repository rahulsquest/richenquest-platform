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

/**
 * Minify CSS — comment stripping + whitespace collapsing, nothing clever.
 *
 * Why this exists: the source stylesheets are heavily commented on purpose (the
 * comments are the design system's documentation), but those bytes have no
 * business on a mid-range Android over 4G. Stripping them keeps the source
 * readable AND the payload small — and it keeps us inside the stylesheet budget
 * asserted in lighthouserc.json.
 *
 * Deliberately conservative (ADR-002: build features stay auditable):
 *   · quote- and url()-aware, so comment-like or space-significant sequences
 *     inside strings and data URIs are never touched;
 *   · collapses whitespace runs and trims it around structural punctuation;
 *   · does NOT reorder, merge, rename, or drop any declaration.
 */
export function minifyCss(css) {
  let out = "";
  let i = 0;
  while (i < css.length) {
    const c = css[i];

    // Strings — copied verbatim, including any /* */ inside them.
    if (c === '"' || c === "'") {
      const quote = c;
      let j = i + 1;
      while (j < css.length && !(css[j] === quote && css[j - 1] !== "\\")) j++;
      out += css.slice(i, j + 1);
      i = j + 1;
      continue;
    }

    // url(...) — may hold a data URI whose spaces are significant AND which can
    // itself contain ")" (e.g. an inline SVG filter referencing url(#n)). So a
    // quoted URL is scanned to its closing quote first, never to the first ")".
    if (css.startsWith("url(", i)) {
      const q = css[i + 4];
      let end;
      if (q === '"' || q === "'") {
        let j = i + 5;
        while (j < css.length && !(css[j] === q && css[j - 1] !== "\\")) j++;
        end = css.indexOf(")", j);
      } else {
        end = css.indexOf(")", i);
      }
      if (end !== -1) {
        out += css.slice(i, end + 1);
        i = end + 1;
        continue;
      }
    }

    // Comments — dropped.
    if (c === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      i = end === -1 ? css.length : end + 2;
      continue;
    }

    // Whitespace runs → a single space (removed entirely around punctuation).
    //
    // ONLY `{ } : ; ,` may lose their adjacent whitespace. The combinators
    // `+ - > ~` must NOT: inside calc()/clamp()/min()/max() a `+` or `-` is an
    // operator that CSS requires to be surrounded by whitespace. Stripping it
    // turns `clamp(2.4rem, 1.6rem + 3.6vw, 3.5rem)` into an invalid value, and
    // the browser then discards the whole declaration — silently. That bug
    // shipped once and took out the entire fluid type scale; the few bytes
    // saved are not worth re-earning it.
    const TIGHT = "{}:;,";
    if (/\s/.test(c)) {
      let j = i;
      while (j < css.length && /\s/.test(css[j])) j++;
      const prev = out.at(-1);
      const next = css[j];
      if (prev && next && !TIGHT.includes(prev) && !TIGHT.includes(next)) out += " ";
      i = j;
      continue;
    }

    // Structural punctuation — drop any space we just emitted before it.
    if (TIGHT.includes(c) && out.at(-1) === " ") out = out.slice(0, -1);

    out += c;
    i++;
  }
  return out.replace(/;}/g, "}").trim();
}

/**
 * Build CSS in cascade order: tokens → base → components/* (shared), then each
 * pages/<name>.css as its OWN file (File 10 §4).
 *
 * Why page CSS is split out (changed 2026-07-25): previously every page-specific
 * stylesheet was concatenated into one bundle, so every visitor downloaded the
 * homepage's CSS, the matcher's CSS, and — worst — the internal style guide's
 * CSS, on every page. That does not scale: each new page taxed all the others,
 * and the shared bundle would grow past the stylesheet budget in
 * lighthouserc.json as the site grew.
 *
 * Now: one shared, long-cached site.css, plus an optional page-<name>.css
 * linked only where it exists. Convention: src/assets/css/pages/<x>.css pairs
 * with src/pages/<x>.html.
 *
 * Returns { shared, pages: Map<pageRelHtml, minifiedCss> }.
 */
async function buildCss() {
  const cssDir = path.join(SRC, "assets", "css");
  const ordered = ["tokens.css", "base.css"];
  for (const f of await listFiles(path.join(cssDir, "components"), ".css")) {
    ordered.push(path.join("components", f));
  }

  let shared = "";
  for (const rel of ordered) {
    const file = path.join(cssDir, rel);
    if (!existsSync(file)) continue;
    shared += `/* ─── ${rel.split(path.sep).join("/")} ─── */\n` + (await readFile(file, "utf8")) + "\n";
  }

  const pages = new Map();
  for (const f of await listFiles(path.join(cssDir, "pages"), ".css")) {
    const css = minifyCss(await readFile(path.join(cssDir, "pages", f), "utf8"));
    if (css) pages.set(f.replace(/\.css$/, ".html"), css);
  }

  return { shared: minifyCss(shared), pages };
}

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/**
 * TRUST INFRASTRUCTURE — Constitution enforcement rendered by the build.
 *
 * Turns the Evidence Register into `{{ fact.<id> }}` tokens that emit the
 * figure together with its provenance mark and a link to its evidence. A page
 * author cannot publish a number without its source, because the only way to
 * get the number is to ask for the claim — and an unknown id fails the build.
 *
 * `{{ factValue.<id> }}` gives the bare value for places markup cannot go
 * (meta descriptions, title attributes). It carries no provenance, so it is
 * never used in body copy.
 *
 * The same registers are read by the matcher and, later, by the dashboard, CRM
 * and partner portal — so a figure means the same thing in every interface.
 */
function buildTrustTokens(data) {
  const fact = {};
  const factValue = {};
  const claims = data.evidence?.claims ?? {};

  for (const [id, c] of Object.entries(claims)) {
    if (c.status === "retired") continue;
    const unverified = c.status !== "verified";
    const label = unverified
      ? "Verification status for this figure"
      : "Source and verification for this figure";
    fact[id] =
      `<span class="fact${unverified ? " fact--unverified" : ""}">${esc(c.value)}` +
      `<a class="fact__src" href="/standards/#${esc(id)}">` +
      `<span class="visually-hidden">${label}</span></a></span>`;
    factValue[id] = c.value;
  }

  // Generated content for /standards/. Derived, never hand-written, so the
  // published standards can never drift from what the registers actually say.
  const rows = Object.entries(claims)
    .filter(([, c]) => c.status !== "retired")
    .map(([id, c]) => {
      const verified = c.status === "verified";
      return `<article class="evi" id="${esc(id)}">
  <div class="evi__head">
    <h3 class="evi__value">${esc(c.value)}</h3>
    <p class="evi__statement">${esc(c.statement)}</p>
    <span class="evi__status evi__status--${verified ? "ok" : "open"}">${verified ? "Verified" : "Not yet verifiable"}</span>
  </div>
  <dl class="ledger evi__meta">
    <div class="ledger__row"><dt class="ledger__label">Basis</dt><span class="ledger__leader" aria-hidden="true"></span><dd class="ledger__value ledger__value--muted">${esc(c.basis)}</dd></div>
    <div class="ledger__row"><dt class="ledger__label">Verified by</dt><span class="ledger__leader" aria-hidden="true"></span><dd class="ledger__value">${esc(c.verified_by ?? "— not yet verified")}</dd></div>
    <div class="ledger__row"><dt class="ledger__label">Verified on</dt><span class="ledger__leader" aria-hidden="true"></span><dd class="ledger__value">${esc(c.verified_on ?? "—")}</dd></div>
    <div class="ledger__row"><dt class="ledger__label">Review by</dt><span class="ledger__leader" aria-hidden="true"></span><dd class="ledger__value">${esc(c.review_by)}</dd></div>
  </dl>
</article>`;
    })
    .join("\n");

  const counts = Object.values(claims).filter((c) => c.status !== "retired");
  const unverifiedCount = counts.filter((c) => c.status !== "verified").length;

  const rel = data.disclosure?.relationships ?? [];
  const disclosureBlock = rel.length
    ? `<dl class="ledger">${rel
        .map(
          (r) =>
            `<div class="ledger__row"><dt class="ledger__label">${esc(r.counterparty)}</dt><span class="ledger__leader" aria-hidden="true"></span><dd class="ledger__value">${esc(r.basis)}</dd></div>`
        )
        .join("")}</dl>`
    : `<p class="note">${esc(data.disclosure?._relationships_note ?? "")}</p>`;

  return {
    fact,
    factValue,
    generated: {
      evidenceEntries: rows,
      evidenceCount: String(counts.length),
      evidenceUnverifiedCount: String(unverifiedCount),
      disclosureEntries: disclosureBlock,
      disclosureReviewed: String(data.disclosure?.last_reviewed ?? "—"),
    },
  };
}

export async function build() {
  const started = Date.now();
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  const data = await loadData();
  const trust = buildTrustTokens(data);

  // Assets + cache-bust hash (content-derived so unchanged deploys keep caches warm)
  const { shared: css, pages: pageCss } = await buildCss();
  let jsConcat = "";
  const jsDir = path.join(SRC, "assets", "js");
  for (const rel of await listFiles(jsDir, ".js")) {
    jsConcat += await readFile(path.join(jsDir, rel), "utf8");
  }
  const hash = createHash("sha256")
    .update(css + [...pageCss.values()].join("") + jsConcat)
    .digest("hex")
    .slice(0, 8);

  await mkdir(path.join(OUT, "assets", "css"), { recursive: true });
  await writeFile(path.join(OUT, "assets", "css", "site.css"), css);
  for (const [pageRel, pcss] of pageCss) {
    const name = pageRel.replace(/\.html$/, "").split(path.sep).join("-");
    await writeFile(path.join(OUT, "assets", "css", `page-${name}.css`), pcss);
  }
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
    // Optional page stylesheet. Emitted as a whole <link> element (or an empty
    // string) because the template engine has no conditionals by design
    // (ADR-002) — and a page without its own CSS should make no extra request.
    const pageCssName = rel.replace(/\.html$/, "").split(path.sep).join("-");
    const cssLink = pageCss.has(rel)
      ? `<link rel="stylesheet" href="/assets/css/page-${pageCssName}.css?v=${hash}">`
      : "";
    const ctx = {
      ...data,
      ...trust,
      page: { ...meta, url: route.url, cssLink },
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
