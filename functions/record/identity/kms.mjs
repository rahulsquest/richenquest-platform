/**
 * KMS-backed key provider — the key hierarchy's root, for production.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ VERIFICATION STATUS                                                        │
 * │   Implemented          ✓  provider + injected-client interface            │
 * │   Unit verified        ✓  against a fake client doing real AES-256-GCM     │
 * │   Integration verified ✓  through the vault against real PostgreSQL        │
 * │   Production verified   ✗  NOT run against Google Cloud KMS — no creds     │
 * │                            are reachable here. Do not describe KMS as      │
 * │                            production-verified until a real key has        │
 * │                            wrapped and unwrapped a DEK. The GCP mapping    │
 * │                            lives in kms-gcp.mjs.                           │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * WHAT THIS MODULE KNOWS, AND DOES NOT
 * It knows the ENVELOPE only: wrap a data key, unwrap a data key, bind each to
 * its subject. It does NOT know Google, AWS or Vault — the caller injects a client
 * with encrypt() and decrypt(), so no cloud SDK enters this file or the codebase.
 * The Google-specific client is kms-gcp.mjs; changing provider is changing that
 * one file.
 *
 * THE INTERFACE, AND WHY IT CHANGED (BL-2)
 * The previous provider returned KEK PLAINTEXT to the vault, which then sealed the
 * DEK itself. A real KMS never surrenders its master key, so that shape could not
 * be satisfied — the documented mismatch. The provider now wraps and unwraps the
 * per-subject DEK directly:
 *
 *   wrapDataKey(subjectId, dek)       → { version, material }   material is opaque
 *   unwrapDataKey(subjectId, wrapped) → dek
 *
 * `material` is stored verbatim in vault_keys and is meaningless without the KMS.
 * subjectId is bound as additional authenticated data, so a wrapped DEK lifted
 * from one record cannot be unwrapped under another — the same guarantee the
 * vault's own field AAD provides, now extended to the key layer.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { KEY_BYTES, VaultError, dekAad } from "./vault.mjs";

export class KmsError extends VaultError {
  constructor(code, message, cause = null) {
    super(code, message);
    this.name = "KmsError";
    if (cause) this.cause = cause;
  }
}

/**
 * @typedef {object} KmsClient
 * @property {(keyId: string, plaintext: Buffer, aad: Buffer) => Promise<Buffer>} encrypt   returns the wrapped DEK
 * @property {(keyId: string, ciphertext: Buffer, aad: Buffer) => Promise<Buffer>} decrypt  returns the plaintext DEK
 */

/**
 * KMS-backed key provider.
 *
 * @param {KmsClient} client   an injected client (see kms-gcp.mjs for the real one)
 * @param {object} opts
 * @param {string} opts.keyId                          key id for the current version (opaque here; a GCP resource name in production)
 * @param {string} [opts.version]                      logical KEK version recorded with each wrapped DEK
 * @param {Map<string,string>} [opts.keyIdsByVersion]  older versions, so rotation can still unwrap what they wrapped
 */
export function kmsKeyProvider(client, { keyId, version = "v1", keyIdsByVersion = new Map() } = {}) {
  if (!client?.encrypt || !client?.decrypt) {
    throw new KmsError("BAD_CLIENT", "a KMS client must provide encrypt() and decrypt()");
  }
  if (!keyId) throw new KmsError("NO_KEY_ID", "a KMS key identifier is required");

  const resolveKeyId = (v) => (v === version ? keyId : keyIdsByVersion.get(v));
  const aad = (subjectId) => Buffer.from(dekAad(subjectId), "utf8");

  return {
    currentVersion: version,

    /** Wrap a freshly generated per-subject DEK. Called on a subject's first write. */
    async wrapDataKey(subjectId, dek) {
      if (!Buffer.isBuffer(dek) || dek.length !== KEY_BYTES) {
        throw new KmsError("BAD_KEY_LENGTH", `a data key must be ${KEY_BYTES} bytes`);
      }
      try {
        const ciphertext = await client.encrypt(keyId, dek, aad(subjectId));
        if (!Buffer.isBuffer(ciphertext) || ciphertext.length === 0) {
          throw new KmsError("BAD_WRAP", "KMS returned an empty wrapped key");
        }
        return { version, material: ciphertext.toString("base64") };
      } catch (err) {
        if (err instanceof KmsError) throw err;
        // Never leak provider detail: a KMS error can name key resources, projects
        // and principals.
        throw new KmsError("KMS_UNAVAILABLE", "could not wrap the data key", err);
      }
    },

    /** Unwrap a stored DEK; must resolve historical versions during a rotation. */
    async unwrapDataKey(subjectId, wrapped) {
      const id = resolveKeyId(wrapped?.version);
      if (!id) {
        throw new KmsError(
          "UNKNOWN_KEK_VERSION",
          `no KMS key configured for version "${wrapped?.version}" — a rotation may have retired it before every subject was re-wrapped`
        );
      }
      try {
        const dek = await client.decrypt(id, Buffer.from(wrapped.material, "base64"), aad(subjectId));
        if (!Buffer.isBuffer(dek) || dek.length !== KEY_BYTES) {
          throw new KmsError("BAD_KEY_LENGTH", `KMS returned a ${dek?.length}-byte key; ${KEY_BYTES} required`);
        }
        return dek;
      } catch (err) {
        if (err instanceof KmsError) throw err;
        throw new KmsError("KMS_UNAVAILABLE", `could not unwrap the key for version "${wrapped?.version}"`, err);
      }
    },

    /** Liveness probe for readiness checks. Wraps and unwraps a throwaway key. */
    async healthCheck() {
      const probe = randomBytes(KEY_BYTES);
      const wrapped = await this.wrapDataKey("sub_kms_healthcheck", probe);
      const back = await this.unwrapDataKey("sub_kms_healthcheck", wrapped);
      const ok = Buffer.isBuffer(back) && back.length === KEY_BYTES && back.equals(probe);
      probe.fill(0);
      back.fill(0);
      return { ok, version, provider: "kms" };
    },
  };
}

/**
 * A deterministic in-memory stand-in for a KMS, for tests. It performs REAL
 * AES-256-GCM under a per-key master and enforces the AAD binding, so the provider
 * interface, the envelope round trip, rotation and crypto-shredding are genuinely
 * exercised — with real cryptography, not a passthrough. It is NOT Google Cloud
 * KMS, and its presence never implies a real provider was verified. See the box
 * at the top of this file.
 *
 * The master keys live only inside one instance, exactly as a real KMS keeps its
 * KEK inside the HSM: a DEK wrapped by one fakeKmsClient cannot be unwrapped by a
 * different one. Share a single instance across a simulated process restart, the
 * way Cloud KMS persists while our process cycles.
 */
export function fakeKmsClient({ failing = false } = {}) {
  const masters = new Map();
  const masterFor = (keyId) => {
    if (!masters.has(keyId)) masters.set(keyId, randomBytes(KEY_BYTES));
    return masters.get(keyId);
  };
  return {
    async encrypt(keyId, plaintext, aad) {
      if (failing) throw new Error("kms unavailable: encrypt");
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", masterFor(keyId), iv);
      if (aad) cipher.setAAD(aad);
      const body = Buffer.concat([cipher.update(plaintext), cipher.final()]);
      // iv | tag | ciphertext — one opaque blob, the way a real KMS ciphertext is.
      return Buffer.concat([iv, cipher.getAuthTag(), body]);
    },
    async decrypt(keyId, ciphertext, aad) {
      if (failing) throw new Error("kms unavailable: decrypt");
      const master = masters.get(keyId);
      if (!master) throw new Error(`unknown key ${keyId}`);
      const iv = ciphertext.subarray(0, 12);
      const tag = ciphertext.subarray(12, 28);
      const body = ciphertext.subarray(28);
      const decipher = createDecipheriv("aes-256-gcm", master, iv);
      if (aad) decipher.setAAD(aad);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(body), decipher.final()]);
    },
    _masters: masters,
  };
}
