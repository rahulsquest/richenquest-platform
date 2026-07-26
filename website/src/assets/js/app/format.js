/**
 * Presentation helpers. Pure functions only — no DOM, no network — so the
 * wording a student reads is unit-testable.
 *
 * Event labels are written for the person the record is about, not for the
 * system that wrote it. "visa.refused" is a hard day in someone's life; it is
 * rendered as plain language, never softened into something it isn't.
 */

/** Student-facing label for every registered event type (policy.mjs). */
export const EVENT_LABELS = Object.freeze({
  "profile.created": "Record opened",
  "profile.updated": "Profile updated",
  "profile.reviewed": "Profile reviewed",
  "profile.corrected": "Profile corrected",
  "consent.given": "Consent given",
  "consent.withdrawn": "Consent withdrawn",
  "consent.guardian_linked": "Guardian linked",
  "counselling.session_held": "Counselling session",
  "counselling.summary_issued": "Session summary",
  "counselling.note_added": "Counsellor note",
  "document.submitted": "Document submitted",
  "document.verified": "Document verified",
  "document.rejected": "Document rejected",
  "document.expired": "Document expired",
  "document.superseded": "Document replaced",
  "recommendation.issued": "Recommendation",
  "recommendation.acknowledged": "You acknowledged this",
  "recommendation.declined": "You declined this",
  "recommendation.withdrawn": "Recommendation withdrawn",
  "recommendation.outcome_recorded": "Outcome recorded",
  "scholarship.identified": "Scholarship identified",
  "application.prepared": "Application prepared",
  "application.submitted": "Application submitted",
  "application.outcome_received": "Application outcome",
  "admission.offered": "Admission offered",
  "admission.accepted": "Admission accepted",
  "admission.declined": "Admission declined",
  "admission.deferred": "Admission deferred",
  "visa.applied": "Visa applied for",
  "visa.granted": "Visa granted",
  "visa.refused": "Visa refused",
  "arrival.confirmed": "Arrival confirmed",
  "arrival.accommodation_secured": "Accommodation secured",
  "internship.started": "Internship started",
  "employment.started": "Employment started",
  "mentorship.matched": "Mentor matched",
  "career.milestone_recorded": "Career milestone",
  "access.granted": "Access granted",
  "access.revoked": "Access revoked",
  "access.exercised": "Your record was viewed",
  "access.denied": "Access refused",
  "ai.suggestion_generated": "Automated suggestion prepared",
  "ai.suggestion_accepted": "Suggestion accepted by an adviser",
  "ai.suggestion_rejected": "Suggestion rejected by an adviser",
  "record.exported": "Record exported",
  "record.checkpoint_written": "Integrity checkpoint",
  "record.erasure_executed": "Erasure executed",
});

/** Unknown types are shown honestly rather than hidden — the log is the truth. */
export function eventLabel(type) {
  return EVENT_LABELS[type] ?? String(type ?? "Unknown entry").replace(/[._]/g, " ");
}

/** Broad grouping used for colour and for the evidence index. */
export function eventGroup(type) {
  const head = String(type ?? "").split(".")[0];
  return (
    {
      profile: "profile",
      consent: "consent",
      counselling: "guidance",
      recommendation: "guidance",
      scholarship: "guidance",
      document: "documents",
      application: "applications",
      admission: "applications",
      visa: "visa",
      arrival: "arrival",
      internship: "career",
      employment: "career",
      mentorship: "career",
      career: "career",
      access: "access",
      ai: "guidance",
      record: "record",
    }[head] ?? "other"
  );
}

const ROLE_LABELS = Object.freeze({
  subject: "you",
  guardian: "your guardian",
  counsellor: "your counsellor",
  administrator: "RichenQuest staff",
  partner: "an institution",
  auditor: "an auditor",
  ai_service: "automated assistance",
});

/** Who wrote this entry, in words. */
export function actorLabel(actor) {
  if (!actor) return "unknown";
  if (actor.kind === "ai") return ROLE_LABELS.ai_service;
  return ROLE_LABELS[actor.role] ?? actor.role ?? "unknown";
}

/** What a classification means for who can see the entry. */
export const CLASSIFICATION_NOTES = Object.freeze({
  subject: "Visible to you and your care team.",
  care_team: "Internal working note, visible to you and your care team.",
  partner_shareable: "May be shared with a named institution when you allow it.",
  restricted: "Restricted — held to a higher bar than the rest of your record.",
  internal: "System entry, kept for audit.",
});

/* ------------------------------------------------------------------ time --- */

const pad = (n) => String(n).padStart(2, "0");

/** Absolute, unambiguous, locale-independent. Dates in a record must not slide. */
export function formatDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unknown date";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatDateTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unknown time";
  return `${formatDate(iso)}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "3 days ago" — for recency only; the absolute date is always shown too. */
export function relativeTime(iso, now = Date.now()) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const seconds = Math.round((now - t) / 1000);
  if (seconds < 0) return "just now";
  const units = [
    [60, "second"],
    [3600, "minute", 60],
    [86_400, "hour", 3600],
    [604_800, "day", 86_400],
    [2_629_800, "week", 604_800],
    [31_557_600, "month", 2_629_800],
  ];
  for (const [limit, name, divisor] of units) {
    if (seconds < limit) {
      const value = divisor ? Math.floor(seconds / divisor) : seconds;
      if (!divisor) return "just now";
      return `${value} ${name}${value === 1 ? "" : "s"} ago`;
    }
  }
  const years = Math.floor(seconds / 31_557_600);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

/** Countdown for the session badge. */
export function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return "expired";
  const total = Math.floor(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return minutes > 0 ? `${minutes}m ${pad(seconds)}s` : `${seconds}s`;
}

/* -------------------------------------------------------------- payloads --- */

/** Turn a payload key into a readable field name. */
export function fieldLabel(key) {
  return String(key)
    .replace(/_/g, " ")
    .replace(/^./, (c) => c.toUpperCase());
}

/**
 * Render a payload value for display. Objects and arrays are stringified rather
 * than dropped: an entry the student cannot fully read is an entry they cannot
 * fully trust.
 */
export function formatValue(value) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.map((v) => formatValue(v)).join(", ");
  if (typeof value === "object") {
    return Object.entries(value)
      .map(([k, v]) => `${fieldLabel(k)}: ${formatValue(v)}`)
      .join("; ");
  }
  const s = String(value);
  // ISO timestamps inside payloads read as noise unless normalised.
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s) ? formatDateTime(s) : s;
}

/** Evidence reference kinds, and whether this deployment can resolve them. */
export const EVIDENCE_KINDS = Object.freeze({
  claim: { label: "Verified claim", resolvable: true },
  doc: { label: "Document", resolvable: false },
  dest: { label: "Destination data", resolvable: false },
  usr: { label: "Person", resolvable: false },
  partner: { label: "Institution", resolvable: false },
  sub: { label: "Record", resolvable: false },
});

export function evidenceKind(ref) {
  const kind = String(ref ?? "").split(":")[0];
  return { kind, ...(EVIDENCE_KINDS[kind] ?? { label: "Reference", resolvable: false }) };
}

export function evidenceId(ref) {
  const rest = String(ref ?? "").split(":").slice(1).join(":");
  return rest.split("@")[0] || String(ref ?? "");
}
