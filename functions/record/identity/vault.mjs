/**
 * Identity Vault — PII storage with per-subject envelope encryption.
 *
 * Architecture: docs/25-career-record-architecture.md §4, §11.4.
 *
 * WHY THIS EXISTS
 * The event log is append-only and must stay verifiable forever. DPDP and GDPR
 * grant erasure. Those requirements are in direct conflict, and the resolution is
 * structural: no PII ever enters an event. It lives here, encrypted under a key
 * that belongs to one subject only. Erasure destroys that key — the PII becomes
 * unrecoverable while the hash chain stays intact and provable.
 *
 * KEY HIERARCHY
 *   KEK (master, versioned)  →  DEK (one per subject, random)  →  record ciphertext
 * Only the wrapped DEK is stored. Destroying it is the erasure.
 *
 * SECURITY PROPERTIES
 *  · AES-256-GCM everywhere: confidentiality plus tamper detection.
 *  · subject_id is bound in as AAD, so a ciphertext cannot be moved between
 *    subjects to make one person's data appear in another's record.
 *  · The field name is bound in as AAD too, so an encrypted "email" cannot be
 *    swapped into the "legal_name" slot.
 *  · KEK is versioned, so rotation is possible without rewriting history.
 *  · Erasure is verified by attempting a read afterwards, not assumed.
 *
 * VERIFICATION STATUS: unit-tested. NOT integration-tested — the production KEK
 * must come from a real KMS (§11.3); the env-var provider here is for development
 * and is refused when NODE_ENV=production.
 */

import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_BYTES = 12; // GCM standard; never reused with the same key
const KEY_BYTES = 32;

export class VaultError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = "VaultError";
  }
}

/** Thrown when a subject's data key has been destroyed. This is a success state. */
export class SubjectErased extends VaultError {
  constructor(subjectId) {
    super(
      "SUBJECT_ERASED",
      `${subjectId} has been erased: the data key was destroyed, so this PII is unrecoverable by design. ` +
        `The event log for this subject remains intact and verifiable.`
    );
    this.subjectId = subjectId;
  }
}

/* ------------------------------------------------------- key providers --- */

/**
 * Development KEK provider. Refuses to run in production: a master key in an
 * environment variable is a key one `printenv` away from disclosure, and the
 * whole erasure guarantee rests on that key being unavailable to an attacker.
 */
export function envKeyProvider(env = process.env) {
  const raw = env.RECORD_VAULT_KEK;
  if (env.NODE_ENV === "production") {
    throw new VaultError(
      "INSECURE_KEY_PROVIDER",
      "envKeyProvider must not be used in production — supply a KMS-backed provider (§11.3)"
    );
  }
  if (!raw) throw new VaultError("NO_KEK", "RECORD_VAULT_KEK is not set");
  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_BYTES) {
    throw new VaultError("BAD_KEK", `RECORD_VAULT_KEK must be ${KEY_BYTES} bytes base64-encoded, got ${key.length}`);
  }
  return {
    currentVersion: env.RECORD_VAULT_KEK_VERSION ?? "v1",
    async unwrapKey(version) {
      if (version !== (env.RECORD_VAULT_KEK_VERSION ?? "v1")) {
        throw new VaultError("UNKNOWN_KEK_VERSION", `no KEK available for version "${version}"`);
      }
      return key;
    },
    async wrapKey() {
      return key;
    },
  };
}

/* ----------------------------------------------------------- primitives --- */

function seal(plaintext, key, aad) {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return { iv: iv.toString("base64"), ct: ct.toString("base64"), tag: cipher.getAuthTag().toString("base64") };
}

function open({ iv, ct, tag }, key, aad) {
  const decipher = createDecipheriv(ALGO, key, Buffer.from(iv, "base64"));
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64")), decipher.final()]).toString("utf8");
}

/** AAD binds a ciphertext to exactly one subject and one field. */
const aadFor = (subjectId, field) => `richenquest.vault.v1|${subjectId}|${field}`;

/* --------------------------------------------------------------- store --- */

/**
 * @typedef {{
 *   putKey(subjectId: string, wrapped: object): Promise<void>,
 *   getKey(subjectId: string): Promise<object|null>,
 *   destroyKey(subjectId: string): Promise<boolean>,
 *   putField(subjectId: string, field: string, blob: object): Promise<void>,
 *   getField(subjectId: string, field: string): Promise<object|null>,
 *   listFields(subjectId: string): Promise<string[]>
 * }} VaultStore
 */

export function memoryVaultStore() {
  const keys = new Map();
  const fields = new Map(); // `${subject}|${field}` → blob
  return {
    async putKey(s, w) { keys.set(s, w); },
    async getKey(s) { return keys.get(s) ?? null; },
    async destroyKey(s) { return keys.delete(s); },
    async putField(s, f, b) { fields.set(`${s}|${f}`, b); },
    async getField(s, f) { return fields.get(`${s}|${f}`) ?? null; },
    async listFields(s) {
      return [...fields.keys()].filter((k) => k.startsWith(`${s}|`)).map((k) => k.slice(s.length + 1)).sort();
    },
    _keys: keys,
    _fields: fields,
  };
}

/* --------------------------------------------------------------- vault --- */

export function identityVault(store, keyProvider) {
  /** Fetch and unwrap a subject's DEK, creating one on first write. */
  async function dek(subjectId, { create = false } = {}) {
    const wrapped = await store.getKey(subjectId);
    if (!wrapped) {
      if (!create) throw new SubjectErased(subjectId);
      const kek = await keyProvider.wrapKey();
      const fresh = randomBytes(KEY_BYTES);
      const sealed = seal(fresh.toString("base64"), kek, aadFor(subjectId, "__dek__"));
      await store.putKey(subjectId, { version: keyProvider.currentVersion, ...sealed });
      return fresh;
    }
    const kek = await keyProvider.unwrapKey(wrapped.version);
    return Buffer.from(open(wrapped, kek, aadFor(subjectId, "__dek__")), "base64");
  }

  return {
    /** Write one PII field. Values are JSON-encoded so types survive. */
    async put(subjectId, field, value) {
      if (!subjectId || !field) throw new VaultError("BAD_ARGS", "subjectId and field are required");
      const key = await dek(subjectId, { create: true });
      await store.putField(subjectId, field, seal(JSON.stringify(value), key, aadFor(subjectId, field)));
    },

    async putAll(subjectId, record) {
      for (const [field, value] of Object.entries(record)) await this.put(subjectId, field, value);
    },

    /**
     * Read one field. Throws SubjectErased if the key is gone — deliberately not
     * a silent null, because "erased" and "never existed" must not look alike to
     * a caller deciding whether to write.
     */
    async get(subjectId, field) {
      const key = await dek(subjectId);
      const blob = await store.getField(subjectId, field);
      if (!blob) return undefined;
      try {
        return JSON.parse(open(blob, key, aadFor(subjectId, field)));
      } catch (err) {
        // GCM auth failure means the ciphertext, AAD or key does not match —
        // tampering, a field/subject mix-up, or the wrong KEK version.
        throw new VaultError(
          "DECRYPT_FAILED",
          `cannot decrypt ${subjectId}.${field}: ${err.message}. Ciphertext may have been altered or moved.`
        );
      }
    },

    async getAll(subjectId) {
      const out = {};
      for (const field of await store.listFields(subjectId)) out[field] = await this.get(subjectId, field);
      return out;
    },

    async exists(subjectId) {
      return (await store.getKey(subjectId)) !== null;
    },

    /**
     * CRYPTO-SHREDDING. Destroys the subject's data key. Ciphertexts may remain
     * (in backups, in cold storage, in a replica we do not control) and become
     * permanently undecryptable — which is the point: erasure must not depend on
     * reaching every copy.
     *
     * Verified, not assumed: reads back afterwards and raises if PII is still
     * recoverable, so a store that silently ignored destroyKey cannot pass.
     */
    async erase(subjectId, { reason = "subject request" } = {}) {
      const fieldsBefore = await store.listFields(subjectId);
      const existed = await store.destroyKey(subjectId);
      if (!existed) throw new SubjectErased(subjectId);

      for (const field of fieldsBefore) {
        let recovered = false;
        try {
          await this.get(subjectId, field);
          recovered = true;
        } catch (err) {
          if (!(err instanceof SubjectErased) && err.code !== "DECRYPT_FAILED") throw err;
        }
        if (recovered) {
          throw new VaultError(
            "ERASURE_INCOMPLETE",
            `erasure failed: ${subjectId}.${field} is still readable after key destruction`
          );
        }
      }

      return {
        subject_id: subjectId,
        erased_at: new Date().toISOString(),
        fields_shredded: fieldsBefore.length,
        reason,
        note:
          "Data key destroyed. Remaining ciphertext — including in backups — is permanently " +
          "undecryptable. The event log for this subject is unchanged and still verifiable.",
      };
    },

    /**
     * Re-wrap a subject's DEK under the current KEK. Rotation touches only the
     * wrapped key, never the field ciphertexts, so it is O(subjects) rather than
     * O(data) and can run without downtime.
     */
    async rotateKek(subjectId) {
      const wrapped = await store.getKey(subjectId);
      if (!wrapped) throw new SubjectErased(subjectId);
      if (wrapped.version === keyProvider.currentVersion) return { rotated: false, version: wrapped.version };

      const oldKek = await keyProvider.unwrapKey(wrapped.version);
      const plainDek = open(wrapped, oldKek, aadFor(subjectId, "__dek__"));
      const newKek = await keyProvider.wrapKey();
      await store.putKey(subjectId, {
        version: keyProvider.currentVersion,
        ...seal(plainDek, newKek, aadFor(subjectId, "__dek__")),
      });
      return { rotated: true, from: wrapped.version, to: keyProvider.currentVersion };
    },
  };
}

/** Constant-time compare for any secret material handled alongside the vault. */
export function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export { KEY_BYTES, ALGO };
