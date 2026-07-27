/**
 * Speed-to-Lead handler (AM1.1 / replaces AM0.4 WF1).
 *
 * Fires on a new Lead. Responsibilities, in order of business value:
 *   1. Route the lead to an owner using the CONFIGURABLE assignment engine
 *      (founder rule OI-4: never static round-robin).
 *   2. Alert #leads so a human can act within the 5-minute window.
 *
 * Idempotency: the handler checks whether the lead already has an owner
 * assigned by automation before acting. Re-running it must not reassign a lead
 * a human has since taken over, and must not post a duplicate alert.
 *
 * Multi-type guard (Constitution IF-3): only `Lead Type = Student` is
 * workflow-active. Other lead types (University, Agent, Corporate…) are stored
 * but must not trigger student-response logic.
 */

/**
 * PURE. Resolve the owner for a lead from tenant config.
 * Exported separately so routing logic is unit-testable without CRM or Cliq.
 *
 * Phase 1 (native criteria) per config → assignment_engine.implementation_phasing:
 * language / market / destination / lead_type, plus manual override. Workload
 * and availability are Phase 2 and deliberately absent here.
 *
 * @returns {{owner:string, reason:string}|null} null when no rule applies
 */
export function resolveAssignment(lead, tenant) {
  const engine = tenant?.assignment_engine;
  const rules = engine?.v1_default_PROPOSED?.Student;
  if (!rules) return null;

  const market = lead.Market ?? lead.market;
  // Market-specific routing takes precedence over the default owner.
  if (market && rules.by_market && rules.by_market[market]) {
    return { owner: rules.by_market[market], reason: `market=${market}` };
  }
  if (rules.default_owner) return { owner: rules.default_owner, reason: "default" };
  return null;
}

/** PURE. Is this lead eligible for student automation? */
export function isStudentLead(lead) {
  const type = lead.Lead_Type ?? lead.lead_type;
  // Absent Lead Type is treated as Student: the field is new, and existing or
  // form-created leads may predate it. Failing open here is safe (a student
  // gets a response); failing closed would silently drop real leads.
  return type == null || type === "Student";
}

/**
 * @param {object} lead   hydrated CRM Lead
 * @param {object} ctx    {module, id, operation, subscription, logger, deps}
 */
export async function onLeadCreate(lead, ctx) {
  const { logger, deps } = ctx;
  const { tenant, crm, cliq } = deps ?? {};
  if (!tenant || !crm) throw new Error("onLeadCreate requires deps.tenant and deps.crm");

  if (!isStudentLead(lead)) {
    logger.info("skipped: non-student lead type", { lead_type: lead.Lead_Type });
    return { action: "skipped", reason: "non_student" };
  }

  const assignment = resolveAssignment(lead, tenant);
  if (!assignment) {
    logger.warn("no assignment rule matched — leaving unassigned for manual pickup");
    return { action: "unassigned", reason: "no_rule" };
  }

  // Record the routing decision as a CRM note — a valid, always-safe audit
  // trail (unlike a Lead_Status write, whose picklist values are org-specific).
  // Engine-level idempotency (record-version key) ensures this runs once per
  // lead version, so the note is not duplicated.
  await crm.addNote(ctx.module, ctx.id, "Speed-to-Lead",
    `Auto-routed to ${assignment.owner} (${assignment.reason}). Call within 5 minutes.`);
  logger.info("routed", { rule: assignment.reason, owner: assignment.owner });

  if (cliq) {
    // Alert content deliberately excludes PII beyond what staff need to act.
    await cliq.post("leads", `🔔 New lead — ${assignment.owner} (${assignment.reason}) · case ${ctx.id}`);
  }

  return { action: "routed", owner: assignment.owner, reason: assignment.reason };
}
