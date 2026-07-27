/**
 * Founder Operations — the permission model.
 *
 * THE PROBLEM THIS SOLVES
 * The platform has exactly one user today. The naive response is to skip
 * authorisation entirely and add it "when the team joins" — which is how a
 * single-user tool becomes a rewrite the moment it has two users, because by then
 * every endpoint, every query and every view has been written assuming the caller
 * sees everything.
 *
 * So the model is built for the full team NOW and merely *resolves* to
 * "administrator sees everything" while the team is one person. Nothing here is
 * dormant scaffolding: the scoping filter runs on every request today, the
 * capability check runs on every request today, and the multi-user behaviour is
 * tested today against roles no human currently holds. When the six team accounts
 * arrive they receive a role and start working — no endpoint changes, no query
 * changes, no redesign.
 *
 * TWO INDEPENDENT AXES, deliberately not collapsed into one:
 *
 *   CAPABILITY — *may this actor perform this kind of action at all?*
 *                e.g. "leads:assign", "email:send"
 *   SCOPE      — *over which records?*  own | team | all
 *
 * Collapsing them (the usual "role → list of records" shortcut) is what forces a
 * redesign later, because a manager who may read every lead but reassign only
 * their team's has no single answer. Kept apart, that is two independent facts.
 *
 * ROLES REUSE identity/auth.mjs — this module adds no parallel role vocabulary.
 * `administrator` and `counsellor` mean here exactly what they mean to the Career
 * Record API, so one token works across both services.
 */

import { ROLES } from "../record/identity/auth.mjs";

/* ─────────────────────────────────────────────────────────── capabilities ── */

/**
 * Every action the operations platform can perform. Adding a feature means adding
 * a capability here and naming it on the endpoint — never inventing a new
 * authorisation mechanism beside this one.
 *
 * Grouped by the nine Founder Operations surfaces so the mapping stays legible as
 * the platform grows into all of them.
 */
export const CAPABILITIES = Object.freeze({
  // Founder Dashboard + Analytics
  "dashboard:read": "See the operational overview",
  "analytics:read": "See conversion, pipeline and SLA analytics",

  // Lead Management
  "leads:read": "See leads",
  "leads:write": "Create and update leads",
  "leads:assign": "Change who owns a lead",

  // Student CRM
  "students:read": "See student cases",
  "students:write": "Create and update student cases",

  // Collaboration CRM (partners, universities, agents)
  "collaboration:read": "See collaboration partners",
  "collaboration:write": "Create and update collaboration partners",

  // Task Manager
  "tasks:read": "See tasks",
  "tasks:write": "Create, complete and update tasks",
  "tasks:assign": "Assign tasks to another person",

  // Follow-up Engine
  "followups:read": "See scheduled follow-ups",
  "followups:write": "Schedule and cancel follow-ups",

  // Email Center
  "email:read": "See sent and received correspondence",
  "email:send": "Send email on behalf of the company",

  // AI Assistant Panel
  "ai:invoke": "Ask the assistant to draft or summarise",

  // Administration
  "admin:users": "Provision and manage team accounts",
  "admin:config": "Change operational configuration",
});

export const ALL_CAPABILITIES = Object.freeze(Object.keys(CAPABILITIES));

/* ──────────────────────────────────────────────────────────────── scopes ── */

/** Breadth of record access. Ordered: each strictly contains the one before it. */
export const SCOPES = Object.freeze(["own", "team", "all"]);

const SCOPE_RANK = Object.freeze({ own: 0, team: 1, all: 2 });

/* ───────────────────────────────────────────────────────────────── roles ── */

/**
 * What each role may do, and how widely.
 *
 * `administrator` is the founder's role today and holds everything — but it holds
 * it *because the role grants it*, not because authorisation was skipped. That
 * distinction is the whole point: revoking a capability from administrator would
 * take effect immediately, which proves the check is real and not a no-op.
 *
 * The staff roles below map to the CRM roles already provisioned in
 * config/tenant-richenquest.json, so a person's CRM role and their platform role
 * cannot drift into two different answers.
 */
export const ROLE_GRANTS = Object.freeze({
  administrator: Object.freeze({
    label: "Founder / Administrator",
    scope: "all",
    capabilities: ALL_CAPABILITIES,
  }),

  // Harsh (Operations & Data Intelligence), Kishor (Strategic Partnerships)
  manager: Object.freeze({
    label: "Manager",
    scope: "all",
    capabilities: Object.freeze([
      "dashboard:read", "analytics:read",
      "leads:read", "leads:write", "leads:assign",
      "students:read", "students:write",
      "collaboration:read", "collaboration:write",
      "tasks:read", "tasks:write", "tasks:assign",
      "followups:read", "followups:write",
      "email:read", "email:send",
      "ai:invoke",
    ]),
  }),

  // Kunal (Student Success & Visa Ops), Bibek (University Applications)
  counsellor: Object.freeze({
    label: "Counsellor",
    scope: "own",
    capabilities: Object.freeze([
      "dashboard:read",
      "leads:read", "leads:write",
      "students:read", "students:write",
      "tasks:read", "tasks:write",
      "followups:read", "followups:write",
      "email:read", "email:send",
      "ai:invoke",
    ]),
  }),

  // Tahir (Regional Partnerships / Pakistan Ops)
  partner_manager: Object.freeze({
    label: "Partnerships",
    scope: "own",
    capabilities: Object.freeze([
      "dashboard:read",
      "collaboration:read", "collaboration:write",
      "tasks:read", "tasks:write",
      "followups:read", "followups:write",
      "email:read", "email:send",
      "ai:invoke",
    ]),
  }),

  // Vishrut (Brand & Creative Design) — sees performance, touches no student data.
  marketing: Object.freeze({
    label: "Marketing",
    scope: "all",
    capabilities: Object.freeze([
      "dashboard:read", "analytics:read",
      "leads:read",
      "ai:invoke",
    ]),
  }),

  // Read-only oversight. Exists so "show someone the numbers" never means
  // handing out a write-capable account.
  auditor: Object.freeze({
    label: "Auditor",
    scope: "all",
    capabilities: Object.freeze(["dashboard:read", "analytics:read", "leads:read", "students:read", "collaboration:read", "tasks:read"]),
  }),
});

export const OPS_ROLES = Object.freeze(Object.keys(ROLE_GRANTS));

/* ────────────────────────────────────────────────────────────── the actor ── */

export class PermissionError extends Error {
  constructor(code, message, status = 403) {
    super(message);
    this.name = "PermissionError";
    this.code = code;
    this.status = status;
  }
}

/**
 * Resolve verified token claims into an operations actor.
 *
 * Deliberately takes CLAIMS, not a token: verification belongs to
 * identity/auth.mjs and is not re-implemented here. Authentication answers "who",
 * this answers "what may they do" — the same separation the Career Record API
 * keeps between verifyToken() and resolveActor().
 *
 * @param {object} claims        verified claims from auth.mjs verifyToken()
 * @param {object} [opts]
 * @param {string[]} [opts.teamMemberIds]  peers, when the actor's scope is "team"
 */
export function resolveOpsActor(claims, { teamMemberIds = [] } = {}) {
  if (!claims?.role) throw new PermissionError("NO_ROLE", "token carries no role", 401);
  if (!ROLES.includes(claims.role)) throw new PermissionError("UNKNOWN_ROLE", "token carries an unknown role", 401);

  const grant = ROLE_GRANTS[opsRoleFor(claims.role)];
  if (!grant) {
    // A valid Career Record role that has no place in the operations platform —
    // `subject`, `guardian`, `partner`, `ai_service`. Refused rather than mapped
    // to a default, because a student's token must never open a staff console.
    throw new PermissionError("NOT_AN_OPERATOR", `role "${claims.role}" has no access to operations`);
  }

  return Object.freeze({
    id: claims.sub,
    role: opsRoleFor(claims.role),
    label: grant.label,
    scope: grant.scope,
    capabilities: grant.capabilities,
    teamMemberIds: Object.freeze([...teamMemberIds]),
    tokenId: claims.jti ?? null,
  });
}

/**
 * Map a Career Record role onto an operations role.
 *
 * Kept as an explicit function rather than assuming the names match, because the
 * two vocabularies are allowed to diverge: `manager`, `partner_manager` and
 * `marketing` are operations concepts with no Career Record meaning, and they
 * arrive as `counsellor`/`administrator` tokens carrying an ops_role claim.
 */
function opsRoleFor(role) {
  if (role === "administrator") return "administrator";
  if (role === "counsellor") return "counsellor";
  if (role === "auditor") return "auditor";
  return null;
}

/**
 * Resolve an operations role from an explicit `ops_role` claim when present,
 * falling back to the Career Record role. This is the seam the six team accounts
 * will use: a token minted with ops_role="manager" gets manager grants without any
 * change to this module or to any endpoint.
 */
export function resolveOpsActorFromToken(claims, opts = {}) {
  const explicit = claims?.ops_role;
  if (explicit) {
    if (!ROLE_GRANTS[explicit]) throw new PermissionError("UNKNOWN_OPS_ROLE", `unknown operations role "${explicit}"`);
    const grant = ROLE_GRANTS[explicit];
    return Object.freeze({
      id: claims.sub,
      role: explicit,
      label: grant.label,
      scope: grant.scope,
      capabilities: grant.capabilities,
      teamMemberIds: Object.freeze([...(opts.teamMemberIds ?? [])]),
      tokenId: claims.jti ?? null,
    });
  }
  return resolveOpsActor(claims, opts);
}

/* ──────────────────────────────────────────────────────────────── checks ── */

/** Does this actor hold the capability? Pure predicate; throws nothing. */
export function can(actor, capability) {
  if (!actor || !capability) return false;
  if (!ALL_CAPABILITIES.includes(capability)) return false;
  return actor.capabilities.includes(capability);
}

/** Assert a capability, or refuse with a 403 the pipeline maps to an error body. */
export function assertCan(actor, capability) {
  if (!ALL_CAPABILITIES.includes(capability)) {
    // A typo'd capability must never silently pass. Default deny, loudly.
    throw new PermissionError("UNKNOWN_CAPABILITY", `"${capability}" is not a declared capability`, 500);
  }
  if (!can(actor, capability)) {
    throw new PermissionError("FORBIDDEN", `${actor?.role ?? "caller"} may not ${CAPABILITIES[capability] ?? capability}`);
  }
  return true;
}

/** Is `a` at least as broad as `b`? */
export const scopeAtLeast = (a, b) => (SCOPE_RANK[a] ?? -1) >= (SCOPE_RANK[b] ?? 99);

/**
 * The owner ids an actor may see, or `null` meaning "no restriction".
 *
 * `null` rather than "every id in the org" on purpose: enumerating owners would
 * make every query depend on a user list that does not exist yet, and would break
 * the moment someone is added. null means the caller adds no owner filter at all.
 */
export function visibleOwnerIds(actor) {
  if (actor.scope === "all") return null;
  if (actor.scope === "team") return [actor.id, ...actor.teamMemberIds];
  return [actor.id];
}

/**
 * May this actor act on a record owned by `ownerId`?
 *
 * An UNOWNED record (null owner) is visible to everyone who can read the type at
 * all. An unassigned lead that nobody could see is a lead that never gets called —
 * the failure mode this system exists to prevent.
 */
export function canReach(actor, ownerId) {
  const allowed = visibleOwnerIds(actor);
  if (allowed === null) return true;
  if (ownerId === null || ownerId === undefined) return true;
  return allowed.includes(ownerId);
}

/** Assert reachability, or refuse. */
export function assertCanReach(actor, ownerId, what = "record") {
  if (!canReach(actor, ownerId)) {
    throw new PermissionError("OUT_OF_SCOPE", `this ${what} belongs to someone else`);
  }
  return true;
}

/**
 * Filter a list to what the actor may see. Applied on EVERY list endpoint, today,
 * with one user — so the day a second user exists the filtering is already proven
 * rather than newly written.
 *
 * @param {Array} rows
 * @param {(row: any) => string|null} ownerOf
 */
export function scopeRows(actor, rows, ownerOf = (r) => r.owner_id ?? null) {
  const allowed = visibleOwnerIds(actor);
  if (allowed === null) return rows;
  return rows.filter((row) => {
    const owner = ownerOf(row);
    return owner === null || owner === undefined || allowed.includes(owner);
  });
}

/**
 * What the UI should render for this actor. The console asks once at load and
 * hides what cannot be used — but every endpoint still enforces independently,
 * because a hidden button is a courtesy, never a control.
 */
export function capabilityManifest(actor) {
  return {
    actor: { id: actor.id, role: actor.role, label: actor.label, scope: actor.scope },
    capabilities: actor.capabilities,
    can: Object.fromEntries(ALL_CAPABILITIES.map((c) => [c, actor.capabilities.includes(c)])),
  };
}
