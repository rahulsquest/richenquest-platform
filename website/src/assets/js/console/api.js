/**
 * Founder Operations API client.
 *
 * The one place the console talks to the operations service. Mirrors the
 * published contract in functions/ops/api/endpoints.mjs — if a route changes
 * there, this file is the single place that follows.
 *
 * Deliberately a separate client from the student dashboard's app/api.js: the two
 * speak to different services with different base paths and different failure
 * wording, and folding them together would mean one set of student-facing error
 * messages leaking into a staff tool, or the reverse.
 */

const API_PREFIX = "/v1/ops";

export class OpsError extends Error {
  constructor(code, message, { status = 0, retryable = false, issues = [] } = {}) {
    super(message);
    this.name = "OpsError";
    this.code = code;
    this.status = status;
    this.retryable = retryable;
    this.issues = issues;
  }

  /** Wording for an operator, who can act on the detail — unlike a student. */
  get userMessage() {
    if (this.code === "OFFLINE") return "Can't reach the operations service. Nothing was changed.";
    if (this.code === "TIMEOUT") return "The operations service didn't respond. Nothing was changed.";
    if (this.status === 403) return "Your role doesn't allow that.";
    if (this.status === 404) return "That record no longer exists.";
    if (this.status === 429) return "Too many requests — wait a moment.";
    if (this.status >= 500) return "The operations service hit a problem. Nothing was changed.";
    return this.message || "That didn't work.";
  }
}

export function createOpsApi({ baseUrl, getToken, onUnauthorized = () => {}, timeoutMs = 15_000, fetchImpl } = {}) {
  const doFetch = fetchImpl ?? globalThis.fetch?.bind(globalThis);
  if (!doFetch) throw new Error("createOpsApi: no fetch implementation available");

  async function request(method, path, { body = null, query = null } = {}) {
    const url = new URL(`${baseUrl}${API_PREFIX}${path}`);
    for (const [k, v] of Object.entries(query ?? {})) {
      if (v !== null && v !== undefined && v !== "") url.searchParams.set(k, String(v));
    }

    const token = getToken();
    const headers = { accept: "application/json" };
    if (token) headers.authorization = `Bearer ${token}`;
    if (body !== null) headers["content-type"] = "application/json";

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
      const aborted = err?.name === "AbortError";
      throw new OpsError(aborted ? "TIMEOUT" : "OFFLINE", aborted ? "Request timed out." : "Service unreachable.", {
        retryable: true,
      });
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
    const opsError = new OpsError(err.code ?? `HTTP_${response.status}`, err.message ?? "The request failed.", {
      status: response.status,
      retryable: Boolean(err.retryable),
      issues: Array.isArray(err.issues) ? err.issues : [],
    });
    if (response.status === 401) onUnauthorized(opsError);
    throw opsError;
  }

  const enc = encodeURIComponent;

  return {
    me: () => request("GET", "/me"),
    dashboard: () => request("GET", "/dashboard"),

    listLeads: ({ status = null, limit = 50 } = {}) => request("GET", "/leads", { query: { status, limit } }),
    getLead: (id) => request("GET", `/leads/${enc(id)}`),
    updateLead: (id, patch) => request("PATCH", `/leads/${enc(id)}`, { body: patch }),
    assignLead: (id, ownerId) => request("POST", `/leads/${enc(id)}/assign`, { body: { owner_id: ownerId } }),

    listStudents: ({ limit = 50 } = {}) => request("GET", "/students", { query: { limit } }),
    getStudent: (id) => request("GET", `/students/${enc(id)}`),  // the full six-module workspace

    listTasks: ({ include = null } = {}) => request("GET", "/tasks", { query: { include } }),
    createTask: (task) => request("POST", "/tasks", { body: task }),
    completeTask: (id) => request("POST", `/tasks/${enc(id)}/complete`),

    listCollaborators: ({ type = null, stage = null, limit = 100 } = {}) =>
      request("GET", "/collaborators", { query: { type, stage, limit } }),
    getCollaborator: (id) => request("GET", `/collaborators/${enc(id)}`),
    createCollaborator: (institution) => request("POST", "/collaborators", { body: institution }),
    updateCollaborator: (id, patch) => request("PATCH", `/collaborators/${enc(id)}`, { body: patch }),
    addCollaboratorContact: (id, contact) => request("POST", `/collaborators/${enc(id)}/contacts`, { body: contact }),
    addCollaboratorMeeting: (id, meeting) => request("POST", `/collaborators/${enc(id)}/meetings`, { body: meeting }),
    addCollaboratorOffering: (id, offering) => request("POST", `/collaborators/${enc(id)}/offerings`, { body: offering }),
    collaboratorRenewals: () => request("GET", "/collaborators/renewals"),

    analytics: ({ days = 30 } = {}) => request("GET", "/analytics", { query: { days } }),

    request,
  };
}
