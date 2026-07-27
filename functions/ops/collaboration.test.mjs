/**
 * Collaboration CRM — unit tests for the pure logic.
 *
 * The projections and the derived timeline are where a B2B CRM either tells the
 * truth or quietly stops doing so. An agreement that lapsed without anyone
 * noticing, a relationship that reads "In Discussion" a year after the last
 * contact — both are silent failures, and both are arithmetic, so both are
 * testable here without a network.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  INSTITUTION_TYPES, PARTNERSHIP_STAGES, PARTNERSHIP_TYPES, AGREEMENT_STATUSES,
  OFFERING_KINDS, PROGRAM_KINDS, OPPORTUNITY_KINDS,
  institutionView, contactView, meetingView, documentView, offeringView,
  collaborationTimeline, partnershipSummary, documentChecklist, renewalIntelligence,
} from "./collaboration.mjs";

const NOW = new Date("2026-07-26T12:00:00.000Z");
const daysFromNow = (n) => new Date(NOW.getTime() + n * 86_400_000).toISOString().slice(0, 10);

/* ═══════════════════════════════════════════════════════════ vocabulary ══ */

test("the vocabulary matches the tenant's own language", () => {
  assert.ok(INSTITUTION_TYPES.includes("University"));
  assert.ok(INSTITUTION_TYPES.includes("Partner Institution"));
  assert.ok(INSTITUTION_TYPES.includes("Recruitment Agent"));
  assert.ok(PARTNERSHIP_STAGES.includes("Identified"), "every institution can enter the pipeline");
  assert.ok(PARTNERSHIP_STAGES.includes("Dormant"), "going quiet is a real state, not a euphemism");
  assert.ok(AGREEMENT_STATUSES.includes("Expired"));
});

/* ══════════════════════════════════════════════════════════ projections ══ */

test("an institution projects into the platform's vocabulary, not Zoho's", () => {
  const view = institutionView({
    id: "acc_1",
    Account_Name: "Università di Bologna",
    Account_Type: "University",
    Website: "https://unibo.it",
    Billing_Country: "Italy",
    Partnership_Stage: "Active",
    Agreement_Status: "Signed",
    Agreement_Signed_On: "2026-01-15",
    Agreement_Expires_On: daysFromNow(400),
    "Owner.id": "usr_founder",
    "Owner.name": "Founder",
  }, NOW);

  assert.equal(view.name, "Università di Bologna");
  assert.equal(view.type, "University");
  assert.equal(view.country, "Italy");
  assert.equal(view.stage, "Active");
  assert.equal(view.is_active, true);
  assert.equal(view.is_open, false, "an active partnership is not still in the pipeline");
  assert.equal(view.agreement.status, "Signed");
  assert.equal(view.owner.id, "usr_founder");
});

test("an institution with nothing recorded still lands at the start of the pipeline", () => {
  const view = institutionView({ id: "acc_2", Account_Name: "New University" }, NOW);
  assert.equal(view.stage, "Identified", "never a record with no position in the pipeline");
  assert.equal(view.is_open, true);
  assert.equal(view.agreement.status, "None");
  assert.equal(view.agreement.expires_in_days, null);
  assert.equal(view.owner.id, null);
});

test("an agreement nearing its end is flagged before it lapses, not after", () => {
  const soon = institutionView({ id: "a", Account_Name: "X", Agreement_Expires_On: daysFromNow(30) }, NOW);
  assert.equal(soon.agreement.expiring_soon, true);
  assert.equal(soon.agreement.expired, false);
  assert.equal(soon.agreement.expires_in_days, 30);

  const later = institutionView({ id: "b", Account_Name: "Y", Agreement_Expires_On: daysFromNow(200) }, NOW);
  assert.equal(later.agreement.expiring_soon, false, "a year out is not urgent");

  const gone = institutionView({ id: "c", Account_Name: "Z", Agreement_Expires_On: daysFromNow(-10) }, NOW);
  assert.equal(gone.agreement.expired, true);
  assert.equal(gone.agreement.expiring_soon, false, "already expired is not 'expiring'");
});

test("contacts and meetings resolve their links in both CRM shapes", () => {
  // COQL returns dotted aliases; the REST record API returns nested objects.
  const flat = contactView({
    id: "con_1", First_Name: "Giulia", Last_Name: "Rossi", Title: "Head of International",
    "Account_Name.id": "acc_1", "Account_Name.name": "Bologna",
  });
  assert.equal(flat.name, "Giulia Rossi");
  assert.deepEqual(flat.institution, { id: "acc_1", name: "Bologna" });

  const nested = contactView({ id: "con_2", Last_Name: "Bianchi", Account_Name: { id: "acc_1", name: "Bologna" } });
  assert.deepEqual(nested.institution, { id: "acc_1", name: "Bologna" });
});

test("a meeting knows whether it is still ahead", () => {
  const future = meetingView({ id: "e1", Event_Title: "Intro call", Start_DateTime: new Date(NOW.getTime() + 3 * 86_400_000).toISOString() }, NOW);
  assert.equal(future.upcoming, true);
  assert.equal(future.in_days, 3);

  const past = meetingView({ id: "e2", Event_Title: "Kickoff", Start_DateTime: new Date(NOW.getTime() - 5 * 86_400_000).toISOString() }, NOW);
  assert.equal(past.upcoming, false);
});

test("a document reports what it is without pretending to know more", () => {
  const doc = documentView({ id: "at_1", File_Name: "MoU-2026.pdf", Size: 84_211, Created_Time: "2026-02-01T10:00:00Z" });
  assert.equal(doc.name, "MoU-2026.pdf");
  assert.equal(doc.size, 84_211);
  assert.equal(documentView(null), null);
});

/* ═══════════════════════════════════════════════════ university profile ══ */

test("the institutional profile is projected, and lists are split from CRM text fields", () => {
  const view = institutionView({
    id: "acc_1", Account_Name: "Bologna", Account_Type: "University",
    Accreditation: "MIUR recognised · EUA member",
    Campus_List: "Bologna, Rimini, Forlì , Cesena",
    International_Office_Contact: "Giulia Rossi",
    International_Office_Email: "intl@unibo.example",
    Partnership_Type: "Exchange",
  }, NOW);

  assert.equal(view.accreditation, "MIUR recognised · EUA member");
  assert.deepEqual(view.campuses, ["Bologna", "Rimini", "Forlì", "Cesena"], "trimmed, and the console never parses CRM text");
  assert.equal(view.international_office.contact, "Giulia Rossi");
  assert.equal(view.international_office.email, "intl@unibo.example");
  assert.equal(view.partnership_type, "Exchange");
});

test("partnership type is separate from institution type, and defaults to Undefined", () => {
  const view = institutionView({ id: "a", Account_Name: "X", Account_Type: "University" }, NOW);
  assert.equal(view.type, "University", "who they are");
  assert.equal(view.partnership_type, "Undefined", "what we have agreed — never guessed from the other");
  assert.ok(PARTNERSHIP_TYPES.includes("Recruitment (Commission)"));
  assert.ok(PARTNERSHIP_TYPES.includes("Exchange"));
});

/* ══════════════════════════════════ program catalogue + opportunities ══ */

test("degrees and opportunities share one projection, differing only by kind", () => {
  const degree = offeringView({
    id: "p1", Product_Name: "MSc Data Science", Product_Category: "Degree", Degree_Level: "Master's",
    Unit_Price: 12000, Tuition_Currency: "EUR", Duration: "2 years", Intakes: "September, February",
    Application_Deadline: daysFromNow(20), "Vendor_Name.id": "acc_1", "Vendor_Name.name": "Bologna",
  }, NOW);

  assert.equal(degree.kind, "Degree");
  assert.equal(degree.level, "Master's");
  assert.equal(degree.tuition, 12000);
  assert.equal(degree.currency, "EUR", "the number is never pre-formatted — a formatted number cannot be summed");
  assert.deepEqual(degree.intakes, ["September", "February"]);
  assert.equal(degree.institution.id, "acc_1");

  const scholarship = offeringView({
    id: "p2", Product_Name: "DSU need-based grant", Product_Category: "Scholarship",
    Application_Deadline: daysFromNow(-5),
  }, NOW);
  assert.equal(scholarship.kind, "Scholarship");
  assert.equal(scholarship.deadline_passed, true, "a passed deadline is stated, not left as a date to compare mentally");
});

test("a deadline inside 30 days is flagged as closing, and a passed one is not", () => {
  assert.equal(offeringView({ id: "a", Application_Deadline: daysFromNow(10) }, NOW).closing_soon, true);
  assert.equal(offeringView({ id: "b", Application_Deadline: daysFromNow(200) }, NOW).closing_soon, false);
  const passed = offeringView({ id: "c", Application_Deadline: daysFromNow(-1) }, NOW);
  assert.equal(passed.closing_soon, false, "already closed is not 'closing'");
  assert.equal(passed.deadline_passed, true);
});

test("every offering kind is either a programme or an opportunity, never neither", () => {
  for (const kind of OFFERING_KINDS) {
    const isProgram = PROGRAM_KINDS.includes(kind);
    const isOpportunity = OPPORTUNITY_KINDS.includes(kind);
    assert.ok(isProgram !== isOpportunity, `${kind} belongs to exactly one panel`);
  }
});

/* ═════════════════════════════════════════════════ required documents ══ */

test("the document checklist follows from the partnership type", () => {
  const complete = documentChecklist("Recruitment (Commission)", [
    { name: "RichenQuest-Bologna-agreement-2026.pdf" },
    { name: "commission-schedule.pdf" },
  ]);
  assert.equal(complete.complete, true);
  assert.deepEqual(complete.missing, []);

  const partial = documentChecklist("Recruitment (Commission)", [{ name: "agreement.pdf" }]);
  assert.equal(partial.complete, false);
  assert.deepEqual(partial.missing, ["Commission schedule"]);
});

test("matching is loose, because a checklist beaten by a rename reports green on an empty folder", () => {
  const checklist = documentChecklist("Exchange", [
    { name: "2026_MOU_signed_FINAL_v3.PDF" },
    { name: "Partnership Agreement (countersigned).pdf" },
  ]);
  assert.equal(checklist.complete, true, "case and surrounding words do not defeat the match");
});

test("a partnership with no defined type requires nothing, and says so rather than reporting green", () => {
  const checklist = documentChecklist("Undefined", []);
  assert.equal(checklist.complete, true);
  assert.equal(checklist.unenforceable, true, "distinguishable from a satisfied checklist");
});

/* ════════════════════════════════════════════════ renewal intelligence ══ */

const institution = (over = {}) => ({
  id: "acc_x", name: "Test U", stage: "Active", is_active: true, is_open: false,
  updated_at: NOW.toISOString(), partnership_type: "Exchange",
  agreement: { expiring_soon: false, expired: false, expires_in_days: null },
  ...over,
});

test("renewal intelligence surfaces four silent failure modes in one worked queue", () => {
  const expired = institution({ id: "a", name: "Lapsed U", agreement: { expired: true, expiring_soon: false, expires_in_days: -20 } });
  const due = institution({ id: "b", name: "Renewing U", agreement: { expired: false, expiring_soon: true, expires_in_days: 15 } });
  const idle = institution({ id: "c", name: "Silent U", updated_at: "2025-01-01T00:00:00Z" });
  const quiet = institution({ id: "d", name: "Quiet Prospect", stage: "Contacted", is_active: false, is_open: true, updated_at: "2026-04-01T00:00:00Z" });

  const checklists = new Map([["a", documentChecklist("Exchange", [])]]);
  const result = renewalIntelligence([expired, due, idle, quiet], { now: NOW, checklists });

  const kinds = result.items.map((i) => i.kind);
  assert.ok(kinds.includes("agreement_expired"));
  assert.ok(kinds.includes("renewal_due"));
  assert.ok(kinds.includes("missing_documents"));
  assert.ok(kinds.includes("sla_breach"));
  assert.ok(kinds.includes("inactive"));

  assert.equal(result.counts.renewals_due, 2, "expired and due both count as renewals needing action");
  assert.equal(result.counts.missing_documents, 1);
  assert.equal(result.items[0].severity, "alert", "alerts sort above actions");
});

test("documents are only chased where a partnership exists to enforce", () => {
  const prospect = institution({ id: "p", name: "Prospect", stage: "Contacted", is_active: false, is_open: true });
  const result = renewalIntelligence([prospect], {
    now: NOW,
    checklists: new Map([["p", documentChecklist("Exchange", [])]]),
  });
  assert.equal(result.counts.missing_documents, 0, "chasing an MoU from a prospect is noise");
});

test("an active partnership breaches its SLA on a slower clock than a pipeline deal", () => {
  const recentlyTouched = institution({ updated_at: "2026-06-01T00:00:00Z" }); // ~55 days
  assert.equal(renewalIntelligence([recentlyTouched], { now: NOW }).counts.sla_breaches, 0, "55 days is fine for a signed partnership");

  const longSilent = institution({ updated_at: "2025-11-01T00:00:00Z" }); // ~267 days
  assert.equal(renewalIntelligence([longSilent], { now: NOW }).counts.sla_breaches, 1);
});

test("within a severity, the soonest deadline is worked first", () => {
  const far = institution({ id: "far", name: "Far", agreement: { expired: false, expiring_soon: true, expires_in_days: 80 } });
  const near = institution({ id: "near", name: "Near", agreement: { expired: false, expiring_soon: true, expires_in_days: 3 } });

  const result = renewalIntelligence([far, near], { now: NOW });
  assert.equal(result.items[0].institution.name, "Near");
});

test("a healthy register produces an empty queue rather than reassuring noise", () => {
  const result = renewalIntelligence([institution()], { now: NOW });
  assert.deepEqual(result.items, []);
  assert.equal(result.counts.total, 0);
});

/* ════════════════════════════════════════════════════════════ timeline ══ */

test("the timeline merges notes, meetings and agreement milestones, newest first", () => {
  const institution = institutionView({
    id: "acc_1", Account_Name: "Bologna", Account_Type: "University",
    Created_Time: "2026-01-01T09:00:00Z",
    Agreement_Signed_On: "2026-03-01", Agreement_Expires_On: daysFromNow(300),
  }, NOW);

  const timeline = collaborationTimeline({
    institution,
    notes: [{ at: "2026-02-10T10:00:00Z", title: "Call", content: "Discussed intake numbers." }],
    meetings: [meetingView({ id: "e1", Event_Title: "Campus visit", Start_DateTime: "2026-04-02T09:00:00Z" }, NOW)],
    now: NOW,
  });

  assert.deepEqual(
    timeline.map((e) => e.kind),
    ["meeting", "agreement", "note", "created"],
    "newest first — the question is where we left this, not how it began"
  );
  assert.equal(timeline.at(-1).kind, "created");
});

test("the timeline records an expired agreement as its own event", () => {
  const institution = institutionView({
    id: "acc_1", Account_Name: "Lapsed U", Created_Time: "2026-01-01T09:00:00Z",
    Agreement_Signed_On: "2025-01-01", Agreement_Expires_On: daysFromNow(-30),
  }, NOW);

  const kinds = collaborationTimeline({ institution, now: NOW }).map((e) => e.kind);
  assert.ok(kinds.includes("agreement_expired"), "a lapse is a fact about the relationship");
});

test("the timeline drops entries with no date rather than inventing one", () => {
  const institution = institutionView({ id: "a", Account_Name: "X" }, NOW);
  const timeline = collaborationTimeline({
    institution,
    notes: [{ title: "Undated", content: "no timestamp" }],
    now: NOW,
  });
  assert.equal(timeline.length, 0, "an undated event cannot be placed in a history");
});

/* ═════════════════════════════════════════════════════════════ summary ══ */

test("the summary counts the pipeline and surfaces what needs a person", () => {
  const institutions = [
    { stage: "Active", type: "University", is_active: true, is_open: false, updated_at: "2026-07-20T00:00:00Z", agreement: { expiring_soon: false, expired: false } },
    { stage: "In Discussion", type: "University", is_active: false, is_open: true, updated_at: "2026-07-25T00:00:00Z", agreement: { expiring_soon: false, expired: false } },
    // Untouched for ~100 days while still open — the relationship nobody is working.
    { stage: "Contacted", type: "Recruitment Agent", is_active: false, is_open: true, updated_at: "2026-04-15T00:00:00Z", agreement: { expiring_soon: false, expired: false } },
    { stage: "Agreement Signed", type: "Partner Institution", is_active: true, is_open: false, updated_at: "2026-07-01T00:00:00Z", agreement: { expiring_soon: true, expired: false } },
  ];

  const summary = partnershipSummary(institutions, NOW);

  assert.equal(summary.total, 4);
  assert.equal(summary.active, 2);
  assert.equal(summary.open, 2);
  assert.equal(summary.by_stage["In Discussion"], 1);
  assert.equal(summary.by_stage.Dormant, 0, "every stage is reported, including the empty ones");
  assert.equal(summary.by_type.University, 2);

  assert.equal(summary.expiring_agreements.length, 1);
  assert.equal(summary.stale.length, 1, "one open relationship has gone quiet");
  assert.equal(summary.stale[0].stage, "Contacted");
  assert.ok(summary.stale[0].idle_days >= 45);
});

test("an active partnership is never counted as stale, however quiet", () => {
  const summary = partnershipSummary(
    [{ stage: "Active", type: "University", is_active: true, is_open: false, updated_at: "2024-01-01T00:00:00Z", agreement: { expiring_soon: false, expired: false } }],
    NOW
  );
  assert.equal(summary.stale.length, 0, "a signed partnership does not need chasing for being quiet");
});

test("the staleness threshold is a parameter — a partnership moves on a slower clock than a lead", () => {
  const rows = [{ stage: "Contacted", type: "University", is_active: false, is_open: true, updated_at: "2026-06-26T00:00:00Z", agreement: { expiring_soon: false, expired: false } }];
  assert.equal(partnershipSummary(rows, NOW, { staleAfterDays: 45 }).stale.length, 0, "30 days idle is not yet stale");
  assert.equal(partnershipSummary(rows, NOW, { staleAfterDays: 14 }).stale.length, 1);
});
