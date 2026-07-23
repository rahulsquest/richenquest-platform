/**
 * Catalyst deploy assembler.
 *
 * Produces a deploy workspace matching the layout `catalyst deploy` expects —
 * verified against a real `catalyst functions:add` scaffold (2026-07-24):
 *
 *   dist/
 *     functions/
 *       titan-webhook/            (type advancedio)
 *         catalyst-config.json    { deployment{name,stack,type,env_variables}, execution{main} }
 *         package.json            { main:"index.js", dependencies:{ zcatalyst-sdk-node } }
 *         index.js                the SDK shell (deploy/*.handler.cjs)
 *         lib/{titan,zoho,catalyst}   the tested code (mirrors repo functions/*)
 *         config/                 tenant + schema + events (read by runtime.mjs)
 *       titan-reconcile/          (type cron)
 *
 * Catalyst bundles each function directory in isolation, so everything a
 * function needs lives INSIDE its own dir. `lib/` mirrors the repo's
 * `functions/` and the function root mirrors the repo root, so runtime.mjs's
 * two-level ROOT resolution finds `config/` unchanged. A test builds this and
 * imports the assembled runtime to prove the bundle is self-contained.
 *
 *   node functions/catalyst/build.mjs      # → functions/catalyst/dist (gitignored)
 */

import { cp, rm, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const DIST = path.join(HERE, "dist");
const FN_ROOT = path.join(DIST, "functions");

const FUNCTIONS = {
  // Advanced I/O runs an Express app, so express is a bundled dependency.
  "titan-webhook": { type: "advancedio", shell: "deploy/titan-webhook.handler.cjs", deps: { express: "^4.19.2" } },
  "titan-reconcile": { type: "cron", shell: "deploy/titan-reconcile.handler.cjs", deps: {} },
};

const noTests = (src) => !/\.test\.mjs$/.test(src);
const catalystConfig = (name, type) => ({
  deployment: { name, stack: "node18", type, env_variables: {} },
  execution: { main: "index.js" },
});
const packageJson = (name, deps) => ({
  name, version: "1.0.0", main: "index.js", author: "rahul@richenquest.com",
  dependencies: { "zcatalyst-sdk-node": "latest", ...deps },
});

export async function build() {
  await rm(FN_ROOT, { recursive: true, force: true });
  const built = [];

  for (const [name, spec] of Object.entries(FUNCTIONS)) {
    const dir = path.join(FN_ROOT, name);
    await mkdir(path.join(dir, "lib"), { recursive: true });

    // Tested code → lib/ (mirrors repo functions/*, preserving import depth).
    await cp(path.join(ROOT, "functions/titan"), path.join(dir, "lib/titan"), { recursive: true, filter: noTests });
    await cp(path.join(ROOT, "functions/zoho"), path.join(dir, "lib/zoho"), { recursive: true, filter: noTests });
    await mkdir(path.join(dir, "lib/catalyst"), { recursive: true });
    for (const f of ["parse-notification.mjs", "webhook-core.mjs", "reconcile-core.mjs"]) {
      await cp(path.join(HERE, f), path.join(dir, "lib/catalyst", f));
    }
    // Config read by runtime.mjs at the function root (its two-level ROOT).
    await cp(path.join(ROOT, "config"), path.join(dir, "config"), { recursive: true });

    await cp(path.join(HERE, spec.shell), path.join(dir, "index.js"));
    await writeFile(path.join(dir, "catalyst-config.json"), JSON.stringify(catalystConfig(name, spec.type), null, 2) + "\n");
    await writeFile(path.join(dir, "package.json"), JSON.stringify(packageJson(name, spec.deps), null, 2) + "\n");

    built.push({ name, dir, type: spec.type });
  }

  // App manifest at the workspace root — `catalyst deploy` needs functions.targets
  // to list the deployable function names (verified against a real deploy).
  await writeFile(path.join(DIST, "catalyst.json"), JSON.stringify({
    functions: { source: "functions", targets: Object.keys(FUNCTIONS) },
  }, null, 2) + "\n");

  return built;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  build().then((built) => {
    console.log("\nCatalyst deploy workspace assembled at functions/catalyst/dist/:\n");
    for (const b of built) console.log(`  functions/${b.name}/  (${b.type})`);
    console.log("\nDeploy (from functions/catalyst/dist, project linked via .catalystrc):");
    console.log("  npm install --prefix functions/titan-webhook && npm install --prefix functions/titan-reconcile");
    console.log("  catalyst deploy --only functions\n");
  }).catch((e) => { console.error(`✗ build failed: ${e.message}`); process.exit(1); });
}
