# crisne-website — Project Memory

> Auto-synced | 75 observations

**Stack:** JavaScript/TypeScript · Next.js + React + Tailwind

## 🛡️ GLOBAL SAFETY RULES

- **NEVER** run `git clean -fd` or `git reset --hard` without checking `git log` and verifying commits exist.
- **NEVER** delete untracked files or folders blindly. Always backup or stash before bulk edits.

## 🧭 ACTIVE CONTEXT

> Always read `.cursor/active-context.md` for exact instructions on the specific file you are currently editing. It updates dynamically.

## 🔴 STOP — READ THESE FIRST

- **Don't mix Tailwind with inline styles** — Don't mix Tailwind with inline styles
- **Don't import server-only code in client components** — Don't import server-only code in client components
- **Environment variables: NEXT_PUBLIC_ prefix for client-side only** — Environment variables: NEXT_PUBLIC_ prefix for client-side only
- **Don't use useEffect for data fetching — use server actions or loader** — Don't use useEffect for data fetching — use server actions or loader
- **Clean up effects — return cleanup function from useEffect** — Clean up effects — return cleanup function from useEffect

## 📐 Conventions

- Extract repeated class patterns into components
- Use responsive prefixes consistently (sm:, md:, lg:, xl:)
- Don't use arbitrary values when a utility class exists
- Use middleware.ts for authentication guards, not client-side checks
- Use next/image (not img tag) for automatic optimization
- Handle loading.tsx and error.tsx for every async route
- Use Server Components by default — add "use client" only when needed
- Use Suspense and Error Boundaries for async operations

## ⚡ Available Tools (ON-DEMAND only)
- `save(title, content, category)` — Save a note + auto-detect conflicts
- `batch_save(items[])` — Save multiple notes in 1 call
- `query(text)` — Search memory for architecture, past fixes, decisions
- `search(text)` — Full-text search for details
- `check_errors()` — Check compiler errors after edits

> ℹ️ DO NOT call get_context() or get_gotchas() at startup — context above IS your context.

---
*Auto-synced | 2026-03-25*

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **crisne-website** (2114 symbols, 3951 relationships, 175 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "main"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({search_query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/crisne-website/context` | Codebase overview, check index freshness |
| `gitnexus://repo/crisne-website/clusters` | All functional areas |
| `gitnexus://repo/crisne-website/processes` | All execution flows |
| `gitnexus://repo/crisne-website/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
