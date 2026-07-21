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
| AM0.4 | **CRM spine** (fields, 11-stage pipeline, 5 workflows) — File 01 | 🟦 **NEXT** | Not built to spec; the keystone; front of critical path |
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

## 8. Open items awaiting founder (non-blocking for AM0.4 structural build; resolve before dependent steps)
| # | Item | Blocks | Decision needed |
|---|---|---|---|
| OI-1 | **Team headcount vs public claim:** 7 named leads vs claims.json/File 08 "5 full-time core members" | Website claim (before RC-1 launch) | Are all 7 full-time core? If yes → founder-signed update to File 08 + claims.json + site (claims-guard governs). If not → clarify who is core. **I will not change a public claim without sign-off.** |
| OI-2 | **Zoho One licences:** ~5 seats at AM0.1 vs 7 members | AM0.2 (Directory) | +2 paid seats (credit impact) or guest access for some? |
| OI-3 | **Finance owner unassigned** in roster | AM0.5 (Books), LEDGER | Who owns Finance — Rahul, Harsh, or a new hire? |
| OI-4 | **v1 assignment routing defaults** (config proposes Kunal default / Tahir for Pakistan / Bibek overflow) | AM0.4 workflow 1 go-live | Confirm or adjust the routing values |
