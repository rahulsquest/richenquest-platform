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
 * Format an epoch-ms as a Zoho datetime literal `YYYY-MM-DDTHH:mm:ss±HH:MM`.
 * Zoho rejects `.toISOString()` (the `Z`/millisecond form) with INVALID_DATA on
 * datetime fields — both COQL `Modified_Time` filters and `actions/watch`
 * `channel_expiry` need an explicit offset and no milliseconds. Default offset
 * is India (+05:30, no DST).
 */
export function toZohoDateTime(ms, offsetMinutes = 330) {
  const shifted = new Date(ms + offsetMinutes * 60_000);
  const p = (n) => String(n).padStart(2, "0");
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const oh = Math.floor(Math.abs(offsetMinutes) / 60);
  const om = Math.abs(offsetMinutes) % 60;
  return `${shifted.getUTCFullYear()}-${p(shifted.getUTCMonth() + 1)}-${p(shifted.getUTCDate())}` +
    `T${p(shifted.getUTCHours())}:${p(shifted.getUTCMinutes())}:${p(shifted.getUTCSeconds())}${sign}${p(oh)}:${p(om)}`;
}

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
