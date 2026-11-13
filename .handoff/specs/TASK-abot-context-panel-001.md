---
task_id: "TASK-abot-context-panel-001"
branch: "main"
version: "3.0.0"
type: "implement"
priority: "P1"
status: "COMPLETED"
assigned_executor: "antigravity"
max_attempts: 3
current_attempt: 0

boundaries:
  allowed_to_modify:
    - "roadmap-rag-assistant/rag_service/core/generation/generate.py"
    - "roadmap-rag-assistant/rag_service/core/generation/pipeline.py"
    - "roadmap-rag-assistant/rag_service/domains/roadmap/agent.py"
    - "roadmap-rag-assistant/rag_service/context_usage.py"
    - "roadmap-rag-assistant/rag_service/api/routes.py"
    - "roadmap-rag-assistant/tests/test_context_usage.py"
    - "roadmap-rag-assistant/sdk/typescript/src/types.ts"
    - "roadmap-rag-assistant/sdk/typescript/src/client.ts"
    - "roadmap-rag-assistant/sdk/typescript/src/react/types.ts"
    - "roadmap-rag-assistant/sdk/typescript/src/react/icons.tsx"
    - "roadmap-rag-assistant/sdk/typescript/src/react/useRoadmapAssistantChat.ts"
    - "roadmap-rag-assistant/sdk/typescript/src/react/RoadmapChatbotWidget.tsx"
    - "roadmap-rag-assistant/sdk/typescript/src/react/components/ChatHeader.tsx"
    - "roadmap-rag-assistant/sdk/typescript/src/react/components/ContextUsageSheet.tsx"
    - "tests/manual/abot-context-panel.md"
  continues_dirty: []
  read_only_references:
    - "AGENTS.md"
    - "docs/adr/**"
    - "GLOSSARY.md"
    - "roadmap-rag-assistant/rag_service/steps.py"
    - "roadmap-rag-assistant/rag_service/observability.py"
    - "roadmap-rag-assistant/rag_service/core/retrieval/transform.py"
    - "roadmap-rag-assistant/rag_service/core/augmentation/history.py"
    - "roadmap-rag-assistant/sdk/typescript/src/react/components/FeedbackReasonSheet.tsx"
    - "app/api/roadmap-assistant/[...path]/route.ts"
    - "tests/manual/README.md"
  strictly_forbidden:
    - "package.json"
    - "yarn.lock"
    - "tsconfig.json"
    - "prisma/**"
    - "roadmap-rag-assistant/requirements.txt"
    - "roadmap-rag-assistant/pyproject.toml"
    - "roadmap-rag-assistant/evals/**"

verification_gate:
  type_check: "yarn tsc --noEmit -p ."
  lint: "yarn lint"
  test: "yarn test"
  python_test: "cd roadmap-rag-assistant && python -m pytest -q"
  boundary_check: "bash .agents/skills/agent-handoff/scripts/check-boundary.sh TASK-abot-context-panel-001"
---

# TASK: Mục "Context" trong menu ⋮ của Abot

## 1. Context & Architectural Intent

- **Goal**: Thêm mục **Context** vào menu ⋮ của Abot. Bấm vào mở một sheet cho biết lượt trả lời gần nhất đã đưa những gì vào context của LLM và mỗi phần tốn bao nhiêu token, giống panel "Context" của Claude Code: một thanh tổng có các đoạn màu, rồi một bảng gồm tên phần, số token và phần trăm.
- **Why**: Đây là ví dụ sống để dạy Context Engineering (TASK-context-engineering-001). Owner cũng nhìn được Abot đang dồn context vào đâu: lịch sử, tài liệu truy xuất hay system prompt.
- **Dependencies**:
  - Menu ⋮: `sdk/typescript/src/react/components/ChatHeader.tsx`. State `isOptionsOpen` nằm ở `RoadmapChatbotWidget.tsx`.
  - Chỗ gọi LLM sinh câu trả lời: `rag_service/core/generation/generate.py#astream`. Prompt được ghép ở `core/generation/pipeline.py`.
  - Usage thật của LLM: `rag_service/observability.py` (khoảng dòng 118) đã map `usage_metadata` (`input_tokens`, `output_tokens`).
  - Lịch sử hội thoại: `core/retrieval/transform.py#HISTORY_TURNS` (= 4) và `history_store.get_recent`.
  - Luồng SSE: `rag_service/api/routes.py` (các `event: ...`, rồi `done`). SDK parse ở `sdk/typescript/src/client.ts` (khoảng dòng 237).
  - Mẫu sheet có sẵn: `components/FeedbackReasonSheet.tsx`.

## 2. Invariants & Rules

- Rule dự án: `AGENTS.md`. Naming theo đúng component, không gắn use-case. Ví dụ dùng `ContextUsageSheet` và prop `usage`, không dùng `isAbotContextLoading`.
- **Hợp đồng SSE mới**: `event: context`, phát **một lần** trước `event: done`, chỉ ở lượt có gọi LLM sinh câu trả lời. Lượt trả lời từ guard hay template thì không phát. Payload:
  ```json
  {
    "model": "string",
    "window": 0,
    "input_tokens": 0,
    "output_tokens": 0,
    "measured": true,
    "parts": [{ "key": "system", "label": "System prompt", "tokens": 0 }]
  }
  ```
  - `parts` gồm các key cố định, theo đúng thứ tự: `system` (system prompt và luật trả lời), `history` (các lượt cũ đưa vào, ghi kèm `turns` / `max_turns`), `retrieved` (các đoạn tài liệu, ghi kèm `chunks`), `page` (ngữ cảnh trang: topic/item đang mở), `message` (câu hỏi hiện tại). Phần nào rỗng thì `tokens: 0`, không bỏ key.
  - Token của từng phần là **ước lượng** từ chuỗi đã ghép, theo một hàm duy nhất trong `rag_service/context_usage.py`, ví dụ `ceil(len(text) / 4)`. Không thêm thư viện tokenizer.
  - `input_tokens` lấy từ `usage_metadata` khi provider trả về, khi đó `measured: true`. Thiếu thì lấy tổng ước lượng và đặt `measured: false`.
  - `window` là context window của model đang dùng. Lấy từ config nếu có, không có thì dùng một hằng số trong `context_usage.py`, ghi rõ nguồn trong comment.
- **Không lộ nội dung**: payload chỉ chứa số và nhãn. Không gửi text của system prompt, tài liệu hay lịch sử.
- **Quyền xem**: mục Context hiện cho cả Visitor và Owner, vì payload chỉ có số.
- Không đổi schema `ChatResponse` của `/chat` (non-stream). Không thêm endpoint mới.
- Event lạ phải bị SDK bỏ qua như hiện nay. Client cũ không vỡ.
- UI: không trộn Tailwind với inline style. Màu dùng các token đang dùng trong SDK (`#1F1E1C`, `#5E5B55`, `#E6E4DF`, `#F4F3F0`, `#C2410C`, …). Sheet phải dùng được ở mobile drawer.
- Ngoài phạm vi: tóm tắt hay nén lịch sử, thay đổi `HISTORY_TURNS`, đếm token cho router/verifier LLM (chỉ tính lượt sinh câu trả lời), lưu usage vào DB.

## 3. Step-by-Step Implementation Checklist

- [ ] **Step 1**: Tạo `rag_service/context_usage.py`: hàm `estimate_tokens(text)`, dataclass/TypedDict cho payload, và hàm dựng payload từ các phần đã ghép cùng `usage_metadata` tuỳ chọn.
- [ ] **Step 2**: Trong `core/generation/pipeline.py` / `generate.py`: giữ lại chuỗi của từng phần khi ghép prompt. Sau khi `astream` xong, đọc `usage_metadata` của message cuối (giống `observability.py`) và gắn payload vào `StreamResult` hoặc kết quả pipeline.
- [ ] **Step 3**: Ở `domains/roadmap/agent.py` và `api/routes.py`: phát `event: context` ngay trước `event: done` khi lượt có payload. Thêm một test trong `tests/test_context_usage.py`, gồm ước lượng token, đủ 5 key đúng thứ tự, fallback `measured: false`, và stream của một lượt RAG có đúng một `event: context` đứng trước `done` (mock LLM như các test sẵn có).
- [ ] **Step 4**: SDK `types.ts` và `client.ts`: thêm type `ContextUsage` và callback `onContext`. Trong `useRoadmapAssistantChat.ts`, giữ `contextUsage` của lượt gần nhất. `clearMessages` thì reset về `null`.
- [ ] **Step 5**: Tạo `components/ContextUsageSheet.tsx`:
  - Tiêu đề "Context" và dòng `x% đã dùng · <input_tokens>/<window>`.
  - Một thanh ngang chia đoạn theo `parts`.
  - Bảng các phần: chấm màu, nhãn, số token, %. Có thêm dòng "Còn trống".
  - Ghi chú nhỏ "ước lượng" khi `measured: false`.
  - Chưa có dữ liệu thì hiện "Gửi một câu hỏi để xem context của lượt trả lời."
  - Số token định dạng qua hàm format, ví dụ `12.4k`. Hàm này dùng chung, không viết inline nhiều chỗ.
- [ ] **Step 6**: Trong `ChatHeader.tsx`, thêm nút **Context** (icon mới trong `icons.tsx`) nằm giữa "Cuộc trò chuyện mới" và "Thu gọn". Bấm thì đóng menu và mở sheet. Đặt state mở/đóng sheet ở `RoadmapChatbotWidget.tsx`. Sheet đóng được bằng Esc, bấm ra ngoài, hoặc nút đóng.
- [ ] **Step 7**: Viết kịch bản `tests/manual/abot-context-panel.md` theo `tests/manual/README.md`, gồm: menu có mục Context; sheet rỗng trước lượt đầu; sau một câu hỏi kiến thức thì có số liệu; câu chào hoặc guard không làm thay đổi số liệu; "Cuộc trò chuyện mới" reset; hiển thị đúng ở mobile drawer. Chạy kịch bản với `yarn dev` + `yarn rag:dev` rồi ghi kết quả.

## 4. Verification Gate Results
<!-- Executor điền: PENDING | PASSED | FAILED | SKIPPED -->
- [ ] `TypeCheck`: PENDING
- [ ] `Lint`: PENDING
- [ ] `Test`: PENDING
- [ ] `Python Test`: PENDING
- [ ] `Boundary Check`: PENDING

## 5. Execution Audit Log
<!-- Executor điền. Không commit: Dev commit sau khi Claude verify -->
- **Result file**: `.handoff/runs/TASK-abot-context-panel-001/result.json`
- **Modified Files**:
  - `...`
