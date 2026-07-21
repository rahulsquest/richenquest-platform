# Automation Implementation Log

Living tracker for executing the automation backlog (File 16) against the frozen architecture
(Files 16, 17, 18). Separate from `RELEASE-LOG.md` (website RC-1). **Architecture is frozen; changes
may emerge only from proven implementation gaps, recorded in §4.**

## 1. Per-item lifecycle (File 16 §1)
`Spec (Me) → Build (Owner) → Test vs success criteria → add failure-recovery + #ops-alerts heartbeat →
Founder sign-off → Live → Watch 1 week → next item.` Build-ready specs: `docs/automation-specs/`.

## 2. STATE SYNC — 2026-07-22 (corrected against founder-verified reality + independent checks)

**Confirmed facts:** Zoho One active · org exists · Zoho Mail configured · business domain connected ·
legacy Zoho Sites website live (server `ZGS`) · OAuth app `rahulsquest` exists · `functions/zoho`
OAuth adapter built (File 14). **Independent check (this session):** `dig` shows `mx.zoho.in` + Zoho
SPF + `zoho._domainkey` DKIM → Mail DNS genuinely complete **and data centre = India (confirmed)**.

### ⚠️ Obsolete assumptions — explicitly retired
| Was | Now |
|---|---|
| "AM0.1 Zoho activation is pending; needs a founder runbook" | **OBSOLETE.** AM0.1 ✅ complete (Zoho One active, India DC). No further activation runbook. |
| "Data centre unconfirmed (in vs us)" | **RESOLVED.** India DC, evidenced by `mx.zoho.in`. `ZOHO_DC=in` correct. |
| "AM0.3 Mail DNS pending / start in Track B" | **OBSOLETE.** AM0.3 ✅ complete (MX/SPF/DKIM verified live). |

## 3. Milestone status board (derived from state, not assumed)

Legend: ✅ Live · 🟩 Likely-done (verify) · 🟦 Next / in progress · ⬜ Not started · ❓ Unconfirmed

### AM0 — Foundation
| ID | Item | Status | Basis |
|---|---|---|---|
| AM0.1 | Zoho One activation (India DC) | ✅ | Founder-confirmed |
| AM0.3 | Mail DNS (MX/SPF/DKIM) | ✅ | Independently DNS-verified (mx.zoho.in, SPF, DKIM) |
| AM0.2 | Directory: users, roles, **2FA enforced**, groups | ❓ | Org+Mail imply users exist; roles/2FA-enforced/groups **unconfirmed** — verify |
| AM0.8 | Cliq channels (#leads,#wins,#finance-approvals,#ops-alerts,#daily-updates) | ❓ | Unconfirmed |
| AM0.4 | **CRM spine** (fields, 11-stage pipeline, 5 workflows) — File 01 | 🟦 **Executing (Harsh)** | Runbook + 13-point acceptance checklist (A1–A13) issued; awaiting implementation evidence |
| AM0.5 | Books + GST + Razorpay | ⬜ | Unconfirmed; likely not started |
| AM0.6 | WorkDrive Students template | ⬜ | Unconfirmed |
| AM0.7 | Vault | ⬜ | Unconfirmed |
| AM0.10 | Analytics connected | ⬜ | Blocked by AM0.4 + AM0.5 |
| AM0.9 | WhatsApp BSP + Meta verification | ⬜ (Track B) | Longest external lead time — start in parallel |

### AM1+ (per File 16 §9) — all ⬜, blocked by AM0.4 (AM1.1 Speed-to-Lead is first).

## 4. Current critical path
`AM0.1 ✅ → AM0.4 (CRM spine) → AM1.1 (Speed-to-Lead) → …`
AM0.1 and AM0.3 are done. **AM0.4 is now the front of the critical path.** AM0.2 (users/roles/2FA) and
AM0.8 (Cliq) are fast prerequisites for AM0.4's *workflow* layer (assignment, alerts); the CRM
*structure* (modules/fields/pipeline) can be built immediately.

## 5. Immediate next milestone
**AM0.4 — CRM spine.** Spec: [AM0.4](docs/automation-specs/AM0.4-crm-spine.md).
Gated only by a quick AM0.2/AM0.8 confirmation + one business input (team roster).

## 6. Implementation event log (newest first)
| Date | Item | Event |
|---|---|---|
| 2026-07-22 | Capability | Browser UI automation ruled out (Control_Chrome: navigate/tab-list OK, but get_page_content + execute_javascript fail "Chrome not running", no click/type; claude-in-chrome unconnected). **Pivoted to Zoho CRM API for autonomy.** Built provisioning engine (config/crm-schema.json, crm-settings.mjs, provision-crm.mjs) — creates ~18 custom fields+picklists via API, idempotent, dry-run/commit, self-verifying. Ready to run once OAuth token exists. Autonomy split: fields=me(API); rename/pipeline/dup-check/assignment/5 workflows/data-sharing=console-only. |
| 2026-07-22 | Execution | Option A confirmed (Harsh = Automation Owner; I am Tech Lead + QA). Issued the AM0.4 step-by-step execution runbook (STEP 0–9, exact console paths + per-step evidence) and the 13-point acceptance checklist (A1–A13). AM0.4 → Executing; awaiting evidence. |
| 2026-07-22 | Parallel work | AM0.4 human-blocked → safe parallel work: functional test suite for the Zoho automation layer (functions/zoho/zoho.test.mjs, 14 tests, native node:test, zero-dep) covering config/DC resolution, oauth caching+refresh, client 401-retry + error normalization + auth header, CRM upsert dedupe/validation, Flow URL guard. Wired into CI. Does not touch AM0.4; hardens the code that runs all future automation. |
| 2026-07-22 | Execution | **Execution Lock v1.0 in force** (Files 16–19 locked; CSE execution-only mode). Built config validator (scripts/validate-config.mjs, zero-dep) + wired into CI as the Configuration Validation gate. Positive+negative tested. Hardens the priority-1 CRM config ahead of the AM0.4 build. |
| 2026-07-22 | Governance | Founder resolved OI-1/2/3/4 + engineering rule (design-for-scale/build-for-today, File 19 A1). Team size not a public claim; configurable licensing; role-based Finance ownership; configurable Assignment Engine. Findings IF-5/IF-6. Website headcount claim removed (separate `copy` commit). No architecture change. |
| 2026-07-22 | Governance | **Master Constitution v1.0 accepted (File 19).** Role → Chief Systems Engineer. Files 16–18 frozen as constitutional architecture. Assessment: Constitution adds config + governance, **does not invalidate architecture** (configurable design already accommodates new markets/geography/lead-types/languages). Applied deltas to AM0.4 (findings IF-2, IF-3). |
| 2026-07-22 | State sync | Corrected state per founder. AM0.1 ✅. AM0.3 ✅ (DNS-verified, India DC). Retired obsolete "AM0.1 pending" assumption. Critical path advances to AM0.4. |
| 2026-07-22 | — | Entered implementation mode; AM0.1 spec had been issued (now superseded — activation already done). |

## 7. Implementation findings (the ONLY sanctioned trigger for architecture change)
| # | Finding | Impact | Action |
|---|---|---|---|
| IF-1 | File 01's "Intended Intake" picklist (Jan 2027…) predates today (Jul 2026); the imminent Sep 2026 intake is missing | CRM field values only — **no architecture change** | Apply current-cycle intakes during AM0.4 build (spec §3). Files 16–18 untouched. |
| IF-2 | Constitution expands markets (adds Pakistan + secondary) and destinations (Spain/Latvia/Lithuania/Malta/Poland/+); "never hardcode geography" | CRM picklist values + a new Market field — **config, no architecture change** (already picklist/KG-backed) | Applied to AM0.4 (Market field; expanded country config). Files 16–18 untouched. |
| IF-3 | Constitution requires multi-type-lead compatibility (Student now; Parent/University/Agent/Corporate… later) | New Lead Type field + workflow scoped to Student — **config, no architecture change** (CRM-as-SoR + modules already support it) | Applied to AM0.4 (Lead Type field; workflow guard). Option A approved 2026-07-22; record-types deferred until a 2nd type operational. Files 16–18 untouched. |
| IF-4 | Founder rule: assignment must never be hardcoded round-robin; configurable by department/country/language/lead-type/workload/availability | Refines File 01 §5.1 assignment mechanism — **execution improvement, no architecture change** | AM0.4 workflow 1 now uses a config-driven Assignment Rule (config/tenant-richenquest.json → assignment). Performance-based routing deferred. Files 16–18 untouched. |

## 8. Open items — ✅ RESOLVED by founder 2026-07-22
| # | Item | Resolution |
|---|---|---|
| OI-1 | Team headcount vs public claim | **Team size is NOT a public marketing claim** (needs founder approval per use). CRM supports all contributors (full-time/part-time/collaboration). → File 08 + File 19 A2 updated; **website headcount claim removed** (RELEASE-LOG). |
| OI-2 | Zoho licences | **Don't hardcode licensing.** Users configurable; begin with available licensed users, provision more later; no redesign on expansion. → config `licensing`; AM0.4 §1A. |
| OI-3 | Finance owner | **Rahul = temporary Finance Owner** until a dedicated Finance Lead joins; **role-based, transferable** with no structural change. → config `ownership_roles`; File 19 A3. |
| OI-4 | Assignment routing | **Configurable Assignment Engine**, no static routing (language/market/destination/lead-type/department/expertise/workload/availability/manual-override). Native rules now, custom function later. → config `assignment_engine`; File 19 A4. |

## 9. Implementation findings (cont.)
| # | Finding | Impact | Action |
|---|---|---|---|
| IF-5 | Assignment Engine needs workload/availability, which exceed native Zoho Assignment Rules | Phasing, **no architecture change** | Phase 1 native criteria + manual override now; Phase 2 custom function (Deluge/Catalyst reading config) later. Contract (config) stable across phases. |
| IF-6 | Contributors have mixed engagement models; CRM must support all | Config field `engagement_model`; **no architecture change** (assignment never depends on it) | Captured in config `contributors`. |
