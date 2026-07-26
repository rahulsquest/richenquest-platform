/**
 * Google Cloud KMS — the provider adapter.
 *
 * The ONLY file in the codebase that knows Google exists. It maps the injected
 * client interface kms.mjs depends on — encrypt(keyId, plaintext, aad) and
 * decrypt(keyId, ciphertext, aad) — onto a @google-cloud/kms
 * KeyManagementServiceClient. It imports no SDK: the caller constructs the client
 * and passes it in, so the dependency enters only at deploy time and the rest of
 * the platform stays SDK-free.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ Implemented ✓   Unit verified ✓ (against a Google-shaped fake client)     │
 * │ Production verified ✗ — never run against real Cloud KMS. No credentials  │
 * │ are reachable from this environment. See docs/STATUS.md BL-2.             │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * WIRING (deploy time, once credentials exist):
 *
 *   import { KeyManagementServiceClient } from "@google-cloud/kms";
 *   import { gcpKmsKeyProvider, gcpKmsConfigFromEnv } from "./kms-gcp.mjs";
 *   const provider = gcpKmsKeyProvider(new KeyManagementServiceClient(), gcpKmsConfigFromEnv());
 *   // then: startApi({ pool, keyProvider: provider, ... })
 *
 * WHY THIS SHAPE FITS CLOUD KMS EXACTLY
 * Cloud KMS symmetric encrypt/decrypt is envelope-shaped: the CryptoKey (our KEK)
 * never leaves Google's HSM boundary. We send it a DEK to wrap and a wrapped DEK
 * to unwrap — precisely the encrypt/decrypt the provider needs. subjectId travels
 * as additionalAuthenticatedData, so Google enforces the same per-subject binding
 * our AES-GCM does: a wrapped DEK cannot be moved between records even inside KMS.
 *
 * Authentication is Application Default Credentials — a service account with the
 * `roles/cloudkms.cryptoKeyEncrypterDecrypter` role on the CryptoKey, and nothing
 * more. The service account can wrap and unwrap; it cannot read, disable, destroy
 * or rotate the key, and it never sees the key material.
 */

import { KmsError, kmsKeyProvider } from "./kms.mjs";

/**
 * Adapt a @google-cloud/kms client to the injected-client interface kms.mjs uses.
 * @param {object} kms   a KeyManagementServiceClient (injected; not imported here)
 */
export function gcpKmsClient(kms) {
  if (!kms?.encrypt || !kms?.decrypt) {
    throw new KmsError("BAD_GCP_CLIENT", "a Cloud KMS client must provide encrypt() and decrypt()");
  }

  // The library returns Buffers, but a REST fallback or a JSON transport can hand
  // back base64 strings. Normalise so the provider always receives Buffers.
  const toBuffer = (v) => (v == null ? Buffer.alloc(0) : Buffer.isBuffer(v) ? v : Buffer.from(v, "base64"));

  return {
    async encrypt(keyName, plaintext, aad) {
      const [res] = await kms.encrypt({
        name: keyName,
        plaintext,
        additionalAuthenticatedData: aad,
      });
      const ciphertext = toBuffer(res?.ciphertext);
      if (ciphertext.length === 0) throw new KmsError("BAD_WRAP", "Cloud KMS returned no ciphertext");
      return ciphertext;
    },

    async decrypt(keyName, ciphertext, aad) {
      const [res] = await kms.decrypt({
        name: keyName,
        ciphertext,
        additionalAuthenticatedData: aad,
      });
      return toBuffer(res?.plaintext);
    },
  };
}

/** projects/P/locations/L/keyRings/R/cryptoKeys/K — a Cloud KMS CryptoKey resource. */
export function gcpCryptoKeyName({ projectId, locationId, keyRing, key }) {
  for (const [field, value] of Object.entries({ projectId, locationId, keyRing, key })) {
    if (!value) throw new KmsError("GCP_CONFIG_INCOMPLETE", `missing Cloud KMS config: ${field}`);
  }
  return `projects/${projectId}/locations/${locationId}/keyRings/${keyRing}/cryptoKeys/${key}`;
}

/**
 * Build the full production provider from a Cloud KMS client and config. Lives
 * here, not in kms.mjs, because only this layer knows a logical "version" maps to
 * a GCP CryptoKey resource name.
 *
 * @param {object} kms  injected KeyManagementServiceClient
 * @param {object} cfg
 * @param {string} cfg.projectId
 * @param {string} cfg.locationId
 * @param {string} cfg.keyRing
 * @param {Record<string,string>} cfg.keys  version → CryptoKey short name, e.g. { v1: "vault-kek" }
 * @param {string} [cfg.version]            the current version (default "v1")
 */
export function gcpKmsKeyProvider(kms, { projectId, locationId, keyRing, keys, version = "v1" } = {}) {
  if (!keys || !keys[version]) {
    throw new KmsError("GCP_CONFIG_INCOMPLETE", `no Cloud KMS key configured for version "${version}"`);
  }
  const nameOf = (key) => gcpCryptoKeyName({ projectId, locationId, keyRing, key });
  const keyIdsByVersion = new Map(Object.entries(keys).map(([v, key]) => [v, nameOf(key)]));
  return kmsKeyProvider(gcpKmsClient(kms), { keyId: nameOf(keys[version]), version, keyIdsByVersion });
}

/**
 * Read and validate Cloud KMS configuration from the environment. Does NOT
 * construct the SDK client — that stays a deploy-time concern — so this is safe to
 * import and call anywhere.
 *
 *   GCP_PROJECT_ID, GCP_KMS_LOCATION, GCP_KMS_KEYRING, GCP_KMS_KEY
 *   RECORD_VAULT_KEK_VERSION           (default "v1")
 *   GCP_KMS_KEY_V1, GCP_KMS_KEY_V2 …   older versions, so rotation can unwrap them
 */
export function gcpKmsConfigFromEnv(env = process.env) {
  const version = env.RECORD_VAULT_KEK_VERSION ?? "v1";
  const keys = {};
  if (env.GCP_KMS_KEY) keys[version] = env.GCP_KMS_KEY;
  for (const [name, value] of Object.entries(env)) {
    const match = /^GCP_KMS_KEY_(V\d+)$/.exec(name);
    if (match && value) keys[match[1].toLowerCase()] = value;
  }

  const cfg = {
    projectId: env.GCP_PROJECT_ID,
    locationId: env.GCP_KMS_LOCATION,
    keyRing: env.GCP_KMS_KEYRING,
    keys,
    version,
  };

  const missing = ["projectId", "locationId", "keyRing"].filter((field) => !cfg[field]);
  if (!keys[version]) missing.push(`GCP_KMS_KEY (for version ${version})`);
  if (missing.length) {
    throw new KmsError("GCP_CONFIG_INCOMPLETE", `Cloud KMS config incomplete: ${missing.join(", ")}`);
  }
  return cfg;
}
