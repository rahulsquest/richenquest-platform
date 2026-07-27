/**
 * Platform — typed error framework.
 *
 * Every failure in the system is one of these. No bare `Error`, no thrown strings.
 *
 * The property that matters most is the SPLIT between what the client is told and
 * what we record. A stack trace, a SQL fragment or a subject id in an HTTP body is
 * a disclosure; the same detail in an internal log is diagnostics. So every error
 * carries two messages and the transport layer can only reach the safe one.
 *
 * Each error declares:
 *   code            stable machine identifier — safe to branch on, safe to expose
 *   status          HTTP mapping
 *   retryable       may the caller try again unchanged?
 *   security        public | internal | sensitive | security_event
 *   audit           none | log | audit_event | alert
 *   clientMessage   what the caller may see
 *   message         what we record
 */

/** How much care the detail needs. Drives redaction and alerting. */
export const SECURITY = Object.freeze({
  PUBLIC: "public", // safe to expose verbatim
  INTERNAL: "internal", // ordinary operational detail
  SENSITIVE: "sensitive", // may touch PII; log with care, never return
  SECURITY_EVENT: "security_event", // someone tried something they should not
});

/** What must happen besides returning a response. */
export const AUDIT = Object.freeze({
  NONE: "none",
  LOG: "log",
  AUDIT_EVENT: "audit_event", // append an access.denied / equivalent event
  ALERT: "alert", // page a human
});

export class PlatformError extends Error {
  /**
   * @param {object} spec
   * @param {string} spec.code
   * @param {string} spec.message        internal, may contain detail
   * @param {string} [spec.clientMessage] what the caller sees; defaults to a generic line
   */
  constructor({
    code,
    message,
    clientMessage,
    status = 500,
    retryable = false,
    security = SECURITY.INTERNAL,
    audit = AUDIT.LOG,
    details = null,
    cause = null,
  }) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.status = status;
    this.retryable = retryable;
    this.security = security;
    this.audit = audit;
    // `details` is for logs and MAY contain sensitive values. It is never
    // serialised into a client response — see toResponse().
    this.details = details;
    this.clientMessage = clientMessage ?? defaultClientMessage(status);
    if (cause) this.cause = cause;
  }

  /** The only shape allowed to leave the process toward a caller. */
  toResponse() {
    return {
      error: {
        code: this.code,
        message: this.clientMessage,
        retryable: this.retryable,
      },
    };
  }

  /** The shape written to logs. Includes internals; never returned. */
  toLog() {
    return {
      code: this.code,
      name: this.name,
      status: this.status,
      retryable: this.retryable,
      security: this.security,
      audit: this.audit,
      message: this.message,
      details: this.details,
      cause: this.cause ? String(this.cause.message ?? this.cause) : null,
      stack: this.stack,
    };
  }

  get isSecurityEvent() {
    return this.security === SECURITY.SECURITY_EVENT;
  }
}

function defaultClientMessage(status) {
  if (status === 400) return "The request was not valid.";
  if (status === 401) return "Authentication is required.";
  if (status === 403) return "You do not have access to this.";
  if (status === 404) return "Not found.";
  if (status === 409) return "The resource changed while you were working. Reload and try again.";
  if (status === 422) return "The request could not be processed.";
  if (status === 429) return "Too many requests. Please slow down.";
  return "Something went wrong on our side.";
}

/* ------------------------------------------------------------ subtypes --- */

export class ValidationError extends PlatformError {
  /** @param {{field:string, rule:string, message:string}[]} issues */
  constructor(issues, message = "request failed validation") {
    super({
      code: "VALIDATION_FAILED",
      message: `${message}: ${issues.map((i) => `${i.field} ${i.rule}`).join(", ")}`,
      // Field-level feedback is the whole value of a 400, so it is client-safe —
      // provided validators never echo the offending value back (see validate.mjs).
      clientMessage: "The request was not valid.",
      status: 400,
      security: SECURITY.PUBLIC,
      audit: AUDIT.NONE,
      details: { issues },
    });
    this.issues = issues;
  }

  toResponse() {
    return { error: { ...super.toResponse().error, issues: this.issues } };
  }
}

export class AuthenticationError extends PlatformError {
  constructor(message, code = "UNAUTHENTICATED") {
    super({
      code,
      message,
      status: 401,
      security: SECURITY.SECURITY_EVENT,
      audit: AUDIT.LOG,
      // Never say WHICH part failed. "Bad signature" vs "expired" tells an
      // attacker whether they have a real token.
      clientMessage: "Authentication is required.",
    });
  }
}

export class AuthorisationError extends PlatformError {
  constructor(message, { subjectId = null, required = null } = {}) {
    super({
      code: "FORBIDDEN",
      message,
      status: 403,
      security: SECURITY.SECURITY_EVENT,
      audit: AUDIT.AUDIT_EVENT, // becomes an access.denied event in the record
      details: { subjectId, required },
      clientMessage: "You do not have access to this.",
    });
  }
}

/**
 * Used INSTEAD of 403 when confirming existence would itself leak.
 *
 * Asking for someone else's record returns 404, not 403: a 403 confirms the
 * record exists, which is enough to enumerate clients. The internal message and
 * the audit event still record what really happened.
 */
export class NotFoundError extends PlatformError {
  constructor(what, { concealing = null } = {}) {
    super({
      code: "NOT_FOUND",
      message: concealing ? `${what} not found (concealing: ${concealing})` : `${what} not found`,
      status: 404,
      security: concealing ? SECURITY.SECURITY_EVENT : SECURITY.INTERNAL,
      audit: concealing ? AUDIT.AUDIT_EVENT : AUDIT.LOG,
      clientMessage: "Not found.",
    });
  }
}

export class ConsentDenied extends PlatformError {
  constructor(decision) {
    super({
      code: `CONSENT_${decision.code}`,
      message: `consent refused for ${decision.purpose}: ${decision.reason}`,
      status: 403,
      security: SECURITY.SENSITIVE, // the reason can imply age or guardianship
      audit: AUDIT.AUDIT_EVENT,
      details: decision,
      // The reason IS shown here: a person must be able to fix their own consent.
      clientMessage: decision.reason,
    });
    this.decision = decision;
  }
}

export class ConflictError extends PlatformError {
  constructor(message, { currentSeq = null } = {}) {
    super({
      code: "CONFLICT",
      message,
      status: 409,
      retryable: true, // re-read and retry is the correct client behaviour
      security: SECURITY.INTERNAL,
      audit: AUDIT.LOG,
      details: { currentSeq },
      clientMessage: "The record changed while you were working. Reload and try again.",
    });
    this.currentSeq = currentSeq;
  }
}

export class InvariantError extends PlatformError {
  constructor(invariantCode, message) {
    super({
      code: `INVARIANT_${invariantCode}`,
      message,
      status: 422,
      security: SECURITY.INTERNAL,
      audit: AUDIT.AUDIT_EVENT,
      // Constitutional refusals are explained: a counsellor blocked by I3 needs
      // to know disclosure was missing, not receive a blank 422.
      clientMessage: message,
    });
    this.invariantCode = invariantCode;
  }
}

export class RateLimitError extends PlatformError {
  constructor({ retryAfterMs = 1000 } = {}) {
    super({
      code: "RATE_LIMITED",
      message: `rate limit exceeded; retry in ${retryAfterMs}ms`,
      status: 429,
      retryable: true,
      security: SECURITY.SECURITY_EVENT,
      audit: AUDIT.LOG,
      details: { retryAfterMs },
      clientMessage: "Too many requests. Please slow down.",
    });
    this.retryAfterMs = retryAfterMs;
  }
}

export class InternalError extends PlatformError {
  constructor(message, cause = null) {
    super({
      code: "INTERNAL",
      message,
      status: 500,
      retryable: true,
      security: SECURITY.INTERNAL,
      audit: AUDIT.ALERT,
      cause,
      clientMessage: "Something went wrong on our side.",
    });
  }
}

/* ------------------------------------------------------------- mapping --- */

/**
 * Normalise anything thrown into a PlatformError.
 *
 * Domain modules (log.mjs, policy.mjs, auth.mjs, vault.mjs) throw their own error
 * types on purpose — they must not depend on the platform. This is the single
 * place those become transportable, so an unmapped error can never reach a client
 * as a 500 with a stack trace.
 */
export function toPlatformError(err) {
  if (err instanceof PlatformError) return err;

  const code = err?.code;

  if (code === "SEQ_CONFLICT") return new ConflictError(err.message, { currentSeq: err.currentSeq });
  if (code === "CONCURRENT_APPEND") return new ConflictError(err.message);
  if (err?.name === "InvariantViolation") {
    return new InvariantError(code ?? "UNKNOWN", err.message);
  }
  if (err?.name === "AuthError") {
    return err.status === 403
      ? new AuthorisationError(err.message)
      : new AuthenticationError(err.message, code);
  }
  if (err?.name === "PermissionError") {
    // The operations permission model (functions/ops/permissions.mjs) stays free
    // of platform types for the same reason auth.mjs does, so its refusals are
    // mapped here. A refusal that arrived as a 500 would be indistinguishable
    // from a bug — and worse, would read as retryable.
    if (err.status === 401) return new AuthenticationError(err.message, code);
    if (err.status === 403) return new AuthorisationError(err.message);
    return new InternalError(err.message, err);
  }
  if (err?.name === "SubjectErased") {
    // Erasure is a legitimate terminal state, not a fault.
    return new NotFoundError("record", { concealing: "erased subject" });
  }
  if (err?.name === "VaultError") {
    return new InternalError(`vault: ${err.message}`, err);
  }
  if (err?.name === "ConsentError") {
    return new ValidationError([{ field: "purposes", rule: code ?? "invalid", message: err.message }]);
  }

  return new InternalError(err?.message ?? "unknown error", err);
}
