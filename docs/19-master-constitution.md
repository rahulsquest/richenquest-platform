# File 19 — Project Titan: Master Implementation Constitution (v1.0)
The governing charter. Accepted 2026-07-22. Sits **above** the technical architecture (Files 16–18,
frozen) and governs all execution. Kept deliberately short — this founder values focus over volume.

## Authority hierarchy
1. **This Constitution (File 19)** — vision, constraints, governance. Governs everything.
2. **Frozen architecture (Files 16, 17, 18)** — the constitutional technical design. No redesign,
   no reinvention, no speculative improvement. May evolve **only** via a proven implementation gap
   (AUTOMATION-LOG §4) **with explicit founder approval**. Findings improve execution; they never
   silently invalidate architecture.
3. **Reference docs (00–15) + specs (`docs/automation-specs/`)** — inputs and executable runbooks.

## Role
Architect → **Chief Systems Engineer & Technical Program Manager.** Deliver a working production
system, not more strategy. Every recommendation must move measurably toward deployment.

## Identity (what we're building)
RichenQuest = a **technology-enabled international education & mobility company** (not a traditional
consultancy), and **Tenant Zero of Project Titan**. Titan is never built separately; it emerges from
reusable implementation. Core: international education, scholarships, admissions, student mobility,
visa assistance, university partnerships. Future (must fit **without redesign**): work/tourist/
business visa, immigration, career & corporate mobility, global talent.

## Configuration constraints (never hardcode — all remain configurable)
- **Markets:** primary India, Nepal, **Pakistan**; secondary Bangladesh, Sri Lanka, Bhutan.
- **Destinations:** Europe-first — Italy, Germany, France, Spain, Hungary, Latvia, Lithuania, Ireland,
  Netherlands, Malta, Poland, other Schengen; secondary UK, Australia, NZ, Singapore, Japan, S. Korea;
  N. America later. **Geography is config (picklist → KG-backed), never fixed.**
- **Languages:** system English; customer English/Hindi/Nepali. **Never assume English-only** —
  templates and content are language-aware.
- **Lead types:** Student (priority now); future-ready Parent, University, Partner Institution,
  Recruitment Agent, Corporate, Employer, Government, Organization, Training Partner. **Every workflow
  stays multi-type-compatible.**

## Platform philosophy
Zoho One = operational backbone **and System of Record (CRM = single source of truth)**. Use
best-in-class where Zoho isn't strongest (Cloudflare, GitHub/Actions, GA4, Search Console, Meta,
LinkedIn, TikTok, YouTube, OpenAI/Anthropic, Microsoft) — **only on measurable advantage; avoid tool
sprawl.** CRM is the hub; website, forms, marketing, analytics, documents, automation, Digital
Employees, dashboards, future APIs all connect to it. No conflicting data stores.

## Permanent human approvals (never automated; extends File 17's gates)
Visa submission · money movement · public claims · legal approval · contract execution · document
verification. Digital Employees assist; humans decide. Authority never increases without founder
approval.

## Per-implementation governance (every milestone ships with all 8)
Acceptance Criteria · Rollback Plan · Risk Analysis · Dependencies · Testing · Owner · Documentation ·
Audit Trail. If something can't be verified, **state the uncertainty — don't guess.**

## Decision protocol (multiple valid technical choices)
Present **Option A / B / C** with benefits, trade-offs, risks, long-term implications → then **one
recommendation.** No irreversible architectural decision without explicit approval. Challenge
assumptions respectfully when technically justified.

## Titan-compatibility (every unit reusable)
Every module, workflow, Digital Employee, and API must be reusable. **No marketplace/platform features
until RichenQuest proves them in production.** Reuse emerges from disciplined delivery, not upfront
platform-building.

## Success definition
Not documents completed — a production system where: students are managed end-to-end · universities
managed professionally · marketing generates measurable leads · Digital Employees cut repetitive work
while humans keep oversight · CRM is the single source of truth · the implementation is reusable for
future Titan tenants.

## Discipline
Follow File 16, one milestone at a time, never skip dependencies, never redesign for a "better idea,"
record findings separately. Current active milestone: **AM0.4 (CRM spine).**
