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

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Retry an async op that THROWS on transient failure. `shouldRetry(err)` decides
 * (default: always). delayMs grows linearly. Returns the op's value or rethrows
 * the last error. Deterministic in tests via delayMs: 0.
 */
export async function retryAsync(fn, { tries = 3, delayMs = 400, shouldRetry = () => true, onRetry } = {}) {
  let last;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      last = err;
      if (attempt >= tries || !shouldRetry(err)) break;
      if (onRetry) onRetry(err, attempt);
      if (delayMs) await sleep(delayMs * attempt);
    }
  }
  throw last;
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
