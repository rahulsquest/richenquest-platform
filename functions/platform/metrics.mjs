/**
 * Platform — metrics instrumentation.
 *
 * Instrumentation only, no dashboards (founder directive). The registry exposes a
 * Prometheus-compatible text format so a scraper can be pointed at it later
 * without touching call sites.
 *
 * Latency uses explicit histogram buckets rather than an average, because an
 * average request time hides the thing that matters: the slowest 1% is what a
 * student actually experiences when their visa deadline is tomorrow.
 *
 * CARDINALITY DISCIPLINE: label values must be bounded. `route` is a template
 * (`/v1/records/:id/timeline`), never a concrete path, and subject_id / actor_id
 * are NEVER labels — that would create one time series per person and both blow
 * up the store and leak who our clients are.
 */

const LATENCY_BUCKETS_MS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10_000];

const LABEL_VALUE = /^[A-Za-z0-9_:./-]{1,64}$/;

/**
 * Coerce a data-derived string into a bounded label value.
 * Array indices are removed rather than escaped: `evidence[0].ref` and
 * `evidence[7].ref` are the same problem and must not be two time series.
 */
export function sanitiseLabel(value) {
  return (
    String(value ?? "unknown")
      .replace(/\[\d+\]/g, "")
      .replace(/[^A-Za-z0-9_:./-]/g, "_")
      .slice(0, 64) || "unknown"
  );
}

export function createMetrics() {
  const counters = new Map(); // name|labels → number
  const histograms = new Map(); // name|labels → {buckets:number[], sum, count}

  const keyFor = (name, labels) => {
    const parts = Object.entries(labels ?? {})
      .filter(([, v]) => v !== undefined && v !== null)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, v]) => {
        const value = String(v);
        // Reject unbounded values loudly in development rather than silently
        // creating millions of series in production.
        if (!LABEL_VALUE.test(value)) {
          throw new Error(`metrics: label ${k}="${value}" is not a bounded label value`);
        }
        return `${k}=${value}`;
      })
      .join(",");
    return `${name}{${parts}}`;
  };

  function increment(name, labels = {}, by = 1) {
    const k = keyFor(name, labels);
    counters.set(k, (counters.get(k) ?? 0) + by);
    return counters.get(k);
  }

  function observe(name, ms, labels = {}) {
    const k = keyFor(name, labels);
    let h = histograms.get(k);
    if (!h) {
      h = { buckets: new Array(LATENCY_BUCKETS_MS.length + 1).fill(0), sum: 0, count: 0 };
      histograms.set(k, h);
    }
    let i = LATENCY_BUCKETS_MS.findIndex((b) => ms <= b);
    if (i === -1) i = LATENCY_BUCKETS_MS.length; // +Inf
    h.buckets[i] += 1;
    h.sum += ms;
    h.count += 1;
    return h;
  }

  return {
    increment,
    observe,

    /* ---- the metrics the founder asked for, as named helpers so call sites
            cannot invent inconsistent names ---- */

    requestStarted: (route, method) => increment("requests_total", { route, method }),
    requestCompleted: (route, method, status, ms) => {
      increment("requests_completed_total", { route, method, status: String(status) });
      observe("request_duration_ms", ms, { route, method });
    },
    requestFailed: (route, code) => increment("request_failures_total", { route, code }),
    permissionDenied: (route, role) => increment("permission_failures_total", { route, role }),
    /**
     * Field names come from DATA (a validation issue), not from a hand-written
     * call site, so they are sanitised rather than rejected. `evidence[0].ref`
     * becomes `evidence.ref`: the array index is dropped because it is unbounded
     * cardinality, and the strict guard on increment() stays in place for labels a
     * developer types. Throwing here once crashed the error handler itself and
     * turned a clean 400 into a 500.
     */
    validationFailed: (route, field) => increment("validation_failures_total", { route, field: sanitiseLabel(field) }),
    consentDenied: (route, code) => increment("consent_failures_total", { route, code }),
    rateLimited: (route) => increment("rate_limited_total", { route }),
    eventAppended: (type) => increment("events_appended_total", { type }),
    recommendationIssued: (byAiSuggestion) =>
      increment("recommendations_total", { ai_assisted: String(Boolean(byAiSuggestion)) }),
    aiSuggestion: (outcome) => increment("ai_suggestions_total", { outcome }),
    stageDuration: (stage, ms) => observe("stage_duration_ms", ms, { stage }),

    snapshot() {
      return {
        counters: Object.fromEntries(counters),
        histograms: Object.fromEntries(
          [...histograms].map(([k, h]) => [k, { count: h.count, sum: h.sum, buckets: [...h.buckets] }])
        ),
      };
    },

    /** Prometheus text exposition. No dependency, no server — a scraper target later. */
    toPrometheus() {
      const lines = [];
      for (const [k, v] of counters) lines.push(`${k} ${v}`);
      for (const [k, h] of histograms) {
        const [name, labelPart = "}"] = k.split("{");
        const labels = labelPart.slice(0, -1);
        let cumulative = 0;
        LATENCY_BUCKETS_MS.forEach((b, i) => {
          cumulative += h.buckets[i];
          lines.push(`${name}_bucket{${labels}${labels ? "," : ""}le="${b}"} ${cumulative}`);
        });
        cumulative += h.buckets[LATENCY_BUCKETS_MS.length];
        lines.push(`${name}_bucket{${labels}${labels ? "," : ""}le="+Inf"} ${cumulative}`);
        lines.push(`${name}_sum{${labels}} ${h.sum}`);
        lines.push(`${name}_count{${labels}} ${h.count}`);
      }
      return lines.join("\n") + "\n";
    },

    reset() {
      counters.clear();
      histograms.clear();
    },
  };
}

export const metrics = createMetrics();
export { LATENCY_BUCKETS_MS };
