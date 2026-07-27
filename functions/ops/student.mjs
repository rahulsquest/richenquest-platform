/**
 * Student Operations — derivations over the Career Record.
 *
 * WHERE THE DATA COMES FROM, AND WHY NONE OF IT IS NEW
 * The Career Record already models a student's journey: `application.*`,
 * `admission.*`, `document.*`, `visa.*` and `arrival.*` are registered event types
 * with classifications and a permission model (functions/record/policy.mjs). The
 * operational state this platform shows is not a second copy of that — it is a
 * projection of it, computed on read.
 *
 * So there is no new store, no new event type, and no second write path. A module
 * here answers a question by folding the log; if the answer is wrong, the log is
 * wrong, and there is exactly one thing to fix.
 *
 * The CRM Student Case (Deals) supplies the *commercial* frame — stage, assigned
 * counsellor, service package, next deadline — because that is where the business
 * already tracks it (ADR-003, config/crm-schema.json). The Career Record supplies
 * the *history*. Neither duplicates the other:
 *
 *   CRM   → who owns this student, what stage the engagement is at
 *   Record → what actually happened, when, and on whose authority
 *
 * Pure functions only: no network, no DOM, no clock except the one passed in.
 */

/* ────────────────────────────────────────────────────────── vocabulary ── */

/** Application lifecycle, in the order an application actually moves. */
export const APPLICATION_STATES = Object.freeze([
  "Preparing",
  "Submitted",
  "Offer",
  "Rejected",
  "Deferred",
  "Accepted",
  "Declined",
]);

/**
 * The documents a student journey needs before a visa application is credible.
 *
 * Derived from the CRM's own Document Status progression (crm-schema.json:
 * Collecting → APS Applied → APS Received → Verified → Complete) rather than
 * invented here. Matching is by substring on the document name, deliberately
 * loose — a checklist defeated by a rename reports green on an empty folder, the
 * same reasoning as the partnership checklist.
 */
export const REQUIRED_STUDENT_DOCUMENTS = Object.freeze([
  { key: "passport", label: "Passport" },
  { key: "marksheet", label: "Academic marksheets" },
  { key: "transcript", label: "Transcripts" },
  { key: "language", label: "Language certificate" },
  { key: "financial", label: "Financial proof" },
]);

/** The visa journey, and what each step means for the student. */
export const VISA_STEPS = Object.freeze([
  { key: "applied", label: "Application lodged", event: "visa.applied" },
  { key: "interview", label: "Interview", event: "visa.interview_scheduled" },
  { key: "decision", label: "Decision", event: "visa.granted" },
]);

/**
 * What must be true before a student boards. Insurance and accommodation are on
 * this list because they are the two that are routinely assumed and then found
 * missing at the airport.
 */
export const TRAVEL_CHECKLIST = Object.freeze([
  { key: "visa", label: "Visa granted" },
  { key: "insurance", label: "Health insurance" },
  { key: "accommodation", label: "Accommodation secured" },
  { key: "arrival", label: "Arrival confirmed" },
]);

/* ───────────────────────────────────────────────────────────── helpers ── */

const at = (e) => e.recorded ?? e.time ?? null;
const newestFirst = (a, b) => String(at(b) ?? "").localeCompare(String(at(a) ?? ""));

const daysBetween = (iso, now) => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : Math.round((t - now.getTime()) / 86_400_000);
};

/**
 * Which institution an event concerns.
 *
 * Read from the payload the event carried. Events that name no institution are
 * grouped under a single "unattributed" bucket rather than dropped — an
 * application whose university nobody recorded is still an application, and
 * hiding it would make the pipeline look tidier than it is.
 */
function institutionOf(entry) {
  const d = entry.decision ?? {};
  const name = d.institution ?? d.university ?? d.destination ?? null;
  const id = d.institution_id ?? d.institution_ref ?? null;
  return { id, name: name ?? null, key: id ?? name ?? "__unattributed__" };
}

/* ═══════════════════════════════════════════════════════════ workspace ═══ */

/**
 * Who this student is, who owns them, and where they are.
 *
 * The profile deliberately carries NO identity fields from the vault. Name and
 * date of birth live encrypted, and the Career Record releases them through one
 * audited route only (an export). Rendering them on a staff console would have
 * created a second, unlogged release path — which is the hole the vault exists to
 * close. Staff see the pseudonymous record id and the commercial frame.
 */
export function studentWorkspace(caseRow, entries = [], now = new Date()) {
  const stage = caseRow?.Stage ?? null;
  // The business records deadlines in the provisioned `Next Deadline` field;
  // `Closing_Date` is Zoho's standard Deal close date and is the fallback. Reading
  // only the standard one showed an empty deadline to a team using the custom one.
  const nextDeadline = caseRow?.Next_Deadline ?? caseRow?.Closing_Date ?? null;

  const profileEvents = entries.filter((e) => e.type?.startsWith("profile."));
  const opened = profileEvents.at(-1) ?? entries.at(-1) ?? null;

  return {
    case_id: caseRow?.id ?? null,
    subject_id: caseRow?.Career_Record_Id ?? null,
    name: caseRow?.Deal_Name ?? "Unnamed case",
    stage,
    service_package: caseRow?.Service_Package ?? null,
    destination: caseRow?.Destination_Country ?? null,
    lane: caseRow?.Lane ?? null,
    counsellor: {
      id: caseRow?.["Owner.id"] ?? caseRow?.Owner?.id ?? null,
      name: caseRow?.["Owner.name"] ?? caseRow?.Owner?.name ?? null,
    },
    next_deadline: nextDeadline,
    days_to_deadline: nextDeadline ? daysBetween(nextDeadline, now) : null,
    deadline_passed: nextDeadline ? (daysBetween(nextDeadline, now) ?? 0) < 0 : false,
    opened_at: opened ? at(opened) : null,
    last_activity_at: entries.length ? at([...entries].sort(newestFirst)[0]) : null,
    // Progress is the record's own history, newest first — the same projection
    // the student sees in their portal, so staff and student never disagree.
    progress: [...entries].sort(newestFirst).map((e) => ({
      event_id: e.event_id,
      type: e.type,
      at: at(e),
      actor: e.actor?.role ?? null,
      authored_by_ai: e.authored_by_ai === true,
    })),
  };
}

/* ════════════════════════════════════════════════ application pipeline ═══ */

/**
 * Every university this student applied to, and where each stands.
 *
 * Folded from the log in recorded order, so the LAST thing that happened to an
 * application decides its state. Reconstructing from the latest event rather than
 * storing a status field is what makes "we recorded a rejection after the offer"
 * resolve correctly instead of depending on which write landed last.
 */
export function applicationPipeline(entries = [], now = new Date()) {
  const byInstitution = new Map();

  const transition = {
    "application.prepared": "Preparing",
    "application.submitted": "Submitted",
    "admission.offered": "Offer",
    "admission.deferred": "Deferred",
    "admission.accepted": "Accepted",
    "admission.declined": "Declined",
  };

  const ordered = [...entries].sort((a, b) => String(at(a) ?? "").localeCompare(String(at(b) ?? "")));

  for (const entry of ordered) {
    const state = transition[entry.type];
    const isOutcome = entry.type === "application.outcome_received";
    if (!state && !isOutcome) continue;

    const inst = institutionOf(entry);
    if (!byInstitution.has(inst.key)) {
      byInstitution.set(inst.key, {
        institution: inst,
        state: "Preparing",
        history: [],
        submitted_at: null,
        decided_at: null,
        programme: entry.decision?.programme ?? entry.decision?.course ?? null,
      });
    }
    const application = byInstitution.get(inst.key);

    // An outcome event carries its own verdict; a state event names it directly.
    const outcome = isOutcome ? String(entry.decision?.outcome ?? "").toLowerCase() : null;
    const resolved = isOutcome
      ? outcome.includes("reject") ? "Rejected" : outcome.includes("offer") ? "Offer" : outcome.includes("defer") ? "Deferred" : application.state
      : state;

    application.state = resolved;
    application.programme = entry.decision?.programme ?? entry.decision?.course ?? application.programme;
    if (entry.type === "application.submitted") application.submitted_at = at(entry);
    if (["Offer", "Rejected", "Deferred", "Accepted", "Declined"].includes(resolved)) application.decided_at = at(entry);
    application.history.push({ type: entry.type, at: at(entry), state: resolved });
  }

  const applications = [...byInstitution.values()].map((a) => ({
    ...a,
    // Days spent waiting on a decision — the number a counsellor is asked for and
    // otherwise has to work out from two dates in different screens.
    waiting_days: a.submitted_at && !a.decided_at ? Math.abs(daysBetween(a.submitted_at, now) ?? 0) : null,
    // Keyed on whether a decision was RECORDED, not on which state we are in: an
    // offer is a decision, so an application holding one is not "awaiting" one
    // even though the student has yet to respond to it.
    awaiting_decision: Boolean(a.submitted_at) && !a.decided_at,
  }));

  const inState = (state) => applications.filter((a) => a.state === state);

  return {
    applications,
    counts: {
      total: applications.length,
      preparing: inState("Preparing").length,
      submitted: inState("Submitted").length,
      offers: inState("Offer").length + inState("Accepted").length,
      rejections: inState("Rejected").length,
      awaiting_decision: applications.filter((a) => a.awaiting_decision).length,
    },
    offers: applications.filter((a) => a.state === "Offer" || a.state === "Accepted"),
    rejections: inState("Rejected"),
    awaiting: applications.filter((a) => a.awaiting_decision),
  };
}

/* ═══════════════════════════════════════════════════════ document centre ═══ */

/**
 * What has been submitted, what is verified, and what is still missing.
 *
 * Verification state is the LATEST document event per document, so a document
 * that was rejected after being submitted reads as rejected — which is the
 * operationally important direction to get right.
 */
export function documentCenter(entries = [], required = REQUIRED_STUDENT_DOCUMENTS) {
  const documents = new Map();

  const stateOf = {
    "document.submitted": "Submitted",
    "document.verified": "Verified",
    "document.rejected": "Rejected",
    "document.expired": "Expired",
    "document.superseded": "Superseded",
  };

  const ordered = [...entries].sort((a, b) => String(at(a) ?? "").localeCompare(String(at(b) ?? "")));

  for (const entry of ordered) {
    const state = stateOf[entry.type];
    if (!state) continue;
    const name = entry.decision?.document ?? entry.decision?.name ?? "Unnamed document";
    const key = name.toLowerCase();
    documents.set(key, {
      name,
      state,
      at: at(entry),
      // Evidence references travel with the event; a document claimed without one
      // is shown as claimed, never as evidenced.
      evidence: (entry.evidence ?? []).map((v) => v.ref),
    });
  }

  const held = [...documents.values()];
  const names = held.map((d) => d.name.toLowerCase());

  const checklist = required.map((req) => {
    const match = held.find((d) => d.name.toLowerCase().includes(req.key));
    return {
      key: req.key,
      label: req.label,
      present: Boolean(match),
      state: match?.state ?? "Missing",
      verified: match?.state === "Verified",
    };
  });

  // What a counsellor should actually do next, in the order it blocks progress.
  const actions = [
    ...checklist.filter((c) => !c.present).map((c) => ({ kind: "collect", severity: "action", label: `Collect ${c.label}` })),
    ...held.filter((d) => d.state === "Rejected").map((d) => ({ kind: "replace", severity: "alert", label: `${d.name} was rejected — collect a replacement` })),
    ...held.filter((d) => d.state === "Expired").map((d) => ({ kind: "renew", severity: "alert", label: `${d.name} has expired` })),
    ...held.filter((d) => d.state === "Submitted").map((d) => ({ kind: "verify", severity: "action", label: `Verify ${d.name}` })),
  ];

  return {
    documents: held.sort((a, b) => String(b.at ?? "").localeCompare(String(a.at ?? ""))),
    checklist,
    missing: checklist.filter((c) => !c.present).map((c) => c.label),
    verified_count: checklist.filter((c) => c.verified).length,
    required_count: checklist.length,
    complete: checklist.every((c) => c.verified),
    actions,
    void: names.length === 0,
  };
}

/* ═══════════════════════════════════════════════════════════ visa pipeline ═══ */

/**
 * Where the visa stands, and what remains before travel.
 *
 * Insurance and accommodation are read from the log as their own events rather
 * than inferred from the visa state: a granted visa says nothing about whether a
 * student has anywhere to sleep.
 */
export function visaPipeline(entries = [], caseRow = null, now = new Date()) {
  const latest = (types) =>
    [...entries].filter((e) => types.includes(e.type)).sort(newestFirst)[0] ?? null;

  const applied = latest(["visa.applied"]);
  const granted = latest(["visa.granted"]);
  const refused = latest(["visa.refused"]);
  const arrival = latest(["arrival.confirmed"]);
  const accommodation = latest(["arrival.accommodation_secured"]);

  // Refusal and grant can both exist across a reapplication; the later one stands.
  const decision = [granted, refused]
    .filter(Boolean)
    .sort(newestFirst)[0] ?? null;

  const status = decision
    ? decision.type === "visa.granted" ? "Granted" : "Refused"
    : applied ? "Lodged" : (caseRow?.Visa_Status ?? "Not started");

  const insurance = entries.find((e) => /insurance/i.test(String(e.decision?.item ?? e.decision?.document ?? "")));

  const checklist = [
    { key: "visa", label: "Visa granted", done: status === "Granted" },
    { key: "insurance", label: "Health insurance", done: Boolean(insurance) },
    { key: "accommodation", label: "Accommodation secured", done: Boolean(accommodation) },
    { key: "arrival", label: "Arrival confirmed", done: Boolean(arrival) },
  ];

  return {
    status,
    // The CRM's own Visa_Status is carried through so a case updated in Zoho and
    // one updated through the record never silently disagree — if they differ,
    // both are shown rather than one quietly winning.
    crm_status: caseRow?.Visa_Status ?? null,
    diverges_from_crm: Boolean(caseRow?.Visa_Status) && caseRow.Visa_Status !== status && status !== "Not started",
    lodged_at: applied ? at(applied) : null,
    decided_at: decision ? at(decision) : null,
    waiting_days: applied && !decision ? Math.abs(daysBetween(at(applied), now) ?? 0) : null,
    interview: latest(["visa.interview_scheduled"]) ? { at: at(latest(["visa.interview_scheduled"])) } : null,
    checklist,
    ready_to_travel: checklist.every((c) => c.done),
    outstanding: checklist.filter((c) => !c.done).map((c) => c.label),
  };
}

/* ════════════════════════════════════════════════ communication timeline ═══ */

/**
 * Everything said to or about this student, in one history.
 *
 * Merged from the Career Record (counselling sessions, notes, disclosures) and
 * the CRM (notes, calls, meetings) — the two places communication actually
 * happens. Derived on read, never stored, for the same reason the partnership
 * timeline is: a second copy is a second thing to keep in step.
 */
export function communicationTimeline({ entries = [], notes = [], calls = [], meetings = [], now = new Date() } = {}) {
  const items = [];

  const RECORD_COMMS = new Set([
    "counselling.session_held",
    "counselling.summary_issued",
    "counselling.note_added",
    "recommendation.issued",
    "recommendation.acknowledged",
    "recommendation.declined",
  ]);

  for (const entry of entries) {
    if (!RECORD_COMMS.has(entry.type)) continue;
    items.push({
      kind: entry.type.startsWith("recommendation.") ? "recommendation" : "counselling",
      channel: "record",
      at: at(entry),
      title: entry.decision?.topic ?? entry.decision?.summary ?? entry.type,
      detail: entry.decision?.follow_up ?? null,
      actor: entry.actor?.role ?? null,
    });
  }

  for (const note of notes) {
    items.push({
      kind: "note",
      channel: "crm",
      at: note.at ?? note.Created_Time ?? null,
      title: note.title ?? note.Note_Title ?? "Note",
      detail: note.content ?? note.Note_Content ?? "",
      actor: null,
    });
  }

  for (const call of calls) {
    items.push({
      kind: "call",
      channel: "crm",
      at: call.Call_Start_Time ?? call.Created_Time ?? null,
      title: call.Subject ?? "Call",
      detail: [call.Call_Duration ? `${call.Call_Duration}` : null, call.Description].filter(Boolean).join(" — "),
      actor: call["Owner.name"] ?? call.Owner?.name ?? null,
    });
  }

  for (const meeting of meetings) {
    items.push({
      kind: "meeting",
      channel: "crm",
      at: meeting.Start_DateTime ?? meeting.Created_Time ?? null,
      title: meeting.Event_Title ?? "Meeting",
      detail: meeting.Venue ?? null,
      actor: meeting["Owner.name"] ?? meeting.Owner?.name ?? null,
    });
  }

  const dated = items.filter((i) => i.at).sort((a, b) => String(b.at).localeCompare(String(a.at)));

  return {
    items: dated,
    counts: {
      total: dated.length,
      counselling: dated.filter((i) => i.kind === "counselling").length,
      notes: dated.filter((i) => i.kind === "note").length,
      calls: dated.filter((i) => i.kind === "call").length,
      meetings: dated.filter((i) => i.kind === "meeting").length,
    },
    last_contact_at: dated[0]?.at ?? null,
    days_since_contact: dated[0]?.at ? Math.abs(daysBetween(dated[0].at, now) ?? 0) : null,
  };
}

/* ═════════════════════════════════════════════════════ student dashboard ═══ */

/**
 * One student, summarised — and what needs a person.
 *
 * The attention list is the point. Everything in it is silent on its own: a
 * document rejected weeks ago, an application submitted and never chased, a
 * student nobody has spoken to since the agreement was signed.
 */
export function studentDashboard({ workspace, applications, documents, visa, communication, now = new Date(), silentAfterDays = 21 } = {}) {
  const attention = [];

  if (workspace.deadline_passed) {
    attention.push({
      kind: "deadline_passed",
      severity: "alert",
      title: "The next deadline has passed",
      detail: `${workspace.next_deadline} — the case still shows "${workspace.stage}".`,
    });
  }

  for (const action of documents.actions.filter((a) => a.severity === "alert")) {
    attention.push({ kind: "document", severity: "alert", title: action.label, detail: "A rejected or expired document blocks the visa application." });
  }

  for (const app of applications.awaiting.filter((a) => (a.waiting_days ?? 0) >= 30)) {
    attention.push({
      kind: "application_stalled",
      severity: "action",
      title: `${app.institution.name ?? "An application"} has been waiting ${app.waiting_days} days`,
      detail: "Submitted with no decision recorded. Chase the institution.",
    });
  }

  if (communication.days_since_contact !== null && communication.days_since_contact >= silentAfterDays) {
    attention.push({
      kind: "no_contact",
      severity: "action",
      title: `No contact in ${communication.days_since_contact} days`,
      detail: "A student who stops hearing from us is a student who starts looking elsewhere.",
    });
  }

  if (visa.status === "Refused") {
    attention.push({ kind: "visa_refused", severity: "alert", title: "Visa refused", detail: "The student needs a plan, and quickly." });
  }

  if (documents.missing.length) {
    attention.push({
      kind: "documents_missing",
      severity: "action",
      title: `${documents.missing.length} required document(s) missing`,
      detail: documents.missing.join(", "),
    });
  }

  const rank = { alert: 0, action: 1, info: 2 };
  attention.sort((a, b) => (rank[a.severity] ?? 3) - (rank[b.severity] ?? 3));

  return {
    stage: workspace.stage,
    counsellor: workspace.counsellor,
    next_deadline: workspace.next_deadline,
    days_to_deadline: workspace.days_to_deadline,
    applications: applications.counts,
    documents: {
      verified: documents.verified_count,
      required: documents.required_count,
      missing: documents.missing.length,
      complete: documents.complete,
    },
    visa: { status: visa.status, ready_to_travel: visa.ready_to_travel, outstanding: visa.outstanding.length },
    communication: { last_contact_at: communication.last_contact_at, days_since_contact: communication.days_since_contact },
    attention,
    silent_after_days: silentAfterDays,
  };
}
