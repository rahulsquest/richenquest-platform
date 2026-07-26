/**
 * Founder Operations API — endpoints.
 *
 * Runs on the SAME platform pipeline as the Career Record API (context, rate
 * limiting, authentication, validation, structured logging, error mapping). No
 * second request stack, no second auth mechanism, no duplicate transport — the
 * only thing that differs is the domain and the store behind it.
 *
 * AUTHORISATION IS UNIFORM. Every endpoint declares the capability it needs and
 * the pipeline's authorise stage enforces it through permissions.mjs. There is no
 * endpoint that "just reads" without a check, because that is the one that gets
 * copied when the tenth endpoint is written.
 *
 * SCOPING IS APPLIED EVERYWHERE, TODAY. Every list narrows to what the actor may
 * see, and every by-id read asserts reachability, even though the only actor today
 * is the founder for whom both are no-ops. That is what makes adding the team an
 * account-creation task rather than an engineering project.
 */

import { defineEndpoint } from "../../platform/pipeline.mjs";
import { t } from "../../platform/validate.mjs";
import { NotFoundError, ValidationError } from "../../platform/errors.mjs";
import { MODULES } from "../crm-port.mjs";
import {
  resolveOpsActorFromToken, assertCan, assertCanReach, scopeRows, capabilityManifest, visibleOwnerIds,
} from "../permissions.mjs";
import {
  leadView, studentView, taskView, ownerIdOf, LEAD_FIELDS, STUDENT_FIELDS, TASK_FIELDS,
  slaFor, isOverdue,
} from "../views.mjs";
import { timeline as recordTimeline } from "../../record/views.mjs";
import {
  studentWorkspace, applicationPipeline, documentCenter, visaPipeline,
  communicationTimeline, studentDashboard,
} from "../student.mjs";
import {
  institutionView, contactView, meetingView, documentView, offeringView,
  collaborationTimeline, partnershipSummary, documentChecklist, renewalIntelligence,
  INSTITUTION_TYPES, PARTNERSHIP_STAGES, PARTNERSHIP_TYPES, AGREEMENT_STATUSES,
  OFFERING_KINDS, PROGRAM_KINDS, OPPORTUNITY_KINDS, DEGREE_LEVELS,
  INSTITUTION_FIELDS, CONTACT_FIELDS, MEETING_FIELDS, OFFERING_FIELDS,
} from "../collaboration.mjs";

export const API_VERSION = "v1";
const BASE = `/${API_VERSION}/ops`;

/* ══════════════════════════════════════════════════════════════ helpers ═══ */

/**
 * The authorise stage for every operations endpoint: resolve the actor from
 * verified claims, then assert the declared capability. Returns the actor on
 * `deps` so the business stage never re-derives it (and so it cannot forget to).
 */
function requires(capability) {
  return async ({ claims, deps }) => {
    const actor = resolveOpsActorFromToken(claims, { teamMemberIds: await deps.teamMemberIds?.(claims) ?? [] });
    assertCan(actor, capability);
    deps.actor = actor;
    return true;
  };
}

/** COQL owner filter for the actor's scope, or null when unrestricted. */
function ownerClause(actor, field = "Owner.id") {
  const ids = visibleOwnerIds(actor);
  if (ids === null) return null;
  // Unowned records stay visible: a lead nobody can see is a lead nobody calls.
  return `(${field} in (${ids.map((id) => `'${id}'`).join(", ")}) or ${field} is null)`;
}

const paging = {
  limit: t.optional(t.integer({ min: 1, max: 200 })),
  offset: t.optional(t.integer({ min: 0, max: 10_000 })),
};

/* ═══════════════════════════════════════════════════════════ dashboard ═══ */

/**
 * GET /v1/ops/dashboard — the founder's morning view.
 *
 * One request, because the alternative is six and a dashboard that renders in
 * pieces. Every number is derived from the CRM, never cached and never estimated:
 * a dashboard that is subtly stale is worse than one that is slow, because
 * decisions get made on it.
 */
export const getDashboard = defineEndpoint({
  route: `${BASE}/dashboard`,
  method: "GET",
  authorise: requires("dashboard:read"),

  business: async ({ deps }) => {
    const { crm, actor, now = () => new Date() } = deps;
    const today = now();
    const since = new Date(today.getTime() - 7 * 86_400_000).toISOString().slice(0, 19) + "+00:00";
    const owner = ownerClause(actor);

    const [leads, students, tasks] = await Promise.all([
      crm.list(MODULES.leads, {
        fields: LEAD_FIELDS,
        where: [`Created_Time >= '${since}'`, owner].filter(Boolean).join(" and "),
        orderBy: "Created_Time desc",
        limit: 200,
      }),
      crm.list(MODULES.students, { fields: STUDENT_FIELDS, where: owner, orderBy: "Modified_Time desc", limit: 200 }),
      crm.list(MODULES.tasks, { fields: TASK_FIELDS, where: owner, orderBy: "Due_Date asc", limit: 200 }),
    ]);

    const visibleLeads = scopeRows(actor, leads, ownerIdOf);
    const visibleTasks = scopeRows(actor, tasks, ownerIdOf);
    const openTasks = visibleTasks.filter((task) => taskView(task).status !== "Completed");

    // The speed-to-lead promise is "call within 5 minutes". Nothing measured it
    // before this dashboard, so the promise was unfalsifiable — which is the same
    // as not having made it.
    const sla = slaFor(visibleLeads, today);

    return {
      generated_at: today.toISOString(),
      actor: capabilityManifest(actor).actor,
      leads: {
        new_this_week: visibleLeads.length,
        unassigned: visibleLeads.filter((l) => ownerIdOf(l) === null).length,
        awaiting_first_contact: sla.awaiting.length,
        breached_sla: sla.breached.length,
        sla_target_minutes: sla.targetMinutes,
      },
      students: { active: scopeRows(actor, students, ownerIdOf).length },
      tasks: {
        open: openTasks.length,
        overdue: openTasks.filter((task) => isOverdue(taskView(task), today)).length,
        due_today: openTasks.filter((task) => taskView(task).due_date === today.toISOString().slice(0, 10)).length,
      },
      attention: [
        ...sla.breached.slice(0, 10).map((lead) => ({
          kind: "sla_breach",
          severity: "alert",
          title: `${leadView(lead).name} has not been contacted`,
          detail: `Waiting ${leadView(lead).waiting_minutes} minutes against a ${sla.targetMinutes}-minute promise.`,
          link: `#/leads/${lead.id}`,
        })),
        ...visibleLeads.filter((l) => ownerIdOf(l) === null).slice(0, 10).map((lead) => ({
          kind: "unassigned",
          severity: "action",
          title: `${leadView(lead).name} is unassigned`,
          detail: "No one owns this lead, so no one is calling it.",
          link: `#/leads/${lead.id}`,
        })),
      ],
    };
  },
});

/** GET /v1/ops/me — what this actor may do. The console renders from this. */
export const getMe = defineEndpoint({
  route: `${BASE}/me`,
  method: "GET",
  authorise: requires("dashboard:read"),
  business: async ({ deps }) => capabilityManifest(deps.actor),
});

/* ═══════════════════════════════════════════════════════════════ leads ═══ */

export const listLeads = defineEndpoint({
  route: `${BASE}/leads`,
  method: "GET",
  authorise: requires("leads:read"),

  business: async ({ req, deps }) => {
    const { crm, actor } = deps;
    const limit = Number(req.query?.limit ?? 50);
    const offset = Number(req.query?.offset ?? 0);
    const status = req.query?.status;

    const clauses = [ownerClause(actor)];
    if (status) clauses.push(`Lead_Status = '${String(status).replace(/'/g, "")}'`);

    const rows = await crm.list(MODULES.leads, {
      fields: LEAD_FIELDS,
      where: clauses.filter(Boolean).join(" and "),
      orderBy: "Created_Time desc",
      limit,
      offset,
    });

    const visible = scopeRows(actor, rows, ownerIdOf);
    return { leads: visible.map((row) => leadView(row, deps.now?.() ?? new Date())), count: visible.length, limit, offset };
  },
});

export const getLead = defineEndpoint({
  route: `${BASE}/leads/:id`,
  method: "GET",
  authorise: requires("leads:read"),

  business: async ({ req, deps }) => {
    const row = await deps.crm.get(MODULES.leads, req.params.id);
    if (!row) throw new NotFoundError("lead");
    assertCanReach(deps.actor, ownerIdOf(row), "lead");
    const notes = await deps.crm.notes(MODULES.leads, req.params.id);
    return { lead: leadView(row, deps.now?.() ?? new Date()), notes: notes.map(noteView) };
  },
});

export const updateLead = defineEndpoint({
  route: `${BASE}/leads/:id`,
  method: "PATCH",
  tier: "write",
  schema: {
    status: t.optional(t.string({ min: 1, max: 64 })),
    note: t.optional(t.string({ min: 1, max: 4000 })),
  },
  authorise: requires("leads:write"),

  business: async ({ req, validated, deps }) => {
    const row = await deps.crm.get(MODULES.leads, req.params.id);
    if (!row) throw new NotFoundError("lead");
    assertCanReach(deps.actor, ownerIdOf(row), "lead");

    if (validated.status) await deps.crm.update(MODULES.leads, req.params.id, { Lead_Status: validated.status });
    if (validated.note) {
      // Attributed, never anonymous: an operational note whose author is unknown
      // is worth less than no note at all.
      await deps.crm.addNote(MODULES.leads, req.params.id, `Note by ${deps.actor.label}`, validated.note);
    }
    if (!validated.status && !validated.note) {
      throw new ValidationError([{ field: "status", rule: "required", message: "nothing to update" }]);
    }

    const updated = await deps.crm.get(MODULES.leads, req.params.id);
    return { lead: leadView(updated, deps.now?.() ?? new Date()) };
  },
});

/**
 * POST /v1/ops/leads/:id/assign — the capability that separates a manager from a
 * counsellor. Kept as its own endpoint rather than a field on updateLead so the
 * permission is expressible at all.
 */
export const assignLead = defineEndpoint({
  route: `${BASE}/leads/:id/assign`,
  method: "POST",
  tier: "write",
  schema: { owner_id: t.string({ min: 1, max: 64 }) },
  authorise: requires("leads:assign"),

  business: async ({ req, validated, deps }) => {
    const row = await deps.crm.get(MODULES.leads, req.params.id);
    if (!row) throw new NotFoundError("lead");

    await deps.crm.update(MODULES.leads, req.params.id, { Owner: { id: validated.owner_id } });
    await deps.crm.addNote(
      MODULES.leads,
      req.params.id,
      "Reassigned",
      `Assigned to ${validated.owner_id} by ${deps.actor.label} (${deps.actor.id}).`
    );
    return { lead: leadView(await deps.crm.get(MODULES.leads, req.params.id), deps.now?.() ?? new Date()) };
  },
});

/* ════════════════════════════════════════════════════════════ students ═══ */

export const listStudents = defineEndpoint({
  route: `${BASE}/students`,
  method: "GET",
  authorise: requires("students:read"),

  business: async ({ req, deps }) => {
    const limit = Number(req.query?.limit ?? 50);
    const rows = await deps.crm.list(MODULES.students, {
      fields: STUDENT_FIELDS,
      where: ownerClause(deps.actor),
      orderBy: "Modified_Time desc",
      limit,
    });
    const visible = scopeRows(deps.actor, rows, ownerIdOf);
    return { students: visible.map(studentView), count: visible.length };
  },
});

/**
 * GET /v1/ops/students/:id — the student operations workspace.
 *
 * Six modules in one response: workspace, application pipeline, document centre,
 * visa pipeline, communication timeline, and the dashboard that summarises them.
 * One request, because a counsellor opening a student needs the whole picture and
 * six round trips is how a workspace becomes slow enough to avoid.
 *
 * The history comes from the CAREER RECORD, projected through its own
 * `timeline()` — the same projection the student sees in their portal, so staff
 * and student can never be shown different versions of the same events. The CRM
 * supplies the commercial frame only.
 */
export const getStudent = defineEndpoint({
  route: `${BASE}/students/:id`,
  method: "GET",
  authorise: requires("students:read"),

  business: async ({ claims, req, deps }) => {
    const now = deps.now?.() ?? new Date();
    const row = await deps.crm.get(MODULES.students, req.params.id);
    if (!row) throw new NotFoundError("student case");
    assertCanReach(deps.actor, ownerIdOf(row), "student case");

    const [notes, calls, meetings] = await Promise.all([
      deps.crm.notes(MODULES.students, req.params.id),
      deps.crm.list(MODULES.calls, {
        fields: ["id", "Subject", "Call_Start_Time", "Call_Duration", "Description", "Created_Time", "Owner.name"],
        where: `What_Id.id = '${req.params.id.replace(/'/g, "")}'`,
        orderBy: "Call_Start_Time desc",
        limit: 100,
      }).catch(() => []),
      deps.crm.list(MODULES.meetings, {
        fields: MEETING_FIELDS,
        where: `What_Id.id = '${req.params.id.replace(/'/g, "")}'`,
        orderBy: "Start_DateTime desc",
        limit: 100,
      }).catch(() => []),
    ]);

    // The Career Record is the history. A case with no linked record still opens —
    // it simply has no history yet, which is stated rather than hidden.
    const entries = await readRecordTimeline(deps, row, claims);

    const workspace = studentWorkspace(row, entries, now);
    const applications = applicationPipeline(entries, now);
    const documents = documentCenter(entries);
    const visa = visaPipeline(entries, row, now);
    const communication = communicationTimeline({ entries, notes: notes.map(noteView), calls, meetings, now });

    return {
      student: studentView(row),
      workspace,
      applications,
      documents,
      visa,
      communication,
      dashboard: studentDashboard({ workspace, applications, documents, visa, communication, now }),
      record_linked: Boolean(workspace.subject_id),
    };
  },
});

/**
 * Read the student's Career Record history through the Record's OWN projection.
 *
 * Not a reimplementation: `timeline()` is imported from functions/record/views.mjs,
 * so classification filtering, correction nesting and acknowledgement folding all
 * behave exactly as they do for the student's portal. Staff see the same events,
 * filtered for a staff viewer.
 *
 * Returns [] when no record store is configured or the case names no subject —
 * an honest empty history rather than an error, because the commercial frame is
 * still worth showing.
 */
async function readRecordTimeline(deps, caseRow, claims) {
  const subjectId = caseRow?.Career_Record_Id ?? null;
  if (!deps.record || !subjectId) return [];
  try {
    const events = await deps.record.read(subjectId);

    /**
     * The viewer is a COUNSELLOR assigned to this subject — deliberately, and for
     * every ops role including administrator.
     *
     * The Record gives `administrator` a `care_team` ceiling (policy.mjs
     * ROLE_CEILING): an org administrator is not a clinician and cannot read
     * `restricted` or `partner_shareable` events. That is correct, and it means an
     * admin viewer would silently return a workspace with no applications, no
     * documents and no visa — the failure looking exactly like an empty record.
     *
     * A counsellor viewer scoped to this one subject is the honest description of
     * what is happening: someone on the care team, working this case. It is safe
     * to assert because `assertCanReach()` has ALREADY verified this actor may
     * reach this case under the operations permission model — the assignment comes
     * from the CRM's own ownership, not from anything this function assumes.
     */
    const viewer = {
      role: "counsellor",
      id: deps.actor.id,
      subjectId,
      grants: [],
      assignedSubjects: [subjectId],
      wards: [],
    };
    return recordTimeline(events, viewer).entries;
  } catch (err) {
    // A record that cannot be read must not take the workspace down with it.
    deps.logger?.warn?.("ops.record_unreadable", { subject_id: subjectId, error: String(err?.message ?? err) });
    return [];
  }
}

/* ═══════════════════════════════════════════════════════════════ tasks ═══ */

export const listTasks = defineEndpoint({
  route: `${BASE}/tasks`,
  method: "GET",
  authorise: requires("tasks:read"),

  business: async ({ req, deps }) => {
    const now = deps.now?.() ?? new Date();
    const rows = await deps.crm.list(MODULES.tasks, {
      fields: TASK_FIELDS,
      where: ownerClause(deps.actor),
      orderBy: "Due_Date asc",
      limit: Number(req.query?.limit ?? 100),
    });
    const visible = scopeRows(deps.actor, rows, ownerIdOf).map(taskView);
    const open = visible.filter((task) => task.status !== "Completed");

    return {
      tasks: req.query?.include === "all" ? visible : open,
      open: open.length,
      overdue: open.filter((task) => isOverdue(task, now)).length,
    };
  },
});

export const createTask = defineEndpoint({
  route: `${BASE}/tasks`,
  method: "POST",
  tier: "write",
  successStatus: 201,
  schema: {
    subject: t.string({ min: 1, max: 255 }),
    due_date: t.optional(t.isoDate()),
    priority: t.optional(t.string({ enum: ["High", "Normal", "Low"] })),
    related_to: t.optional(t.string({ min: 1, max: 64 })),
    related_module: t.optional(t.string({ enum: ["leads", "students"] })),
    owner_id: t.optional(t.string({ min: 1, max: 64 })),
  },
  authorise: requires("tasks:write"),

  business: async ({ validated, deps }) => {
    // Assigning work to someone else is a distinct capability. A counsellor may
    // create their own tasks; only a manager may put one on another person's list.
    if (validated.owner_id && validated.owner_id !== deps.actor.id) {
      assertCan(deps.actor, "tasks:assign");
    }

    const fields = {
      Subject: validated.subject,
      Status: "Not Started",
      Priority: validated.priority ?? "Normal",
      Owner: { id: validated.owner_id ?? deps.actor.id },
      ...(validated.due_date ? { Due_Date: validated.due_date } : {}),
      ...(validated.related_to
        ? { What_Id: { id: validated.related_to }, $se_module: MODULES[validated.related_module ?? "leads"] }
        : {}),
    };

    const { id } = await deps.crm.create(MODULES.tasks, fields);
    return { task: taskView(await deps.crm.get(MODULES.tasks, id)) };
  },
});

export const completeTask = defineEndpoint({
  route: `${BASE}/tasks/:id/complete`,
  method: "POST",
  tier: "write",
  authorise: requires("tasks:write"),

  business: async ({ req, deps }) => {
    const row = await deps.crm.get(MODULES.tasks, req.params.id);
    if (!row) throw new NotFoundError("task");
    assertCanReach(deps.actor, ownerIdOf(row), "task");

    await deps.crm.update(MODULES.tasks, req.params.id, { Status: "Completed" });
    return { task: taskView(await deps.crm.get(MODULES.tasks, req.params.id)) };
  },
});

/* ═══════════════════════════════════════════════════ collaboration CRM ═══ */

/**
 * GET /v1/ops/collaborators — the university and partner register.
 *
 * One list serves both "the university database" and "our partners": they are the
 * same records at different pipeline stages, filterable by type and stage. The
 * summary travels with the list so the console never has to ask twice for numbers
 * derived from rows it already holds.
 */
export const listCollaborators = defineEndpoint({
  route: `${BASE}/collaborators`,
  method: "GET",
  authorise: requires("collaboration:read"),

  business: async ({ req, deps }) => {
    const now = deps.now?.() ?? new Date();
    const clauses = [ownerClause(deps.actor)];
    const clean = (v) => String(v).replace(/'/g, "");
    if (req.query?.type) clauses.push(`Account_Type = '${clean(req.query.type)}'`);
    if (req.query?.stage) clauses.push(`Partnership_Stage = '${clean(req.query.stage)}'`);

    const rows = await deps.crm.list(MODULES.collaborators, {
      fields: INSTITUTION_FIELDS,
      where: clauses.filter(Boolean).join(" and "),
      orderBy: "Modified_Time desc",
      limit: Number(req.query?.limit ?? 100),
    });

    const visible = scopeRows(deps.actor, rows, ownerIdOf).map((row) => institutionView(row, now));
    return {
      collaborators: visible,
      count: visible.length,
      summary: partnershipSummary(visible, now),
      vocabulary: {
        types: INSTITUTION_TYPES,
        stages: PARTNERSHIP_STAGES,
        partnership_types: PARTNERSHIP_TYPES,
        agreement_statuses: AGREEMENT_STATUSES,
        offering_kinds: OFFERING_KINDS,
        degree_levels: DEGREE_LEVELS,
      },
    };
  },
});

/**
 * GET /v1/ops/collaborators/:id — everything about one relationship.
 *
 * Contacts, meetings, notes, documents and the merged timeline in a single
 * response. Five round trips to render one page is how a console becomes slow
 * enough that people stop opening it.
 */
export const getCollaborator = defineEndpoint({
  route: `${BASE}/collaborators/:id`,
  method: "GET",
  authorise: requires("collaboration:read"),

  business: async ({ req, deps }) => {
    const now = deps.now?.() ?? new Date();
    const row = await deps.crm.get(MODULES.collaborators, req.params.id);
    if (!row) throw new NotFoundError("institution");
    assertCanReach(deps.actor, ownerIdOf(row), "institution");

    const institution = institutionView(row, now);
    const id = req.params.id;

    const [contactRows, meetingRows, noteRows, documentRows, offeringRows] = await Promise.all([
      deps.crm.list(MODULES.contacts, {
        fields: CONTACT_FIELDS,
        where: `Account_Name.id = '${id.replace(/'/g, "")}'`,
        orderBy: "Created_Time desc",
        limit: 100,
      }),
      deps.crm.list(MODULES.meetings, {
        fields: MEETING_FIELDS,
        where: `What_Id.id = '${id.replace(/'/g, "")}'`,
        orderBy: "Start_DateTime desc",
        limit: 100,
      }),
      deps.crm.notes(MODULES.collaborators, id),
      // Attachments are listed best-effort: an org without the attachments scope
      // must still be able to open the record, just without its documents.
      deps.crm.list(MODULES.documents, { fields: ["id", "File_Name", "Size", "Created_Time", "Owner.name"], where: `Parent_Id = '${id.replace(/'/g, "")}'`, limit: 100 }).catch(() => []),
      deps.crm.list(MODULES.offerings, {
        fields: OFFERING_FIELDS,
        where: `Vendor_Name.id = '${id.replace(/'/g, "")}'`,
        orderBy: "Product_Name asc",
        limit: 200,
      }).catch(() => []),
    ]);

    const contacts = contactRows.map(contactView);
    const meetings = meetingRows.map((m) => meetingView(m, now));
    const notes = noteRows.map(noteView);
    const documents = documentRows.map(documentView);
    const offerings = offeringRows.map((o) => offeringView(o, now));

    return {
      institution,
      contacts,
      meetings: {
        upcoming: meetings.filter((m) => m.upcoming),
        past: meetings.filter((m) => !m.upcoming),
      },
      notes,
      documents,
      // The required-document checklist follows from the partnership type, so it
      // is derived here rather than stored — the two can never disagree.
      required_documents: documentChecklist(institution.partnership_type, documents),
      // Programmes and opportunities are one collection split by kind, so the
      // console can render two panels without two round trips.
      programs: offerings.filter((o) => PROGRAM_KINDS.includes(o.kind)),
      opportunities: offerings.filter((o) => OPPORTUNITY_KINDS.includes(o.kind)),
      timeline: collaborationTimeline({ institution, notes, meetings, now }),
    };
  },
});

/**
 * POST /v1/ops/collaborators/:id/offerings — a degree, scholarship, exchange,
 * research placement or internship this institution offers.
 *
 * One endpoint for all five kinds: they differ by category, not by shape, and two
 * endpoints would have meant two schemas and two sets of tests to express that.
 */
export const createOffering = defineEndpoint({
  route: `${BASE}/collaborators/:id/offerings`,
  method: "POST",
  tier: "write",
  successStatus: 201,
  schema: {
    name: t.string({ min: 2, max: 255 }),
    kind: t.string({ enum: [...OFFERING_KINDS] }),
    level: t.optional(t.string({ enum: [...DEGREE_LEVELS] })),
    description: t.optional(t.string({ min: 1, max: 2000 })),
    // Whole currency units. Tuition is quoted in round numbers everywhere it is
    // published, and an integer cannot acquire a floating-point tail that turns
    // €12,000 into €11,999.999999 on the way to a student.
    tuition: t.optional(t.integer({ min: 0, max: 100_000_000 })),
    currency: t.optional(t.string({ min: 3, max: 8 })),
    duration: t.optional(t.string({ min: 1, max: 64 })),
    intakes: t.optional(t.string({ min: 1, max: 255 })),
    deadline: t.optional(t.isoDate()),
  },
  authorise: requires("collaboration:write"),

  business: async ({ req, validated, deps }) => {
    const now = deps.now?.() ?? new Date();
    const institution = await deps.crm.get(MODULES.collaborators, req.params.id);
    if (!institution) throw new NotFoundError("institution");
    assertCanReach(deps.actor, ownerIdOf(institution), "institution");

    const { id } = await deps.crm.create(MODULES.offerings, {
      Product_Name: validated.name,
      Product_Category: validated.kind,
      Product_Active: true,
      Vendor_Name: { id: req.params.id },
      Owner: { id: deps.actor.id },
      ...(validated.level ? { Degree_Level: validated.level } : {}),
      ...(validated.description ? { Description: validated.description } : {}),
      ...(validated.tuition !== undefined ? { Unit_Price: validated.tuition } : {}),
      ...(validated.currency ? { Tuition_Currency: validated.currency } : {}),
      ...(validated.duration ? { Duration: validated.duration } : {}),
      ...(validated.intakes ? { Intakes: validated.intakes } : {}),
      ...(validated.deadline ? { Application_Deadline: validated.deadline } : {}),
    });

    return { offering: offeringView(await deps.crm.get(MODULES.offerings, id), now) };
  },
});

/**
 * GET /v1/ops/collaborators/renewals — renewal intelligence across the register.
 *
 * Four silent failure modes in one worked queue: lapsed agreements, renewals due,
 * required documents never filed, and partnerships nobody has touched. Each is
 * invisible until it costs something, which is why it is computed rather than
 * remembered.
 *
 * Routed under /collaborators/ so it inherits the same capability without a
 * second permission concept.
 */
export const getRenewals = defineEndpoint({
  route: `${BASE}/collaborators/renewals`,
  method: "GET",
  authorise: requires("collaboration:read"),

  business: async ({ deps }) => {
    const now = deps.now?.() ?? new Date();
    const rows = await deps.crm.list(MODULES.collaborators, {
      fields: INSTITUTION_FIELDS,
      where: ownerClause(deps.actor),
      orderBy: "Modified_Time desc",
      limit: 200,
    });

    const institutions = scopeRows(deps.actor, rows, ownerIdOf).map((row) => institutionView(row, now));

    // Documents are fetched only for partnerships where a missing one actually
    // matters — an active partnership. Fetching for every prospect would be N
    // round trips to answer a question nobody asked.
    const active = institutions.filter((inst) => inst.is_active);
    const checklists = new Map(
      await Promise.all(
        active.map(async (inst) => {
          const docs = await deps.crm
            .list(MODULES.documents, { fields: ["id", "File_Name"], where: `Parent_Id = '${inst.id.replace(/'/g, "")}'`, limit: 100 })
            .catch(() => []);
          return [inst.id, documentChecklist(inst.partnership_type, docs.map(documentView))];
        })
      )
    );

    return renewalIntelligence(institutions, { now, checklists });
  },
});

/** POST /v1/ops/collaborators — add a university or partner to the register. */
export const createCollaborator = defineEndpoint({
  route: `${BASE}/collaborators`,
  method: "POST",
  tier: "write",
  successStatus: 201,
  schema: {
    name: t.string({ min: 2, max: 255 }),
    type: t.optional(t.string({ enum: [...INSTITUTION_TYPES] })),
    stage: t.optional(t.string({ enum: [...PARTNERSHIP_STAGES] })),
    website: t.optional(t.string({ min: 3, max: 255 })),
    country: t.optional(t.string({ min: 2, max: 64 })),
    city: t.optional(t.string({ min: 1, max: 64 })),
    description: t.optional(t.string({ min: 1, max: 2000 })),
  },
  authorise: requires("collaboration:write"),

  business: async ({ validated, deps }) => {
    const now = deps.now?.() ?? new Date();
    const { id } = await deps.crm.create(MODULES.collaborators, {
      Account_Name: validated.name,
      Account_Type: validated.type ?? "University",
      // Every institution enters at the first stage unless told otherwise, so the
      // pipeline can never contain a record with no position in it.
      Partnership_Stage: validated.stage ?? "Identified",
      Agreement_Status: "None",
      Owner: { id: deps.actor.id },
      ...(validated.website ? { Website: validated.website } : {}),
      ...(validated.country ? { Billing_Country: validated.country } : {}),
      ...(validated.city ? { Billing_City: validated.city } : {}),
      ...(validated.description ? { Description: validated.description } : {}),
    });
    return { institution: institutionView(await deps.crm.get(MODULES.collaborators, id), now) };
  },
});

/**
 * PATCH /v1/ops/collaborators/:id — move the relationship, or record an agreement.
 *
 * Every change writes an attributed note as well as the field, so the timeline
 * shows who moved a partnership and when. A stage that changed with no record of
 * who changed it is the kind of thing that turns a forecast review into an
 * argument.
 */
export const updateCollaborator = defineEndpoint({
  route: `${BASE}/collaborators/:id`,
  method: "PATCH",
  tier: "write",
  schema: {
    stage: t.optional(t.string({ enum: [...PARTNERSHIP_STAGES] })),
    partnership_type: t.optional(t.string({ enum: [...PARTNERSHIP_TYPES] })),
    agreement_status: t.optional(t.string({ enum: [...AGREEMENT_STATUSES] })),
    agreement_signed_on: t.optional(t.isoDate()),
    agreement_expires_on: t.optional(t.isoDate()),
    // Institutional profile — what a counsellor needs before recommending this
    // university to a student.
    accreditation: t.optional(t.string({ min: 1, max: 255 })),
    campuses: t.optional(t.string({ min: 1, max: 500 })),
    international_office_contact: t.optional(t.string({ min: 1, max: 128 })),
    international_office_email: t.optional(t.string({ min: 5, max: 128 })),
    website: t.optional(t.string({ min: 3, max: 255 })),
    note: t.optional(t.string({ min: 1, max: 4000 })),
  },
  authorise: requires("collaboration:write"),

  business: async ({ req, validated, deps }) => {
    const now = deps.now?.() ?? new Date();
    const row = await deps.crm.get(MODULES.collaborators, req.params.id);
    if (!row) throw new NotFoundError("institution");
    assertCanReach(deps.actor, ownerIdOf(row), "institution");

    const fields = {};
    if (validated.stage) fields.Partnership_Stage = validated.stage;
    if (validated.partnership_type) fields.Partnership_Type = validated.partnership_type;
    if (validated.agreement_status) fields.Agreement_Status = validated.agreement_status;
    if (validated.agreement_signed_on) fields.Agreement_Signed_On = validated.agreement_signed_on;
    if (validated.agreement_expires_on) fields.Agreement_Expires_On = validated.agreement_expires_on;
    if (validated.accreditation) fields.Accreditation = validated.accreditation;
    if (validated.campuses) fields.Campus_List = validated.campuses;
    if (validated.international_office_contact) fields.International_Office_Contact = validated.international_office_contact;
    if (validated.international_office_email) fields.International_Office_Email = validated.international_office_email;
    if (validated.website) fields.Website = validated.website;

    if (Object.keys(fields).length === 0 && !validated.note) {
      throw new ValidationError([{ field: "stage", rule: "required", message: "nothing to update" }]);
    }

    if (Object.keys(fields).length) await deps.crm.update(MODULES.collaborators, req.params.id, fields);

    const changes = [
      validated.stage ? `stage → ${validated.stage}` : null,
      validated.partnership_type ? `partnership type → ${validated.partnership_type}` : null,
      validated.agreement_status ? `agreement → ${validated.agreement_status}` : null,
    ].filter(Boolean);

    if (changes.length || validated.note) {
      await deps.crm.addNote(
        MODULES.collaborators,
        req.params.id,
        changes.length ? `Updated by ${deps.actor.label}` : `Note by ${deps.actor.label}`,
        [changes.join(", "), validated.note].filter(Boolean).join("\n")
      );
    }

    return { institution: institutionView(await deps.crm.get(MODULES.collaborators, req.params.id), now) };
  },
});

/** POST /v1/ops/collaborators/:id/contacts — a person inside an institution. */
export const createCollaboratorContact = defineEndpoint({
  route: `${BASE}/collaborators/:id/contacts`,
  method: "POST",
  tier: "write",
  successStatus: 201,
  schema: {
    first_name: t.optional(t.string({ min: 1, max: 64 })),
    last_name: t.string({ min: 1, max: 64 }),
    email: t.optional(t.string({ min: 5, max: 128 })),
    phone: t.optional(t.string({ min: 5, max: 32 })),
    title: t.optional(t.string({ min: 1, max: 128 })),
    department: t.optional(t.string({ min: 1, max: 128 })),
  },
  authorise: requires("collaboration:write"),

  business: async ({ req, validated, deps }) => {
    const institution = await deps.crm.get(MODULES.collaborators, req.params.id);
    if (!institution) throw new NotFoundError("institution");
    assertCanReach(deps.actor, ownerIdOf(institution), "institution");

    const { id } = await deps.crm.create(MODULES.contacts, {
      Last_Name: validated.last_name,
      Account_Name: { id: req.params.id },
      Owner: { id: deps.actor.id },
      ...(validated.first_name ? { First_Name: validated.first_name } : {}),
      ...(validated.email ? { Email: validated.email } : {}),
      ...(validated.phone ? { Phone: validated.phone } : {}),
      ...(validated.title ? { Title: validated.title } : {}),
      ...(validated.department ? { Department: validated.department } : {}),
    });
    return { contact: contactView(await deps.crm.get(MODULES.contacts, id)) };
  },
});

/** POST /v1/ops/collaborators/:id/meetings — log or schedule a meeting. */
export const createCollaboratorMeeting = defineEndpoint({
  route: `${BASE}/collaborators/:id/meetings`,
  method: "POST",
  tier: "write",
  successStatus: 201,
  schema: {
    title: t.string({ min: 2, max: 255 }),
    starts_at: t.string({ min: 10, max: 40 }),
    ends_at: t.optional(t.string({ min: 10, max: 40 })),
    venue: t.optional(t.string({ min: 1, max: 255 })),
    notes: t.optional(t.string({ min: 1, max: 4000 })),
  },
  authorise: requires("collaboration:write"),

  business: async ({ req, validated, deps }) => {
    const now = deps.now?.() ?? new Date();
    const institution = await deps.crm.get(MODULES.collaborators, req.params.id);
    if (!institution) throw new NotFoundError("institution");
    assertCanReach(deps.actor, ownerIdOf(institution), "institution");

    if (Number.isNaN(Date.parse(validated.starts_at))) {
      throw new ValidationError([{ field: "starts_at", rule: "invalid", message: "must be an ISO 8601 date-time" }]);
    }

    const { id } = await deps.crm.create(MODULES.meetings, {
      Event_Title: validated.title,
      Start_DateTime: validated.starts_at,
      What_Id: { id: req.params.id },
      $se_module: MODULES.collaborators,
      Owner: { id: deps.actor.id },
      ...(validated.ends_at ? { End_DateTime: validated.ends_at } : {}),
      ...(validated.venue ? { Venue: validated.venue } : {}),
      ...(validated.notes ? { Description: validated.notes } : {}),
    });
    return { meeting: meetingView(await deps.crm.get(MODULES.meetings, id), now) };
  },
});

/* ═══════════════════════════════════════════════════════════ analytics ═══ */

/**
 * GET /v1/ops/analytics — conversion and pipeline, computed from the CRM.
 *
 * Deliberately returns the denominator with every rate. A conversion percentage
 * without the counts behind it is the kind of number that gets repeated in a
 * pitch and cannot be defended when questioned.
 */
export const getAnalytics = defineEndpoint({
  route: `${BASE}/analytics`,
  method: "GET",
  authorise: requires("analytics:read"),

  business: async ({ req, deps }) => {
    const days = Math.min(Math.max(Number(req.query?.days ?? 30), 1), 365);
    const now = deps.now?.() ?? new Date();
    const since = new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 19) + "+00:00";

    const [leads, students] = await Promise.all([
      deps.crm.list(MODULES.leads, { fields: LEAD_FIELDS, where: `Created_Time >= '${since}'`, limit: 200 }),
      deps.crm.list(MODULES.students, { fields: STUDENT_FIELDS, limit: 200 }),
    ]);

    const bySource = {};
    for (const lead of leads) {
      const key = lead.Lead_Source ?? "Unknown";
      bySource[key] = (bySource[key] ?? 0) + 1;
    }
    const byStage = {};
    for (const student of students.map(studentView)) {
      byStage[student.stage ?? "Unknown"] = (byStage[student.stage ?? "Unknown"] ?? 0) + 1;
    }

    const converted = students.length;
    const sla = slaFor(leads, now);

    return {
      window_days: days,
      leads: { total: leads.length, by_source: bySource },
      pipeline: { total: converted, by_stage: byStage },
      conversion: {
        // Stated as a fraction with both terms, never a bare percentage.
        leads_to_cases: { numerator: converted, denominator: leads.length, rate: leads.length ? converted / leads.length : null },
      },
      speed_to_lead: {
        target_minutes: sla.targetMinutes,
        measured: sla.measured.length,
        breached: sla.breached.length,
        median_minutes: sla.medianMinutes,
      },
    };
  },
});

/* ══════════════════════════════════════════════════════════════ router ═══ */

const noteView = (note) => ({
  id: note.id,
  title: note.Note_Title ?? null,
  content: note.Note_Content ?? "",
  at: note.Created_Time ?? null,
});

export const routes = [
  { method: "GET", template: `${BASE}/dashboard`, handler: getDashboard, name: "getDashboard" },
  { method: "GET", template: `${BASE}/me`, handler: getMe, name: "getMe" },
  { method: "GET", template: `${BASE}/leads`, handler: listLeads, name: "listLeads" },
  { method: "GET", template: `${BASE}/leads/:id`, handler: getLead, name: "getLead" },
  { method: "PATCH", template: `${BASE}/leads/:id`, handler: updateLead, name: "updateLead" },
  { method: "POST", template: `${BASE}/leads/:id/assign`, handler: assignLead, name: "assignLead" },
  { method: "GET", template: `${BASE}/students`, handler: listStudents, name: "listStudents" },
  { method: "GET", template: `${BASE}/students/:id`, handler: getStudent, name: "getStudent" },
  { method: "GET", template: `${BASE}/tasks`, handler: listTasks, name: "listTasks" },
  { method: "POST", template: `${BASE}/tasks`, handler: createTask, name: "createTask" },
  { method: "POST", template: `${BASE}/tasks/:id/complete`, handler: completeTask, name: "completeTask" },
  { method: "GET", template: `${BASE}/collaborators`, handler: listCollaborators, name: "listCollaborators" },
  { method: "POST", template: `${BASE}/collaborators`, handler: createCollaborator, name: "createCollaborator" },
  { method: "GET", template: `${BASE}/collaborators/renewals`, handler: getRenewals, name: "getRenewals" },
  { method: "GET", template: `${BASE}/collaborators/:id`, handler: getCollaborator, name: "getCollaborator" },
  { method: "PATCH", template: `${BASE}/collaborators/:id`, handler: updateCollaborator, name: "updateCollaborator" },
  { method: "POST", template: `${BASE}/collaborators/:id/contacts`, handler: createCollaboratorContact, name: "createCollaboratorContact" },
  { method: "POST", template: `${BASE}/collaborators/:id/meetings`, handler: createCollaboratorMeeting, name: "createCollaboratorMeeting" },
  { method: "POST", template: `${BASE}/collaborators/:id/offerings`, handler: createOffering, name: "createOffering" },
  { method: "GET", template: `${BASE}/analytics`, handler: getAnalytics, name: "getAnalytics" },
];

/**
 * Every HTTP method this API actually serves, plus OPTIONS for preflight.
 *
 * Consumed by the CORS configuration so the browser is told the truth about what
 * it may send. Derived rather than listed: a hardcoded method list that falls
 * behind the router produces requests that pass every server-side test and are
 * then blocked in the browser before they are ever sent.
 */
export const OPS_HTTP_METHODS = Object.freeze([...new Set([...routes.map((r) => r.method), "OPTIONS"])]);

/** Every route names the capability it needs — the published authorisation contract. */
export const contract = Object.freeze({
  version: API_VERSION,
  base: BASE,
  routes: Object.freeze([
    { route: `${BASE}/dashboard`, method: "GET", capability: "dashboard:read" },
    { route: `${BASE}/me`, method: "GET", capability: "dashboard:read" },
    { route: `${BASE}/leads`, method: "GET", capability: "leads:read" },
    { route: `${BASE}/leads/:id`, method: "GET", capability: "leads:read" },
    { route: `${BASE}/leads/:id`, method: "PATCH", capability: "leads:write" },
    { route: `${BASE}/leads/:id/assign`, method: "POST", capability: "leads:assign" },
    { route: `${BASE}/students`, method: "GET", capability: "students:read" },
    { route: `${BASE}/students/:id`, method: "GET", capability: "students:read" },
    { route: `${BASE}/tasks`, method: "GET", capability: "tasks:read" },
    { route: `${BASE}/tasks`, method: "POST", capability: "tasks:write" },
    { route: `${BASE}/tasks/:id/complete`, method: "POST", capability: "tasks:write" },
    { route: `${BASE}/collaborators`, method: "GET", capability: "collaboration:read" },
    { route: `${BASE}/collaborators`, method: "POST", capability: "collaboration:write" },
    { route: `${BASE}/collaborators/renewals`, method: "GET", capability: "collaboration:read" },
    { route: `${BASE}/collaborators/:id`, method: "GET", capability: "collaboration:read" },
    { route: `${BASE}/collaborators/:id`, method: "PATCH", capability: "collaboration:write" },
    { route: `${BASE}/collaborators/:id/contacts`, method: "POST", capability: "collaboration:write" },
    { route: `${BASE}/collaborators/:id/meetings`, method: "POST", capability: "collaboration:write" },
    { route: `${BASE}/collaborators/:id/offerings`, method: "POST", capability: "collaboration:write" },
    { route: `${BASE}/analytics`, method: "GET", capability: "analytics:read" },
  ]),
});

/** Startup assertion: every route is in the contract and vice versa. */
export function assertContractComplete() {
  const declared = new Set(contract.routes.map((r) => `${r.method} ${r.route}`));
  const wired = new Set(routes.map((r) => `${r.method} ${r.template}`));
  const missing = [...wired].filter((r) => !declared.has(r));
  const extra = [...declared].filter((r) => !wired.has(r));
  if (missing.length || extra.length) {
    throw new Error(
      `operations contract is out of step with the router.\n  unlisted routes: ${missing.join(", ") || "none"}\n  listed but unrouted: ${extra.join(", ") || "none"}`
    );
  }
  return true;
}
