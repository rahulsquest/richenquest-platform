/**
 * Key-provider selection — the one place configuration becomes a provider.
 *
 * The vault takes a provider; it does not choose one. Until now nothing chose
 * either: `startApi()` accepted `keyProvider` as a parameter and had no caller,
 * so the only composition that existed was the development server's, which
 * hard-codes an ephemeral env provider. This module is the seam that a real
 * deployment needs, and it is deliberately the ONLY place that reads
 * RECORD_VAULT_PROVIDER.
 *
 * NO CLOUD SDK ENTERS HERE. The KMS branch takes an injected client, exactly as
 * kms-gcp.mjs does, so this file — and everything that imports it — stays
 * dependency-free and testable offline. The caller constructs the client at
 * deploy time; that is the only step that needs @google-cloud/kms present.
 *
 * WHY A FACTORY RATHER THAN A CONDITIONAL AT THE CALL SITE
 * A conditional at the call site is one conditional per entrypoint, and they
 * drift. There will be at least three entrypoints (the server, the link issuer,
 * a future migration job), and a provider mismatch between them is the kind of
 * bug that surfaces as "this record's identity cannot be read" months later.
 */

import { envKeyProvider, VaultError } from "./vault.mjs";
import { gcpKmsKeyProvider, gcpKmsConfigFromEnv } from "./kms-gcp.mjs";

/** Providers this deployment knows how to build. */
export const PROVIDERS = Object.freeze(["env", "kms"]);

/** The default, and the only one that needs no external service. */
export const DEFAULT_PROVIDER = "env";

/**
 * Build the vault's key provider from configuration.
 *
 * @param {object} [opts]
 * @param {object} [opts.env]        environment to read (default process.env)
 * @param {object} [opts.kmsClient]  a Cloud KMS client, REQUIRED when the
 *   provider is "kms". Injected rather than imported so this module never
 *   depends on a cloud SDK. In production the caller passes
 *   `new KeyManagementServiceClient()`; tests pass a Google-shaped fake.
 * @returns {{currentVersion: string, wrapDataKey: Function, unwrapDataKey: Function}}
 */
export function selectKeyProvider({ env = process.env, kmsClient = null } = {}) {
  const name = env.RECORD_VAULT_PROVIDER ?? DEFAULT_PROVIDER;

  if (!PROVIDERS.includes(name)) {
    throw new VaultError(
      "UNKNOWN_VAULT_PROVIDER",
      `RECORD_VAULT_PROVIDER="${name}" is not a provider this build knows (${PROVIDERS.join(", ")})`
    );
  }

  if (name === "env") {
    // envKeyProvider refuses NODE_ENV=production on its own, and readConfig()
    // refuses it again before this is ever reached. Both checks are kept: one
    // guards the provider, the other guards the deployment, and neither is
    // reachable from the other's call path.
    return envKeyProvider(env);
  }

  // name === "kms"
  if (!kmsClient) {
    throw new VaultError(
      "KMS_CLIENT_REQUIRED",
      'RECORD_VAULT_PROVIDER="kms" needs an injected Cloud KMS client; ' +
        "construct KeyManagementServiceClient at the entrypoint and pass it as kmsClient"
    );
  }
  return gcpKmsKeyProvider(kmsClient, gcpKmsConfigFromEnv(env));
}

/**
 * What a deployment would use, without building it. For startup logging and
 * diagnostics: it answers "which provider is configured" without requiring the
 * credentials or the client that actually building it would.
 */
export function describeKeyProvider(env = process.env) {
  const name = env.RECORD_VAULT_PROVIDER ?? DEFAULT_PROVIDER;
  return {
    provider: name,
    known: PROVIDERS.includes(name),
    productionSafe: name !== "env",
  };
}
