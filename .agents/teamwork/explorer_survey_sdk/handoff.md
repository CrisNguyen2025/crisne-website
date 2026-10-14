# Handoff Report: Survey Explorer 1 (SDK & React 19 Architecture)

**Date**: 2026-10-14  
**Author**: Survey Explorer 1 (SDK & React 19 Architecture)  
**Task Type**: Hard Handoff (Investigation & Survey Complete)  
**Scope**: Requirement R1 — Headless AI SDK Architecture & React 19 Compliance

---

## 1. Observation

Direct code observations from the workspace:

### 1.1 React 19 Ref Violations in `useRoadmapAssistantChat.ts`
File: `/Users/tienanhnguyen/Desktop/src_example/crisne-website/roadmap-rag-assistant/sdk/typescript/src/react/useRoadmapAssistantChat.ts`

- **Line 27–28**:
  ```typescript
  const onWebMcpRef = useRef(onWebMcpMessage);
  onWebMcpRef.current = onWebMcpMessage;
  ```
  Render-phase ref mutation during component evaluation.

- **Line 31–32**:
  ```typescript
  const getContextRef = useRef(getContext);
  getContextRef.current = getContext;
  ```
  Render-phase ref mutation during component evaluation.

- **Line 49–52**:
  ```typescript
  const clientRef = useRef<RoadmapChatClient | null>(null);
  if (!clientRef.current) {
    clientRef.current = new RoadmapChatClient({ baseUrl });
  }
  ```
  Render-phase ref read (`!clientRef.current`) and render-phase ref write (`clientRef.current = ...`). Furthermore, if `baseUrl` changes dynamically via props, `clientRef.current` is never updated.

### 1.2 Embedded SVG Assets and Helper Monolith in `RoadmapChatbotWidget.tsx`
File: `/Users/tienanhnguyen/Desktop/src_example/crisne-website/roadmap-rag-assistant/sdk/typescript/src/react/RoadmapChatbotWidget.tsx` (Total: 894 lines)

- **Lines 7–247 (241 lines)**: 13 raw SVG icon components defined inline:
  1. `ModernSparklesIcon` (lines 7–21)
  2. `TelegramPaperPlaneIcon` (lines 23–33)
  3. `VerifiedBadgeIcon` (lines 35–57)
  4. `DoubleCheckIcon` (lines 59–78)
  5. `QuadrantArrowsIcon` (lines 80–101)
  6. `ResetChatIcon` (lines 103–120)
  7. `CloseIcon` (lines 122–137)
  8. `CopyIcon` (lines 139–154)
  9. `CheckIcon` (lines 156–170)
  10. `LoaderIcon` (lines 172–186)
  11. `CheckCircleIcon` (lines 188–207)
  12. `ChevronDownIcon` (lines 209–227)
  13. `PromptSparkleIcon` (lines 229–247)
- **Lines 251–401 (151 lines)**: Utility functions defined inline:
  - `renderInlineStyles` (lines 251–281)
  - `formatMarkdownText` (lines 283–356)
  - `formatTime` (lines 358–370)
  - `formatToolDisplayName` (lines 372–401)
- The actual UI component starts only at **Line 405** (`export function RoadmapChatbotWidget`). 45.2% of the file contains icons and text utilities.

### 1.3 SDK and Consuming App Integration
- Consuming component `/Users/tienanhnguyen/Desktop/src_example/crisne-website/components/roadmap/RoadmapAssistantChatbot.tsx`:
  - Lines 6–8: Imports `RoadmapChatbotWidget`, `ChatbotPosition` from `@/roadmap-rag-assistant/sdk/typescript/src`.
  - Lines 100–113: Passes `baseUrl`, `onToolExecuted`, `getContext={getRoadmapPageContext}`, `onWebMcpMessage={runWebMcpCommand}`.
- Global router `/Users/tienanhnguyen/Desktop/src_example/crisne-website/components/site-chatbot.tsx`:
  - Mounts `FloatingChatBot` on `/portfolio*` and `RoadmapAssistantChatbot` everywhere else.
- Existing tests and build status:
  - `npm test`: 9 test files, 82 tests pass (0 failures).
  - `npx tsc --noEmit`: Exits with code 0.
  - `npm run build`: Turbopack build succeeds with 42/42 static and dynamic routes compiled.

---

## 2. Logic Chain

1. **Premise**: In React 19 (package version `19.2.4`), ref reading and mutation during the component render phase are prohibited to support concurrent features, Strict Mode double invocation, and React compiler purity.
2. **Finding from Observation 1.1**: Lines 28, 32, 50, and 51 of `useRoadmapAssistantChat.ts` read and write `ref.current` synchronously during render.
3. **Inference**: These lines are the exact cause of React 19 warnings/errors (`Cannot update ref during render`, `Cannot access ref value during render`).
4. **Resolution for Refs**:
   - `onWebMcpRef` and `getContextRef` store external function references to stabilize `sendMessage`. Moving their synchronization to `useEffect` maintains the latest reference while ensuring render purity.
   - `clientRef` stores an instance of `RoadmapChatClient({ baseUrl })`. Because `RoadmapChatClient` is stateless, replacing `clientRef` with `const client = useMemo(() => new RoadmapChatClient({ baseUrl }), [baseUrl])` removes all ref reading/mutation during render AND fixes the bug where dynamic `baseUrl` prop updates were ignored.
5. **Finding from Observation 1.2**: 404 lines (45.2%) of `RoadmapChatbotWidget.tsx` are non-widget code (13 SVG icons and 4 text/display formatters).
6. **Inference**: Extracting icons to `roadmap-rag-assistant/sdk/typescript/src/react/icons.tsx` and utilities to `roadmap-rag-assistant/sdk/typescript/src/react/utils/formatters.ts` achieves modular isolation and reduces the component file to ~490 lines.
7. **Finding from Observation 1.3**: The headless hook `useRoadmapAssistantChat` already encapsulates state, streaming, tool executions, and WebMCP protocol branching, but export coupling and lack of action chip data contracts limit headless consumption. Adding `actionChips?: ChatActionChip[]` to `ChatMessage` and decoupling the module exports allows headless usage anywhere without UI coupling.

---

## 3. Caveats

- **FastAPI Backend Availability**: In local development without running the Python FastAPI service on `:8000`, chat requests trigger the fallback connection error handler (`onError` callback), which displays an informative connection notice.
- **WebMCP Browser Availability**: `document.modelContext` is only present in browsers with WebMCP support or when polyfilled. The hook already falls back gracefully when `window.document.modelContext` is undefined.
- **Zero Source Code Modified**: As required by the Explorer survey role, no project source code was modified. Implementation must be carried out by the designated implementer agent.

---

## 4. Conclusion

Requirement R1 is fully analyzed with clear, actionable implementation targets:

1. **React 19 Fixes**:
   - Refactor `useRoadmapAssistantChat.ts` lines 27–33 to synchronize refs inside `useEffect`.
   - Refactor `useRoadmapAssistantChat.ts` lines 49–52 from `useRef` to `useMemo(() => new RoadmapChatClient({ baseUrl }), [baseUrl])`.
   - Wrap `onToolExecuted` in a synchronized ref inside `useEffect` to prevent unnecessary invalidation of `sendMessage`.
2. **Icon & Utility Extraction**:
   - Create `roadmap-rag-assistant/sdk/typescript/src/react/icons.tsx` exporting all 13 SVG icons.
   - Create `roadmap-rag-assistant/sdk/typescript/src/react/utils/formatters.ts` exporting `formatMarkdownText`, `renderInlineStyles`, `formatTime`, and `formatToolDisplayName`.
   - Clean up `RoadmapChatbotWidget.tsx` by importing from the above modules.
3. **Headless Decoupling**:
   - Add `ChatActionChip` interface to `types.ts` and `react/types.ts`.
   - Expose `useRoadmapAssistantChat` cleanly from both `@/roadmap-rag-assistant/sdk/typescript/src` and `src/react` as a pure, headless hook consumable by any component without rendering UI or SVGs.
   - Retain full backward compatibility for `components/roadmap/RoadmapAssistantChatbot.tsx`.

---

## 5. Verification Method

To independently verify after implementation:

1. **Type Checking**:
   ```bash
   npx tsc --noEmit
   ```
   *Expected result*: Exits with code 0.
2. **Vitest Test Suite**:
   ```bash
   npm test
   ```
   *Expected result*: All 82 unit and route tests pass.
3. **Turbopack Production Build**:
   ```bash
   npm run build
   ```
   *Expected result*: Production build succeeds with 42/42 static and dynamic routes compiled.
4. **File Inspection**:
   - Verify `roadmap-rag-assistant/sdk/typescript/src/react/useRoadmapAssistantChat.ts` has zero render-phase assignments to `.current`.
   - Verify `roadmap-rag-assistant/sdk/typescript/src/react/RoadmapChatbotWidget.tsx` contains 0 inline `<svg>` blocks.
   - Verify `roadmap-rag-assistant/sdk/typescript/src/react/icons.tsx` and `formatters.ts` exist and are cleanly imported.
