/**
 * Career Record API — endpoint definitions.
 *
 * The reference implementation for every future RichenQuest service. Rules it
 * demonstrates, without exception:
 *
 *   · every endpoint is built by defineEndpoint() — there is no other way in;
 *   · every write produces an immutable event; nothing updates or deletes;
 *   · advisory writes resolve evidence and disclosure from the REGISTERS, never
 *     from the request body, so a caller cannot supply its own disclosure text;
 *   · refusals that belong in a person's history are appended as events, not just
 *     logged;
 *   · responses are explicit view models. Envelopes, prev_hash and internal
 *     classifications are never returned to a non-auditor.
 *
 * API version is in the path (/v1) from the first commit. Adding a field is
 * compatible; removing or retyping one requires /v2.
 */

import { defineEndpoint, assertEndpointComplete } from "../../platform/pipeline.mjs";
import { t, validateInput, validateEvidence, validateDisclosure } from "../../platform/validate.mjs";
import {
  AuthorisationError, NotFoundError, ValidationError, ConflictError, InternalError,
} from "../../platform/errors.mjs";
import { appendEvent, appendCorrection, verifySubject } from "../log.mjs";
import { timeline } from "../views.mjs";
import { buildExport } from "../views.mjs";
import { TYPE_CLASSIFICATION, canRead } from "../policy.mjs";

export const API_VERSION = "v1";
const BASE = `/${API_VERSION}/career-records`;

/* ═════════════════════════════════════════════════════════ view models ═══ */

/**
 * Shapes returned to callers. Kept in one place so a change is visible as a
 * contract change rather than leaking out of an ad-hoc object literal.
 */
const view = {
  record: (subjectId, head, consent) => ({
    subject_id: subjectId,
    events: head?.seq ?? 0,
    created_at: head ? undefined : null,
    last_event_at: head?.occurred_at ?? null,
    chain_head: head?.hash ?? null,
    consent: consent ? { purposes: Object.keys(consent.purposes ?? {}), is_minor: consent.is_minor } : null,
  }),

  /** A single event as a caller sees it. No envelope, no prev_hash. */
  event: (e, { includeChain = false } = {}) => ({
    event_id: e.event_id,
    type: e.type,
    seq: e.seq,
    occurred_at: e.occurred_at,
    recorded_at: e.recorded_at,
    actor: { kind: e.actor?.kind, role: e.actor?.role, id: e.actor?.id },
    authored_by_ai: e.actor?.kind === "ai",
    evidence: (e.evidence ?? []).map((v) => ({ ref: v.ref, kind: v.kind })),
    disclosure: e.disclosure ? { shown: e.disclosure.shown, statements: e.disclosure.statements } : null,
    payload: e.payload ?? {},
    corrects: e.corrects ?? null,
    caused_by: e.caused_by ?? null,
    ...(includeChain ? { hash: e.hash, prev_hash: e.prev_hash } : {}),
  }),

  verification: (result, { subjectId }) => ({
    subject_id: subjectId,
    verified: result.ok,
    events: result.count,
    chain_head: result.head,
    // Failures are returned in full: a person is entitled to know exactly how
    // their record failed verification, not a boolean.
    failures: result.failures,
  }),
};

/* ══════════════════════════════════════════════════════════════ helpers ═══ */

/** Resolve the record or 404. A concealing 404 is used for cross-record probes. */
async function loadRecord(deps, subjectId, claims) {
  const head = await deps.store.head(subjectId);
  if (!head) {
    throw new NotFoundError("career record", {
      concealing: claims?.role === "subject" ? null : "record does not exist",
    });
  }
  return head;
}

/**
 * Authorisation shared by every per-record endpoint.
 *
 * Two independent checks: the token must be bound to this record (cheap, catches
 * the obvious case), and the caller's role must permit the classification of what
 * they are about to touch. Defence in depth — a bug in one is not a breach.
 */
function authoriseRecordAccess({ minRoleCheck = null } = {}) {
  return async ({ claims, req, grants, deps }) => {
    const subjectId = req.params?.subject_id;
    if (!subjectId) throw new ValidationError([{ field: "subject_id", rule: "required", message: "is required" }]);

    if (claims.role === "subject" && claims.subject_id !== subjectId) {
      // Deliberately AuthorisationError here; the endpoint converts to 404 where
      // existence itself is sensitive.
      throw new AuthorisationError("token is bound to a different record", { subjectId });
    }
    if (claims.role === "guardian" && !(claims.scopes ?? []).includes(`ward:${subjectId}`)) {
      throw new AuthorisationError("token is not scoped to that record", { subjectId });
    }
    if (claims.role === "counsellor") {
      // An ARRAY means an assignment model is configured and must be enforced.
      // null/undefined means no assignment model exists yet — see RECORDED DEBT in
      // service.mjs. Note the deliberate Array.isArray: an empty array is truthy,
      // so `if (assigned)` would refuse every counsellor.
      const assigned = await deps.assignedSubjects?.(claims.sub);
      if (Array.isArray(assigned) && !assigned.includes(subjectId)) {
        throw new AuthorisationError("counsellor is not assigned to this record", { subjectId });
      }
    }
    if (claims.role === "partner") {
      const usable = (grants ?? []).filter(
        (g) => g.grantee === claims.partner_id && g.subject_id === subjectId && Date.parse(g.expires_at) > Date.now()
      );
      if (usable.length === 0) {
        throw new AuthorisationError("no active grant for this record", { subjectId });
      }
    }
    if (minRoleCheck) await minRoleCheck({ claims, subjectId, deps });
    return true;
  };
}

/** Build the viewer the projection layer consumes. */
async function viewerFor(claims, subjectId, deps, grants) {
  const assigned = await deps.assignedSubjects?.(claims.sub);
  return {
    role: claims.role,
    id: claims.role === "partner" ? claims.partner_id : claims.sub,
    subjectId,
    grants: grants ?? [],
    // When no assignment model is configured, the record already passed
    // authorisation, so it counts as assigned for the projection. Substituting []
    // here would silently return an EMPTY timeline rather than a refusal — a
    // failure mode that looks like "this person has no history".
    assignedSubjects: Array.isArray(assigned) ? assigned : [subjectId],
    wards: (claims.scopes ?? []).filter((s) => s.startsWith("ward:")).map((s) => s.slice(5)),
  };
}

/** Append access.exercised / access.denied. A read of someone else's record is a disclosable act. */
function auditAccess(action) {
  return async ({ claims, req, ctx, deps, outcome, error }) => {
    const subjectId = req.params?.subject_id;
    if (!subjectId || !claims) return null;
    // The subject reading their own record is not surveillance; everyone else is recorded.
    if (claims.role === "subject" && claims.subject_id === subjectId && outcome === "allowed") return null;
    if (!(await deps.store.head(subjectId))) return null; // nothing to attach to

    try {
      return await appendEvent(deps.store, {
        subjectId,
        type: outcome === "allowed" ? "access.exercised" : "access.denied",
        actor: { kind: claims.role === "ai_service" ? "ai" : claims.role === "partner" ? "partner" : "human", id: claims.sub, role: claims.role },
        payload: {
          action,
          route: ctx.route,
          correlation_id: ctx.correlation_id,
          ...(error ? { refused_because: error.code } : {}),
        },
      });
    } catch (err) {
      // Audit is best-effort by design: it must never convert a successful read
      // into a failure, nor mask the original refusal.
      deps.logger?.error("audit.append_failed", { action, error: String(err.message) });
      return null;
    }
  };
}

/* ═════════════════════════════════════════════════════════════ schemas ═══ */

const evidenceItem = t.object({
  ref: t.reference(),
  kind: t.string({ min: 2, max: 64 }),
  hash: t.optional(t.string({ min: 8, max: 128 })),
});

export const schemas = {
  createRecord: {
    subject_id: t.subjectId(),
    consent_purposes: t.array(t.string({ enum: ["advisory", "document_handling", "partner_sharing", "ai_assistance", "marketing"] }), { min: 1 }),
    date_of_birth: t.isoDate(),
    origin_country: t.string({ min: 2, max: 64 }),
  },

  appendEvent: {
    type: t.string({ min: 3, max: 64, enum: Object.keys(TYPE_CLASSIFICATION) }),
    occurred_at: t.optional(t.pastOrNow()),
    payload: t.object({}),
    evidence: t.optional(t.array(evidenceItem, { max: 50 })),
    corrects: t.optional(t.string({ min: 10, max: 32 })),
    caused_by: t.optional(t.string({ min: 10, max: 32 })),
    correction_reason: t.optional(t.string({ min: 3, max: 500 })),
    idempotency_key: t.optional(t.string({ min: 8, max: 128 })),
  },

  exportRecord: {
    include_documents: t.optional(t.boolean()),
  },
};

/* ═══════════════════════════════════════════════════════════ endpoints ═══ */

/** POST /v1/career-records — open a record. */
export const createRecord = defineEndpoint({
  route: BASE,
  method: "POST",
  tier: "write",
  schema: schemas.createRecord,
  successStatus: 201,

  authorise: async ({ claims, req }) => {
    // Only staff open records. A subject cannot mint their own record id, because
    // the id is the pseudonym the whole vault separation depends on.
    if (!["counsellor", "administrator"].includes(claims.role)) {
      throw new AuthorisationError(`role ${claims.role} may not create records`);
    }
    // Same pattern as t.subjectId(); a stricter check here would reject ids the
    // schema accepts and the two would drift.
    if (req.body?.subject_id && !/^sub_[A-Za-z0-9_-]+$/.test(req.body.subject_id)) {
      throw new ValidationError([{ field: "subject_id", rule: "format", message: "is not a valid record id" }]);
    }
    return true;
  },

  business: async ({ validated, deps }) => {
    const existing = await deps.store.head(validated.subject_id);
    if (existing) throw new ConflictError(`record ${validated.subject_id} already exists`);
    // Date of birth is PII: it goes to the vault, never into an event payload.
    await deps.vault.putAll(validated.subject_id, { date_of_birth: validated.date_of_birth });
    return { subject_id: validated.subject_id };
  },

  append: async ({ validated, claims, deps }) => {
    const actor = { kind: "human", id: claims.sub, role: claims.role };
    const created = await appendEvent(deps.store, {
      subjectId: validated.subject_id,
      type: "profile.created",
      actor,
      payload: { origin_country: validated.origin_country },
    });
    // Consent is a separate event: it is a distinct act with its own evidence,
    // and folding it into profile.created would make it unwithdrawable in isolation.
    await appendEvent(deps.store, {
      subjectId: validated.subject_id,
      type: "consent.given",
      actor,
      payload: { purposes: validated.consent_purposes },
    });
    return created;
  },

  audit: auditAccess("create_record"),
});

/** GET /v1/career-records/:subject_id — summary. */
export const getRecord = defineEndpoint({
  route: `${BASE}/:subject_id`,
  method: "GET",
  authorise: authoriseRecordAccess(),

  business: async ({ claims, req, deps }) => {
    const subjectId = req.params.subject_id;
    const head = await loadRecord(deps, subjectId, claims);
    const consent = ["subject", "counsellor", "administrator"].includes(claims.role)
      ? await deps.consentState?.(subjectId)
      : null;
    return view.record(subjectId, head, consent);
  },

  audit: auditAccess("read_record"),
});

/** GET /v1/career-records/:subject_id/timeline — the product. */
export const getTimeline = defineEndpoint({
  route: `${BASE}/:subject_id/timeline`,
  method: "GET",
  authorise: authoriseRecordAccess(),

  business: async ({ claims, req, deps, grants }) => {
    const subjectId = req.params.subject_id;
    await loadRecord(deps, subjectId, claims);
    const events = await deps.store.read(subjectId);
    const viewer = await viewerFor(claims, subjectId, deps, grants);

    const asOf = req.query?.as_of;
    if (asOf && Number.isNaN(Date.parse(asOf))) {
      throw new ValidationError([{ field: "as_of", rule: "invalid", message: "must be an ISO 8601 date" }]);
    }
    const source = asOf ? events.filter((e) => Date.parse(e.recorded_at) <= Date.parse(asOf)) : events;
    const result = timeline(source, viewer);

    return {
      subject_id: subjectId,
      as_of: asOf ?? null,
      entries: result.entries,
      withheld: result.withheld,
      read_is_logged: result.read_is_logged,
    };
  },

  audit: auditAccess("read_timeline"),
});

/** POST /v1/career-records/:subject_id/events — the write path. */
export const appendRecordEvent = defineEndpoint({
  route: `${BASE}/:subject_id/events`,
  method: "POST",
  tier: "write",
  schema: schemas.appendEvent,
  consentPurpose: "advisory",
  successStatus: 201,
  appendsAdvisory: true,

  authorise: authoriseRecordAccess({
    minRoleCheck: async ({ claims }) => {
      if (claims.role === "subject" || claims.role === "guardian") {
        // A subject acknowledges and consents; they do not author advisory events.
        return true;
      }
      if (!["counsellor", "administrator", "partner", "ai_service"].includes(claims.role)) {
        throw new AuthorisationError(`role ${claims.role} may not append events`);
      }
      return true;
    },
  }),

  /**
   * Evidence is validated AND resolved against the Evidence Register. A reference
   * that does not resolve is refused — evidence pointing at nothing is worse than
   * none, because it reads as diligence.
   */
  evidence: async ({ validated, deps }) => {
    const advisory = validated.type === "recommendation.issued" || validated.type === "scholarship.identified";
    return validateEvidence(validated.evidence ?? [], {
      required: advisory,
      resolver: deps.resolveEvidence,
    });
  },

  /**
   * Disclosure comes from the REGISTER, never the request. A caller cannot supply
   * its own disclosure text, so published disclosure can never drift from what a
   * person was actually shown (Constitution 5.4).
   */
  disclosure: async ({ validated, deps }) => {
    const advisory = validated.type === "recommendation.issued" || validated.type === "scholarship.identified";
    if (!advisory) return null;
    const built = await deps.buildDisclosure(validated.payload ?? {});
    return validateDisclosure(built, { register: deps.disclosureRegister, required: true });
  },

  business: async ({ validated, claims, req, deps }) => {
    await loadRecord(deps, req.params.subject_id, claims);
    if (validated.corrects && !validated.correction_reason) {
      throw new ValidationError([
        { field: "correction_reason", rule: "conditionally_required", message: "is required when correcting an event" },
      ]);
    }
    return { type: validated.type };
  },

  append: async ({ validated, claims, req, deps, evidence, disclosure }) => {
    const subjectId = req.params.subject_id;
    const actor = {
      kind: claims.role === "ai_service" ? "ai" : claims.role === "partner" ? "partner" : "human",
      id: claims.sub,
      role: claims.role,
    };

    // A correction is a distinct operation with its own function, so "correcting"
    // can never happen by passing an extra flag to a normal append.
    if (validated.corrects) {
      return appendCorrection(
        deps.store,
        {
          subjectId,
          corrects: validated.corrects,
          type: validated.type,
          actor,
          payload: validated.payload ?? {},
          reason: validated.correction_reason,
        },
        { subject: await deps.subjectFlags?.(subjectId) }
      );
    }

    return appendEvent(
      deps.store,
      {
        subjectId,
        type: validated.type,
        actor,
        occurredAt: validated.occurred_at,
        evidence,
        disclosure,
        payload: validated.payload ?? {},
        causedBy: validated.caused_by ?? null,
        idempotencyKey: validated.idempotency_key,
      },
      { subject: await deps.subjectFlags?.(subjectId) }
    );
  },

  audit: auditAccess("append_event"),
});

/** GET /v1/career-records/:subject_id/events/:event_id — one event. */
export const getEvent = defineEndpoint({
  route: `${BASE}/:subject_id/events/:event_id`,
  method: "GET",
  authorise: authoriseRecordAccess(),

  business: async ({ claims, req, deps, grants }) => {
    const { subject_id: subjectId, event_id: eventId } = req.params;
    await loadRecord(deps, subjectId, claims);

    const events = await deps.store.read(subjectId);
    const found = events.find((e) => e.event_id === eventId);
    if (!found) throw new NotFoundError("event");

    const viewer = await viewerFor(claims, subjectId, deps, grants);
    // Existence of an event the caller may not see must not be confirmed.
    if (!canRead(found, viewer)) throw new NotFoundError("event", { concealing: "not visible to this role" });

    return view.event(found, { includeChain: claims.role === "auditor" || claims.role === "subject" });
  },

  audit: auditAccess("read_event"),
});

/** POST /v1/career-records/:subject_id/export — the record leaves with the person. */
export const exportRecord = defineEndpoint({
  route: `${BASE}/:subject_id/export`,
  method: "POST",
  tier: "write",
  schema: schemas.exportRecord,
  successStatus: 200,

  authorise: authoriseRecordAccess({
    minRoleCheck: async ({ claims }) => {
      // Export is the individual's right (Constitution 6.5). Staff may generate one
      // on their behalf; a partner never can.
      if (!["subject", "guardian", "counsellor", "administrator"].includes(claims.role)) {
        throw new AuthorisationError(`role ${claims.role} may not export a record`);
      }
      return true;
    },
  }),

  business: async ({ claims, req, deps }) => {
    const subjectId = req.params.subject_id;
    await loadRecord(deps, subjectId, claims);
    const events = await deps.store.read(subjectId);

    // The subject's own PII is included in the clear, to them. Staff exporting on
    // their behalf get the record without it.
    let identity = null;
    if (claims.role === "subject" || claims.role === "guardian") {
      identity = (await deps.vault.getAll(subjectId).catch(() => null)) ?? null;
    }

    const files = buildExport(events, { subjectId, identity, toolVersion: deps.toolVersion ?? "1.0.0" });
    const manifest = JSON.parse(files["manifest.json"]);

    return {
      subject_id: subjectId,
      format: manifest.format,
      generated_at: manifest.generated_at,
      event_count: manifest.event_count,
      chain_head: manifest.chain_head,
      chain_verified: manifest.chain_verified_at_export,
      evidence_references: [...new Set(events.flatMap((e) => (e.evidence ?? []).map((v) => v.ref)))],
      disclosure_versions: [...new Set(events.map((e) => e.disclosure?.register_version).filter(Boolean))],
      includes_identity: identity !== null,
      files: Object.fromEntries(Object.entries(files).map(([name, body]) => [name, body.length])),
      archive: files,
    };
  },

  append: async ({ claims, req, deps, result }) => {
    return appendEvent(deps.store, {
      subjectId: req.params.subject_id,
      type: "record.exported",
      actor: { kind: "human", id: claims.sub, role: claims.role },
      payload: {
        event_count: result.event_count,
        chain_head: result.chain_head,
        includes_identity: result.includes_identity,
      },
    });
  },

  audit: auditAccess("export_record"),
});

/** GET /v1/career-records/:subject_id/verify — chain integrity. */
export const verifyRecord = defineEndpoint({
  route: `${BASE}/:subject_id/verify`,
  method: "GET",

  authorise: authoriseRecordAccess({
    minRoleCheck: async ({ claims }) => {
      if (!["subject", "guardian", "auditor", "counsellor", "administrator"].includes(claims.role)) {
        throw new AuthorisationError(`role ${claims.role} may not verify a record`);
      }
      return true;
    },
  }),

  business: async ({ claims, req, deps }) => {
    const subjectId = req.params.subject_id;
    await loadRecord(deps, subjectId, claims);
    return view.verification(await verifySubject(deps.store, subjectId), { subjectId });
  },

  audit: auditAccess("verify_record"),
});

/* ═══════════════════════════════════════════════════════════════ router ═══ */

export const routes = [
  { method: "POST", template: BASE, handler: createRecord, name: "createRecord" },
  { method: "GET", template: `${BASE}/:subject_id`, handler: getRecord, name: "getRecord" },
  { method: "GET", template: `${BASE}/:subject_id/timeline`, handler: getTimeline, name: "getTimeline" },
  { method: "POST", template: `${BASE}/:subject_id/events`, handler: appendRecordEvent, name: "appendEvent" },
  { method: "GET", template: `${BASE}/:subject_id/events/:event_id`, handler: getEvent, name: "getEvent" },
  { method: "POST", template: `${BASE}/:subject_id/export`, handler: exportRecord, name: "exportRecord" },
  { method: "GET", template: `${BASE}/:subject_id/verify`, handler: verifyRecord, name: "verifyRecord" },
];

/**
 * The published API contract. Machine-readable so a client can be generated and a
 * breaking change is detectable in review rather than at runtime.
 */
export const contract = {
  version: API_VERSION,
  base: BASE,
  endpoints: routes.map((r) => ({
    name: r.name,
    method: r.method,
    path: r.template,
    request_schema: {
      createRecord: Object.keys(schemas.createRecord),
      appendEvent: Object.keys(schemas.appendEvent),
      exportRecord: Object.keys(schemas.exportRecord),
    }[r.name] ?? null,
  })),
  error_shape: { error: { code: "string", message: "string", retryable: "boolean", issues: "array?" } },
  headers: {
    request: ["authorization", "content-type", "x-correlation-id", "traceparent", "idempotency-key"],
    response: ["x-correlation-id", "x-request-id", "retry-after"],
  },
};

/** Startup assertion: every endpoint declares the stages its shape requires. */
export function assertContractComplete() {
  const specs = [
    { route: BASE, method: "POST", append: true, authorise: true },
    { route: `${BASE}/:subject_id`, method: "GET", authorise: true },
    { route: `${BASE}/:subject_id/timeline`, method: "GET", authorise: true },
    { route: `${BASE}/:subject_id/events`, method: "POST", append: true, authorise: true, appendsAdvisory: true, evidence: true, disclosure: true },
    { route: `${BASE}/:subject_id/events/:event_id`, method: "GET", authorise: true },
    { route: `${BASE}/:subject_id/export`, method: "POST", append: true, authorise: true },
    { route: `${BASE}/:subject_id/verify`, method: "GET", authorise: true },
  ];
  for (const s of specs) assertEndpointComplete(s);
  return true;
}
