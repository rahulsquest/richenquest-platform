/**
 * Small fetch helpers shared by the OAuth layer and API clients.
 * Zero dependencies — native fetch + AbortController (Node ≥ 20 / Catalyst).
 */

export class ZohoError extends Error {
  constructor(message, { status, code, service } = {}) {
    super(message);
    this.name = "ZohoError";
    this.status = status;
    this.code = code;
    this.service = service;
  }
}

const DEFAULT_TIMEOUT_MS = 15000;

/** fetch with a hard timeout so a hung Zoho call can never wedge a function. */
export async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === "AbortError") {
      throw new ZohoError(`Request timed out after ${timeoutMs}ms`, { code: "timeout" });
    }
    throw new ZohoError(`Network error: ${err.message}`, { code: "network" });
  } finally {
    clearTimeout(timer);
  }
}

/** Parses a response as JSON, tolerating empty bodies. */
export async function parseJson(res) {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}
