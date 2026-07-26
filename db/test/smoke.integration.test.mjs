/**
 * INTERNAL RELEASE v1 — cross-module smoke test.
 *
 * The release gate. Every other suite proves one module; this proves they work as
 * ONE PLATFORM, in the order a real day uses them, against real infrastructure:
 *
 *   real PostgreSQL      · an actual postgres binary, both migrations applied
 *   real HTTP            · both APIs on real sockets, driven with fetch
 *   real crypto          · hash-chained Career Record, KMS-wrapped vault
 *   real browser client  · the student portal's own api.js and session.js
 *
 * THE JOURNEY IT WALKS
 *   1. a lead arrives and the founder works it in the operations console
 *   2. it converts to a student case, linked to a Career Record
 *   3. the counsellor records applications, documents and a visa
 *   4. the student opens their portal and sees the SAME history
 *   5. the student exports their record and it verifies independently
 *   6. a partnership is registered and its renewal queue answers
 *
 * What it cannot prove is named rather than implied: nothing here touches Neon,
 * Google Cloud KMS or Zoho's own HTTP surface. Those are Production verification
 * and need credentials (docs/STATUS.md BL-1, BL-2).
 *
 * Run: npm --prefix db/test test
 */

import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";

/* Career Record — the system of record. */
import { createApiServer } from "../../functions/record/api/service.mjs";
import { postgresEventStore } from "../../functions/record/adapters/postgres.mjs";
import { postgresVaultStore } from "../../functions/record/adapters/vault-postgres.mjs";
import { identityVault } from "../../functions/record/identity/vault.mjs";
import { kmsKeyProvider, fakeKmsClient } from "../../functions/record/identity/kms.mjs";
import { issueToken } from "../../functions/record/identity/auth.mjs";

/* Operations — the staff platform. */
import { createOpsServer } from "../../functions/ops/api/service.mjs";
import { memoryCrmPort, MODULES } from "../../functions/ops/crm-port.mjs";

/* The student's own browser client, imported unmodified. */
import { createRecordApi } from "../../website/src/assets/js/app/api.js";
import { storeToken, currentSession, clearToken } from "../../website/src/assets/js/app/session.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..", "..");
const MIGRATIONS = path.join(HERE, "..", "migrations");

const PG_PORT = 55500 + Math.floor(Math.random() * 90);
const SITE_ORIGIN = "https://www.richenquest.com";
const CONSOLE_ORIGIN = "https://ops.richenquest.com";
const SECRET = randomBytes(32).toString("hex");

const SUBJECT = "sub_smokestudent01";
const FOUNDER = "usr_founder";

let engine, pool, dataDir;
let recordServer, recordBase;
let opsServer, opsBase;
let crm;
let founderToken, studentToken, staffToken;

const KMS = fakeKmsClient();
const keyProvider = () => kmsKeyProvider(KMS, { keyId: "projects/rq/locations/l/keyRings/r/cryptoKeys/kek", version: "v1" });

const opsToken = (id, role) =>
  issueToken({ sub: id, role: role === "administrator" ? "administrator" : "counsellor", ops_role: role }, SECRET, { ttlSeconds: 3600 }).token;

async function api(base, method, url, token, body) {
  const res = await fetch(`${base}${url}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

before(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), "rq-smoke-"));
  engine = new EmbeddedPostgres({
    databaseDir: dataDir, user: "postgres", password: "postgres", port: PG_PORT, persistent: false,
  });
  await engine.initialise();
  await engine.start();
  await engine.createDatabase("smoke");

  pool = new pg.Pool({ host: "localhost", port: PG_PORT, user: "postgres", password: "postgres", database: "smoke", max: 8 });
  for (const file of ["001_event_log.sql", "002_identity_vault.sql"]) {
    await pool.query(await readFile(path.join(MIGRATIONS, file), "utf8"));
  }

  const [disclosureRegister, evidenceRegister] = await Promise.all([
    readFile(path.join(ROOT, "website/src/data/disclosure.json"), "utf8").then(JSON.parse),
    readFile(path.join(ROOT, "website/src/data/evidence.json"), "utf8").then(JSON.parse),
  ]);

  /* The Career Record API — durable log, durable KMS-wrapped vault. */
  recordServer = createApiServer({
    store: postgresEventStore(pool),
    vault: identityVault(postgresVaultStore(pool), keyProvider()),
    secret: SECRET,
    evidenceRegister,
    disclosureRegister,
    cors: { allowed: [SITE_ORIGIN] },
  });
  await new Promise((r) => recordServer.listen(0, "127.0.0.1", r));
  recordBase = `http://127.0.0.1:${recordServer.address().port}`;

  /* The Operations API — same secret, so ONE login serves both services. */
  crm = memoryCrmPort({
    [MODULES.leads]: [
      { id: "lead_1", First_Name: "Aarav", Last_Name: "Kumar", Email: "aarav@example.com",
        Lead_Status: "New", Lead_Source: "Website Form",
        Created_Time: new Date(Date.now() - 40 * 60_000).toISOString(),
        "Owner.id": FOUNDER, "Owner.name": "Founder" },
    ],
    [MODULES.students]: [],
    [MODULES.collaborators]: [],
  });

  opsServer = createOpsServer({
    crm,
    record: postgresEventStore(pool), // the SAME durable log the Record API writes
    secret: SECRET,
    cors: { allowed: [CONSOLE_ORIGIN] },
  });
  await new Promise((r) => opsServer.listen(0, "127.0.0.1", r));
  opsBase = `http://127.0.0.1:${opsServer.address().port}`;

  founderToken = opsToken(FOUNDER, "administrator");
  staffToken = issueToken({ sub: "usr_counsellor", role: "counsellor" }, SECRET, { ttlSeconds: 3600 }).token;
  studentToken = issueToken({ sub: SUBJECT, role: "subject", subject_id: SUBJECT }, SECRET, { ttlSeconds: 3600 }).token;
}, { timeout: 180_000 });

after(async () => {
  await new Promise((r) => recordServer?.close(r));
  await new Promise((r) => opsServer?.close(r));
  await pool?.end();
  await engine?.stop();
  if (dataDir) await rm(dataDir, { recursive: true, force: true });
});

/* ═════════════════════════════════ 1. the founder works the day's lead ═══ */

test("SMOKE 1 — the founder opens the console and the lead is waiting", async () => {
  const me = await api(opsBase, "GET", "/v1/ops/me", founderToken);
  assert.equal(me.status, 200);
  assert.equal(me.body.actor.role, "administrator");

  const dash = await api(opsBase, "GET", "/v1/ops/dashboard", founderToken);
  assert.equal(dash.status, 200);
  assert.equal(dash.body.leads.new_this_week, 1);
  assert.equal(dash.body.leads.breached_sla, 1, "40 minutes against a 5-minute promise");
  assert.ok(dash.body.attention.some((a) => a.kind === "sla_breach"));
});

test("SMOKE 2 — the founder contacts the lead, and the breach clears", async () => {
  const patched = await api(opsBase, "PATCH", "/v1/ops/leads/lead_1", founderToken, {
    status: "Contacted",
    note: "Called within the window. Interested in Italy.",
  });
  assert.equal(patched.status, 200);
  assert.equal(patched.body.lead.contacted, true);

  const dash = await api(opsBase, "GET", "/v1/ops/dashboard", founderToken);
  assert.equal(dash.body.leads.breached_sla, 0, "the promise is measurably kept");
});

/* ══════════════════════════ 2. the lead becomes a student with a record ═══ */

test("SMOKE 3 — a Career Record is opened, and identity goes to the durable vault", async () => {
  const created = await api(recordBase, "POST", "/v1/career-records", staffToken, {
    subject_id: SUBJECT,
    consent_purposes: ["advisory", "document_handling"],
    date_of_birth: "2004-03-19",
    origin_country: "India",
  });
  assert.equal(created.status, 201);

  // The DOB is in PostgreSQL, encrypted, wrapped by KMS — never in an event.
  const keys = await pool.query("SELECT version FROM vault_keys WHERE subject_id = $1", [SUBJECT]);
  assert.equal(keys.rows.length, 1);
  const fields = await pool.query("SELECT ct FROM vault_fields WHERE subject_id = $1", [SUBJECT]);
  assert.ok(fields.rows.length > 0);
  assert.ok(!JSON.stringify(fields.rows).includes("2004-03-19"), "no plaintext DOB in storage");
});

test("SMOKE 4 — the student case is linked to the record", async () => {
  await crm.create(MODULES.students, {
    id: "case_smoke",
    Deal_Name: "Aarav Kumar — Italy MSc",
    Stage: "Documents in Progress",
    Career_Record_Id: SUBJECT,
    Destination_Country: "Italy",
    Next_Deadline: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
    Owner: { id: FOUNDER, name: "Founder" },
  });

  const list = await api(opsBase, "GET", "/v1/ops/students", founderToken);
  assert.equal(list.status, 200);
  assert.equal(list.body.count, 1);
});

/* ═══════════════════════════ 3. the counsellor records the journey ═══════ */

test("SMOKE 5 — applications, documents and a visa are recorded on the record", async () => {
  const events = [
    ["counselling.session_held", { topic: "Destination shortlisting" }],
    ["application.submitted", { institution: "Università di Bologna", programme: "MSc Data Science" }],
    ["admission.offered", { institution: "Università di Bologna" }],
    ["application.submitted", { institution: "Sapienza Università di Roma" }],
    ["document.submitted", { document: "Passport scan" }],
    ["document.verified", { document: "Passport scan" }],
    ["visa.applied", {}],
  ];

  for (const [type, payload] of events) {
    const res = await api(recordBase, "POST", `/v1/career-records/${SUBJECT}/events`, staffToken, { type, payload });
    assert.equal(res.status, 201, `${type} was accepted by the real invariants`);
  }
});

test("SMOKE 6 — the student workspace assembles all six modules from that record", async () => {
  const { status, body } = await api(opsBase, "GET", "/v1/ops/students/case_smoke", founderToken);
  assert.equal(status, 200);
  assert.equal(body.record_linked, true);

  assert.equal(body.applications.counts.total, 2);
  assert.equal(body.applications.counts.offers, 1);
  assert.equal(body.applications.counts.awaiting_decision, 1);

  assert.equal(body.documents.verified_count, 1);
  assert.ok(body.documents.missing.length > 0);

  assert.equal(body.visa.status, "Lodged");
  assert.equal(body.visa.ready_to_travel, false);

  assert.ok(body.communication.counts.total >= 1);

  // The case row sets ONLY Next_Deadline (not Closing_Date), so a non-null answer
  // is itself the proof that the custom field the business fills in is the one
  // being read. The exact count is not asserted: a date has no time-of-day, so
  // "30 days out" rounds to 29 or 30 depending on when the suite runs.
  assert.notEqual(body.workspace.next_deadline, null, "read from Next_Deadline, the field the business fills in");
  assert.ok(
    body.workspace.days_to_deadline >= 29 && body.workspace.days_to_deadline <= 30,
    `deadline ~30 days out, got ${body.workspace.days_to_deadline}`
  );
  assert.ok(Array.isArray(body.dashboard.attention));
});

/* ═══════════════════════ 4. the student sees the SAME history ═══════════ */

test("SMOKE 7 — the student opens their portal and sees the same events", async () => {
  clearToken();
  storeToken(studentToken);
  const session = currentSession();
  assert.equal(session.ok, true);
  assert.equal(session.subjectId, SUBJECT);

  const portal = createRecordApi({ baseUrl: recordBase, getToken: () => currentSession().token });
  const timeline = await portal.getTimeline(SUBJECT);

  const types = timeline.entries.map((e) => e.type);
  assert.ok(types.includes("application.submitted"), "the student sees their own applications");
  assert.ok(types.includes("admission.offered"));
  assert.ok(types.includes("counselling.session_held"));

  // Staff and student are shown the same events, because both read the same
  // projection. This is the property that makes the platform one system.
  const staffView = await api(opsBase, "GET", "/v1/ops/students/case_smoke", founderToken);
  const staffApplications = staffView.body.applications.counts.total;
  const studentApplications = new Set(
    timeline.entries.filter((e) => e.type === "application.submitted").map((e) => e.decision?.institution)
  ).size;
  assert.equal(staffApplications, studentApplications, "no disagreement between what staff and student see");
});

test("SMOKE 8 — the student exports their record and it carries durable identity", async () => {
  storeToken(studentToken);
  const portal = createRecordApi({ baseUrl: recordBase, getToken: () => currentSession().token });

  const result = await portal.exportRecord(SUBJECT);
  assert.equal(result.includes_identity, true);
  assert.equal(result.chain_verified, true, "the hash chain verifies at the moment of export");

  const identity = JSON.parse(result.archive["identity.json"]);
  assert.equal(identity.date_of_birth, "2004-03-19", "KMS-unwrapped from PostgreSQL");

  for (const file of ["manifest.json", "events.jsonl", "verify.mjs", "README.md"]) {
    assert.ok(result.archive[file], `the export is independently checkable: ${file}`);
  }
});

test("SMOKE 9 — the record verifies its own chain over HTTP", async () => {
  storeToken(studentToken);
  const portal = createRecordApi({ baseUrl: recordBase, getToken: () => currentSession().token });
  const verified = await portal.verifyRecord(SUBJECT);
  assert.equal(verified.verified, true);
  assert.deepEqual(verified.failures, []);
});

/* ═════════════════════════════ 5. the partnership side ═════════════════ */

test("SMOKE 10 — a partnership is registered and its renewal queue answers", async () => {
  const created = await api(opsBase, "POST", "/v1/ops/collaborators", founderToken, {
    name: "Università di Bologna",
    type: "University",
    country: "Italy",
  });
  assert.equal(created.status, 201);
  const id = created.body.institution.id;

  await api(opsBase, "PATCH", `/v1/ops/collaborators/${id}`, founderToken, {
    partnership_type: "Exchange",
    stage: "Agreement Signed",
    agreement_status: "Signed",
    agreement_signed_on: "2026-01-15",
    agreement_expires_on: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
  });

  await api(opsBase, "POST", `/v1/ops/collaborators/${id}/offerings`, founderToken, {
    name: "MSc Data Science", kind: "Degree", level: "Master's", tuition: 12000, currency: "EUR",
  });

  const detail = await api(opsBase, "GET", `/v1/ops/collaborators/${id}`, founderToken);
  assert.equal(detail.body.programs.length, 1);
  assert.equal(detail.body.required_documents.complete, false, "an Exchange needs an agreement and an MoU on file");

  const renewals = await api(opsBase, "GET", "/v1/ops/collaborators/renewals", founderToken);
  assert.equal(renewals.status, 200);
  assert.ok(renewals.body.counts.renewals_due >= 1, "an agreement expiring in 30 days is surfaced");
  assert.ok(renewals.body.counts.missing_documents >= 1);
});

/* ══════════════════════════════ 6. the platform boundaries hold ════════ */

test("SMOKE 11 — one login serves both services, and neither leaks into the other", async () => {
  // The SAME student token the portal uses is refused by the operations console.
  const staffAttempt = await api(opsBase, "GET", "/v1/ops/dashboard", studentToken);
  assert.equal(staffAttempt.status, 403, "a student token cannot open a staff console");

  // And a staff token cannot masquerade as the student on their own record.
  const recordAttempt = await api(recordBase, "GET", `/v1/career-records/${SUBJECT}/export`, founderToken);
  assert.ok([403, 404, 405].includes(recordAttempt.status));
});

test("SMOKE 12 — the whole platform survives a restart", async () => {
  // New servers, new stores, same database and same KMS: exactly what a deploy is.
  const restartedRecord = createApiServer({
    store: postgresEventStore(pool),
    vault: identityVault(postgresVaultStore(pool), keyProvider()),
    secret: SECRET,
    evidenceRegister: { claims: {} },
    disclosureRegister: JSON.parse(await readFile(path.join(ROOT, "website/src/data/disclosure.json"), "utf8")),
    cors: { allowed: [SITE_ORIGIN] },
  });
  const restartedOps = createOpsServer({ crm, record: postgresEventStore(pool), secret: SECRET, cors: {} });

  await new Promise((r) => restartedRecord.listen(0, "127.0.0.1", r));
  await new Promise((r) => restartedOps.listen(0, "127.0.0.1", r));

  try {
    const recordUrl = `http://127.0.0.1:${restartedRecord.address().port}`;
    const opsUrl = `http://127.0.0.1:${restartedOps.address().port}`;

    const exported = await api(recordUrl, "POST", `/v1/career-records/${SUBJECT}/export`, studentToken, {});
    assert.equal(exported.status, 200);
    assert.equal(JSON.parse(exported.body.archive["identity.json"]).date_of_birth, "2004-03-19",
      "identity survived: the vault is durable and KMS-wrapped");

    const workspace = await api(opsUrl, "GET", "/v1/ops/students/case_smoke", founderToken);
    assert.equal(workspace.body.applications.counts.total, 2, "the student workspace survived");
  } finally {
    await new Promise((r) => restartedRecord.close(r));
    await new Promise((r) => restartedOps.close(r));
  }
});
