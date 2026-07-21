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
| 2026-07-22 | State sync | Corrected state per founder. AM0.1 ✅. AM0.3 ✅ (DNS-verified, India DC). Retired obsolete "AM0.1 pending" assumption. Critical path advances to AM0.4. |
| 2026-07-22 | — | Entered implementation mode; AM0.1 spec had been issued (now superseded — activation already done). |

## 7. Implementation findings (the ONLY sanctioned trigger for architecture change)
| # | Finding | Impact | Action |
|---|---|---|---|
| IF-1 | File 01's "Intended Intake" picklist (Jan 2027…) predates today (Jul 2026); the imminent Sep 2026 intake is missing | CRM field values only — **no architecture change** | Apply current-cycle intakes during AM0.4 build (spec §3). Files 16–18 untouched. |
