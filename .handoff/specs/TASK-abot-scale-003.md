---
task_id: "TASK-abot-scale-003"
branch: "feat/abot-scale-003" # Dev tạo từ main sau khi TASK-abot-scale-002 merge
version: "3.0.0"
type: "implement"
priority: "P1"
status: "COMPLETED" # Đã chốt Option (A) cho Q1–Q4 (2026-11-26); C1/C2/C3 đã qua full verification gate (chờ Dev git commit)
assigned_executor: "antigravity"
max_attempts: 3
current_attempt: 0

boundaries:
  allowed_to_modify:
    - "roadmap-rag-assistant/rag_service/state/session_store.py"
    - "roadmap-rag-assistant/rag_service/api/routes.py"
    - "roadmap-rag-assistant/rag_service/api/schemas.py"
    - "roadmap-rag-assistant/rag_service/execution/changes.py"
    - "roadmap-rag-assistant/rag_service/domains/roadmap/commands.py"
    - "roadmap-rag-assistant/rag_service/domains/roadmap/lesson_content.py"
    - "roadmap-rag-assistant/rag_service/domains/roadmap/lesson_edit.py"
    - "roadmap-rag-assistant/rag_service/domains/roadmap/lesson_status.py"
    - "roadmap-rag-assistant/rag_service/domains/roadmap/memory_commands.py"
    - "roadmap-rag-assistant/rag_service/domains/roadmap/quiz_commands.py"
    - "roadmap-rag-assistant/rag_service/webmcp_planner.py"
    - "roadmap-rag-assistant/sdk/typescript/src/types.ts"
    - "roadmap-rag-assistant/sdk/typescript/src/client.ts"
    - "roadmap-rag-assistant/sdk/typescript/src/react/types.ts"
    - "roadmap-rag-assistant/sdk/typescript/src/react/useRoadmapAssistantChat.ts"
    - "roadmap-rag-assistant/sdk/typescript/src/react/components/MessageList.tsx"
    - "roadmap-rag-assistant/sdk/typescript/src/react/components/ChangeReviewCard.tsx"
    - "components/roadmap/RoadmapWebMcpRegistrar.tsx"
    - "components/roadmap/RoadmapAssistantChatbot.tsx"
    - "hooks/use-roadmap-webmcp.ts"
    - "logic/roadmap/roadmapAssistantService.ts"
    - "app/api/roadmap-assistant/*/route.ts" # `*` thay cho [...path] vì check-boundary.sh so glob bash
    - "app/api/roadmap-assistant/thread/route.ts"
    - "roadmap-rag-assistant/evals/datasets/_routing/samples.jsonl"
    - "roadmap-rag-assistant/evals/datasets/_answer/samples.jsonl"
    - "roadmap-rag-assistant/evals/datasets/tags.json"
    - "roadmap-rag-assistant/evals/router/holdout.jsonl"
    - "roadmap-rag-assistant/evals/router/baseline.json"
    - "roadmap-rag-assistant/evals/router/decisions.jsonl"
    - "roadmap-rag-assistant/tests/**"
    - "tests/unit/**"
    - "tests/route/**"
    - ".agents/skills/cris-code-intel/data/cris-workspace-map.json"
    - "docs/code-intel/CRIS_WORKSPACE_MAP.md"
    - ".agents/skills/cris-how-to-sync/references/ARCHITECTURAL_INVARIANTS.md"
    - ".handoff/PLAN-second-brain.md"
    - "docs/abot-next-actions-plan.md"
  continues_dirty: [] # commit e16f1a7 đã đưa route.ts, schemas.py, engine.py, test_health_index.py, roadmap-assistant-proxy.test.ts và tests/load/** lên HEAD
  read_only_references:
    - "docs/adr/**"
    - "GLOSSARY.md"
    - ".handoff/PLAN-abot-scale.md"
    - ".handoff/specs/TASK-abot-scale-001.md"
    - ".handoff/specs/TASK-abot-scale-002.md"
    - "roadmap-rag-assistant/evals/README.md"
    - "roadmap-rag-assistant/evals/GUIDELINES.md"
    - "roadmap-rag-assistant/evals/router/confuse.py"
    - "roadmap-rag-assistant/evals/router/stress_confuse.jsonl"
    - "roadmap-rag-assistant/evals/router/confuse_baseline.json"
    - "roadmap-rag-assistant/rag_service/domains/roadmap/router/**"
    - "roadmap-rag-assistant/rag_service/write_grant.py"
    - "roadmap-rag-assistant/rag_service/core/thread_api.py"
    - "lib/auth/write-access.ts"
    - "app/api/chat/feedback/route.ts"
  strictly_forbidden:
    - "package.json"
    - "yarn.lock"
    - "tsconfig.json"
    - "docs/adr/**"
    - "GLOSSARY.md"
    - "middleware.ts"
    - "prisma/dev.db"
    - "components/floating-bot/**"
    - "hooks/use-floating-chat.ts"
    - "roadmap-rag-assistant/rag_service/core/memory/**"
    - "roadmap-rag-assistant/rag_service/domains/roadmap/linking_advisor.py"
    - "roadmap-rag-assistant/rag_service/domains/roadmap/profile.py"
    - "roadmap-rag-assistant/rag_service/domains/roadmap/prompts.py"
    - "roadmap-rag-assistant/evals/router/stress_confuse.jsonl"
    - "roadmap-rag-assistant/evals/router/confuse_baseline.json"

deploy_steps: [] # Giữ nguyên: Q2 đã chốt Option (A), schema Turso không thay đổi.

fast_gate: ["type_check", "python_tests", "vitest_targeted", "evals_validate", "router_check", "boundary_check"]
verification_gate:
  type_check: "yarn tsc --noEmit -p ."
  lint: "yarn lint"
  vitest_targeted: "yarn vitest run tests/unit/abot-preview-edit-titles.test.tsx tests/unit/change-review.test.tsx tests/unit/sdk-chat-hook.test.tsx tests/unit/sdk-widget.test.tsx tests/route/assistant-thread-route.test.ts tests/route/roadmap-assistant-proxy.test.ts"
  test: "yarn test"
  python_tests: "cd roadmap-rag-assistant && .venv/bin/python -m pytest -q"
  evals_validate: "cd roadmap-rag-assistant && .venv/bin/python -m evals validate"
  router_check: "cd roadmap-rag-assistant && .venv/bin/python -m evals router-check && .venv/bin/python -m evals.router.holdout && .venv/bin/python -m evals.router.confuse"
  agents_sync: "yarn agents:sync --check"
  intel_status: "yarn intel status"
  doctor_delta: "yarn doctor --since HEAD --check"
  boundary_check: "bash .agents/skills/agent-handoff/scripts/check-boundary.sh TASK-abot-scale-003"
---

# TASK: Hợp nhất Pending Action / Preview UI, an toàn ghi WebMCP, bổ sung Evals và đồng bộ Map/Docs

> **Trạng thái hiện tại** (cập nhật mỗi khi dừng): `COMPLETED (2026-11-26)` — Batch C của `.handoff/PLAN-abot-scale.md` (C1 `#51`, C2 `#50`, C3 `#52`) đã qua full verification gate trên `main` @ `1dfcd0b` (chờ Dev `git commit`). Owner đã chốt **Option (A)** cho toàn bộ Q1–Q4 ngày `2026-11-26`.

## 0. Quyết định đã chốt của Owner (2026-11-26)

> **Đã khóa (2026-11-26):** Owner phê duyệt **Option (A)** cho toàn bộ **Q1–Q4** (`deploy_steps: []` giữ nguyên vì không thay đổi schema Turso).

| # | Câu hỏi | Lựa chọn | Quyết định đã chốt (2026-11-26) |
|---|---|---|---|
| Q1 | UX an toàn cho thao tác ghi qua WebMCP (`/webmcp` và `document.modelContext`) | **A)** Chỉ đăng ký WebMCP tools khi `canWrite === true` (`RoadmapWebMcpRegistrar`), đồng thời giữ `webmcp_planner.py` ở chế độ **read-only** (chặn/chuyển yêu cầu ghi sang luồng `Preview -> ok` của chat RAG qua `write_gate`), hoặc yêu cầu xác nhận UI trước `ctx.executeTool`. **B)** Cho phép 7 tool ghi WebMCP chạy trực tiếp nếu `is_owner()` kèm modal xác nhận UI và `write_gate`. | **Option (A) — Đã chốt**: Chỉ mount WebMCP cho `Owner` (`canWrite`), ép `/chat/plan` kiểm `is_owner()`, giữ `/webmcp` read-only / yêu cầu luồng `Preview -> ok` của Abot thay vì chạy thẳng `ctx.executeTool`. |
| Q2 | Khôi phục metadata (`traceId`, `sources`, `citations`, `changes`) cho `Thread` của `Owner` khi tải lại từ Turso (`GET /api/roadmap-assistant/thread`) | **A)** Giữ schema `ThreadMessage` tối giản (ADR-0012): không migration DB, UI tự ẩn/khóa hợp lý các thành phần cần metadata live trên tin nhắn khôi phục từ DB (giữ `sessionStorage` cho metadata phiên hiện tại). **B)** Thêm cột `metadataJson String?` vào `ThreadMessage` (`prisma/schema.prisma`, `prisma/init-turso.sql`, migration Turso, `app/api/v1/threads/*/route.ts`, `thread_api.py`). | **Option (A) — Đã chốt**: Giữ schema `ThreadMessage` tối giản, `deploy_steps: []`. |
| Q3 | Trạng thái nút Feedback 👍/👎 của Abot (`onFeedback` trong `RoadmapAssistantChatbot.tsx`) | **A)** Giữ nguyên trạng thái **tắt** nút 👍/👎 trên Abot (vì Knowledge Triage đã bỏ theo ADR-0011), vẫn giữ nút `ID` copy Langfuse `traceId` cho `Owner` và dọn ghi chú `FEEDBACK_ENABLED = false` lỗi thời trong `docs/abot-next-actions-plan.md`. **B)** Bật lại `onFeedback` trỏ `/api/chat/feedback` (`source: "roadmap-assistant"`, ADR-0003). | **Option (A) — Đã chốt**: Giữ tắt trên Abot, giữ nút `ID` copy `traceId` cho `Owner`, không đụng Cris AI. |
| Q4 | Phạm vi hợp nhất `POST /chat/confirm` & `/chat/cancel` và `ChangeReviewCard` | **A)** Hợp nhất toàn bộ `Pending Action` qua contract `action_preview` có cấu trúc + hỗ trợ đủ các loại `Pending Action` tại `POST /chat/confirm` và `/chat/cancel` (`routes.py`), đồng thời phát `change_review` cho cả cập nhật nội dung `Lesson` (`_handle_pending_content_draft`) và `Owner Memory` (`_handle_pending_memory`). **B)** Chỉ sửa `MessageList.tsx` đọc `action_preview`, giữ `/chat/confirm` chỉ cho `pending_confirmation`. | **Option (A) — Đã chốt**: Hợp nhất REST contract `/chat/confirm` & `/chat/cancel` + `action_preview` có cấu trúc + `ChangeReviewCard` cho cả nội dung `Lesson` và `Owner Memory`. |

## 1. Context & Architectural Intent
- **Goal**:
  1. Hợp nhất cơ chế `Pending Action` ở backend (`session_store.py`, `commands.py`, `routes.py`) và `Preview` / `ChangeReviewCard` ở TypeScript SDK (`MessageList.tsx`, `ChangeReviewCard.tsx`, `types.ts`, `client.ts`) để bỏ heuristic dò chuỗi dễ vỡ và hỗ trợ đầy đủ mọi loại `Change` (kể cả nội dung `Lesson` và `Owner Memory`).
  2. Bịt lỗ hổng an toàn ghi ở WebMCP (`RoadmapWebMcpRegistrar.tsx`, `hooks/use-roadmap-webmcp.ts`, `webmcp_planner.py`, `routes.py#/chat/plan`): không cho `Visitor` đăng ký/lập kế hoạch ghi và không cho tool ghi chạy thẳng mà thiếu xác nhận.
  3. Bổ sung bộ test/eval `evals/` còn thiếu cho `OwnerMemory`, `Quiz`, `LessonContent`, và nâng cấp/chuyển đổi concept thành `Lesson`, rồi đồng bộ toàn bộ map `cris-code-intel`, tài liệu kiến trúc và `PLAN-second-brain.md` / `docs/abot-next-actions-plan.md`.
- **Why**:
  - Hiện `SessionContext` (`session_store.py` L23-62) tách rời 6 slot pending rời rạc (`pending_confirmation`, `pending_section_rename`, `pending_content_draft`, `pending_status_change`, `pending_lesson_edit`, `pending_memory_change`), `POST /chat/confirm` (`routes.py` L438-468) chỉ đọc mỗi `pending_confirmation`, còn `MessageList.tsx` L421-425 bật `ConfirmActions` bằng `msg.content.includes("Xác nhận thực hiện") || msg.content.includes("DRY-RUN PREVIEW")` — khiến `lesson_status.py` L382 (viết chữ thường `"xác nhận thực hiện"`) không hiện nút xác nhận.
  - `_handle_pending_content_draft` (`commands.py` L239-279) và `_handle_pending_memory` (`commands.py` L195-237) chưa phát `event: change_review` cho `ChangeReviewCard`.
  - `app/api/roadmap-assistant/thread/route.ts` L59-64 chỉ khôi phục `{ id, role, content, timestamp }` và `HealthResponse` ở `sdk/typescript/src/types.ts` L211-216 chưa khai báo trường `index` (`IndexHealthInfo` trong `schemas.py` L67-83).
  - `RoadmapWebMcpRegistrar` (`app/layout.tsx` L179) gắn 13 tool không kiểm `canWrite`; `webmcp_planner.py` L38-39 chỉ lọc `delete_*`, để 7 tool ghi chạy thẳng qua `ctx.executeTool` (`logic/roadmap/roadmapAssistantService.ts` L57) mà không qua `Preview`, `write_gate`, `profile.py` hay `<owner_memory>`.
  - `evals/router/` hiện chưa có sample định tuyến/giữ an toàn cho `OwnerMemory`, `Quiz`, `LessonContent`, hoặc chuyển đổi concept thành `Lesson`; tài liệu map (`CRIS_WORKSPACE_MAP.md`, `ARCHITECTURAL_INVARIANTS.md`, `PLAN-second-brain.md`, `docs/abot-next-actions-plan.md`, comment `route.ts` L11) đang tụt sau ADR-0011..0019.
- **Dependencies**:
  - Thực thi **sau** `TASK-abot-scale-001` (Batch A: thu gọn instruction + timeout proxy `chat/context`) và `TASK-abot-scale-002` (Batch B: `OwnerMemory` Tier 1 + nâng cấp concept thành `Lesson` Tier 2 trên `commands.py`, `lesson_content.py`, `quiz_commands.py`).
  - `roadmap-rag-assistant/rag_service/state/session_store.py#SessionContext`, `#SessionStore`
  - `roadmap-rag-assistant/rag_service/domains/roadmap/commands.py#RoadmapCommands.handle_pending`, `#_pop_simple_pending_stream`, `#_ask_confirmation`
  - `roadmap-rag-assistant/rag_service/api/routes.py#confirm_action`, `#cancel_action`, `#plan`, `#health`
  - `roadmap-rag-assistant/rag_service/execution/changes.py#ChangeSet`
  - `roadmap-rag-assistant/rag_service/webmcp_planner.py#plan_webmcp_call`, `#_allowed_tools`
  - `roadmap-rag-assistant/sdk/typescript/src/react/components/MessageList.tsx#ConfirmActions`, `#MessageItem`
  - `roadmap-rag-assistant/sdk/typescript/src/react/components/ChangeReviewCard.tsx#ChangeReviewCard`
  - `hooks/use-roadmap-webmcp.ts#useRoadmapWebMcpTools`, `#ROADMAP_WEBMCP_TOOLS`
  - `components/roadmap/RoadmapWebMcpRegistrar.tsx#RoadmapWebMcpRegistrar`
  - `logic/roadmap/roadmapAssistantService.ts#runWebMcpCommand`, `#isRoadmapWriteTool`
  - `app/api/roadmap-assistant/thread/route.ts#GET`, `app/api/roadmap-assistant/[...path]/route.ts#forward`
  - Flow: `FLOW_ABOT_CHAT_QUERY`, `FLOW_ABOT_CUD_PREVIEW_CONFIRM`, `FLOW_ABOT_ACCESS_GUARD`, `FLOW_ABOT_OWNER_MEMORY_MANAGE`, `FLOW_ABOT_ACTIVE_RECALL_QUIZ`, `FLOW_ABOT_LINKING_AND_PROVENANCE`, `FLOW_EVALS_ROUTER_STRESS`.
  - **Baseline Notice**: Các thay đổi trước đó (`e16f1a7`: timeout proxy, `/health` telemetry, load harnesses) và (`476eef3`: runtime pins, `AGENTS.md`, `BACKLOG.md`, `PLAN-*`) đều đã nằm trên `HEAD`. Executor vẫn kiểm tra trạng thái sạch trước khi chạy `baseline.sh` cho `TASK-abot-scale-003`.

## 2. Invariants & Rules
- Rule dự án: `AGENTS.md` và `.agents/skills/cris-how-to-sync/references/ARCHITECTURAL_INVARIANTS.md`.
- **ADR-0002 / ADR-0019 (Phân quyền Actor)**: `Visitor` tuyệt đối không được đăng ký/gọi WebMCP write tools, không xem được `OwnerMemory`, và không xác nhận `Pending Action` qua `/chat/confirm` hay `/chat/stream`. Mọi kiểm tra vẫn phải giữ tại endpoint Next.js (`requireWriteAccess`) và FastAPI (`is_owner()`, `write_granted`).
- **ADR-0012 (Turso Thread State)**: `Pending Action` chỉ nằm trong RAM (`session_store.py`, TTL `PENDING_TTL_SECONDS = 600.0`), không bao giờ lưu xuống DB hay phục hồi qua restart.
- **ADR-0003 / ADR-0011**: Không khôi phục Knowledge Triage; giữ nguyên luồng 👍/👎 hiện có của **Cris AI** (`app/api/chat/feedback/route.ts`, `components/floating-bot/**`, `hooks/use-floating-chat.ts`).
- **Router Ratchet (`TASK-router-stress-001`)**: `stress_confuse.jsonl` là tập đo lường bất biến (*"Measured, never tuned on"*, `confuse.py` L8), không sửa file này hay nới `confuse_baseline.json` (`write_now_violation == 0`, `missed_write <= 3`, `wrong_branch <= 91`, `preview_violation <= 23`). `write_now_violation` trên cả `confuse.py` lẫn `holdout.py` **phải luôn bằng 0**. Khi thêm sample mới vào `_routing` / `_answer` / `holdout.jsonl`, chạy `evals validate` và `router-check` (chỉ `--accept` `baseline.json` / `decisions.jsonl` sau khi rà diff và xác nhận không giảm metric).
- **Glossary (`GLOSSARY.md`)**: Không dùng từ cấm (`_Avoid_`), giữ chuẩn thuật ngữ `Topic`, `Section`, `Lesson` (`RoadmapItem`), `Lesson Status`, `Actor` (`Owner`/`Visitor`), `Thread`, `Owner Memory`, `Preview`, `Pending Action`, `Change`, `Provenance`, `Feedback`.
- **Sonar Clean Code (`ab4c9e3`) & `cris-doctor`**: Không tăng độ phức tạp vượt ngưỡng ESLint `sonarjs` hoặc Ruff; `yarn doctor --since HEAD --check` phải 0 finding bug/risk mới.
- **Ngoài phạm vi**:
  - Sửa logic `OwnerMemory` extractor/store (`core/memory/**`, `app/api/v1/memories/**`) hoặc `linking_advisor.py` (đã thuộc `TASK-abot-scale-002`).
  - Sửa `profile.py` / `prompts.py` / `context_usage.py` (đã thuộc `TASK-abot-scale-001`).
  - Thay đổi Cris AI (`/portfolio`, `components/floating-bot/**`, `hooks/use-floating-chat.ts`).

## 3. Step-by-Step Implementation Checklist

- [x] **Step 1 — Hợp nhất `Pending Action` ở Backend (`session_store.py`, `commands.py`, `routes.py`, `schemas.py`)**:
  - Trong `roadmap-rag-assistant/rag_service/state/session_store.py`: chuẩn hóa truy xuất/xóa các slot pending qua helper chung trên `SessionContext` (giữ tương thích field hiện có hoặc đóng gói envelope có `kind`, `action_id`, `payload`, `ttl`) và đảm bảo `fresh_pending` / `clear_pending` áp dụng thống nhất.
  - Trong `roadmap-rag-assistant/rag_service/api/routes.py#confirm_action` & `#cancel_action` (+ `schemas.py#ActionConfirmResponse`): cho phép `POST /chat/confirm` và `POST /chat/cancel` thực thi/hủy **mọi** loại `Pending Action` đang còn hạn (`pending_confirmation`, `pending_content_draft`, `pending_memory_change`, `pending_lesson_edit`, `pending_section_rename`, `pending_status_change`, bao gồm cả pending concept promotion từ `TASK-abot-scale-002`), dùng chung logic thực thi trong `commands.py#RoadmapCommands` dưới `write_granted(...)` và trả `changes` khi có dữ liệu ghi.

- [x] **Step 2 — Chuẩn hóa `action_preview` & `ChangeReviewCard` giữa Python và TypeScript SDK**:
  - Trong `commands.py`, `lesson_content.py`, `lesson_edit.py`, `lesson_status.py`, `memory_commands.py`, `quiz_commands.py`: mọi nơi phát `{"type": "action_preview", ...}` phải gửi metadata có cấu trúc: `action_id`, `kind` (ví dụ `cud`, `content_draft`, `lesson_edit`, `section_rename`, `status_change`, `memory_change`), `confirmable: True` (và giữ `editable_titles` / `editable_target` ở các luồng hỗ trợ sửa trước khi xác nhận). Sửa dòng gợi ý chữ thường `"xác nhận thực hiện"` ở `lesson_status.py` L382 cho nhất quán.
  - Trong `roadmap-rag-assistant/rag_service/execution/changes.py#ChangeSet` & `commands.py` (`_handle_pending_content_draft`, `_handle_pending_memory`): bổ sung ghi nhận thay đổi dạng cập nhật/bộ nhớ (hoặc `op: "update"` / `level: "memory" | "content"`) và phát `event: change_review` sau khi xác nhận thành công.
  - Trong `roadmap-rag-assistant/sdk/typescript/src/types.ts`, `client.ts#streamChat`, `react/types.ts#ChatMessage`, `react/useRoadmapAssistantChat.ts#onActionPreview`:
    - Khai báo `ActionPreviewMeta` (`actionId`, `kind`, `confirmable`, `editableTitles`, `editableTarget`) trên `ChatMessage` và parse đầy đủ từ SSE `event: action_preview`.
    - Bổ sung kiểu `index?: IndexHealthInfo` vào `HealthResponse` (`sdk/typescript/src/types.ts`) khớp `schemas.py#IndexHealthInfo`.
  - Trong `sdk/typescript/src/react/components/MessageList.tsx#MessageItem` & `#ConfirmActions` và `ChangeReviewCard.tsx`:
    - Thay thế điều kiện heuristic `msg.content.includes("Xác nhận thực hiện") || msg.content.includes("DRY-RUN PREVIEW")` bằng `Boolean(msg.actionPreview?.confirmable)` (theo Q4 Option A), đồng thời cập nhật `tests/unit/abot-preview-edit-titles.test.tsx`.
    - Cập nhật `ChangeReviewCard.tsx` hiển thị gọn các `op` cập nhật (`update`) và loại `memory` / `content` từ `ChangeSet`.

- [x] **Step 3 — Đồng bộ khôi phục `Thread` & trạng thái `Feedback`**:
  - Trong `app/api/roadmap-assistant/thread/route.ts#GET` + `sdk/typescript/src/react/useRoadmapAssistantChat.ts`: áp dụng **Q2 Option (A)** (giữ schema `ThreadMessage` tối giản theo ADR-0012, không migration DB; gắn cờ `isRestored` nếu cần để UI không kỳ vọng metadata stream cũ) và **Q3 Option (A)** (giữ tắt `onFeedback` trên `RoadmapAssistantChatbot.tsx`, giữ nút `ID` copy `traceId` cho `Owner`).

- [x] **Step 4 — Siết chặt an toàn ghi cho WebMCP (`RoadmapWebMcpRegistrar`, `use-roadmap-webmcp.ts`, `webmcp_planner.py`, `routes.py`)**:
  - Trong `components/roadmap/RoadmapWebMcpRegistrar.tsx` và `hooks/use-roadmap-webmcp.ts#useRoadmapWebMcpTools`: kiểm tra `useCanWrite()`; chỉ đăng ký WebMCP tools khi `canWrite === true`, và hủy đăng ký (`controller.abort()`) ngay khi `canWrite` chuyển `false`.
  - Trong `roadmap-rag-assistant/rag_service/webmcp_planner.py#plan_webmcp_call` và `rag_service/api/routes.py#plan`:
    - Kiểm tra `is_owner()` trong `plan_webmcp_call` (`/chat/plan`): nếu không phải `Owner`, không bao giờ chọn tool ghi (`create_*`, `update_*`, `rename_*`, `reorder_*`, `delete_*`).
    - Áp dụng **Q1 Option (A)**: lọc bỏ toàn bộ write tools trong `_allowed_tools` (chỉ giữ nhóm read-only `get_current_context`, `list_roadmaps`, `get_roadmap`, `export_roadmaps`) và trả lời hướng dẫn dùng luồng `Preview -> ok` của Abot khi `Owner` yêu cầu CUD qua `/webmcp`.
    - Đồng bộ `logic/roadmap/roadmapAssistantService.ts#runWebMcpCommand` & `#ROADMAP_WRITE_TOOL_RE` (đảm bảo `roadmap:updated` truyền đủ `detail` và nhất quán với các tool được phép).

- [x] **Step 5 — Bổ sung `evals/` và Unit/Route Tests**:
  - Thêm sample vào `roadmap-rag-assistant/evals/datasets/_routing/samples.jsonl` (định tuyến `OwnerMemory`, `Quiz`, `LessonContent`, nâng cấp concept thành `Lesson`), `_answer/samples.jsonl` (grounding `<owner_memory>`, không rò rỉ `OwnerMemory` sang `Visitor`), và `roadmap-rag-assistant/evals/router/holdout.jsonl` (câu hỏi thông thường về memory/quiz/concept phải có `write: "no"`, không kích hoạt `write_now_violation`). Giữ nguyên `stress_confuse.jsonl` và `confuse_baseline.json`; chạy `evals validate`, `evals router-check` (rà diff và `--accept` nếu hợp lệ), `evals.router.holdout`, `evals.router.confuse` (bắt buộc `write_now_violation == 0`, `missed_write <= 3`, `wrong_branch <= 91`, `preview_violation <= 23`).
  - Bổ sung unit/integration test:
    - Python (`roadmap-rag-assistant/tests/`): `test_sse.py` & `test_change_review.py` (confirm/cancel qua `/chat/confirm` cho mọi loại `Pending Action`; `action_preview` có cấu trúc; `change_review` cho content draft & memory), `test_webmcp_planner.py` (chặn `Visitor`, chặn/gắn xác nhận cho 7 tool ghi).
    - Next.js (`tests/unit/`, `tests/route/`): `abot-preview-edit-titles.test.tsx`, `change-review.test.tsx`, `sdk-chat-hook.test.tsx`, `sdk-widget.test.tsx`, `assistant-thread-route.test.ts`, và test mới cho `use-roadmap-webmcp.ts` / `RoadmapWebMcpRegistrar.tsx` (`canWrite=false` không đăng ký tool ghi).

- [x] **Step 6 — Đồng bộ Code Intelligence, ADRs Reference & Docs**:
  - Sửa comment lỗi thời ở `app/api/roadmap-assistant/[...path]/route.ts` L11 (`"Public on purpose"` -> phản ánh đúng ADR-0019 site chỉ dành cho `Owner` + proxy vẫn gán `x-actor` chặt).
  - Cập nhật `.agents/skills/cris-code-intel/data/cris-workspace-map.json` (`headCommit`, `generatedAt`, thêm/sửa symbols cho `FLOW_ABOT_CUD_PREVIEW_CONFIRM`, `FLOW_ABOT_OWNER_MEMORY_MANAGE`, `FLOW_ABOT_ACTIVE_RECALL_QUIZ`, `FLOW_ABOT_LINKING_AND_PROVENANCE`, WebMCP safety) và `docs/code-intel/CRIS_WORKSPACE_MAP.md` (ADR-0012..0019, cập nhật mô hình phẳng Topic/Section/Lesson theo ADR-0008/0009, bổ sung News/Provenance/OwnerMemory/WebMCP).
  - Cập nhật `.agents/skills/cris-how-to-sync/references/ARCHITECTURAL_INVARIANTS.md` (bổ sung bảng ADR-0011..0019).
  - Rà soát và dọn các ghi chú lỗi thời còn sót: commit `476eef3` đã cập nhật `PLAN-*` (kể cả trạng thái các task trong `.handoff/PLAN-second-brain.md` — chỉ kiểm tra lại nếu còn mục lệch), nên Step 6 tập trung kiểm tra/dọn ghi chú cũ còn lại (ví dụ cờ `FEEDBACK_ENABLED = false` trong `docs/abot-next-actions-plan.md` và comment `"Public on purpose"` ở `route.ts` L11).

- [x] **Step 7 — Chạy toàn bộ Verification Gate**:
  - Chạy đầy đủ `type_check`, `lint`, `test`, `python_tests`, `evals_validate`, `router_check`, `agents_sync`, `intel_status`, `doctor_delta`, `boundary_check` và điền kết quả vào Mục 4.

## 4. Verification Gate Results
<!-- Executor điền: PENDING | PASSED | FAILED | SKIPPED -->
- [x] `TypeCheck`: PASSED (`yarn tsc --noEmit -p .` & `npx tsc --noEmit -p roadmap-rag-assistant/sdk/typescript/tsconfig.json`: 0 errors)
- [x] `Lint`: PASSED trên phạm vi file đổi (`npx eslint --max-warnings=0` 12 file Next.js/test + `npx eslint --no-ignore --max-warnings=0` 7 file SDK `.ts/.tsx`: 0 errors, 0 warnings; `.venv/bin/ruff check rag_service` & 4 file test Python: `All checks passed!`)
- [x] `Vitest Targeted`: PASSED (`yarn vitest run` 7 file từ spec L91 + `roadmap-webmcp.test.tsx`: `7 files passed, 69 passed` in `5.37s`)
- [x] `Test`: PASSED (`yarn test`: `141 test files passed`, `1353 passed | 8 skipped (1361)` in `21.67s`; 8 skipped có sẵn ở `tests/e2e/tier1-r3-action-chips.test.ts`)
- [x] `Python Tests`: PASSED (`1262 passed in 55.66s`; `test_write_invariants.py`, `test_sse.py`, `test_change_review.py`, `test_webmcp_planner.py`, `test_owner_memory.py`, `test_concept_promotion.py` pass; `.venv/bin/mypy` 9 file nguồn typed Batch C: `Success: no issues found`)
- [x] `Evals Validate`: PASSED (`OK: 501 samples in 4 datasets, 125 documents in 1 corpora`)
- [x] `Router Check (router-check + holdout + confuse)`: PASSED (`router-check`: `heldout.intent_cases.correct=64`, `heldout.routing.correct=273`, `stress.dropped=0`, `stress.misroute=0`, `stress.wrong_write=0`; `holdout`: `n=75, write_now_violations=0, write_preview_violations=7, missed_writes=0`; `confuse`: `n=504, write_now_violation=0, preview_violation=23, missed_write=3, wrong_branch=91 — ratchet: ok`)
- [x] `Agents Sync`: PASSED (`yarn agents:sync --check`, `yarn test:schema-sql --check`, `yarn check:knowledge-index` đều PASS)
- [x] `Intel Status`: PASSED (`yarn intel status`: `🟢 OK`, `Domains 6 | Entry Points 56 | Flows 19 | Data Models 10 | ADR Rules 17`, `251 ref map + 59 ref docs đều khớp code`)
- [x] `Doctor Delta`: PASSED (`yarn doctor --since HEAD --check`: `0 bug · 0 risk · 0 nit · 0 mới`)
- [x] `Boundary Check`: PASSED (`43` file Batch C trong `git status --porcelain` khớp `allowed_to_modify` với `0` vi phạm `strictly_forbidden`; cùng working tree còn `2` file vá Batch B `useOwnerMemories.ts` & `test_owner_memory.py` + `2` doc `.handoff/` đã sign-off; không dùng `baseline.txt` nên đối chiếu trực tiếp qua glob spec)

## 5. Execution Audit Log
<!-- Executor điền. Không commit: Dev commit sau khi Claude verify -->
- **Result file**: N/A (thực thi qua swarm C1 `#51`, C2 `#50`, C3 `#52` & verify bởi `@verifier-sync`)
- **Modified Files** (43 files Batch C: C1 `12`, C2 `20`, C3 `11`):
  - C1 (`12`): `roadmap-rag-assistant/rag_service/state/session_store.py`, `roadmap-rag-assistant/rag_service/api/routes.py`, `roadmap-rag-assistant/rag_service/api/schemas.py`, `roadmap-rag-assistant/rag_service/execution/changes.py`, `roadmap-rag-assistant/rag_service/domains/roadmap/commands.py`, `roadmap-rag-assistant/rag_service/domains/roadmap/lesson_content.py`, `roadmap-rag-assistant/rag_service/domains/roadmap/lesson_edit.py`, `roadmap-rag-assistant/rag_service/domains/roadmap/lesson_status.py`, `roadmap-rag-assistant/rag_service/domains/roadmap/memory_commands.py`, `roadmap-rag-assistant/rag_service/domains/roadmap/quiz_commands.py`, `roadmap-rag-assistant/tests/test_sse.py`, `roadmap-rag-assistant/tests/test_change_review.py`
  - C2 (`20`): `roadmap-rag-assistant/rag_service/webmcp_planner.py`, `roadmap-rag-assistant/sdk/typescript/src/types.ts`, `roadmap-rag-assistant/sdk/typescript/src/client.ts`, `roadmap-rag-assistant/sdk/typescript/src/react/types.ts`, `roadmap-rag-assistant/sdk/typescript/src/react/useRoadmapAssistantChat.ts`, `roadmap-rag-assistant/sdk/typescript/src/react/components/MessageList.tsx`, `roadmap-rag-assistant/sdk/typescript/src/react/components/ChangeReviewCard.tsx`, `components/roadmap/RoadmapWebMcpRegistrar.tsx`, `hooks/use-roadmap-webmcp.ts`, `logic/roadmap/roadmapAssistantService.ts`, `app/api/roadmap-assistant/thread/route.ts`, `app/api/roadmap-assistant/[...path]/route.ts`, `roadmap-rag-assistant/tests/test_webmcp_planner.py`, `tests/unit/abot-preview-edit-titles.test.tsx`, `tests/unit/change-review.test.tsx`, `tests/unit/sdk-chat-hook.test.tsx`, `tests/unit/sdk-widget.test.tsx`, `tests/unit/roadmap-webmcp.test.tsx`, `tests/route/assistant-thread-route.test.ts`, `tests/route/roadmap-assistant-proxy.test.ts`
  - C3 (`11`): `roadmap-rag-assistant/evals/datasets/_routing/samples.jsonl`, `roadmap-rag-assistant/evals/datasets/_answer/samples.jsonl`, `roadmap-rag-assistant/evals/datasets/tags.json`, `roadmap-rag-assistant/evals/router/holdout.jsonl`, `roadmap-rag-assistant/evals/router/baseline.json`, `roadmap-rag-assistant/evals/router/decisions.jsonl`, `.agents/skills/cris-code-intel/data/cris-workspace-map.json`, `docs/code-intel/CRIS_WORKSPACE_MAP.md`, `.agents/skills/cris-how-to-sync/references/ARCHITECTURAL_INVARIANTS.md`, `.handoff/PLAN-second-brain.md`, `docs/abot-next-actions-plan.md`
- **Bài học** (Claude điền khi verify PASS, tối đa 3 dòng):
  - Hợp nhất 7 slot pending trong `session_store.py` (`PENDING_ACTION_KIND`, `SessionContext.active_pending`) và chuẩn hóa `build_action_preview_event` giúp `/chat/confirm`, `/chat/cancel` và `ConfirmActions` bỏ hoàn toàn dò chuỗi text mong manh.
  - Khóa WebMCP hai lớp (`RoadmapWebMcpRegistrar` chỉ mount khi `useCanWrite()` là `true`, đồng thời `webmcp_planner.py` chặn `Visitor` và chỉ giữ `READ_ONLY_WEBMCP_TOOLS`) ngăn mọi ghi trực tiếp bỏ qua `Preview -> ok` mà không ảnh hưởng luồng chat Abot.
