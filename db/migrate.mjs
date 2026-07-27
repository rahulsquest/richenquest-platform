/**
 * Production migration runner.
 *
 * Requirements it satisfies, none of which are optional for an append-only
 * system of record:
 *
 *  · IDEMPOTENT — re-running applies nothing and exits 0, so it is safe on every
 *    deploy and every instance start.
 *  · ORDERED — migrations apply in lexical filename order and a gap is refused.
 *  · TRANSACTIONAL — each migration commits or rolls back whole. A half-applied
 *    schema on a log we can never rewrite is the worst outcome available.
 *  · CHECKSUMMED — if an already-applied file has changed on disk, it REFUSES.
 *    Editing an applied migration means the database and the repository disagree
 *    about what the schema is, and every later assumption is unfounded.
 *  · SINGLE-WRITER — a Postgres advisory lock, so N instances booting together
 *    cannot race. The lock is held for the whole run and released on exit.
 *
 * Usage:
 *   node db/migrate.mjs status
 *   node db/migrate.mjs up
 *   node db/migrate.mjs up --dry-run
 */

import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(HERE, "migrations");

/** Arbitrary but fixed: the advisory lock key for schema migration. */
const LOCK_KEY = 8_074_311_002;

const LEDGER = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version     text        PRIMARY KEY,
    name        text        NOT NULL,
    checksum    text        NOT NULL,
    applied_at  timestamptz NOT NULL DEFAULT now(),
    applied_by  text        NOT NULL DEFAULT current_user,
    duration_ms integer     NOT NULL
  )`;

const sha = (s) => createHash("sha256").update(s, "utf8").digest("hex");

export class MigrationError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = "MigrationError";
  }
}

/** Read `001_name.sql` files, in order, with checksums. */
export async function loadMigrations(dir = MIGRATIONS_DIR) {
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  const migrations = [];

  for (const file of files) {
    const m = /^(\d{3,})_([\w-]+)\.sql$/.exec(file);
    if (!m) {
      throw new MigrationError(
        "BAD_FILENAME",
        `migration "${file}" must be named NNN_name.sql — ordering is derived from the filename`
      );
    }
    const sql = await readFile(path.join(dir, file), "utf8");
    migrations.push({ version: m[1], name: m[2], file, sql, checksum: sha(sql) });
  }

  // A duplicated or missing version means the intended order is ambiguous.
  const versions = migrations.map((x) => x.version);
  if (new Set(versions).size !== versions.length) {
    throw new MigrationError("DUPLICATE_VERSION", `duplicate migration version in ${dir}`);
  }
  for (let i = 0; i < versions.length; i++) {
    const expected = String(i + 1).padStart(versions[i].length, "0");
    if (versions[i] !== expected) {
      throw new MigrationError(
        "VERSION_GAP",
        `expected migration ${expected} but found ${versions[i]} — gaps make apply order ambiguous`
      );
    }
  }
  return migrations;
}

/** What has been applied, keyed by version. */
async function applied(client) {
  // Create the ledger only when it is genuinely absent.
  //
  // `CREATE TABLE IF NOT EXISTS` is NOT free for a least-privileged caller:
  // PostgreSQL checks CREATE on the schema BEFORE the IF NOT EXISTS clause
  // resolves, so an unconditional DDL here fails with 42501 even when the table
  // already exists. That would force the application role — which only ever
  // needs to READ this ledger, at the startup gate — to hold CREATE on the
  // schema, and a role with CREATE can add arbitrary objects and owns (so can
  // drop) whatever it creates.
  //
  // Probing first keeps the ledger's creation the migration role's business and
  // the application role's access read-only. `to_regclass` needs no privilege
  // and returns NULL rather than throwing when the relation is absent.
  const { rows: probe } = await client.query(
    "SELECT to_regclass('schema_migrations') IS NOT NULL AS present"
  );
  if (!probe[0].present) await client.query(LEDGER);

  const { rows } = await client.query("SELECT version, name, checksum, applied_at FROM schema_migrations");
  return new Map(rows.map((r) => [r.version, r]));
}

/**
 * Compare disk against the database.
 * @returns {{pending: object[], applied: object[], drift: object[]}}
 */
export async function status(client, dir = MIGRATIONS_DIR) {
  const onDisk = await loadMigrations(dir);
  const inDb = await applied(client);

  const pending = [];
  const done = [];
  const drift = [];

  for (const m of onDisk) {
    const record = inDb.get(m.version);
    if (!record) {
      pending.push(m);
      continue;
    }
    done.push({ ...m, applied_at: record.applied_at });
    if (record.checksum !== m.checksum) {
      drift.push({
        version: m.version,
        file: m.file,
        applied_checksum: record.checksum,
        disk_checksum: m.checksum,
      });
    }
  }

  // A migration recorded in the database with no file is equally a divergence.
  for (const [version, record] of inDb) {
    if (!onDisk.some((m) => m.version === version)) {
      drift.push({ version, file: `${record.name} (MISSING FROM DISK)`, applied_checksum: record.checksum, disk_checksum: null });
    }
  }

  return { pending, applied: done, drift };
}

/**
 * Apply pending migrations.
 *
 * @param {{query: Function, connect?: Function}} client  a pg Client/Pool
 * @param {{dir?: string, dryRun?: boolean, logger?: object}} [opts]
 */
export async function migrate(client, { dir = MIGRATIONS_DIR, dryRun = false, logger = console } = {}) {
  // Serialise across instances. pg_advisory_lock is session-scoped, so it is
  // released if the process dies — a crashed deploy cannot wedge the next one.
  await client.query("SELECT pg_advisory_lock($1)", [LOCK_KEY]);

  try {
    const state = await status(client, dir);

    if (state.drift.length) {
      throw new MigrationError(
        "CHECKSUM_DRIFT",
        "the database and the repository disagree about applied migrations:\n" +
          state.drift
            .map((d) => `  · ${d.version} ${d.file}: applied ${d.applied_checksum?.slice(0, 12)} vs disk ${d.disk_checksum?.slice(0, 12) ?? "MISSING"}`)
            .join("\n") +
          "\nAn applied migration must never be edited. Add a new migration instead."
      );
    }

    if (state.pending.length === 0) {
      logger.log?.(`✓ migrate: schema up to date (${state.applied.length} applied)`);
      return { applied: [], alreadyApplied: state.applied.length };
    }

    if (dryRun) {
      logger.log?.(`migrate --dry-run: ${state.pending.length} pending:`);
      for (const m of state.pending) logger.log?.(`  · ${m.version} ${m.name}`);
      return { applied: [], pending: state.pending.map((m) => m.version), dryRun: true };
    }

    const results = [];
    for (const m of state.pending) {
      const started = Date.now();
      try {
        // Each migration is its own transaction. The migration files may contain
        // their own BEGIN/COMMIT (001 does); Postgres treats those as no-ops
        // inside an open transaction block, so wrapping stays correct.
        await client.query("BEGIN");
        await client.query(m.sql);
        await client.query(
          "INSERT INTO schema_migrations (version, name, checksum, duration_ms) VALUES ($1,$2,$3,$4)",
          [m.version, m.name, m.checksum, Date.now() - started]
        );
        await client.query("COMMIT");
        results.push(m.version);
        logger.log?.(`✓ migrate: applied ${m.version}_${m.name} (${Date.now() - started}ms)`);
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw new MigrationError(
          "APPLY_FAILED",
          `migration ${m.file} failed and was rolled back: ${err.message}`
        );
      }
    }

    return { applied: results, alreadyApplied: state.applied.length };
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]).catch(() => {});
  }
}

/* ------------------------------------------------------------------ CLI --- */

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const command = process.argv[2] ?? "status";
  const dryRun = process.argv.includes("--dry-run");
  const url = process.env.DATABASE_URL;

  if (!url) {
    console.error("✗ migrate: DATABASE_URL is not set");
    process.exit(2);
  }

  // The driver is a deploy-time dependency, and only the CLI needs it — the
  // exported migrate()/status() take an injected client and import nothing.
  //
  // Resolved against functions/package.json rather than by the usual upward walk
  // from this file: `pg` is declared once, for functions/**, and db/ is not below
  // it. Pointing at that manifest keeps ONE declaration serving the server, this
  // CLI and the deploy bundle, instead of a second copy here that could drift to
  // a different major.
  const require = createRequire(new URL("../functions/package.json", import.meta.url));
  const pg = require("pg");
  const client = new pg.Client({
    connectionString: url,
    ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: true },
  });
  await client.connect();

  try {
    if (command === "status") {
      const s = await status(client);
      console.log(`applied: ${s.applied.length}, pending: ${s.pending.length}, drift: ${s.drift.length}`);
      for (const m of s.pending) console.log(`  pending  ${m.version} ${m.name}`);
      for (const d of s.drift) console.log(`  DRIFT    ${d.version} ${d.file}`);
      process.exit(s.drift.length ? 1 : 0);
    } else if (command === "up") {
      await migrate(client, { dryRun });
      process.exit(0);
    } else {
      console.error(`✗ migrate: unknown command "${command}" (expected: status | up)`);
      process.exit(2);
    }
  } catch (err) {
    console.error(`✗ ${err.code ?? "ERROR"}: ${err.message}`);
    process.exit(1);
  } finally {
    await client.end();
  }
}

export { MIGRATIONS_DIR, LOCK_KEY };
