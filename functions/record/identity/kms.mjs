/**
 * KEK providers — the key hierarchy's root.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ VERIFICATION STATUS: ABSTRACTION ONLY. NOT INTEGRATION-TESTED.           │
 * │                                                                          │
 * │ kmsKeyProvider() below has been exercised against a fake client in unit   │
 * │ tests. It has NOT been run against AWS KMS, GCP KMS, Vault or any other   │
 * │ real provider, because none is reachable from this environment. Do not    │
 * │ describe KMS as integrated until a real provider has been verified.       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * WHY THIS SHAPE
 * The vault needs one operation from a KMS: decrypt a wrapped data key. It does
 * NOT need the KMS to encrypt or store record data. That keeps the blast radius
 * small (a KMS outage stops new-key creation and cold reads, not the whole API,
 * once caching is in play) and keeps this module free of any cloud SDK — the
 * caller injects a client with two methods.
 *
 * ENVELOPE DIRECTION
 *   generateDataKey() → { plaintext, wrapped }   used when a subject is created
 *   decrypt(wrapped)  → plaintext                used on every vault read
 *
 * Every mainstream KMS offers exactly this pair, so no adapter is forced into a
 * shape its provider does not have.
 */

import { randomBytes, timingSafeEqual } from "node:crypto";
import { KEY_BYTES, VaultError } from "./vault.mjs";

/**
 * @typedef {object} KmsClient
 * @property {(keyId: string) => Promise<{plaintext: Buffer, wrapped: Buffer}>} generateDataKey
 * @property {(wrapped: Buffer, keyId: string) => Promise<Buffer>} decrypt
 */

export class KmsError extends VaultError {
  constructor(code, message, cause = null) {
    super(code, message);
    this.name = "KmsError";
    if (cause) this.cause = cause;
  }
}

/**
 * KMS-backed KEK provider.
 *
 * @param {KmsClient} client
 * @param {object} opts
 * @param {string} opts.keyId                 provider key identifier (ARN, resource name, path)
 * @param {string} opts.version               logical version recorded with each wrapped DEK
 * @param {Map<string,string>} [opts.keyIdsByVersion]  older versions, for rotation
 * @param {number} [opts.cacheTtlMs]          how long an unwrapped KEK may be held in memory
 */
export function kmsKeyProvider(client, { keyId, version = "v1", keyIdsByVersion = new Map(), cacheTtlMs = 300_000 } = {}) {
  if (!client?.generateDataKey || !client?.decrypt) {
    throw new KmsError("BAD_CLIENT", "a KMS client must provide generateDataKey() and decrypt()");
  }
  if (!keyId) throw new KmsError("NO_KEY_ID", "a KMS key identifier is required");

  const resolveKeyId = (v) => (v === version ? keyId : keyIdsByVersion.get(v));

  /**
   * Short-lived cache of unwrapped keys.
   *
   * A KMS call on every vault read is both slow and expensive, and an outage
   * would take the API down. The TTL is deliberately short: the whole erasure
   * guarantee is that destroying key material makes data unrecoverable, and a key
   * cached indefinitely in a long-lived process weakens that. Five minutes is the
   * compromise, and erase() should be followed by a process cycle in a
   * multi-instance deployment — recorded, not assumed.
   */
  const cache = new Map();
  const cached = (k) => {
    const hit = cache.get(k);
    if (!hit) return null;
    if (Date.now() > hit.expires) {
      hit.key.fill(0); // best-effort scrub
      cache.delete(k);
      return null;
    }
    return hit.key;
  };

  return {
    get currentVersion() {
      return version;
    },

    /** Called when a subject's DEK is created or re-wrapped. */
    async wrapKey() {
      const hit = cached(version);
      if (hit) return hit;
      try {
        const { plaintext } = await client.generateDataKey(keyId);
        if (!Buffer.isBuffer(plaintext) || plaintext.length !== KEY_BYTES) {
          throw new KmsError("BAD_KEY_LENGTH", `KMS returned a ${plaintext?.length}-byte key; ${KEY_BYTES} required`);
        }
        cache.set(version, { key: plaintext, expires: Date.now() + cacheTtlMs });
        return plaintext;
      } catch (err) {
        if (err instanceof KmsError) throw err;
        throw new KmsError("KMS_UNAVAILABLE", `could not obtain a data key: ${err.message}`, err);
      }
    },

    /** Called on every vault read; must resolve historical versions during rotation. */
    async unwrapKey(v) {
      const hit = cached(v);
      if (hit) return hit;

      const id = resolveKeyId(v);
      if (!id) {
        throw new KmsError(
          "UNKNOWN_KEK_VERSION",
          `no KMS key configured for version "${v}" — a rotation removed it before all subjects were re-wrapped`
        );
      }
      try {
        const key = await client.decrypt(Buffer.alloc(0), id);
        if (!Buffer.isBuffer(key) || key.length !== KEY_BYTES) {
          throw new KmsError("BAD_KEY_LENGTH", `KMS returned a ${key?.length}-byte key; ${KEY_BYTES} required`);
        }
        cache.set(v, { key, expires: Date.now() + cacheTtlMs });
        return key;
      } catch (err) {
        if (err instanceof KmsError) throw err;
        // Never leak provider detail: a KMS error message can name key ARNs,
        // accounts and principals.
        throw new KmsError("KMS_UNAVAILABLE", `could not unwrap the key for version "${v}"`, err);
      }
    },

    /** Drop cached key material. Call after an erasure or on a security event. */
    purgeCache() {
      for (const { key } of cache.values()) key.fill(0);
      const n = cache.size;
      cache.clear();
      return n;
    },

    /** Liveness probe for readiness checks. Does not expose the key. */
    async healthCheck() {
      const key = await this.wrapKey();
      return { ok: Buffer.isBuffer(key) && key.length === KEY_BYTES, version, provider: "kms" };
    },
  };
}

/**
 * Adapter notes for the three providers we are likely to use. Written so that
 * wiring one is mechanical rather than a design exercise. NONE has been run.
 *
 *  AWS KMS
 *    generateDataKey: kms.generateDataKey({ KeyId, KeySpec: "AES_256" })
 *                     → { Plaintext, CiphertextBlob }
 *    decrypt:         kms.decrypt({ CiphertextBlob, KeyId })  → { Plaintext }
 *    Note: store CiphertextBlob as the wrapped key; AWS needs it on every decrypt.
 *
 *  GCP KMS
 *    encrypt/decrypt on a CryptoKey; generate the DEK locally with randomBytes
 *    and wrap it via encrypt(), because GCP has no generateDataKey equivalent.
 *
 *  HashiCorp Vault (transit)
 *    transit/datakey/plaintext/<key> → { plaintext, ciphertext }
 *    transit/decrypt/<key>           → plaintext
 *
 * IMPORTANT SHAPE MISMATCH, recorded rather than papered over:
 * unwrapKey(version) above receives only a version, not the per-subject wrapped
 * key, because identityVault currently unwraps the KEK and then opens the DEK
 * itself. A real KMS decrypts the WRAPPED DEK, which is per subject. Wiring a
 * real provider therefore requires threading the wrapped key through
 * unwrapKey(version, wrappedDek) — a small change to vault.mjs and this
 * interface, and one that must be made when the first real provider is
 * integrated, NOT guessed at now. This is why the module is marked
 * abstraction-only.
 */

/**
 * A deterministic in-memory KMS for tests. Behaves like a provider without being
 * one: it exists so the vault's provider interface is exercised, never to imply
 * that a real KMS has been verified.
 */
export function fakeKmsClient({ failing = false } = {}) {
  const keys = new Map();
  return {
    async generateDataKey(keyId) {
      if (failing) throw new Error("kms unavailable");
      const plaintext = keys.get(keyId) ?? randomBytes(KEY_BYTES);
      keys.set(keyId, plaintext);
      return { plaintext, wrapped: Buffer.concat([Buffer.from("wrapped:"), plaintext]) };
    },
    async decrypt(_wrapped, keyId) {
      if (failing) throw new Error("kms unavailable");
      const key = keys.get(keyId);
      if (!key) throw new Error(`unknown key ${keyId}`);
      return key;
    },
    _keys: keys,
  };
}

export { timingSafeEqual };
