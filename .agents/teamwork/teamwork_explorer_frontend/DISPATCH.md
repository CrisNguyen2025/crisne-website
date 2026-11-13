# Task Assignment: Frontend Dead Code & Orphaned UI Audit (M2)

## Objectives
Perform a thorough, read-only audit of the Next.js frontend codebase for dead, unused, or orphaned code:
1. UI Components: Inspect `components/` (`ui/`, `shared/`, `layout/`, `floating-bot/`, etc.) for components that are never imported or rendered anywhere.
2. Pages & Route Groups: Inspect `app/` for dead routes, unreachable pages, or obsolete route handlers.
3. Hooks & Utilities: Inspect `hooks/`, `lib/`, `utils/`, `types/` for functions, hooks, or type definitions that are unreferenced.
4. Verify lack of references using ripgrep (`grep_search`), call analysis, or imports tracing across the workspace.
5. Strictly read-only: DO NOT modify, delete, or clean up any code.

## Output Requirements
- Deliver your findings to `.agents/teamwork/teamwork_explorer_frontend/handoff.md`.
- Include a structured table with:
  - File path and line number (`file:line`)
  - Type (UI Component, Hook, Utility, Page, Type)
  - Verification Evidence (how you proved it is unused / 0 references)
  - Impact / Risk assessment
- Notify orchestrator (7dabfc33-21ba-4c83-9da9-779408f893c0) via `send_message`.

## 2026-11-10T09:29:32Z
You are teamwork_explorer_frontend.
Your working directory is /Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/teamwork_explorer_frontend/
Your parent orchestrator conversation ID is 7dabfc33-21ba-4c83-9da9-779408f893c0

Read these files before starting:
- /Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/ORIGINAL_REQUEST.md
- /Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/teamwork_explorer_frontend/DISPATCH.md
- /Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/orchestrator/PROJECT.md

TASK:
Audit the Next.js frontend codebase for dead, unreferenced, obsolete, or orphaned code:
1. UI Components:
   - Check all components in `components/ui/`, `components/shared/`, `components/layout/`, `components/floating-bot/`, `components/` for unused components (components not imported or rendered anywhere in `app/` or other components).
   - Check if any floating-bot or legacy chat components are completely orphaned or unmounted.
2. Pages & Routes:
   - Check `app/` for any dead pages, unused layouts, test pages, or unreachable route groups.
3. Hooks & Utilities & Types:
   - Check `hooks/`, `lib/`, `types/` for functions, custom hooks, or types that have 0 references across the project.
4. Strictly read-only: DO NOT modify or delete any code files.
5. Provide precise verification evidence: file:line, symbol name, grep/search evidence showing 0 callers or usages outside definition/export.

Deliver your findings to /Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/teamwork_explorer_frontend/handoff.md.
When completed, notify the parent (7dabfc33-21ba-4c83-9da9-779408f893c0) via send_message.
