## 2026-10-14T09:23:01Z
You are the Implementer Worker for Milestone 1: Headless AI SDK & React 19 Compliance.
Your working directory is: /Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/worker_m1_sdk
Project root: /Users/tienanhnguyen/Desktop/src_example/crisne-website
Authoritative User Request: /Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/ORIGINAL_REQUEST.md
Project Blueprint: /Users/tienanhnguyen/Desktop/src_example/crisne-website/PROJECT.md
Survey Analysis: /Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/explorer_survey_sdk/analysis.md
Survey Handoff: /Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/explorer_survey_sdk/handoff.md

You MUST read ORIGINAL_REQUEST.md, PROJECT.md, and the Survey reports before starting work.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

File Ownership:
You have exclusive write ownership of:
- `roadmap-rag-assistant/sdk/typescript/src/react/useRoadmapAssistantChat.ts`
- `roadmap-rag-assistant/sdk/typescript/src/react/icons.tsx`
- `roadmap-rag-assistant/sdk/typescript/src/react/utils/formatters.ts`
- `roadmap-rag-assistant/sdk/typescript/src/react/RoadmapChatbotWidget.tsx`
- `roadmap-rag-assistant/sdk/typescript/src/types.ts`
- `roadmap-rag-assistant/sdk/typescript/src/react/types.ts`
- `roadmap-rag-assistant/sdk/typescript/src/index.ts`
- `roadmap-rag-assistant/sdk/typescript/src/react/index.ts`
Do NOT edit files outside this scope.

Objectives:
1. Fix all React 19 render-phase ref mutations and reads in `useRoadmapAssistantChat.ts`:
   - Move `onWebMcpRef.current` and `getContextRef.current` assignment into `useEffect`.
   - Replace render-phase `clientRef.current` instantiation with `useMemo(() => new RoadmapChatClient({ baseUrl }), [baseUrl])`.
   - Ensure `onToolExecuted` is also synchronized via ref in `useEffect` so `sendMessage` callback identity remains stable.
2. Extract all 13 inline raw SVG icon components from `RoadmapChatbotWidget.tsx` into `roadmap-rag-assistant/sdk/typescript/src/react/icons.tsx`.
3. Extract text formatters (`renderInlineStyles`, `formatMarkdownText`, `formatTime`, `formatToolDisplayName`) from `RoadmapChatbotWidget.tsx` into `roadmap-rag-assistant/sdk/typescript/src/react/utils/formatters.ts`.
4. Refactor `RoadmapChatbotWidget.tsx` to cleanly import icons and formatters, dramatically slimming down the component file while maintaining 100% backward compatibility.
5. Add `ChatActionChip` interface to `types.ts` and `react/types.ts`, and add `actionChips?: ChatActionChip[]` to `ChatMessage`. Export `useRoadmapAssistantChat` cleanly from `@/roadmap-rag-assistant/sdk/typescript/src` so headless consumers can use it without UI dependencies.
6. Run `npx tsc --noEmit` and `npm test` to verify zero type errors and all tests pass.
7. Write a detailed `handoff.md` and `progress.md` in your working directory and notify the orchestrator via `send_message`.
