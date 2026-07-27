/**
 * Local development server — zero dependencies.
 * Builds once, serves website/dist on http://localhost:8080 (PORT overrides),
 * and rebuilds on any change under src/ (manual browser refresh; no live reload by design).
 */

import { createServer } from "node:http";
import { watch } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WEBSITE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(WEBSITE, "src");
const DIST = path.join(WEBSITE, "dist");
const PORT = Number(process.env.PORT || 8080);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
};

/**
 * Load the builder FRESH on every run.
 *
 * A static `import { build }` caches the module for the process lifetime, so
 * edits to build.mjs never took effect and the watcher silently kept
 * regenerating dist/ with the old build code. That is worse than not rebuilding
 * at all: the dev server and `node website/build.mjs` produce different output
 * from the same source, and the difference is invisible.
 *
 * The `?v=` query defeats the ESM cache. It accumulates module instances over a
 * long session, which is an acceptable trade in a dev-only tool.
 */
async function runBuild() {
  const { build } = await import(`./build.mjs?v=${Date.now()}`);
  return build();
}

await runBuild();

let debounce = null;
const rebuild = () => {
  clearTimeout(debounce);
  debounce = setTimeout(async () => {
    try {
      await runBuild();
    } catch (err) {
      console.error(`✗ BUILD FAILED: ${err.message}`);
    }
  }, 150);
};

watch(SRC, { recursive: true }, rebuild);
// Watch the build tool itself, so changing the pipeline behaves like changing a page.
watch(path.join(WEBSITE, "build.mjs"), rebuild);

createServer(async (req, res) => {
  try {
    let pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    if (pathname.endsWith("/")) pathname += "index.html";
    else if (!path.extname(pathname)) pathname += "/index.html";

    const file = path.join(DIST, path.normalize(pathname));
    if (!file.startsWith(DIST + path.sep)) {
      res.writeHead(403).end("Forbidden");
      return;
    }
    const body = await readFile(file);
    res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    try {
      const notFound = await readFile(path.join(DIST, "404.html"));
      res.writeHead(404, { "content-type": MIME[".html"] });
      res.end(notFound);
    } catch {
      res.writeHead(404).end("Not found");
    }
  }
}).listen(PORT, () => console.log(`▶ dev server: http://localhost:${PORT} (watching src/)`));
