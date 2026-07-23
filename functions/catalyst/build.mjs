/**
 * Catalyst deploy assembler.
 *
 * Catalyst bundles each function's own directory — imports that escape it
 * (../../../) are NOT included in the deployment package. This script produces
 * self-contained bundles under functions/catalyst/dist/<fn>/, each mirroring the
 * repo layout it needs (config/ + functions/{titan,zoho,catalyst}) so every
 * import resolves locally and runtime.mjs finds config/ at its expected path.
 *
 *   node functions/catalyst/build.mjs
 *
 * Output is gitignored; it is a build artifact, regenerated on demand and by CI
 * before `catalyst deploy`.
 */

import { cp, rm, mkdir, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const DIST = path.join(HERE, "dist");

/** Function name → { entry source shell, catalyst-config.json }. */
const FUNCTIONS = {
  "titan-webhook": {
    shell: "deploy/titan-webhook.handler.cjs",
    config: { deployment: { name: "titan-webhook", stack: "node18", type: "advancedio", memory: 256, timeout: 30 } },
  },
  "titan-reconcile": {
    shell: "deploy/titan-reconcile.handler.cjs",
    config: { deployment: { name: "titan-reconcile", stack: "node18", type: "cron", memory: 256, timeout: 900 } },
  },
};

// Copied into every bundle, preserving repo-relative paths so ROOT resolution
// inside runtime.mjs still lands on the bundled config/.
const INCLUDE = [
  ["config", "config"],
  ["functions/titan", "functions/titan"],
  ["functions/zoho", "functions/zoho"],
];
// Catalyst core .mjs (not the whole catalyst dir — exclude dist/deploy/tests/build).
const CATALYST_CORE = ["parse-notification.mjs", "webhook-core.mjs", "reconcile-core.mjs"];

const noTests = (src) => !/\.test\.mjs$/.test(src);

export async function build() {
  await rm(DIST, { recursive: true, force: true });
  const built = [];

  for (const [name, spec] of Object.entries(FUNCTIONS)) {
    const dest = path.join(DIST, name);
    await mkdir(dest, { recursive: true });

    for (const [from, to] of INCLUDE) {
      await cp(path.join(ROOT, from), path.join(dest, to), { recursive: true, filter: noTests });
    }
    await mkdir(path.join(dest, "functions/catalyst"), { recursive: true });
    for (const f of CATALYST_CORE) {
      await cp(path.join(HERE, f), path.join(dest, "functions/catalyst", f));
    }

    // Entry point at the bundle root + its config.
    await cp(path.join(HERE, spec.shell), path.join(dest, "handler.js"));
    await writeFile(path.join(dest, "catalyst-config.json"), JSON.stringify(spec.config, null, 2) + "\n");

    built.push({ name, dest, files: (await readdir(dest)).sort() });
  }
  return built;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  build().then((built) => {
    console.log("\nCatalyst bundles assembled:\n");
    for (const b of built) console.log(`  ${b.name}/  [${b.files.join(", ")}]`);
    console.log(`\n→ ${path.relative(ROOT, DIST)} (gitignored). Deploy each with the Catalyst CLI once logged in.\n`);
  }).catch((e) => { console.error(`✗ build failed: ${e.message}`); process.exit(1); });
}
