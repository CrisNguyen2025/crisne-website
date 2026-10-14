# Analysis: AI Assistant SDK & React 19 Architecture (Requirement R1)

**Target**: `roadmap-rag-assistant` TypeScript SDK, `RoadmapChatbotWidget`, `useRoadmapAssistantChat`, React 19 compliance, and headless decoupling.  
**Date**: 2026-10-14  
**Investigator**: Survey Explorer 1 (SDK & React 19 Architecture)

---

## 1. Executive Summary

Requirement R1 mandates decoupling the `roadmap-rag-assistant` SDK so that state management, streaming, tool calling, and WebMCP protocol handling are cleanly separated into headless hooks/clients independent of presentation UI. Additionally, all React 19 render-phase ref access/mutation errors must be identified and resolved, and embedded raw SVG icons/helpers must be extracted out of core component files.

The current implementation exhibits:
1. **Severe React 19 ref violations in `useRoadmapAssistantChat.ts`**: Both render-phase mutations (`ref.current = value` during component execution) and render-phase reads (`if (!ref.current)` during render), which trigger React 19 compiler warnings and concurrent rendering bugs.
2. **Monolithic component bloating in `RoadmapChatbotWidget.tsx`**: 13 raw SVG icon components (~240 lines) and ~151 lines of markdown/time/tool formatting utilities are embedded directly inside `RoadmapChatbotWidget.tsx` (accounting for 404 out of 894 lines, ~45.2% of the file).
3. **Coupled architecture**: Presentation concerns, state machines, WebMCP routing, and markdown parsing are entangled. Headless consumers cannot easily consume chat state without importing UI dependencies.

---

## 2. Codebase Inventory & Affected Files Map

### 2.1 SDK Source Files (`roadmap-rag-assistant/sdk/typescript/`)

| File Path | Lines | Current Role & Responsibilities | Issues / Required Changes |
|---|---|---|---|
| `roadmap-rag-assistant/sdk/typescript/src/react/useRoadmapAssistantChat.ts` | 242 | React hook for chat state, SSE streaming, tool calls, and WebMCP routing | **Critical React 19 ref violations** (lines 28, 32, 50-52). Needs pure `useMemo` / `useEffect` patterns. |
| `roadmap-rag-assistant/sdk/typescript/src/react/RoadmapChatbotWidget.tsx` | 894 | Main floating chat widget UI (Telegram-style window, bubble, controls) | **Bloated with 13 embedded SVG icons** (lines 7–247) and inline formatters (lines 251–401). |
| `roadmap-rag-assistant/sdk/typescript/src/client.ts` | 197 | Low-level HTTP / SSE client (`RoadmapChatClient`) for `/chat/stream`, `/chat/plan`, `/health` | Clean, but lacks typing for structured action chip payloads needed by R2/R3. |
| `roadmap-rag-assistant/sdk/typescript/src/types.ts` | 48 | Core SDK schemas: `ChatRequest`, `ChatResponse`, `ToolCallResult`, `PageContext`, `PlanResponse` | Needs extensions for action metadata / chips. |
| `roadmap-rag-assistant/sdk/typescript/src/react/types.ts` | 96 | UI and hook types: `ChatMessage`, `ChatbotConfig`, `ChatbotPosition` | Needs action chip types and initial message configuration. |
| `roadmap-rag-assistant/sdk/typescript/src/react/index.ts` | 9 | Barrel export for React module | Exports both widget and hook. Needs explicit headless export path. |
| `roadmap-rag-assistant/sdk/typescript/src/index.ts` | 21 | Root SDK barrel export | Re-exports client, types, widget, and hook. |
| `roadmap-rag-assistant/sdk/typescript/package.json` | 15 | SDK package definition (`roadmap-chat-sdk`) | Defines build and types entry points. |
| `roadmap-rag-assistant/sdk/typescript/tsconfig.json` | 17 | SDK TypeScript configuration | NodeNext ES2022 build config. |

### 2.2 Consuming Application Files (`crisne-website`)

| File Path | Lines | Current Integration |
|---|---|---|
| `components/roadmap/RoadmapAssistantChatbot.tsx` | 115 | Renders `<RoadmapChatbotWidget />` with project context and WebMCP hooks |
| `components/roadmap/RoadmapAssistantChatbotWrapper.tsx` | 13 | Dynamic client-only wrapper (`ssr: false`) for `RoadmapAssistantChatbot` |
| `components/site-chatbot.tsx` | 17 | Global route switcher between `FloatingChatBot` (portfolio) and `RoadmapAssistantChatbot` (other pages) |
| `logic/roadmap/roadmapAssistantService.ts` | 96 | Singleton `roadmapChatClient`, helper functions `sendRoadmapAssistantMessage`, `runWebMcpCommand` |
| `hooks/use-roadmap-webmcp.ts` | 321 | WebMCP tool definitions registered on `document.modelContext` |
| `components/floating-bot/FloatingChatBot.tsx` | 441 | Portfolio floating chatbot consuming `useFloatingChat` |
| `hooks/use-floating-chat.ts` | 164 | Portfolio chat hook connecting to `/api/chat` |

---

## 3. Deep Dive: React 19 Ref Mutation & Access Audit

### 3.1 Exact Line-by-Line Violations in `useRoadmapAssistantChat.ts`

React 19 introduces strict concurrent rendering checks and compiler assertions. Reading or writing `ref.current` during the render phase is explicitly prohibited:
- Warning / Error 1: **`Cannot update ref during render`**
- Warning / Error 2: **`Cannot access ref value during render`**

#### Violation 1: Render-Phase Callback Ref Mutation (Line 27-28)
```typescript
// File: roadmap-rag-assistant/sdk/typescript/src/react/useRoadmapAssistantChat.ts
27:  const onWebMcpRef = useRef(onWebMcpMessage);
28:  onWebMcpRef.current = onWebMcpMessage;
```
* **Flaw**: Direct assignment to `onWebMcpRef.current` during component render phase. If React renders the component multiple times (Strict Mode, concurrent transitions, or suspended renders), side-effects during render cause inconsistent state and memory leaks.
* **Remediation**: Synchronize in `useEffect` or use an event wrapper pattern:
  ```typescript
  const onWebMcpRef = useRef(onWebMcpMessage);
  useEffect(() => {
    onWebMcpRef.current = onWebMcpMessage;
  }, [onWebMcpMessage]);
  ```

#### Violation 2: Render-Phase Getter Ref Mutation (Line 31-32)
```typescript
// File: roadmap-rag-assistant/sdk/typescript/src/react/useRoadmapAssistantChat.ts
31:  const getContextRef = useRef(getContext);
32:  getContextRef.current = getContext;
```
* **Flaw**: Direct assignment to `getContextRef.current` during render phase.
* **Remediation**:
  ```typescript
  const getContextRef = useRef(getContext);
  useEffect(() => {
    getContextRef.current = getContext;
  }, [getContext]);
  ```

#### Violation 3: Render-Phase Ref Read and Conditional Mutation (Lines 49-52)
```typescript
// File: roadmap-rag-assistant/sdk/typescript/src/react/useRoadmapAssistantChat.ts
49:  const clientRef = useRef<RoadmapChatClient | null>(null);
50:  if (!clientRef.current) {
51:    clientRef.current = new RoadmapChatClient({ baseUrl });
52:  }
```
* **Flaw**:
  1. `if (!clientRef.current)` **reads** `ref.current` during render (triggers `Cannot access ref value during render`).
  2. `clientRef.current = ...` **mutates** `ref.current` during render (triggers `Cannot update ref during render`).
  3. **Functional Defect**: If `baseUrl` changes dynamically, `clientRef.current` is never recreated or updated because the `if (!clientRef.current)` guard prevents reassignment.
* **Remediation**:
  `RoadmapChatClient` is stateless (it only encapsulates `baseUrl`, `timeout`, and transport methods). Replacing this pattern with `useMemo` is render-safe, pure, and reactively handles `baseUrl` changes:
  ```typescript
  const client = useMemo(() => new RoadmapChatClient({ baseUrl }), [baseUrl]);
  ```

#### Violation 4: Callback Instability for `onToolExecuted` (Lines 158, 221)
```typescript
// File: roadmap-rag-assistant/sdk/typescript/src/react/useRoadmapAssistantChat.ts
158:  onToolExecuted?.(name, result);
...
221:  [input, isLoading, threadId, onToolExecuted, baseUrl]
```
* **Flaw**: While `getContext` and `onWebMcpMessage` were stored in refs to avoid busting `sendMessage` memoization, `onToolExecuted` was included in the dependency array. If callers pass an anonymous inline function `onToolExecuted={(t, r) => ...}`, `sendMessage` is recreated on every parent render.
* **Remediation**: Store `onToolExecuted` in a ref synchronized via `useEffect`:
  ```typescript
  const onToolExecutedRef = useRef(onToolExecuted);
  useEffect(() => {
    onToolExecutedRef.current = onToolExecuted;
  }, [onToolExecuted]);
  ```

---

## 4. Deep Dive: Embedded SVG Icons & Utility Extraction

### 4.1 Embedded Raw SVG Icons in `RoadmapChatbotWidget.tsx`

`RoadmapChatbotWidget.tsx` currently embeds 13 separate SVG icons directly within the component file:

| Icon Component | Lines in File | Purpose / Usage |
|---|---|---|
| `ModernSparklesIcon` | 7–21 (15 lines) | Avatar header spark icon |
| `TelegramPaperPlaneIcon` | 23–33 (11 lines) | Send button icon & floating toggle button icon |
| `VerifiedBadgeIcon` | 35–57 (23 lines) | Header verified check badge |
| `DoubleCheckIcon` | 59–78 (20 lines) | Message read/delivered checkmark on user bubbles |
| `QuadrantArrowsIcon` | 80–101 (22 lines) | Screen corner cycle button icon |
| `ResetChatIcon` | 103–120 (18 lines) | Clear chat history button icon |
| `CloseIcon` | 122–137 (16 lines) | Modal close / collapse button icon |
| `CopyIcon` | 139–154 (16 lines) | Copy message content button icon |
| `CheckIcon` | 156–170 (15 lines) | Copied confirmation checkmark |
| `LoaderIcon` | 172–186 (15 lines) | Spinning indicator for active tool execution |
| `CheckCircleIcon` | 188–207 (20 lines) | Completed tool status & confirmation button icon |
| `ChevronDownIcon` | 209–227 (19 lines) | Tool execution collapsible toggle icon |
| `PromptSparkleIcon` | 229–247 (19 lines) | Input bar prefix icon |
| **Total Icons** | **Lines 7–247 (241 lines)** | **~27% of `RoadmapChatbotWidget.tsx`** |

### 4.2 Embedded Formatting & Utility Helpers

`RoadmapChatbotWidget.tsx` also embeds inline text formatting and tool mapping helpers:

| Helper Function | Lines in File | Purpose |
|---|---|---|
| `renderInlineStyles` | 251–281 (31 lines) | Parses bold (`**text**`) and code (`` `code` ``) tokens |
| `formatMarkdownText` | 283–356 (74 lines) | Parses bullets, numbered lists, headings, paragraphs |
| `formatTime` | 358–370 (13 lines) | Formats message timestamp to `HH:mm` |
| `formatToolDisplayName` | 372–401 (30 lines) | Maps internal tool names (e.g. `search_live_knowledge`) to user-friendly titles |
| **Total Utilities** | **Lines 251–401 (151 lines)** | **~17% of `RoadmapChatbotWidget.tsx`** |

### 4.3 Proposed Extraction Architecture

Create two modular companion files under `roadmap-rag-assistant/sdk/typescript/src/react/`:
1. `src/react/icons/index.tsx` (or `src/react/icons.tsx`):
   Contains all 13 standalone, typed SVG components with optional `className`.
2. `src/react/utils/formatters.ts`:
   Contains `renderInlineStyles`, `formatMarkdownText`, `formatTime`, `formatToolDisplayName`.

This will reduce `RoadmapChatbotWidget.tsx` from **894 lines down to ~490 lines** (a ~45% reduction in size), leaving only layout and interaction logic.

---

## 5. Decoupled Headless Architecture Proposal

### 5.1 Architecture Layers

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           PRESENTATION LAYER                            │
│  ┌───────────────────────────────┐     ┌─────────────────────────────┐  │
│  │   RoadmapChatbotWidget.tsx    │     │    FloatingChatBot.tsx      │  │
│  │  (Telegram UI, Window, FAB)   │     │      (Portfolio Bot)        │  │
│  └───────────────┬───────────────┘     └──────────────┬──────────────┘  │
│                  │                                    │                 │
│         ┌────────┴────────┐                  ┌────────┴────────┐        │
│         │   icons.tsx     │                  │  lucide-react   │        │
│         │  formatters.ts  │                  │                 │        │
│         └─────────────────┘                  └─────────────────┘        │
└──────────────────┬────────────────────────────────────┬─────────────────┘
                   │                                    │
┌──────────────────▼────────────────────────────────────▼─────────────────┐
│                       HEADLESS REACT HOOKS LAYER                        │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                     useRoadmapAssistantChat                       │  │
│  │  - Messages & Input State Management                              │  │
│  │  - SSE Token Streaming & Abort Handling                           │  │
│  │  - Tool Call Execution Lifecycle (onToolStart, onToolEnd)         │  │
│  │  - WebMCP Protocol Interception & Routing                         │  │
│  │  - Structured Action Metadata Extraction                          │  │
│  │  - React 19 Pure Lifecycle (No render ref mutations)              │  │
│  └─────────────────────────────────┬─────────────────────────────────┘  │
└────────────────────────────────────┼────────────────────────────────────┘
                                     │
┌────────────────────────────────────▼────────────────────────────────────┐
│                       CORE TRANSPORT & PROTOCOL                         │
│  ┌───────────────────────────────┐     ┌─────────────────────────────┐  │
│  │      RoadmapChatClient        │     │       WebMCP Router         │  │
│  │   (SSE Streaming / REST)      │     │  (Browser Tool Execution)   │  │
│  └───────────────────────────────┘     └─────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Module Layout in `roadmap-rag-assistant/sdk/typescript/src/`

```
roadmap-rag-assistant/sdk/typescript/src/
├── client.ts                     # Core HTTP / SSE client (RoadmapChatClient)
├── types.ts                      # Core protocol types (PageContext, ToolCallResult, ChatResponse, ActionChip)
├── index.ts                      # Root package barrel
└── react/
    ├── index.ts                  # React barrel export
    ├── types.ts                  # React-specific types (ChatMessage, ChatbotConfig, ChatActionChip)
    ├── useRoadmapAssistantChat.ts# Decoupled headless hook (React 19 compliant)
    ├── icons.tsx                 # Isolated SVG icon library
    ├── utils/
    │   └── formatters.ts         # Markdown, time, and tool formatting helpers
    └── RoadmapChatbotWidget.tsx  # Pure presentation widget
```

### 5.3 Interface Contracts

#### 1. Core Action Chip & Extended Message Contract (`types.ts` & `react/types.ts`)
To support Requirements R2 and R3 (Generative Action Chips) in the headless SDK:
```typescript
export interface ChatActionChip {
  id: string;
  label: string;
  type: 'project' | 'roadmap_layer' | 'contact' | 'command';
  action: string;
  payload?: Record<string, unknown>;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: Array<{
    name: string;
    args?: Record<string, unknown>;
    result: string;
  }>;
  actionChips?: ChatActionChip[];
  timestamp: Date;
}
```

#### 2. Headless Hook Contract (`useRoadmapAssistantChat.ts`)
```typescript
export interface UseRoadmapAssistantChatOptions {
  baseUrl?: string;
  threadId?: string;
  initialMessages?: ChatMessage[];
  onToolExecuted?: (toolName: string, result: string) => void;
  getContext?: () => PageContext | undefined;
  onWebMcpMessage?: (request: string) => Promise<string>;
}

export interface UseRoadmapAssistantChatReturn {
  messages: ChatMessage[];
  input: string;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  isLoading: boolean;
  isStreaming: boolean;
  activeTool: string | null;
  error: string | null;
  sendMessage: (textToSend?: string) => Promise<void>;
  stopStreaming: () => void;
  clearMessages: () => void;
}
```

#### 3. WebMCP Handling Contract
The WebMCP protocol interceptor:
```typescript
// Detect /webmcp command
const isWebMcp = /^\/webmcp\b/i.test(content);
if (isWebMcp && onWebMcpRef.current) {
  const request = content.replace(/^\/webmcp\b\s*/i, '');
  const reply = await onWebMcpRef.current(request);
  // Updates assistant bubble with result
}
```
In the decoupled hook, WebMCP remains completely headless without any UI attachment. If `onWebMcpMessage` is provided, it handles execution through the registered callback; otherwise it gracefully reports unavailability.

---

## 6. Verification and Regression Plan

1. **Compilation Check**:
   - `npx tsc --noEmit` must complete with 0 errors across both the main project and the SDK.
2. **Test Suite Verification**:
   - `npm test` must run all 9 test files (82 unit/route tests) with 100% pass rate.
3. **Production Turbopack Build Check**:
   - `npm run build` must succeed without warnings or errors.
4. **Behavioral Testing**:
   - `RoadmapAssistantChatbot` must mount, stream SSE responses, display tool calls, and execute WebMCP commands without throwing React 19 render ref errors.
