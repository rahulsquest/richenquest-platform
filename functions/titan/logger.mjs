/**
 * Structured logging + metrics for the Titan automation engine.
 *
 * One JSON line per event so logs are greppable and machine-parseable in
 * Catalyst. Never logs PII: student names, emails and phone numbers stay in
 * CRM. Record IDs are safe (they are opaque and useless without credentials)
 * and are what make an incident traceable.
 *
 * Metrics are counters/timers held in-process and flushed by the caller; in
 * Catalyst each invocation is short-lived, so the flush target (Cliq
 * #ops-alerts, or a metrics store) is injected rather than assumed.
 */

/** Fields that must never reach a log line, at any nesting depth. */
const PII_KEYS = new Set([
  "email", "Email", "phone", "Phone", "Mobile", "WhatsApp_Number",
  "Last_Name", "First_Name", "Full_Name", "full_name", "Secondary_Email",
]);

/** Recursively strip PII. Depth-capped so a cyclic/huge object cannot hang us. */
export function scrub(value, depth = 0) {
  if (depth > 6 || value == null) return value;
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1));
  if (typeof value !== "object") return value;
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (PII_KEYS.has(k)) { out[k] = "[redacted]"; continue; }
    out[k] = scrub(v, depth + 1);
  }
  return out;
}

export const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

export function createLogger({ level = "info", sink = console.log, clock = () => new Date().toISOString(), context = {} } = {}) {
  const threshold = LEVELS[level] ?? LEVELS.info;
  const emit = (lvl, msg, fields) => {
    if (LEVELS[lvl] < threshold) return;
    sink(JSON.stringify({ ts: clock(), level: lvl, msg, ...context, ...scrub(fields ?? {}) }));
  };
  return {
    debug: (m, f) => emit("debug", m, f),
    info: (m, f) => emit("info", m, f),
    warn: (m, f) => emit("warn", m, f),
    error: (m, f) => emit("error", m, f),
    /** Derive a logger carrying extra context (event id, tenant, handler). */
    child: (extra) => createLogger({ level, sink, clock, context: { ...context, ...extra } }),
  };
}

/** Minimal counter/timer registry. Flushed by the caller at end of invocation. */
export function createMetrics() {
  const counters = new Map();
  const timers = new Map();
  return {
    inc: (name, by = 1, tags = {}) => {
      const key = `${name}${Object.keys(tags).length ? "|" + JSON.stringify(tags) : ""}`;
      counters.set(key, (counters.get(key) ?? 0) + by);
    },
    time: (name, ms) => {
      const arr = timers.get(name) ?? [];
      arr.push(ms);
      timers.set(name, arr);
    },
    snapshot: () => ({
      counters: Object.fromEntries(counters),
      timers: Object.fromEntries([...timers].map(([k, v]) => [k, {
        count: v.length,
        // p95 on a sorted copy — cheap and sufficient at per-invocation volume.
        p95: v.slice().sort((a, b) => a - b)[Math.min(v.length - 1, Math.floor(v.length * 0.95))],
        max: Math.max(...v),
      }])),
    }),
  };
}
