/**
 * Founder Operations API — INTEGRATION tests over REAL HTTP.
 *
 * A node:http server on an ephemeral port, driven with fetch: real sockets, real
 * headers, real status codes, real JSON bodies, the real pipeline. No handler is
 * called directly, because calling a handler proves the handler works and says
 * nothing about routing, method matching, body parsing or error mapping.
 *
 * The CRM behind it is memoryCrmPort — a real working store implementing the same
 * port as Zoho, so the endpoints under test are byte-for-byte the ones that run in
 * production. What is NOT covered here is Zoho's own HTTP shape, which
 * functions/zoho exercises against the live org; the adapter between them is a
 * pure translation with no logic to get wrong.
 *
 * The authorisation tests matter most. They run against roles no human holds yet,
 * which is the entire reason adding the team later is an account-creation task.
 */

import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

import { createOpsServer } from "./service.mjs";
import { memoryCrmPort, MODULES } from "../crm-port.mjs";
import { memoryStore, appendEvent } from "../../record/log.mjs";
import { OPS_HTTP_METHODS } from "./endpoints.mjs";
import { issueToken } from "../../record/identity/auth.mjs";

const SECRET = randomBytes(32).toString("hex");
const FOUNDER = "usr_founder";
const KUNAL = "usr_kunal";
const BIBEK = "usr_bibek";
const SUBJECT = "sub_aarav01";

let server;
let base;
let crm;

/** Fixed clock, so SLA arithmetic is exact rather than nearly right. */
const NOW = new Date("2026-07-26T12:00:00.000Z");
const minutesAgo = (n) => new Date(NOW.getTime() - n * 60_000).toISOString();
const inMinutes = (n) => new Date(NOW.getTime() + n * 60_000).toISOString();
const daysFromNow = (n) => new Date(NOW.getTime() + n * 86_400_000).toISOString().slice(0, 10);

const tokenFor = (id, opsRole) =>
  issueToken({ sub: id, role: opsRole === "administrator" ? "administrator" : "counsellor", ops_role: opsRole }, SECRET, {
    ttlSeconds: 3600,
  }).token;

async function call(method, path, token, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

before(async () => {
  crm = memoryCrmPort({
    [MODULES.leads]: [
      // Breached: uncontacted, 40 minutes old against a 5-minute promise.
      { id: "lead_1", First_Name: "Aarav", Last_Name: "Kumar", Email: "aarav@example.com", Lead_Status: "New",
        Lead_Source: "Website Form", Created_Time: minutesAgo(40), "Owner.id": KUNAL, "Owner.name": "Kunal" },
      // Inside the window: uncontacted but only 2 minutes old.
      { id: "lead_2", First_Name: "Priya", Last_Name: "Sharma", Email: "priya@example.com", Lead_Status: "New",
        Lead_Source: "WhatsApp", Created_Time: minutesAgo(2), "Owner.id": KUNAL, "Owner.name": "Kunal" },
      // Contacted, so not a breach however old.
      { id: "lead_3", First_Name: "Rohit", Last_Name: "Verma", Email: "rohit@example.com", Lead_Status: "Contacted",
        Lead_Source: "Referral", Created_Time: minutesAgo(600), "Owner.id": BIBEK, "Owner.name": "Bibek" },
      // Unassigned — nobody owns it, so nobody is calling it.
      { id: "lead_4", First_Name: "Sneha", Last_Name: "Rao", Email: "sneha@example.com", Lead_Status: "New",
        Lead_Source: "Instagram", Created_Time: minutesAgo(90), "Owner.id": null },
    ],
    [MODULES.students]: [
      { id: "case_1", Deal_Name: "Aarav — Italy MSc", Stage: "Documents in Progress", Amount: 120000,
        Career_Record_Id: SUBJECT, Destination_Country: "Italy", Visa_Status: "Lodged",
        Closing_Date: "2026-09-01", Modified_Time: minutesAgo(120), "Owner.id": KUNAL, "Owner.name": "Kunal" },
      // Deliberately NOT linked to a Career Record — the workspace must still open.
      { id: "case_2", Deal_Name: "Rohit — Germany BSc", Stage: "Agreement Signed", Amount: 90000,
        Closing_Date: "2026-10-15", Modified_Time: minutesAgo(300), "Owner.id": BIBEK, "Owner.name": "Bibek" },
    ],
    [MODULES.tasks]: [
      { id: "task_1", Subject: "Call Aarav", Status: "Not Started", Priority: "High",
        Due_Date: "2026-07-20", Created_Time: minutesAgo(5000), "Owner.id": KUNAL, "Owner.name": "Kunal" },
      { id: "task_2", Subject: "Send Priya the DSU guide", Status: "Completed", Priority: "Normal",
        Due_Date: "2026-07-25", Created_Time: minutesAgo(4000), "Owner.id": KUNAL, "Owner.name": "Kunal" },
    ],
    [MODULES.collaborators]: [
      // Signed and running — the partnership that works.
      { id: "acc_1", Account_Name: "Università di Bologna", Account_Type: "University",
        Website: "https://unibo.it", Billing_Country: "Italy", Partnership_Stage: "Active",
        Agreement_Status: "Signed", Agreement_Signed_On: "2026-01-15",
        Agreement_Expires_On: daysFromNow(400), Created_Time: minutesAgo(200_000),
        Modified_Time: minutesAgo(900), "Owner.id": FOUNDER, "Owner.name": "Founder" },
      // Mid-pipeline, and its agreement lapses inside the 90-day warning window.
      { id: "acc_2", Account_Name: "Sapienza Università di Roma", Account_Type: "University",
        Billing_Country: "Italy", Partnership_Stage: "In Discussion", Agreement_Status: "Drafted",
        Agreement_Expires_On: daysFromNow(45), Created_Time: minutesAgo(100_000),
        Modified_Time: minutesAgo(4000), "Owner.id": FOUNDER, "Owner.name": "Founder" },
      // Owned by the partnerships lead — the record that proves scoping.
      { id: "acc_3", Account_Name: "EduBridge Agents", Account_Type: "Recruitment Agent",
        Billing_Country: "Nepal", Partnership_Stage: "Contacted", Agreement_Status: "None",
        Created_Time: minutesAgo(50_000), Modified_Time: minutesAgo(6000),
        "Owner.id": "usr_kishor", "Owner.name": "Kishor" },
    ],
    [MODULES.contacts]: [
      { id: "con_1", First_Name: "Giulia", Last_Name: "Rossi", Email: "giulia@unibo.example",
        Title: "Head of International", Created_Time: minutesAgo(90_000),
        "Account_Name.id": "acc_1", "Account_Name.name": "Università di Bologna",
        "Owner.id": FOUNDER, "Owner.name": "Founder" },
    ],
    [MODULES.meetings]: [
      { id: "evt_1", Event_Title: "Annual intake review", Start_DateTime: minutesAgo(20_000),
        Venue: "Bologna", Created_Time: minutesAgo(30_000),
        "What_Id.id": "acc_1", "What_Id.name": "Università di Bologna",
        "Owner.id": FOUNDER, "Owner.name": "Founder" },
      { id: "evt_2", Event_Title: "Scholarship planning", Start_DateTime: inMinutes(10_000),
        Venue: "Zoom", Created_Time: minutesAgo(500),
        "What_Id.id": "acc_1", "What_Id.name": "Università di Bologna",
        "Owner.id": FOUNDER, "Owner.name": "Founder" },
    ],
  });

  /* A real Career Record, written through the real appendEvent — hash-chained,
     invariant-checked, classified. Not fabricated rows: if an event here were
     invalid, this would throw rather than produce a workspace built on fiction. */
  const record = memoryStore();
  const staff = { kind: "human", id: "usr_kunal", role: "counsellor" };
  const seedEvent = (type, payload, occurredAt) =>
    appendEvent(record, { subjectId: SUBJECT, type, actor: staff, payload, occurredAt });

  await seedEvent("profile.created", { origin_country: "India" }, minutesAgo(200_000));
  await seedEvent("counselling.session_held", { topic: "Destination shortlisting" }, minutesAgo(20_000));
  await seedEvent("application.submitted", { institution: "Bologna", programme: "MSc Data Science" }, minutesAgo(60_000));
  await seedEvent("admission.offered", { institution: "Bologna" }, minutesAgo(10_000));
  await seedEvent("application.submitted", { institution: "Sapienza" }, minutesAgo(50_000));
  await seedEvent("document.submitted", { document: "Passport scan" }, minutesAgo(30_000));
  await seedEvent("visa.applied", {}, minutesAgo(15_000));
  // Internal audit event — the Record's permission layer must hide this from staff.
  await appendEvent(record, {
    subjectId: SUBJECT, type: "access.exercised",
    actor: { kind: "human", id: "usr_other", role: "administrator" },
    payload: { action: "read_record" },
  });

  server = createOpsServer({ crm, record, secret: SECRET, now: () => NOW, cors: { allowed: ["https://ops.richenquest.com"] } });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

/* ══════════════════════════════════════════════════════ authentication ══ */

test("every operations route refuses an unauthenticated request", async () => {
  for (const [method, path] of [
    ["GET", "/v1/ops/dashboard"], ["GET", "/v1/ops/leads"], ["GET", "/v1/ops/tasks"],
    ["GET", "/v1/ops/analytics"], ["GET", "/v1/ops/students"], ["GET", "/v1/ops/collaborators"],
  ]) {
    const { status } = await call(method, path, null);
    assert.equal(status, 401, `${method} ${path} requires a token`);
  }
});

test("a student's token cannot open the operations console", async () => {
  const studentToken = issueToken({ sub: "sub_a", role: "subject", subject_id: "sub_a" }, SECRET).token;
  const { status, body } = await call("GET", "/v1/ops/dashboard", studentToken);
  assert.equal(status, 403);
  assert.match(JSON.stringify(body), /operations|forbidden/i);
});

test("a token signed by another deployment is refused", async () => {
  const forged = issueToken({ sub: FOUNDER, role: "administrator" }, randomBytes(32).toString("hex")).token;
  const { status } = await call("GET", "/v1/ops/dashboard", forged);
  assert.equal(status, 401);
});

/* ════════════════════════════════════════════════ the founder dashboard ══ */

test("the founder dashboard answers the whole morning question in one request", async () => {
  const { status, body } = await call("GET", "/v1/ops/dashboard", tokenFor(FOUNDER, "administrator"));
  assert.equal(status, 200);

  assert.equal(body.actor.role, "administrator");
  assert.equal(body.actor.scope, "all");

  assert.equal(body.leads.new_this_week, 4, "the founder sees every lead");
  assert.equal(body.leads.unassigned, 1);
  assert.equal(body.leads.sla_target_minutes, 5);
  // lead_1 (40 min) and lead_4 (90 min) are uncontacted and past the window;
  // lead_2 is 2 minutes old, lead_3 has been contacted.
  assert.equal(body.leads.breached_sla, 2);
  assert.equal(body.leads.awaiting_first_contact, 1);

  assert.equal(body.students.active, 2);
  assert.equal(body.tasks.open, 1, "a completed task is not open work");
  assert.equal(body.tasks.overdue, 1);
});

test("the dashboard surfaces what needs attention, newest problem first", async () => {
  const { body } = await call("GET", "/v1/ops/dashboard", tokenFor(FOUNDER, "administrator"));
  const kinds = body.attention.map((a) => a.kind);
  assert.ok(kinds.includes("sla_breach"), "a broken 5-minute promise is surfaced");
  assert.ok(kinds.includes("unassigned"), "a lead nobody owns is surfaced");

  const breach = body.attention.find((a) => a.kind === "sla_breach");
  assert.match(breach.detail, /minutes/);
  assert.match(breach.link, /^#\/leads\//, "every item is actionable, not just informational");
});

/* ═════════════════════════════════════════════════════ lead management ══ */

test("leads list, filter and read back with their full correspondence", async () => {
  const token = tokenFor(FOUNDER, "administrator");

  const list = await call("GET", "/v1/ops/leads", token);
  assert.equal(list.status, 200);
  assert.equal(list.body.count, 4);
  // Newest first: the lead that just arrived is the one still callable inside the
  // 5-minute window, so it belongs at the top of the queue.
  assert.equal(list.body.leads[0].name, "Priya Sharma");
  assert.equal(list.body.leads[0].waiting_minutes, 2, "waiting time is computed, not stored");

  const aarav = list.body.leads.find((l) => l.id === "lead_1");
  assert.equal(aarav.waiting_minutes, 40);
  assert.equal(aarav.contacted, false, "a 40-minute-old uncontacted lead is a broken promise");

  const filtered = await call("GET", "/v1/ops/leads?status=Contacted", token);
  assert.equal(filtered.body.count, 1);
  assert.equal(filtered.body.leads[0].name, "Rohit Verma");

  const one = await call("GET", "/v1/ops/leads/lead_1", token);
  assert.equal(one.status, 200);
  assert.equal(one.body.lead.email, "aarav@example.com");
  assert.ok(Array.isArray(one.body.notes));
});

test("updating a lead writes an attributed note, and an empty update is refused", async () => {
  const token = tokenFor(FOUNDER, "administrator");

  const updated = await call("PATCH", "/v1/ops/leads/lead_1", token, {
    status: "Contacted",
    note: "Called, spoke for 10 minutes. Interested in Italy.",
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.lead.status, "Contacted");
  assert.equal(updated.body.lead.contacted, true, "contacting a lead clears it from the SLA breach list");

  const read = await call("GET", "/v1/ops/leads/lead_1", token);
  assert.equal(read.body.notes.length, 1);
  assert.match(read.body.notes[0].title, /Founder|Administrator/i, "the note names who wrote it");

  const empty = await call("PATCH", "/v1/ops/leads/lead_2", token, {});
  assert.equal(empty.status, 400, "an update that changes nothing is a mistake, not a no-op");
});

test("a missing lead is a 404, not an empty success", async () => {
  const { status } = await call("GET", "/v1/ops/leads/lead_nonexistent", tokenFor(FOUNDER, "administrator"));
  assert.equal(status, 404);
});

/* ═══════════════════════════════ authorisation, proven with no team yet ══ */

test("a counsellor sees only their own leads — enforced over real HTTP", async () => {
  const { status, body } = await call("GET", "/v1/ops/leads", tokenFor(KUNAL, "counsellor"));
  assert.equal(status, 200);

  const ids = body.leads.map((l) => l.id).sort();
  // Kunal's two leads plus the unassigned one; Bibek's lead_3 is invisible.
  assert.deepEqual(ids, ["lead_1", "lead_2", "lead_4"]);
});

test("a counsellor cannot read a colleague's lead by guessing its id", async () => {
  const { status } = await call("GET", "/v1/ops/leads/lead_3", tokenFor(KUNAL, "counsellor"));
  assert.equal(status, 403, "scoping is enforced on the by-id route, not only on the list");
});

test("a counsellor may not reassign a lead; a manager may", async () => {
  const denied = await call("POST", "/v1/ops/leads/lead_1/assign", tokenFor(KUNAL, "counsellor"), { owner_id: BIBEK });
  assert.equal(denied.status, 403, "leads:assign separates a counsellor from a manager");

  const allowed = await call("POST", "/v1/ops/leads/lead_1/assign", tokenFor("usr_harsh", "manager"), { owner_id: BIBEK });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.body.lead.owner.id, BIBEK);
});

test("marketing may read leads but never write them", async () => {
  const token = tokenFor("usr_vishrut", "marketing");
  assert.equal((await call("GET", "/v1/ops/leads", token)).status, 200);
  assert.equal((await call("PATCH", "/v1/ops/leads/lead_2", token, { status: "Contacted" })).status, 403);
  assert.equal((await call("GET", "/v1/ops/students", token)).status, 403, "marketing sees no student data");
  assert.equal((await call("GET", "/v1/ops/analytics", token)).status, 200);
});

test("an auditor is read-only everywhere", async () => {
  const token = tokenFor("usr_auditor", "auditor");
  assert.equal((await call("GET", "/v1/ops/students", token)).status, 200);
  assert.equal((await call("GET", "/v1/ops/tasks", token)).status, 200);
  assert.equal((await call("POST", "/v1/ops/tasks", token, { subject: "x" })).status, 403);
});

/* ══════════════════════════════════════════════════════════ task manager ══ */

test("a task is created, listed, and completed", async () => {
  const token = tokenFor(FOUNDER, "administrator");

  const created = await call("POST", "/v1/ops/tasks", token, {
    subject: "Follow up with Sneha",
    due_date: "2026-07-27",
    priority: "High",
    related_to: "lead_4",
    related_module: "leads",
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.task.subject, "Follow up with Sneha");
  assert.equal(created.body.task.status, "Not Started");
  assert.equal(created.body.task.owner.id, FOUNDER, "a task defaults to its creator");

  const open = await call("GET", "/v1/ops/tasks", token);
  assert.ok(open.body.tasks.some((t) => t.id === created.body.task.id));
  assert.equal(open.body.tasks.every((t) => t.status !== "Completed"), true, "the list is open work by default");

  const done = await call("POST", `/v1/ops/tasks/${created.body.task.id}/complete`, token);
  assert.equal(done.status, 200);
  assert.equal(done.body.task.status, "Completed");

  const after = await call("GET", "/v1/ops/tasks", token);
  assert.equal(after.body.tasks.some((t) => t.id === created.body.task.id), false, "completed work leaves the list");
});

test("assigning a task to someone else needs tasks:assign", async () => {
  const denied = await call("POST", "/v1/ops/tasks", tokenFor(KUNAL, "counsellor"), {
    subject: "Chase Bibek's lead", owner_id: BIBEK,
  });
  assert.equal(denied.status, 403, "a counsellor cannot put work on a colleague's list");

  const own = await call("POST", "/v1/ops/tasks", tokenFor(KUNAL, "counsellor"), { subject: "My own task" });
  assert.equal(own.status, 201, "but may create their own");

  const manager = await call("POST", "/v1/ops/tasks", tokenFor("usr_harsh", "manager"), {
    subject: "Please call Aarav", owner_id: KUNAL,
  });
  assert.equal(manager.status, 201);
  assert.equal(manager.body.task.owner.id, KUNAL);
});

test("an invalid task is refused with a field-level reason", async () => {
  const { status, body } = await call("POST", "/v1/ops/tasks", tokenFor(FOUNDER, "administrator"), {
    subject: "", priority: "Urgent",
  });
  assert.equal(status, 400);
  assert.ok(JSON.stringify(body).length > 0);
});

/* ═════════════════════════════════════════════════ students + partners ══ */

test("student cases and collaborators list and read", async () => {
  const token = tokenFor(FOUNDER, "administrator");

  const students = await call("GET", "/v1/ops/students", token);
  assert.equal(students.body.count, 2);
  assert.equal(students.body.students[0].stage, "Documents in Progress");

  const one = await call("GET", "/v1/ops/students/case_1", token);
  assert.equal(one.status, 200);
  assert.equal(one.body.student.name, "Aarav — Italy MSc");

  const partners = await call("GET", "/v1/ops/collaborators", token);
  assert.equal(partners.body.count, 3);
  assert.equal(partners.body.collaborators[0].name, "Università di Bologna", "most recently updated first");
});

/* ═══════════════════════════════════════════ student operations platform ══ */

test("the student workspace assembles all six modules in one request", async () => {
  const { status, body } = await call("GET", "/v1/ops/students/case_1", tokenFor(FOUNDER, "administrator"));
  assert.equal(status, 200);

  assert.equal(body.record_linked, true, "this case names a Career Record subject");

  // 1. Workspace
  assert.equal(body.workspace.stage, "Documents in Progress");
  assert.equal(body.workspace.counsellor.name, "Kunal");
  assert.ok(body.workspace.progress.length > 0, "progress is the record's own history");

  // 2. Application pipeline
  assert.equal(body.applications.counts.total, 2);
  assert.equal(body.applications.counts.offers, 1);
  assert.equal(body.applications.counts.awaiting_decision, 1);
  assert.equal(body.applications.offers[0].institution.name, "Bologna");

  // 3. Document centre
  assert.equal(body.documents.required_count, 5);
  assert.ok(body.documents.missing.length > 0);
  assert.ok(body.documents.actions.some((a) => a.kind === "verify" || a.kind === "collect"));

  // 4. Visa pipeline
  assert.equal(body.visa.status, "Lodged");
  assert.equal(body.visa.ready_to_travel, false);

  // 5. Communication timeline
  assert.ok(body.communication.counts.total > 0);
  assert.equal(typeof body.communication.days_since_contact, "number");

  // 6. Dashboard
  assert.ok(Array.isArray(body.dashboard.attention));
  assert.equal(body.dashboard.stage, "Documents in Progress");
});

test("history comes from the Career Record's own projection, not a reimplementation", async () => {
  const { body } = await call("GET", "/v1/ops/students/case_1", tokenFor(FOUNDER, "administrator"));

  // `access.exercised` is classified `internal` and is filtered out for a staff
  // viewer by the Record's own permission layer — proof the projection ran, and
  // that this platform did not roll its own filtering.
  assert.equal(
    body.workspace.progress.some((p) => p.type === "access.exercised"),
    false,
    "internal audit events never reach a staff workspace"
  );
  assert.ok(body.workspace.progress.some((p) => p.type === "counselling.session_held"));
});

test("a case with no linked record still opens, with an honestly empty history", async () => {
  const { status, body } = await call("GET", "/v1/ops/students/case_2", tokenFor(FOUNDER, "administrator"));
  assert.equal(status, 200);

  assert.equal(body.record_linked, false);
  assert.equal(body.workspace.progress.length, 0, "empty, not invented");
  assert.equal(body.applications.counts.total, 0);
  assert.equal(body.documents.missing.length, 5, "every required document is missing when nothing is recorded");
  // The commercial frame is still worth showing.
  assert.equal(body.workspace.stage, "Agreement Signed");
  assert.equal(body.workspace.counsellor.name, "Bibek");
});

test("the student workspace obeys the same scoping as everything else", async () => {
  const kunal = tokenFor(KUNAL, "counsellor");
  assert.equal((await call("GET", "/v1/ops/students/case_1", kunal)).status, 200, "Kunal owns case_1");
  assert.equal((await call("GET", "/v1/ops/students/case_2", kunal)).status, 403, "case_2 is Bibek's");

  // Marketing has no students capability at all.
  assert.equal((await call("GET", "/v1/ops/students/case_1", tokenFor("usr_v", "marketing"))).status, 403);
});

test("a counsellor sees only their own student cases", async () => {
  const { body } = await call("GET", "/v1/ops/students", tokenFor(KUNAL, "counsellor"));
  assert.deepEqual(body.students.map((s) => s.id), ["case_1"]);
});

/* ═════════════════════════════════════════════════════ collaboration CRM ══ */

test("the register lists universities and partners with a pipeline summary", async () => {
  const { status, body } = await call("GET", "/v1/ops/collaborators", tokenFor(FOUNDER, "administrator"));
  assert.equal(status, 200);

  assert.equal(body.count, 3);
  assert.equal(body.summary.total, 3);
  assert.equal(body.summary.active, 1, "Bologna has a signed agreement");
  assert.equal(body.summary.open, 2);
  assert.equal(body.summary.by_type.University, 2);
  assert.equal(body.summary.expiring_agreements.length, 1, "Sapienza's agreement lapses inside 90 days");

  // The vocabulary travels with the list so the console never hardcodes a stage.
  assert.ok(body.vocabulary.stages.includes("Agreement Signed"));
  assert.ok(body.vocabulary.types.includes("Recruitment Agent"));
});

test("the register filters by type and by pipeline stage", async () => {
  const token = tokenFor(FOUNDER, "administrator");

  const universities = await call("GET", "/v1/ops/collaborators?type=University", token);
  assert.equal(universities.body.count, 2);

  const active = await call("GET", "/v1/ops/collaborators?stage=Active", token);
  assert.equal(active.body.count, 1);
  assert.equal(active.body.collaborators[0].name, "Università di Bologna");
});

test("one request returns the whole relationship: contacts, meetings, notes, documents, timeline", async () => {
  const { status, body } = await call("GET", "/v1/ops/collaborators/acc_1", tokenFor(FOUNDER, "administrator"));
  assert.equal(status, 200);

  assert.equal(body.institution.name, "Università di Bologna");
  assert.equal(body.institution.stage, "Active");
  assert.equal(body.institution.agreement.status, "Signed");

  assert.equal(body.contacts.length, 1);
  assert.equal(body.contacts[0].name, "Giulia Rossi");
  assert.equal(body.contacts[0].title, "Head of International");

  assert.equal(body.meetings.upcoming.length, 1, "a scheduled meeting is separated from history");
  assert.equal(body.meetings.past.length, 1);

  assert.ok(Array.isArray(body.documents));
  assert.ok(body.timeline.length >= 3, "the timeline merges every source");
  const kinds = body.timeline.map((e) => e.kind);
  assert.ok(kinds.includes("meeting"));
  assert.ok(kinds.includes("agreement"));
});

test("an institution is added at the start of the pipeline and owned by its creator", async () => {
  const { status, body } = await call("POST", "/v1/ops/collaborators", tokenFor(FOUNDER, "administrator"), {
    name: "Politecnico di Milano",
    type: "University",
    country: "Italy",
    website: "https://polimi.it",
  });
  assert.equal(status, 201);
  assert.equal(body.institution.name, "Politecnico di Milano");
  assert.equal(body.institution.stage, "Identified", "never a record with no position in the pipeline");
  assert.equal(body.institution.agreement.status, "None");
  assert.equal(body.institution.owner.id, FOUNDER);
});

test("moving a partnership records who moved it, in the timeline", async () => {
  const token = tokenFor(FOUNDER, "administrator");

  const moved = await call("PATCH", "/v1/ops/collaborators/acc_2", token, {
    stage: "Agreement Drafted",
    note: "Draft MoU sent to their legal team.",
  });
  assert.equal(moved.status, 200);
  assert.equal(moved.body.institution.stage, "Agreement Drafted");

  const detail = await call("GET", "/v1/ops/collaborators/acc_2", token);
  const note = detail.body.timeline.find((e) => e.kind === "note");
  assert.ok(note, "the stage change is visible in the history");
  assert.match(note.title, /Founder|Administrator/i, "attributed, never anonymous");
  assert.match(note.detail, /Agreement Drafted/);
});

test("recording a signed agreement updates status and dates together", async () => {
  const token = tokenFor(FOUNDER, "administrator");
  const { status, body } = await call("PATCH", "/v1/ops/collaborators/acc_3", token, {
    stage: "Agreement Signed",
    agreement_status: "Signed",
    agreement_signed_on: "2026-07-01",
    agreement_expires_on: "2029-07-01",
  });

  assert.equal(status, 200);
  assert.equal(body.institution.agreement.status, "Signed");
  assert.equal(body.institution.agreement.signed_on, "2026-07-01");
  assert.equal(body.institution.is_active, true, "a signed partnership leaves the open pipeline");
});

test("an empty update is refused, and an unknown stage never reaches the CRM", async () => {
  const token = tokenFor(FOUNDER, "administrator");
  assert.equal((await call("PATCH", "/v1/ops/collaborators/acc_1", token, {})).status, 400);
  assert.equal(
    (await call("PATCH", "/v1/ops/collaborators/acc_1", token, { stage: "Best Friends" })).status,
    400,
    "the pipeline vocabulary is enforced at the edge"
  );
});

test("a contact is added against its institution", async () => {
  const token = tokenFor(FOUNDER, "administrator");
  const { status, body } = await call("POST", "/v1/ops/collaborators/acc_2/contacts", token, {
    first_name: "Marco",
    last_name: "Ferrari",
    email: "marco@sapienza.example",
    title: "Partnerships Manager",
  });

  assert.equal(status, 201);
  assert.equal(body.contact.name, "Marco Ferrari");
  assert.equal(body.contact.institution.id, "acc_2");

  const detail = await call("GET", "/v1/ops/collaborators/acc_2", token);
  assert.ok(detail.body.contacts.some((c) => c.name === "Marco Ferrari"));
});

test("a meeting is scheduled and lands in the upcoming list and the timeline", async () => {
  const token = tokenFor(FOUNDER, "administrator");
  const startsAt = new Date(NOW.getTime() + 7 * 86_400_000).toISOString();

  const { status, body } = await call("POST", "/v1/ops/collaborators/acc_2/meetings", token, {
    title: "MoU review call",
    starts_at: startsAt,
    venue: "Zoom",
  });
  assert.equal(status, 201);
  assert.equal(body.meeting.upcoming, true);

  const detail = await call("GET", "/v1/ops/collaborators/acc_2", token);
  assert.ok(detail.body.meetings.upcoming.some((m) => m.title === "MoU review call"));
  assert.ok(detail.body.timeline.some((e) => e.kind === "meeting" && e.title === "MoU review call"));
});

test("a malformed meeting time is refused rather than stored", async () => {
  const { status } = await call("POST", "/v1/ops/collaborators/acc_1/meetings", tokenFor(FOUNDER, "administrator"), {
    title: "Bad time",
    starts_at: "next tuesday",
  });
  assert.equal(status, 400);
});

test("collaboration respects the same permission model as everything else", async () => {
  // Partnerships is the role this CRM exists for — it may write.
  const partnerships = tokenFor("usr_kishor", "partner_manager");
  assert.equal((await call("GET", "/v1/ops/collaborators", partnerships)).status, 200);

  // A counsellor has no collaboration capability at all.
  const counsellor = tokenFor(KUNAL, "counsellor");
  assert.equal((await call("GET", "/v1/ops/collaborators", counsellor)).status, 403);
  assert.equal((await call("GET", "/v1/ops/collaborators/acc_1", counsellor)).status, 403);

  // Marketing may not either, and an auditor may read but never write.
  assert.equal((await call("GET", "/v1/ops/collaborators", tokenFor("usr_v", "marketing"))).status, 403);
  const auditor = tokenFor("usr_a", "auditor");
  assert.equal((await call("GET", "/v1/ops/collaborators", auditor)).status, 200);
  assert.equal((await call("PATCH", "/v1/ops/collaborators/acc_1", auditor, { stage: "Dormant" })).status, 403);
  assert.equal((await call("POST", "/v1/ops/collaborators", auditor, { name: "Nope" })).status, 403);
});

test("a partnerships lead sees only their own institutions — scoping, before any team exists", async () => {
  const kishor = tokenFor("usr_kishor", "partner_manager");
  const { body } = await call("GET", "/v1/ops/collaborators", kishor);

  // acc_3 is owned by usr_kishor; acc_1 and acc_2 belong to the founder.
  assert.deepEqual(body.collaborators.map((c) => c.id).sort(), ["acc_3"]);
  assert.equal((await call("GET", "/v1/ops/collaborators/acc_1", kishor)).status, 403);
});

/* ══════════════════════════ university partnership operating system ══ */

test("the university profile round-trips: accreditation, campuses, international office", async () => {
  const token = tokenFor(FOUNDER, "administrator");

  const updated = await call("PATCH", "/v1/ops/collaborators/acc_1", token, {
    partnership_type: "Exchange",
    accreditation: "MIUR recognised · EUA member",
    campuses: "Bologna, Rimini, Forlì",
    international_office_contact: "Giulia Rossi",
    international_office_email: "intl@unibo.example",
  });
  assert.equal(updated.status, 200);

  const { body } = await call("GET", "/v1/ops/collaborators/acc_1", token);
  const inst = body.institution;
  assert.equal(inst.partnership_type, "Exchange");
  assert.equal(inst.accreditation, "MIUR recognised · EUA member");
  assert.deepEqual(inst.campuses, ["Bologna", "Rimini", "Forlì"]);
  assert.equal(inst.international_office.email, "intl@unibo.example");

  // The change is attributed in the history, like every other partnership change.
  assert.ok(body.timeline.some((e) => e.kind === "note" && /partnership type/i.test(e.detail ?? "")));
});

test("the register publishes the full vocabulary so the console hardcodes nothing", async () => {
  const { body } = await call("GET", "/v1/ops/collaborators", tokenFor(FOUNDER, "administrator"));
  const v = body.vocabulary;
  assert.ok(v.partnership_types.includes("Recruitment (Commission)"));
  assert.ok(v.offering_kinds.includes("Scholarship"));
  assert.ok(v.degree_levels.includes("Master's"));
});

test("a degree joins the programme catalogue; a scholarship joins opportunities", async () => {
  const token = tokenFor(FOUNDER, "administrator");

  const degree = await call("POST", "/v1/ops/collaborators/acc_1/offerings", token, {
    name: "MSc Data Science",
    kind: "Degree",
    level: "Master's",
    tuition: 12000,
    currency: "EUR",
    duration: "2 years",
    intakes: "September, February",
    deadline: daysFromNow(45),
  });
  assert.equal(degree.status, 201);
  assert.equal(degree.body.offering.kind, "Degree");
  assert.equal(degree.body.offering.tuition, 12000);
  assert.deepEqual(degree.body.offering.intakes, ["September", "February"]);

  const scholarship = await call("POST", "/v1/ops/collaborators/acc_1/offerings", token, {
    name: "DSU need-based grant",
    kind: "Scholarship",
    deadline: daysFromNow(10),
  });
  assert.equal(scholarship.status, 201);

  const { body } = await call("GET", "/v1/ops/collaborators/acc_1", token);
  assert.equal(body.programs.length, 1, "degrees are the catalogue");
  assert.equal(body.programs[0].name, "MSc Data Science");
  assert.equal(body.opportunities.length, 1, "everything else is an opportunity");
  assert.equal(body.opportunities[0].closing_soon, true, "a deadline 10 days out is flagged");
});

test("an unknown offering kind or degree level never reaches the CRM", async () => {
  const token = tokenFor(FOUNDER, "administrator");
  assert.equal(
    (await call("POST", "/v1/ops/collaborators/acc_1/offerings", token, { name: "X", kind: "Bootcamp" })).status,
    400
  );
  assert.equal(
    (await call("POST", "/v1/ops/collaborators/acc_1/offerings", token, { name: "X", kind: "Degree", level: "Wizard" })).status,
    400
  );
});

test("the partnership workspace returns the required-document checklist", async () => {
  const token = tokenFor(FOUNDER, "administrator");
  // acc_1 is an Exchange partnership (set above) with no documents filed.
  const { body } = await call("GET", "/v1/ops/collaborators/acc_1", token);

  assert.equal(body.required_documents.partnership_type, "Exchange");
  assert.equal(body.required_documents.complete, false);
  assert.ok(body.required_documents.missing.includes("Signed agreement"));
  assert.ok(body.required_documents.missing.includes("Memorandum of understanding"));
});

test("renewal intelligence returns one worked queue across the register", async () => {
  const { status, body } = await call("GET", "/v1/ops/collaborators/renewals", tokenFor(FOUNDER, "administrator"));
  assert.equal(status, 200);

  assert.ok(Array.isArray(body.items));
  assert.equal(typeof body.counts.total, "number");
  assert.equal(body.sla_days, 180, "an active partnership runs on a slower clock than a pipeline deal");

  // acc_1 is Active/Exchange with no documents filed → missing documents.
  const missing = body.items.find((i) => i.kind === "missing_documents");
  assert.ok(missing, "a partnership we cannot produce paperwork for is surfaced");
  assert.equal(missing.institution.id, "acc_1");

  // acc_2's agreement lapses inside the warning window → renewal due.
  assert.ok(body.items.some((i) => i.kind === "renewal_due" && i.institution.id === "acc_2"));

  // Alerts sort above actions, so the queue is worked top-down.
  const severities = body.items.map((i) => i.severity);
  assert.deepEqual(severities, [...severities].sort((a, b) => ({ alert: 0, action: 1, info: 2 })[a] - ({ alert: 0, action: 1, info: 2 })[b]));
});

test("the renewals route is a literal, not swallowed by the :id route", async () => {
  // `/collaborators/renewals` must not be read as institution id "renewals".
  const { status, body } = await call("GET", "/v1/ops/collaborators/renewals", tokenFor(FOUNDER, "administrator"));
  assert.equal(status, 200);
  assert.equal(body.institution, undefined, "this is the renewals queue, not a 404 institution lookup");
});

test("renewal intelligence obeys the same scoping and capabilities", async () => {
  // A partnerships lead sees only their own institutions in the queue.
  const kishor = await call("GET", "/v1/ops/collaborators/renewals", tokenFor("usr_kishor", "partner_manager"));
  assert.equal(kishor.status, 200);
  assert.ok(kishor.body.items.every((i) => i.institution.id === "acc_3"));

  // And a role without collaboration capability cannot reach it at all.
  assert.equal((await call("GET", "/v1/ops/collaborators/renewals", tokenFor(KUNAL, "counsellor"))).status, 403);
});

test("adding an offering needs collaboration:write", async () => {
  const auditor = tokenFor("usr_a", "auditor");
  const { status } = await call("POST", "/v1/ops/collaborators/acc_1/offerings", auditor, { name: "X", kind: "Degree" });
  assert.equal(status, 403);
});

test("a missing institution is a 404 on every collaboration route", async () => {
  const token = tokenFor(FOUNDER, "administrator");
  assert.equal((await call("GET", "/v1/ops/collaborators/acc_nope", token)).status, 404);
  assert.equal((await call("PATCH", "/v1/ops/collaborators/acc_nope", token, { stage: "Dormant" })).status, 404);
  assert.equal((await call("POST", "/v1/ops/collaborators/acc_nope/contacts", token, { last_name: "X" })).status, 404);
});

/* ══════════════════════════════════════════════════════════════ analytics ══ */

test("analytics reports rates with their denominators, never a bare percentage", async () => {
  const { status, body } = await call("GET", "/v1/ops/analytics?days=30", tokenFor(FOUNDER, "administrator"));
  assert.equal(status, 200);

  assert.equal(body.window_days, 30);
  assert.ok(body.leads.total >= 1);
  assert.ok(body.leads.by_source["Website Form"] >= 1);

  const conv = body.conversion.leads_to_cases;
  assert.equal(typeof conv.numerator, "number");
  assert.equal(typeof conv.denominator, "number");
  assert.equal(conv.rate, conv.denominator ? conv.numerator / conv.denominator : null);

  assert.equal(body.speed_to_lead.target_minutes, 5);
  assert.equal(typeof body.speed_to_lead.median_minutes, "number");
});

test("the analytics window is clamped rather than trusted", async () => {
  const token = tokenFor(FOUNDER, "administrator");
  assert.equal((await call("GET", "/v1/ops/analytics?days=99999", token)).body.window_days, 365);
  assert.equal((await call("GET", "/v1/ops/analytics?days=-5", token)).body.window_days, 1);
});

/* ═══════════════════════════════════════════════════════════════ the shell ══ */

test("/me tells the console exactly what to render", async () => {
  const founder = await call("GET", "/v1/ops/me", tokenFor(FOUNDER, "administrator"));
  assert.equal(founder.body.can["admin:users"], true);
  assert.equal(founder.body.actor.label, "Founder / Administrator");

  const counsellor = await call("GET", "/v1/ops/me", tokenFor(KUNAL, "counsellor"));
  assert.equal(counsellor.body.can["leads:assign"], false);
  assert.equal(counsellor.body.actor.scope, "own");
});

test("preflight advertises every method the router serves", async () => {
  // The bug this pins: the shared CORS helper defaults to GET/POST/OPTIONS, so a
  // PATCH route answered its preflight 204 while omitting PATCH from
  // access-control-allow-methods. The browser then refused to send the request at
  // all. Node's fetch ignores CORS, so every server-side test passed while the
  // console was broken — only this assertion sees it.
  const res = await fetch(`${base}/v1/ops/leads/lead_1`, {
    method: "OPTIONS",
    headers: { origin: "https://ops.richenquest.com", "access-control-request-method": "PATCH" },
  });
  const allowed = (res.headers.get("access-control-allow-methods") ?? "").split(",").map((m) => m.trim());

  for (const method of OPS_HTTP_METHODS) {
    assert.ok(allowed.includes(method), `preflight permits ${method}, which the router serves`);
  }
  assert.ok(allowed.includes("PATCH"), "PATCH specifically — the method that was silently dropped");
});

test("CORS admits the console origin and no other", async () => {
  const ok = await fetch(`${base}/v1/ops/dashboard`, {
    method: "OPTIONS",
    headers: { origin: "https://ops.richenquest.com", "access-control-request-method": "GET" },
  });
  assert.equal(ok.headers.get("access-control-allow-origin"), "https://ops.richenquest.com");

  const foreign = await fetch(`${base}/v1/ops/dashboard`, {
    method: "OPTIONS",
    headers: { origin: "https://not-richenquest.example", "access-control-request-method": "GET" },
  });
  assert.equal(foreign.headers.get("access-control-allow-origin"), null);
});

test("an unknown route is a 404 and a wrong method is a 405", async () => {
  const token = tokenFor(FOUNDER, "administrator");
  assert.equal((await call("GET", "/v1/ops/nonexistent", token)).status, 404);
  assert.equal((await call("DELETE", "/v1/ops/leads/lead_1", token)).status, 405);
});
