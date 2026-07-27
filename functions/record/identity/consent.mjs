/**
 * Consent Management — a projection over consent events.
 *
 * Architecture: docs/25-career-record-architecture.md §3, §11.5.
 *
 * Consent is NOT a boolean column. It is derived from the log, because the
 * question that matters is never "is consent on?" but "was there valid consent
 * for this purpose at the moment we acted?" — and only an append-only history can
 * answer that after the fact.
 *
 * DPDP Act 2023 + 2025 Rules shape three rules here:
 *  · A minor requires verifiable guardian consent; without it, processing stops.
 *  · Behavioural profiling of a minor is prohibited outright (see also invariant
 *    I8 in policy.mjs, which blocks AI-authored events for minors at the write path).
 *  · Withdrawal must be as easy as giving, and takes effect immediately.
 *
 * VERIFICATION STATUS: unit-tested. Not legally reviewed — the DPDP mapping here
 * is an engineering interpretation and needs counsel sign-off before production.
 */

/** Purposes consent can be granted for. Unknown purposes are refused (default deny). */
export const PURPOSES = Object.freeze({
  advisory: "Providing counselling and recommendations",
  document_handling: "Holding and verifying identity and academic documents",
  partner_sharing: "Sharing a scoped subset with a named institution",
  ai_assistance: "Using automated assistance to prepare suggestions for a human adviser",
  marketing: "Sending information not required to deliver the service",
});

export const MINOR_AGE = 18;

export class ConsentError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = "ConsentError";
  }
}

/** Age in whole years at `asOf`. Returns null when DOB is unknown. */
export function ageAt(dateOfBirth, asOf = new Date()) {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return null;
  const ref = new Date(asOf);
  let age = ref.getUTCFullYear() - dob.getUTCFullYear();
  const beforeBirthday =
    ref.getUTCMonth() < dob.getUTCMonth() ||
    (ref.getUTCMonth() === dob.getUTCMonth() && ref.getUTCDate() < dob.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

/**
 * Fold consent events into current state.
 *
 * `asOf` is the whole point: passing a past timestamp reconstructs what consent
 * looked like then, which is what an auditor or a regulator actually asks for.
 */
export function consentState(events, { asOf = new Date(), dateOfBirth = null } = {}) {
  const at = new Date(asOf).getTime();
  const relevant = events
    .filter((e) => e.type.startsWith("consent.") && Date.parse(e.recorded_at) <= at)
    .sort((a, b) => a.seq - b.seq);

  /** purpose → { granted, at, by, event_id, withdrawn_at } */
  const purposes = new Map();
  const guardians = new Map();

  for (const e of relevant) {
    if (e.type === "consent.given") {
      for (const p of e.payload?.purposes ?? []) {
        purposes.set(p, {
          granted: true,
          at: e.occurred_at,
          by: e.actor?.id ?? null,
          by_role: e.actor?.role ?? null,
          event_id: e.event_id,
          withdrawn_at: null,
        });
      }
    } else if (e.type === "consent.withdrawn") {
      // An empty purpose list withdraws everything — withdrawal must never be
      // harder than granting.
      const list = e.payload?.purposes?.length ? e.payload.purposes : [...purposes.keys()];
      for (const p of list) {
        const cur = purposes.get(p);
        if (cur) purposes.set(p, { ...cur, granted: false, withdrawn_at: e.occurred_at, withdrawn_event: e.event_id });
      }
    } else if (e.type === "consent.guardian_linked") {
      guardians.set(e.payload?.guardian_id, {
        guardian_id: e.payload?.guardian_id,
        relationship: e.payload?.relationship ?? "guardian",
        verified_by: e.payload?.verified_by ?? null,
        linked_at: e.occurred_at,
        event_id: e.event_id,
        expires_at: e.payload?.expires_at ?? null,
      });
    }
  }

  const age = ageAt(dateOfBirth, asOf);
  const isMinor = age !== null && age < MINOR_AGE;

  const activeGuardians = [...guardians.values()].filter(
    (g) => !g.expires_at || Date.parse(g.expires_at) > at
  );

  return {
    as_of: new Date(at).toISOString(),
    age,
    is_minor: isMinor,
    // Unknown DOB is treated as unknown, never as adult. Assuming adulthood is
    // the failure mode that would put a child through an adult flow.
    age_known: age !== null,
    guardians: activeGuardians,
    purposes: Object.fromEntries(purposes),
  };
}

/**
 * The gate every processing decision passes through.
 *
 * Returns a decision object rather than a boolean, because a refusal has to be
 * explainable to the person it affects — and loggable as an access.denied event.
 */
export function consentCheck(state, purpose, { actorKind = "human" } = {}) {
  const deny = (code, reason) => ({ allowed: false, code, reason, purpose });

  if (!PURPOSES[purpose]) return deny("UNKNOWN_PURPOSE", `"${purpose}" is not a declared purpose (default deny)`);

  const grant = state.purposes[purpose];
  if (!grant || !grant.granted) {
    return deny("NO_CONSENT", grant?.withdrawn_at
      ? `consent for ${purpose} was withdrawn on ${grant.withdrawn_at}`
      : `no consent recorded for ${purpose}`);
  }

  if (!state.age_known) {
    return deny("AGE_UNKNOWN", "date of birth is unknown; a minor cannot be ruled out, so processing is refused");
  }

  if (state.is_minor) {
    // DPDP: behavioural profiling of children is prohibited regardless of consent.
    if (purpose === "ai_assistance" || actorKind === "ai") {
      return deny("MINOR_AI_PROHIBITED", "automated profiling of a minor is prohibited (DPDP) and cannot be consented into");
    }
    if (purpose === "marketing") {
      return deny("MINOR_MARKETING_PROHIBITED", "marketing to a minor is refused");
    }
    if (state.guardians.length === 0) {
      return deny("GUARDIAN_REQUIRED", "subject is a minor and no verified guardian is linked");
    }
    // Guardian consent must be the thing on record, not the child's.
    if (grant.by_role !== "guardian" && grant.by_role !== "administrator") {
      return deny("GUARDIAN_CONSENT_REQUIRED", `consent for a minor must be given by a guardian, not ${grant.by_role ?? "unknown"}`);
    }
  }

  return { allowed: true, purpose, granted_at: grant.at, granted_by: grant.by, evidence_event: grant.event_id };
}

/** Build the event body for granting consent. Validated so bad purposes cannot enter the log. */
export function grantConsentEvent({ subjectId, purposes, actor, evidenceOfVerification = null }) {
  const unknown = purposes.filter((p) => !PURPOSES[p]);
  if (unknown.length) throw new ConsentError("UNKNOWN_PURPOSE", `undeclared purposes: ${unknown.join(", ")}`);
  if (!purposes.length) throw new ConsentError("NO_PURPOSE", "consent must name at least one purpose");
  return {
    subjectId,
    type: "consent.given",
    actor,
    evidence: evidenceOfVerification ? [evidenceOfVerification] : [],
    payload: { purposes, purpose_descriptions: Object.fromEntries(purposes.map((p) => [p, PURPOSES[p]])) },
  };
}

export function withdrawConsentEvent({ subjectId, purposes = [], actor, reason = null }) {
  return {
    subjectId,
    type: "consent.withdrawn",
    actor,
    payload: { purposes, reason, effective: "immediate" },
  };
}

export function linkGuardianEvent({ subjectId, guardianId, relationship, verifiedBy, expiresAt = null, actor }) {
  if (!guardianId) throw new ConsentError("NO_GUARDIAN", "guardian_id is required");
  if (!verifiedBy) throw new ConsentError("UNVERIFIED_GUARDIAN", "a guardian link must record how it was verified (DPDP)");
  return {
    subjectId,
    type: "consent.guardian_linked",
    actor,
    payload: { guardian_id: guardianId, relationship, verified_by: verifiedBy, expires_at: expiresAt },
  };
}
