# Task Assignment: DB Schemas, API Routes & Documentation Audit (M4)

## Objectives
Perform a thorough, read-only audit of database schemas, API routes, and documentation across the codebase:
1. Database Schemas & Migrations:
   - Check SQL migrations and table schemas (`supabase/`, `db/`, etc.).
   - Are there orphaned tables, columns, or views that are no longer queried or used by either Next.js frontend or Abot backend?
2. API Routes:
   - Check all Next.js route handlers under `app/api/**/route.ts`.
   - Trace each route to find if it has active callers from the frontend (via fetch, tanstack query, server actions, etc.) or external webhooks.
   - Flag any orphaned or obsolete API routes.
3. Documentation & Specs Misalignment:
   - Check `docs/`, `GLOSSARY.md`, `.handoff/specs/`, `README.md`, etc.
   - Identify specs or documentation that describe superseded architectures, broken links, or obsolete contracts.
4. Strictly read-only: DO NOT edit or remove any files.

## Output Requirements
- Deliver findings to `.agents/teamwork/teamwork_explorer_schema_docs/handoff.md`.
- Structured tables for Schemas, API Routes, and Docs with `file:line`, status, caller evidence, and notes.
- Notify orchestrator (7dabfc33-21ba-4c83-9da9-779408f893c0) via `send_message`.
