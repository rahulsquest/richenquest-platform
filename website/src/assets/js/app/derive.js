/**
 * Derivations over the timeline the API returns. Pure functions — no DOM, no
 * network, no storage — so every rule here is unit-testable.
 *
 * WHY DERIVE AT ALL
 * The log is the truth and every view is a projection of it (docs/DECISIONS.md
 * D10). The API already ships the canonical projection; these functions fold the
 * SAME visible events into the three further views the dashboard needs — consent
 * state, an evidence index, and what is new since the student last looked.
 *
 * Nothing here invents data. If an entry is not in the timeline the API returned,
 * it does not exist as far as this file is concerned: a fact withheld by the
 * permission layer must stay withheld, not be reconstructed client-side.
 */

/** Purposes the API accepts (identity/consent.mjs PURPOSES). */
export const CONSENT_PURPOSES = Object.freeze([
  { id: "advisory", label: "Counselling and recommendations", essential: true },
  { id: "document_handling", label: "Holding and verifying my documents", essential: false },
  { id: "partner_sharing", label: "Sharing a scoped subset with a named institution", essential: false },
  { id: "ai_assistance", label: "Automated help preparing suggestions for my adviser", essential: false },
  { id: "marketing", label: "Information not needed to deliver the service", essential: false },
]);

const byRecorded = (a, b) => {
  const ta = Date.parse(a.recorded ?? a.time ?? "");
  const tb = Date.parse(b.recorded ?? b.time ?? "");
  return (Number.isNaN(ta) ? 0 : ta) - (Number.isNaN(tb) ? 0 : tb);
};

/**
 * Fold consent events into current state.
 *
 * Mirrors identity/consent.mjs consentState(), over the entries the student can
 * see. Ordering is by `recorded_at` because that is the closest proxy the
 * projection exposes for append order — `occurred_at` can be backdated, and
 * consent must be evaluated in the order it was actually recorded.
 *
 * An empty withdrawal list withdraws everything, exactly as the server reads it.
 */
export function consentFromTimeline(entries = []) {
  const purposes = new Map();

  for (const e of [...entries].sort(byRecorded)) {
    if (e.type === "consent.given") {
      for (const p of e.decision?.purposes ?? []) {
        purposes.set(p, { purpose: p, granted: true, at: e.time, event_id: e.event_id, withdrawn_at: null });
      }
    } else if (e.type === "consent.withdrawn") {
      const list = e.decision?.purposes?.length ? e.decision.purposes : [...purposes.keys()];
      for (const p of list) {
        const current = purposes.get(p);
        if (current) purposes.set(p, { ...current, granted: false, withdrawn_at: e.time, withdrawn_event: e.event_id });
      }
    }
  }

  return {
    purposes: Object.fromEntries(purposes),
    granted: [...purposes.values()].filter((p) => p.granted).map((p) => p.purpose),
    /** True only when a consent event has actually been seen. */
    known: purposes.size > 0,
  };
}

/**
 * Index every evidence reference cited anywhere in the record.
 *
 * Grouped by reference so a student can ask "what is this document being used to
 * justify?" and get every answer at once — which is the question that matters
 * when a recommendation rests on it.
 */
export function evidenceIndex(entries = []) {
  const refs = new Map();

  for (const e of entries) {
    for (const item of e.evidence ?? []) {
      const ref = item?.ref;
      if (!ref) continue;
      if (!refs.has(ref)) refs.set(ref, { ref, kind: item.kind ?? null, citations: [] });
      refs.get(ref).citations.push({
        event_id: e.event_id,
        type: e.type,
        time: e.time,
        classification: e.classification ?? null,
      });
    }
  }

  return [...refs.values()].sort((a, b) => b.citations.length - a.citations.length || String(a.ref).localeCompare(String(b.ref)));
}

/**
 * Recommendations still waiting on the student.
 *
 * A recommendation that has been corrected or withdrawn is not outstanding —
 * chasing someone for a decision on advice that no longer stands would be a bug
 * with real consequences.
 */
export function pendingAcknowledgements(entries = []) {
  const withdrawn = new Set(
    entries.filter((e) => e.type === "recommendation.withdrawn").map((e) => e.decision?.recommendation_event ?? null)
  );
  return entries.filter(
    (e) =>
      e.type === "recommendation.issued" &&
      !e.acknowledgement &&
      !e.corrected &&
      !withdrawn.has(e.event_id)
  );
}

/**
 * What has happened since the student last looked.
 *
 * `lastSeen` is an ISO timestamp held on the device. It is a reading marker, not
 * a security control: everything returned here was already visible to this
 * viewer, so a lost or forged marker changes what is highlighted, never what can
 * be seen.
 */
export function newSince(entries = [], lastSeen = null) {
  if (!lastSeen) return [];
  const cutoff = Date.parse(lastSeen);
  if (Number.isNaN(cutoff)) return [];
  return entries
    .filter((e) => {
      const t = Date.parse(e.recorded ?? e.time ?? "");
      return !Number.isNaN(t) && t > cutoff;
    })
    .sort(byRecorded)
    .reverse();
}

/** Latest recorded timestamp in the timeline, for advancing the read marker. */
export function latestRecordedAt(entries = []) {
  let latest = null;
  for (const e of entries) {
    const value = e.recorded ?? e.time;
    const t = Date.parse(value ?? "");
    if (!Number.isNaN(t) && (latest === null || t > Date.parse(latest))) latest = value;
  }
  return latest;
}

/**
 * Everything the Updates view shows, in one derivation.
 *
 * Ordered by how much it should worry the reader: a broken chain outranks a new
 * recommendation, which outranks somebody having read the record.
 */
export function buildNotifications({ entries = [], verification = null, lastSeen = null, withheld = 0 } = {}) {
  const items = [];

  if (verification && verification.verified === false) {
    items.push({
      kind: "integrity",
      severity: "alert",
      title: "This record failed its integrity check",
      detail:
        `${verification.failures?.length ?? 0} problem(s) were found while verifying the chain. ` +
        "Please contact us — do not rely on this record until it is resolved.",
      time: null,
    });
  }

  for (const e of pendingAcknowledgements(entries)) {
    items.push({
      kind: "action",
      severity: "action",
      title: "A recommendation is waiting for your response",
      detail: e.decision?.summary ?? e.decision?.headline ?? "Open the entry to read it in full.",
      time: e.time,
      event_id: e.event_id,
    });
  }

  for (const e of newSince(entries, lastSeen)) {
    items.push({
      kind: e.type === "access.exercised" ? "access" : "entry",
      severity: "info",
      title: e.type === "access.exercised" ? "Your record was viewed" : null,
      detail: null,
      time: e.recorded ?? e.time,
      event_id: e.event_id,
      type: e.type,
      entry: e,
    });
  }

  if (withheld > 0) {
    items.push({
      kind: "withheld",
      severity: "info",
      title: `${withheld} entr${withheld === 1 ? "y is" : "ies are"} not visible to you`,
      detail:
        "Some entries are held at a classification this session cannot read. They are counted here " +
        "rather than hidden silently, so you always know your view is partial.",
      time: null,
    });
  }

  const rank = { alert: 0, action: 1, info: 2 };
  return items.sort((a, b) => (rank[a.severity] ?? 3) - (rank[b.severity] ?? 3));
}

/** Count that belongs on the nav badge: things that are new or need an action. */
export function unreadCount(notifications = []) {
  return notifications.filter((n) => n.severity !== "info" || n.kind === "entry").length;
}
