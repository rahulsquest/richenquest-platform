/**
 * Identity tests — vault, consent, auth.
 *
 * Each test corresponds to a security or legal property. If one fails, a promise
 * the company makes in public is false, or a regulator's requirement is unmet.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import {
  identityVault, memoryVaultStore, envKeyProvider, dekAad, VaultError, SubjectErased, KEY_BYTES,
} from "./vault.mjs";
import {
  consentState, consentCheck, ageAt, grantConsentEvent, withdrawConsentEvent,
  linkGuardianEvent, ConsentError, PURPOSES,
} from "./consent.mjs";
import {
  issueToken, verifyToken, resolveActor, assertRecordAccess, rateLimiter, authLogLine, AuthError,
} from "./auth.mjs";
import { memoryStore, appendEvent } from "../log.mjs";

const KEK = randomBytes(KEY_BYTES).toString("base64");
const devEnv = { RECORD_VAULT_KEK: KEK, RECORD_VAULT_KEK_VERSION: "v1", NODE_ENV: "test" };
const newVault = () => identityVault(memoryVaultStore(), envKeyProvider(devEnv));
const SECRET = randomBytes(32).toString("hex");

/* ═══════════════════════════════════════════════════════════════ VAULT ═══ */

test("vault: round-trips PII and never stores plaintext", async () => {
  const store = memoryVaultStore();
  const vault = identityVault(store, envKeyProvider(devEnv));
  await vault.putAll("sub_a", { legal_name: "Aarav Kumar", email: "aarav@example.com", dob: "2004-03-11" });

  assert.equal(await vault.get("sub_a", "legal_name"), "Aarav Kumar");
  assert.deepEqual(await vault.getAll("sub_a"), {
    dob: "2004-03-11", email: "aarav@example.com", legal_name: "Aarav Kumar",
  });

  // Nothing recognisable on disk.
  const raw = JSON.stringify([...store._fields.values()]);
  for (const secret of ["Aarav", "aarav@example.com", "2004-03-11"]) {
    assert.doesNotMatch(raw, new RegExp(secret, "i"), `ciphertext must not contain "${secret}"`);
  }
});

test("vault: a ciphertext cannot be moved between subjects", async () => {
  const store = memoryVaultStore();
  const vault = identityVault(store, envKeyProvider(devEnv));
  await vault.put("sub_a", "legal_name", "Aarav Kumar");
  await vault.put("sub_b", "legal_name", "Priya Singh");

  // Attacker copies A's blob into B's slot. AAD binds subject_id, so it fails.
  store._fields.set("sub_b|legal_name", store._fields.get("sub_a|legal_name"));
  await assert.rejects(() => vault.get("sub_b", "legal_name"), (e) => e.code === "DECRYPT_FAILED");
});

test("vault: a ciphertext cannot be moved between fields", async () => {
  const store = memoryVaultStore();
  const vault = identityVault(store, envKeyProvider(devEnv));
  await vault.putAll("sub_a", { legal_name: "Aarav Kumar", nickname: "AK" });

  store._fields.set("sub_a|legal_name", store._fields.get("sub_a|nickname"));
  await assert.rejects(() => vault.get("sub_a", "legal_name"), (e) => e.code === "DECRYPT_FAILED");
});

test("vault: tampering with ciphertext is detected (GCM auth tag)", async () => {
  const store = memoryVaultStore();
  const vault = identityVault(store, envKeyProvider(devEnv));
  await vault.put("sub_a", "email", "aarav@example.com");

  const blob = store._fields.get("sub_a|email");
  const bytes = Buffer.from(blob.ct, "base64");
  bytes[0] ^= 0xff;
  store._fields.set("sub_a|email", { ...blob, ct: bytes.toString("base64") });

  await assert.rejects(() => vault.get("sub_a", "email"), (e) => e.code === "DECRYPT_FAILED");
});

test("vault: CRYPTO-SHREDDING makes PII unrecoverable while events survive", async () => {
  const store = memoryVaultStore();
  const vault = identityVault(store, envKeyProvider(devEnv));
  const log = memoryStore();

  await vault.putAll("sub_a", { legal_name: "Aarav Kumar", passport: "X1234567" });
  await appendEvent(log, {
    subjectId: "sub_a", type: "profile.created",
    actor: { kind: "human", id: "usr_k", role: "counsellor" }, payload: { origin: "Patna" },
  });

  const receipt = await vault.erase("sub_a", { reason: "subject request" });
  assert.equal(receipt.fields_shredded, 2);
  assert.match(receipt.note, /undecryptable/);

  // PII gone...
  await assert.rejects(() => vault.get("sub_a", "legal_name"), (e) => e instanceof SubjectErased);
  assert.equal(await vault.exists("sub_a"), false);

  // ...and the ciphertext that remains (backups we cannot reach) is useless.
  assert.ok(store._fields.get("sub_a|legal_name"), "ciphertext may legitimately remain");

  // ...while the event log is untouched and still verifiable.
  const events = await log.read("sub_a");
  assert.equal(events.length, 1);
  const { verifyChain } = await import("../event.mjs");
  assert.equal(verifyChain(events).ok, true, "erasure must not break the audit chain");
});

test("vault: erasure is verified, not assumed", async () => {
  // A store that ignores destroyKey must not be able to report success.
  const broken = { ...memoryVaultStore(), async destroyKey() { return true; } };
  const vault = identityVault(broken, envKeyProvider(devEnv));
  await vault.put("sub_a", "legal_name", "Aarav Kumar");

  await assert.rejects(
    () => vault.erase("sub_a"),
    (e) => e.code === "ERASURE_INCOMPLETE",
    "if PII is still readable after key destruction, erasure must fail loudly"
  );
});

test("vault: erasing an already-erased subject is refused, not silently ok", async () => {
  const vault = newVault();
  await vault.put("sub_a", "email", "a@example.com");
  await vault.erase("sub_a");
  await assert.rejects(() => vault.erase("sub_a"), (e) => e instanceof SubjectErased);
});

test("vault: KEK rotation re-wraps the key without touching field ciphertexts", async () => {
  const store = memoryVaultStore();
  // Two KEKs, wrapping via AES-GCM under whichever is current. This is the same
  // interface the env and KMS providers implement — wrap/unwrap a DEK, not hand
  // back KEK material — so the rotation logic is exercised exactly as in prod.
  const keks = { v1: randomBytes(KEY_BYTES), v2: randomBytes(KEY_BYTES) };
  let current = "v1";
  const aad = (s) => Buffer.from(dekAad(s), "utf8");

  const provider = {
    get currentVersion() { return current; },
    async wrapDataKey(subjectId, dek) {
      const iv = randomBytes(12);
      const c = createCipheriv("aes-256-gcm", keks[current], iv);
      c.setAAD(aad(subjectId));
      const ct = Buffer.concat([c.update(dek), c.final()]);
      return { version: current, material: Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64") };
    },
    async unwrapDataKey(subjectId, wrapped) {
      const kek = keks[wrapped.version];
      if (!kek) throw new VaultError("UNKNOWN_KEK_VERSION", wrapped.version);
      const blob = Buffer.from(wrapped.material, "base64");
      const d = createDecipheriv("aes-256-gcm", kek, blob.subarray(0, 12));
      d.setAAD(aad(subjectId));
      d.setAuthTag(blob.subarray(12, 28));
      return Buffer.concat([d.update(blob.subarray(28)), d.final()]);
    },
  };

  const vault = identityVault(store, provider);
  await vault.put("sub_a", "legal_name", "Aarav Kumar");
  const ciphertextBefore = { ...store._fields.get("sub_a|legal_name") };

  current = "v2";
  const result = await vault.rotateKek("sub_a");
  assert.deepEqual(result, { rotated: true, from: "v1", to: "v2" });
  assert.equal(await vault.get("sub_a", "legal_name"), "Aarav Kumar", "data must still read after rotation");
  assert.deepEqual(store._fields.get("sub_a|legal_name"), ciphertextBefore, "rotation is O(subjects), not O(data)");

  assert.deepEqual(await vault.rotateKek("sub_a"), { rotated: false, version: "v2" });
});

test("vault: the env key provider refuses to run in production", () => {
  assert.throws(
    () => envKeyProvider({ ...devEnv, NODE_ENV: "production" }),
    (e) => e.code === "INSECURE_KEY_PROVIDER"
  );
  assert.throws(() => envKeyProvider({ NODE_ENV: "test" }), (e) => e.code === "NO_KEK");
  assert.throws(
    () => envKeyProvider({ NODE_ENV: "test", RECORD_VAULT_KEK: Buffer.alloc(16).toString("base64") }),
    (e) => e.code === "BAD_KEK"
  );
});

/* ═════════════════════════════════════════════════════════════ CONSENT ═══ */

test("consent: ageAt handles birthdays and unknown DOB", () => {
  assert.equal(ageAt("2008-07-26", new Date("2026-07-25")), 17, "day before the birthday");
  assert.equal(ageAt("2008-07-25", new Date("2026-07-25")), 18, "on the birthday");
  assert.equal(ageAt(null), null);
  assert.equal(ageAt("not-a-date"), null);
});

test("consent: state is derived from events, and withdrawal takes effect", async () => {
  const log = memoryStore();
  const subject = { kind: "human", id: "sub_a", role: "subject" };
  await appendEvent(log, grantConsentEvent({ subjectId: "sub_a", purposes: ["advisory", "document_handling"], actor: subject }));

  let state = consentState(await log.read("sub_a"), { dateOfBirth: "2000-01-01" });
  assert.equal(consentCheck(state, "advisory").allowed, true);
  assert.equal(consentCheck(state, "marketing").allowed, false);

  await appendEvent(log, withdrawConsentEvent({ subjectId: "sub_a", purposes: ["advisory"], actor: subject, reason: "changed mind" }));
  state = consentState(await log.read("sub_a"), { dateOfBirth: "2000-01-01" });

  const denied = consentCheck(state, "advisory");
  assert.equal(denied.allowed, false);
  assert.equal(denied.code, "NO_CONSENT");
  assert.match(denied.reason, /withdrawn/);
  assert.equal(consentCheck(state, "document_handling").allowed, true, "withdrawal is per-purpose");
});

test("consent: an empty withdrawal list revokes everything", async () => {
  const log = memoryStore();
  const subject = { kind: "human", id: "sub_a", role: "subject" };
  await appendEvent(log, grantConsentEvent({ subjectId: "sub_a", purposes: ["advisory", "document_handling"], actor: subject }));
  await appendEvent(log, withdrawConsentEvent({ subjectId: "sub_a", actor: subject }));

  const state = consentState(await log.read("sub_a"), { dateOfBirth: "2000-01-01" });
  for (const p of ["advisory", "document_handling"]) {
    assert.equal(consentCheck(state, p).allowed, false, `${p} must be withdrawn`);
  }
});

test("consent: reconstructs what consent looked like at a past moment", async () => {
  const log = memoryStore();
  const subject = { kind: "human", id: "sub_a", role: "subject" };
  await appendEvent(log, {
    ...grantConsentEvent({ subjectId: "sub_a", purposes: ["advisory"], actor: subject }),
    recordedAt: "2026-01-01T00:00:00Z", occurredAt: "2026-01-01T00:00:00Z",
  });
  await appendEvent(log, {
    ...withdrawConsentEvent({ subjectId: "sub_a", actor: subject }),
    recordedAt: "2026-06-01T00:00:00Z", occurredAt: "2026-06-01T00:00:00Z",
  });

  const events = await log.read("sub_a");
  const then = consentState(events, { asOf: "2026-03-01T00:00:00Z", dateOfBirth: "2000-01-01" });
  const now = consentState(events, { asOf: "2026-07-01T00:00:00Z", dateOfBirth: "2000-01-01" });

  assert.equal(consentCheck(then, "advisory").allowed, true, "we must be able to show consent was valid when we acted");
  assert.equal(consentCheck(now, "advisory").allowed, false);
});

test("consent: unknown DOB is refused rather than assumed adult", async () => {
  const log = memoryStore();
  await appendEvent(log, grantConsentEvent({
    subjectId: "sub_a", purposes: ["advisory"], actor: { kind: "human", id: "sub_a", role: "subject" },
  }));
  const state = consentState(await log.read("sub_a"), { dateOfBirth: null });
  const check = consentCheck(state, "advisory");
  assert.equal(check.allowed, false);
  assert.equal(check.code, "AGE_UNKNOWN");
});

test("consent: a minor requires a verified guardian, and guardian-given consent", async () => {
  const log = memoryStore();
  const minorDob = "2010-05-01"; // 16 at the reference date
  const child = { kind: "human", id: "sub_m", role: "subject" };
  const guardian = { kind: "human", id: "usr_parent", role: "guardian" };

  // The child consents on their own: refused, no guardian linked.
  await appendEvent(log, grantConsentEvent({ subjectId: "sub_m", purposes: ["advisory"], actor: child }));
  let state = consentState(await log.read("sub_m"), { dateOfBirth: minorDob });
  assert.equal(state.is_minor, true);
  assert.equal(consentCheck(state, "advisory").code, "GUARDIAN_REQUIRED");

  // Guardian linked, but the consent on record is still the child's.
  await appendEvent(log, linkGuardianEvent({
    subjectId: "sub_m", guardianId: "usr_parent", relationship: "mother",
    verifiedBy: "doc:guardian_id@v1", actor: { kind: "human", id: "usr_k", role: "counsellor" },
  }));
  state = consentState(await log.read("sub_m"), { dateOfBirth: minorDob });
  assert.equal(consentCheck(state, "advisory").code, "GUARDIAN_CONSENT_REQUIRED");

  // Guardian gives consent: allowed.
  await appendEvent(log, grantConsentEvent({ subjectId: "sub_m", purposes: ["advisory"], actor: guardian }));
  state = consentState(await log.read("sub_m"), { dateOfBirth: minorDob });
  assert.equal(consentCheck(state, "advisory").allowed, true);
});

test("consent: profiling and marketing to a minor cannot be consented into (DPDP)", async () => {
  const log = memoryStore();
  const guardian = { kind: "human", id: "usr_parent", role: "guardian" };
  await appendEvent(log, linkGuardianEvent({
    subjectId: "sub_m", guardianId: "usr_parent", relationship: "father",
    verifiedBy: "doc:guardian_id@v1", actor: { kind: "human", id: "usr_k", role: "counsellor" },
  }));
  await appendEvent(log, grantConsentEvent({
    subjectId: "sub_m", purposes: ["advisory", "ai_assistance", "marketing"], actor: guardian,
  }));

  const state = consentState(await log.read("sub_m"), { dateOfBirth: "2012-01-01" });
  assert.equal(consentCheck(state, "ai_assistance").code, "MINOR_AI_PROHIBITED");
  assert.equal(consentCheck(state, "marketing").code, "MINOR_MARKETING_PROHIBITED");
  // Even an adult-permitted purpose is refused for an AI actor acting on a minor.
  assert.equal(consentCheck(state, "advisory", { actorKind: "ai" }).code, "MINOR_AI_PROHIBITED");
  assert.equal(consentCheck(state, "advisory").allowed, true, "human advisory work is still permitted");
});

test("consent: undeclared purposes are refused at both ends", () => {
  assert.throws(
    () => grantConsentEvent({ subjectId: "s", purposes: ["sell_data"], actor: {} }),
    (e) => e instanceof ConsentError && e.code === "UNKNOWN_PURPOSE"
  );
  assert.throws(() => grantConsentEvent({ subjectId: "s", purposes: [], actor: {} }), (e) => e.code === "NO_PURPOSE");
  assert.equal(consentCheck({ purposes: {}, age_known: true, is_minor: false, guardians: [] }, "sell_data").code, "UNKNOWN_PURPOSE");
  assert.ok(Object.keys(PURPOSES).length >= 5);
});

test("consent: a guardian link must record how it was verified", () => {
  assert.throws(
    () => linkGuardianEvent({ subjectId: "s", guardianId: "g", relationship: "mother", actor: {} }),
    (e) => e.code === "UNVERIFIED_GUARDIAN"
  );
});

/* ════════════════════════════════════════════════════════════════ AUTH ═══ */

test("auth: a valid token round-trips", () => {
  const { token, claims } = issueToken({ sub: "sub_a", role: "subject", subject_id: "sub_a" }, SECRET);
  const verified = verifyToken(token, SECRET);
  assert.equal(verified.sub, "sub_a");
  assert.equal(verified.role, "subject");
  assert.equal(verified.jti, claims.jti);
});

test("auth: a forged or altered token is rejected", () => {
  const { token } = issueToken({ sub: "sub_a", role: "subject", subject_id: "sub_a" }, SECRET);

  assert.throws(() => verifyToken(token, randomBytes(32).toString("hex")), (e) => e.code === "BAD_SIGNATURE");

  // Escalate role in the payload without re-signing.
  const [prefix, body] = token.split(".");
  const claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  claims.role = "administrator";
  const forged = `${prefix}.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.${token.split(".")[2]}`;
  assert.throws(() => verifyToken(forged, SECRET), (e) => e.code === "BAD_SIGNATURE");
});

test("auth: expiry is enforced, and a forged exp cannot bypass it", () => {
  const now = Date.now();
  const { token } = issueToken({ sub: "sub_a", role: "subject", subject_id: "sub_a" }, SECRET, { ttlSeconds: 60, now });

  assert.ok(verifyToken(token, SECRET, { now: now + 30_000 }));
  assert.throws(() => verifyToken(token, SECRET, { now: now + 120_000 }), (e) => e.code === "TOKEN_EXPIRED");

  // Signature is checked before the payload is trusted, so extending exp fails
  // on the signature rather than sneaking past the expiry check.
  const [prefix, body, mac] = token.split(".");
  const claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  claims.exp += 100_000;
  const forged = `${prefix}.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.${mac}`;
  assert.throws(() => verifyToken(forged, SECRET, { now: now + 120_000 }), (e) => e.code === "BAD_SIGNATURE");
});

test("auth: revocation works before expiry", () => {
  const { token, claims } = issueToken({ sub: "usr_k", role: "counsellor" }, SECRET);
  assert.ok(verifyToken(token, SECRET));
  assert.throws(() => verifyToken(token, SECRET, { revoked: new Set([claims.jti]) }), (e) => e.code === "TOKEN_REVOKED");
});

test("auth: tokens must be bound to what they may touch", () => {
  assert.throws(() => issueToken({ sub: "sub_a", role: "subject" }, SECRET), (e) => e.code === "NO_RECORD_BINDING");
  assert.throws(() => issueToken({ sub: "p", role: "partner" }, SECRET), (e) => e.code === "NO_PARTNER_BINDING");
  assert.throws(() => issueToken({ sub: "x", role: "wizard" }, SECRET), (e) => e.code === "BAD_ROLE");
  assert.throws(() => issueToken({ sub: "x", role: "auditor" }, "short"), (e) => e.code === "WEAK_SECRET");
  assert.throws(
    () => issueToken({ sub: "x", role: "auditor" }, SECRET, { ttlSeconds: 999_999 }),
    (e) => e.code === "TTL_TOO_LONG"
  );
});

test("auth: a subject token cannot reach another record", () => {
  const { claims } = issueToken({ sub: "sub_a", role: "subject", subject_id: "sub_a" }, SECRET);
  assert.equal(assertRecordAccess(claims, "sub_a"), true);
  assert.throws(() => assertRecordAccess(claims, "sub_b"), (e) => e.code === "WRONG_RECORD" && e.status === 403);
});

test("auth: a guardian token must be scoped to the ward", () => {
  const { claims } = issueToken({ sub: "usr_parent", role: "guardian", scopes: ["ward:sub_m"] }, SECRET);
  assert.equal(assertRecordAccess(claims, "sub_m"), true);
  assert.throws(() => assertRecordAccess(claims, "sub_other"), (e) => e.code === "NOT_GUARDIAN_OF");
});

test("auth: resolveActor maps roles to actor kinds for the write path", () => {
  const asKind = (role, extra = {}) =>
    resolveActor(issueToken({ sub: "x", role, ...extra }, SECRET).claims).actor.kind;

  assert.equal(asKind("counsellor"), "human");
  assert.equal(asKind("ai_service"), "ai", "an AI token must never resolve to a human actor");
  assert.equal(asKind("partner", { partner_id: "partner:uni_x" }), "partner");

  const resolved = resolveActor(issueToken({ sub: "u", role: "partner", partner_id: "partner:uni_x" }, SECRET).claims);
  assert.equal(resolved.viewer.id, "partner:uni_x", "partner authorisation keys on the institution, not the user");
});

test("auth: malformed tokens are rejected without throwing unexpectedly", () => {
  for (const bad of ["", "garbage", "rq1.only-two", "rq2.a.b", null, undefined, 42]) {
    assert.throws(() => verifyToken(bad, SECRET), (e) => e instanceof AuthError, `must reject ${JSON.stringify(bad)}`);
  }
  const badBody = `rq1.${Buffer.from("not json").toString("base64url")}`;
  const mac = createHmac("sha256", SECRET).update(badBody.slice(4)).digest("base64url");
  assert.throws(() => verifyToken(`${badBody}.${mac}`, SECRET), (e) => e.code === "MALFORMED_TOKEN");
});

/* ────────────────────────────────────────────────────────── rate limit ─── */

test("rate limiter: allows up to the limit then refuses with a retry hint", () => {
  let t = 1_000_000;
  const rl = rateLimiter({ limit: 3, windowMs: 1000, now: () => t });

  for (let i = 0; i < 3; i++) assert.equal(rl.check("ip1").allowed, true, `request ${i + 1} allowed`);
  const blocked = rl.check("ip1");
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterMs > 0 && blocked.retryAfterMs <= 1000);

  assert.equal(rl.check("ip2").allowed, true, "limits are per key");

  t += 1000; // next window
  assert.equal(rl.check("ip1").allowed, true);
});

test("rate limiter: sweep bounds memory growth", () => {
  let t = 0;
  const rl = rateLimiter({ limit: 5, windowMs: 100, now: () => t });
  for (let i = 0; i < 50; i++) { t += 100; rl.check(`key${i}`); }
  assert.ok(rl.size() > 1);
  t += 1000;
  rl.sweep();
  assert.equal(rl.size(), 0, "stale buckets must be reclaimed");
});

/* ───────────────────────────────────────────────────────────── logging ─── */

test("auth log lines carry identifiers but never PII or token contents", () => {
  const line = authLogLine({
    outcome: "denied", code: "WRONG_RECORD", role: "subject",
    actorId: "sub_a", subjectId: "sub_b", route: "GET /v1/records/:id/timeline", ip: "203.0.113.7",
  });
  const parsed = JSON.parse(line);

  assert.equal(parsed.kind, "auth");
  assert.equal(parsed.outcome, "denied");
  assert.equal(parsed.code, "WRONG_RECORD");
  assert.doesNotMatch(line, /203\.0\.113\.7/, "raw IP must not be logged");
  assert.equal(parsed.ip_hash.length, 16);
  assert.ok(!("token" in parsed) && !("email" in parsed) && !("name" in parsed));
});
