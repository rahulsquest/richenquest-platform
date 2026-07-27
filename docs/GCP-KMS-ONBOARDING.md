# Google Cloud KMS — Production Onboarding (BL-2 / checklist E4)

Everything needed to take the Career Record vault from `RECORD_VAULT_PROVIDER=env`
to a real Cloud KMS key, in the order the steps unblock each other.

> **Credential rule.** No step here asks you to paste a secret into a chat. Keys
> are created by you and never leave Google; the service-account credential is
> stored as a Catalyst environment variable, never in a file in this repository.

**Status:** nothing below has been executed. The code is complete and tested
against a Google-shaped fake; **no call has ever been made to Google's service.**
That first live wrap/unwrap is E4, and it is what closes BL-2.

**Region: `asia-southeast1` (Singapore)** — co-located with the Neon database so
every wrap and unwrap stays intra-region. The read path of an export is one
unwrap per field; a cross-region hop would sit on it.

---

## Scope

**This document covers** standing up the Google Cloud resources the vault needs,
deploying with `RECORD_VAULT_PROVIDER=kms`, and performing checklist item **E4** —
the one live wrap/unwrap that closes BL-2.

**It does not cover** writing or changing application code (none is required —
the integration shipped in `e67e669`, `d550b40`, `ba65c15`), provisioning
PostgreSQL (BL-1, done), the Zoho CRM (done), or Catalyst project creation
itself (checklist C8).

**Audience:** the founder, operating a terminal with `gcloud` installed and
owner rights on a Google Cloud billing account. Every step is an operator action
unless listed under "Verified by implementation" below.

---

## Prerequisites

Have all of these before starting. A missing one turns a 20-minute task into a
half-finished deployment.

| | Prerequisite | Check |
|---|---|---|
| ☐ | `gcloud` CLI installed and authenticated | `gcloud version && gcloud auth list` |
| ☐ | A Google Cloud **billing account** you can link | `gcloud billing accounts list` |
| ☐ | Owner or Project Creator on the organisation | — |
| ☐ | **BL-1 complete** — Neon reachable, migrations applied | `node --env-file=.env db/migrate.mjs status` → `0 pending, 0 drift` |
| ☐ | **C4 complete** — `record_writer` role exists with least privilege | §C4 of the Release Checklist |
| ☐ | Catalyst project exists and you can set env vars (**C8**) | Catalyst console |
| ☐ | `RECORD_TOKEN_SECRET` generated, ≥32 bytes (**C7**) | `openssl rand -hex 32` |
| ☐ | `CORS_ALLOWED_ORIGINS` decided — site + console origins (**C9**) | — |
| ☐ | A decision on **who may destroy the key** | §11 |

**Known gap:** `DATABASE_URL_APP` in local `.env` carries one stray character
(64 valid hex + 1). It blocks anything connecting as `record_writer` and should
be corrected before you rely on that credential.

---

## Verified by implementation, versus operator actions

The split matters: half the risk in this document is already retired, and the
half that is not is entirely infrastructure.

### Verified by implementation — no action, do not re-litigate

| Property | Evidence |
|---|---|
| KMS envelope wrap/unwrap round-trips a DEK | `kms.test.mjs`, real AES-256-GCM through the provider interface |
| `subjectId` bound as AAD — a wrapped DEK cannot move between records | `kms.test.mjs` |
| Google client-shape mapping (Buffer/base64, request shape, resource name) | `kms-gcp.test.mjs` |
| KEK rotation re-wraps without touching field ciphertext | `kms.test.mjs` |
| Crypto-shredding leaves ciphertext permanently undecryptable | `vault.integration.test.mjs`, real PostgreSQL |
| Identity survives a restart through the KMS envelope over HTTP | `kms-api.integration.test.mjs` |
| Failure opacity — provider detail never leaks to callers | `kms.test.mjs` |
| Provider selected from configuration; `kms` without a client refused at startup | `provider.test.mjs`, `server.test.mjs` |
| `envKeyProvider` refused when `NODE_ENV=production` | two independent gates, both tested |
| The SDK is loaded by the deploy shell only | `catalyst.test.mjs` walks every `.mjs` and asserts none imports it |
| The bundle carries migrations and the disclosure register | `catalyst.test.mjs` |
| No schema change, no API contract change | migration 002 stores an opaque blob by design |

### Operator actions — yours, and unverifiable until performed

| Action | Section |
|---|---|
| Create project, link billing, enable APIs | §1 |
| Create key ring and CryptoKey in `asia-southeast1` | §2 |
| Create the service account and bind **one** IAM role | §3 |
| Configure ADC; place credentials on Catalyst | §4 |
| Prove `encrypt`/`decrypt` **as the service account** | §5 |
| Set Catalyst environment variables | §6 |
| Deploy — env provider first, then KMS | §7 |
| Perform E4 and record the evidence | §8 |
| Decide the key's backup and destruction policy | §11 |

**Nothing in the first table needs proving again. Nothing in the second can be
proven from this repository.**

---

## 0. What you are creating

| Resource | Name | Why |
|---|---|---|
| Project | *(yours)* → `GCP_PROJECT_ID` | Billing and IAM boundary |
| Key ring | `richenquest-vault` | Container; **cannot be deleted, ever** |
| CryptoKey | `vault-kek` | Wraps every student's data key |
| Service account | `richenquest-platform` | The only identity that may wrap/unwrap |
| IAM binding | `roles/cloudkms.cryptoKeyEncrypterDecrypter` **on the key** | The whole grant |

The service account can wrap and unwrap. It **cannot** read, disable, destroy or
rotate the key, and it never sees key material — the KEK stays inside Google's
HSM boundary. That is what makes `envKeyProvider` unacceptable in production and
this acceptable.

---

## 1. Project, billing, APIs

```bash
# Authenticate as yourself
gcloud auth login

# Create the project (or reuse one)
gcloud projects create richenquest-platform --name="RichenQuest Platform"
gcloud config set project richenquest-platform

# Billing is REQUIRED — Cloud KMS refuses to create keys on an unbilled project.
gcloud billing accounts list
gcloud billing projects link richenquest-platform --billing-account=<BILLING_ACCOUNT_ID>

# Enable the two APIs used
gcloud services enable cloudkms.googleapis.com iam.googleapis.com
```

**Cost:** a key version is ~$0.06/month; operations are ~$0.03 per 10,000. At
current volume this is cents per month. It is not free, and an unbilled project
fails at key creation, not at deploy.

## 2. Key ring and key

```bash
gcloud kms keyrings create richenquest-vault --location asia-southeast1

gcloud kms keys create vault-kek \
  --location asia-southeast1 \
  --keyring richenquest-vault \
  --purpose encryption \
  --protection-level software
```

`--purpose encryption` is a symmetric ENCRYPT_DECRYPT key — the only kind the
envelope in `kms.mjs` uses.

**Do not enable automatic rotation yet.** Rotation is supported by the code
(`keyIdsByVersion` retains retired versions so old DEKs still unwrap), but a
rotation that retires a version before every subject is re-wrapped makes those
subjects unreadable. Turn it on deliberately, with the re-wrap queue
(`subjectsNeedingRotation()`) run to completion first.

## 3. Service account and least-privilege IAM

```bash
gcloud iam service-accounts create richenquest-platform \
  --display-name="RichenQuest Career Record API"

# The ONLY grant. Scoped to the key — not the key ring, not the project.
gcloud kms keys add-iam-policy-binding vault-kek \
  --location asia-southeast1 \
  --keyring richenquest-vault \
  --member "serviceAccount:richenquest-platform@richenquest-platform.iam.gserviceaccount.com" \
  --role roles/cloudkms.cryptoKeyEncrypterDecrypter
```

**Do not grant `roles/cloudkms.admin`, `roles/owner`, or any project-level KMS
role to this account.** An identity that can destroy the key can destroy every
student's identity data irreversibly.

## 4. Credentials (ADC)

The code authenticates with Application Default Credentials — it constructs
`new KeyManagementServiceClient()` with no explicit credential.

**Locally** (only if you want to test against the real key from your machine):

```bash
gcloud auth application-default login
```

**On Catalyst**, create a key file, paste its contents into a Catalyst
environment variable, and delete the local copy:

```bash
gcloud iam service-accounts keys create /tmp/rq-kms.json \
  --iam-account richenquest-platform@richenquest-platform.iam.gserviceaccount.com

# → paste the file's contents into GOOGLE_APPLICATION_CREDENTIALS_JSON in the
#   Catalyst console, then:
shred -u /tmp/rq-kms.json 2>/dev/null || rm -P /tmp/rq-kms.json
```

The file is a **private key**. It must never enter git, a ticket, or a chat.
`.gitignore` already covers `*.pem` and `.env`, but a stray `.json` in the repo
root is not covered — do not put it there.

## 5. Verify the infrastructure before deploying

```bash
# The key exists and is ENABLED
gcloud kms keys describe vault-kek \
  --location asia-southeast1 --keyring richenquest-vault

# The binding is present and scoped to the key
gcloud kms keys get-iam-policy vault-kek \
  --location asia-southeast1 --keyring richenquest-vault

# Prove the service account can actually wrap and unwrap — BEFORE the app tries.
gcloud auth activate-service-account \
  --key-file=/tmp/rq-kms.json    # or run as the SA another way
echo -n "probe" | gcloud kms encrypt \
  --location asia-southeast1 --keyring richenquest-vault --key vault-kek \
  --plaintext-file=- --ciphertext-file=/tmp/probe.enc
gcloud kms decrypt \
  --location asia-southeast1 --keyring richenquest-vault --key vault-kek \
  --ciphertext-file=/tmp/probe.enc --plaintext-file=-    # must print: probe
rm -f /tmp/probe.enc
```

If this round trip fails, **stop**. Every failure below becomes ambiguous once
the application is in the picture.

---

## 6. Catalyst environment variables

Exactly what the code reads. `gcpKmsConfigFromEnv()` validates the GCP block and
refuses to start if any of the first four is missing.

| Variable | Value | Required |
|---|---|---|
| `RECORD_VAULT_PROVIDER` | `kms` | yes — anything else means the SDK is never loaded |
| `GCP_PROJECT_ID` | `richenquest-platform` | yes |
| `GCP_KMS_LOCATION` | `asia-southeast1` | yes |
| `GCP_KMS_KEYRING` | `richenquest-vault` | yes |
| `GCP_KMS_KEY` | `vault-kek` | yes |
| `RECORD_VAULT_KEK_VERSION` | `v1` | no — defaults to `v1` |
| `GCP_KMS_KEY_V1` … | retired key names | only after a rotation |
| `GOOGLE_APPLICATION_CREDENTIALS_JSON` | the SA key contents | yes on Catalyst |

Plus the platform variables already required: `DATABASE_URL`,
`RECORD_TOKEN_SECRET`, `CORS_ALLOWED_ORIGINS`, `NODE_ENV=production`, and
**`RUN_MIGRATIONS_ON_START=false`** — migrations are a deploy step, not something
the first request performs.

---

## 7. Deployment checklist, in execution order

1. ☐ Project created, billing linked, `cloudkms` + `iam` APIs enabled
2. ☐ Key ring `richenquest-vault` in `asia-southeast1`
3. ☐ CryptoKey `vault-kek`, purpose encryption, **rotation off**
4. ☐ Service account `richenquest-platform` created
5. ☐ `cryptoKeyEncrypterDecrypter` bound **on the key only**
6. ☐ `gcloud kms encrypt`/`decrypt` round trip passes **as the service account**
7. ☐ SA key created, pasted into Catalyst, local copy destroyed
8. ☐ Migrations applied from the repo: `node --env-file=.env db/migrate.mjs up`
9. ☐ **Deploy first with `RECORD_VAULT_PROVIDER=env` to Development** — proves the
      Catalyst Advanced I/O transport, which has never served a request
10. ☐ Only then set `RECORD_VAULT_PROVIDER=kms` and redeploy
11. ☐ Run E4 (§8)
12. ☐ Record evidence in `RELEASE-CHECKLIST.md` E4 and `DECISIONS.md` D25

Step 9 is not optional caution. Switching transport and key provider at once
means a failure has two candidate causes and you will not know which.

---

## 8. E4 verification procedure

### 8.1 Startup

```bash
catalyst logs --function record-api | head -40
```

Expect, in order:

```
{"msg":"startup.key_provider","provider":"kms","known":true,"productionSafe":true}
✓ startup: PostgreSQL 18.x
✓ startup: schema constraints verified (log + vault)
{"msg":"startup.listening","port":…,"env":"production"}
```

`provider:"kms"` is the line that proves configuration took effect. If it says
`env`, the variable did not reach the function and **nothing below is a KMS test.**

### 8.2 First wrap

Create a Career Record carrying identity — the write path that calls
`wrapDataKey()` for the first time:

```bash
curl -sS -X POST "$API/v1/career-records" \
  -H "authorization: Bearer $STAFF_TOKEN" -H "content-type: application/json" \
  -d '{"subject_id":"sub_e4verify01","identity":{"date_of_birth":"2004-03-19"}}'
```

201 means Google wrapped a DEK. That single response closes the code half of BL-2.

### 8.3 First unwrap

```bash
curl -sS -X POST "$API/v1/career-records/sub_e4verify01/export" \
  -H "authorization: Bearer $STAFF_TOKEN" | head -40
```

The date of birth coming back proves `unwrapDataKey()` reached Google and
returned the same DEK.

### 8.4 Inspect `vault_keys`

```sql
SELECT subject_id, version, length(material) AS material_len, created_at
  FROM vault_keys WHERE subject_id = 'sub_e4verify01';
```

- `version` = `v1`
- `material` is a **Cloud KMS ciphertext** — base64, typically 100+ characters.
  The dev provider writes a JSON `{iv,ct,tag}` triple instead; if you see JSON,
  the env provider is still active and E4 has not happened.

```sql
SELECT field, length(ct) FROM vault_fields WHERE subject_id = 'sub_e4verify01';
```

Field ciphertext exists and is unreadable without the DEK.

### 8.5 Erase, and crypto-shredding

```bash
curl -sS -X POST "$API/v1/career-records/sub_e4verify01/erase" \
  -H "authorization: Bearer $STAFF_TOKEN"
```

`erase()` purges any cached DEK, destroys the key row, then **re-reads every
field to prove it can no longer be decrypted** — it raises `ERASURE_INCOMPLETE`
rather than reporting a success it has not verified.

Then confirm in SQL:

```sql
SELECT count(*) FROM vault_keys   WHERE subject_id = 'sub_e4verify01';  -- 0
SELECT count(*) FROM vault_fields WHERE subject_id = 'sub_e4verify01';  -- > 0
```

**Both numbers matter.** The key is gone; the ciphertext deliberately remains and
is now permanently undecryptable. That is crypto-shredding: erasure that does not
depend on reaching every backup, replica and cold copy.

A read must now fail:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' \
  "$API/v1/career-records/sub_e4verify01" -H "authorization: Bearer $STAFF_TOKEN"
# 404 — an erased subject is concealed, not reported as an error
```

---

## 9. Rollback limits — the one-way door

**Rollback is reverting `RECORD_VAULT_PROVIDER` to `env` and redeploying.**

```
  §1 – §7   infrastructure, deploy, startup        ROLLBACK SAFE
  §8.1      startup shows provider:"kms"           ROLLBACK SAFE  ← last safe point
  ─────────────────────────────────────────────────────────────────
  §8.2      FIRST SUCCESSFUL WRAP                  ROLLBACK IMPOSSIBLE
  §8.3+     unwrap, inspect, erase                 ROLLBACK IMPOSSIBLE
```

**The boundary is a single API call: the first `POST /v1/career-records` that
carries identity.** Not the deploy, not the config change, not startup.

### Before the boundary — rollback is free

Everything through §8.1 is reversible at no cost. Creating a key, deploying, and
booting with `provider:"kms"` write nothing that depends on Google. Revert the
variable, redeploy, done.

**Check before you cross:**

```sql
SELECT count(*) FROM vault_keys;   -- 0 → still free
```

Verified **0 rows** against the live Neon database on 2026-07-28. No DEK has
ever been wrapped by Cloud KMS.

### After the boundary — rollback is impossible, permanently

Once §8.2 succeeds, `vault_keys.material` holds a ciphertext **only Cloud KMS
can unwrap**. `envKeyProvider` cannot read it — not "would need migrating",
cannot. Reverting `RECORD_VAULT_PROVIDER` makes that subject's identity
unreadable exactly as if the key had been destroyed.

There is no undo, no fallback, and no dual-provider mode. The event log is
unaffected (it holds no PII), but names, dates of birth and documents are gone.

**Moving off KMS afterwards is a migration, not a rollback:** decrypt every DEK
*through KMS*, re-wrap under the new provider, verify every subject, and only
then retire the key. **No tooling for this exists today**, and writing it is a
project, not a step.

### The decision to make before §8.2

Cross the boundary only when you accept that Cloud KMS is now a hard dependency
of reading any student's identity — an outage stops identity reads, and losing
the key ends them. That is the design: it is what makes erasure real. But it is a
decision, and §8.2 is where it becomes irreversible.

---

## 10. Operator runbook

Every code below is one the application actually emits.

### `GCP_CONFIG_INCOMPLETE` — missing configuration
*"Cloud KMS config incomplete: projectId, locationId…"*
One of `GCP_PROJECT_ID`, `GCP_KMS_LOCATION`, `GCP_KMS_KEYRING`, `GCP_KMS_KEY` is
unset. **Fails at startup, before any connection** — nothing is half-configured.
Fix the Catalyst variable and redeploy.

### `KMS_CLIENT_REQUIRED` — provider is `kms`, no client
The SDK was not constructed. Means `RECORD_VAULT_PROVIDER=kms` reached the
config but the deploy shell did not load `@google-cloud/kms` — check the package
is in the bundle's `package.json` and `npm install` ran in the function directory.

### Missing credentials — ADC not found
Surfaces as `KMS_UNAVAILABLE` on the first vault write, **not at startup**: the
client constructs lazily and only authenticates on first use. Check
`GOOGLE_APPLICATION_CREDENTIALS_JSON` is set on the function. Verify with the
`gcloud kms encrypt` probe in §5 as the service account.

### IAM denied — binding missing or wrong scope
Also `KMS_UNAVAILABLE`; the provider deliberately does **not** surface Google's
message, which can name projects, key resources and principals. Diagnose outside
the app:
```bash
gcloud kms keys get-iam-policy vault-kek --location asia-southeast1 --keyring richenquest-vault
```
Expect exactly one binding, `cryptoKeyEncrypterDecrypter`, on the service account.

### `KMS_UNAVAILABLE` — Google unreachable or refusing
Covers outage, network, quota and permission alike, by design — failures are
opaque so an attacker learns nothing from them. **Impact: identity reads and
writes stop; the event log is unaffected** (it holds no PII and needs no key).
Check GCP status, then the §5 probe. The optional DEK cache (default **off**)
would mask brief blips at the cost of holding a plaintext key in memory — a
separate decision with an erasure trade-off.

### Wrong region
The resource name is built from `GCP_KMS_LOCATION`; a mismatch means the key does
not exist at that path and every call fails as `KMS_UNAVAILABLE`. Confirm the key
is in `asia-southeast1`:
```bash
gcloud kms keys list --location asia-southeast1 --keyring richenquest-vault
```
A key ring in the wrong region cannot be moved. Create a new one in the correct
region — and if any DEK was already wrapped under the wrong-region key, **that
key must stay alive** until those subjects are re-wrapped.

### Key disabled
`gcloud kms keys versions disable` makes wrap and unwrap fail while leaving the
material intact. Recoverable:
```bash
gcloud kms keys versions enable 1 --key vault-kek \
  --location asia-southeast1 --keyring richenquest-vault
```
Identity is unreadable while disabled; nothing is lost.

### Destroyed key — **unrecoverable**
`gcloud kms keys versions destroy` schedules destruction after a 24-hour delay.
**Within 24 hours** it can be restored:
```bash
gcloud kms keys versions restore 1 --key vault-kek \
  --location asia-southeast1 --keyring richenquest-vault
```
**After destruction completes, every student's identity data is permanently
unrecoverable.** The event log survives; names, dates of birth and documents do
not. This is the design — it is what makes erasure real — and it is why the
service account holds no role that can destroy anything.

### Quota exceeded
Cloud KMS allows roughly 60,000 cryptographic requests/minute per region; current
volume is orders of magnitude below it. If it were ever approached, the cause
would be an export loop — one unwrap per field with the cache off. Enabling the
short-TTL DEK cache collapses an N-field export to one unwrap.

### `UNKNOWN_KEK_VERSION`
A stored DEK names a KEK version with no configured key — a rotation retired a
version before every subject was re-wrapped. Restore the retired key name via
`GCP_KMS_KEY_V<n>` and run the re-wrap queue to completion before retiring it
again.

---

## 11. Go / no-go for production

**Go only if every line is ticked.**

| | Check |
|---|---|
| ☐ | `gcloud kms encrypt`/`decrypt` round trip passes **as the service account** |
| ☐ | IAM shows exactly one binding, `cryptoKeyEncrypterDecrypter`, on the key |
| ☐ | No identity holds `cloudkms.admin` or `owner` on this project |
| ☐ | Key rotation is **off** |
| ☐ | Key destruction protection understood and accepted by the founder |
| ☐ | Credentials set on Catalyst; no key file remains on any laptop |
| ☐ | `RUN_MIGRATIONS_ON_START=false`; migrations already applied |
| ☐ | Advanced I/O transport proven with `RECORD_VAULT_PROVIDER=env` first |
| ☐ | Startup log shows `provider:"kms"` |
| ☐ | E4 §8.2–8.5 complete: wrap, unwrap, `vault_keys` inspected, erase verified |
| ☐ | **Understood that rollback ends at the first successful wrap** |
| ☐ | Key backup/access policy decided — the most consequential setting here |

**No-go if any of these is true:** the §5 probe fails; the service account holds
more than the one role; rotation is enabled; the transport has not been proven
separately; or nobody has decided who may destroy the key.

---

## What this document does not cover

- **Key rotation in practice.** Supported by the code, no runbook written, and
  `subjectsNeedingRotation()` has never been run against a real key.
- **Multi-region or DR for KMS.** A single-region key is a single point of
  failure for identity reads; accepted deliberately at current scale.
- **DPDP posture.** Database and key ring are both in Singapore, so student PII
  sits outside India. That is a compliance judgement, not a technical one.
