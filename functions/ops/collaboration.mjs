/**
 * Collaboration CRM — vocabulary and projections.
 *
 * WHAT THIS IS
 * The B2B side of the operation: universities we know about, institutions we
 * partner with, the people inside them, and the state of each relationship.
 * Kishor (Strategic Partnerships) and Tahir (Regional Partnerships) are the roles
 * this exists for; today the founder holds all of it.
 *
 * EVERY ENTITY MAPS ONTO AN EXISTING ZOHO MODULE — no new infrastructure, no
 * custom module that would need provisioning before the console works:
 *
 *   University database   ─┐
 *   Partner institutions  ─┴─→  Accounts   (one module, distinguished by type)
 *   Contacts                 →  Contacts
 *   Meetings                 →  Events
 *   Notes                    →  Notes
 *   Documents                →  Attachments
 *   Pipeline / agreements / status → fields ON the Account
 *   Timeline                 →  DERIVED here, stored nowhere
 *
 * Universities and partner institutions are ONE table on purpose. A university we
 * are merely tracking and one we have signed with are the same organisation at
 * two points on the same pipeline — splitting them would mean migrating a record
 * between tables at the exact moment the relationship becomes valuable, and would
 * lose every note and meeting that got it there.
 *
 * Pure functions only: no network, no DOM, no clock except the one passed in.
 */

/* ─────────────────────────────────────────────────────────── vocabulary ── */

/**
 * What kind of organisation this is. Mirrors the `future_ready` lead types in
 * config/tenant-richenquest.json so the CRM and this console cannot disagree
 * about what an institution is called.
 */
export const INSTITUTION_TYPES = Object.freeze([
  "University",
  "Partner Institution",
  "Recruitment Agent",
  "Corporate",
  "Employer",
  "Government",
  "Organization",
]);

/**
 * The partnership pipeline.
 *
 * Deliberately shorter than the student pipeline: a partnership has fewer, larger
 * steps, and a stage nobody can define is a stage nobody updates. `Dormant` is a
 * real terminal state rather than a euphemism — a relationship that went quiet is
 * worth recording as quiet, because pretending it is still "In Discussion"
 * corrupts every forecast built on the pipeline.
 */
export const PARTNERSHIP_STAGES = Object.freeze([
  "Identified",
  "Contacted",
  "In Discussion",
  "Agreement Drafted",
  "Agreement Signed",
  "Active",
  "Dormant",
]);

/** Stages that mean a live, working relationship. */
const ACTIVE_STAGES = new Set(["Agreement Signed", "Active"]);

/** Stages still being worked — the actual pipeline. */
const OPEN_STAGES = new Set(["Identified", "Contacted", "In Discussion", "Agreement Drafted"]);

export const AGREEMENT_STATUSES = Object.freeze([
  "None",
  "Drafted",
  "Sent",
  "Signed",
  "Expired",
  "Terminated",
]);

/**
 * WHAT the partnership actually is, as distinct from what kind of organisation
 * the counterparty is. A university can be a commission partner, an exchange
 * partner, or both over time — `Account_Type` answers "who are they", this
 * answers "what have we agreed to do together", and conflating them would make
 * the second unanswerable.
 */
export const PARTNERSHIP_TYPES = Object.freeze([
  "Recruitment (Commission)",
  "Service Fee (Public)",
  "Exchange",
  "Articulation / Pathway",
  "Research",
  "Memorandum of Understanding",
  "Undefined",
]);

/**
 * Everything an institution offers, in one vocabulary.
 *
 * Degrees are the Program Catalogue; the other four are Opportunity Tracking.
 * They are ONE concept — a thing this institution offers our students — stored in
 * one module and served by one set of endpoints with a `kind` filter. Modelling
 * them as two entities would have duplicated an entire CRUD surface, two console
 * views and two sets of tests to express one difference: a category value.
 */
export const OFFERING_KINDS = Object.freeze([
  "Degree",
  "Scholarship",
  "Exchange",
  "Research",
  "Internship",
]);

/** The Program Catalogue is the Degree slice; Opportunities are the rest. */
export const PROGRAM_KINDS = Object.freeze(["Degree"]);
export const OPPORTUNITY_KINDS = Object.freeze(["Scholarship", "Exchange", "Research", "Internship"]);

export const DEGREE_LEVELS = Object.freeze([
  "Bachelor's",
  "Master's",
  "PhD",
  "Diploma",
  "Foundation",
  "Language",
  "Short Course",
]);

/**
 * Documents a partnership must hold before it can be relied on, by partnership
 * type. Derived, not stored: the requirement follows from what kind of agreement
 * this is, so recording it separately would let the two disagree.
 *
 * Matching is by filename substring, deliberately loose. A checklist that only
 * ticks on an exact filename is a checklist everyone works around by renaming
 * files, and then it reports green while the folder is empty.
 */
export const REQUIRED_DOCUMENTS = Object.freeze({
  "Recruitment (Commission)": ["agreement", "commission"],
  "Service Fee (Public)": ["agreement"],
  "Exchange": ["agreement", "mou"],
  "Articulation / Pathway": ["agreement", "curriculum"],
  "Research": ["mou"],
  "Memorandum of Understanding": ["mou"],
  "Undefined": [],
});

/** Human labels for the document keys above, for the console and for alerts. */
const DOCUMENT_LABELS = Object.freeze({
  agreement: "Signed agreement",
  commission: "Commission schedule",
  mou: "Memorandum of understanding",
  curriculum: "Curriculum mapping",
});

/* ─────────────────────────────────────────────────────────── field lists ── */

export const INSTITUTION_FIELDS = Object.freeze([
  "id", "Account_Name", "Account_Type", "Website", "Phone", "Billing_Country", "Billing_City",
  "Description", "Partnership_Stage", "Partnership_Type", "Agreement_Status", "Agreement_Signed_On",
  "Agreement_Expires_On", "Accreditation", "Campus_List", "International_Office_Email",
  "International_Office_Contact", "Created_Time", "Modified_Time", "Owner.id", "Owner.name",
]);

export const OFFERING_FIELDS = Object.freeze([
  "id", "Product_Name", "Product_Category", "Description", "Unit_Price", "Product_Active",
  "Degree_Level", "Intakes", "Application_Deadline", "Duration", "Tuition_Currency",
  "Vendor_Name.id", "Vendor_Name.name", "Created_Time", "Modified_Time", "Owner.id", "Owner.name",
]);

export const CONTACT_FIELDS = Object.freeze([
  "id", "First_Name", "Last_Name", "Email", "Phone", "Title", "Department",
  "Account_Name.id", "Account_Name.name", "Created_Time", "Owner.id", "Owner.name",
]);

export const MEETING_FIELDS = Object.freeze([
  "id", "Event_Title", "Start_DateTime", "End_DateTime", "Venue", "Description",
  "What_Id.id", "What_Id.name", "Created_Time", "Owner.id", "Owner.name",
]);

/* ────────────────────────────────────────────────────────────── helpers ── */

const ownerOf = (row) => row?.["Owner.id"] ?? row?.Owner?.id ?? null;
const ownerName = (row) => row?.["Owner.name"] ?? row?.Owner?.name ?? null;

/** COQL returns dotted aliases; the REST record API returns nested objects. */
function linked(row, prefix) {
  const id = row?.[`${prefix}.id`] ?? row?.[prefix]?.id ?? null;
  const name = row?.[`${prefix}.name`] ?? row?.[prefix]?.name ?? null;
  return id || name ? { id, name } : null;
}

const daysBetween = (iso, now) => {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.round((t - now.getTime()) / 86_400_000);
};

/* ──────────────────────────────────────────────────────────────── views ── */

export function institutionView(row, now = new Date()) {
  if (!row) return null;
  const stage = row.Partnership_Stage ?? "Identified";
  const expiresIn = row.Agreement_Expires_On ? daysBetween(row.Agreement_Expires_On, now) : null;

  return {
    id: row.id,
    name: row.Account_Name ?? "Unnamed institution",
    type: row.Account_Type ?? "Organization",
    website: row.Website ?? null,
    phone: row.Phone ?? null,
    country: row.Billing_Country ?? null,
    city: row.Billing_City ?? null,
    description: row.Description ?? null,

    /**
     * The institutional profile — what a counsellor needs before recommending
     * this university to a student. Campuses arrive as a comma-separated string
     * from a CRM text field and are split here, so the console never has to know
     * how the CRM chose to store a list.
     */
    accreditation: row.Accreditation ?? null,
    campuses: String(row.Campus_List ?? "").split(",").map((c) => c.trim()).filter(Boolean),
    international_office: {
      contact: row.International_Office_Contact ?? null,
      email: row.International_Office_Email ?? null,
    },
    partnership_type: row.Partnership_Type ?? "Undefined",

    stage,
    is_active: ACTIVE_STAGES.has(stage),
    is_open: OPEN_STAGES.has(stage),
    agreement: {
      status: row.Agreement_Status ?? "None",
      signed_on: row.Agreement_Signed_On ?? null,
      expires_on: row.Agreement_Expires_On ?? null,
      expires_in_days: expiresIn,
      // Surfaced rather than left to be noticed: an agreement that lapses
      // silently is a partnership that ends without anyone deciding to end it.
      expiring_soon: expiresIn !== null && expiresIn >= 0 && expiresIn <= 90,
      expired: expiresIn !== null && expiresIn < 0,
    },
    owner: { id: ownerOf(row), name: ownerName(row) },
    created_at: row.Created_Time ?? null,
    updated_at: row.Modified_Time ?? null,
  };
}

export function contactView(row) {
  if (!row) return null;
  const name = [row.First_Name, row.Last_Name].filter(Boolean).join(" ").trim();
  return {
    id: row.id,
    name: name || row.Email || "Unnamed contact",
    email: row.Email ?? null,
    phone: row.Phone ?? null,
    title: row.Title ?? null,
    department: row.Department ?? null,
    institution: linked(row, "Account_Name"),
    owner: { id: ownerOf(row), name: ownerName(row) },
    created_at: row.Created_Time ?? null,
  };
}

export function meetingView(row, now = new Date()) {
  if (!row) return null;
  const start = row.Start_DateTime ?? null;
  const inDays = start ? daysBetween(start, now) : null;
  return {
    id: row.id,
    title: row.Event_Title ?? "Untitled meeting",
    starts_at: start,
    ends_at: row.End_DateTime ?? null,
    venue: row.Venue ?? null,
    notes: row.Description ?? null,
    institution: linked(row, "What_Id"),
    upcoming: inDays !== null && inDays >= 0,
    in_days: inDays,
    owner: { id: ownerOf(row), name: ownerName(row) },
  };
}

export function documentView(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.File_Name ?? "Untitled document",
    size: row.Size ?? null,
    uploaded_at: row.Created_Time ?? null,
    uploaded_by: row["Owner.name"] ?? row.Owner?.name ?? null,
  };
}

/**
 * A degree, scholarship, exchange, research placement or internship.
 *
 * One projection for all five: they differ by `kind`, not by shape. `tuition` is
 * returned with its currency and never formatted here — a number rendered as
 * "€12,000" in the API is a number nobody can sum, compare or convert.
 */
export function offeringView(row, now = new Date()) {
  if (!row) return null;
  const deadline = row.Application_Deadline ?? null;
  const daysLeft = deadline ? daysBetween(deadline, now) : null;

  return {
    id: row.id,
    name: row.Product_Name ?? "Untitled",
    kind: row.Product_Category ?? "Degree",
    level: row.Degree_Level ?? null,
    description: row.Description ?? null,
    tuition: row.Unit_Price ?? null,
    currency: row.Tuition_Currency ?? null,
    duration: row.Duration ?? null,
    // Intakes are a list in a text field, for the same reason campuses are.
    intakes: String(row.Intakes ?? "").split(",").map((i) => i.trim()).filter(Boolean),
    deadline,
    days_to_deadline: daysLeft,
    // A deadline that has passed is stated as passed rather than shown as a date
    // a counsellor has to compare against today in their head.
    deadline_passed: daysLeft !== null && daysLeft < 0,
    closing_soon: daysLeft !== null && daysLeft >= 0 && daysLeft <= 30,
    active: row.Product_Active !== false,
    institution: linked(row, "Vendor_Name"),
    owner: { id: ownerOf(row), name: ownerName(row) },
    updated_at: row.Modified_Time ?? null,
  };
}

/* ────────────────────────────────────────────────── required documents ── */

/**
 * Which required documents this partnership holds, and which are missing.
 *
 * Compared against the attachments actually present, by loose filename match.
 * A partnership whose agreement exists only in somebody's inbox is a partnership
 * we cannot enforce, so "missing" here means "not findable by anyone but the
 * person who filed it" — which is the operationally important sense.
 */
export function documentChecklist(partnershipType, documents = []) {
  const required = REQUIRED_DOCUMENTS[partnershipType] ?? REQUIRED_DOCUMENTS.Undefined;
  const names = documents.map((d) => String(d.name ?? "").toLowerCase());

  const items = required.map((key) => ({
    key,
    label: DOCUMENT_LABELS[key] ?? key,
    present: names.some((name) => name.includes(key)),
  }));

  return {
    partnership_type: partnershipType,
    items,
    missing: items.filter((i) => !i.present).map((i) => i.label),
    complete: items.every((i) => i.present),
    // An undefined partnership type requires nothing, which is technically
    // "complete" — flagged so it cannot be mistaken for a satisfied checklist.
    unenforceable: required.length === 0,
  };
}

/* ─────────────────────────────────────────────────────────────── timeline ── */

/**
 * One chronological history of a relationship, merged from what already exists:
 * notes written, meetings held or scheduled, and the agreement milestones
 * recorded on the institution itself.
 *
 * DERIVED, NEVER STORED. A second copy of the history would be a second thing to
 * keep in step, and the first time they disagreed nobody would know which was
 * true. Everything here is reconstructed on read from records that have their own
 * reason to exist.
 *
 * Newest first: the question being asked is almost always "where did we leave
 * this?", not "how did it begin".
 */
export function collaborationTimeline({ institution, notes = [], meetings = [], now = new Date() } = {}) {
  const entries = [];

  if (institution?.created_at) {
    entries.push({
      kind: "created",
      at: institution.created_at,
      title: `${institution.name} added to the collaboration register`,
      detail: institution.type,
    });
  }

  for (const note of notes) {
    entries.push({
      kind: "note",
      at: note.at ?? note.Created_Time ?? null,
      title: note.title ?? note.Note_Title ?? "Note",
      detail: note.content ?? note.Note_Content ?? "",
    });
  }

  for (const meeting of meetings) {
    const view = meeting.starts_at ? meeting : meetingView(meeting, now);
    entries.push({
      kind: "meeting",
      at: view.starts_at,
      title: view.title,
      detail: [view.venue, view.notes].filter(Boolean).join(" — "),
      upcoming: view.upcoming,
    });
  }

  const agreement = institution?.agreement;
  if (agreement?.signed_on) {
    entries.push({
      kind: "agreement",
      at: agreement.signed_on,
      title: "Agreement signed",
      detail: agreement.expires_on ? `Runs until ${agreement.expires_on}.` : "No end date recorded.",
    });
  }
  if (agreement?.expired) {
    entries.push({
      kind: "agreement_expired",
      at: agreement.expires_on,
      title: "Agreement expired",
      detail: "The partnership has no agreement in force.",
    });
  }

  return entries
    .filter((e) => e.at)
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

/* ──────────────────────────────────────────────────────────── the summary ── */

/**
 * Pipeline health across a set of institutions.
 *
 * Counts by stage, plus the two things that need a person: agreements about to
 * lapse, and open relationships nobody has touched. `stale_after_days` is a
 * parameter rather than a constant because a partnership moves on a different
 * clock from a lead — weeks, not minutes.
 */
export function partnershipSummary(institutions, now = new Date(), { staleAfterDays = 45 } = {}) {
  const byStage = Object.fromEntries(PARTNERSHIP_STAGES.map((s) => [s, 0]));
  const byType = {};
  const expiring = [];
  const stale = [];

  for (const inst of institutions) {
    byStage[inst.stage] = (byStage[inst.stage] ?? 0) + 1;
    byType[inst.type] = (byType[inst.type] ?? 0) + 1;

    if (inst.agreement.expiring_soon || inst.agreement.expired) expiring.push(inst);

    if (inst.is_open && inst.updated_at) {
      const idle = Math.abs(daysBetween(inst.updated_at, now) ?? 0);
      if (idle >= staleAfterDays) stale.push({ ...inst, idle_days: idle });
    }
  }

  return {
    total: institutions.length,
    active: institutions.filter((i) => i.is_active).length,
    open: institutions.filter((i) => i.is_open).length,
    by_stage: byStage,
    by_type: byType,
    expiring_agreements: expiring,
    stale: stale.sort((a, b) => b.idle_days - a.idle_days),
    stale_after_days: staleAfterDays,
  };
}

/* ────────────────────────────────────────────────── renewal intelligence ── */

/**
 * How long an active partnership may go unattended before someone should look.
 *
 * Separate from the pipeline staleness threshold: a signed partnership is not
 * being *worked*, so silence means something different — and a signed partnership
 * that nobody has spoken to in six months is how a renewal gets missed.
 */
export const PARTNERSHIP_SLA_DAYS = 180;

/**
 * The single answer to "what will break if nobody does anything".
 *
 * Four failure modes, each silent on its own: an agreement lapses, a required
 * document was never filed, a live partnership goes unattended past its SLA, and
 * a deal in the pipeline goes quiet. Every one of them is invisible until it
 * costs something, which is exactly why they are computed rather than remembered.
 *
 * Returned as one ordered list — severity first, then urgency — because an
 * operator opening this needs a queue to work, not four separate dashboards to
 * cross-reference.
 *
 * @param {Array} institutions           institutionView() results
 * @param {Map<string,object>} checklists  institution id → documentChecklist()
 */
export function renewalIntelligence(institutions, { now = new Date(), checklists = new Map(), slaDays = PARTNERSHIP_SLA_DAYS, staleAfterDays = 45 } = {}) {
  const items = [];

  for (const inst of institutions) {
    const agreement = inst.agreement ?? {};

    if (agreement.expired) {
      items.push({
        kind: "agreement_expired",
        severity: "alert",
        institution: { id: inst.id, name: inst.name },
        title: `${inst.name} — agreement has expired`,
        detail: `Lapsed ${Math.abs(agreement.expires_in_days)} days ago. There is no agreement in force.`,
        due_in_days: agreement.expires_in_days,
      });
    } else if (agreement.expiring_soon) {
      items.push({
        kind: "renewal_due",
        severity: "action",
        institution: { id: inst.id, name: inst.name },
        title: `${inst.name} — renewal due`,
        detail: `Agreement expires in ${agreement.expires_in_days} days.`,
        due_in_days: agreement.expires_in_days,
      });
    }

    // Documents are only worth chasing where a partnership actually exists to
    // enforce; chasing an MoU from a university at "Identified" is noise.
    const checklist = checklists.get(inst.id);
    if (checklist && inst.is_active && !checklist.complete) {
      items.push({
        kind: "missing_documents",
        severity: "alert",
        institution: { id: inst.id, name: inst.name },
        title: `${inst.name} — ${checklist.missing.length} required document(s) missing`,
        detail: `${checklist.missing.join(", ")}. An agreement we cannot produce is an agreement we cannot enforce.`,
        missing: checklist.missing,
      });
    }

    const idle = inst.updated_at ? Math.abs(daysBetween(inst.updated_at, now) ?? 0) : null;

    if (inst.is_active && idle !== null && idle >= slaDays) {
      items.push({
        kind: "sla_breach",
        severity: "action",
        institution: { id: inst.id, name: inst.name },
        title: `${inst.name} — no contact in ${idle} days`,
        detail: `An active partnership should be touched at least every ${slaDays} days.`,
        idle_days: idle,
      });
    }

    if (inst.is_open && idle !== null && idle >= staleAfterDays) {
      items.push({
        kind: "inactive",
        severity: "info",
        institution: { id: inst.id, name: inst.name },
        title: `${inst.name} has gone quiet`,
        detail: `${idle} days since anything was recorded, still at "${inst.stage}".`,
        idle_days: idle,
      });
    }
  }

  const rank = { alert: 0, action: 1, info: 2 };
  items.sort((a, b) => {
    const bySeverity = (rank[a.severity] ?? 3) - (rank[b.severity] ?? 3);
    if (bySeverity !== 0) return bySeverity;
    // Within a severity, soonest first. Items with no clock sort last.
    const av = a.due_in_days ?? a.idle_days ?? Number.MAX_SAFE_INTEGER;
    const bv = b.due_in_days ?? b.idle_days ?? Number.MAX_SAFE_INTEGER;
    return av - bv;
  });

  return {
    items,
    counts: {
      total: items.length,
      alerts: items.filter((i) => i.severity === "alert").length,
      actions: items.filter((i) => i.severity === "action").length,
      renewals_due: items.filter((i) => i.kind === "renewal_due" || i.kind === "agreement_expired").length,
      missing_documents: items.filter((i) => i.kind === "missing_documents").length,
      sla_breaches: items.filter((i) => i.kind === "sla_breach").length,
      inactive: items.filter((i) => i.kind === "inactive").length,
    },
    sla_days: slaDays,
    stale_after_days: staleAfterDays,
  };
}
