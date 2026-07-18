# ADR-003 — Zoho is the backend; the website is stateless with no database

**Status:** Accepted (founder requirement, 2026-07-19)

## Context
RichenQuest runs its entire operation on Zoho One (Files 00–05): CRM is the system of record
for leads/students/partnerships, Books for finance, WorkDrive for documents, Campaigns for
marketing, Analytics for reporting. The platform vision adds Creator and Catalyst later.

## Decision
The public website stores nothing. Every data flow terminates in Zoho:
Visitor → Website → Zoho Forms → CRM → Zoho Automation → Email + WhatsApp → Analytics →
(future) AI. Forms are native Zoho Forms→CRM embeds — no custom submission handling, no
website database. Catalyst Data Store may appear in Phase 2+ only for state that belongs to no
Zoho product (AI job logs, portal sessions, short-TTL caches) and never duplicates CRM master
data.

## Consequences
- One fact lives in one system; no sync bugs, no PII on the web tier, dramatically simpler
  DPDP/GDPR posture (all PII in Zoho India DC).
- Website features are constrained to what Zoho embeds/APIs can do — this is accepted and
  deliberate ("designed around Zoho rather than treating Zoho as an add-on").
- Lead capture availability depends on Zoho uptime; mitigation: WhatsApp click-to-chat and
  mailto links as zero-dependency fallback contact paths on every page.
