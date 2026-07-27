#!/usr/bin/env node
/**
 * Local Career Record API, for developing and verifying the Student Dashboard.
 *
 * DEVELOPMENT ONLY. This is the REAL API — the same router, the same pipeline,
 * the same endpoints, the same invariants, the same hash chain — assembled with
 * the in-memory store and vault adapters. Those adapters ship with the product
 * and pass the same conformance suite as PostgreSQL; they are not stand-ins for
 * the API's behaviour. What is absent is durability, not correctness: everything
 * disappears when the process exits.
 *
 * It exists because nothing is deployed yet (docs/STATUS.md BL-1). It is not a
 * substitute for verifying against hosted PostgreSQL, and it never runs in
 * production: envKeyProvider refuses to start when NODE_ENV=production.
 *
 * Usage:
 *   node functions/record/scripts/dev-server.mjs            # empty record
 *   node functions/record/scripts/dev-server.mjs --seed     # + a worked example
 *
 * Then set record_api.base_url in website/src/data/platform.json to the printed
 * origin, rebuild the site, and open the printed dashboard link.
 */

import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createApiServer } from "../api/service.mjs";
import { memoryStore } from "../log.mjs";
import { identityVault, memoryVaultStore, envKeyProvider, KEY_BYTES } from "../identity/vault.mjs";
import { issueToken } from "../identity/auth.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const PORT = Number(process.env.RECORD_API_PORT || 8787);
const SITE_ORIGIN = process.env.SITE_ORIGIN || "http://localhost:8080";
const SECRET = process.env.RECORD_TOKEN_SECRET || randomBytes(32).toString("hex");
const SUBJECT = "sub_devstudent01";

const [disclosureRegister, evidenceRegister] = await Promise.all([
  readFile(path.join(ROOT, "website/src/data/disclosure.json"), "utf8").then(JSON.parse),
  readFile(path.join(ROOT, "website/src/data/evidence.json"), "utf8").then(JSON.parse),
]);

const server = createApiServer({
  store: memoryStore(),
  vault: identityVault(memoryVaultStore(), envKeyProvider({ RECORD_VAULT_KEK: randomBytes(KEY_BYTES).toString("base64"), NODE_ENV: "development" })),
  secret: SECRET,
  evidenceRegister,
  disclosureRegister,
  cors: { allowed: [SITE_ORIGIN] },
});

await new Promise((resolve) => server.listen(PORT, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${PORT}`;

/* ------------------------------------------------------------------ seed --- */

const staffToken = issueToken({ sub: "usr_devcounsellor", role: "counsellor" }, SECRET, { ttlSeconds: 3600 }).token;

async function call(method, url, body, token = staffToken) {
  const res = await fetch(`${base}${url}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status} ${JSON.stringify(payload)}`);
  return payload;
}

if (process.argv.includes("--seed")) {
  // Seeded through the PUBLIC API, not by writing to the store: every entry below
  // passes the real invariants, gets a real hash link, and resolves its evidence
  // and disclosure through the real registers.
  await call("POST", "/v1/career-records", {
    subject_id: SUBJECT,
    consent_purposes: ["advisory", "document_handling"],
    date_of_birth: "2005-04-11",
    origin_country: "India",
  });

  await call("POST", `/v1/career-records/${SUBJECT}/events`, {
    type: "counselling.session_held",
    payload: { topic: "Destination shortlisting", duration_minutes: 45, follow_up: "Confirm budget ceiling before the next session" },
  });

  await call("POST", `/v1/career-records/${SUBJECT}/events`, {
    type: "document.submitted",
    payload: { document: "Class XII marksheet", status: "awaiting verification" },
    evidence: [{ ref: "doc:dev_marksheet_01", kind: "academic_document" }],
  });

  await call("POST", `/v1/career-records/${SUBJECT}/events`, {
    type: "recommendation.issued",
    payload: {
      summary: "Apply to public universities in Italy under the DSU need-based scheme",
      recommended: [{ option: "dest:italy", rank: 1 }, { option: "dest:germany", rank: 2 }],
      follow_up: "Prepare Universitaly pre-application before the intake window closes",
    },
    evidence: [{ ref: "claim:destinations-covered", kind: "claim" }],
  });

  console.log(`✓ seeded ${SUBJECT} through the public API`);
}

/* ------------------------------------------------------------------ info --- */

const studentToken = issueToken({ sub: SUBJECT, role: "subject", subject_id: SUBJECT }, SECRET, { ttlSeconds: 3600 }).token;

console.log("");
console.log(`  Career Record API (development, in-memory)  ${base}`);
console.log(`  CORS allows                                 ${SITE_ORIGIN}`);
console.log("");
console.log("  1. set website/src/data/platform.json → record_api.base_url:");
console.log(`     "${base.replace("127.0.0.1", "localhost")}"`);
console.log("  2. node website/build.mjs && node website/serve.mjs");
console.log("  3. open:");
console.log("");
console.log(`  ${SITE_ORIGIN}/dashboard/#token=${encodeURIComponent(studentToken)}`);
console.log("");
console.log("  Ctrl-C to stop. Nothing is persisted.");
