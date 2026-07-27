/**
 * Career Record API client.
 *
 * The one place the browser talks to the Record. Mirrors the published contract
 * in functions/record/api/endpoints.mjs — if a path or a field changes there,
 * this file is the single place that follows.
 *
 * DELIBERATE CONSTRAINTS
 * · Only headers the API's CORS policy allows are sent: content-type,
 *   authorization, x-correlation-id, traceparent. Notably NOT idempotency-key —
 *   the append endpoint takes `idempotency_key` in the body instead, and sending
 *   the header would fail preflight rather than fail loudly.
 * · No cookies. Authentication is a bearer token, so nothing is attached to a
 *   request the page did not make on purpose, and CSRF does not arise.
 * · There is no offline cache and no fallback dataset. A failed read is reported
 *   as a failed read.
 */

const API_PREFIX = "/v1/career-records";

/** An error the UI can explain, carrying the API's own code where there is one. */
export class ApiError extends Error {
  constructor(code, message, { status = 0, retryable = false, issues = [], correlationId = null } = {}) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.retryable = retryable;
    this.issues = issues;
    this.correlationId = correlationId;
  }

  /** Wording for a student, not for an operator. */
  get userMessage() {
    if (this.code === "OFFLINE") return "You appear to be offline. Your record is unchanged.";
    if (this.code === "TIMEOUT") return "The record service did not respond in time. Nothing was changed.";
    if (this.status === 403) return "This account cannot see that part of the record.";
    if (this.status === 404) return "That part of the record does not exist.";
    if (this.status === 409) return "Someone else wrote to your record at the same moment. Try again.";
    if (this.status === 429) return "Too many requests. Please wait a moment and try again.";
    if (this.status >= 500) return "The record service is having a problem. Nothing was changed.";
    return this.message || "The request could not be completed.";
  }
}

const correlationId = () => {
  try {
    return globalThis.crypto?.randomUUID?.() ?? null;
  } catch {
    return null;
  }
};

/**
 * @param {object} opts
 * @param {string}   opts.baseUrl        API origin, no trailing slash
 * @param {Function} opts.getToken       () => string|null
 * @param {Function} [opts.onUnauthorized] called on 401 so the app can re-gate
 * @param {number}   [opts.timeoutMs]
 */
export function createRecordApi({ baseUrl, getToken, onUnauthorized = () => {}, timeoutMs = 15_000, fetchImpl } = {}) {
  const doFetch = fetchImpl ?? globalThis.fetch?.bind(globalThis);
  if (!doFetch) throw new Error("createRecordApi: no fetch implementation available");

  async function request(method, path, { body = null, query = null, retryOn429 = true } = {}) {
    const url = new URL(`${baseUrl}${API_PREFIX}${path}`);
    for (const [k, v] of Object.entries(query ?? {})) {
      if (v !== null && v !== undefined && v !== "") url.searchParams.set(k, String(v));
    }

    const token = getToken();
    const headers = { accept: "application/json" };
    if (token) headers.authorization = `Bearer ${token}`;
    if (body !== null) headers["content-type"] = "application/json";
    const cid = correlationId();
    if (cid) headers["x-correlation-id"] = cid;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response;
    try {
      response = await doFetch(url.toString(), {
        method,
        headers,
        body: body === null ? undefined : JSON.stringify(body),
        signal: controller.signal,
        credentials: "omit",
        mode: "cors",
        redirect: "error",
      });
    } catch (err) {
      // An aborted request and a dead network are different problems for the
      // reader, so they are not collapsed into one message.
      const aborted = err?.name === "AbortError";
      throw new ApiError(
        aborted ? "TIMEOUT" : "OFFLINE",
        aborted ? "The request timed out." : "The record service could not be reached.",
        { retryable: true, correlationId: cid }
      );
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 204) return null;

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (response.ok) return payload;

    const err = payload?.error ?? {};
    const apiError = new ApiError(err.code ?? `HTTP_${response.status}`, err.message ?? "The request failed.", {
      status: response.status,
      retryable: Boolean(err.retryable),
      issues: Array.isArray(err.issues) ? err.issues : [],
      correlationId: response.headers?.get?.("x-correlation-id") ?? cid,
    });

    if (response.status === 401) {
      onUnauthorized(apiError);
      throw apiError;
    }

    // One automatic retry, only for a limit the server told us how long to wait
    // for. Anything else is surfaced — silently retrying a write is how a record
    // gains duplicate entries.
    if (response.status === 429 && retryOn429 && method === "GET") {
      const retryAfter = Number.parseInt(response.headers?.get?.("retry-after") ?? "", 10);
      const waitMs = Math.min(Number.isFinite(retryAfter) ? retryAfter * 1000 : 1000, 5000);
      await new Promise((r) => setTimeout(r, waitMs));
      return request(method, path, { body, query, retryOn429: false });
    }

    throw apiError;
  }

  const enc = encodeURIComponent;

  return {
    /** GET /:subject_id — summary, consent state, chain head. */
    getRecord: (subjectId) => request("GET", `/${enc(subjectId)}`),

    /** GET /:subject_id/timeline — the product. `asOf` reconstructs a past view. */
    getTimeline: (subjectId, { asOf = null } = {}) =>
      request("GET", `/${enc(subjectId)}/timeline`, { query: { as_of: asOf } }),

    /** GET /:subject_id/events/:event_id — one event in full. */
    getEvent: (subjectId, eventId) => request("GET", `/${enc(subjectId)}/events/${enc(eventId)}`),

    /** GET /:subject_id/verify — chain integrity, with failures in full. */
    verifyRecord: (subjectId) => request("GET", `/${enc(subjectId)}/verify`),

    /**
     * POST /:subject_id/events — append. Every dashboard write goes through here
     * and becomes a permanent, attributed entry; there is no update and no delete.
     */
    appendEvent: (subjectId, event) => request("POST", `/${enc(subjectId)}/events`, { body: event }),

    /** POST /:subject_id/export — the record leaves with the person. */
    exportRecord: (subjectId, { includeDocuments = false } = {}) =>
      request("POST", `/${enc(subjectId)}/export`, { body: { include_documents: includeDocuments } }),

    request,
  };
}
