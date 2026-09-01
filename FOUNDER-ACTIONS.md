# FOUNDER-ACTIONS.md

**Only genuinely unavoidable human actions.** Routine technical work has been executed
autonomously and does not appear here. Last verified against live systems 2026-09-01.

Each row states what unlocks the moment it is done, so nothing here needs interpreting.

---

## A. Founder action

### A1 — Zoho CRM application OAuth credentials
| | |
|---|---|
| **Owner** | Founder (Zoho account owner) |
| **Exact action** | At `api-console.zoho.in` create a **Self Client**. Grant exactly four scopes: `ZohoCRM.modules.leads.ALL`, `ZohoCRM.modules.contacts.ALL`, `ZohoCRM.settings.modules.READ`, `ZohoCRM.functions.execute.CREATE`. Generate a refresh token. Set `ZOHO_CRM_CLIENT_ID`, `ZOHO_CRM_CLIENT_SECRET`, `ZOHO_CRM_REFRESH_TOKEN` and a 32-byte `SESSION_SECRET` in the AppSail environment. |
| **Dependency** | none |
| **Success condition** | `GET /api/health` returns **200 HEALTHY** with `crm.reachable: true` |
| **Unlocks** | Backend deploy · real student E2E · matching · roadmap · report · the entire pilot |

No further scope is required. The code makes **no direct Accounts REST call** — opportunities are
read inside Deluge, server-side. DC variables need no setting; defaults are already
`accounts.zoho.in` / `zohoapis.in`. `ZOHO_CRM_REDIRECT_URI` is needed only during the one-time
code exchange, not at runtime.

### A2 — Catalyst custom-domain mapping
| | |
|---|---|
| **Owner** | Founder (Catalyst console; the CLI exposes no domain command) |
| **Exact action** | Project `53691000000016002` → Slate app `rq-site` (`8769000000005006`) → repoint the `www.richenquest.com` mapping to deployment `8769000000005008`, or purge its cache. |
| **Dependency** | none |
| **Success condition** | `curl -s https://www.richenquest.com/ \| grep -o "assets/index-[A-Za-z0-9_-]*\.js"` no longer returns `index-CxODATZa.js` |
| **Unlocks** | Six shipped website commits reaching customers · full production verification |

### ~~A3 — Choose one canonical company email~~ — resolved, was miscategorized
Already decided by the founder 2026-08-23: see `EMAIL-IDENTITY-DECISION.md`. `support@` is
student support and DPDP/legal communication — the address of record in the privacy policy,
T&C, refund policy and every client template. `official@` is university partnerships. This
was never a pending founder decision; three passes on 2026-08-27/28 wrongly re-flagged it as
one. The only actual gap was that the website's default (`admissions@`, which predates the
decision) had never been updated to match — fixed in code 2026-08-28
(`client/src/config/environment.js`, `.env.example`).

**Still open, and genuinely a Zoho Mail admin action, not code:** `official@` should forward to
`support@` so the four pending university-verification replies aren't missed by the grievance
officer named in the privacy policy.

### A4 — Confirm the package prices
| | |
|---|---|
| **Owner** | Founder |
| **Exact action** | Set a real published price for each of the five service codes in `backend/functions/shared/pricing.js`. |
| **Dependency** | A5, B1 |
| **Success condition** | `POST /api/payments/invoice` stops returning `PRICE_NOT_CONFIGURED` |
| **Unlocks** | Quoting · invoicing |

All five are deliberately `null`. The code refuses to invoice rather than guess, and ignores any
client-supplied amount, currency or discount.

**A naming mismatch to resolve at the same time, not before:** `pricing.js`'s five codes
(`admission_support`, `visa_support`, `documentation_support`, `scholarship_support`,
`full_service`) do not match the five package codes named in `revenue/00-PRICING-ASSUMPTION.md`
and `gtm/BUSINESS-MODEL-V2.md` (`RQ-GUID`, `RQ-STD`, `RQ-COMP`, `RQ-VISA`, `RQ-ITALY`) — and those
docs mark their own prices **ASSUMED**, not confirmed. Whichever set of codes and prices is
actually confirmed should be what `pricing.js` carries; renaming the code to match an assumed
figure would be its own invention.

### A5 — Take Zoho Books out of test mode
| | |
|---|---|
| **Owner** | Founder (account owner) |
| **Exact action** | Move the connected Books org to production. |
| **Dependency** | none |
| **Success condition** | `GET /api/payments` returns `configured: true` |
| **Unlocks** | Invoicing |

### A6 — Add real mentors with checkable credential URLs
| | |
|---|---|
| **Owner** | Founder |
| **Exact action** | Add real people to the **Vendors** module with verifiable credential URLs. |
| **Dependency** | none |
| **Success condition** | `matchMentor` returns at least one verified mentor |
| **Unlocks** | Mentor matching |

Vendors is currently **empty (0)**. Fabricating a mentor is the single most damaging invention
available to this product.

### A7 — Reply-handling for the university verification emails
| | |
|---|---|
| **Owner** | Founder |
| **Exact action** | Answer the universities when they reply. Sent 2026-08-23. |
| **Dependency** | the universities |
| **Success condition** | tuition · living cost · deadline · source URL · verified date all recorded |
| **Unlocks** | rankable 2 → 5 |

### A8 — Identify one ambiguous CRM lead
| | |
|---|---|
| **Owner** | Founder |
| **Exact action** | Confirm whether Lead `1292318000001187003` (`tech@richenquest.com`, "api26") is a real record or a setup artifact. |
| **Dependency** | none |
| **Success condition** | Kept deliberately, or deleted |
| **Unlocks** | A provably clean CRM |

Two unambiguous synthetic leads were deleted 2026-08-27. This one was preserved because its
address is real and deliverable — evidence did not prove it synthetic.

### A9 — Create the Catalyst Data Store tables — HARD BLOCKER, before the first real student
| | |
|---|---|
| **Owner** | Founder (Catalyst console — Data Store) |
| **Exact action** | Create the tables the backend mirrors to: `Leads`, `Users`, `Students`, `Documents`, `Notifications`, `IntegrationEvents`. |
| **Dependency** | AppSail incident resolved |
| **Success condition** | A lead submitted before an instance restart is still readable after it |
| **Unlocks** | Any durable record at all |

Found during the 2026-09-01 silent-failure audit. **No Data Store tables exist**, so
`catalystTable()` fails its existence probe and every write degrades to in-memory only. A lead,
a signup, or a document record therefore lives in process memory and is **destroyed by any
restart, redeploy, or scale-down** — and AppSail restarts on every deploy.

Until this is done, the only durable record of a student enquiry is the application log. The code
now writes unsynced leads there deliberately for that reason, but a log is a recovery mechanism,
not storage. **Do not run the pilot on it.**

### A10 — Configure WorkDrive and the Flow webhook, or accept two features are off
| | |
|---|---|
| **Owner** | Founder |
| **Exact action** | Set `ZOHO_WORKDRIVE_ROOT_FOLDER_ID` for document upload, and the Flow webhook URL for `PASSWORD_RESET_REQUESTED`. |
| **Dependency** | A1 |
| **Success condition** | A document upload returns 201, and a reset request logs `DISPATCHED` |
| **Unlocks** | Document upload · self-service password reset |

Both are currently unconfigured, and both used to report success while doing nothing — fixed
2026-09-01. Document upload now returns **503** rather than pretending, so with WorkDrive unset
the feature is **visibly off, not silently broken**. Password reset likewise sends no mail; a
student who forgets their password today has **no self-service route back in** and must be helped
by hand. Watch the log line `PASSWORD RESET EMAIL NOT DELIVERED` until this is configured.

---

## B. Legal / CA action

### B1 — Advocate review of the legal pack
| | |
|---|---|
| **Owner** | Advocate, instructed by founder |
| **Exact action** | Review and approve `legal/LEGAL-PACK.md`, including the consent statements. Fill `{{REG_NO}}`, `{{GSTIN}}`, `{{DATE}}`. Correct the entity name — the pack says "RICHENQUEST PVT LTD"; the Zoho org record says **RICHENQUEST PRIVATE LIMITED**. |
| **Dependency** | none |
| **Success condition** | Signed-off wording, no placeholders |
| **Unlocks** | **C1 (consent implementation)** · accepting real student data · accepting money |

### B2 — GST / tax treatment
| | |
|---|---|
| **Owner** | CA |
| **Exact action** | Determine GST applicability and registration status for the service. |
| **Dependency** | A4 |
| **Success condition** | A stated treatment that invoices can carry |
| **Unlocks** | Compliant invoicing |

---

## C. Code action — blocked behind approval, not behind engineering

### C1 — Consent capture
| | |
|---|---|
| **Owner** | Claude, **after B1** |
| **Exact action** | Wire consent capture using the **approved** wording only. Three touch points, all identified: signup UI (`client/src/pages/public/Signup.jsx`), signup handler (`backend/functions/auth/index.js`), and the Contact create payload (`backend/functions/shared/zoho/crm.js`, ~line 150). |
| **Dependency** | **B1 — approved legal wording** |
| **Success condition** | No Contact is created without `Consent_Given_On`; `Consent_Version` records which policy version was agreed |
| **Unlocks** | Lawfully accepting real student data · pilot student #1 |

**The storage already exists.** `Consent_Given_On`, `Consent_Version`, `Parent_Reporting_Consent`,
`Parent_Name` and `Parent_Phone` are all live fields on the Contacts module, verified 2026-08-27.
`DATA-MODEL.md` still marks them missing — that documentation is stale; the fields were created.

**What is genuinely missing is only the write.** No file in `backend/functions` references any
consent field. Today signup creates a Users row and a CRM Contact carrying name, email and phone
**with no consent record**, which is the DPDP exposure `DATA-MODEL.md` logged as M1/P0.

One existing property is already correct and must be preserved: consent fields are **absent from
the `EDITABLE` allowlist** in `intelligence/index.js`, so a student cannot back-date or forge
their own consent through the profile route.

**The approval boundary is the wording, not the plumbing.** The legal pack contains candidate
consent statements, but the pack is unapproved and still carries the wrong entity name, so
implementing against it now would bake in text that has to be replaced. No consent code has been
written for this reason.

---

## D. Executed autonomously — deliberately not founder work

Domain research and verification · CRM schema changes · Deluge deployment · engine testing ·
regression · data-quality reporting · staleness sweep · sending the verification emails ·
synthetic-record cleanup · the website content release · **the git push blocker (resolved
2026-08-27: the remote was HTTPS with no token; switched to the already-working SSH remote and
pushed all 41 commits)**.

---

## E. Not now — gated by real inventory, not by effort

| Item | The gate |
|---|---|
| Mentor marketplace | 0 verified mentors. Stop rule 4 forbids recommending unverified ones |
| University / partner dashboard | 0 signed partners |
| Country intelligence pages | 2 verified opportunities cannot support them without thin content |
| Subscription billing | Static inventory; nothing recurring to sell |
| AI matching · new scoring dimensions | Requires data on both the student and opportunity side |

---

## Evidence-based inventory — live, 2026-08-27

| Measure | Count |
|---|---|
| Fully rankable opportunities (all 5 gate fields) | **2** — Pécs, Debrecen |
| University programmes in CRM | 21 |
| Service vendors | 2 |
| With verified living cost | 14 |
| With verified source URL | 6 |
| With verified date | 7 |
| With verified tuition | 4 |
| With a recorded deadline | 2 |
| Leads | 1 (ambiguous, see A8) |
| Contacts | 0 |
| Mentors (Vendors) | 0 |
| Signed partners | 0 |
| Pilot students | 0 |

Both rankable deadlines are in the future (Pécs 2026-09-30, Debrecen 2026-11-01), so nothing
expired can be presented as actionable.

---

## Out of scope
Project Titan / `origin/release/rc-1` — untouched.
