/**
 * Platform — structured logging.
 *
 * One line per event, JSON, machine-readable. No string interpolation, no
 * `console.log("thing: " + value)`.
 *
 * REDACTION IS THE POINT, not a nicety. This system holds passports, financials
 * and counselling notes, and the vault exists so that data is encrypted at rest.
 * A log line that prints it in plaintext defeats the vault entirely — logs are
 * copied to aggregators, screenshotted into tickets and kept far longer than
 * anyone intends. So redaction is applied to every value on the way out, by key
 * name AND by value shape, and it cannot be switched off per call.
 */

import { contextFields, currentContext, elapsed } from "./context.mjs";

export const LEVELS = Object.freeze({ debug: 10, info: 20, warn: 30, error: 40 });

/** Keys whose values are never logged, at any depth. */
const REDACT_KEYS = new Set([
  "password", "passcode", "pin", "secret", "token", "access_token", "refresh_token",
  "authorization", "cookie", "set-cookie", "api_key", "apikey", "kek", "dek", "key",
  "legal_name", "name", "first_name", "last_name", "full_name",
  "email", "phone", "mobile", "address", "dob", "date_of_birth",
  "passport", "passport_number", "aadhaar", "pan", "ssn", "national_id",
  "iv", "ct", "tag", "ciphertext", "envelope",
  "notes", "note", "counselling_note", "financials", "bank_account",
]);

/** Value shapes that are PII regardless of the key they arrive under. */
const VALUE_PATTERNS = [
  { name: "email", re: /\b[\w.+-]+@[\w-]+\.[\w.-]{2,}\b/g },
  { name: "jwt", re: /\brq1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g },
  { name: "bearer", re: /\bBearer\s+[A-Za-z0-9._-]+/gi },
  // Indian mobile / long digit runs that are plausibly identifiers.
  { name: "phone", re: /\b(?:\+91[-\s]?)?[6-9]\d{9}\b/g },
  { name: "passport", re: /\b[A-PR-WY][0-9]{7}\b/g },
];

const MAX_STRING = 512;
const MAX_DEPTH = 6;

export function redactValue(value) {
  if (typeof value !== "string") return value;
  let out = value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…[truncated]` : value;
  for (const { name, re } of VALUE_PATTERNS) out = out.replace(re, `[redacted:${name}]`);
  return out;
}

export function redact(input, depth = 0) {
  if (input === null || input === undefined) return input;
  if (depth > MAX_DEPTH) return "[redacted:depth]";
  if (typeof input === "string") return redactValue(input);
  if (typeof input !== "object") return input;
  if (input instanceof Date) return input.toISOString();
  if (Array.isArray(input)) return input.slice(0, 50).map((v) => redact(v, depth + 1));

  const out = {};
  for (const [k, v] of Object.entries(input)) {
    if (REDACT_KEYS.has(k.toLowerCase())) {
      // Keep the key so the shape stays debuggable; drop the value entirely.
      out[k] = "[redacted]";
      continue;
    }
    out[k] = redact(v, depth + 1);
  }
  return out;
}

/**
 * @param {{ level?: keyof LEVELS, sink?: (line: string) => void, service?: string }} [opts]
 */
export function createLogger({ level = "info", sink = (line) => process.stdout.write(line + "\n"), service = "career-record" } = {}) {
  const threshold = LEVELS[level] ?? LEVELS.info;

  function emit(lvl, msg, fields) {
    if (LEVELS[lvl] < threshold) return null;
    const line = {
      ts: new Date().toISOString(),
      level: lvl,
      service,
      msg,
      ...contextFields(),
      ...redact(fields ?? {}),
    };
    const serialised = JSON.stringify(line);
    sink(serialised);
    return line;
  }

  return {
    debug: (msg, fields) => emit("debug", msg, fields),
    info: (msg, fields) => emit("info", msg, fields),
    warn: (msg, fields) => emit("warn", msg, fields),
    error: (msg, fields) => emit("error", msg, fields),

    /**
     * The completion line for a request. This is the record that answers "what
     * happened, to whom, how long did it take, and was it allowed".
     */
    request({ status, error = null, eventId = null, securityOutcome = "allowed", extra = null }) {
      const ctx = currentContext();
      return emit(error ? "warn" : "info", "request.completed", {
        status,
        duration_ms: elapsed(),
        result: error ? "failure" : "success",
        security_outcome: securityOutcome,
        error_code: error?.code ?? null,
        event_id: eventId,
        stages: ctx?.spans.map((s) => s.name) ?? [],
        failed_stage: ctx?.spans.find((s) => !s.ok)?.name ?? null,
        ...(extra ?? {}),
      });
    },

    /** A refusal. Always logged, never at debug, because these are the interesting ones. */
    security(msg, err, fields = null) {
      return emit("warn", msg, {
        security_outcome: "denied",
        ...(err ? { error: err.toLog ? err.toLog() : { message: String(err) } } : {}),
        ...(fields ?? {}),
      });
    },
  };
}

/** Default process logger. Level from env so production can quieten debug. */
export const log = createLogger({ level: process.env.LOG_LEVEL ?? "info" });
