/**
 * Founder Operations — permission model tests.
 *
 * These exist to answer one question: *when the six team accounts arrive, does
 * anything have to be redesigned?*
 *
 * The answer is only "no" if the multi-user behaviour is enforced and proven
 * BEFORE those accounts exist. So every test below runs against roles no human
 * currently holds. If the founder were the only case ever exercised, the first
 * counsellor login would be the first time scoping ran in anger — and that is
 * precisely the rewrite this model exists to avoid.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  CAPABILITIES, ALL_CAPABILITIES, ROLE_GRANTS, OPS_ROLES, SCOPES,
  resolveOpsActor, resolveOpsActorFromToken, can, assertCan, canReach, assertCanReach,
  visibleOwnerIds, scopeRows, capabilityManifest, scopeAtLeast, PermissionError,
} from "./permissions.mjs";
import { issueToken, verifyToken } from "../record/identity/auth.mjs";
import { randomBytes } from "node:crypto";

const SECRET = randomBytes(32).toString("hex");
const actorFor = (role, opts) => resolveOpsActorFromToken({ sub: "usr_x", role: "counsellor", ops_role: role, jti: "t1" }, opts);

/* ══════════════════════════════════════════════════════ model integrity ══ */

test("every role grants only declared capabilities and a valid scope", () => {
  for (const [role, grant] of Object.entries(ROLE_GRANTS)) {
    assert.ok(SCOPES.includes(grant.scope), `${role} has a valid scope`);
    for (const capability of grant.capabilities) {
      assert.ok(ALL_CAPABILITIES.includes(capability), `${role} grants declared capability "${capability}"`);
    }
  }
});

test("every declared capability is held by at least one role", () => {
  const held = new Set(Object.values(ROLE_GRANTS).flatMap((g) => g.capabilities));
  for (const capability of ALL_CAPABILITIES) {
    assert.ok(held.has(capability), `"${capability}" is reachable by some role, not dead config`);
  }
});

test("every capability carries a human description, for the UI and for refusals", () => {
  for (const capability of ALL_CAPABILITIES) {
    assert.equal(typeof CAPABILITIES[capability], "string");
    assert.ok(CAPABILITIES[capability].length > 0);
  }
});

/* ═══════════════════════════════════════════════════════ the founder ═══ */

test("the founder holds every capability — because the role grants it, not because checks are skipped", () => {
  const founder = actorFor("administrator");
  assert.equal(founder.scope, "all");
  for (const capability of ALL_CAPABILITIES) {
    assert.equal(can(founder, capability), true, `founder may ${capability}`);
  }
  assert.equal(visibleOwnerIds(founder), null, "no owner filter is applied for scope=all");
});

test("the capability check is real: a role without a capability is refused", () => {
  // Marketing is the proof. If authorisation were a no-op, this would pass.
  const marketing = actorFor("marketing");
  assert.equal(can(marketing, "leads:read"), true);
  assert.equal(can(marketing, "leads:write"), false);
  assert.throws(() => assertCan(marketing, "leads:write"), (e) => e instanceof PermissionError && e.status === 403);
  assert.throws(() => assertCan(marketing, "students:read"), (e) => e.code === "FORBIDDEN");
});

test("an undeclared capability is refused as a server error, never silently allowed", () => {
  const founder = actorFor("administrator");
  assert.equal(can(founder, "leads:delete_everything"), false, "typos do not pass, even for the founder");
  assert.throws(() => assertCan(founder, "leads:delete_everything"), (e) => e.code === "UNKNOWN_CAPABILITY" && e.status === 500);
});

/* ═══════════════════════════════════ multi-user behaviour, proven today ══ */

test("a counsellor sees only their own records — enforced now, with no counsellor yet hired", () => {
  const kunal = resolveOpsActorFromToken({ sub: "usr_kunal", role: "counsellor", ops_role: "counsellor" });
  assert.equal(kunal.scope, "own");
  assert.deepEqual(visibleOwnerIds(kunal), ["usr_kunal"]);

  const leads = [
    { id: "1", owner_id: "usr_kunal" },
    { id: "2", owner_id: "usr_bibek" },
    { id: "3", owner_id: null },
  ];
  const visible = scopeRows(kunal, leads);
  assert.deepEqual(visible.map((l) => l.id), ["1", "3"], "own records plus unassigned ones");
});

test("an unassigned lead is visible to everyone — a lead nobody can see is a lead nobody calls", () => {
  const kunal = actorFor("counsellor");
  assert.equal(canReach(kunal, null), true);
  assert.equal(canReach(kunal, undefined), true);
});

test("a counsellor cannot reach a colleague's record", () => {
  const kunal = resolveOpsActorFromToken({ sub: "usr_kunal", role: "counsellor", ops_role: "counsellor" });
  assert.equal(canReach(kunal, "usr_bibek"), false);
  assert.throws(() => assertCanReach(kunal, "usr_bibek", "lead"), (e) => e.code === "OUT_OF_SCOPE");
});

test("a team-scoped actor sees peers, and the same filter code serves all three scopes", () => {
  const lead = resolveOpsActorFromToken(
    { sub: "usr_harsh", role: "counsellor", ops_role: "counsellor" },
    { teamMemberIds: ["usr_kunal"] }
  );
  // counsellor is own-scoped, so a peer is still out of reach …
  assert.equal(canReach(lead, "usr_kunal"), false);

  // … but the identical filter widens correctly for a team-scoped role.
  const teamActor = { ...lead, scope: "team", teamMemberIds: ["usr_kunal"] };
  assert.deepEqual(visibleOwnerIds(teamActor), ["usr_harsh", "usr_kunal"]);
  assert.equal(canReach(teamActor, "usr_kunal"), true);
  assert.equal(canReach(teamActor, "usr_stranger"), false);
});

test("capability and scope are independent — a manager reads widely and a counsellor writes narrowly", () => {
  const manager = actorFor("manager");
  const counsellor = actorFor("counsellor");

  assert.equal(manager.scope, "all");
  assert.equal(can(manager, "leads:assign"), true, "managers reassign work");
  assert.equal(can(counsellor, "leads:assign"), false, "counsellors do not");
  assert.equal(can(counsellor, "leads:write"), true, "but they do update their own leads");

  // Collapsing the two axes into one role→records list could not express this.
  assert.notEqual(manager.scope, counsellor.scope);
});

test("scope ordering is a containment hierarchy", () => {
  assert.equal(scopeAtLeast("all", "own"), true);
  assert.equal(scopeAtLeast("team", "own"), true);
  assert.equal(scopeAtLeast("own", "team"), false);
  assert.equal(scopeAtLeast("own", "own"), true);
});

/* ═════════════════════════════════════════════════════════ token wiring ══ */

test("a real signed token resolves to an operations actor", () => {
  const { token } = issueToken({ sub: "usr_founder", role: "administrator" }, SECRET);
  const claims = verifyToken(token, SECRET);
  const actor = resolveOpsActor(claims);

  assert.equal(actor.id, "usr_founder");
  assert.equal(actor.role, "administrator");
  assert.equal(actor.scope, "all");
});

test("a student token cannot open the staff console", () => {
  const { token } = issueToken({ sub: "sub_a", role: "subject", subject_id: "sub_a" }, SECRET);
  const claims = verifyToken(token, SECRET);
  assert.throws(() => resolveOpsActor(claims), (e) => e.code === "NOT_AN_OPERATOR" && e.status === 403);
});

test("a guardian, partner or AI token is equally refused", () => {
  for (const role of ["guardian", "partner", "ai_service"]) {
    const claims = { sub: "x", role, ...(role === "partner" ? { partner_id: "p" } : {}) };
    assert.throws(() => resolveOpsActor(claims), (e) => e.code === "NOT_AN_OPERATOR", `${role} is refused`);
  }
});

test("an ops_role claim is the seam the six team accounts will use — no code changes when they arrive", () => {
  // This is exactly how Kunal's account will be minted: a counsellor token
  // carrying an explicit operations role. Nothing in permissions.mjs or in any
  // endpoint changes on the day it is first issued.
  for (const role of OPS_ROLES) {
    const actor = resolveOpsActorFromToken({ sub: `usr_${role}`, role: "counsellor", ops_role: role });
    assert.equal(actor.role, role);
    assert.equal(actor.label, ROLE_GRANTS[role].label);
    assert.deepEqual(actor.capabilities, ROLE_GRANTS[role].capabilities);
  }
});

test("an unknown ops_role is refused rather than defaulted", () => {
  assert.throws(
    () => resolveOpsActorFromToken({ sub: "x", role: "counsellor", ops_role: "superuser" }),
    (e) => e.code === "UNKNOWN_OPS_ROLE"
  );
});

test("a token with no role at all is refused as unauthenticated", () => {
  assert.throws(() => resolveOpsActor({ sub: "x" }), (e) => e.code === "NO_ROLE" && e.status === 401);
  assert.throws(() => resolveOpsActor({ sub: "x", role: "wizard" }), (e) => e.code === "UNKNOWN_ROLE");
});

/* ═══════════════════════════════════════════════════════════ the manifest ══ */

test("the manifest tells the console what to render, for every role", () => {
  const founder = capabilityManifest(actorFor("administrator"));
  assert.equal(founder.actor.role, "administrator");
  assert.equal(founder.can["admin:users"], true);
  assert.equal(Object.keys(founder.can).length, ALL_CAPABILITIES.length, "every capability is answered, not just the granted ones");

  const auditor = capabilityManifest(actorFor("auditor"));
  assert.equal(auditor.can["leads:read"], true);
  assert.equal(auditor.can["leads:write"], false, "read-only oversight is a real role, not a promise");
  assert.equal(auditor.can["email:send"], false);
});

test("the manifest never leaks a capability the actor lacks", () => {
  const marketing = capabilityManifest(actorFor("marketing"));
  const granted = Object.entries(marketing.can).filter(([, v]) => v).map(([k]) => k);
  assert.deepEqual(granted.sort(), [...ROLE_GRANTS.marketing.capabilities].sort());
});
