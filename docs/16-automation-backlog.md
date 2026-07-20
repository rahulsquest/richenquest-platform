# File 16 — Automation Implementation Backlog
Converts the approved blueprint (File 15) into a sequenced, dependency-aware backlog.
Status: **architecture frozen. Backlog for approval, 2026-07-19.** We implement ONE item at a time,
each fully specced → built → tested → signed off → watched, before the next begins.

---

## 0. Delivery-lead analysis (my opinion, up front)

**The effort here is small. The risk is drift.** Almost every item below is 1–8 hours of Zoho
*configuration*, not software engineering. A competent Automation Owner could physically build the
entire money-and-risk spine in about a week of focused work. That is not the constraint. The real
constraints are three, and none of them is difficulty:

1. **External approval lead times gate the calendar, not the build.** WhatsApp Business API (Meta
   business verification + template approval) takes **days**, Razorpay ~1 day, DNS propagation up to
   48h. These are *waits*, not *work* — so they must start **now, in parallel**, before their
   dependent automations are even scheduled. The WhatsApp BSP path is the single longest pole in the
   tent; if it isn't started today it will block Speed-to-Lead later for no good reason.

2. **You are 5 people at 1–2 hrs/day (File 00). People-time is the throughput limit.** At that pace,
   Phase 0 + Phase 1 is realistically **3–4 weeks of elapsed time** — not because it's hard, but
   because it's drip-fed around billable student work. The honest schedule risk is *abandonment*: a
   small team doing this in spare hours stalls the moment "what's next" becomes ambiguous. **The
   entire value of this backlog is that it removes that ambiguity** — momentum stops needing a
   decision.

3. **Single-owner concentration.** File 00 says appoint one Automation Owner. That's correct for
   coherence, but it makes that person a single point of failure whose automation work competes with
   their day job. **Protect their time explicitly** (a fixed daily block), or the backlog moves at
   the speed of whatever's left over — which is usually nothing.

**My recommendation in one line:** treat the backlog as two parallel tracks — a **build track**
(strictly one automation at a time, in the order below) and an **approvals track** (kick off
WhatsApp/Razorpay/DNS/GST immediately and let them cure in the background). Do that and the critical
path is just: *Zoho activation → CRM spine → Speed-to-Lead*. Everything else branches off that chain.
If you only ever finish those three, you have already captured most of the ROI in File 15.

One more honest note: **do not let the length of this list create pressure to go faster or wider.**
40 automations looks like a mountain; it's mostly a molehill of config with a few genuine builds
(Founder Dashboard, the pipeline). The discipline that matters is finishing each one *including its
failure-recovery* before starting the next. A half-built automation with no `#ops-alerts` heartbeat
is worse than no automation — it fails silently and you lose a student without knowing.

---

## 1. How to read this backlog

- **ID:** `AMx.y` — Automation Milestone x, item y. Maps to the S/I/U/M/F/H codes in File 15.
- **Effort:** hands-on build-hours (config + test). **Lead time:** external calendar wait (approvals,
  propagation) — runs in parallel, not additive to build.
- **Owner:** **F** Founder (Rahul) · **AO** Automation Owner · **Fin** Finance owner · **Me** AI CTO
  (I spec every item, design its test, and review sign-off; owners execute the clicks).
- **Deps:** item IDs that must be *live* first. **Prereq:** business/external things needed.
- **Success criteria:** the acceptance test. An item is "done" only when this passes **and** its
  failure-recovery + `#ops-alerts` heartbeat exist.
- **ROI:** HIGH / MED / FUTURE (from File 15 §5).

**Per-item lifecycle (governance for "one at a time"):**
`Spec (Me) → Build (Owner) → Test vs success criteria → add failure-recovery + heartbeat →
Founder sign-off → Live → Watch 1 week → next item`. No item starts until the previous is signed off.

---

## 2. Dependency graph — the critical path

```
AM0.1 Zoho One activation ─┬─► AM0.2 Directory/2FA
(India DC)                 ├─► AM0.4 CRM spine ──────┬─► AM1.1 Speed-to-Lead ◄─ AM0.8 Cliq, AM0.9 WhatsApp*
                           │                         ├─► AM1.2 Case pipeline ◄─ AM0.5 Books, AM0.6 WorkDrive, Sign
                           │                         ├─► AM1.3 Deadline/APS guardian
                           │                         ├─► AM1.6 Overdue-task escalation
                           │                         └─► AM3.1 Partner outreach ◄─ Univ. Partnerships module (File 02)
                           ├─► AM0.5 Books/GST/Razorpay ─► AM1.4 Invoicing ─► AM1.5 Payment reminders
                           ├─► AM0.3 Mail DNS (MX/SPF/DKIM)
                           └─► AM0.10 Analytics ◄─ AM0.4 + AM0.5 ─► AM2.1 Founder Dashboard

* AM0.9 WhatsApp BSP is the longest external wait — START IN PARALLEL AT AM0.1.
  Speed-to-Lead can ship email-first and gain WhatsApp when the BSP is approved.
```

**Critical path (longest chain to first revenue-impacting automation live):**
AM0.1 → AM0.4 → AM1.1. Nothing shortens this except starting AM0.1 sooner.

---

## 3. Milestone AM0 — Foundation (Phase 0, prerequisite for everything)

| ID | Item | Apps | Owner | Effort | Lead time | Deps | Prereq | Success criteria |
|---|---|---|---|---|---|---|---|---|
| AM0.1 | Zoho One activation, India DC | Zoho One | F | 2h | signup/verify | — | Zoho credit type & expiry confirmed | Org live, India DC, admin access confirmed |
| AM0.2 | Directory: users, roles, groups, **2FA enforced** | Directory | AO | 2h | — | AM0.1 | team emails | All 5 users provisioned; 2FA mandatory; role hierarchy set |
| AM0.3 | Mail DNS: MX + SPF + DKIM | Mail | F | 1h | ≤48h DNS | AM0.1 | registrar access | Mail from official@ passes SPF/DKIM (test send scores clean) |
| AM0.4 | **CRM spine** (modules, custom fields, 11-stage pipeline, 5 core workflows) — File 01 | CRM | AO+Me | 3–4h | — | AM0.1 | founder Q's answered (team, services, countries) | Test Lead + test Student Case flow through all stages; 5 workflows fire |
| AM0.5 | Books + GST + Razorpay + service items | Books | Fin/F | 2h | ~1d Razorpay | AM0.1 | GST details, PAN, bank | Test invoice issues with Razorpay payment link |
| AM0.6 | WorkDrive `Students` team folder + per-student template | WorkDrive | AO | 1h | — | AM0.1 | folder structure (File 01 §6) | Template folder copies cleanly for a test student |
| AM0.7 | Vault: shared logins migrated; passwords rotated into Vault | Vault | F | 1h | — | AM0.1 | list of shared accounts | All shared creds in Vault only; old passwords changed |
| AM0.8 | Cliq channels (`#leads`, `#wins`, `#finance-approvals`, `#ops-alerts`, `#daily-updates`) | Cliq | AO | 0.5h | — | AM0.1 | — | Channels exist; team joined; `#ops-alerts` reserved for automation health |
| AM0.9 | **WhatsApp BSP + Meta verification + dedicated number + templates** | WhatsApp (AiSensy/WATI/Interakt) + CRM | F/AO | 2h | **days** (Meta verify + template approval) | AM0.1 | GST/registration doc, new number | BSP↔CRM connected; `welcome_inquiry` template approved; test message delivered |
| AM0.10 | Analytics connected (auto-sync CRM + Books) | Analytics | AO | 1h | — | AM0.4, AM0.5 | — | CRM + Books data visible in Analytics |

**AM0 total:** ~15–16 build-hours; **calendar gated by AM0.9 (WhatsApp) and AM0.5 (Razorpay).**
Start AM0.9 the same day as AM0.1.

---

## 4. Milestone AM1 — Money-and-Risk Spine (Phase 1)

| ID | Item (File 15) | Apps | Owner | Effort | Deps | Success criteria | ROI |
|---|---|---|---|---|---|---|---|
| AM1.1 | **S1 Speed-to-Lead** | Forms, CRM, Cliq, WhatsApp, Campaigns | AO+Me | 4–8h | AM0.4, AM0.8 (WhatsApp AM0.9 optional-later) | Test lead → CRM in <10s, correct source; welcome email/WhatsApp fires; counselor task due now; `#leads` alert; 30-min no-response escalates | HIGH |
| AM1.2 | **S2 Case pipeline lifecycle** | CRM, Mail, WhatsApp, WorkDrive, Books, Sign | AO+Me | 6–8h | AM0.4, AM0.5, AM0.6 | Each stage change fires its action (agreement→sign+task; signed→onboarding+folder+invoice; offer/visa→congrats+#wins); daily "missing stage-action" audit runs | HIGH |
| AM1.3 | **S3 Deadline/APS/DSU guardian** | CRM, Cliq, WhatsApp, Mail | AO+Me | 4h | AM0.4 | 7-day + 2-day alerts fire; German cases carry APS deadline; weekly "no-deadline-set" audit flags gaps | HIGH |
| AM1.4 | **F1 Invoicing** | Books, CRM | Fin+Me | 3h | AM0.5, AM1.2 | Agreement Signed → invoice raised (2-click MVP) with payment link; logged on the case | HIGH |
| AM1.5 | **F2 Payment reminders** | Books | Fin | 1h | AM0.5 | Auto-reminders fire at due−3/due/+3/+7; test invoice reminder delivered | HIGH |
| AM1.6 | **I1 Overdue-task escalation** | CRM, Cliq | AO+Me | 2h | AM0.4, AM0.8 | Task +1d → owner reminder; +3d → manager DM; verified on a test task | HIGH |

**AM1 total:** ~20–26 build-hours (~3–4 build-days).

---

## 5. Milestone AM2 — Control Tower (Phase 2)

| ID | Item | Apps | Owner | Effort | Deps | Success criteria | ROI |
|---|---|---|---|---|---|---|---|
| AM2.1 | **Founder Morning Dashboard** (File 15 §4) | Analytics, CRM, Books, Bookings, Cliq | AO+Me | 1–2d | AM0.10, AM1.x (data exists) | 9 metrics render; 08:00 IST email + Cliq digest showing only red items; health-score components visible; stale-source honesty | HIGH |
| AM2.2 | **F3 Revenue dashboard** | Analytics, Books, CRM | Fin+Me | 0.5d | AM0.5, AM0.10 | Collected MTD vs target, outstanding, pipeline value live | HIGH |
| AM2.3 | **M1 Lead attribution** | Forms, CRM, Analytics | AO+Me | 2h | AM0.4 | UTM captured on every form; Lead Source Detail populated; attribution report by channel | MED-HIGH |

**AM2 total:** ~2.5–3 build-days.

---

## 6. Milestone AM3 — B2B Partnership Engine (parallelizable with AM1 if outreach is live, File 07)

| ID | Item | Apps | Owner | Effort | Deps | Success criteria | ROI |
|---|---|---|---|---|---|---|---|
| AM3.1 | **U1 Partner outreach follow-up** | CRM (Univ. Partnerships), Mail, Cliq | AO+Me | 4h | AM0.4 + Univ. Partnerships module (File 02) | "Email 1 Sent" → +4/+9/+16 tasks; "Replied" → alert+4h SLA; "Signed" → #wins; 30d silence → Dormant | HIGH |
| AM3.2 | **U2 Partner onboarding** | Sign, WorkDrive, Vault, CRM | AO+Me | 4h | AM3.1 | On signature: agreement filed, terms in CRM, counselor brief created | MED |
| AM3.3 | **U3 Contract/renewal reminders** | CRM, Cliq | AO | 2h | AM3.1 | Date-based alerts before renewal/audit dates fire | MED |

---

## 7. Milestone AM4 — Habits, Marketing & Light HR (Phase 4)

| ID | Item | Apps | Owner | Effort | Deps | Success criteria | ROI |
|---|---|---|---|---|---|---|---|
| AM4.1 | I2 Daily check-in (manual scheduled msg; bot later) | Cliq | AO | 0.5h | AM0.8 | Scheduled prompt posts Mon–Sat 6pm; team replies in thread | MED |
| AM4.2 | I4 SOP & knowledge base | Learn | AO+Me | 0.5d | AM0.1 | SOP-01…07 loaded as courses; new-hire completion tracked | MED |
| AM4.3 | I5 Internal approvals (discount/refund) | CRM | AO+Me | 2h | AM0.4 | Discount >10% locks deal until CEO one-tap approve; tested | MED |
| AM4.4 | S5 Nurture drip | Campaigns/Marketing Automation | AO+Me | 0.5d + ongoing content | AM0.4 | Monthly value email to Nurture segment; opt-out honored | MED |
| AM4.5 | M3 Social scheduling | Social | AO | 2h | AM0.1 | Multi-channel calendar; approval-before-publish flow | MED |
| AM4.6 | M4 Web analytics (consent-gated) | PageSense or Clarity | AO+Me | 2h | **consent banner (website — separate RC item)** | Heatmaps/funnels live, only post-consent | MED |
| AM4.7 | H1 Leave management | People | AO | 2h | AM0.1 | Leave request → approval flow; calendar reflects | MED |
| AM4.8 | H2 Onboarding checklist | People/Learn/Directory | AO | 2h | AM0.2 | New-hire checklist: accounts, SOP courses, Vault, 2FA | MED |
| AM4.9 | S4 Document OCR assist | CRM, WorkDrive, Zia | AO+Me | 0.5d | AM0.4, AM0.6 | OCR flags mismatches → "AI Pre-checked"; **human still sets Verified** | MED (HIGH at volume) |

---

## 8. Milestone AM5 — Future (deferred with named triggers — do NOT build until the trigger fires)

| ID | Item | Deferral trigger | ROI |
|---|---|---|---|
| AM5.1 | S6 Alumni program | ~100+ placed students | FUTURE |
| AM5.2 | U4 Commission tracking/reconciliation | first signed paying partner | FUTURE |
| AM5.3 | F4 Commission payout | collaborator-payment model + volume | FUTURE |
| AM5.4 | F5 Expense + Payroll | ~15+ FTE | FUTURE |
| AM5.5 | H3 Recruitment ATS (Recruit) | ~15+ FTE / >monthly hiring | FUTURE |
| AM5.6 | H4 Interview scheduling | reuse Bookings (trivial, no build) | FUTURE |
| AM5.7 | H5 Performance management | first real manual review cycle exists | FUTURE |
| AM5.8 | H6 Exit process | one-page SOP now; automate at ~15 FTE | FUTURE |
| AM5.9 | Zia-ML lead scoring | ~200 closed-won records to train on | FUTURE |
| AM5.10 | Creator student portal | after AM1–AM2 stable; own project | FUTURE |

---

## 9. Master rollout order (the single sequenced list)

1. **AM0.1** Zoho activation — *and same day, kick off AM0.9 WhatsApp BSP + AM0.5 Razorpay/GST + AM0.3 DNS in the approvals track*
2. AM0.2 Directory/2FA
3. AM0.8 Cliq channels
4. **AM0.4 CRM spine** ← the keystone
5. AM0.6 WorkDrive · AM0.7 Vault
6. AM0.5 Books/GST/Razorpay (finishes as approval clears)
7. AM0.10 Analytics · AM0.9 WhatsApp (finishes as Meta approval clears)
8. **AM1.1 Speed-to-Lead** ← first revenue-impacting automation
9. AM1.6 Overdue escalation
10. AM1.3 Deadline/APS guardian
11. AM1.2 Case pipeline lifecycle
12. AM1.4 Invoicing → 13. AM1.5 Payment reminders
14. AM2.2 Revenue dashboard → 15. **AM2.1 Founder Dashboard** → 16. AM2.3 Attribution
17. AM3.1 Partner outreach → 18. AM3.2 onboarding → 19. AM3.3 contract reminders
20–28. AM4.x (habits/marketing/HR) as capacity allows
29+. AM5.x only when each trigger fires

(Items 1–7 are foundation; a build-track worker does them roughly in order while the approvals track
cures in parallel. Items 8+ are strictly one-at-a-time with sign-off between each.)

---

## 10. Effort & calendar summary

| Phase | Build-hours | Realistic elapsed (1–2 hrs/day + approvals) |
|---|---|---|
| AM0 Foundation | ~15–16h | 1–2 weeks (gated by WhatsApp/Razorpay/DNS) |
| AM1 Money-risk spine | ~20–26h | 1–2 weeks |
| AM2 Control tower | ~2.5–3d | ~1 week |
| AM3 B2B engine | ~10h | ~1 week (can overlap AM1) |
| AM4 Habits/marketing/HR | ~3–4d | 2–3 weeks, spread |
| **To "revenue spine live" (AM0→AM1)** | **~35–42h** | **~3–4 weeks elapsed** |

The elapsed time is dominated by people-availability and external approvals, **not** build
complexity. Adding a second person to the build track, or protecting a fixed daily block for the
Automation Owner, compresses this more than any technical change could.

---

## 11. Delivery risks (specific to executing this backlog)

1. **Approvals not started early** → WhatsApp/Razorpay waits stall dependent items for no reason.
   *Mitigation:* approvals track begins at AM0.1, in parallel.
2. **Automation Owner overloaded** → backlog moves at leftover-time speed (≈0). *Mitigation:* fixed
   daily block; or split build vs approvals across two people.
3. **Skipping failure-recovery to "go faster"** → silent-failure debt; a lost lead is invisible.
   *Mitigation:* an item is not "done" without its `#ops-alerts` heartbeat (definition of done).
4. **Building AM4/AM5 before AM1 is stable** → breadth over depth; the classic trap. *Mitigation:*
   strict rollout order; Future items gated by named triggers.
5. **Scope creep inside an item** → "while I'm in here…" turns a 2h task into a day. *Mitigation:*
   one automation, one spec, one sign-off; extras become new backlog items.
6. **No manual habit underneath** (esp. I2 daily check-in) → automating an absent behavior.
   *Mitigation:* habit-first items ship as manual prompts before any bot.

---

*Approve this backlog and the rollout order, and we start at AM0.1. I'll produce a build-ready spec
(exact fields, rules, templates, test script, failure-recovery) for each item the moment it reaches
the front of the queue — one at a time, signed off before the next.*
