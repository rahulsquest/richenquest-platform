/**
 * Google Cloud KMS adapter — UNIT tests.
 *
 * These verify the MAPPING from the injected-client interface to the shape of a
 * @google-cloud/kms KeyManagementServiceClient: the right method names, the
 * {name, plaintext, additionalAuthenticatedData} request shape, Buffer/base64
 * handling, and resource-name construction. The fake below has the Google method
 * shape and performs real AES-256-GCM, so the round trip is genuine.
 *
 * WHAT THIS DOES NOT PROVE: that Google's actual service accepts these calls. That
 * is Production verification and requires real credentials — see kms-gcp.mjs and
 * docs/STATUS.md BL-2. Nothing here should be read as a claim that Cloud KMS was
 * reached.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { gcpKmsClient, gcpCryptoKeyName, gcpKmsKeyProvider, gcpKmsConfigFromEnv } from "./kms-gcp.mjs";
import { identityVault, memoryVaultStore, SubjectErased, KEY_BYTES } from "./vault.mjs";

/**
 * A stand-in shaped like @google-cloud/kms: methods take
 * { name, plaintext|ciphertext, additionalAuthenticatedData } and resolve to a
 * one-element array. Real AES-256-GCM under a per-key master, AAD enforced, so the
 * envelope genuinely round-trips. `encoding` lets us mimic the library returning
 * Buffers (default) or a REST transport returning base64 strings.
 */
function googleKmsFake({ encoding = "buffer", calls = [] } = {}) {
  const masters = new Map();
  const masterFor = (name) => {
    if (!masters.has(name)) masters.set(name, randomBytes(KEY_BYTES));
    return masters.get(name);
  };
  const out = (buf) => (encoding === "base64" ? buf.toString("base64") : buf);
  return {
    calls,
    async encrypt({ name, plaintext, additionalAuthenticatedData }) {
      calls.push({ op: "encrypt", name, aad: additionalAuthenticatedData });
      const iv = randomBytes(12);
      const c = createCipheriv("aes-256-gcm", masterFor(name), iv);
      if (additionalAuthenticatedData) c.setAAD(Buffer.from(additionalAuthenticatedData));
      const body = Buffer.concat([c.update(plaintext), c.final()]);
      return [{ ciphertext: out(Buffer.concat([iv, c.getAuthTag(), body])) }];
    },
    async decrypt({ name, ciphertext, additionalAuthenticatedData }) {
      calls.push({ op: "decrypt", name, aad: additionalAuthenticatedData });
      const blob = Buffer.isBuffer(ciphertext) ? ciphertext : Buffer.from(ciphertext, "base64");
      const d = createDecipheriv("aes-256-gcm", masterFor(name), blob.subarray(0, 12));
      if (additionalAuthenticatedData) d.setAAD(Buffer.from(additionalAuthenticatedData));
      d.setAuthTag(blob.subarray(12, 28));
      return [{ plaintext: out(Buffer.concat([d.update(blob.subarray(28)), d.final()])) }];
    },
  };
}

/* ═══════════════════════════════════════════════════════ resource names ══ */

test("gcp: builds the canonical CryptoKey resource name", () => {
  assert.equal(
    gcpCryptoKeyName({ projectId: "richenquest", locationId: "asia-south1", keyRing: "vault", key: "kek" }),
    "projects/richenquest/locations/asia-south1/keyRings/vault/cryptoKeys/kek"
  );
});

test("gcp: an incomplete resource name is refused", () => {
  assert.throws(() => gcpCryptoKeyName({ projectId: "p", locationId: "l", keyRing: "r" }), (e) => e.code === "GCP_CONFIG_INCOMPLETE");
});

/* ═══════════════════════════════════════════════════ client-shape mapping ══ */

test("gcp: encrypt maps onto the Google request shape and passes AAD", async () => {
  const calls = [];
  const client = gcpKmsClient(googleKmsFake({ calls }));
  const name = "projects/p/locations/l/keyRings/r/cryptoKeys/k";
  const aad = Buffer.from("richenquest.vault.v1|sub_a|__dek__");

  const ct = await client.encrypt(name, randomBytes(KEY_BYTES), aad);
  assert.ok(Buffer.isBuffer(ct) && ct.length > 0);
  assert.equal(calls[0].op, "encrypt");
  assert.equal(calls[0].name, name, "the CryptoKey resource name is passed as `name`");
  assert.ok(calls[0].aad.equals(aad), "subject AAD is forwarded to Cloud KMS");
});

test("gcp: a base64 response (REST transport) is normalised back to a Buffer", async () => {
  const client = gcpKmsClient(googleKmsFake({ encoding: "base64" }));
  const name = "projects/p/locations/l/keyRings/r/cryptoKeys/k";
  const dek = randomBytes(KEY_BYTES);
  const aad = Buffer.from("aad");

  const ct = await client.encrypt(name, dek, aad);
  const back = await client.decrypt(name, ct, aad);
  assert.ok(back.equals(dek), "round-trips whether the library returns Buffers or base64");
});

test("gcp: a malformed injected client is refused", () => {
  assert.throws(() => gcpKmsClient({}), (e) => e.code === "BAD_GCP_CLIENT");
  assert.throws(() => gcpKmsClient({ encrypt() {} }), (e) => e.code === "BAD_GCP_CLIENT");
});

/* ═══════════════════════════════════════════ full provider over the vault ══ */

test("gcp: gcpKmsKeyProvider drives the vault end-to-end (put, read, erase)", async () => {
  const google = googleKmsFake();
  const provider = gcpKmsKeyProvider(google, {
    projectId: "richenquest",
    locationId: "asia-south1",
    keyRing: "vault",
    keys: { v1: "kek" },
    version: "v1",
  });
  const vault = identityVault(memoryVaultStore(), provider);

  await vault.putAll("sub_a", { legal_name: "Aarav Kumar", dob: "2004-03-11" });
  assert.equal(await vault.get("sub_a", "legal_name"), "Aarav Kumar");
  assert.deepEqual(await vault.getAll("sub_a"), { dob: "2004-03-11", legal_name: "Aarav Kumar" });

  await vault.erase("sub_a");
  await assert.rejects(() => vault.get("sub_a", "legal_name"), (e) => e instanceof SubjectErased);

  // Every KMS call named the full CryptoKey resource — never a bare key id.
  assert.ok(google.calls.every((c) => c.name === "projects/richenquest/locations/asia-south1/keyRings/vault/cryptoKeys/kek"));
});

test("gcp: rotation across two CryptoKeys re-wraps under the new key", async () => {
  const google = googleKmsFake();
  const base = { projectId: "richenquest", locationId: "asia-south1", keyRing: "vault" };
  const store = memoryVaultStore();

  const v1 = identityVault(store, gcpKmsKeyProvider(google, { ...base, keys: { v1: "kek1", v2: "kek2" }, version: "v1" }));
  await v1.put("sub_a", "legal_name", "Aarav Kumar");

  const v2 = identityVault(store, gcpKmsKeyProvider(google, { ...base, keys: { v1: "kek1", v2: "kek2" }, version: "v2" }));
  assert.deepEqual(await v2.rotateKek("sub_a"), { rotated: true, from: "v1", to: "v2" });
  assert.equal(await v2.get("sub_a", "legal_name"), "Aarav Kumar");
});

/* ══════════════════════════════════════════════════════ config from env ══ */

test("gcp: config is read and validated from the environment", () => {
  const cfg = gcpKmsConfigFromEnv({
    GCP_PROJECT_ID: "richenquest",
    GCP_KMS_LOCATION: "asia-south1",
    GCP_KMS_KEYRING: "vault",
    GCP_KMS_KEY: "kek",
    RECORD_VAULT_KEK_VERSION: "v1",
    GCP_KMS_KEY_V0: "kek-old",
  });
  assert.equal(cfg.projectId, "richenquest");
  assert.equal(cfg.version, "v1");
  assert.equal(cfg.keys.v1, "kek");
  assert.equal(cfg.keys.v0, "kek-old", "older versions are collected for rotation");
});

test("gcp: incomplete environment config is refused with the missing fields named", () => {
  assert.throws(
    () => gcpKmsConfigFromEnv({ GCP_PROJECT_ID: "richenquest" }),
    (e) => e.code === "GCP_CONFIG_INCOMPLETE" && /GCP_KMS_KEY/.test(e.message)
  );
});
