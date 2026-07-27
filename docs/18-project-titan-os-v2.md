# File 18 — Project Titan: Digital Employee OS V2
Evolving the RichenQuest Digital Employee OS (File 17) into a platform RichenQuest uses first and
Project Titan later commercializes. Status: **architecture for approval, 2026-07-22. No code.**

**Relationship to File 17:** this is an *evolution, not a replacement*. The seven employees (ARIA,
ATLAS, SCOUT, ECHO, LEDGER, CADENCE, COMPASS) are unchanged. The Authority Ladder (L0–L5, L5
reserved-never), human-in-the-loop gates, CRM-first auditable memory, explicit event-based handoffs,
and no-hidden-state rule from File 17 §2 are **permanent platform primitives** and are inherited by
everything below. Nothing here modifies an existing employee; it builds the architecture *around*
them.

---

## 0. Chief Architect's point of view (read first)

You asked me to design so that *nothing built today needs redesign later*. That is exactly the right
instinct, and it is achievable — but only if we are honest about three things, because getting them
wrong is how platform dreams kill the company that was supposed to fund them.

**1. Titan's only credible foundation is RichenQuest actually working — and RichenQuest has not run a
single live automation yet.** Zoho One is still not activated; File 16's AM0 hasn't started. You
cannot productize an operating model you have never operated. A "digital workforce platform" whose
reference customer has never processed one real lead through one real automation is a pitch deck, not
a product. So the entire migration roadmap (§11) is **proof-gated**: each Titan phase is *earned* by
RichenQuest results, never scheduled by calendar. This document's job is to make sure the RichenQuest
build we do next is Titan-*shaped*, so Titan becomes a repackaging, not a rewrite. **It is emphatically
not permission to build platform features now.** If we start building a marketplace before ARIA sends
one real welcome message, we will have failed.

**2. "Vendor-independent" and "Zoho-native" are in genuine tension — and the honest resolution is
"design the seam, build one side."** Today RichenQuest runs on Zoho (ADR-003, correctly). A hospital
installing LEDGER cannot use Zoho Books it doesn't have. The architecture answer is the
**Capability/Adapter split** (§6): employees depend on abstract *capabilities* (`Invoice.issue`,
`CRM.upsertLead`, `Notify.channel`), and Zoho is the *first adapter* implementing them. The
`functions/zoho/` layer I already built is, in this framing, literally the Titan Zoho adapter — so
this isn't new work, it's a renaming of work done. But: **we design the capability interfaces now and
build only the Zoho adapter.** We do not build a QuickBooks adapter until a paying tenant needs one.
Designing for vendor-independence is free; building it speculatively is the expensive mistake.

**3. Titan-as-SaaS is a categorically more serious undertaking than RichenQuest-the-consultancy —
legally, not just technically.** The day you hold a second company's students' (or a hospital's
patients') data, you become a multi-tenant data *processor*: DPAs, breach liability, likely SOC 2,
sub-processor disclosures, tenant isolation you can prove to an auditor. That is a different risk
class and a different company. The architecture below is multi-tenant-*ready* so you never have to
retrofit it — but the *business* decision to become a data processor for other organizations should
be made with eyes open, not sleepwalked into because the architecture allowed it.

**One genuinely useful sequencing insight, as your architect:** the new **Layer 2 intelligence
employees are the safest thing in this entire document to build early** — because they are read-only
(L0–L1), they never touch the operational spine or the human gates, and they observe the *outside*
world (universities, policies, search, reputation) to brief humans. They can deliver real value —
even real AI value — *before* Zoho activation, with almost no blast radius, because the worst a
read-only intelligence employee can do is be wrong in a briefing a human reads critically. If you
want an early, low-risk win that also seeds the Knowledge Graph (the real long-term asset), **SAGE and
ORION are where I'd point** — not the operators, which must wait for the CRM spine.

**My thesis:** adopt V2 as the *shape* of everything, build nothing platform-shaped yet, earn each
Titan phase with RichenQuest proof, keep the human gates permanent across every tenant forever, and
treat the Knowledge Graph — not the employees — as the durable moat. Do that and Titan is inevitable
and honest. Rush it and you'll have a beautiful platform architecture and a dead consultancy.

---

## 1. Deliverable 1 — Digital Employee OS V2 Architecture (the layered model)

V2 replaces the flat roster with **four layers over a platform kernel**, with a strict rule:
**authority flows in one direction — intelligence informs, operations act, executive synthesizes —
and it never flows backward.**

- **Layer 0 — Platform Kernel** (the OS itself, was File 17 §2 "the kernel"): identity & tenancy,
  CRM-first memory, the event bus, the Authority-Ladder policy engine, the audit log, and the
  Capability/Adapter abstraction. Everything runs on this. *New in V2: formalized as the reusable
  platform substrate, not just "shared plumbing."*
- **Layer 1 — Core Business Operations** (unchanged from File 17): ARIA, ATLAS, SCOUT, ECHO, LEDGER,
  CADENCE. **They operate the business.** Authority up to L3, human gates capped at L2. They *act*.
- **Layer 2 — Intelligence Employees** (new): ORION, NOVA, SAGE, PULSE, AURORA. **They never act on
  the business** — hard-capped at L0–L1 (observe + brief), rarely L2 (draft a recommendation). They
  feed verified intelligence upward to Layer 1 (to inform action) and Layer 3 (to inform decisions),
  and they populate the Knowledge Graph.
- **Layer 3 — Executive Intelligence** (COMPASS, extended): the Founder Command Center. Read-only
  (L0–L2 permanently). **It recommends; the founder decides.**
- **Layer 4 — Platform Layer** (new, the Titan foundation): multi-tenancy, the Employee Manifest, the
  Marketplace, the adapter registry, and the Knowledge Graph as a shared service.

**The three-tier authority law (V2's headline governance property):** *Intelligence (L2 employees)
can never act. Operations (L1 employees) act only within their ceilings. Executive (L3) never acts at
all.* Action authority exists in exactly one layer, bounded by the ladder, gated by humans at the four
permanent L2 gates. This is what makes the whole system safe to sell to an enterprise: authority is
structurally, not just conventionally, contained.

---

## 2. Deliverable 2 — Layer Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ LAYER 3 · EXECUTIVE INTELLIGENCE            COMPASS → Founder Command Center    │
│ read-only (L0–L2) · synthesizes all layers · RECOMMENDS · founder DECIDES      │
└───────────────▲───────────────────────────────────────────────▲───────────────┘
                │ signals / synthesis                            │ decisions (human)
┌───────────────┴───────────────────────┐   ┌───────────────────┴───────────────┐
│ LAYER 2 · INTELLIGENCE (read-only L0–L1)│   │ LAYER 1 · CORE OPERATIONS (act ≤L3)│
│ ORION  University Intelligence          │──▶│ ARIA   Lead Response               │
│ NOVA   SEO Intelligence                 │   │ ATLAS  Case & Application Coord.    │
│ SAGE   Research Intelligence            │─ ▶│ SCOUT  Partnerships                │
│ PULSE  Reputation Intelligence          │   │ ECHO   Growth & Content            │
│ AURORA Social Intelligence              │──▶│ LEDGER Finance                     │
│ (never act — only inform)               │   │ CADENCE Team Ops        (4 human   │
└───────────────▲─────────────────────────┘   │                         gates @L2) │
                │ populate / read              └──────────────▲─────────────────────┘
┌───────────────┴──────────────────────────────────────────── ┴───────────────────┐
│ LAYER 4 · PLATFORM   Employee Manifest · Marketplace · Adapter Registry           │
│                      University Knowledge Graph (shared facts + per-tenant overlay)│
├──────────────────────────────────────────────────────────────────────────────────┤
│ LAYER 0 · KERNEL   Tenancy & Identity · CRM-first Memory · Event Bus ·             │
│                    Authority-Ladder Policy Engine · Audit Log · Capability/Adapter │
│                    (Zoho adapter = functions/zoho + Catalyst; first of many)       │
└──────────────────────────────────────────────────────────────────────────────────┘
      one-directional authority: INTELLIGENCE informs ▶ OPERATIONS act ▶ EXECUTIVE synthesizes
```

---

## 3. The Employee Manifest (the modularity primitive that makes everything else possible)

Every Digital Employee — the seven existing and the five new — is described by one standard
declarative manifest. This single artifact is what makes employees **modular, replaceable,
installable, and marketplace-ready**. If every employee has a manifest from day one, RichenQuest's
employees *are* Titan modules with no redesign — which is the whole ask.

**Manifest schema (every field the founder listed, standardized):**
```
identity:        id, name, layer, version, description
capabilities:    [capability IDs it provides/uses, e.g. CRM.upsertLead, Invoice.issue]
authority:       ceiling per capability (L0–L5); the 4 human-gate capabilities forced ≤ L2
permissions:     data scopes (which CRM modules/fields/records it may read/write)
memory:          what it stores + where (always CRM-first / Knowledge Graph; no private state)
inputs:          events + data it consumes (triggers, KG entities, other employees' outputs)
outputs:         events + records it produces (what downstream employees/humans consume)
triggers:        schedule (daily/hourly) + event triggers
kpis:            measurable outcomes it owns
dependencies:    other employees, capabilities, adapters, KG entities it needs
install_reqs:    adapters + apps + config a tenant must have to run it
human_roles:     which human role(s) it assists / escalates to
industries:      supported verticals (education, healthcare, …)
failure:         confidence floor, heartbeat, manual fallback (per File 17 §2.5)
premium:         optional paid capabilities (marketplace tiering)
```

**Example — ARIA expressed as a manifest (no change to ARIA; just formalized):**
```
identity:    { id: aria, name: "Lead Response", layer: 1, version: 1.0 }
capabilities:{ uses: [Lead.capture, Lead.dedupe, Lead.assign, Message.template.send,
                      Booking.create, Content.draft] }
authority:   { Lead.assign: L3, Message.template.send: L3, Lead.qualifyOut: L2 }
permissions: { read/write: CRM.Leads; read: KnowledgeGraph.Universities,Scholarships }
memory:      { CRM.Leads fields+notes; no private state }
inputs:      { events: [LeadCreated]; KG: [University, Scholarship, VisaRule] }
outputs:     { events: [LeadQualified, CaseHandoff→ATLAS]; CRM.Task }
kpis:        { firstResponseMedian, contactRate, leadToBooked% }
dependencies:{ employees: [ATLAS]; capabilities: [Message.template.send]; adapters: [zoho,whatsapp] }
install_reqs:{ adapters: [crm, chat, messaging]; apps: [Forms, CRM, Cliq] }
human_roles: { assists: Counselor; escalates: Manager }
industries:  { education (default); generalizable: any lead-intake org }
failure:     { confidenceFloor→L1; heartbeat: #ops-alerts; fallback: manual SOP-01 }
```

The manifest is the contract. Swap an employee's implementation, keep its manifest → nothing
downstream breaks (**replaceable**). Publish the manifest → it's a marketplace listing
(**installable**). Change the adapter → same employee runs on a different vendor
(**vendor-independent**).

---

## 4. Deliverable — Layer 2 Intelligence Employees (new; read-only, never act)

All five share: **authority ceiling L0–L1 (L2 for drafted recommendations only), never L3+**; memory
lives in the **Knowledge Graph** (§9); they emit intelligence to Layer 1/3 and to the founder; they
escalate risk, never respond or act; failure handling per File 17 §2.5. Honest architectural note:
Layer 2 is where genuine custom AI lives (Catalyst functions + external data + LLM summarization) —
precisely *because* it is read-only and low-blast-radius. This is the safe home for "real AI."

| Employee | Mission | Key responsibilities | Primary sources / apps | Ceiling | Feeds |
|---|---|---|---|---|---|
| **ORION** — University Intelligence | Keep a verified, current picture of every institution we work with | Monitor university sites, scholarship/tuition/ranking/course/deadline/admission-requirement/visa-policy changes | Web monitors (Catalyst fns), official pages, uni-assist/gov sources → KG | L0–L1 | SCOUT, ATLAS, ARIA, KG |
| **NOVA** — SEO Intelligence | Grow organic reach without ever auto-publishing | Keyword research, search-intent mapping, internal-linking + content-cluster suggestions, competitor monitoring, GSC insights, technical-SEO recommendations, ranking tracking | Google Search Console, PageSense, competitor crawl → KG/Analytics | L0–L2 (recommend only) | ECHO, COMPASS |
| **SAGE** — Research Intelligence | Turn the outside world into founder briefings | Immigration-policy research, country/embassy updates, education trends, gov announcements, scholarship opportunities, industry reports | Curated sources + GenAI summarization → briefings | L0–L1 | COMPASS, SCOUT, ATLAS |
| **PULSE** — Reputation Intelligence | See reputational risk before it becomes loss | Monitor RichenQuest mentions, reviews, social sentiment, university + competitor mentions; **escalate risks, never respond** | Zoho Social listening, review sites, web mentions | L0–L1 | COMPASS (risk radar) |
| **AURORA** — Social Intelligence | Make social deliberate, not reactive | Content calendar, campaign planning, trend + hashtag analysis, platform + engagement analytics, **publishing recommendations (approval required)** | Zoho Social, platform analytics | L0–L2 (recommend only) | ECHO (executes), COMPASS |

**Boundary with Layer 1 (important — no overlap):** AURORA and NOVA *recommend* (what to post, which
keywords, which clusters); **ECHO executes** the drafting/scheduling/publishing — and publishing is a
human-approved, claims-guarded gate. ORION *observes* university changes; **SCOUT acts** on them.
Intelligence and action stay in separate layers, always.

---

## 5. Deliverable 5 — Founder Command Center (Layer 3: COMPASS extended)

COMPASS is unchanged in principle (read-only, recommends-not-decides, L0–L2 forever). V2 extends the
*architecture around it* into a single executive operating surface — the "one dashboard" the founder
opens.

**Structure — one pane, fully drill-down:**
```
COMPANY HEALTH SCORE (composite, components always visible — never a black-box number)
        │  drill ▼
DEPARTMENT SCORES:  Sales · Marketing · Finance · HR · Universities · Students
        │  drill ▼  (each department score = its employees' KPIs)
EMPLOYEE KPIs (ARIA firstResponse, LEDGER collection%, ATLAS deadlines-missed, …)
        │  drill ▼
THE UNDERLYING RECORDS (the actual leads, cases, invoices — the source of truth)

ALWAYS-ON PANELS:
  Cashflow summary · Lead funnel · University performance · Marketing performance ·
  Operations health · Recruitment status · Upcoming deadlines · Risk dashboard ·
  Growth dashboard · Pending decisions (awaiting founder) · Critical alerts
DAILY: 08:00 IST brief (red items only) · WEEKLY exec report · MONTHLY company health report
```
**Inputs:** every Layer-1 employee's KPIs + every Layer-2 employee's intelligence (SAGE briefings,
PULSE risk, NOVA/AURORA marketing signals, ORION university changes). **Authority:** L0–L2 — it
compiles, scores, and **recommends decisions**; it never executes them. **Decision Recommendations**
are presented as options with rationale and the data behind them; the founder acts. **Honesty rule
(from File 17, kept):** stale source → the brief says so, never a confident number over missing data.

This is also the **first Titan module a startup could install** ("give me COMPASS over my own data") —
which is why it's built manifest-first.

---

## 6. Deliverable 3 — Titan Platform Architecture (Layer 4: multi-tenancy)

**The control-plane / data-plane split (standard, auditable multi-tenancy):**
- **Shared control plane:** employee definitions + manifests, the Marketplace, the Authority-Ladder
  policy engine, the adapter registry, the shared public-fact layer of the Knowledge Graph. One
  codebase, versioned.
- **Isolated data plane per tenant:** each tenant (RichenQuest = **Tenant 0**) has its own CRM
  org/Catalyst data segment, its own installed-employee roster, its own config + authority policies,
  its own private Knowledge-Graph overlay, and **its own isolated audit log**. No tenant can read
  another tenant's data — provably, to an auditor.

**The Capability/Adapter abstraction (the vendor-independence seam):**
```
Digital Employee ──uses──▶ CAPABILITY (abstract: Invoice.issue, CRM.upsertLead, Notify.channel,
                                       Document.store, Message.template.send, Calendar.book)
                              │ resolved at install time by the tenant's
                              ▼
                           ADAPTER (concrete)
                           ├─ Zoho adapter  (functions/zoho — BUILT; RichenQuest's)
                           ├─ [future] QuickBooks adapter (Invoice.*)   ← build only when a tenant needs it
                           ├─ [future] Salesforce adapter (CRM.*)
                           └─ [future] Slack adapter (Notify.*)
```
An employee never imports Zoho; it calls a capability. The tenant's installed adapters resolve it.
**Build the interfaces now, ship only the Zoho adapter.** This is what lets a hospital eventually run
LEDGER on *its* accounting system without LEDGER changing.

**Where today's work already fits:** `functions/zoho/` = the Zoho adapter. The Authority Ladder =
the policy engine. CRM-first memory = the tenant data plane. The website's claims-guard = the
prototype of the platform content-governance gate. **We are already building Titan's Tenant 0 — we
just don't call it that yet.**

---

## 7. Deliverable 4 — Titan Marketplace design

**Premise:** each Digital Employee is an installable product; RichenQuest is the first customer; the
manifest (§3) *is* the listing.

**A marketplace listing = the employee's manifest, surfaced:** capabilities · permissions requested ·
authority levels (with the human gates shown explicitly — a selling point, not fine print) · memory
requirements · inputs/outputs · triggers · KPIs it will move · dependencies · installation
requirements (which adapters/apps) · required human roles · supported industries · premium features.

**Install flow (target state):** tenant admin browses → sees an employee's requested permissions +
authority ceilings up front (informed consent) → selects the adapters that satisfy its required
capabilities → assigns the employee to human role(s) → the employee runs, scoped, on that tenant's
isolated data, under that tenant's authority policy, with its own audit trail.

**Trust as the product:** unlike generic "AI agents," every Titan employee ships with its authority
ceilings, its human gates, and its audit guarantees *declared in the manifest*. The pitch is not
"autonomous AI" — it's **"a digital teammate whose limits you can read before you install it."** That
is the honest, enterprise-credible position, and it's the opposite of the AI-agent hype the founder
rightly wants to avoid.

**Premium/tiering:** base employee free/bundled; premium capabilities (e.g. NOVA advanced competitor
intelligence, COMPASS predictive health scoring once data supports it) as paid add-ons declared in the
manifest's `premium` field.

---

## 8. Deliverable 6 — Marketing Intelligence Architecture

An AI-assisted marketing department = **Layer-2 intelligence (recommend) + Layer-1 ECHO (execute) +
a governed publishing pipeline, all writing back to CRM.**

```
INTELLIGENCE (recommend)          EXECUTION (ECHO, act ≤L3)         GOVERNANCE (human + claims)
NOVA  → keywords, clusters,   ─▶  draft page/content/email    ─▶  CLAIMS GATE (the website's
        internal links, tech SEO       (GenAI, brand voice)          claims-guard, generalized)
AURORA→ calendar, trends,     ─▶  schedule social/campaign     ─▶  HUMAN APPROVAL (publish = L2 gate)
        hashtags, platforms                                    ─▶  PUBLISH → Website / Social / Campaigns
ORION → university facts      ─▶  university/course/scholarship ─▶  every claim traced to Knowledge
        (tuition, deadlines)         pages, kept current             Graph source (verifiable)
                                                                      │
                        Lead attribution (UTM) ◀───────── all content ┘ ─▶ CRM Leads (source-tagged)
```
**Scope covered:** SEO (NOVA→ECHO), social (AURORA→ECHO), content strategy (NOVA clusters), university
/ course / scholarship pages (ORION facts + KG → ECHO drafts → claims gate → publish), email campaigns
(Campaigns), lead magnets (ECHO), analytics (PageSense/GSC → COMPASS), lead attribution (UTM → CRM),
content approval (human L2 gate), publishing pipeline (governed). **Everything integrates with CRM**
via source-tagged attribution — the funnel is measured end to end. **Non-negotiable:** university/
course/scholarship content is generated *from Knowledge Graph facts with a traceable source*, and
every public claim passes the claims gate — the same discipline that governs the website today, now a
platform service.

---

## 9. Deliverable 7 — University Knowledge Graph (the durable moat)

A shared intelligence substrate all employees read and Layer-2 employees populate. **This — not the
employees — is the long-term asset**, because it compounds: every tenant and every ORION/SAGE
observation makes the public-fact layer more valuable (network effect), while private data stays
isolated.

**Entities:** Country · University · Course · Scholarship · Deadline · VisaRule · Partner · Contact ·
MOU · Event. **Relationships:** University *offers* Course; Course *eligible-for* Scholarship;
Country *has* VisaRule; University *in* Country; Partner *is* University (+ status); MOU *governs*
Partner; Deadline *applies-to* Course/Scholarship/VisaRule; Contact *at* University; Event *about*
University/Country.

**The critical split (shared vs private — the whole design):**
```
SHARED PUBLIC-FACT LAYER (network effect; grows with every tenant + ORION/SAGE observation)
  tuition, rankings, deadlines, visa rules, scholarship criteria, course catalogs
  — public facts, verifiable, source-traced, no tenant owns them
        │  overlaid, per tenant, isolated, private ▼
PER-TENANT PRIVATE OVERLAY (never shared, tenant-isolated)
  Partner status, Contacts, MOUs, commission terms, this tenant's students' fit
```
**Governance:** ORION/SAGE write the shared layer (verified, source-traced — never a fact without a
source, mirroring the claims library discipline); SCOUT/ATLAS/ARIA/ECHO read it; the private overlay
follows tenant isolation (§6). **Feeds every layer:** ARIA (shortlist hints), ATLAS (deadlines/visa
rules), SCOUT (partner intel), ECHO (content facts), COMPASS (university performance), and every
Layer-2 employee.

---

## 10. Deliverable 8 — Migration Roadmap (proof-gated: earn each phase)

Each phase is unlocked by *results*, not dates. No phase begins until the prior one is proven.

| Phase | What | Gate to enter (must be TRUE) | Titan meaning |
|---|---|---|---|
| **P0 — Tenant 0 foundation** | Zoho activation + CRM spine + AM1 spine live (File 16) | *(current blocker: Zoho not activated)* | Build the substrate; don't name it Titan |
| **P1 — RichenQuest operates** | Layer-1 employees live at L1–L3; COMPASS brief running; Knowledge Graph seeded by ORION/SAGE | AM0–AM2 done; automations stable 60+ days; human gates holding | Prove the operating model on one real company |
| **P2 — Multi-company (same owner)** | Run a *second* RichenQuest-owned entity/brand on the same platform | P1 metrics healthy; tenant data-plane isolation implemented + audited | First real multi-tenancy, low external risk |
| **P3 — SaaS (design partners)** | 2–3 external design-partner orgs install a subset (likely COMPASS or an intelligence employee first — lowest risk) | DPA/SOC2 posture real; adapter interfaces stable; marketplace manifest live | Become a data processor — deliberately, with legal footing |
| **P4 — Titan platform** | Open marketplace, multiple adapters, self-serve install, premium tiers | Repeatable install + retention across design partners | The enterprise digital-workforce platform |

**The rule:** if RichenQuest (Tenant 0) isn't thriving, no later phase begins. Titan is the reward for
RichenQuest working, never a bet placed instead of it.

---

## 11. Deliverable 9 — Governance Rules (extended; File 17's rules remain permanent)

Inherited & permanent (File 17): Authority Ladder L0–L5 (L5 reserved-never) · four human gates capped
at L2 forever · CRM-first auditable memory, no hidden state · explicit event-based handoffs · manual
fallback always exists · substrate-mediated (no black-box agent-to-agent) collaboration.

New in V2:
1. **Three-tier authority law:** intelligence (L2 employees) can never act; operations act within
   ceilings; executive never acts. Enforced by the policy engine, not convention.
2. **Manifest-or-it-doesn't-exist:** no employee runs without a complete manifest (§3). The manifest
   is the enforced contract for permissions and authority.
3. **Adapter isolation:** an employee may only use capabilities its manifest declares, resolved
   through the tenant's adapters — never a direct vendor call.
4. **Tenant isolation is absolute:** no cross-tenant data read, ever; per-tenant audit logs;
   provable to an auditor. (Precondition for P3.)
5. **Source-traced knowledge:** nothing enters the shared Knowledge-Graph fact layer without a
   verifiable source — the claims-library discipline, generalized to the platform.
6. **Content governance as a platform service:** every public output passes the claims gate + a human
   L2 approval, for every tenant — the website's claims-guard becomes a platform primitive.
7. **Digital employees are an internal/product operating model, never an external autonomy claim** —
   no tenant markets "AI employees did X"; the honest frame is "a governed digital teammate with
   declared limits." (Extends File 17's anti-AI-washing rule to all tenants.)

---

## 12. Deliverable 10 — Risks & Mitigations

| # | Risk | Mitigation |
|---|---|---|
| R1 | **Platform-before-proof** — building Titan before RichenQuest runs | Proof-gated roadmap (§10); P0/P1 are RichenQuest-only; no marketplace code until P3 gate |
| R2 | **Focus dilution** — 5 people, pre-launch, chasing a platform | This doc changes the *shape* of RichenQuest work, adds no RichenQuest work; Titan phases are future |
| R3 | **Vendor lock-in vs premature abstraction** | Design capability seams now, build only the Zoho adapter; add adapters on paying demand |
| R4 | **Multi-tenant data breach / processor liability** | Control/data-plane split; tenant isolation audited before P3; DPA/SOC2 as explicit P3 gate; conscious business decision to become a processor |
| R5 | **Anthropomorphized over-trust across tenants** | Authority ceilings + 4 human gates are platform-enforced for every tenant, not per-deal |
| R6 | **AI-washing at commercial scale** | Manifest declares real capabilities + limits; marketing frame is "governed teammate," not "autonomous AI"; claims discipline is a platform service |
| R7 | **Knowledge-Graph fact rot / bad intelligence** | Source-traced facts only; ORION/SAGE verify; confidence floors; humans read intelligence critically (it never acts) |
| R8 | **Intelligence layer scope creep into action** | Three-tier authority law: L2 employees structurally cannot act; enforced by policy engine |
| R9 | **Regulatory divergence across verticals** (a hospital ≠ a school) | Per-industry manifest `industries` + per-tenant authority policy; don't enter a vertical until its compliance is understood |
| R10 | **Complexity outrunning the team** | Manifest-driven uniformity; one kernel; build one employee at a time (File 16 discipline carries into Titan) |

---

## 13. How RichenQuest becomes Titan (the vision, honestly stated)

Titan is **not an AI chatbot.** It is an **Enterprise Digital Workforce Platform**: organizations
assign Digital Employees to departments, each employee operates within a declared authority ceiling on
the organization's own data through pluggable adapters, humans retain every meaningful decision, and
every action is auditable. The product is not autonomy — it is **governed, explainable, installable
digital labor with the human kept firmly in command.**

The path is an evolution, not a pivot:
**RichenQuest (Tenant 0)** proves the operating model on one real company →
**Multi-company** proves isolation on a second owned entity →
**SaaS** proves repeatability with a few design partners (starting with the lowest-risk, read-only
employees) →
**Titan** opens the marketplace where any organization installs the employees it needs.

Nothing built for RichenQuest is thrown away, because everything was built to the manifest, on the
kernel, through adapters, under the ladder — the platform primitives were there from the first
employee. RichenQuest doesn't *migrate* to Titan; RichenQuest *is* Titan's first tenant, and Titan is
what RichenQuest's operating system becomes once it has earned the right to carry other companies.

*Approve this and it governs the shape of everything we build for RichenQuest — while the build order
stays exactly File 16, starting at AM0.1 (Zoho activation), one employee at a time. We earn Titan; we
don't schedule it.*
