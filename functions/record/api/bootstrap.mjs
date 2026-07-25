/**
 * Production startup.
 *
 * The application refuses to serve traffic until the database is provably safe to
 * write to. That ordering is deliberate: the append path delegates conflict
 * detection to database constraints, so a missing constraint does not degrade
 * gracefully — it silently corrupts an append-only log we can never repair.
 *
 * Sequence:
 *   1. read and validate configuration    (fail fast, before any connection)
 *   2. connect with TLS                   (a pooled client)
 *   3. verify the server version          (pinned major; refuse below minimum)
 *   4. run pending migrations             (advisory-locked, idempotent)
 *   5. assertSchema()                     (the constraints the adapter relies on)
 *   6. build dependencies and the router
 *
 * Any failure in 1–5 throws. Nothing starts half-configured.
 */

import { migrate, status } from "../../../db/migrate.mjs";
import { postgresEventStore, assertSchema } from "../adapters/postgres.mjs";
import { identityVault } from "../identity/vault.mjs";
import { createDependencies, createRouter } from "./service.mjs";
import { createServer } from "./transport.mjs";
import { createLogger } from "../../platform/logging.mjs";
import { createMetrics } from "../../platform/metrics.mjs";

/**
 * Minimum supported PostgreSQL major version.
 *
 * PINNED at 16 rather than at the 18.4 used in local integration tests: 16 is the
 * oldest release providing everything the schema depends on (hash partitioning,
 * partial unique indexes on partitioned tables, jsonb behaviour the hash chain
 * relies on). Naming a minimum rather than an exact version lets a managed
 * provider apply patch upgrades without failing startup, while still refusing a
 * server too old to honour the schema.
 *
 * Local integration tests run 18.4 — see db/test/. Production must be >= 16.
 */
export const MIN_POSTGRES_MAJOR = 16;
export const TESTED_POSTGRES_VERSION = "18.4";

export class StartupError extends Error {
  constructor(code, message, remedy = null) {
    super(remedy ? `${message}\n  → ${remedy}` : message);
    this.code = code;
    this.name = "StartupError";
    this.remedy = remedy;
  }
}

/**
 * Read and validate configuration. Fails before any network call, so a missing
 * secret is a startup error rather than a 500 on the first request.
 */
export function readConfig(env = process.env) {
  const missing = [];
  const require = (key) => {
    const v = env[key];
    if (!v) missing.push(key);
    return v;
  };

  const config = {
    databaseUrl: require("DATABASE_URL"),
    tokenSecret: require("RECORD_TOKEN_SECRET"),
    vaultKekProvider: env.RECORD_VAULT_PROVIDER ?? "env",
    nodeEnv: env.NODE_ENV ?? "development",
    port: Number(env.PORT ?? 8080),
    corsAllowed: (env.CORS_ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    poolMax: Number(env.PG_POOL_MAX ?? 10),
    statementTimeoutMs: Number(env.PG_STATEMENT_TIMEOUT_MS ?? 10_000),
    runMigrationsOnStart: env.RUN_MIGRATIONS_ON_START !== "false",
  };

  if (missing.length) {
    throw new StartupError(
      "CONFIG_MISSING",
      `required configuration is absent: ${missing.join(", ")}`,
      "set these in the deployment environment; see db/DEPLOYMENT.md"
    );
  }
  if (config.tokenSecret.length < 32) {
    throw new StartupError("WEAK_SECRET", "RECORD_TOKEN_SECRET must be at least 32 characters");
  }
  if (config.nodeEnv === "production" && config.vaultKekProvider === "env") {
    throw new StartupError(
      "INSECURE_KEY_PROVIDER",
      "the env key provider must not be used in production",
      "set RECORD_VAULT_PROVIDER to a KMS-backed provider (see identity/kms.mjs)"
    );
  }
  if (config.nodeEnv === "production" && config.corsAllowed.length === 0) {
    throw new StartupError(
      "CORS_UNCONFIGURED",
      "CORS_ALLOWED_ORIGINS is empty in production",
      "an API holding personal data must name its callers explicitly"
    );
  }
  return config;
}

/** Refuse a server too old to honour the schema. */
export async function assertServerVersion(client) {
  const { rows } = await client.query("SHOW server_version");
  const raw = rows[0].server_version;
  const major = Number.parseInt(raw, 10);
  if (!Number.isFinite(major)) {
    throw new StartupError("VERSION_UNKNOWN", `could not parse PostgreSQL version from "${raw}"`);
  }
  if (major < MIN_POSTGRES_MAJOR) {
    throw new StartupError(
      "VERSION_TOO_OLD",
      `PostgreSQL ${raw} is below the minimum supported major ${MIN_POSTGRES_MAJOR}`,
      `provision PostgreSQL >= ${MIN_POSTGRES_MAJOR} (tested against ${TESTED_POSTGRES_VERSION})`
    );
  }
  return { version: raw, major };
}

/**
 * Bring the database to a state the adapter may safely write to.
 * Exported separately so a deploy job can run it without starting a server.
 */
export async function prepareDatabase(client, { runMigrations = true, logger = console } = {}) {
  const version = await assertServerVersion(client);
  logger.log?.(`✓ startup: PostgreSQL ${version.version}`);

  if (runMigrations) {
    await migrate(client, { logger });
  } else {
    const s = await status(client);
    if (s.pending.length) {
      throw new StartupError(
        "MIGRATIONS_PENDING",
        `${s.pending.length} migration(s) are unapplied and RUN_MIGRATIONS_ON_START=false`,
        "run `node db/migrate.mjs up` as a deploy step before starting the application"
      );
    }
    if (s.drift.length) {
      throw new StartupError("CHECKSUM_DRIFT", "applied migrations differ from the repository");
    }
  }

  // The gate. The append path relies on these constraints to detect concurrent
  // writes; without them, conflicts are lost silently rather than loudly.
  await assertSchema(client);
  logger.log?.("✓ startup: schema constraints verified");

  return version;
}

/**
 * Build a running API. Caller supplies the pg pool and the vault key provider, so
 * this module never imports a driver or a cloud SDK.
 *
 * @param {object} deps
 * @param {object} deps.pool          a pg Pool (or anything with .query)
 * @param {object} deps.vaultStore    VaultStore implementation
 * @param {object} deps.keyProvider   KEK provider (see identity/kms.mjs)
 * @param {object} [deps.registers]   { evidence, disclosure }
 */
export async function startApi({ pool, vaultStore, keyProvider, registers, env = process.env, logger = createLogger() } = {}) {
  const config = readConfig(env);

  await pool.query(`SET statement_timeout = ${Number(config.statementTimeoutMs)}`).catch(() => {
    // Not fatal: some managed providers disallow SET at session level via a
    // pooler. Recorded rather than silently ignored.
    logger.warn("startup.statement_timeout_not_set", { requested_ms: config.statementTimeoutMs });
  });

  await prepareDatabase(pool, { runMigrations: config.runMigrationsOnStart, logger: { log: (m) => logger.info(m) } });

  const dependencies = createDependencies({
    store: postgresEventStore(pool),
    vault: identityVault(vaultStore, keyProvider),
    secret: config.tokenSecret,
    evidenceRegister: registers?.evidence,
    disclosureRegister: registers?.disclosure,
    logger,
    metrics: createMetrics(),
    cors: { allowed: config.corsAllowed },
  });

  const server = createServer(createRouter(), dependencies);
  return { server, config, dependencies };
}
