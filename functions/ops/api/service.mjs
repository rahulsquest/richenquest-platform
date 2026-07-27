/**
 * Founder Operations API — composition root.
 *
 * Mirrors functions/record/api/service.mjs deliberately: the same Router, the same
 * transport, the same rate limiter, the same logger. Reusing the transport is the
 * point — a second HTTP stack would be a second place for CORS, body limits and
 * error shapes to drift, and those are exactly the things that must not differ
 * between two services on the same domain.
 */

import { Router, createServer, catalystHandler } from "../../record/api/transport.mjs";
import { routes, assertContractComplete, contract, API_VERSION } from "./endpoints.mjs";
import { OPS_HTTP_METHODS } from "./endpoints.mjs";
import { verifyToken } from "../../record/identity/auth.mjs";
import { validateInput } from "../../platform/validate.mjs";
import { createLogger } from "../../platform/logging.mjs";
import { createMetrics } from "../../platform/metrics.mjs";
import { createRateLimiter, memoryCounterStore } from "../../platform/security.mjs";
import { InternalError } from "../../platform/errors.mjs";
import { memoryCrmPort } from "../crm-port.mjs";

/**
 * @param {object} config
 * @param {object} config.crm      a CrmPort (zohoCrmPort in production)
 * @param {string} config.secret   token signing secret — the SAME one the Career
 *                                 Record API uses, so one login serves both
 * @param {Function} [config.teamMemberIds]  claims → peer ids, for team scoping.
 *                                 Returns [] today; becomes real when the team joins.
 */
export function createOpsDependencies({
  crm,
  /**
   * The Career Record EventStore — `postgresEventStore(pool)` in production,
   * `memoryStore()` in development. OPTIONAL: without it a student workspace still
   * opens with its commercial frame and an honestly empty history, rather than
   * failing. It is the Record's own store interface, not a new abstraction.
   */
  record = null,
  secret,
  teamMemberIds = async () => [],
  revoked = new Set(),
  logger = createLogger(),
  metrics = createMetrics(),
  counterStore = memoryCounterStore(),
  cors = {},
  now = () => new Date(),
} = {}) {
  if (!crm) throw new InternalError("createOpsDependencies: a CRM port is required");
  if (!secret) throw new InternalError("createOpsDependencies: a token signing secret is required");

  return {
    crm,
    record,
    secret,
    revoked,
    logger,
    metrics,
    /**
     * The allowed methods are DERIVED from the router, not hardcoded.
     *
     * The shared CORS helper defaults to GET/POST/OPTIONS, which silently blocked
     * every PATCH in a real browser — the preflight answered 204 while omitting
     * PATCH from access-control-allow-methods, so the request never left the page.
     * Node's fetch does not enforce CORS, so no integration test could catch it.
     * Deriving the list means adding a route can never again outrun its preflight.
     */
    cors: { methods: OPS_HTTP_METHODS, ...cors },
    now,
    teamMemberIds,
    verifyToken,
    validateInput,
    rateLimiter: createRateLimiter(counterStore),
  };
}

export function createOpsRouter() {
  assertContractComplete();
  return new Router(routes);
}

/** node:http server — used by integration tests and container runs. */
export function createOpsServer(config) {
  return createServer(createOpsRouter(), createOpsDependencies(config));
}

/** Catalyst Advanced I/O entry point. */
export function createCatalystOpsApi(config) {
  return catalystHandler(createOpsRouter(), createOpsDependencies(config));
}

/**
 * Development harness: an in-memory CRM so the console can be exercised end to end
 * with no Zoho credentials and no risk of writing test rows into the live org.
 */
export function createDevOpsApi({ secret, seed = {}, cors = {} } = {}) {
  return createOpsServer({ crm: memoryCrmPort(seed), secret, cors });
}

export { contract, API_VERSION };
