# Project: Comprehensive Codebase Dead-Code & ADR-0009 Audit

## Architecture
- Frontend: Next.js 16 (App Router), React 19, Tailwind CSS, Lucide icons, components (`components/ui/`, `components/roadmap/`, `components/floating-bot/`)
- Backend Abot: Python FastAPI service (`roadmap-rag-assistant/`), LangChain/Langfuse, RAG pipelines, 11 active CUD tools (post ADR-0009)
- Database & Schemas: SQLite / Turso DDL (`prisma/schema.prisma`, `prisma/init-turso.sql`, `roadmap-rag-assistant/tests/fixtures/schema.sql`)
- API Routes: Next.js `app/api/**/route.ts` (21 routes) + FastAPI `rag_service/api/routes.py` (7 routes)
- Architecture Docs & Specs: `docs/adr/` (ADR-0009, ADR-0010, ADR-0011), `docs/code-intel/`, `GLOSSARY.md`, `.handoff/specs/`

## Feature Inventory
| # | Feature / Area | Description | Milestone | Status |
|---|----------------|-------------|-----------|--------|
| 1 | Git Synchronization | Check remote, pull latest changes from `main`, verify commit hash and clean state | M1: Git Sync | DONE |
| 2 | Frontend Logic & UI | Identify unreferenced UI components, unused hooks/utils, dead pages or routes | M2: Frontend Audit | DONE |
| 3 | Abot Python & ADR-0009 | Audit 14 old vs 11 current tools, Layer/Group removal leftovers in prompts/schemas/code | M3: Abot ADR-0009 Audit | DONE |
| 4 | DB Schema & API Routes | Audit orphaned schema models, migrations, API route handlers without consumers | M4: Schema & API Audit | DONE |
| 5 | Docs & Spec Misalignment| Audit specs, ADRs, GLOSSARY, and guides that deviate from actual implementation | M5: Docs/Spec Audit | DONE |
| 6 | Technical Verification | Verify findings with `yarn tsc`, `yarn lint`, `pytest`, `yarn check:knowledge-index`, GitNexus | M6: Technical Verification | DONE |
| 7 | Forensic Integrity Audit| Forensic auditor verifies authenticity, file:line accuracy, zero unauthorized edits | M7: Forensic Audit | DONE |
| 8 | Comprehensive Synthesis| Synthesize complete read-only audit report with exact file:line references | M8: Final Report | IN_PROGRESS |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Git Synchronization | Sync and verify latest state from branch `main` | none | DONE |
| M2 | Frontend Exploration | Audit Next.js UI components, dead pages, unused logic | M1 | DONE |
| M3 | Abot & ADR-0009 Exploration | Audit Python Abot tools (14 vs 11), Layer/Group leftovers | M1 | DONE |
| M4 | Schema, API & Docs Exploration | Audit DB schemas, API endpoints, spec misalignment | M1 | DONE |
| M5 | Technical Verification | Validate findings with CI scripts, pytest, GitNexus | M2, M3, M4 | DONE |
| M6 | Forensic Integrity Audit | Auditor check and binary veto verification | M5 | DONE (CLEAN) |
| M7 | Final Report Delivery | Comprehensive synthesized report presented to user | M6 | IN_PROGRESS |
