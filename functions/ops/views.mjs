/**
 * Operations — projections from CRM rows to view models.
 *
 * Collaboration entities (institutions, contacts, meetings, documents) live in
 * collaboration.mjs, which owns that vocabulary end to end.
 *
 * One place where Zoho's field vocabulary (`Last_Name`, `Lead_Status`, `$se_module`)
 * becomes the platform's. Every endpoint and every view above this line speaks
 * RichenQuest, so replacing or renaming a CRM field is a change here and nowhere
 * else — the same reason the Career Record keeps `views.mjs` between its log and
 * its API.
 *
 * Pure functions only: no network, no DOM, no clock except the one passed in. That
 * is what makes the SLA arithmetic testable to the minute.
 */

/* ────────────────────────────────────────────────────────── field lists ── */

// Requested explicitly rather than `select *`: COQL caps the column count, and an
// unbounded select silently starts failing as the CRM schema grows.
export const LEAD_FIELDS = Object.freeze([
  "id", "First_Name", "Last_Name", "Email", "Phone", "Lead_Status", "Lead_Source",
  "Created_Time", "Modified_Time", "Owner.id", "Owner.name",
]);

export const STUDENT_FIELDS = Object.freeze([
  "id", "Deal_Name", "Stage", "Amount", "Closing_Date", "Next_Deadline", "Modified_Time",
  "Career_Record_Id", "Destination_Country", "Visa_Status", "Service_Package", "Lane",
  "Owner.id", "Owner.name",
]);

export const TASK_FIELDS = Object.freeze([
  "id", "Subject", "Status", "Priority", "Due_Date", "Created_Time", "Owner.id", "Owner.name",
]);

/* ──────────────────────────────────────────────────────────── ownership ── */

/**
 * The owner id of a CRM row, or null when unassigned.
 *
 * COQL returns a dotted alias (`Owner.id`) while the REST record API returns a
 * nested object (`Owner: { id }`). Both reach this function, so both are handled —
 * getting this wrong would make every scoping check silently pass.
 */
export function ownerIdOf(row) {
  if (!row) return null;
  const value = row["Owner.id"] ?? row.Owner?.id ?? row.owner_id ?? null;
  return value === undefined || value === "" ? null : value;
}

const ownerNameOf = (row) => row?.["Owner.name"] ?? row?.Owner?.name ?? null;

/* ───────────────────────────────────────────────────────────────── views ── */

export function leadView(row, now = new Date()) {
  if (!row) return null;
  const name = [row.First_Name, row.Last_Name].filter(Boolean).join(" ").trim();
  const created = row.Created_Time ?? null;
  return {
    id: row.id,
    name: name || row.Email || row.Phone || "Unnamed lead",
    email: row.Email ?? null,
    phone: row.Phone ?? null,
    status: row.Lead_Status ?? null,
    source: row.Lead_Source ?? null,
    owner: { id: ownerIdOf(row), name: ownerNameOf(row) },
    created_at: created,
    waiting_minutes: created ? minutesBetween(created, now) : null,
    contacted: hasBeenContacted(row),
  };
}

export function studentView(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.Deal_Name ?? "Unnamed case",
    stage: row.Stage ?? null,
    value: row.Amount ?? null,
    next_deadline: row.Closing_Date ?? null,
    owner: { id: ownerIdOf(row), name: ownerNameOf(row) },
    updated_at: row.Modified_Time ?? null,
  };
}

export function taskView(row) {
  if (!row) return null;
  return {
    id: row.id,
    subject: row.Subject ?? "Untitled task",
    status: row.Status ?? "Not Started",
    priority: row.Priority ?? "Normal",
    due_date: row.Due_Date ?? null,
    owner: { id: ownerIdOf(row), name: ownerNameOf(row) },
    created_at: row.Created_Time ?? null,
  };
}

/* ────────────────────────────────────────────────────────────── the SLA ── */

/**
 * The speed-to-lead promise, in minutes.
 *
 * Titan's live handler tells every new lead "Call within 5 minutes". Until this
 * function existed nothing measured whether that happened, which made the promise
 * unfalsifiable — operationally the same as not having made it. Defined here so
 * the dashboard, the analytics endpoint and any future alert all use one number.
 */
export const SPEED_TO_LEAD_TARGET_MINUTES = 5;

/**
 * A lead counts as contacted once its status has moved off the entry states.
 *
 * Deliberately conservative: an unrecognised status counts as contacted, so a new
 * CRM picklist value can never silently inflate the breach count and cry wolf. The
 * cost of that choice is under-reporting a real breach, which surfaces elsewhere;
 * the cost of the opposite is a dashboard nobody trusts.
 */
const UNCONTACTED_STATUSES = new Set(["", "None", "Not Contacted", "New", "Attempting Contact"]);

export function hasBeenContacted(row) {
  const status = row?.Lead_Status;
  if (status === null || status === undefined) return false;
  return !UNCONTACTED_STATUSES.has(String(status).trim());
}

export function minutesBetween(iso, now = new Date()) {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  return Math.max(0, Math.round((now.getTime() - then) / 60_000));
}

/**
 * Measure the speed-to-lead promise across a set of leads.
 *
 * `awaiting` — uncontacted and still inside the window (someone should call now)
 * `breached` — uncontacted and past the window (the promise is already broken)
 * `measured` — every lead the window can be evaluated against
 *
 * Leads with no creation timestamp are excluded rather than counted as compliant:
 * an unmeasurable lead is not a successful one.
 */
export function slaFor(rows, now = new Date(), targetMinutes = SPEED_TO_LEAD_TARGET_MINUTES) {
  const measured = [];
  const awaiting = [];
  const breached = [];

  for (const row of rows) {
    const waited = minutesBetween(row.Created_Time, now);
    if (waited === null) continue;
    measured.push(row);
    if (hasBeenContacted(row)) continue;
    (waited > targetMinutes ? breached : awaiting).push(row);
  }

  const waits = measured
    .map((row) => minutesBetween(row.Created_Time, now))
    .filter((n) => n !== null)
    .sort((a, b) => a - b);

  return {
    targetMinutes,
    measured,
    awaiting,
    breached,
    medianMinutes: waits.length ? waits[Math.floor(waits.length / 2)] : null,
  };
}

/** Is an open task past its due date? A task with no due date is never overdue. */
export function isOverdue(task, now = new Date()) {
  if (!task?.due_date || task.status === "Completed") return false;
  return task.due_date < now.toISOString().slice(0, 10);
}
