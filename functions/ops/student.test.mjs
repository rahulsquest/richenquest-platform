/**
 * Student Operations — unit tests for the derivations.
 *
 * Everything here folds the Career Record's own event log. The properties that
 * matter are the ones where a naive implementation silently tells the wrong
 * story: an application whose rejection arrived after its offer, a document
 * rejected after being submitted, a visa refused then reapplied for and granted.
 * Each of those is an ordering question, and each is answered here rather than
 * left to whichever write happened to land last.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_STATES, REQUIRED_STUDENT_DOCUMENTS,
  studentWorkspace, applicationPipeline, documentCenter, visaPipeline,
  communicationTimeline, studentDashboard,
} from "./student.mjs";

const NOW = new Date("2026-07-26T12:00:00.000Z");
const daysAgo = (n) => new Date(NOW.getTime() - n * 86_400_000).toISOString();
const dateIn = (n) => new Date(NOW.getTime() + n * 86_400_000).toISOString().slice(0, 10);

/** An entry in the shape functions/record/views.mjs timeline() produces. */
const entry = (type, { at = daysAgo(1), decision = {}, evidence = [], actor = "counsellor", id } = {}) => ({
  event_id: id ?? `evt_${Math.random().toString(36).slice(2, 10)}`,
  type,
  time: at,
  recorded: at,
  decision,
  evidence,
  actor: { role: actor, kind: "human", id: "usr_k" },
  authored_by_ai: false,
});

const caseRow = (over = {}) => ({
  id: "case_1",
  Deal_Name: "Aarav Kumar — Italy MSc",
  Stage: "Documents in Progress",
  Career_Record_Id: "sub_aarav01",
  Destination_Country: "Italy",
  Closing_Date: dateIn(30),
  "Owner.id": "usr_kunal",
  "Owner.name": "Kunal",
  ...over,
});

/* ═════════════════════════════════════════════════════════════ workspace ══ */

test("the workspace joins the commercial frame to the record's history", () => {
  const entries = [entry("profile.created", { at: daysAgo(90) }), entry("counselling.session_held", { at: daysAgo(3) })];
  const w = studentWorkspace(caseRow(), entries, NOW);

  assert.equal(w.case_id, "case_1");
  assert.equal(w.subject_id, "sub_aarav01");
  assert.equal(w.stage, "Documents in Progress");
  assert.equal(w.counsellor.name, "Kunal", "the assigned counsellor is the CRM owner");
  assert.equal(w.days_to_deadline, 30);
  assert.equal(w.deadline_passed, false);
  assert.equal(w.progress[0].type, "counselling.session_held", "progress is newest first");
});

test("the workspace exposes no identity fields — those live in the vault", () => {
  const w = studentWorkspace(caseRow(), [], NOW);
  const serialised = JSON.stringify(w).toLowerCase();
  for (const forbidden of ["date_of_birth", "passport_number", "legal_name"]) {
    assert.ok(!serialised.includes(forbidden), `${forbidden} never reaches a staff console`);
  }
  assert.equal(w.subject_id, "sub_aarav01", "only the pseudonymous record id");
});

test("a passed deadline is stated, not left to be worked out", () => {
  const w = studentWorkspace(caseRow({ Closing_Date: dateIn(-5) }), [], NOW);
  assert.equal(w.deadline_passed, true);
  assert.equal(w.days_to_deadline, -5);
});

/* ══════════════════════════════════════════════════ application pipeline ══ */

test("applications are grouped by institution and resolved from the latest event", () => {
  const entries = [
    entry("application.prepared", { at: daysAgo(60), decision: { institution: "Bologna", programme: "MSc Data Science" } }),
    entry("application.submitted", { at: daysAgo(50), decision: { institution: "Bologna" } }),
    entry("admission.offered", { at: daysAgo(10), decision: { institution: "Bologna" } }),
    entry("application.submitted", { at: daysAgo(40), decision: { institution: "Sapienza" } }),
  ];

  const p = applicationPipeline(entries, NOW);

  assert.equal(p.counts.total, 2);
  assert.equal(p.counts.offers, 1);
  assert.equal(p.counts.awaiting_decision, 1, "Sapienza is submitted with no decision");

  const bologna = p.applications.find((a) => a.institution.name === "Bologna");
  assert.equal(bologna.state, "Offer");
  assert.equal(bologna.programme, "MSc Data Science", "the programme carries through from the earliest event");
  assert.equal(bologna.awaiting_decision, false);

  const sapienza = p.applications.find((a) => a.institution.name === "Sapienza");
  assert.equal(sapienza.waiting_days, 40, "the number a counsellor is otherwise asked to work out");
});

test("a rejection recorded after an offer wins — order decides, not write sequence", () => {
  const entries = [
    entry("admission.offered", { at: daysAgo(20), decision: { institution: "Bologna" } }),
    entry("application.outcome_received", { at: daysAgo(2), decision: { institution: "Bologna", outcome: "Rejected on appeal" } }),
  ];
  const p = applicationPipeline(entries, NOW);
  assert.equal(p.applications[0].state, "Rejected");
  assert.equal(p.counts.rejections, 1);
  assert.equal(p.counts.offers, 0);
});

test("an application naming no institution is kept, not quietly dropped", () => {
  const p = applicationPipeline([entry("application.submitted", { at: daysAgo(5) })], NOW);
  assert.equal(p.counts.total, 1, "hiding it would make the pipeline look tidier than it is");
  assert.equal(p.applications[0].institution.name, null);
});

test("offers, rejections and awaiting decisions are separated for the console", () => {
  const entries = [
    entry("admission.offered", { at: daysAgo(5), decision: { institution: "A" } }),
    entry("application.outcome_received", { at: daysAgo(5), decision: { institution: "B", outcome: "rejected" } }),
    entry("application.submitted", { at: daysAgo(5), decision: { institution: "C" } }),
  ];
  const p = applicationPipeline(entries, NOW);
  assert.equal(p.offers.length, 1);
  assert.equal(p.rejections.length, 1);
  assert.equal(p.awaiting.length, 1);
  assert.ok(APPLICATION_STATES.includes(p.applications[0].state));
});

/* ═════════════════════════════════════════════════════════ document centre ══ */

test("a document rejected after submission reads as rejected", () => {
  const entries = [
    entry("document.submitted", { at: daysAgo(10), decision: { document: "Passport scan" } }),
    entry("document.rejected", { at: daysAgo(2), decision: { document: "Passport scan" } }),
  ];
  const d = documentCenter(entries);
  assert.equal(d.documents[0].state, "Rejected", "the operationally important direction to get right");
  assert.ok(d.actions.some((a) => a.kind === "replace" && a.severity === "alert"));
});

test("the checklist reports what is missing against the required set", () => {
  const entries = [
    entry("document.verified", { at: daysAgo(5), decision: { document: "Passport scan" } }),
    entry("document.verified", { at: daysAgo(4), decision: { document: "Class XII marksheet" } }),
  ];
  const d = documentCenter(entries);

  assert.equal(d.verified_count, 2);
  assert.equal(d.required_count, REQUIRED_STUDENT_DOCUMENTS.length);
  assert.equal(d.complete, false);
  assert.ok(d.missing.includes("Financial proof"));
  assert.ok(d.actions.some((a) => a.kind === "collect"));
});

test("a submitted-but-unverified document produces a verify action, not a green tick", () => {
  const d = documentCenter([entry("document.submitted", { at: daysAgo(1), decision: { document: "Passport" } })]);
  const passport = d.checklist.find((c) => c.key === "passport");
  assert.equal(passport.present, true);
  assert.equal(passport.verified, false, "present is not verified");
  assert.ok(d.actions.some((a) => a.kind === "verify"));
});

test("evidence references travel with a document, so a claim is never shown as evidenced", () => {
  const d = documentCenter([
    entry("document.submitted", { at: daysAgo(1), decision: { document: "Passport" }, evidence: [{ ref: "doc:passport_01" }] }),
    entry("document.submitted", { at: daysAgo(1), decision: { document: "Financial proof" } }),
  ]);
  assert.deepEqual(d.documents.find((x) => x.name === "Passport").evidence, ["doc:passport_01"]);
  assert.deepEqual(d.documents.find((x) => x.name === "Financial proof").evidence, []);
});

/* ══════════════════════════════════════════════════════════ visa pipeline ══ */

test("a visa refused then re-applied and granted reads as granted", () => {
  const entries = [
    entry("visa.applied", { at: daysAgo(120) }),
    entry("visa.refused", { at: daysAgo(90) }),
    entry("visa.applied", { at: daysAgo(60) }),
    entry("visa.granted", { at: daysAgo(10) }),
  ];
  const v = visaPipeline(entries, caseRow(), NOW);
  assert.equal(v.status, "Granted", "the later decision stands");
  assert.equal(v.checklist.find((c) => c.key === "visa").done, true);
});

test("a granted visa says nothing about accommodation or insurance", () => {
  const v = visaPipeline([entry("visa.granted", { at: daysAgo(5) })], caseRow(), NOW);
  assert.equal(v.status, "Granted");
  assert.equal(v.ready_to_travel, false);
  assert.ok(v.outstanding.includes("Health insurance"));
  assert.ok(v.outstanding.includes("Accommodation secured"));
});

test("the travel checklist completes only when every step is recorded", () => {
  const entries = [
    entry("visa.granted", { at: daysAgo(20) }),
    entry("document.verified", { at: daysAgo(15), decision: { document: "Health insurance policy", item: "insurance" } }),
    entry("arrival.accommodation_secured", { at: daysAgo(10) }),
    entry("arrival.confirmed", { at: daysAgo(1) }),
  ];
  const v = visaPipeline(entries, caseRow(), NOW);
  assert.equal(v.ready_to_travel, true);
  assert.deepEqual(v.outstanding, []);
});

test("a CRM visa status that disagrees with the record is surfaced, not silently overridden", () => {
  const v = visaPipeline([entry("visa.granted", { at: daysAgo(3) })], caseRow({ Visa_Status: "Lodged" }), NOW);
  assert.equal(v.status, "Granted");
  assert.equal(v.crm_status, "Lodged");
  assert.equal(v.diverges_from_crm, true, "both are shown rather than one quietly winning");
});

test("waiting time on a lodged visa is measured", () => {
  const v = visaPipeline([entry("visa.applied", { at: daysAgo(45) })], caseRow(), NOW);
  assert.equal(v.status, "Lodged");
  assert.equal(v.waiting_days, 45);
});

/* ═══════════════════════════════════════════════ communication timeline ══ */

test("communication merges the record and the CRM into one history, newest first", () => {
  const c = communicationTimeline({
    entries: [
      entry("counselling.session_held", { at: daysAgo(10), decision: { topic: "Destination shortlisting" } }),
      entry("document.submitted", { at: daysAgo(9) }), // not a communication
    ],
    notes: [{ at: daysAgo(5), title: "Called", content: "Discussed budget." }],
    calls: [{ id: "c1", Subject: "Follow-up call", Call_Start_Time: daysAgo(2), Description: "10 min" }],
    meetings: [{ id: "m1", Event_Title: "Campus tour", Start_DateTime: daysAgo(30) }],
    now: NOW,
  });

  assert.equal(c.counts.total, 4, "the document event is not communication");
  assert.equal(c.items[0].kind, "call", "newest first");
  assert.equal(c.counts.counselling, 1);
  assert.equal(c.days_since_contact, 2);
});

test("an undated communication is dropped rather than placed arbitrarily", () => {
  const c = communicationTimeline({ notes: [{ title: "Undated" }], now: NOW });
  assert.equal(c.counts.total, 0);
  assert.equal(c.days_since_contact, null);
});

/* ═════════════════════════════════════════════════════ student dashboard ══ */

const build = (entries, over = {}) => {
  const workspace = studentWorkspace(caseRow(over.case ?? {}), entries, NOW);
  const applications = applicationPipeline(entries, NOW);
  const documents = documentCenter(entries);
  const visa = visaPipeline(entries, caseRow(over.case ?? {}), NOW);
  const communication = communicationTimeline({ entries, ...over.comms, now: NOW });
  return studentDashboard({ workspace, applications, documents, visa, communication, now: NOW });
};

test("the dashboard surfaces what is silent: stalled applications and long silences", () => {
  const entries = [
    entry("application.submitted", { at: daysAgo(60), decision: { institution: "Bologna" } }),
    entry("counselling.session_held", { at: daysAgo(40), decision: { topic: "Kickoff" } }),
  ];
  const d = build(entries);

  const kinds = d.attention.map((a) => a.kind);
  assert.ok(kinds.includes("application_stalled"), "60 days with no decision is chased");
  assert.ok(kinds.includes("no_contact"), "40 days of silence is chased");
  assert.ok(kinds.includes("documents_missing"));
});

test("a visa refusal is an alert and sorts above ordinary actions", () => {
  const d = build([entry("visa.refused", { at: daysAgo(2) })]);
  assert.equal(d.attention[0].severity, "alert");
  assert.ok(d.attention.some((a) => a.kind === "visa_refused"));
});

test("a healthy student produces no attention items beyond genuine gaps", () => {
  const entries = [
    entry("counselling.session_held", { at: daysAgo(2), decision: { topic: "Weekly check-in" } }),
    ...REQUIRED_STUDENT_DOCUMENTS.map((r, i) =>
      entry("document.verified", { at: daysAgo(10 + i), decision: { document: `${r.key} file` } })
    ),
  ];
  const d = build(entries);

  assert.equal(d.documents.complete, true);
  assert.equal(d.documents.missing, 0);
  assert.equal(d.attention.filter((a) => a.kind === "documents_missing").length, 0);
  assert.equal(d.attention.filter((a) => a.kind === "no_contact").length, 0);
});

test("a passed deadline is an alert on the dashboard", () => {
  const d = build([], { case: { Closing_Date: dateIn(-3) } });
  assert.ok(d.attention.some((a) => a.kind === "deadline_passed" && a.severity === "alert"));
});
