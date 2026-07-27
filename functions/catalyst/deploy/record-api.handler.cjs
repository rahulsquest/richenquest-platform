/**
 * Catalyst Advanced I/O entry — record-api. DEPLOY SHELL (thin).
 *
 * All logic is in the tested code (lib/record/**); this file only bridges
 * Catalyst's platform surface into it. The CJS→ESM bridge uses dynamic import(),
 * the compatible path for loading ESM from a CommonJS Catalyst function.
 *
 * Copied to a bundle root by build.mjs, so its imports are LOCAL (./lib/…),
 * never escaping the function directory (Catalyst bundles per-function).
 *
 * WHY buildRecordApi() AND NOT main()
 * main() binds a port and installs SIGTERM/SIGINT handlers. Catalyst owns both:
 * it supplies the socket and controls the lifecycle. buildRecordApi() assembles
 * everything and listens for nothing, which is exactly the half this needs — and
 * the reason the two were separated rather than written as one function.
 *
 * BUILT ONCE, REUSED WHILE WARM
 * Assembly runs the whole startup gate: version pin, migration status, and both
 * schema assertions — several round trips to Neon. Doing that per request would
 * add latency to every call and hammer the database. The promise is cached at
 * module scope, so a warm container reuses one assembled app; a cold start pays
 * once. A REJECTED promise is cleared so the next invocation retries rather than
 * caching a transient failure (a database blip must not poison the container).
 *
 * Set RUN_MIGRATIONS_ON_START=false in production: migrations belong to a deploy
 * step, not to whichever request happens to arrive first.
 *
 * The SDK wiring here is validated at first deploy — the one seam that cannot be
 * exercised without the live Catalyst runtime; everything it calls is tested.
 */

const express = require("express");

const app = express();
app.use(express.json());

let appPromise = null;

/** Assemble once. On failure, clear the cache so the next request retries. */
function getHandler() {
  if (!appPromise) {
    appPromise = (async () => {
      const { buildRecordApi } = await import("./lib/record/api/server.mjs");
      const { createRouter } = await import("./lib/record/api/service.mjs");
      const { catalystHandler } = await import("./lib/record/api/transport.mjs");
      const { dependencies } = await buildRecordApi({ env: process.env });
      return catalystHandler(createRouter(), dependencies);
    })().catch((err) => {
      appPromise = null;
      throw err;
    });
  }
  return appPromise;
}

app.use(async (req, res) => {
  try {
    const handler = await getHandler();
    return handler(req, res);
  } catch (err) {
    // Startup failed. Report it as unavailable — never as a 500 that looks like
    // an application bug, and never with the underlying message, which can name
    // hosts and configuration.
    if (!res.headersSent) {
      res.status(503).json({ error: { code: "STARTUP_FAILED", message: "The service is not available." } });
    }
  }
});

module.exports = app;
