# Automation Implementation Log

Living tracker for executing the automation backlog (File 16) against the frozen architecture
(Files 16, 17, 18). Separate from `RELEASE-LOG.md` (which tracks website RC-1 changes) — this is the
Zoho operations rollout. **Architecture is frozen; changes may emerge only from proven implementation
gaps, recorded in §4.**

## 1. Per-item lifecycle (File 16 §1)
`Spec (Me) → Build (Owner) → Test vs success criteria → add failure-recovery + #ops-alerts heartbeat →
Founder sign-off → Live → Watch 1 week → next item.` No item starts until the previous is signed off.
Build-ready specs live in `docs/automation-specs/`.

## 2. Status board

Legend: ⬜ Not started · 🟦 In progress · ⏳ Waiting (external approval) · ✅ Live · — n/a

### Track A — Build (strictly one at a time, in order)
| ID | Item | Status | Spec | Notes |
|---|---|---|---|---|
| AM0.1 | Zoho One activation (India DC) | 🟦 In progress | [AM0.1](docs/automation-specs/AM0.1-zoho-activation.md) | Founder-executed. Awaiting activation + report-back |
| AM0.2 | Directory: users, roles, 2FA, groups | ⬜ | — | Blocked by AM0.1 |
| AM0.8 | Cliq channels | ⬜ | — | Blocked by AM0.1 |
| AM0.4 | CRM spine (File 01) — the keystone | ⬜ | — | Blocked by AM0.1 |
| AM0.6 | WorkDrive Students template | ⬜ | — | Blocked by AM0.1 |
| AM0.7 | Vault | ⬜ | — | Blocked by AM0.1 |
| AM0.10 | Analytics connected | ⬜ | — | Blocked by AM0.4, AM0.5 |
| AM1.1 | Speed-to-Lead | ⬜ | — | First revenue automation; blocked by AM0.4 |
| … | (AM1.2 → AM5, per File 16 §9) | ⬜ | — | Sequenced in File 16 |

### Track B — Approvals (start in PARALLEL now; these are waits, not work — File 16 §0)
| ID | Item | Status | Owner | Why now |
|---|---|---|---|---|
| AM0.9 | WhatsApp BSP + Meta business verification + templates | ⬜ → start | F/AO | **Longest external lead time (days).** Start same day as AM0.1 |
| AM0.5 | Books + GST + Razorpay | ⬜ → start | Fin/F | Razorpay ~1 day approval |
| AM0.3 | Mail DNS (MX/SPF/DKIM) | ⬜ → start | F | DNS propagation ≤48h; also fixes File 07 partnership-email deliverability |

## 3. Implementation event log (newest first)
| Date | Item | Event |
|---|---|---|
| 2026-07-22 | — | Entered implementation mode. Architecture frozen (Files 16–18). AM0.1 spec issued; Track B approvals recommended to start in parallel. |

## 4. Implementation findings (the ONLY sanctioned trigger for architecture change)
Record here any real gap discovered while building that the frozen architecture didn't anticipate.
Empty = architecture is holding. Speculation does not belong here — only lived experience.

*(none yet)*
