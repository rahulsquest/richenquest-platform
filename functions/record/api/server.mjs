#!/usr/bin/env node
/**
 * The Career Record API entrypoint — the composition root for a real deployment.
 *
 * bootstrap.mjs has always known HOW to start (validate config, verify the
 * server version, migrate, assert the schema, build the router) but `startApi()`
 * had no caller: it took `keyProvider` as a parameter and nothing supplied one.
 * The only assembled server in the repository was dev-server.mjs, which uses the
 * in-memory adapters and an ephemeral key. This file is what a deployment runs.
 *
 * ORDER IS THE POINT, and it is fail-fast by cost:
 *
 *   1. readConfig()          pure. Refuses a weak secret, the env key provider in
 *                            production, an empty CORS allowlist in production.
 *   2. selectKeyProvider()   pure. Refuses an unknown provider, or "kms" with no
 *                            client — BEFORE any connection is opened.
 *   2b. registers            local file I/O. The disclosure register is mandatory.
 *   3. pool                   the first I/O: a TLS connection.
 *   4. startApi()            runs the startup gate ITSELF — statement timeout,
 *                            version pin, migrations, assertSchema() and
 *                            assertVaultSchema() — then builds the router. This
 *                            file does not repeat any of it.
 *   5. listen()              only now is traffic possible.
 *
 * A configuration or provider error costs nothing and surfaces immediately; a
 * database error surfaces before the socket is open. Nothing starts half-built.
 *
 * NO CLOUD SDK IS IMPORTED HERE. `kmsClient` is injected, so this module stays
 * dependency-free: when RECORD_VAULT_PROVIDER=kms, the deploy wrapper constructs
 * KeyManagementServiceClient and passes it in. `pg` is imported dynamically for
 * the same reason it is in db/migrate.mjs — it is a deploy-time dependency, and
 * a caller that injects a pool needs neither it nor a database.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { readConfig, startApi, StartupError } from "./bootstrap.mjs";
import { selectKeyProvider, describeKeyProvider } from "../identity/provider.mjs";
import { createLogger } from "../../platform/logging.mjs";

/** Where the disclosure and evidence registers live in this repository. */
const DATA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../website/src/data");

/**
 * Load the registers the API resolves evidence and disclosure against.
 *
 * The DISCLOSURE register is mandatory — createDependencies() refuses without it,
 * and rightly: a recommendation rendered without its disclosure violates Article
 * 5.4, so a deployment that cannot load it must not serve. The EVIDENCE register
 * is optional; an unresolvable reference degrades to null rather than failing.
 */
async function loadRegisters(dir = DATA_DIR) {
  const disclosure = await readFile(path.join(dir, "disclosure.json"), "utf8")
    .then(JSON.parse)
    .catch((cause) => {
      throw new StartupError(
        "REGISTER_MISSING",
        `the disclosure register could not be read from ${dir}: ${cause.message}`,
        "deploy website/src/data/disclosure.json alongside the API, or pass registers explicitly"
      );
    });
  const evidence = await readFile(path.join(dir, "evidence.json"), "utf8").then(JSON.parse).catch(() => null);
  return { disclosure, evidence };
}

/**
 * Build a pg Pool from validated configuration. TLS is not optional: this
 * carries personal data, and `rejectUnauthorized` means a certificate that does
 * not verify fails the connection rather than downgrading it silently.
 */
async function createPool(config) {
  const { default: pg } = await import("pg");
  return new pg.Pool({
    connectionString: config.databaseUrl,
    ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: true },
    max: config.poolMax,
  });
}

/**
 * Assemble the API without listening. Exported separately so the composition is
 * testable: inject a pool and a key provider's client, assert the ordering, and
 * never open a socket.
 *
 * @param {object} [opts]
 * @param {object} [opts.env]        environment (default process.env)
 * @param {object} [opts.kmsClient]  Cloud KMS client, required when the provider is "kms"
 * @param {object} [opts.pool]       inject a pool to skip creating one
 * @param {object} [opts.registers]  { evidence, disclosure }
 * @param {object} [opts.logger]
 * @returns {Promise<{server: object, pool: object, config: object, dependencies: object}>}
 */
export async function buildRecordApi({
  env = process.env,
  kmsClient = null,
  pool: injectedPool = null,
  registers,
  logger = createLogger(),
} = {}) {
  // 1 — configuration. Pure, and the production gates live here.
  const config = readConfig(env);

  // 2 — the key provider. Also pure: an unknown provider, or "kms" without a
  // client, must fail before a connection is opened rather than on the first
  // student whose data key needs wrapping.
  const keyProvider = selectKeyProvider({ env, kmsClient });
  logger.info("startup.key_provider", describeKeyProvider(env));

  // 2b — the registers. Local file I/O, so it stays on the cheap side of the
  // first network call: a deployment shipped without disclosure.json should fail
  // before it opens a database connection, not after.
  const loaded = registers ?? (await loadRegisters());

  // 3 — the pool, and then startApi(), which runs the whole startup gate itself:
  // statement timeout, version pin, migrations, assertSchema, assertVaultSchema.
  // Deliberately NOT repeated here — calling prepareDatabase() again would re-run
  // migrations and both schema assertions for no benefit.
  const pool = injectedPool ?? (await createPool(config));
  try {
    const { server, dependencies } = await startApi({ pool, keyProvider, registers: loaded, env, logger });
    return { server, pool, config, dependencies };
  } catch (err) {
    // Every startup-gate failure lands here — version pin, pending migrations,
    // checksum drift, a failed schema assertion. Drain ONLY a pool we created:
    // an injected one belongs to the caller, and closing it would break the
    // integration tests and any supervisor that reuses it across attempts.
    // Without this a caller that catches and retries leaks a pool per attempt,
    // consuming connection quota with nothing left holding a reference.
    if (!injectedPool) await pool.end().catch(() => {});
    throw err;
  }
}

/**
 * Start listening, and shut down cleanly.
 *
 * SIGTERM/SIGINT stop accepting connections, then drain the pool. An append-only
 * log has no repair path, so a half-finished write terminated mid-flight is worth
 * avoiding: closing the server before the pool lets in-flight requests finish.
 */
export async function main({ env = process.env, kmsClient = null, logger = createLogger() } = {}) {
  const { server, pool, config } = await buildRecordApi({ env, kmsClient, logger });

  await new Promise((resolve) => server.listen(config.port, resolve));
  logger.info("startup.listening", { port: config.port, env: config.nodeEnv });

  let closing = false;
  const shutdown = async (signal) => {
    if (closing) return;
    closing = true;
    logger.info("shutdown.started", { signal });
    await new Promise((resolve) => server.close(resolve));
    await pool.end().catch(() => {});
    logger.info("shutdown.complete");
  };
  for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => void shutdown(signal));

  return { server, pool, config };
}

/* Run only when executed directly, never on import. */
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    // A startup failure must be loud and specific. StartupError already folds its
    // remedy into the message; a bare stack trace would bury both.
    console.error(`✗ startup failed: ${err.code ?? "ERROR"} — ${err.message}`);
    process.exit(1);
  });
}
