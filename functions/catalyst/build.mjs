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
 *       record-api/               (type advancedio)
 *         lib/{record,platform}   the tested code
 *         db/                     migrate.mjs + migrations (the startup gate reads these)
 *         website/src/data/       disclosure.json (mandatory) + evidence.json
 *
 * Catalyst bundles each function directory in isolation, so everything a
 * function needs lives INSIDE its own dir. `lib/` mirrors the repo's
 * `functions/` and the function root mirrors the repo root, so runtime.mjs's
 * two-level ROOT resolution finds `config/` unchanged. A test builds this and
 * imports the assembled runtime to prove the bundle is self-contained.
 *
 *   node functions/catalyst/build.mjs      # → functions/catalyst/dist (gitignored)
 */

import { cp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const DIST = path.join(HERE, "dist");
const FN_ROOT = path.join(DIST, "functions");

/**
 * Runtime dependency versions come from functions/package.json — the single
 * declaration that also serves local development and CI (see that file). A spec
 * below names WHICH packages a function needs; it never restates a version, so a
 * bump happens once and reaches the bundle, the entrypoint and the tests
 * together.
 */
const RUNTIME_DEPS = JSON.parse(
  await readFile(path.join(ROOT, "functions/package.json"), "utf8")
).dependencies;

/** Resolve declared package names to { name: version } for a bundle manifest. */
function resolveDeps(names = []) {
  return Object.fromEntries(names.map((name) => {
    const version = RUNTIME_DEPS[name];
    if (!version) {
      throw new Error(`build: "${name}" is not declared in functions/package.json — add it there, not here`);
    }
    return [name, version];
  }));
}

const FUNCTIONS = {
  // Advanced I/O runs an Express app, so express is a bundled dependency.
  "titan-webhook": { type: "advancedio", shell: "deploy/titan-webhook.handler.cjs", deps: ["express"], bundle: "titan" },
  // A "job" function (not "cron"): the newer Job Scheduling model triggers Job
  // Functions from a Job Pool on a cron. Same (arg, context) handler shape.
  "titan-reconcile": { type: "job", shell: "deploy/titan-reconcile.handler.cjs", deps: [], bundle: "titan" },
  // The Career Record API. Advanced I/O for the same reason as the webhook: it
  // serves HTTP, and transport.mjs already exposes catalystHandler() for exactly
  // this surface.
  "record-api": { type: "advancedio", shell: "deploy/record-api.handler.cjs", deps: ["pg"], bundle: "record" },
};

const noTests = (src) => !/\.test\.mjs$/.test(src);

// Env vars baked into the function at deploy (infrastructure-as-code). Values
// come from process.env — run the build with `node --env-file=.env` so they are
// read from the local .env. They land only in dist/ (gitignored) and are sent
// to Catalyst at deploy; never printed. This is deterministic and reproducible,
// unlike manual console entry.
const FN_ENV_KEYS = ["ZOHO_DC", "ZOHO_CLIENT_ID", "ZOHO_CLIENT_SECRET", "ZOHO_REFRESH_TOKEN", "TITAN_WEBHOOK_SECRET", "TITAN_AUTOMATION_USER_ID"];
function fnEnv() {
  const env = {};
  const missing = [];
  for (const k of FN_ENV_KEYS) {
    if (process.env[k]) env[k] = process.env[k];
    else missing.push(k);
  }
  if (missing.length) console.warn(`⚠ env not baked (run with --env-file=.env): ${missing.join(", ")}`);
  return env;
}

/**
 * What each bundle contains.
 *
 * THE RULE, unchanged from Titan: `lib/` mirrors the repo's `functions/`, and the
 * FUNCTION ROOT mirrors the REPO ROOT. Code copied into lib/<x>/ therefore
 * resolves its `../../../<y>` imports to <function root>/<y>, exactly as it did
 * from functions/<x>/ to <repo root>/<y>. Nothing needs path-rewriting; the
 * layout does the work.
 */
const ASSEMBLE = {
  async titan(dir) {
    // Tested code → lib/ (mirrors repo functions/*, preserving import depth).
    await cp(path.join(ROOT, "functions/titan"), path.join(dir, "lib/titan"), { recursive: true, filter: noTests });
    await cp(path.join(ROOT, "functions/zoho"), path.join(dir, "lib/zoho"), { recursive: true, filter: noTests });
    await mkdir(path.join(dir, "lib/catalyst"), { recursive: true });
    for (const f of ["parse-notification.mjs", "webhook-core.mjs", "reconcile-core.mjs", "datastore-adapter.mjs"]) {
      await cp(path.join(HERE, f), path.join(dir, "lib/catalyst", f));
    }
    // Config read by runtime.mjs at the function root (its two-level ROOT).
    await cp(path.join(ROOT, "config"), path.join(dir, "config"), { recursive: true });
  },

  async record(dir) {
    // The API and the platform pipeline it runs on.
    await cp(path.join(ROOT, "functions/record"), path.join(dir, "lib/record"), { recursive: true, filter: noTests });
    await cp(path.join(ROOT, "functions/platform"), path.join(dir, "lib/platform"), { recursive: true, filter: noTests });

    // db/ at the FUNCTION ROOT, because bootstrap.mjs imports "../../../db/migrate.mjs"
    // from lib/record/api/ and migrate.mjs finds migrations beside itself. The
    // startup gate reads this ledger on every boot; without it the API cannot
    // verify the schema it is about to write to.
    await mkdir(path.join(dir, "db"), { recursive: true });
    await cp(path.join(ROOT, "db/migrate.mjs"), path.join(dir, "db/migrate.mjs"));
    await cp(path.join(ROOT, "db/migrations"), path.join(dir, "db/migrations"), { recursive: true });

    // The registers, at the path server.mjs resolves from lib/record/api/:
    // ../../../website/src/data. Disclosure is MANDATORY — createDependencies()
    // refuses without it, because a recommendation rendered without its
    // disclosure violates Article 5.4. Evidence is optional and degrades to null.
    const data = path.join(dir, "website/src/data");
    await mkdir(data, { recursive: true });
    for (const f of ["disclosure.json", "evidence.json"]) {
      await cp(path.join(ROOT, "website/src/data", f), path.join(data, f));
    }
  },
};

const catalystConfig = (name, type, env) => ({
  deployment: { name, stack: "node18", type, env_variables: env },
  execution: { main: "index.js" },
});
const packageJson = (name, deps) => ({
  name, version: "1.0.0", main: "index.js", author: "rahul@richenquest.com",
  dependencies: { "zcatalyst-sdk-node": "latest", ...resolveDeps(deps) },
});

export async function build() {
  await rm(FN_ROOT, { recursive: true, force: true });
  const env = fnEnv();
  const built = [];

  for (const [name, spec] of Object.entries(FUNCTIONS)) {
    const dir = path.join(FN_ROOT, name);
    await mkdir(path.join(dir, "lib"), { recursive: true });

    await ASSEMBLE[spec.bundle](dir);

    await cp(path.join(HERE, spec.shell), path.join(dir, "index.js"));
    await writeFile(path.join(dir, "catalyst-config.json"), JSON.stringify(catalystConfig(name, spec.type, env), null, 2) + "\n");
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
    console.log("  " + built.map((b) => `npm install --prefix functions/${b.name}`).join(" && "));
    console.log("  catalyst deploy --only functions\n");
  }).catch((e) => { console.error(`✗ build failed: ${e.message}`); process.exit(1); });
}
