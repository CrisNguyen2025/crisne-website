# Original User Request

## 2026-10-14T09:09:12Z

Refactor the AI assistant SDK into a decoupled headless architecture compliant with React 19, eliminate conversational AI slop in response generation, and integrate actionable Generative UI chips into the chatbot interface.

Requested team: Full team
Working directory: /Users/tienanhnguyen/Desktop/src_example/crisne-website
Integrity mode: development

## Requirements

### R1. Headless AI SDK Architecture & React 19 Compliance
Decouple the `roadmap-rag-assistant` SDK so that state, streaming, tool calls, and WebMCP protocol handling are encapsulated in headless hooks/clients separate from presentation UI. Resolve all React 19 render-phase ref mutations (`Cannot update ref during render` and `Cannot access ref value during render`). Isolate raw SVG assets and heavy icons from component core files.

### R2. Anti-Slop AI Behavior & Structured Response Engine
Re-engineer the chat pipeline in `app/api/chat/route.ts` to enforce anti-slop guidelines:
- Enforce the "Direct Answer First" rule: the initial sentence must directly answer the user's question with concrete facts/evidence within 20 words.
- Strip out conversational filler, throat-clearing openers, sycophantic praise, and summary-recap kickers.
- Support structured event payloads (or parseable action metadata) that identify actionable references (projects, roadmap layers, contact channels) for the client.

### R3. Generative Action Chips & Interactive UI
Upgrade both `FloatingChatBot` and `RoadmapAssistantChatbot` to render interactive Action Chips alongside text responses:
- Project references (e.g. Kamala, Zelene Spa, Smartbit, JAVIS) must render clickable action chips allowing direct navigation or opening detail modals.
- Roadmap suggestions must render actionable command chips (e.g., jump to layer, trigger create modal) that interact with the application state.
- Ensure markdown rendering handles links, code, and lists robustly without broken regex fragments.

### R4. Integrity & Verification Pipeline
Ensure the codebase remains strictly type-safe, passes all test suites, and adheres to project rules (no server code in client components, no unhandled console.log in commits, no inline styles mixed with Tailwind).

## Acceptance Criteria

### SDK & React 19
- [ ] `useRoadmapAssistantChat` does not mutate or access refs during component render phase.
- [ ] Headless chat logic can be imported and consumed independently of `RoadmapChatbotWidget`.
- [ ] `RoadmapChatbotWidget.tsx` is trimmed down with standalone icon modules.

### AI Behavior & Prompting
- [ ] Chat responses start immediately with the concrete answer, eliminating throat-clearing openers (e.g., "Tuyệt vời", "Chào bạn, rất vui...").
- [ ] Chat responses omit summary-recap endings (e.g., "Tóm lại...", "In conclusion...").
- [ ] Entity mentions emit actionable metadata or structured links.

### Generative UI Chips
- [ ] Project and roadmap mentions render clickable chip buttons in the chat stream.
- [ ] Clicking a chip triggers the corresponding UI action (opening project modal, highlighting a layer, or launching contact).

### Verification
- [ ] `npx tsc --noEmit` exits with 0 errors.
- [ ] `npm test` runs and all test suites pass.
- [ ] `npm run build` completes production build with Turbopack successfully.
