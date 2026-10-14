# BRIEFING — 2026-10-14T09:21:00Z

## Mission
Khảo sát UI (R3, R4), Action Chips, Markdown rendering và toàn bộ hạ tầng kiểm thử/build verification phục vụ kế hoạch nâng cấp Chatbot AI.

## 🔒 My Identity
- Archetype: explorer
- Roles: UI & Test Verification Infrastructure Explorer
- Working directory: /Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/explorer_survey_ui_tests
- Original parent: 29f23ef8-db9e-4c9d-8d0d-6d5e6e427529
- Milestone: Survey & UI/Test Infrastructure Investigation

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Default language: Vietnamese (English for code & technical terms)
- Chỉ ghi file trong thư mục agent của mình (`.agents/teamwork/explorer_survey_ui_tests/`)
- Không sửa source code dự án

## Current Parent
- Conversation ID: 29f23ef8-db9e-4c9d-8d0d-6d5e6e427529
- Updated: not yet

## Investigation State
- **Explored paths**:
  - `components/floating-bot/FloatingChatBot.tsx` & `FloatingChatBotWrapper.tsx`
  - `components/roadmap/RoadmapAssistantChatbot.tsx` & `RoadmapAssistantChatbotWrapper.tsx`
  - `roadmap-rag-assistant/sdk/typescript/src/react/RoadmapChatbotWidget.tsx` & `useRoadmapAssistantChat.ts`
  - `components/site-chatbot.tsx`
  - `components/projects-section.tsx` & `components/project-detail-modal.tsx`
  - `components/cta-section.tsx`
  - `app/page.tsx` & `app/portfolio/page.tsx`
  - `package.json`, `tsconfig.json`, `vitest.config.mts`, `eslint.config.mjs`
  - `tests/` directory (9 test files)
- **Key findings**:
  - Markdown parser hiện tại thiếu hỗ trợ link `[text](url)` và multiline code block, dễ bị lỗi format khi streaming.
  - Generative Action Chips hoàn toàn chưa có; cần bổ sung hệ thống chip dựa trên Custom Event (`project:open-modal`, `roadmap:open-modal`, `roadmap:select-layer`) và dual-source detection (semantic + metadata).
  - SDK `useRoadmapAssistantChat.ts` vi phạm React 19 render-phase ref mutation tại các dòng 28, 32, 50.
  - Hạ tầng build & test đạt 100% pass: `tsc --noEmit` mã 0, `npm test` 82/82 pass, `npm run build` Turbopack biên dịch 42 static pages trong 4.6s.
  - Cần bổ sung unit test suites `tests/unit/chat-markdown.test.ts` và `tests/unit/action-chips.test.ts`.
- **Unexplored areas**: None (đã khảo sát toàn diện mọi phạm vi của R3 & R4).

## Key Decisions Made
- Thiết kế hệ thống Action Chips decoupled thông qua Native Custom Browser Events (`project:open-modal`, `roadmap:open-modal`, `roadmap:select-layer`).
- Xây dựng component dùng chung `ChatMarkdown` zero external dependencies thay thế toàn bộ parser regex phân mảnh cũ.
- Tách 13 inline icons trong `RoadmapChatbotWidget.tsx` sang file riêng, giảm size widget từ 894 dòng xuống < 250 dòng.
- Sửa các render-phase ref mutation tuân thủ React 19 trong hook SDK.
- Hoàn thiện tài liệu `analysis.md` và `handoff.md`.

## Artifact Index
- DISPATCH.md — Dispatch instructions from orchestrator
- BRIEFING.md — Persistent working memory
- progress.md — Liveness heartbeat
- analysis.md — Technical findings and architectural breakdown
- handoff.md — 5-component handoff report
