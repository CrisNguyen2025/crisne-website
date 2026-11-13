# BRIEFING — 2026-11-10T09:50:00Z

## Mission
Audit Next.js frontend codebase for dead, unreferenced, obsolete, or orphaned code (UI components, pages/routes, hooks, utilities, types) with file:line evidence.

## 🔒 My Identity
- Archetype: explorer
- Roles: frontend dead code auditor
- Working directory: /Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/teamwork_explorer_frontend/
- Original parent: 7dabfc33-21ba-4c83-9da9-779408f893c0
- Milestone: M2 - Frontend Dead Code & Orphaned UI Audit

## 🔒 Key Constraints
- Read-only investigation — do NOT implement or modify/delete any code
- Strictly read-only on project source code
- File workspace convention: write only to /Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/teamwork_explorer_frontend/
- Provide precise verification evidence: file:line, symbol name, grep/search evidence showing 0 callers or usages outside definition/export

## Current Parent
- Conversation ID: 7dabfc33-21ba-4c83-9da9-779408f893c0
- Updated: not yet

## Investigation State
- **Explored paths**: `components/`, `components/ui/`, `components/roadmap/`, `components/floating-bot/`, `components/analytics/`, `app/`, `app/api/`, `hooks/`, `lib/`, `logic/`
- **Key findings**:
  1. `HeroSkeleton` & `SkillsSkeleton` (`components/ui/skeleton.tsx:12-36`): 0 callers across workspace.
  2. `Tooltip`, `TooltipTrigger`, `TooltipContent` (`components/ui/tooltip.tsx:20-66`): 0 callers, only `TooltipProvider` used.
  3. `PreviewImage` (`components/ui/image-preview/PreviewImage.tsx:35-50`): 0 imports outside self/README.
  4. Orphaned API Route (`app/api/posts/slug/[slug]/route.ts`): 0 callers; Server Component uses direct server call.
  5. `lib/roadmap/markdown.ts`: 0 callers in production code, only in unit tests.
  6. `lib/ai/generate-json.ts`: 0 callers in production code, only in unit tests.
  7. `formatExactDate` (`lib/roadmap/date-utils.ts:13`): 0 callers.
  8. `sanitizeDangerousHtml` export (`lib/roadmap/content-utils.ts:105`): 0 external callers.
  9. `mapTag` & `mapPost` exports (`lib/notion.ts:188, 198`): 0 external callers.
  10. `slugify` duplicate (`lib/notion.ts:356`): redundant unexported function.
  11. `isCurrentClient` in `lib/prisma.ts:30-52`: vestigial checks for deleted workflow/role models.
  12. Duplicate `ToastProvider` in `app/notes/layout.tsx:58`: mounts duplicate container.
  13. `appendEntityActionChips` & `formatActionChip` (`lib/ai/action-chips.ts:94, 163`): 0 production callers.
  14. `components/shared/` and `components/layout/` do not exist in repo.
  15. Cris AI / Floating Bot components are active on `/portfolio` via `SiteChatbot` (not orphaned).
- **Unexplored areas**: none (all frontend areas audited)

## Key Decisions Made
- Categorized findings by component, route, utility/module, and architectural discrepancy.
- Retained Cris AI status as active on `/portfolio` in accordance with `AGENTS.md`.

## Artifact Index
- DISPATCH.md — Task assignment and instructions
- BRIEFING.md — Situational awareness and state
- progress.md — Heartbeat progress
- handoff.md — Final 5-component handoff report
