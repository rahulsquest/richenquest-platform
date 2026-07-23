# AM0.4 — Automation Impossibility Proofs

Nothing in this project is labelled "manual" on assumption. Each item below was tested against
**every** available automation surface — public API, alternate API versions, undocumented endpoints,
and browser automation — before being classified. Evidence is reproducible.

Classification is only valid while the stated evidence holds. If Zoho ships an API for any of these,
the item must be reclassified and automated.

---

## Surface A — Browser automation: PROVEN UNAVAILABLE for all Zoho console work

This single proof applies to every "console-only" item below, so it is stated once.

| Surface | Capability | Evidence (2026-07-23) |
|---|---|---|
| In-app Browser pane | Navigate + read: **YES** | Successfully loaded `accounts.zoho.in` and read the sign-in DOM |
| In-app Browser pane | Authenticated session: **NO** | Any CRM URL (`/crm/tab/Leads`, `/crm/settings/...`) redirects to `accounts.zoho.in` sign-in |
| In-app Browser pane | Authenticate: **PROHIBITED** | Requires entering the account owner's password + 2FA. Entering credentials is categorically prohibited, and 2FA is possession-bound to the owner |
| Founder's real Chrome | Has a live session: **presumed yes** | — |
| Founder's real Chrome | Read page: **BLOCKED** | `read_page` → `Permission denied for reading pages on this domain` |
| Founder's real Chrome | Screenshot: **BLOCKED** | `computer{screenshot}` → `Permission denied for this action on this domain` |
| Founder's real Chrome | Navigate: **BLOCKED** | `navigate` → `Navigation to this domain is not allowed` |

**Conclusion.** The only browser with a Zoho session is one the tooling cannot drive; the only browser
the tooling can drive has no session and cannot be given one without prohibited credential entry.
Browser automation is therefore unavailable for **all** items below. *(If the founder grants the
Chrome extension site access for Zoho domains, several items become re-testable — see Next Phase.)*

---

## 1. Lost Reason validation rule — CONSOLE ONLY

| Check | Result |
|---|---|
| Public API exists? | **Yes** — `POST /settings/validation_rules` |
| Does it work? | **No** — HTTP **500 INTERNAL_ERROR** on a fully schema-valid payload |
| Alternate version? | Tested **v7 and v8** — identical 500 |
| Schema satisfied? | **Yes.** Iterated every mandatory field the API named: `field` → `conditions[].primary_condition` → `conditions[].alert`. Final blocker resolved: `alert` must be **text** (`expected_data_type:"text"`), per Zoho's own error. With that satisfied, the API still 500s |
| Browser automation? | Unavailable — Surface A |

**Verdict:** Zoho-side defect. Not automatable. *Re-test after any Zoho API release.*
**UI path:** Setup → Modules and Fields → Student Cases → Validation Rules → New Rule. ~3 min, ~8 clicks.

---

## 2. Five workflow rules — CONSOLE ONLY (partially automatable)

| Check | Result |
|---|---|
| Public API exists? | **Yes, on v8 only** — `/settings/automation/workflow_rules` (v7 returns `API_NOT_SUPPORTED{supported_version:8}`) |
| Rule + criteria creatable? | **Yes.** Full schema derived from a live rule: `execute_when{type,details{trigger_module,repeat}}` + `conditions[]{sequence_number,criteria_details{criteria{group_operator,group[]}},instant_actions}`. Criteria were accepted by the API |
| Blocker | Every rule requires **≥1 action entity** in `instant_actions.actions`; actions are referenced by **id**, not defined inline (all inline shapes → `INVALID_DATA`) |
| Can actions be created? | **No.** `POST /settings/automation/tasks` → `INVALID_REQUEST` (read-only). `/settings/automation/actions/*` → `INVALID_URL_PATTERN` on v7 and v8. `/settings/actions/*` → `INVALID_MODULE` (path segment parsed as a module) |
| Workaround considered | Referencing an existing unrelated action (`Big Deal Alert`) would create rules that fire the *wrong* action — rejected as worse than not creating them |
| Browser automation? | Unavailable — Surface A |

**Verdict:** Rules are automatable; their **actions are not**, which makes a complete rule
un-creatable. Not automatable end-to-end.
**UI path:** Setup → Automation → Workflow Rules → Create Rule. ~20 min total, ~12 clicks per rule.

---

## 3. User provisioning — BLOCKED ON MISSING DATA (not a platform limit)

| Check | Result |
|---|---|
| Public API exists? | **Yes** — `POST /users`; scope `ZohoCRM.users.ALL` is **granted and verified** |
| Platform blocker? | **None** |
| Actual blocker | `config/tenant-richenquest.json → contributors.roster` contains **no email addresses**. A user cannot be created without one, and creation emails a real person |
| Licences available? | **Yes** — 10 purchased, 1 consumed (verified via `/org`) |
| Roles ready? | **Yes** — Counselor / Operations / Marketing created via API |

**Verdict:** NOT a platform limitation. Fully automatable the moment 6 email addresses are supplied.
This is the only open item that is purely an input gap.

---

## 4. 2FA enforcement — CONSOLE ONLY

| Check | Result |
|---|---|
| CRM API? | **No.** 2FA is an identity/directory control, not a CRM resource — no endpoint exists under `/crm/v7` or `/crm/v8` |
| Correct surface | Zoho **Admin Panel** (`accounts.zoho.in/admin`), which exposes no public REST API for security policy |
| Browser automation? | Unavailable — Surface A |

**Verdict:** Not automatable. **UI path:** Admin Panel → Security → Security Policies → enforce 2FA.
~2 min, ~5 clicks.

---

## 5. Cliq duplicate-channel cleanup — CONSOLE ONLY

| Check | Result |
|---|---|
| Delete API? | **No.** `DELETE /api/v2/channels/{id}` → `request_url_invalid`; `DELETE /api/v2/channelsbyname/{name}` → `request_method_invalid`; `DELETE /api/v1/channels/{id}` → `request_url_invalid` |
| Enumerate to target them? | **No** — listing needs `ZohoCliq.Channels.READ`, which `Channels.CREATE` does not grant |
| Browser automation? | Unavailable — Surface A |

**Verdict:** Not automatable. Cleanup is manual and is a consequence of **INC-2**.
**UI path:** Cliq → Channels → open duplicate → ⋮ → Delete Channel. ~3 min, ~4 clicks × 6.

---

## Reclassified — items previously assumed manual that were PROVEN automatable

The original AM0.4 spec listed six items as "console-only". All six were assumptions, and all six
were wrong. They are now automated and covered by idempotent, tested provisioners:

| Item | Now automated by |
|---|---|
| Module rename Deals → Student Cases | `PUT /settings/modules/Deals` |
| 11-stage pipeline + probabilities | `provision-pipeline.mjs` |
| Email duplicate-check | `PATCH /settings/fields/{id}` with `unique{case_sensitive}` |
| Assignment rule | `POST /settings/automation/assignment_rules?module=Leads` |
| Data sharing Private + hierarchy | verified already correct via `/settings/data_sharing` |
| `Assigned Counselor` user-lookup field | `POST /settings/fields` — the spec's "unreliable via API" was false |

**Lesson recorded:** "console-only" in a spec is a hypothesis, not a finding. Re-probe every such
claim against the live API before accepting it.
