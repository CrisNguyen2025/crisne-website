# Project: Crisne Website AI Assistant Refactoring & Generative UI

## Architecture
- **Headless SDK Layer**: `roadmap-rag-assistant/sdk/typescript/src/`
  - Pure headless hook `useRoadmapAssistantChat` managing state, streaming, tool executions, and WebMCP protocol.
  - Zero render-phase ref mutations/reads, fully compliant with React 19 concurrent and StrictMode invariants.
  - Isolated visual assets (`icons.tsx`) and formatters (`formatters.ts`) decoupled from core UI.
- **Backend & AI Pipeline Layer**: `app/api/chat/route.ts`, `lib/ai/anti-slop.ts`, `lib/ai/action-chips.ts`
  - Strict Anti-Slop prompt enforcing "Direct Answer First" (<20 words, immediate facts/evidence, zero conversational filler or recap kickers).
  - Deterministic dual-defense stream transformer (`AntiSlopStreamTransformer`) sanitizing head and tail buffers.
  - Authoritative entity catalog mapping projects (Kamala, Zelene Spa, Smartbit, JAVIS), roadmap layers (01-05), and contact channels (Zalo, GitHub, CV, Contact).
  - Parseable action metadata protocol (`[[action:type|id|label]]`).
- **Interactive UI & Presentation Layer**: `components/chat/`, `components/floating-bot/`, `components/roadmap/`
  - Zero-dependency `ChatMarkdown` component supporting links, code blocks with copy, bold/italic, lists.
  - Interactive `ChatActionChips` rendering clickable pills with decoupled browser `CustomEvent` dispatching (`project:open-modal`, `roadmap:select-layer`, `roadmap:open-modal`).
  - Seamless integration in `FloatingChatBot` and `RoadmapAssistantChatbot`.
- **E2E & Unit Testing Track**: Requirement-driven opaque-box test suite + comprehensive verification pipeline (`tsc --noEmit`, `vitest`, Next.js Turbopack `npm run build`).

---

## Code Layout
- `roadmap-rag-assistant/sdk/typescript/src/react/useRoadmapAssistantChat.ts`: Headless chat hook (Owned by M1)
- `roadmap-rag-assistant/sdk/typescript/src/react/icons.tsx`: Extracted SVG icons (Owned by M1)
- `roadmap-rag-assistant/sdk/typescript/src/react/utils/formatters.ts`: Extracted formatters (Owned by M1)
- `roadmap-rag-assistant/sdk/typescript/src/react/RoadmapChatbotWidget.tsx`: Widget presentation (Owned by M1)
- `roadmap-rag-assistant/sdk/typescript/src/types.ts`: SDK types & `ChatActionChip` (Owned by M1)
- `app/api/chat/route.ts`: Chat API route handler & system prompt (Owned by M2)
- `lib/ai/anti-slop.ts`: Anti-slop stream transformer (Owned by M2)
- `lib/ai/action-chips.ts`: Action chip types, catalog, serializer, and parser (Owned by M2)
- `tests/route/chat-route.test.ts`: Chat route test fixtures & assertions (Owned by M2)
- `components/chat/ChatMarkdown.tsx`: Robust markdown component (Owned by M3)
- `components/chat/ChatActionChips.tsx`: Action chips UI component (Owned by M3)
- `components/floating-bot/FloatingChatBot.tsx`: Floating chat UI with action chips (Owned by M3)
- `components/roadmap/RoadmapAssistantChatbot.tsx`: Roadmap chat wrapper with action chips (Owned by M3)
- `components/projects-section.tsx`: Project section custom event listener for modal (Owned by M3)
- `app/page.tsx`: Roadmap workspace custom event listener (Owned by M3)
- `tests/e2e/**`: Requirement-driven E2E test suite (Owned by E2E Testing Track / M4)

---

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| F01 | React 19 Ref Violations Fix | Move ref mutations and reads in `useRoadmapAssistantChat.ts` to `useEffect` and `useMemo` | M1 | Survey Explorer 1 & 3 |
| F02 | Icon & Asset Isolation | Extract 13 raw inline SVG icons to `roadmap-rag-assistant/sdk/typescript/src/react/icons.tsx` | M1 | Survey Explorer 1 & 3 |
| F03 | Text Formatters Modularization | Extract 4 formatting functions to `roadmap-rag-assistant/sdk/typescript/src/react/utils/formatters.ts` | M1 | Survey Explorer 1 |
| F04 | Headless AI SDK Decoupling | Add `ChatActionChip` data contracts and export headless hook cleanly without widget coupling | M1 | Survey Explorer 1 |
| F05 | Anti-Slop System Prompt | Implement strict "Direct Answer First" (<20 words, zero filler/praise/kickers) in `app/api/chat/route.ts` | M2 | Survey Explorer 2 |
| F06 | Deterministic Anti-Slop Transformer | Build `AntiSlopStreamTransformer` in `lib/ai/anti-slop.ts` for head and tail buffer sanitization | M2 | Survey Explorer 2 |
| F07 | Action Metadata & Entity Catalog | Standardize `[[action:type|id|label]]` protocol and catalog for 4 projects, 5 layers, 4 contacts in `lib/ai/action-chips.ts` | M2 | Survey Explorer 2 |
| F08 | Chat Route Fallback & Test Updates | Sanitize fallbacks in `route.ts` and update `tests/route/chat-route.test.ts` mock assertions | M2 | Survey Explorer 2 |
| F09 | Zero-Dependency ChatMarkdown | Build `components/chat/ChatMarkdown.tsx` supporting links `[text](url)`, code blocks, bold/lists | M3 | Survey Explorer 3 |
| F10 | Generative Action Chips UI & Bus | Build `components/chat/ChatActionChips.tsx` with decoupled `CustomEvent` dispatchers | M3 | Survey Explorer 3 |
| F11 | FloatingChatBot Integration | Integrate Action Chips & Markdown in `FloatingChatBot.tsx` and wire modal open in `ProjectsSection.tsx` | M3 | Survey Explorer 3 |
| F12 | RoadmapChatbot Integration | Integrate Action Chips & Markdown in `RoadmapAssistantChatbot.tsx` and wire layer/modal events in `app/page.tsx` | M3 | Survey Explorer 3 |
| F13 | E2E Testing Suite (Tiers 1-4) | Comprehensive requirement-driven opaque-box test suite for all features | M4 (E2E Track) | ORIGINAL_REQUEST.md |
| F14 | 100% E2E Pass & Adversarial Hardening | Validate 100% E2E test pass + Tier 5 adversarial stress testing + complete build verification | M5 (Final) | ORIGINAL_REQUEST.md |

---

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Headless AI SDK & React 19 Compliance | F01, F02, F03, F04 | none | DONE |
| M2 | Anti-Slop AI Engine & Action Metadata Backend | F05, F06, F07, F08 | none | IN_PROGRESS (Remediating) |
| M3 | Generative UI Action Chips & Markdown Component | F09, F10, F11, F12 | M1, M2 | PLANNED |
| M4 | E2E Testing Track (Tiers 1-4) | F13 (Requirement-driven test suite & runner) | none | DONE |
| M5 | Final Milestone: Full E2E Pass & Adversarial Hardening | F14 (100% E2E test pass + Tier 5 adversarial hardening) | M1, M2, M3, M4 | PLANNED |

---

## Interface Contracts

### 1. SDK Headless Hook Contract (`roadmap-rag-assistant/sdk/typescript/src/react/types.ts`)
```typescript
export interface ChatActionChip {
  type: 'project' | 'roadmap' | 'contact' | 'link';
  id: string;
  label: string;
  data?: Record<string, unknown>;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  status?: 'sending' | 'streaming' | 'complete' | 'error';
  toolCalls?: ToolCall[];
  actionChips?: ChatActionChip[];
}
```

### 2. Action Metadata Protocol (`lib/ai/action-chips.ts`)
- Inline tag syntax: `[[action:type|id|label]]`
- Examples:
  - `[[action:project|kamala-commerce-tour|Khám phá dự án Kamala]]`
  - `[[action:roadmap|layer-02|Xem Tầng LLM App]]`
  - `[[action:contact|cv|Tải CV Cris Nguyen]]`
- Parsing interface:
```typescript
export interface ParsedMessageResult {
  cleanContent: string;
  actionChips: ChatActionChip[];
}
export function parseMessageContentAndActions(rawText: string): ParsedMessageResult;
```

### 3. Client UI Custom Events Bus
- `project:open-modal`: `{ detail: { projectId: string } }` (Listened by `ProjectsSection.tsx`)
- `roadmap:select-layer`: `{ detail: { layerId: string } }` (Listened by `app/page.tsx`)
- `roadmap:open-modal`: `{ detail: { type: 'topic' | 'layer' | 'item' } }` (Listened by `app/page.tsx`)
