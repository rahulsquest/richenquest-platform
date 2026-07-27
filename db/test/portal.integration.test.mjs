/**
 * Student Portal ↔ Career Record API — END-TO-END INTEGRATION.
 *
 * This is the test that proves the two parallel implementations are one system.
 * Nothing in it is mocked, stubbed or simulated:
 *
 *   · a REAL PostgreSQL server        — an actual postgres binary on an ephemeral
 *                                       port, with db/migrations/001_event_log.sql
 *                                       applied verbatim;
 *   · the REAL API                    — createApiServer(), the production router,
 *                                       pipeline, permission layer and the
 *                                       postgresEventStore adapter;
 *   · a REAL HTTP socket              — the client talks to a listening port over
 *                                       the network stack, not to a handler;
 *   · the REAL browser client         — website/src/assets/js/app/api.js and
 *                                       session.js, imported unmodified, exactly
 *                                       the files the dashboard ships;
 *   · REAL tokens                     — issueToken() from identity/auth.mjs,
 *                                       signed with a real secret and verified by
 *                                       the server, not decoded on trust.
 *
 * The identity vault is now durable too (BL-7, closed 2026-07-26): this runs on
 * postgresVaultStore against the real 002 migration, so an export carries real
 * identity read back from the database rather than from process memory.
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

import { createApiServer } from "../../functions/record/api/service.mjs";
import { postgresEventStore } from "../../functions/record/adapters/postgres.mjs";
import { identityVault, envKeyProvider, KEY_BYTES } from "../../functions/record/identity/vault.mjs";
import { postgresVaultStore } from "../../functions/record/adapters/vault-postgres.mjs";
import { issueToken } from "../../functions/record/identity/auth.mjs";

/* The dashboard's own modules. Imported, not reimplemented. */
import { createRecordApi } from "../../website/src/assets/js/app/api.js";
import {
  captureFromLocation, currentSession, clearToken, storeToken, readToken,
} from "../../website/src/assets/js/app/session.js";
import { consentFromTimeline, pendingAcknowledgements, evidenceIndex } from "../../website/src/assets/js/app/derive.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..", "..");
const MIGRATIONS = path.join(HERE, "..", "migrations");

const PG_PORT = 54900 + Math.floor(Math.random() * 90);
const SITE_ORIGIN = "https://www.richenquest.com";
const SECRET = randomBytes(32).toString("hex");

/* A fixed KEK for the whole run, so a restarted API can still unwrap what an
   earlier one wrapped — the point of a durable vault. */
const keyProvider = envKeyProvider({
  RECORD_VAULT_KEK: randomBytes(KEY_BYTES).toString("base64"),
  NODE_ENV: "development",
});
const SUBJECT = "sub_e2estudent01";
const OTHER_SUBJECT = "sub_e2eother02";

let engine;
let pool;
let dataDir;
let server;
let baseUrl;
let staffToken;
let studentToken;
let recommendationId;

/* ─────────────────────────────────────────────────────────────── harness ── */

before(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), "rq-portal-"));
  engine = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: "postgres",
    password: "postgres",
    port: PG_PORT,
    persistent: false,
  });
  await engine.initialise();
  await engine.start();
  await engine.createDatabase("portal_e2e");

  pool = new pg.Pool({
    host: "localhost",
    port: PG_PORT,
    user: "postgres",
    password: "postgres",
    database: "portal_e2e",
    max: 8,
  });
  // Both production migrations, verbatim and in order.
  for (const file of ["001_event_log.sql", "002_identity_vault.sql"]) {
    await pool.query(await readFile(path.join(MIGRATIONS, file), "utf8"));
  }

  const [disclosureRegister, evidenceRegister] = await Promise.all([
    readFile(path.join(ROOT, "website/src/data/disclosure.json"), "utf8").then(JSON.parse),
    readFile(path.join(ROOT, "website/src/data/evidence.json"), "utf8").then(JSON.parse),
  ]);

  server = createApiServer({
    store: postgresEventStore(pool),
    vault: identityVault(postgresVaultStore(pool), keyProvider),
    secret: SECRET,
    evidenceRegister,
    disclosureRegister,
    cors: { allowed: [SITE_ORIGIN] },
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  staffToken = issueToken({ sub: "usr_e2ecounsellor", role: "counsellor" }, SECRET, { ttlSeconds: 3600 }).token;
  studentToken = issueToken({ sub: SUBJECT, role: "subject", subject_id: SUBJECT }, SECRET, { ttlSeconds: 3600 }).token;

  /* Seeded through the PUBLIC API over real HTTP — every entry passes the real
     invariants, gets a real hash link, and resolves its evidence and disclosure
     through the real registers. Nothing is inserted behind the API's back. */
  await staffCall("POST", "/v1/career-records", {
    subject_id: SUBJECT,
    consent_purposes: ["advisory", "document_handling"],
    date_of_birth: "2004-03-19",
    origin_country: "India",
  });
  await staffCall("POST", "/v1/career-records", {
    subject_id: OTHER_SUBJECT,
    consent_purposes: ["advisory"],
    date_of_birth: "2003-06-02",
    origin_country: "Nepal",
  });

  await staffCall("POST", `/v1/career-records/${SUBJECT}/events`, {
    type: "counselling.session_held",
    payload: { topic: "Destination shortlisting", duration_minutes: 45 },
  });
  await staffCall("POST", `/v1/career-records/${SUBJECT}/events`, {
    type: "document.submitted",
    payload: { document: "Class XII marksheet", status: "awaiting verification" },
    evidence: [{ ref: "doc:e2e_marksheet_01", kind: "academic_document" }],
  });
  await staffCall("POST", `/v1/career-records/${SUBJECT}/events`, {
    type: "recommendation.issued",
    payload: {
      summary: "Apply to public universities in Italy under the DSU need-based scheme",
      recommended: [{ option: "dest:italy", rank: 1 }],
      follow_up: "Prepare the Universitaly pre-application",
    },
    evidence: [{ ref: "claim:destinations-covered", kind: "claim" }],
  });

  /* The id is read back from the timeline rather than taken from the append
     response, because POST /events does not return the event it created — it
     returns { type } (audit finding A-3). The dashboard does the same thing for
     the same reason, so this mirrors the real client rather than working around it. */
  const seeded = await staffCall("GET", `/v1/career-records/${SUBJECT}/timeline`);
  recommendationId = seeded.entries.find((e) => e.type === "recommendation.issued")?.event_id ?? null;
  assert.ok(recommendationId, "the seeded recommendation must be addressable");
}, { timeout: 180_000 });

after(async () => {
  await new Promise((resolve) => server?.close(resolve));
  await pool?.end();
  await engine?.stop();
  if (dataDir) await rm(dataDir, { recursive: true, force: true });
});

/**
 * Events the subject may never see: the access log the API keeps about staff
 * touching the record. They are real entries in the chain, so the record's event
 * count is deliberately HIGHER than the student's visible timeline — the
 * difference is reported to the student as `withheld` rather than hidden.
 */
const SEEDED_VISIBLE = 5; // profile.created, consent.given, session_held, document.submitted, recommendation.issued
const SEEDED_INTERNAL = 4; // access.exercised: 3 counsellor appends + 1 counsellor read of the timeline


async function staffCall(method, url, body) {
  const res = await fetch(`${baseUrl}${url}`, {
    method,
    headers: { authorization: `Bearer ${staffToken}`, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status} ${JSON.stringify(payload)}`);
  return payload;
}

/** A browser-shaped window for session.js. The token arrives in the fragment. */
function fakeWindow(hash) {
  const calls = [];
  return {
    location: { hash, pathname: "/dashboard/", search: "" },
    history: { replaceState: (_s, _t, url) => calls.push(url) },
    _replaced: calls,
  };
}

/** The dashboard's client, wired the way app.js wires it. */
function portalApi({ onUnauthorized = () => {} } = {}) {
  return createRecordApi({
    baseUrl,
    getToken: () => currentSession().token,
    onUnauthorized,
  });
}

/* ══════════════════════════════════════════════ 1. student opens portal ══ */

test("a student opens the link we issued, and the credential leaves the address bar", () => {
  clearToken();

  // Built exactly as functions/record/scripts/issue-student-link.mjs builds it.
  const link = `${SITE_ORIGIN}/dashboard/#token=${encodeURIComponent(studentToken)}`;
  const hash = link.slice(link.indexOf("#"));
  const win = fakeWindow(hash);

  const adopted = captureFromLocation(win);

  assert.equal(adopted, studentToken, "the token in the link is the token adopted");
  assert.equal(readToken(), studentToken, "and it is held for the life of the tab");
  assert.deepEqual(win._replaced, ["/dashboard/"], "the fragment is erased from history, not pushed onto it");
});

/* ═══════════════════════════════════════════════════ 2. student signs in ══ */

test("the session the portal derives matches the token the API issued", () => {
  storeToken(studentToken);
  const session = currentSession();

  assert.equal(session.ok, true);
  assert.equal(session.subjectId, SUBJECT, "the session is bound to one record");
  assert.equal(session.role, "subject");
  assert.ok(session.claims.exp * 1000 > Date.now(), "and it has not expired");
});

/* ══════════════════════════════════════════════════════ 3. dashboard load ══ */

test("the dashboard loads the record over real HTTP from real PostgreSQL", async () => {
  storeToken(studentToken);
  const record = await portalApi().getRecord(SUBJECT);

  assert.equal(record.subject_id, SUBJECT);
  assert.equal(record.events, SEEDED_VISIBLE + SEEDED_INTERNAL, "the chain counts the audit entries too");
  assert.ok(record.chain_head, "the chain head comes back from the database");
  assert.equal(record.consent.is_minor, false);
  assert.ok(record.consent.purposes.includes("advisory"));
});

/* ═══════════════════════════════════════════════════════ 4. timeline load ══ */

test("the timeline loads, projected exactly as the dashboard's renderer expects", async () => {
  storeToken(studentToken);
  const data = await portalApi().getTimeline(SUBJECT);

  assert.ok(Array.isArray(data.entries));
  assert.equal(data.entries.length, SEEDED_VISIBLE);
  assert.equal(data.read_is_logged, false, "a student reading their own record is not surveillance");

  // The access log is withheld by classification — but COUNTED, so the student is
  // told their view is partial instead of being shown a tidy, incomplete record.
  assert.equal(data.withheld, SEEDED_INTERNAL);
  const record = await portalApi().getRecord(SUBJECT);
  assert.equal(
    data.entries.length + data.withheld,
    record.events,
    "everything in the chain is either shown to the student or counted as withheld"
  );

  const entry = data.entries.find((e) => e.type === "recommendation.issued");
  assert.ok(entry, "the recommendation is visible to the student");

  // The field names timeline.js, entry.js and derive.js actually read. A rename on
  // either side breaks the dashboard silently, so it is asserted rather than assumed.
  for (const field of ["event_id", "type", "time", "recorded", "actor", "authored_by_ai", "evidence", "decision", "classification"]) {
    assert.ok(field in entry, `timeline entries carry "${field}"`);
  }
  assert.equal(entry.authored_by_ai, false);
  assert.equal(entry.actor.role, "counsellor", "every entry names who wrote it");
  assert.equal(entry.decision.summary, "Apply to public universities in Italy under the DSU need-based scheme");
  assert.ok(entry.disclosure?.shown, "advisory entries carry the disclosure the register produced");
});

test("the dashboard's derivations agree with the API's own projection", async () => {
  storeToken(studentToken);
  const data = await portalApi().getTimeline(SUBJECT);

  const consent = consentFromTimeline(data.entries);
  assert.equal(consent.known, true);
  assert.ok(consent.granted.includes("advisory"), "client-side consent folding matches the server's");

  const evidence = evidenceIndex(data.entries);
  assert.ok(evidence.some((v) => v.ref === "claim:destinations-covered"));
  assert.ok(evidence.some((v) => v.ref === "doc:e2e_marksheet_01"));
});

/* ════════════════════════════════════════════════════════ 5. profile load ══ */

test("the profile view's parallel fetch resolves against the live API", async () => {
  storeToken(studentToken);
  const api = portalApi();

  // Exactly the pair views/profile.js issues.
  const [record, timeline] = await Promise.all([api.getRecord(SUBJECT), api.getTimeline(SUBJECT)]);

  assert.equal(record.subject_id, SUBJECT);
  assert.ok(record.last_event_at, "profile renders 'last activity' from this field");
  const opened = timeline.entries.filter((e) => e.type === "profile.created");
  assert.equal(opened.length, 1, "profile renders 'record opened' from this entry");
});

/* ═════════════════════════════════════════════════ 6. integrity + writes ══ */

test("the record verifies its own hash chain, read through the portal client", async () => {
  storeToken(studentToken);
  const result = await portalApi().verifyRecord(SUBJECT);

  assert.equal(result.verified, true, "the chain verifies against real PostgreSQL");
  assert.equal(result.events, SEEDED_VISIBLE + SEEDED_INTERNAL, "verification covers the whole chain, not the visible part");
  assert.deepEqual(result.failures, []);
});

test("acknowledging a recommendation writes a real, attributed entry", async () => {
  storeToken(studentToken);
  const api = portalApi();

  const before = await api.getTimeline(SUBJECT);
  assert.equal(pendingAcknowledgements(before.entries).length, 1, "one recommendation is waiting on the student");

  // The exact call views/timeline.js makes.
  await api.appendEvent(SUBJECT, {
    type: "recommendation.acknowledged",
    payload: { responded_to: recommendationId, response: "acknowledged" },
    caused_by: recommendationId,
    idempotency_key: `recommendation.acknowledged:${recommendationId}`,
  });

  const after = await api.getTimeline(SUBJECT);
  const entry = after.entries.find((e) => e.event_id === recommendationId);

  assert.ok(entry.acknowledgement, "the acknowledgement nests under the recommendation it answers");
  assert.equal(pendingAcknowledgements(after.entries).length, 0, "and the item stops being outstanding");
  assert.equal(
    after.entries.some((e) => e.type === "recommendation.acknowledged"),
    false,
    "it is not also listed as a separate top-level entry"
  );
});

test("a repeated acknowledgement is absorbed by the idempotency key, not duplicated", async () => {
  storeToken(studentToken);
  const api = portalApi();

  const before = await api.getTimeline(SUBJECT);
  await api.appendEvent(SUBJECT, {
    type: "recommendation.acknowledged",
    payload: { responded_to: recommendationId, response: "acknowledged" },
    caused_by: recommendationId,
    idempotency_key: `recommendation.acknowledged:${recommendationId}`,
  });
  const after = await api.getTimeline(SUBJECT);

  const count = (t) => t.entries.filter((e) => e.acknowledgement).length;
  assert.equal(count(after), count(before), "the record gains no second acknowledgement");
});

test("consent withdrawal from Settings is a real entry, and the API enforces it", async () => {
  storeToken(studentToken);
  const api = portalApi();

  // views/settings.js writes a non-essential purpose exactly this way.
  await api.appendEvent(SUBJECT, {
    type: "consent.withdrawn",
    payload: { purposes: ["document_handling"] },
    idempotency_key: `consent:withdraw:document_handling:${Date.now()}`,
  });

  const timeline = await api.getTimeline(SUBJECT);
  const consent = consentFromTimeline(timeline.entries);

  assert.equal(consent.purposes.document_handling.granted, false, "the client folds the withdrawal forward");
  assert.ok(consent.granted.includes("advisory"), "and withdraws only what was named");
});

/* ═══════════════════════════════════════════ 7. export carries identity ══ */

test("an export carries the student's real identity, read back from the vault", async () => {
  storeToken(studentToken);
  const result = await portalApi().exportRecord(SUBJECT);

  assert.equal(result.includes_identity, true, "the subject's own PII goes to them in the clear");
  assert.equal(result.chain_verified, true);

  const identity = JSON.parse(result.archive["identity.json"]);
  assert.equal(
    identity.date_of_birth,
    "2004-03-19",
    "the date of birth written at record creation comes back out of PostgreSQL"
  );

  // The manifest and the standalone verifier travel with it, or the export is not
  // independently checkable — which is the whole promise of D14.
  for (const file of ["manifest.json", "events.jsonl", "identity.json", "verify.mjs", "README.md"]) {
    assert.ok(result.archive[file], `the archive contains ${file}`);
  }
});

test("the export still carries identity after a restart — BL-7, proven at the product level", async () => {
  // A SECOND API server over the same database. Nothing in the first process's
  // memory survives. Before the durable vault this returned an empty
  // identity.json, silently, and the student would never have known what was lost.
  const restarted = createApiServer({
    store: postgresEventStore(pool),
    vault: identityVault(postgresVaultStore(pool), keyProvider),
    secret: SECRET,
    evidenceRegister: { claims: {} },
    disclosureRegister: JSON.parse(await readFile(path.join(ROOT, "website/src/data/disclosure.json"), "utf8")),
    cors: { allowed: [SITE_ORIGIN] },
  });
  await new Promise((resolve) => restarted.listen(0, "127.0.0.1", resolve));

  try {
    const api = createRecordApi({
      baseUrl: `http://127.0.0.1:${restarted.address().port}`,
      getToken: () => studentToken,
    });
    const result = await api.exportRecord(SUBJECT);
    const identity = JSON.parse(result.archive["identity.json"]);

    assert.equal(identity.date_of_birth, "2004-03-19", "identity survived the restart");
    assert.equal(result.includes_identity, true);
  } finally {
    await new Promise((resolve) => restarted.close(resolve));
  }
});

test("staff exporting on a student's behalf get the record without the identity", async () => {
  const res = await fetch(`${baseUrl}/v1/career-records/${SUBJECT}/export`, {
    method: "POST",
    headers: { authorization: `Bearer ${staffToken}`, "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 200);
  const result = await res.json();

  assert.equal(result.includes_identity, false, "a counsellor's export releases no PII");
  assert.deepEqual(JSON.parse(result.archive["identity.json"]), {});
});

/* ══════════════════════════════════════════════════════════ 8. guardian ══ */

test("a guardian link opens the ward's record, in the shape the issuer now mints", async () => {
  // Exactly the claims functions/record/scripts/issue-student-link.mjs builds for
  // --role guardian. Before the fix these carried no subject_id, and the dashboard
  // refused every one of them as "unbound" without ever calling the API.
  const guardianToken = issueToken(
    { sub: "usr_e2eguardian", role: "guardian", subject_id: SUBJECT, scopes: [`ward:${SUBJECT}`] },
    SECRET,
    { ttlSeconds: 3600 }
  ).token;

  storeToken(guardianToken);
  const session = currentSession();
  assert.equal(session.ok, true, "the portal accepts a guardian session");
  assert.equal(session.subjectId, SUBJECT, "and knows which record to open");

  const timeline = await portalApi().getTimeline(session.subjectId);
  assert.ok(timeline.entries.length > 0, "the API serves the ward's record to the guardian");
});

test("a guardian scoped to one ward cannot open another record", async () => {
  const guardianToken = issueToken(
    { sub: "usr_e2eguardian", role: "guardian", subject_id: SUBJECT, scopes: [`ward:${SUBJECT}`] },
    SECRET,
    { ttlSeconds: 3600 }
  ).token;
  storeToken(guardianToken);

  await assert.rejects(
    () => portalApi().getTimeline(OTHER_SUBJECT),
    (err) => [403, 404].includes(err.status)
  );
});

/* ═══════════════════════════════════════════════════════════ 9. security ══ */

test("a student token cannot reach another student's record", async () => {
  storeToken(studentToken);
  const api = portalApi();

  await assert.rejects(
    () => api.getTimeline(OTHER_SUBJECT),
    (err) => {
      assert.ok([403, 404].includes(err.status), `cross-record read refused (got ${err.status})`);
      return true;
    }
  );
});

test("the API refuses a token this deployment did not sign", async () => {
  const forged = issueToken({ sub: SUBJECT, role: "subject", subject_id: SUBJECT }, randomBytes(32).toString("hex")).token;
  storeToken(forged);

  let unauthorised = false;
  const api = portalApi({ onUnauthorized: () => { unauthorised = true; } });

  await assert.rejects(() => api.getRecord(SUBJECT), (err) => err.status === 401);
  assert.equal(unauthorised, true, "a forged token ends the session, whatever the client believed about it");
});

test("an expired token is refused by the server, not merely hidden by the client", async () => {
  const expired = issueToken({ sub: SUBJECT, role: "subject", subject_id: SUBJECT }, SECRET, {
    ttlSeconds: 60,
    now: Date.now() - 3_600_000,
  }).token;

  // Bypass the client's own expiry check to prove the SERVER refuses it too.
  const api = createRecordApi({ baseUrl, getToken: () => expired });
  await assert.rejects(() => api.getRecord(SUBJECT), (err) => err.status === 401);
});

test("CORS admits the site origin and no other", async () => {
  const allowed = await fetch(`${baseUrl}/v1/career-records/${SUBJECT}/timeline`, {
    method: "OPTIONS",
    headers: { origin: SITE_ORIGIN, "access-control-request-method": "GET" },
  });
  assert.equal(allowed.headers.get("access-control-allow-origin"), SITE_ORIGIN);

  // Every header the dashboard's client actually sends must survive preflight.
  const permitted = allowed.headers.get("access-control-allow-headers") ?? "";
  for (const header of ["content-type", "authorization", "x-correlation-id"]) {
    assert.ok(permitted.includes(header), `preflight permits "${header}"`);
  }

  const foreign = await fetch(`${baseUrl}/v1/career-records/${SUBJECT}/timeline`, {
    method: "OPTIONS",
    headers: { origin: "https://not-richenquest.example", "access-control-request-method": "GET" },
  });
  assert.equal(foreign.headers.get("access-control-allow-origin"), null, "an unlisted origin gets no grant");
});

test("a successful response carries CORS headers, or the browser would discard it", async () => {
  const res = await fetch(`${baseUrl}/v1/career-records/${SUBJECT}`, {
    headers: { authorization: `Bearer ${studentToken}`, origin: SITE_ORIGIN },
  });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("access-control-allow-origin"), SITE_ORIGIN);
});

/* ════════════════════════════════════════════════════════════ 10. logout ══ */

test("signing out ends the session on this device and at the API", async () => {
  storeToken(studentToken);
  assert.equal(currentSession().ok, true);

  // What ctx.signOut() does.
  clearToken();

  const session = currentSession();
  assert.equal(session.ok, false);
  assert.equal(session.reason, "absent");
  assert.equal(readToken(), null, "no token survives sign-out on this device");

  // The client now sends no credential, and the API refuses the request.
  const api = portalApi();
  await assert.rejects(() => api.getRecord(SUBJECT), (err) => err.status === 401);
});

test("sign-out does not revoke a link that is still valid elsewhere — as the UI states", async () => {
  clearToken();
  // The same token, used from another device, still works: the dashboard tells the
  // student exactly this, and it must remain true rather than being wishful copy.
  const api = createRecordApi({ baseUrl, getToken: () => studentToken });
  const record = await api.getRecord(SUBJECT);
  assert.equal(record.subject_id, SUBJECT);
});
