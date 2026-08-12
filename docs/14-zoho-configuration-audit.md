# File 14 — Zoho Configuration Audit (verified against the live org)

**Audited:** 2026-08-13, via the Zoho CRM API against the production org.
**Org:** RICHENQUEST PRIVATE LIMITED · zgid `60074018310` · created 2026-06-12 · INR · Asia/Kolkata.

> **This file supersedes the Zoho rows in File 13.** That checklist records "Zoho One not
> activated" and "CRM build not started". Both are false. The CRM build in File 01 is
> substantially complete and has been since late July 2026.

## 1. Verified BUILT

| Item | Evidence |
|---|---|
| Zoho One | **ACTIVE** — `license_details.trial_type: zohooneenterprise`, 10 user licenses. Note `paid: false`, `paid_type: free` — this is a **trial**. |
| Org configuration (File 01 §1.2) | name `RICHENQUEST PRIVATE LIMITED`, currency `Indian Rupee - INR`, time zone `Asia/Kolkata`, primary email `rahul@richenquest.com` |
| Deals renamed (File 01 §2) | `singular_label: "Student Case"`, `plural_label: "Student Cases"` |
| Leads custom fields (File 01 §3) | **7/7 present** — `Lead_Source_Detail`, `Interested_Country` (multiselect), `Interested_Level`, `Intended_Intake`, `Budget_Range`, `Preferred_Language`, `WhatsApp_Number`. Plus beyond spec: `UTM_Source`, `UTM_Medium`, `UTM_Campaign`, `Lead_Type`, `Market` (12 custom fields of 67 total) |
| Student Cases fields (File 01 §3) | **7/7 present** — `Destination_Country`, `Course_University_Final`, `Assigned_Counselor` (userlookup), `Service_Package`, `Document_Status`, `Visa_Status`, `Next_Deadline`. Plus `Lane`, `Career_Record_Id`, `Lost_Reason` (10 custom of 39) |
| Pipeline stages (File 01 §4) | **11/11 exactly as specified**: New Inquiry · Counseling Booked · Counseling Done · Agreement Sent · Agreement Signed · Documents in Progress · Applications Submitted · Offer Received · Visa Filed · Visa Approved — Won · Closed Lost |
| Lost Reason (File 01 §4) | **6/6 exactly as specified**: Went Silent · Chose Competitor · Budget · Not Eligible · Postponed · Visa Refused |
| Assignment rule (File 01 §5.1) | `Student_Lead_Routing` — "Config-driven Phase-1 routing (OI-4)", created 2026-07-23 |
| Roles & users | 3 active users. `Rahul Kumar` role **CEO** (Administrator); `tech@` and `partnerships@` role **Operations** (Standard) |

## 2. Verified MISSING or NOT LIVE

| Item | Evidence | Impact |
|---|---|---|
| University Partnerships module (File 02) | **0 custom modules exist.** The only non-default modules are stock subforms (QuotedItems, OrderedItems, PurchaseItems, InvoicedItems) and the system-hidden DealHistory | Partnership pipeline has nowhere to live |
| Real lead flow | **4 records total, all test data** — last names `Two`, `Check`, `Check`, `Verify`, created 2026-07-28, **every one with `Lead_Status: null` and `Lead_Source: null`** | The funnel has never carried a real inquiry |
| Website → CRM path | No Zoho Form exists on the live site; the new site uses WhatsApp/tel/mailto only | Lead capture is manual |

## 3. NOT VERIFIABLE through the available API surface

These are **unknown, not absent** — do not record them either way without console evidence:

- Workflow rules (File 01 §5.1–5.5) — no read endpoint in the available tool surface
- Blueprints, validation rules, layout rules
- Email templates, Cliq notifications
- Zoho Forms, Bookings, Campaigns, WorkDrive, Desk, Sign configuration

## 4. Automation boundary (what can and cannot be built without the console)

**Automatable via API:** custom **fields**, tags, records, COQL reads, module/field/user/assignment-rule
inspection.

**Console-only — no API exists in the available tool surface:** custom **module** creation
(blocks File 02), workflow rules, blueprints, validation rules, assignment-rule creation, roles,
layouts, and **every Zoho Forms operation** (there is no Zoho Forms MCP server connected at all).

This boundary is the reason the remaining Phase 1 work stops at a console action rather than
continuing autonomously.
