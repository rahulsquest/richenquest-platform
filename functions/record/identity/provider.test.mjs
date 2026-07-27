/**
 * Key-provider selection. Offline: the KMS branch uses the same Google-shaped
 * fake as kms-gcp.test.mjs, so nothing here reaches a network or an SDK.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

import { selectKeyProvider, describeKeyProvider, PROVIDERS, DEFAULT_PROVIDER } from "./provider.mjs";
import { KEY_BYTES } from "./vault.mjs";

const KEK = randomBytes(KEY_BYTES).toString("base64");
const devEnv = (over = {}) => ({ RECORD_VAULT_KEK: KEK, NODE_ENV: "development", ...over });

/** Minimal Cloud KMS shape: encrypt/decrypt returning [response]. */
const fakeGcpClient = () => ({
  async encrypt({ plaintext }) {
    return [{ ciphertext: Buffer.concat([Buffer.from("wrapped:"), plaintext]) }];
  },
  async decrypt({ ciphertext }) {
    return [{ plaintext: Buffer.from(ciphertext).subarray("wrapped:".length) }];
  },
});

const gcpEnv = (over = {}) => ({
  RECORD_VAULT_PROVIDER: "kms",
  GCP_PROJECT_ID: "rq-test",
  GCP_KMS_LOCATION: "asia-southeast1",
  GCP_KMS_KEYRING: "richenquest-vault",
  GCP_KMS_KEY: "vault-kek",
  ...over,
});

/* ─────────────────────────────────────────────────────────────── defaults ── */

test("provider: defaults to env when RECORD_VAULT_PROVIDER is unset", () => {
  assert.equal(DEFAULT_PROVIDER, "env");
  const p = selectKeyProvider({ env: devEnv() });
  assert.equal(typeof p.wrapDataKey, "function");
  assert.equal(typeof p.unwrapDataKey, "function");
  assert.equal(p.currentVersion, "v1");
});

test("provider: an explicit env provider is the same as the default", () => {
  const a = selectKeyProvider({ env: devEnv() });
  const b = selectKeyProvider({ env: devEnv({ RECORD_VAULT_PROVIDER: "env" }) });
  assert.equal(a.currentVersion, b.currentVersion);
});

/* ──────────────────────────────────────────────────────────────── refusals ── */

test("provider: an unknown provider name is refused, and the message names the valid ones", () => {
  assert.throws(
    () => selectKeyProvider({ env: devEnv({ RECORD_VAULT_PROVIDER: "vault" }) }),
    (e) => e.code === "UNKNOWN_VAULT_PROVIDER" && /env, kms/.test(e.message)
  );
});

test("provider: kms without an injected client is refused at selection, not at first use", () => {
  // The failure must happen at startup. A provider that builds and then throws
  // on the first student's data key is a deployment that looks healthy and is not.
  assert.throws(
    () => selectKeyProvider({ env: gcpEnv() }),
    (e) => e.code === "KMS_CLIENT_REQUIRED"
  );
});

test("provider: the env provider still refuses NODE_ENV=production", () => {
  // The production gate is preserved: selection does not become a way around it.
  assert.throws(
    () => selectKeyProvider({ env: devEnv({ NODE_ENV: "production" }) }),
    (e) => e.code === "INSECURE_KEY_PROVIDER"
  );
});

test("provider: incomplete GCP configuration is refused even with a client", () => {
  assert.throws(
    () => selectKeyProvider({ env: gcpEnv({ GCP_KMS_KEYRING: "" }), kmsClient: fakeGcpClient() }),
    (e) => e.code === "GCP_CONFIG_INCOMPLETE"
  );
});

/* ──────────────────────────────────────────────────────────── kms selection ── */

test("provider: kms with an injected client builds a working provider", async () => {
  const p = selectKeyProvider({ env: gcpEnv(), kmsClient: fakeGcpClient() });
  assert.equal(p.currentVersion, "v1");

  const dek = randomBytes(KEY_BYTES);
  const wrapped = await p.wrapDataKey("sub_sel01", dek);
  assert.equal(wrapped.version, "v1");
  assert.ok(typeof wrapped.material === "string" && wrapped.material.length > 0);

  const back = await p.unwrapDataKey("sub_sel01", wrapped);
  assert.deepEqual(back, dek, "the DEK must survive the round trip through the selected provider");
});

test("provider: kms honours a non-default KEK version", () => {
  const p = selectKeyProvider({
    env: gcpEnv({ RECORD_VAULT_KEK_VERSION: "v2", GCP_KMS_KEY: "vault-kek-2" }),
    kmsClient: fakeGcpClient(),
  });
  assert.equal(p.currentVersion, "v2");
});

/* ───────────────────────────────────────────────────────────────── describe ── */

test("provider: describeKeyProvider reports configuration without building anything", () => {
  // Callable with no credentials and no client — that is the point.
  assert.deepEqual(describeKeyProvider({}), { provider: "env", known: true, productionSafe: false });
  assert.deepEqual(describeKeyProvider({ RECORD_VAULT_PROVIDER: "kms" }), {
    provider: "kms", known: true, productionSafe: true,
  });
  assert.deepEqual(describeKeyProvider({ RECORD_VAULT_PROVIDER: "nope" }), {
    provider: "nope", known: false, productionSafe: true,
  });
});

test("provider: PROVIDERS is the single list both selection and description use", () => {
  for (const name of PROVIDERS) assert.equal(describeKeyProvider({ RECORD_VAULT_PROVIDER: name }).known, true);
});
