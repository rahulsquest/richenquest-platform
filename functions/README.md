# Catalyst Serverless Functions (scaffold — Phase 2+)

Empty by design. The Version 1 website needs no backend: forms, chat, and booking run on
native Zoho embeds (ADR-003). Functions land here starting Phase 2 (File 09 §8–9).

## Rules for adding a function (read before your first one)

1. **ADR first.** Every new function starts with an ADR describing what it does, what Zoho
   scopes it needs, and why an embed/native Zoho feature can't do it.
2. Naming: `api-<resource>` (Advanced I/O REST), `hook-<source>` (webhook receivers),
   `job-<name>` (cron), `ai-<capability>` (AI services).
3. Secrets only in Catalyst environment variables — never in code, never in git.
4. Webhook receivers verify signatures before touching payloads.
5. All CRM writes go through documented helpers with audit logging — especially AI modules
   (File 09 §9 guardrails).
6. Structured logs with request IDs; idempotent handlers wherever a caller may retry.
7. First planned candidates, in order: branded lead-capture proxy → CRM webhook bridge →
   student status endpoint (portal).
