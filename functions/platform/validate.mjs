/**
 * Platform — validation framework.
 *
 * Five kinds of validation, one failure shape. Input, permission, business rule,
 * evidence and disclosure all produce the same `{field, rule, message}` issue, so
 * a caller never has to learn five error formats.
 *
 * RULE: an issue message never echoes the offending VALUE. Validation errors are
 * returned to clients, and a message like `email "aarav@example.com" is invalid`
 * turns a 400 into a data leak — including in server logs, aggregators and
 * screenshots. Messages describe the rule, never the input.
 */

import { ValidationError } from "./errors.mjs";

/* --------------------------------------------------------- input schema --- */

export const t = {
  string: ({ min = 0, max = 4096, pattern = null, enum: allowed = null } = {}) => (v) => {
    if (typeof v !== "string") return "must be a string";
    if (v.length < min) return `must be at least ${min} characters`;
    if (v.length > max) return `must be at most ${max} characters`;
    if (pattern && !pattern.test(v)) return "is not in the expected format";
    if (allowed && !allowed.includes(v)) return `must be one of: ${allowed.join(", ")}`;
    return null;
  },

  integer: ({ min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) => (v) => {
    if (!Number.isInteger(v)) return "must be an integer";
    if (v < min) return `must be at least ${min}`;
    if (v > max) return `must be at most ${max}`;
    return null;
  },

  boolean: () => (v) => (typeof v === "boolean" ? null : "must be a boolean"),

  isoDate: () => (v) => {
    if (typeof v !== "string") return "must be an ISO 8601 string";
    const parsed = Date.parse(v);
    if (Number.isNaN(parsed)) return "must be a valid ISO 8601 date";
    return null;
  },

  /** Not in the future — used for occurred_at, matching invariant I10. */
  pastOrNow: ({ skewMs = 60_000 } = {}) => (v) => {
    const err = t.isoDate()(v);
    if (err) return err;
    if (Date.parse(v) > Date.now() + skewMs) return "must not be in the future";
    return null;
  },

  array: (each, { min = 0, max = 500 } = {}) => (v) => {
    if (!Array.isArray(v)) return "must be an array";
    if (v.length < min) return `must contain at least ${min} item(s)`;
    if (v.length > max) return `must contain at most ${max} items`;
    for (const item of v) {
      const err = each(item);
      if (err) return `contains an item that ${err}`;
    }
    return null;
  },

  object: (shape) => (v) => {
    if (v === null || typeof v !== "object" || Array.isArray(v)) return "must be an object";
    for (const [key, check] of Object.entries(shape)) {
      const err = check(v[key]);
      if (err) return `has an invalid "${key}" (${err})`;
    }
    return null;
  },

  optional: (check) => (v) => (v === undefined || v === null ? null : check(v)),

  /** Reference syntax from the architecture: `dest:germany@2026-07-19`, `claim:x`, `doc:y@v2`. */
  reference: () => (v) => {
    if (typeof v !== "string") return "must be a string reference";
    if (!/^(dest|claim|doc|usr|partner|sub):[A-Za-z0-9_.-]+(@[A-Za-z0-9_.:-]+)?$/.test(v)) {
      return "must be a reference like kind:id or kind:id@version";
    }
    return null;
  },

  subjectId: () => t.string({ min: 3, max: 64, pattern: /^sub_[A-Za-z0-9_-]+$/ }),
};

/**
 * Validate a payload against a schema.
 *
 * Unknown keys are an ERROR, not ignored: silently dropping an unrecognised field
 * means a client that misspells `disclosure` gets a recommendation appended
 * without one, and the invariant fires far from the cause.
 */
export function validateInput(payload, schema, { where = "body", allowUnknown = false } = {}) {
  const issues = [];
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw new ValidationError([{ field: where, rule: "type", message: "must be an object" }]);
  }

  for (const [field, check] of Object.entries(schema)) {
    const err = check(payload[field]);
    if (err) issues.push({ field, rule: "invalid", message: err });
  }

  if (!allowUnknown) {
    for (const key of Object.keys(payload)) {
      if (!(key in schema)) {
        issues.push({ field: key, rule: "unknown", message: "is not an accepted field" });
      }
    }
  }

  if (issues.length) throw new ValidationError(issues);
  return payload;
}

/* ------------------------------------------------------------ evidence --- */

/**
 * Evidence validation — Constitution 6.3.
 *
 * Checks shape and, when a resolver is supplied, that every reference actually
 * RESOLVES. An evidence array full of references to nothing is worse than an
 * empty one: it looks like diligence.
 */
export async function validateEvidence(evidence, { required = true, resolver = null } = {}) {
  const issues = [];

  if (!Array.isArray(evidence) || evidence.length === 0) {
    if (required) issues.push({ field: "evidence", rule: "required", message: "at least one evidence reference is required" });
    if (issues.length) throw new ValidationError(issues);
    return [];
  }

  evidence.forEach((item, i) => {
    const shapeErr = t.object({
      ref: t.reference(),
      kind: t.string({ min: 2, max: 64 }),
      hash: t.optional(t.string({ min: 8, max: 128 })),
    })(item);
    if (shapeErr) issues.push({ field: `evidence[${i}]`, rule: "invalid", message: shapeErr });
  });

  if (issues.length) throw new ValidationError(issues);

  if (resolver) {
    for (const [i, item] of evidence.entries()) {
      const resolved = await resolver(item.ref);
      if (!resolved) {
        issues.push({ field: `evidence[${i}].ref`, rule: "unresolvable", message: "does not resolve to a known record" });
        continue;
      }
      // A pinned hash that no longer matches means the evidence changed under us.
      if (item.hash && resolved.hash && item.hash !== resolved.hash) {
        issues.push({
          field: `evidence[${i}].hash`,
          rule: "stale",
          message: "does not match the current version of the referenced evidence",
        });
      }
    }
  }

  if (issues.length) throw new ValidationError(issues);
  return evidence;
}

/* ---------------------------------------------------------- disclosure --- */

/**
 * Disclosure validation — Constitution 5.4.
 *
 * A recommendation must carry disclosure that was actually SHOWN, sourced from the
 * register. A hand-written disclosure string is refused: the whole point is that
 * disclosure text cannot drift from the register.
 */
export function validateDisclosure(disclosure, { register = null, required = true } = {}) {
  const issues = [];

  if (!disclosure) {
    if (required) issues.push({ field: "disclosure", rule: "required", message: "disclosure is required for this action" });
    if (issues.length) throw new ValidationError(issues);
    return null;
  }

  if (disclosure.shown !== true) {
    issues.push({ field: "disclosure.shown", rule: "must_be_true", message: "disclosure must have been shown to the individual" });
  }
  if (!disclosure.register_version) {
    issues.push({ field: "disclosure.register_version", rule: "required", message: "must record which register version was shown" });
  }
  if (!Array.isArray(disclosure.statements) || disclosure.statements.length === 0) {
    issues.push({ field: "disclosure.statements", rule: "required", message: "must record the statements shown" });
  }

  if (register) {
    if (disclosure.register_version !== register.last_reviewed) {
      issues.push({
        field: "disclosure.register_version",
        rule: "stale",
        message: "is not the current disclosure register version",
      });
    }
    const known = new Set([
      register.no_relationship_statement,
      ...(register.relationships ?? []).map((r) => `${register.relationship_statement_prefix} ${r.counterparty}.`),
    ]);
    for (const [i, s] of (disclosure.statements ?? []).entries()) {
      if (!known.has(s)) {
        issues.push({
          field: `disclosure.statements[${i}]`,
          rule: "not_from_register",
          message: "is not a statement from the disclosure register",
        });
      }
    }
  }

  if (issues.length) throw new ValidationError(issues);
  return disclosure;
}

/* ------------------------------------------------------- business rules --- */

/**
 * Compose business rules. Each returns null or an issue. All are evaluated so the
 * caller sees every problem at once rather than fixing them one round trip at a time.
 */
export function validateRules(subject, rules) {
  const issues = rules.map((rule) => rule(subject)).filter(Boolean);
  if (issues.length) throw new ValidationError(issues, "business rules failed");
  return subject;
}

export const rule = {
  required: (field) => (o) =>
    o?.[field] === undefined || o?.[field] === null
      ? { field, rule: "required", message: "is required" }
      : null,

  mutuallyExclusive: (a, b) => (o) =>
    o?.[a] != null && o?.[b] != null
      ? { field: `${a}+${b}`, rule: "mutually_exclusive", message: "may not both be provided" }
      : null,

  requiredIf: (field, when) => (o) =>
    when(o) && (o?.[field] === undefined || o?.[field] === null)
      ? { field, rule: "conditionally_required", message: "is required for this kind of request" }
      : null,
};
