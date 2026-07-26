# Admin Setup Guide — Internal Release v1

Everything needed to take this repository from "tests pass locally" to "the team
is working in it". Written for the founder, in the order the steps actually
unblock each other.

> **Credential rule.** Nothing in this guide asks you to paste a secret into a
> chat. Every secret is created by you and stored either in local `.env` or as a
> Catalyst environment variable. `.env` is gitignored and must stay that way.

**Status of this guide:** every step below is written from the code that will
consume it. **Step 3 (CRM provisioning) was executed against the live org on
2026-07-26** — 35 of 35 fields verified present. Steps 1, 2 and 4–6 have **not**
been executed: no database, KMS key or Catalyst environment exists yet. Where a
step cannot be verified until it runs, that is stated rather than implied.

---

## 0. What you are standing up

| Component | What it is | Where it runs |
|---|---|---|
| **PostgreSQL (Neon)** | The only system of record. Career Record event log + identity vault | Neon |
| **Career Record API** | The student's permanent record — 7 routes | Catalyst |
| **Operations API** | Founder Operations + Collaboration + Student Operations — 20 routes | Catalyst |
| **Website + consoles** | Public site, student portal (`/dashboard/`), staff console (`/console/`) | Catalyst |
| **Zoho CRM** | The operational store: leads, cases, partners, tasks | Zoho |
| **Google Cloud KMS** | Wraps each student's data key | GCP |

Two APIs, **one signing secret**. That is deliberate: one login serves both.

---

## 1. Neon PostgreSQL

1. Create a Neon project. **Region: choose the one nearest your users** — for
   India/Nepal that is Singapore or Mumbai if offered.
2. PostgreSQL version must be **16 or newer**. Startup refuses anything older,
   loudly, rather than running on a version whose behaviour the schema does not
   assume.
3. Copy the **pooled** connection string (Connection Details → Pooled connection).
4. Put it in local `.env` as `DATABASE_URL`. Append `?sslmode=require` if absent.

```bash
node db/migrate.mjs status   # what would change — run this FIRST
node db/migrate.mjs up       # apply; advisory-locked and idempotent
```

Expect two migrations: `001_event_log`, `002_identity_vault`.

**If `status` shows drift**, stop. It means an applied migration was edited after
the fact, and the database and the repository no longer agree about the schema.
Do not "fix" it by re-running.

### Least-privilege role

The application must not own its tables, or it can grant itself `UPDATE` on the
append-only log. Run once, as the Neon owner:

```sql
CREATE ROLE record_writer LOGIN PASSWORD '<generated>';

-- The log: append-only BY PRIVILEGE. This is the guarantee, not a convention.
GRANT SELECT, INSERT ON events, digests, schema_migrations TO record_writer;
REVOKE UPDATE, DELETE, TRUNCATE ON events, digests FROM record_writer;

-- The vault: DELETE on vault_keys IS the erasure. Different table, different rule.
GRANT SELECT, INSERT, UPDATE, DELETE ON vault_keys, vault_fields TO record_writer;
```

Then point `DATABASE_URL` at `record_writer`, and keep the owner credentials for
migrations only.

---

## 2. Google Cloud KMS

```bash
gcloud kms keyrings create richenquest-vault --location asia-south1
gcloud kms keys create vault-kek \
  --location asia-south1 --keyring richenquest-vault --purpose encryption

gcloud iam service-accounts create richenquest-platform
gcloud kms keys add-iam-policy-binding vault-kek \
  --location asia-south1 --keyring richenquest-vault \
  --member serviceAccount:richenquest-platform@<PROJECT>.iam.gserviceaccount.com \
  --role roles/cloudkms.cryptoKeyEncrypterDecrypter
```

That role is the whole grant: the service account can wrap and unwrap data keys.
It **cannot** read, disable, destroy or rotate the key, and it never sees key
material.

Then set `GCP_PROJECT_ID`, `GCP_KMS_LOCATION`, `GCP_KMS_KEYRING`, `GCP_KMS_KEY`
and `RECORD_VAULT_PROVIDER=kms`.

> **Not yet verified.** The adapter is unit- and integration-tested against a
> Google-shaped client doing real AES-256-GCM, but has never called Google's
> actual service. The first live wrap/unwrap is a step in the Release Checklist,
> not something this guide can claim already works.

**Losing this key destroys every student's identity data, irreversibly.** That is
the design — it is what makes erasure real — so the key's own backup and access
policy is the single most consequential decision in this setup.

---

## 3. Zoho CRM field provisioning

The Operations platform writes fields that must exist first. `config/crm-schema.json`
declares all of them; the provisioner creates them.

```bash
node --env-file=.env functions/zoho/provision-crm.mjs          # dry run — read it
node --env-file=.env functions/zoho/provision-crm.mjs --commit
```

> **Already done.** Executed with founder approval on 2026-07-26 against tenant
> `richenquest` (DC `in`): `{"created":0,"skipped":35,"manual":1,"failed":0}`.
> Re-running is safe — it skips what exists — but nothing below is outstanding.

This creates, if absent:

| Module | Fields |
|---|---|
| **Accounts** | Partnership Stage, Partnership Type, Agreement Status, Agreement Signed On, Agreement Expires On, Accreditation, **Campus List**, International Office Contact, International Office Email |
| **Products** | Degree Level, Intakes, Application Deadline, Duration, **Tuition Currency** |
| **Deals** | Career Record Id *(plus the existing Student Case fields)* |
| **Leads** | *(unchanged — already provisioned)* |

**`Career Record Id` is the join.** A Student Case without it opens with an empty
history: the workspace shows the commercial frame and says so plainly, rather
than pretending there is nothing to show.

Four items remain **console-only** — the API cannot create them reliably. They are
listed in `docs/EXTERNAL-BLOCKERS.md` B5 with the exact UI path for each.

---

## 4. Catalyst environment variables

Set on the Catalyst function, never in a file:

```
DATABASE_URL, RECORD_TOKEN_SECRET, RECORD_VAULT_PROVIDER=kms,
GCP_PROJECT_ID, GCP_KMS_LOCATION, GCP_KMS_KEYRING, GCP_KMS_KEY,
CORS_ALLOWED_ORIGINS, NODE_ENV=production,
ZOHO_* (as already configured for Titan)
```

`CORS_ALLOWED_ORIGINS` must list **both** the site origin and the console origin,
comma-separated. An empty value is refused in production — an API holding personal
data must name its callers.

---

## 5. Activating the consoles

Both ship **dormant**. They render an explicit "not connected" state and issue no
requests until an origin is configured. Neither ever falls back to sample data.

Edit `website/src/data/platform.json`:

```json
{
  "record_api": { "base_url": "https://api.richenquest.com" },
  "ops_api":    { "base_url": "https://api.richenquest.com" }
}
```

Then `node website/build.mjs` and deploy. No code change activates them.

---

## 6. Issuing access

There is **no password anywhere in this system**, by design — no password to lose,
and none for anyone else to steal. Access is a short-lived signed link.

```bash
# A student
node --env-file=.env functions/record/scripts/issue-student-link.mjs \
  --subject sub_ab12cd34 --site https://www.richenquest.com

# A guardian (the ward is always --subject)
node --env-file=.env functions/record/scripts/issue-student-link.mjs \
  --role guardian --actor usr_parent01 --subject sub_ab12cd34 \
  --site https://www.richenquest.com
```

The printed link **is a credential for one person's record**. Send it to that
person over a channel you trust. Do not paste it into a ticket, a chat channel or
a commit. It expires on its own; that is the point of a short TTL.

### Adding the team

Each person needs a token carrying their `ops_role`. The roles already exist and
are already enforced — see the Internal User Guide for what each may do. Adding
someone is issuing a token, not an engineering change.

---

## 7. Verification

```bash
npm --prefix db/test test        # 107 tests incl. the cross-module smoke suite
node --test "functions/**/*.test.mjs"
node website/build.mjs && node scripts/claims-guard.mjs && node scripts/check-links.mjs
```

Then work the **Release Checklist** (`docs/RELEASE-CHECKLIST.md`) against the
deployed environment. Local green is necessary and not sufficient: it proves the
code, not the deployment.
