# File 20 — The Automation Platform

**The website is frozen (ADR-008). This file is where engineering effort now goes.**

Everything here survives a frontend rewrite by construction: it lives in CRM, or in this repo as a
contract. Nothing in this file depends on the prototype at `richenquest.pages.dev`.

**Read first:** File 19 §2b for *how* CRM is written to (the session-REST channel), and the File 15
correction for why "console-only" was wrong. Without those two, none of the below is reproducible.

---

## 0. What is live right now

Seven workflow rules, all verified against real records, all probes deleted.

| Module | Rule | Trigger | Verified |
|---|---|---|---|
| Leads | **Instant lead response** | on create | ✅ end to end, twice |
| Leads | **Stale lead rescue** | 3 days on `Modified_Time` | ⚠️ config read-back only — see §4 |
| Accounts | **Partnership outreach cadence** | `Partnership_Stage` → `Contacted` | ✅ 3 tasks, day +4/+9/+16 |
| Accounts | **Partnership reply SLA** | `Partnership_Stage` → `In Discussion` | ✅ Highest task, due same day |
| Accounts | **Partner onboarding** | `Partnership_Stage` → `Agreement Signed` | ✅ 3 onboarding tasks |
| Accounts | **Agreement renewal guard** | 30 days before `Agreement_Expires_On` | ⚠️ config read-back only |
| Tasks | **Overdue task reminder** | 1 day past `Due_Date`, status ≠ Completed | ⚠️ config read-back only |

Supporting objects: 2 email templates, 2 email notifications, 11 task actions, 1 field update,
1 role. Ids are in §6.

---

## 1. University collaboration automation — BUILT

The pipeline already held 17 target universities on stock **Accounts** with 9 partnership fields
(File 16 §7). It had no behaviour. It does now.

```
Identified ──(founder sets stage)──> Contacted
                                        └─> tasks at day +4, +9, +16   [outreach cadence]
                                     In Discussion
                                        └─> "REPLY within 4 hours", Highest, due today
                                     Agreement Signed
                                        └─> file agreement (WorkDrive+Vault) +2d
                                            load programs into course DB   +5d
                                            brief counselors               +5d
Agreement_Expires_On − 30d ────────────> "renew or close", Highest
```

**Why tasks and not emails.** File 02 §3 drafts a four-email outreach sequence, and it cannot be
built as written: every email depends on facts that do not exist yet — `[YEARS] years in
operation`, `[STUDENTS PLACED] students placed`, visa success rate, `[strongest proof point —
… or a named partner institution]`. `claims.json` records `partnerships.signed: []`, and File 08
bans partner language outright. **Auto-sending those emails would have shipped fabricated claims to
universities.** So the cadence creates *tasks* that prompt a human to send a real email, and the
sequence stays correct-by-construction until the founder supplies verifiable proof points.

**To finish this workstream**, the founder needs to supply (File 02 §4): years active, students
placed, visa success rate, and any certification (ICEF / British Council / AIRC). With those in
`claims.json`, the four templates can be written and the cadence upgraded from tasks to sends.
That is a **founder-only content boundary**, not a technical one.

Also unblocked by data, not code: 16 of 17 universities have no `International_Office_Email`.
Outreach automation has nothing to send to until that is researched (File 02 §2 Monday routine).

---

## 2. Internal CRM automation — PARTIALLY BUILT

Built:
- **Lead intake** — status set, call task raised, welcome email sent (File 19 §3).
- **Stale lead rescue** — 3-day nudge on unanswered leads.
- **Overdue task reminder** — one day past due and still open, the owner is emailed. This is
  File 01 §5.4's "nobody plays follow-up police" mechanism.

Not built, and honestly scoped:
- **§5.4 second stage** (3 days overdue → notify owner's manager). Needs the `Owner's Manager`
  recipient type, which exists in the UI picker but whose API enum has not been read out of
  `alert.js` yet. Straightforward; not yet done.
- **§5.3 stage-triggered client updates** and **§5.5 deadline guardian** — both are on **Deals**.

  **CORRECTION 2026-08-15: I previously wrote here that "the Deals pipeline in File 01 §4 has not
  been built". That was wrong, and I asserted it without checking.** The Student Cases pipeline is
  fully configured: all 11 stages at the exact probabilities File 01 §4 specifies (New Inquiry 10
  → Visa Approved — Won 100, Closed Lost 0), the `Lost_Reason` picklist with all six values, and
  every one of the seven custom fields (`Destination_Country`, `Course_University_Final`,
  `Assigned_Counselor`, `Service_Package`, `Document_Status`, `Visa_Status`, `Next_Deadline`).

  What is actually missing is **records** — `Deals` is empty — and the automation on top.
- **Cliq notifications** (`#leads`, `#wins`) — Cliq has no MCP server connected. Not attempted.

---

## 3. Everything else, assessed honestly

Feasibility here is **measured**, not assumed — each row was probed this session.

| # | Workstream | Status | Evidence |
|---|---|---|---|
| 1 | University collaboration | **BUILT** (§1) | 4 rules, 7 tasks verified |
| 2 | Social media automation | **BLOCKED — external** | No Zoho Social MCP server; every network (LinkedIn/Instagram/Meta) needs app registration + OAuth under the company identity. **Founder-only: account ownership.** |
| 3 | Content creation automation | **REPO WORK — open** | No external dependency. Belongs here as templates + a generator, gated by `claims-guard` |
| 4 | Internal CRM automation | **PARTIAL** (§2) | 3 rules live |
| 5 | Operations dashboard | **NEEDS A DECISION** | `/settings/reports` and `/settings/dashboards` return `INVALID_REQUEST` at the paths tried — endpoint **not located**, which is *not* the same as absent (see the File 15 lesson). Alternative: a static dashboard built from COQL, consistent with ADR-003 |
| 6 | Document automation | **FEASIBLE, unbuilt** | `/crm/v8/settings/inventory_templates` → **200**. WorkDrive folder templates (File 01 §6) need a WorkDrive API, not yet probed |
| 7 | AI knowledge base | **REPO WORK — open** | File 04 §1 has drafted FAQ content; needs fact-checking against `claims.json` before it can be published anywhere |
| 8 | SOP generation | **REPO WORK — open** | File 04 §2 has 7 SOPs drafted (SOP-01…07). Target was Zoho Learn — no MCP server; deliver as repo artifacts |
| 9 | Reporting | **PARTIAL** | COQL works today and is how every verification in this project is done. Scheduled reports depend on §5 |
| 10 | Backend services for the new frontend | **BUILT — File 21** | 6 Deluge functions deployed, REST-enabled, each verified against live records |

**Item 10 is done.** Six CRM Functions now form the backend layer — `createFollowUpTasks`,
`generateAuditLog`, `updateLeadLifecycle`, `assignCounselor`, `createUniversityFollowup`,
`archiveExpiredPartnership`. Source in `functions/src/`, API and evidence in **File 21**.

This also began paying down §0's duplication: task creation existed as **11 near-identical
workflow Task actions**; it is now one function that the others call. The workflow rules still
fire their own actions — migrating them to call the function is the next consolidation step, and
is deliberately being done one rule at a time with a probe each rather than blind.

---

## 4. Known-unverified, carried forward

Stated plainly so nobody reads a green table as more than it is:

- **`Stale lead rescue` offset direction.** Zoho accepts `sign: "plus"` but does not echo it in
  the read-back. *After* vs *before* `Modified_Time` is **not verified**. No lead is old enough to
  have fired it.
- **`Agreement renewal guard` and `Overdue task reminder`** are verified by configuration
  read-back only. Both are date-triggered, so neither can fire on demand. First firing confirms.
- **Email deliverability is unverified.** Every notification was tested against `example.com`,
  which is reserved and does not deliver. That no send has failed is not evidence that a send
  succeeds. Confirm with one real address before trusting the welcome email.

---

## 5. The rules that make this maintainable

1. **Never auto-send a claim that is not in `claims.json`.** The build gate enforces this on the
   website; in CRM there is no gate, so it is a discipline. This is why §1 creates tasks.
2. **"No API for X" must name the entity *and* the transport.** A 401 from a shell said nothing
   about the browser session. That over-generalisation cost hours (File 15 correction).
3. **`element.offsetParent` is null for `position: fixed`.** Never use it as a visibility filter
   against Zoho — every Lyte dropdown, callout and menu is position-fixed.
4. **Delete every probe.** Probes here were `WFPROBE *` leads and `ZZPROBE *` accounts; all
   deleted, cascade confirmed by COQL returning zero rows.
5. **Batch writes silently truncate.** Posting three objects in one `{"tasks":[…]}` array created
   **only the first** and still returned `201`. Create one object per request, then read back.

---

## 6. Object ids

| Object | Id |
|---|---|
| Rule · Instant lead response | `1292318000000873014` |
| Rule · Stale lead rescue | `1292318000000873035` |
| Rule · Partnership outreach cadence | `1292318000000873067` |
| Rule · Partnership reply SLA | `1292318000000873079` |
| Rule · Partner onboarding | `1292318000000873089` |
| Rule · Agreement renewal guard | `1292318000000873100` |
| Rule · Overdue task reminder | `1292318000000873115` |
| Template · Welcome - Instant Reply | `1292318000000873009` |
| Template · Task overdue - owner reminder | `1292318000000873108` |
| Notification · Welcome (→ `${!Leads.Email}`) | `1292318000000873026` |
| Notification · Task overdue (→ `${!Tasks.Owner}`) | `1292318000000873111` |
| Field update · Lead Status → Attempted to Contact | `1292318000000873004` |
| Task actions · Leads | `…873012`, `…873033` |
| Task actions · Accounts | `…873050`, `…873052`, `…873054`, `…873056`, `…873058`, `…873060`, `…873062`, `…873064` |
| Role · Finance | `1292318000000873044` |

## 7. API notes worth keeping

- **Module ids are not guessable and differ from field ids.** `Leads 1292318000000000037` ·
  `Contacts …039` · `Accounts …041` · `Deals …043` · `Tasks …063`. Using the wrong one returns
  `"the tabId given seems to be invalid"`.
- **`field_update` triggers need three things** in `execute_when.details`: the watched `field`,
  a `criteria`, **and** `match_all`. Omit any one and the error names the next.
- **`from_address` is only valid when the recipient is an email field.** With a user-type
  recipient (`${!Tasks.Owner}`) it must be omitted entirely, or Zoho returns `DEPENDENT_MISMATCH`.
- **Recipient merge fields** take the `${!Module.Field}` form: `${!Leads.Email}`,
  `${!Tasks.Owner}` — both verified accepted.
- **`unit` is an integer**, `period` a string. `"3"` returns `data type not supported`.
