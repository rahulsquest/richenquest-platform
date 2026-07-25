/**
 * Career Record — invariants and permissions.
 *
 * Architecture: docs/25-career-record-architecture.md §2.5, §3.
 *
 * These are the Constitution expressed as code that refuses. Not warnings, not
 * lint, not review checklists — an append that would breach one of them does not
 * happen. That is what "the user should feel the Constitution without reading
 * it" has to mean at the storage boundary.
 */

import { ACTOR_KINDS, CLASSIFICATIONS } from "./event.mjs";

/* ----------------------------------------------------- event catalogue --- */

/** Types an AI actor may author. Anything else is refused (I7). */
const AI_WRITABLE = new Set([
  "ai.suggestion_generated",
]);

/** Types a partner may contribute. Partners are contributors, never editors (I9). */
const PARTNER_WRITABLE = new Set([
  "application.outcome_received",
  "admission.offered",
  "admission.deferred",
  "document.verified",
]);

/** Types that require human authorship, evidence and disclosure. */
const ADVISORY_TYPES = new Set([
  "recommendation.issued",
  "scholarship.identified",
]);

/** Default classification per type. A type with none cannot be written (I11). */
export const TYPE_CLASSIFICATION = Object.freeze({
  "profile.created": "subject",
  "profile.updated": "subject",
  "profile.reviewed": "care_team",
  "profile.corrected": "subject",
  "consent.given": "subject",
  "consent.withdrawn": "subject",
  "consent.guardian_linked": "restricted",
  "counselling.session_held": "care_team",
  "counselling.summary_issued": "subject",
  "counselling.note_added": "care_team",
  "document.submitted": "restricted",
  "document.verified": "partner_shareable",
  "document.rejected": "care_team",
  "document.expired": "care_team",
  "document.superseded": "care_team",
  "recommendation.issued": "subject",
  "recommendation.acknowledged": "subject",
  "recommendation.declined": "subject",
  "recommendation.withdrawn": "subject",
  "recommendation.outcome_recorded": "subject",
  "scholarship.identified": "subject",
  "application.prepared": "care_team",
  "application.submitted": "partner_shareable",
  "application.outcome_received": "partner_shareable",
  "admission.offered": "partner_shareable",
  "admission.accepted": "subject",
  "admission.declined": "subject",
  "admission.deferred": "partner_shareable",
  "visa.applied": "restricted",
  "visa.granted": "restricted",
  "visa.refused": "restricted",
  "arrival.confirmed": "subject",
  "arrival.accommodation_secured": "subject",
  "internship.started": "subject",
  "employment.started": "subject",
  "mentorship.matched": "subject",
  "career.milestone_recorded": "subject",
  "access.granted": "internal",
  "access.revoked": "internal",
  "access.exercised": "internal",
  "access.denied": "internal",
  "ai.suggestion_generated": "care_team",
  "ai.suggestion_accepted": "care_team",
  "ai.suggestion_rejected": "care_team",
  "record.exported": "subject",
  "record.checkpoint_written": "internal",
  "record.erasure_executed": "internal",
});

/* ---------------------------------------------------------- invariants --- */

export class InvariantViolation extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.code = code;
    this.name = "InvariantViolation";
  }
}

/**
 * Check every invariant for a candidate event. Throws on the first breach —
 * unlike verification, a write either happens or it does not.
 *
 * @param {object} candidate  the event about to be appended
 * @param {object} ctx        { head, subject } current chain head + subject flags
 */
export function assertInvariants(candidate, ctx = {}) {
  const { head = null, subject = {} } = ctx;
  const e = candidate;

  // Shape
  if (!e.subject_id) throw new InvariantViolation("I0", "event has no subject_id");
  if (!TYPE_CLASSIFICATION[e.type]) {
    throw new InvariantViolation(
      "I11",
      `unknown event type "${e.type}" — a type must be registered with a classification before it can be written (default deny)`
    );
  }
  if (!ACTOR_KINDS.includes(e.actor?.kind)) {
    throw new InvariantViolation("I0", `actor.kind must be one of ${ACTOR_KINDS.join(", ")}`);
  }
  if (!CLASSIFICATIONS.includes(e.classification)) {
    throw new InvariantViolation("I11", `invalid classification "${e.classification}"`);
  }

  // I1 — advisory judgement is human, always. There is no AI path to authority.
  if (ADVISORY_TYPES.has(e.type) && e.actor.kind !== "human") {
    throw new InvariantViolation(
      "I1",
      `${e.type} must be authored by a human actor (Constitution 6.7, 12.1) — an AI may only suggest`
    );
  }

  // I2 — a recommendation with no evidence is an opinion.
  if (ADVISORY_TYPES.has(e.type) && (!Array.isArray(e.evidence) || e.evidence.length === 0)) {
    throw new InvariantViolation("I2", `${e.type} requires at least one evidence reference (Constitution 6.3)`);
  }

  // I3 — disclosure is shown at the point of recommendation or not at all.
  if (ADVISORY_TYPES.has(e.type) && e.disclosure?.shown !== true) {
    throw new InvariantViolation("I3", `${e.type} requires disclosure.shown = true (Constitution 5.4)`);
  }

  // I4/I5 — position in the chain is not negotiable.
  const expectedSeq = head ? head.seq + 1 : 1;
  if (e.seq !== expectedSeq) {
    throw new InvariantViolation("I4", `expected seq ${expectedSeq}, got ${e.seq} (concurrent write?)`);
  }
  const expectedPrev = head ? head.hash : null;
  if ((e.prev_hash ?? null) !== expectedPrev) {
    throw new InvariantViolation("I5", "prev_hash does not match the current chain head");
  }

  // I7 — AI writes suggestions only.
  if (e.actor.kind === "ai" && !AI_WRITABLE.has(e.type)) {
    throw new InvariantViolation(
      "I7",
      `an AI actor may not write "${e.type}" (Constitution 12.1) — permitted: ${[...AI_WRITABLE].join(", ")}`
    );
  }

  // I8 — no AI analysis of a minor (DPDP; Constitution 12.3).
  if (subject.minor === true && e.actor.kind === "ai") {
    throw new InvariantViolation("I8", "no AI-authored event may be written for a subject flagged as a minor");
  }

  // I9 — partners contribute, never edit.
  if (e.actor.kind === "partner" && !PARTNER_WRITABLE.has(e.type)) {
    throw new InvariantViolation(
      "I9",
      `a partner may not write "${e.type}" (Constitution 14.5) — partners are authorised contributors, not owners of the record`
    );
  }

  // I10 — the future has not happened yet.
  if (Date.parse(e.occurred_at) > Date.now() + 60_000) {
    throw new InvariantViolation("I10", "occurred_at is in the future");
  }

  // AI suggestions must themselves cite evidence.
  if (e.type === "ai.suggestion_generated") {
    if (!Array.isArray(e.evidence) || e.evidence.length === 0) {
      throw new InvariantViolation("I2", "an AI suggestion with no evidence reference is refused (Constitution 12.5)");
    }
    if (!e.payload?.model_id || !e.payload?.model_version) {
      throw new InvariantViolation("I7", "an AI suggestion must record model_id and model_version");
    }
  }

  return true;
}

/* --------------------------------------------------------- permissions --- */

const ORDER = ["public", "subject", "care_team", "partner_shareable", "restricted", "internal"];

/** Highest classification each role may see by default. Default deny. */
const ROLE_CEILING = Object.freeze({
  subject: "restricted",
  guardian: "restricted",
  counsellor: "restricted",
  administrator: "care_team",
  partner: "partner_shareable",
  auditor: "internal",
  ai_service: "care_team",
  anonymous: "public",
});

/**
 * Roles whose reads are recorded. The subject reading their own record is not
 * surveillance; anyone else reading it is a disclosable act (§3.4).
 */
export const READS_ARE_LOGGED = new Set(["counsellor", "partner", "administrator", "ai_service"]);

/**
 * Can `role` see an event of `classification`, given active grants?
 *
 * Partners are the interesting case: the ceiling is not enough. A partner needs
 * an unexpired grant that names the event type, because "a university may see
 * partner-shareable data" is not the same as "this university may see THIS
 * person's data for THIS purpose".
 */
export function canRead(event, viewer) {
  const { role = "anonymous", grants = [], now = Date.now(), subjectId = null } = viewer;

  const ceiling = ROLE_CEILING[role];
  if (!ceiling) return false;
  if (ORDER.indexOf(event.classification) > ORDER.indexOf(ceiling)) return false;

  // The subject always reads their own record in full (Constitution 6.5).
  if (role === "subject") return viewer.subjectId === event.subject_id;

  // Auditors read envelopes for integrity work; payload redaction is applied
  // separately by the projection (§5.3).
  if (role === "auditor") return true;

  if (role === "partner" || role === "ai_service") {
    return grants.some(
      (g) =>
        g.grantee === viewer.id &&
        (g.subject_id ?? subjectId) === event.subject_id &&
        Date.parse(g.expires_at) > now &&
        (g.scope?.types ?? []).includes(event.type) &&
        ORDER.indexOf(event.classification) <= ORDER.indexOf(g.scope?.classification_max ?? "public")
    );
  }

  if (role === "counsellor") return (viewer.assignedSubjects ?? []).includes(event.subject_id);
  if (role === "guardian") {
    return (viewer.wards ?? []).includes(event.subject_id);
  }

  return role === "administrator";
}
