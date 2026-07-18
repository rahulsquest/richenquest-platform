# RichenQuest Platform

The technical foundation of **RichenQuest Private Limited** — an education and immigration
consultancy headquartered in Patna, India, serving students across India and Nepal.

This repository is not just a website. It is the codebase of RichenQuest's **Digital Operating
Platform**: a static public website today, growing into a Zoho-integrated inquiry system,
student portal, admin dashboard, and AI service layer — all on Zoho Catalyst.

## Repository map

| Path | Purpose |
|---|---|
| `docs/` | Business + technical documentation. Files 00–08 are business systems; 09 is the approved architecture; 10 is development standards; `docs/adr/` records every major technical decision. |
| `website/` | The public static website. Source in `website/src/`, build output in `website/dist/` (never committed). |
| `functions/` | Zoho Catalyst serverless functions. Scaffold only until Phase 2 — see `functions/README.md`. |
| `scripts/` | Repo tooling. `claims-guard.mjs` blocks builds containing unverified company claims. |
| `.github/workflows/` | CI (build + claims-guard) and Catalyst deployment workflows. |

## Quickstart (developers)

Requirements: Node.js ≥ 20. No npm installs needed — the build has **zero dependencies**.

```bash
node website/build.mjs        # build → website/dist/
node website/serve.mjs        # build + local server on http://localhost:8080 + watch
node scripts/claims-guard.mjs # verify no banned claims in the built site
```

## Non-negotiable rules

1. **Read `docs/10-development-standards.md` before your first commit.**
2. **The website is stateless.** All data lives in Zoho (CRM, Books, WorkDrive, Campaigns). No website database.
3. **Company facts come only from `website/src/data/claims.json`**, which mirrors the Verified
   Claims Library (`docs/08`). Changing it requires founder sign-off. CI enforces this.
4. **No new dependencies or frameworks without an ADR and founder approval** (see ADR-001/002).
5. Never invent or exaggerate company information — anywhere, including code comments and alt text.

## Deployment

GitHub Actions → Zoho Catalyst web hosting. `main` deploys to the Catalyst **Development**
environment; Production deploys from release tags with manual approval. Catalyst project setup
is tracked in Milestone M0 (see `docs/09-technical-architecture.md` §13).
