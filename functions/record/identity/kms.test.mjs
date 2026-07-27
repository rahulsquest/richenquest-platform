/**
 * KMS key provider — UNIT tests.
 *
 * These exercise the provider interface and the vault over it, using
 * fakeKmsClient — which performs REAL AES-256-GCM under a per-key master and
 * enforces the AAD binding. So "real encryption" here means real cryptography and
 * a real envelope round trip; it does NOT mean Google Cloud KMS. That distinction
 * is the point of the verification-status box in kms.mjs, and nothing in this file
 * claims otherwise.
 *
 * What only a real provider (with credentials) could add is in kms-gcp.test.mjs
 * (the mapping to Google's client shape) and, ultimately, a live round trip —
 * which remains Production-unverified. See docs/STATUS.md BL-2.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

import { kmsKeyProvider, fakeKmsClient, KmsError } from "./kms.mjs";
import { identityVault, memoryVaultStore, SubjectErased, KEY_BYTES } from "./vault.mjs";
import { verifyChain } from "../event.mjs";
import { memoryStore, appendEvent } from "../log.mjs";

const KEY_ID = "projects/p/locations/l/keyRings/r/cryptoKeys/vault-kek";

/* ═══════════════════════════════════════════════════ provider construction ═ */

test("kms: a malformed client or missing key id is refused at construction", () => {
  assert.throws(() => kmsKeyProvider({}, { keyId: KEY_ID }), (e) => e.code === "BAD_CLIENT");
  assert.throws(() => kmsKeyProvider({ encrypt() {} }, { keyId: KEY_ID }), (e) => e.code === "BAD_CLIENT");
  assert.throws(() => kmsKeyProvider(fakeKmsClient(), {}), (e) => e.code === "NO_KEY_ID");
});

/* ═══════════════════════════════════════════════════════ envelope round trip ═ */

test("kms: wrap produces opaque material, and unwrap returns the exact DEK", async () => {
  const provider = kmsKeyProvider(fakeKmsClient(), { keyId: KEY_ID, version: "v1" });
  const dek = randomBytes(KEY_BYTES);

  const wrapped = await provider.wrapDataKey("sub_a", dek);
  assert.equal(wrapped.version, "v1");
  assert.equal(typeof wrapped.material, "string");
  assert.ok(!wrapped.material.includes(dek.toString("base64")), "the plaintext DEK never appears in the wrapped material");

  const back = await provider.unwrapDataKey("sub_a", wrapped);
  assert.ok(back.equals(dek), "unwrap returns the exact bytes that were wrapped");
});

test("kms: a wrapped DEK cannot be unwrapped under another subject (AAD binding)", async () => {
  const provider = kmsKeyProvider(fakeKmsClient(), { keyId: KEY_ID });
  const dek = randomBytes(KEY_BYTES);
  const wrapped = await provider.wrapDataKey("sub_a", dek);

  // Same wrapped material, different subject → the KMS-level AAD fails to verify.
  await assert.rejects(
    () => provider.unwrapDataKey("sub_b", wrapped),
    (e) => e instanceof KmsError && e.code === "KMS_UNAVAILABLE",
    "moving a wrapped key between subjects must fail, and must not leak provider detail"
  );
});

test("kms: only a 32-byte DEK may be wrapped", async () => {
  const provider = kmsKeyProvider(fakeKmsClient(), { keyId: KEY_ID });
  await assert.rejects(() => provider.wrapDataKey("sub_a", randomBytes(16)), (e) => e.code === "BAD_KEY_LENGTH");
});

test("kms: healthCheck round-trips a throwaway key", async () => {
  const provider = kmsKeyProvider(fakeKmsClient(), { keyId: KEY_ID, version: "v1" });
  assert.deepEqual(await provider.healthCheck(), { ok: true, version: "v1", provider: "kms" });
});

/* ═══════════════════════════════════════════════════════ failure handling ══ */

test("kms: a provider outage surfaces as KMS_UNAVAILABLE, never the raw error", async () => {
  const provider = kmsKeyProvider(fakeKmsClient({ failing: true }), { keyId: KEY_ID });
  await assert.rejects(
    () => provider.wrapDataKey("sub_a", randomBytes(KEY_BYTES)),
    (e) => e.code === "KMS_UNAVAILABLE" && !/aes|master|iv/i.test(e.message)
  );
});

test("kms: an unknown KEK version is refused rather than guessed", async () => {
  const provider = kmsKeyProvider(fakeKmsClient(), { keyId: KEY_ID, version: "v2" });
  await assert.rejects(
    () => provider.unwrapDataKey("sub_a", { version: "v1", material: "irrelevant" }),
    (e) => e.code === "UNKNOWN_KEK_VERSION"
  );
});

/* ═══════════════════════════════════════════════ the vault over the provider ═ */

const kmsVault = (client, opts) => identityVault(memoryVaultStore(), kmsKeyProvider(client, opts));

test("kms: the vault round-trips PII through the KMS provider and stores no plaintext", async () => {
  const store = memoryVaultStore();
  const vault = identityVault(store, kmsKeyProvider(fakeKmsClient(), { keyId: KEY_ID }));

  await vault.putAll("sub_a", { legal_name: "Aarav Kumar", passport: "X1234567" });
  assert.equal(await vault.get("sub_a", "legal_name"), "Aarav Kumar");

  const dump = JSON.stringify([...store._fields.values(), ...store._keys.values()]);
  for (const secret of ["Aarav", "X1234567"]) {
    assert.doesNotMatch(dump, new RegExp(secret, "i"), `neither field ciphertext nor wrapped key contains "${secret}"`);
  }
});

test("kms: CRYPTO-SHREDDING through the provider leaves PII unrecoverable, chain intact", async () => {
  const store = memoryVaultStore();
  const vault = identityVault(store, kmsKeyProvider(fakeKmsClient(), { keyId: KEY_ID }));
  const log = memoryStore();

  await vault.putAll("sub_a", { legal_name: "Aarav Kumar", passport: "X1234567" });
  await appendEvent(log, {
    subjectId: "sub_a", type: "profile.created",
    actor: { kind: "human", id: "usr_k", role: "counsellor" }, payload: { origin: "Patna" },
  });

  const receipt = await vault.erase("sub_a");
  assert.equal(receipt.fields_shredded, 2);
  await assert.rejects(() => vault.get("sub_a", "legal_name"), (e) => e instanceof SubjectErased);
  assert.ok(store._fields.get("sub_a|legal_name"), "ciphertext may remain; it is now undecryptable");

  const events = await log.read("sub_a");
  assert.equal(verifyChain(events).ok, true, "erasure must not touch the event chain");
});

test("kms: rotation re-wraps under the new version without changing the DEK or fields", async () => {
  const client = fakeKmsClient(); // one 'KMS': both key versions live here
  const store = memoryVaultStore();
  const keyIdsByVersion = new Map([["v1", "key/v1"], ["v2", "key/v2"]]);

  const v1 = identityVault(store, kmsKeyProvider(client, { keyId: "key/v1", version: "v1", keyIdsByVersion }));
  await v1.put("sub_a", "legal_name", "Aarav Kumar");
  const fieldBefore = { ...store._fields.get("sub_a|legal_name") };

  const v2 = identityVault(store, kmsKeyProvider(client, { keyId: "key/v2", version: "v2", keyIdsByVersion }));
  assert.deepEqual(await v2.rotateKek("sub_a"), { rotated: true, from: "v1", to: "v2" });

  assert.deepEqual(store._fields.get("sub_a|legal_name"), fieldBefore, "field ciphertext untouched");
  assert.equal(store._keys.get("sub_a").version, "v2", "the wrapped key now records v2");
  assert.equal(await v2.get("sub_a", "legal_name"), "Aarav Kumar", "still readable under the new KEK");
});

test("kms: a key wrapped under a retired version fails loudly, never wrong", async () => {
  const client = fakeKmsClient();
  const store = memoryVaultStore();

  // Written under v1 …
  await identityVault(store, kmsKeyProvider(client, { keyId: "key/v1", version: "v1" })).put("sub_a", "x", 1);
  // … then read by a provider that only knows v3 (v1 retired before re-wrap).
  const v3 = identityVault(store, kmsKeyProvider(client, { keyId: "key/v3", version: "v3" }));
  await assert.rejects(() => v3.get("sub_a", "x"), (e) => e.code === "UNKNOWN_KEK_VERSION");
});

/* ═══════════════════════════════════════════════════════════ the DEK cache ══ */

test("kms: without the cache, each field read is its own unwrap; with it, one serves all", async () => {
  // Count decrypts by wrapping the fake client.
  const inner = fakeKmsClient();
  let decrypts = 0;
  const counting = { encrypt: inner.encrypt, decrypt: (...a) => (decrypts++, inner.decrypt(...a)) };

  const store = memoryVaultStore();
  const write = identityVault(store, kmsKeyProvider(counting, { keyId: KEY_ID }));
  await write.putAll("sub_a", { a: 1, b: 2, c: 3 });

  decrypts = 0;
  const uncached = identityVault(store, kmsKeyProvider(counting, { keyId: KEY_ID }));
  await uncached.getAll("sub_a");
  assert.equal(decrypts, 3, "three fields, three unwraps when the cache is off (the default)");

  decrypts = 0;
  const cached = identityVault(store, kmsKeyProvider(counting, { keyId: KEY_ID }), { dekCacheTtlMs: 30_000 });
  await cached.getAll("sub_a");
  assert.equal(decrypts, 1, "one unwrap serves every field when the cache is on");
});

test("kms: erase purges the DEK cache, so a cached key cannot mask an erasure", async () => {
  const store = memoryVaultStore();
  const vault = identityVault(store, kmsKeyProvider(fakeKmsClient(), { keyId: KEY_ID }), { dekCacheTtlMs: 60_000 });

  await vault.put("sub_a", "legal_name", "Aarav Kumar");
  await vault.get("sub_a", "legal_name"); // populates the cache
  const receipt = await vault.erase("sub_a");
  assert.equal(receipt.fields_shredded, 1);

  // If erase had not purged the cache, this would still decrypt from the cached DEK.
  await assert.rejects(() => vault.get("sub_a", "legal_name"), (e) => e instanceof SubjectErased);
});

void kmsVault;
