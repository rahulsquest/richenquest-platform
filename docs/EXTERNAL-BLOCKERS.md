# External Blockers — Founder Execution Checklist

**Generated:** 2026-07-23 · **Status:** engineering is not the bottleneck; all remaining work is
gated on external dependencies. Work through in priority order; items marked ∥ can run in parallel.

**Currently granted OAuth scopes** (verified at last token exchange):
`ZohoCRM.modules.ALL · ZohoCRM.settings.ALL · ZohoCRM.users.ALL · ZohoCRM.org.ALL ·
ZohoCliq.Channels.CREATE · ZohoCliq.Webhooks.CREATE`

---

## B1 — Git remote (PRIORITY 1) ∥

**Why:** 42 commits of verified work exist on one laptop with no backup. Every other risk in this
project has a designed mitigation; this one has none. It is also the cheapest to close.

**Do this** — create an **empty private** repo (no README/.gitignore, or the push conflicts):
`https://github.com/new` → name `richenquest-platform` → **Private** → Create.

Then create a token at `https://github.com/settings/tokens` → *Generate new token (classic)* →
scope **`repo`** only → copy it.

Give me: **the repo URL** and **the token** (or paste the token when git prompts — `osxkeychain` is
configured, so it is stored once and never re-entered).

**Time:** 3 min · **Blocks:** nothing — fully parallel
**Then I:** add the remote, push `release/rc-1` and `main`, verify the remote tree matches local,
and confirm no secret is present in any pushed object.

> ⚠️ Do **not** paste the token into a public place. If you prefer, run
> `git remote add origin <url>` yourself and I will push (git will prompt once).

---

## B2 — OAuth re-consent (PRIORITY 2) ∥

**Why:** four capabilities are proven to exist but are scope-gated. Each was verified by control
test (a real endpoint returns `401 OAUTH_SCOPE_MISMATCH`; a non-existent one returns `404`).

| Scope | Unlocks | Evidence |
|---|---|---|
| `ZohoCRM.notifications.ALL` | Event subscriptions (`actions/watch`) — the whole event architecture | Official docs + 401-vs-404 control |
| `ZohoCRM.coql.READ` | Reconciliation sweep — the **correctness authority** | 401-vs-404 control |
| `ZohoCliq.Channels.READ` | Duplicate-safe Cliq provisioning (currently aborts by design) | `CREATE` works, `READ` 401s |

**Do this** — open, sign in, **Accept**:

```
https://accounts.zoho.in/oauth/v2/auth?scope=ZohoCRM.modules.ALL%2CZohoCRM.settings.ALL%2CZohoCRM.users.ALL%2CZohoCRM.org.ALL%2CZohoCRM.notifications.ALL%2CZohoCRM.coql.READ%2CZohoCliq.Channels.CREATE%2CZohoCliq.Channels.READ%2CZohoCliq.Webhooks.CREATE&client_id=1000.JH1MC87GI4P732SWC3IMEHMIOFSU5Q&response_type=code&access_type=offline&prompt=consent&redirect_uri=https%3A%2F%2Frichenquest.com%2Foauth%2Fcallback
```

You land on a 404 page — expected. **Copy the `code=` value from the address bar and send it within
~60 seconds** (grant codes expire in 1–2 minutes; the first attempt already died this way).

**Time:** 2 min · **Blocks:** B3 verification, event provisioning, reconciliation
**Then I:** exchange + patch `.env` (token never printed), run `verify.mjs`, then immediately —
Cliq provisioner becomes functional, reconciliation dry-run runs against **live production data**
(read-only) to measure real record volumes, and `provision-notifications.mjs` becomes runnable the
moment B3 lands.

> **Note:** this replaces the current token. All existing scopes are included above — do not remove
> any, or capability already built will break. **Catalyst scope is deliberately excluded**: I could
> not verify its exact scope string, and one bad scope can reject the entire consent. Catalyst is
> handled in B3 via console instead.

---

## B3 — Zoho Catalyst project (PRIORITY 3)

**Why:** the event architecture needs a **public HTTPS endpoint** for Zoho to POST notifications to,
plus a runtime for the engine and a data store for idempotency keys and checkpoints. Nothing in
Phase 2 can be *deployed* without it. **India region is mandatory** — DPDP residency (ADR-003), and
Catalyst supports IN.

**Do this:**
1. `https://catalyst.zoho.in/` → sign in with the same Zoho account.
2. Create project — name **`titan`** — **choose the India (IN) data centre**. This is permanent.
3. Send me the **project ID** (visible in the console URL / project settings).
4. In a terminal: `npm install -g zcatalyst-cli` then `catalyst login` (opens a browser — your login).

**Time:** 10 min · **Blocked by:** nothing · **Blocks:** all Phase 2 deployment, B2's full value
**Then I:** scaffold the Catalyst project structure in-repo, wire the webhook (Advanced I/O) and
reconciliation (Cron) functions to the engine already built and tested, deploy, obtain the public
function URL, set `ZOHO_NOTIFY_URL`, and run `provision-notifications.mjs` in **dry-run first**.

> Roadmap Stage 1 then begins: one channel in staging, measured for 7 days, converting the four
> **UNKNOWN** delivery guarantees into measured facts. That measurement gates the whole architecture.

---

## B4 — Team emails (PRIORITY 4) ∥

**Why:** CRM has **1 user** (you). 10 licences are free. The roster has **0 of 7 email addresses**,
and a user cannot be created without one. This is a data gap, **not** a platform limitation —
`ZohoCRM.users.ALL` is already granted and working.

**Do this** — send the 6 addresses:

| Name | Role | CRM role (already created) | Email |
|---|---|---|---|
| Harsh | Operations & Data Intelligence Lead | Manager | ? |
| Kunal | Student Success & Visa Ops Lead | Counselor | ? |
| Bibek | University Applications Lead | Operations | ? |
| Kishor | Strategic Partnerships Lead | Manager | ? |
| Tahir | Regional Partnerships / Pakistan Ops | Operations | ? |
| Vishrut | Brand & Creative Design Lead | Marketing | ? |

**Time:** 2 min · **Blocks:** assignment-rule criteria, acceptance A1c and A7
**Then I:** provision all 6 via API with the correct role/profile, verify by read-back, complete the
assignment rule with real assignees, and re-run the release audit — which should then pass **17/17**
(currently 16/17, users being the sole failure).

> ⚠️ Creating users **emails those people** an invitation. Confirm you want that now, or say
> "create but don't invite" and I will check whether Zoho supports deferred invitation first.

---

## B5 — Manual Zoho console work (PRIORITY 5) ∥

Each item below is **proven** un-automatable — see `docs/automation-specs/AM0.4-automation-proofs.md`.

| # | Task | Why manual (proven) | UI path | Time |
|---|---|---|---|---|
| 5a | Delete **6 duplicate Cliq channels** | No delete endpoint exists (`DELETE` → `request_url_invalid`) | Cliq → Channels → open duplicate → ⋮ → Delete | 3 min |
| 5b | Lost Reason validation rule | Zoho API returns **HTTP 500** on a schema-valid payload, v7 **and** v8 | Setup → Modules and Fields → Student Cases → Validation Rules → New Rule: *Lost Reason required when Stage = Closed Lost* | 3 min |
| 5c | Enforce **2FA** | Identity control; no CRM API surface | Admin Panel → Security → Security Policies → enforce 2FA | 2 min |
| 5d | **One** native fallback workflow | Action entities are read-only via API | Setup → Automation → Workflow Rules → Leads / on Create → send acknowledgment email | 5 min |

> **5a is my error** (INC-2): I assumed Cliq rejected duplicate names without verifying, and created
> them. Prevention is now enforced in code, but the cleanup is manual because no API can undo it.
>
> **5d is only ONE rule, not five.** ADR-006 replaces the other four with code. This one is a
> deliberate safety net during migration and is retired at roadmap Stage 5 once delivery is measured.

**Then I:** re-run `verify-crm.mjs` — A5b and A8 move off MANUAL, and acceptance improves materially.

---

## B6 — Business decisions & remaining credentials (PRIORITY 6)

| # | Decision needed | Why it matters | Blocks |
|---|---|---|---|
| 6a | **Confirm v1 assignment routing** — currently `Student → Kunal; Market=Pakistan → Tahir; overflow → Bibek`, marked `CONFIRM` in config | Drives every lead's owner from day one | Handler correctness (config already supports any answer) |
| 6b | **Zoho credit type + expiry** (promotional vs paid wallet) — asked in AM0.1 §1b, never reported | Promotional credits cannot pay renewals; changes how paid services are sequenced | AM0.5 Books/Razorpay planning |
| 6c | **WhatsApp BSP choice** (AiSensy / WATI / Interakt) + Meta business verification | **Longest external lead time in the project — days.** Should have started already | AM0.9, and the WhatsApp half of speed-to-lead |
| 6d | **AI provider + API key** (Anthropic recommended) | Phase 4 AI layer cannot start without it | All of Phase 4 |
| 6e | **Phase 3 scope decision** — Student Dashboard build vs Zoho Creator portal | Determines whether Phase 3 is weeks or months | All of Phase 3 |
| 6f | Confirm engagement models per person (placeholders per OI-1) | Config accuracy only; assignment never depends on it | Nothing |

**Time:** 6c is the only urgent one — **start it today**, it cures in the background.

---

## Recommended single-session order

1. **B2 consent** → send code fast (expires in ~60s) — everything else survives a delay, this doesn't
2. **B1 git** → repo + token (closes the only unmitigated risk)
3. **B4 emails** → paste the six
4. **B3 Catalyst** → project in **IN** region, send project ID
5. **B5 console** → 13 minutes of clicking, any time
6. **B6c WhatsApp BSP** → start today, it's the long pole

**After the checklist is cleared I proceed autonomously without further approval:**
push repo → provision 6 users → complete assignment rule → Cliq cleanup verification →
scaffold + deploy Catalyst functions → provision event subscriptions (dry-run → commit) →
begin roadmap Stage 1 (7-day delivery measurement) → run reconciliation against live data →
full release audit → report at the next genuine external blocker.
