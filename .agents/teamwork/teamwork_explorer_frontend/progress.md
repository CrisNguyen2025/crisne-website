# Progress: Frontend Dead Code Audit

Last visited: 2026-11-10T09:50:00Z

## Status
- [x] Initialized BRIEFING.md and DISPATCH.md
- [x] Catalog frontend files (`components/`, `app/`, `hooks/`, `lib/`, `logic/`)
- [x] UI Components audit (identified `HeroSkeleton`, `SkillsSkeleton`, `Tooltip/Trigger/Content`, `PreviewImage`)
- [x] Floating-bot & legacy chat audit (verified mounted via `SiteChatbot` on `/portfolio`)
- [x] Pages & Routes audit (identified orphaned API route `app/api/posts/slug/[slug]/route.ts`, duplicate `ToastProvider` in `notes/layout.tsx`)
- [x] Hooks, Utils, Lib, Types audit (identified `markdown.ts`, `generate-json.ts`, `formatExactDate`, `isCurrentClient` dead delegates, `slugify` duplicate)
- [x] Verification of zero references for identified candidates (15 findings verified with grep/ripgrep evidence)
- [ ] Produce handoff.md
- [ ] Notify parent orchestrator
