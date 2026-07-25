/**
 * Career Record API — composition root.
 *
 * The single place where concrete implementations are chosen. Every module above
 * this line depends on interfaces only, which is what makes the store swappable,
 * the vault provider swappable, and the whole API testable without infrastructure.
 *
 * Nothing here contains logic. If a decision appears in this file, it belongs in
 * an endpoint or the platform.
 */

import { Router, createServer, catalystHandler } from "./transport.mjs";
import { routes, assertContractComplete, contract, API_VERSION } from "./endpoints.mjs";
import { verifyToken } from "../identity/auth.mjs";
import { consentState, consentCheck } from "../identity/consent.mjs";
import { identityVault, memoryVaultStore, envKeyProvider } from "../identity/vault.mjs";
import { memoryStore } from "../log.mjs";
import { createRateLimiter, memoryCounterStore } from "../../platform/security.mjs";
import { validateInput } from "../../platform/validate.mjs";
import { createLogger } from "../../platform/logging.mjs";
import { createMetrics } from "../../platform/metrics.mjs";
import { InternalError } from "../../platform/errors.mjs";

/**
 * Build the dependency set every endpoint receives.
 *
 * @param {object} config
 * @param {object} config.store            EventStore (postgres in production)
 * @param {object} config.vault            identity vault
 * @param {string} config.secret           token signing secret
 * @param {object} config.evidenceRegister parsed evidence.json
 * @param {object} config.disclosureRegister parsed disclosure.json
 */
export function createDependencies({
  store,
  vault,
  secret,
  evidenceRegister,
  disclosureRegister,
  grantsFor = async () => [],
  /**
   * RECORDED DEBT — counsellor assignment scoping.
   *
   * Returning null means "no assignment model is configured", so a counsellor is
   * not restricted to a subset of records. Returning an ARRAY enables enforcement
   * and is honoured everywhere. The assignment model itself (which counsellor owns
   * which record) is a Counsellor Workspace concern and does not exist yet.
   *
   * Until it does, any authenticated counsellor may reach any record. That is
   * acceptable for a small team where every counsellor is staff, and it is
   * recorded rather than silently assumed — but it MUST be supplied before the
   * team grows or before any non-staff role is issued a counsellor token.
   *
   * The default is null and not [] deliberately: an empty array is truthy, and
   * treating it as "configured" refuses every counsellor.
   */
  assignedSubjects = async () => null,
  revoked = new Set(),
  logger = createLogger(),
  metrics = createMetrics(),
  counterStore = memoryCounterStore(),
  cors = {},
  toolVersion = "1.0.0",
} = {}) {
  if (!store) throw new InternalError("createDependencies: an event store is required");
  if (!secret) throw new InternalError("createDependencies: a token signing secret is required");
  if (!disclosureRegister) throw new InternalError("createDependencies: the disclosure register is required");

  /** Resolve an evidence reference against the register. Returns null when unknown. */
  async function resolveEvidence(ref) {
    if (typeof ref !== "string") return null;
    const [kind, rest] = ref.split(":");
    const id = (rest ?? "").split("@")[0];

    if (kind === "claim") {
      const claim = evidenceRegister?.claims?.[id];
      if (!claim || claim.status === "retired") return null;
      return { ref, kind, hash: null, status: claim.status };
    }
    // Destination data, documents and actors are resolved by their owning
    // services. Until those exist, they are accepted structurally but recorded as
    // unresolved so the gap is visible rather than silently passing.
    if (["dest", "doc", "usr", "partner", "sub"].includes(kind)) {
      return { ref, kind, hash: null, status: "unresolved_by_design" };
    }
    return null;
  }

  /**
   * Build disclosure from the register. Deliberately ignores anything the caller
   * sent: disclosure text is ours, not theirs (Constitution 5.4).
   */
  async function buildDisclosure(payload) {
    const destinations = (payload?.recommended ?? [])
      .map((r) => String(r.option ?? ""))
      .filter((o) => o.startsWith("dest:"))
      .map((o) => o.slice(5));

    const related = (disclosureRegister.relationships ?? []).filter((r) =>
      destinations.includes(r.destination)
    );

    const statements = related.length
      ? related.map((r) => `${disclosureRegister.relationship_statement_prefix} ${r.counterparty}.`)
      : [disclosureRegister.no_relationship_statement];

    return { shown: true, register_version: disclosureRegister.last_reviewed, statements };
  }

  /** Consent decision for a purpose, resolved from the log plus the vault's DOB. */
  async function consentFor(subjectId, purpose, opts = {}) {
    if (!subjectId) return { allowed: false, code: "NO_SUBJECT", purpose, reason: "no record identified" };
    const events = await store.read(subjectId);
    if (events.length === 0) {
      // No record yet — nothing to consent about. Endpoints that create a record
      // do not declare a consent purpose, so this only guards misconfiguration.
      return { allowed: false, code: "NO_RECORD", purpose, reason: "record does not exist" };
    }
    const dob = await vault.get(subjectId, "date_of_birth").catch(() => null);
    return consentCheck(consentState(events, { dateOfBirth: dob }), purpose, opts);
  }

  async function subjectFlags(subjectId) {
    const dob = await vault.get(subjectId, "date_of_birth").catch(() => null);
    const state = consentState(await store.read(subjectId), { dateOfBirth: dob });
    return { minor: state.is_minor };
  }

  return {
    store,
    vault,
    secret,
    revoked,
    logger,
    metrics,
    cors,
    toolVersion,
    verifyToken,
    validateInput,
    rateLimiter: createRateLimiter(counterStore),
    disclosureRegister,
    evidenceRegister,
    resolveEvidence,
    buildDisclosure,
    consentFor,
    subjectFlags,
    resolveGrants: async (claims, req) => grantsFor(claims, req?.params?.subject_id),
    assignedSubjects,
    consentState: async (subjectId) => {
      const dob = await vault.get(subjectId, "date_of_birth").catch(() => null);
      return consentState(await store.read(subjectId), { dateOfBirth: dob });
    },
  };
}

/** The router, with the startup completeness assertion applied. */
export function createRouter() {
  assertContractComplete();
  return new Router(routes);
}

/** node:http server — used by integration tests and container runs. */
export function createApiServer(config) {
  return createServer(createRouter(), createDependencies(config));
}

/** Catalyst Advanced I/O entry point. */
export function createCatalystApi(config) {
  return catalystHandler(createRouter(), createDependencies(config));
}

/**
 * Development harness: in-memory store and vault, so the API can be exercised
 * end to end with no infrastructure. Never used in production — the vault key
 * provider refuses to start there.
 */
export function createDevApi({ secret, evidenceRegister = { claims: {} }, disclosureRegister, env = process.env } = {}) {
  return createApiServer({
    store: memoryStore(),
    vault: identityVault(memoryVaultStore(), envKeyProvider(env)),
    secret,
    evidenceRegister,
    disclosureRegister,
  });
}

export { contract, API_VERSION };
