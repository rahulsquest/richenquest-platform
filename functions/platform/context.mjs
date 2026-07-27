/**
 * Platform — request context.
 *
 * Every request carries a complete execution context, and it is available anywhere
 * in the call stack WITHOUT being threaded through every function signature. That
 * is done with AsyncLocalStorage (node core, zero dependencies): the alternative —
 * passing a ctx argument everywhere — is the version that gets forgotten in one
 * helper and loses the correlation id exactly when an incident needs it.
 *
 * Identifiers:
 *   correlation_id  spans the whole user-visible operation, ACROSS services.
 *                   Inherited from an inbound header when present, so a dashboard
 *                   request and the record append it triggers share one id.
 *   request_id      this process handling this HTTP request. Never inherited.
 *   trace_id / span_id  distributed tracing (W3C traceparent compatible).
 *   session_id      the caller's session, from the token's jti.
 *   actor_id / subject_id  who is acting, and whose record is being acted on.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes } from "node:crypto";

const storage = new AsyncLocalStorage();

const hex = (bytes) => randomBytes(bytes).toString("hex");

/** W3C trace-context ids: 16-byte trace, 8-byte span. */
export const newTraceId = () => hex(16);
export const newSpanId = () => hex(8);
export const newRequestId = () => `req_${hex(8)}`;
export const newCorrelationId = () => `cor_${hex(8)}`;

/**
 * Parse an inbound `traceparent`. Malformed values are ignored rather than
 * rejected: a broken upstream header must never fail a request, it just means we
 * start a new trace.
 */
export function parseTraceparent(header) {
  if (typeof header !== "string") return null;
  const m = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/.exec(header.trim());
  if (!m) return null;
  if (m[1] === "0".repeat(32) || m[2] === "0".repeat(16)) return null; // all-zero is invalid
  return { traceId: m[1], parentSpanId: m[2], flags: m[3] };
}

export function toTraceparent({ trace_id, span_id }) {
  return `00-${trace_id}-${span_id}-01`;
}

/**
 * Build a context from an inbound request. Header names are lowercased by callers.
 */
export function createContext({ headers = {}, route = "unknown", method = "GET", ip = null, now = Date.now() } = {}) {
  const inbound = parseTraceparent(headers.traceparent);
  return Object.freeze({
    correlation_id: headers["x-correlation-id"] || newCorrelationId(),
    request_id: newRequestId(),
    trace_id: inbound?.traceId ?? newTraceId(),
    span_id: newSpanId(),
    parent_span_id: inbound?.parentSpanId ?? null,
    session_id: null,
    actor_id: null,
    actor_role: null,
    subject_id: null,
    route,
    method,
    ip,
    started_at: now,
    started_iso: new Date(now).toISOString(),
    /** Spans recorded during this request — the reconstructable execution path. */
    spans: [],
  });
}

/**
 * Run `fn` with `ctx` bound for the whole async subtree.
 *
 * The store holds a mutable CONTAINER whose `current` is an immutable context
 * snapshot. That indirection exists for a specific reason: `enterWith()` called
 * inside a nested async callback does NOT reliably propagate back to the caller's
 * continuation, so enrichment performed in one pipeline stage was invisible to the
 * next. The container is shared by reference, so a snapshot swap is seen
 * everywhere, while each snapshot stays frozen against concurrent mutation.
 */
export function withContext(ctx, fn) {
  return storage.run({ current: ctx }, fn);
}

/** Current context, or null outside a request. Never throws — logging must not. */
export function currentContext() {
  return storage.getStore()?.current ?? null;
}

/**
 * Attach identity once authentication has resolved it.
 *
 * Replaces the snapshot rather than mutating it: a context that can be mutated in
 * place is a context that can be mutated by the wrong request under concurrency.
 */
export function enrichContext(patch) {
  const container = storage.getStore();
  if (!container) return null;
  container.current = Object.freeze({ ...container.current, ...patch, spans: container.current.spans });
  return container.current;
}

/**
 * Record a stage of execution. Given a correlation id, the ordered spans
 * reconstruct the complete path — which is the observability requirement.
 */
export function span(name, { ok = true, error = null, meta = null, durationMs = null } = {}) {
  const ctx = currentContext();
  if (!ctx) return null;
  const entry = {
    name,
    span_id: newSpanId(),
    at: Date.now(),
    duration_ms: durationMs,
    ok,
    error: error ? { code: error.code ?? null, name: error.name ?? null } : null,
    meta,
  };
  ctx.spans.push(entry);
  return entry;
}

/** Time an async stage and record it as a span, propagating any failure. */
export async function timeSpan(name, fn, meta = null) {
  const started = Date.now();
  try {
    const result = await fn();
    span(name, { ok: true, durationMs: Date.now() - started, meta });
    return result;
  } catch (err) {
    span(name, { ok: false, error: err, durationMs: Date.now() - started, meta });
    throw err;
  }
}

/** Milliseconds since the request began. */
export function elapsed() {
  const ctx = currentContext();
  return ctx ? Date.now() - ctx.started_at : 0;
}

/** The identifiers every log line and outbound call should carry. */
export function contextFields(ctx = currentContext()) {
  if (!ctx) return {};
  return {
    correlation_id: ctx.correlation_id,
    request_id: ctx.request_id,
    trace_id: ctx.trace_id,
    span_id: ctx.span_id,
    session_id: ctx.session_id,
    actor_id: ctx.actor_id,
    actor_role: ctx.actor_role,
    subject_id: ctx.subject_id,
    route: ctx.route,
  };
}

/** Headers to forward so a downstream service joins the same trace. */
export function outboundHeaders(ctx = currentContext()) {
  if (!ctx) return {};
  return {
    "x-correlation-id": ctx.correlation_id,
    traceparent: toTraceparent(ctx),
  };
}

/**
 * The execution path for an incident review. Ordered stages with timings and the
 * point of failure — answering "what happened to correlation id X".
 */
export function executionPath(ctx = currentContext()) {
  if (!ctx) return null;
  return {
    correlation_id: ctx.correlation_id,
    request_id: ctx.request_id,
    route: ctx.route,
    method: ctx.method,
    actor_id: ctx.actor_id,
    subject_id: ctx.subject_id,
    started: ctx.started_iso,
    total_ms: Date.now() - ctx.started_at,
    stages: ctx.spans.map((s) => ({
      name: s.name,
      ok: s.ok,
      duration_ms: s.duration_ms,
      error: s.error?.code ?? null,
    })),
    failed_at: ctx.spans.find((s) => !s.ok)?.name ?? null,
  };
}
