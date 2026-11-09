---
task_id: "TASK-triage-removal-001"
branch: "chore/remove-knowledge-triage"
version: "2.0.0"
priority: "P2"
status: "READY"
assigned_executor: "antigravity"
max_attempts: 3
current_attempt: 0

boundaries:
  allowed_to_modify:
    # Phase 1: UI
    - "app/page.tsx"
    - "components/roadmap/KnowledgeTriageDrawer.tsx" # xoá
    - "components/roadmap/GoldenSetStatusCard.tsx" # xoá
    - "components/roadmap/RoadmapAssistantChatbot.tsx"
    # Phase 2: logic và API
    - "logic/roadmap/knowledgeTriageService.ts" # xoá
    - "app/api/v1/roadmaps/triage/**" # xoá
    - "lib/ai/langfuse.ts"
    - "app/api/chat/feedback/route.ts" # chỉ sửa comment
    # Phase 3: schema và DB local
    - "prisma/schema.prisma"
    - "prisma/init-turso.sql"
    - "lib/prisma.ts"
    - "roadmap-rag-assistant/tests/fixtures/schema.sql" # sinh lại bằng yarn test:schema-sql
    # Phase 4: script và test
    - "scripts/dedupe-knowledge-triage.ts" # xoá
    - "package.json" # CHỈ xoá dòng script db:dedupe-triage
    - "tests/route/triage-routes.test.ts" # xoá
    - "tests/route/rag-reindex.test.ts"
    - "tests/route/chat-feedback-route.test.ts"
    - "tests/manual/assistant-sections.md"
    - "tests/manual/triage-removal.md" # tạo mới
    - "tests/manual/README.md" # chỉ thêm 1 dòng vào bảng Kịch bản
    - "roadmap-rag-assistant/rag_service/observability.py" # chỉ sửa comment
    - "roadmap-rag-assistant/tests/test_rag.py" # chỉ sửa docstring
    # Phase 5: code-intel, skill, spec
    - ".agents/skills/cris-code-intel/data/cris-workspace-map.json"
    - ".agents/skills/cris-code-intel/SKILL.md"
    - ".agents/skills/cris-how-to-sync/SKILL.md"
    - ".agents/skills/cris-how-to-sync/references/ARCHITECTURAL_INVARIANTS.md"
    - "docs/code-intel/CRIS_WORKSPACE_MAP.md"
    - ".handoff/specs/TASK-topic-chapters-001.md"
    - ".handoff/specs/TASK-triage-removal-001.md" # chính file này (checklist, mục 4, 5)
  read_only_references:
    - "docs/adr/0003-langfuse-owns-feedback.md"
    - "docs/adr/0011-drop-knowledge-triage.md"
    - "GLOSSARY.md"
    - "hooks/use-floating-chat.ts"
    - "components/floating-bot/**"
    - "roadmap-rag-assistant/sdk/**"
    - "roadmap-rag-assistant/evals/**"
    - "tests/manual/README.md"
  strictly_forbidden:
    - "yarn.lock"
    - "docs/adr/**"
    - "GLOSSARY.md"
    - "roadmap-rag-assistant/sdk/**"
    - "hooks/use-floating-chat.ts"
    - "components/floating-bot/**"
    - "scripts/flatten-to-sections.ts"
    - "scripts/lib/flatten-sections.ts"
    - "tests/unit/flatten-sections.test.ts"
    - "docs/RAG_PRODUCTION_READINESS.md"
    - ".env*"

verification_gate:
  type_check: "yarn tsc --noEmit -p ."
  lint: "yarn lint"
  test: "yarn test"
  schema: "yarn test:schema-sql --check"
  knowledge_index: "yarn check:knowledge-index"
  python: "cd roadmap-rag-assistant && python -m pytest -q"
  code_intel: "yarn intel status"
  dead_refs: "grep -rniE 'knowledgeTriage|TriageItem|triage' app components logic lib hooks prisma roadmap-rag-assistant/rag_service roadmap-rag-assistant/tests tests/route package.json"
  boundary_check: "git status --porcelain"
---

# TASK: Xoá Knowledge Triage và 👍/👎 của Roadmap Assistant

## 1. Context & Architectural Intent

- **Goal**: Gỡ hết feature Knowledge Triage gồm UI, service, 7 API route, model Prisma `KnowledgeTriage`, script và test. Gỡ luôn phần nối 👍/👎 của Roadmap Assistant.
- **ADR**: ADR-0011 (thay ADR-0003).
- **Why**: Từ commit `7ecae25` (2026-11-05), 👍/👎 của Roadmap Assistant bị ẩn bằng `FEEDBACK_ENABLED = false`. Từ đó không còn 👎 mới để import, nên Triage không còn đầu vào. Đây là code chết có chi phí bảo trì (schema, test, spec topic-chapters Step 6). Owner quyết định bỏ hẳn. Dữ liệu 👎 vẫn nằm trên Langfuse, nếu cần có thể dựng lại.
- **GIỮ NGUYÊN, không đụng tới**:
  - `/api/chat/feedback` và 👍/👎 của **Cris AI** (`hooks/use-floating-chat.ts`, `components/floating-bot/**`). 👎 của Cris AI đi vào Langfuse Review Queue rồi vào Golden Set. Đây là phần lõi của ADR-0003.
  - `createFeedbackScore`, `deleteFeedbackScore`, `addToReviewQueue` trong `lib/ai/langfuse.ts`.
  - Golden Set: dataset Langfuse `cris-ai-golden-set`, `python -m evals sync-dataset`, `roadmap-rag-assistant/evals/datasets/_answer/meta.json`.
  - Prop `onFeedback` của SDK widget (`roadmap-rag-assistant/sdk/**`). Đây là API công khai và là optional.
  - Field `source` của feedback route. Field này vô hại và vẫn được lưu vào metadata trên Langfuse.
  - `scripts/flatten-to-sections.ts` và lib/test đi kèm. Đây là migration cũ đã chạy. Nó đọc `PRAGMA` cột của bảng, nên khi bảng không còn thì `triage = []`.
- **Quyết định đã chốt (không đề xuất lại)**:
  - Xoá luôn Golden Set status card và route `triage/golden-set`. Owner xem số liệu trên Langfuse.
  - Bảng production do Owner tự drop (xem mục "Ngoài phạm vi executor").
- **Blast radius** (GitNexus impact upstream, risk LOW; index đang cũ nên đã đối chiếu thêm bằng grep):
  - `fetchTriageItems` được gọi từ `RoadmapWorkspace` (`app/page.tsx`) và `KnowledgeTriageDrawer`.
  - `submitChatFeedback` được gọi từ `handleFeedback` (`RoadmapAssistantChatbot.tsx`).
  - `listDownvotedTraces` được gọi từ `POST` của `triage/import/route.ts`.
  - `getReviewStatus` được gọi từ `GET` của `triage/golden-set/route.ts`.
  - `KnowledgeTriage` không có relation nào, nên các Lesson đã approve vẫn giữ nguyên.

## 2. Invariants & Rules

- TypeScript strict, không dùng `any`, không `@ts-ignore`, không `eslint-disable`.
- Không thêm comment vào code mới. Comment cũ có nhắc tới triage thì sửa lại cho đúng hoặc xoá.
- Chỉ xoá và sửa. Không refactor, không đổi tên, không đổi style ngoài phạm vi.
- Không chạm Turso production, không đọc `.env*`.
- Không thêm hay nâng dependency. `package.json` chỉ được xoá đúng một dòng `db:dedupe-triage`.
- Sau khi xoá, export nào không còn ai dùng (type, helper nội bộ) thì xoá theo. Dùng `yarn lint` và `yarn tsc` để tìm.

## 3. Step-by-Step Implementation Checklist

### Phase 1: UI

- [ ] **Step 1.1 (`app/page.tsx`)**: Xoá các phần sau, rồi xoá import hoặc icon nào trở thành không dùng:
  - import `KnowledgeTriageDrawer` và `fetchTriageItems`;
  - state `isTriageDrawerOpen` và `triageBadgeCount`;
  - `refreshTriageBadge` và `useEffect` lắng nghe `roadmap:triage-updated`;
  - nút "Triage" kèm badge (khoảng dòng 312–320);
  - block `<KnowledgeTriageDrawer …/>` (khoảng dòng 517–527).
- [ ] **Step 1.2**: Xoá file `components/roadmap/KnowledgeTriageDrawer.tsx` và `components/roadmap/GoldenSetStatusCard.tsx`.
- [ ] **Step 1.3 (`RoadmapAssistantChatbot.tsx`)**: Xoá import `submitChatFeedback`, hằng `FEEDBACK_ENABLED` cùng comment phía trên, hàm `handleFeedback`, và prop `onFeedback={…}` truyền vào `RoadmapChatbotWidget`. Nếu import type `FeedbackDetail` trở thành không dùng thì xoá.
- [ ] **Step 1.4**: Chạy `grep -rn "roadmap:triage-updated" .` (bỏ qua `node_modules` và `.next`). Kết quả phải rỗng. Nếu còn chỗ nào dispatch event này thì xoá dòng dispatch.

### Phase 2: Logic và API

- [ ] **Step 2.1**: Xoá `logic/roadmap/knowledgeTriageService.ts` và cả thư mục `app/api/v1/roadmaps/triage/` (7 route: `route.ts`, `[id]/route.ts`, `[id]/approve`, `[id]/dismiss`, `[id]/generate`, `import`, `golden-set`).
- [ ] **Step 2.2 (`lib/ai/langfuse.ts`)**: Xoá `DownvotedTrace`, `listDownvotedTraces`, `ReviewStatus`, `getReviewStatus`, và helper hoặc hằng nội bộ nào chỉ hai hàm này dùng. Sửa comment ở khoảng dòng 88: bỏ ý "so knowledge triage can import them".
- [ ] **Step 2.3 (`app/api/chat/feedback/route.ts`)**: Chỉ sửa comment, không đổi logic. Dòng 14 đổi thành mô tả trung lập, ví dụ "Which assistant answered, e.g. \"roadmap-assistant\"". Ở dòng 24, xoá câu "Knowledge triage items are imported from these scores by the owner."

### Phase 3: Schema và DB local

- [ ] **Step 3.1 (`prisma/schema.prisma`)**: Xoá `model KnowledgeTriage` cùng comment ngay phía trên.
- [ ] **Step 3.2 (`prisma/init-turso.sql`)**: Xoá `CREATE TABLE … "KnowledgeTriage"` và hai `CREATE INDEX` của bảng này.
- [ ] **Step 3.3 (`lib/prisma.ts`)**: Trong `isCurrentClient`, bỏ `knowledgeTriage?: unknown;` và `&& delegates.knowledgeTriage`.
- [ ] **Step 3.4**: Chạy `yarn prisma generate`, rồi `yarn test:schema-sql` để sinh lại `roadmap-rag-assistant/tests/fixtures/schema.sql`. Sau đó `yarn test:schema-sql --check` phải pass.
- [ ] **Step 3.5 (DB local, tuỳ chọn)**: Nếu có `dev.db`, chỉ được chạy `DROP TABLE IF EXISTS "KnowledgeTriage";` trên `dev.db`. Không dùng `db:push` lên Turso.

### Phase 4: Script và test

- [ ] **Step 4.1**: Xoá `scripts/dedupe-knowledge-triage.ts` và dòng `"db:dedupe-triage": …` trong `package.json`. Không sửa gì khác trong `package.json`.
- [ ] **Step 4.2**: Xoá `tests/route/triage-routes.test.ts`.
- [ ] **Step 4.3 (`tests/route/rag-reindex.test.ts`)**:
  - Bỏ 6 entry `triage/…` trong `NOT_INDEXED`. Nếu set rỗng thì giữ `new Set<string>()` để logic filter không đổi.
  - Sửa comment phía trên, bỏ câu về triage.
  - Ở test "discovers the write handlers": bỏ "triage approve" trong comment. Đếm lại số handler thực tế sau khi đã xoá `approve` và chỉnh `toBeGreaterThanOrEqual(N)` cho khớp. Ghi số N vào mục 5.
- [ ] **Step 4.4 (`tests/route/chat-feedback-route.test.ts`)**: Xoá test "never writes knowledge triage…" và `prismaMock` cùng `vi.mock("@/lib/prisma", …)`. Giữ nguyên các test còn lại.
- [ ] **Step 4.5 (Python)**:
  - `rag_service/observability.py` dòng 21: sửa comment thành "Also a trace tag, so Langfuse can filter this assistant's traces". Không đổi `TRACE_NAME` hay `TRACE_TAGS`.
  - `tests/test_rag.py` dòng 12: đổi "(web UI, triage approve)" thành "(web UI)".
- [ ] **Step 4.6 (Test thủ công)**: Đọc `tests/manual/README.md` trước.
  - Trong `tests/manual/assistant-sections.md`, đánh dấu G2 và G3 là đã bỏ (theo quy ước của README, kèm lý do "TASK-triage-removal-001").
  - Tạo `tests/manual/triage-removal.md` và thêm 1 dòng vào bảng "Kịch bản" trong README. Các case:
    - (T1) Trang roadmap `/` với quyền Owner: không còn nút Triage, console không lỗi.
    - (T2) Network không còn request tới `/api/v1/roadmaps/triage`.
    - (T3) Chat Roadmap Assistant: câu trả lời không có nút 👍/👎.
    - (T4) Cris AI ở `/portfolio`: bấm 👎 thì `POST /api/chat/feedback` trả 204.
    - (T5) `GET /api/v1/roadmaps/triage` trả 404.
  - Ghi kết quả (ngày, commit, môi trường).

### Phase 5: Code-intel, skill và spec

- [ ] **Step 5.1 (`cris-workspace-map.json`)**:
  - Xoá entryPoint `EP_API_TRIAGE_POST` và `EP_API_TRIAGE_APPROVE`, flow `FLOW_MISSING_KNOWLEDGE_TRIAGE`, dataModel `MODEL_KNOWLEDGE_TRIAGE`.
  - Trong các entry còn lại, bỏ mọi tham chiếu tới id hoặc file vừa xoá.
  - Đổi domain `triage-observability` thành `observability` (title "Observability & Golden Set", summary chỉ còn Langfuse traces/scores và Golden Set evals). Cập nhật mọi chỗ trỏ tới id cũ.
  - Cập nhật `headCommit` và `generatedAt`. `yarn intel status` phải không lỗi.
- [ ] **Step 5.2 (`docs/code-intel/CRIS_WORKSPACE_MAP.md`)**:
  - Bỏ node `API_Triage`, `TriageService` và các cạnh liên quan trong sơ đồ mermaid (khoảng dòng 28, 33, 64, 78).
  - Đổi dòng domain (khoảng dòng 92) sang `observability`, `keyFiles` chỉ còn `lib/ai/langfuse.ts` và `app/api/chat/feedback/route.ts`.
  - Xoá 2 dòng route triage trong bảng API (khoảng dòng 221–222).
- [ ] **Step 5.3 (Skill)**:
  - `cris-code-intel/SKILL.md` dòng 104 và `cris-how-to-sync/SKILL.md` dòng 96 và 110: đổi `triage-observability` thành `observability`, bỏ chữ "Triage queue" và "Knowledge Triage".
  - `ARCHITECTURAL_INVARIANTS.md` dòng 71: xoá dòng về Triage.
- [ ] **Step 5.4 (`TASK-topic-chapters-001.md`)**: Xoá `"app/api/v1/roadmaps/triage/**"` trong `allowed_to_modify`, bullet về `KnowledgeTriage.section` (khoảng dòng 97), và Step 6 (Triage). Nếu có bước nào được đánh số lại thì giữ nguyên nội dung của bước đó.

### Phase 6: Gate và commit

- [ ] **Step 6.1**: Chạy toàn bộ `verification_gate`.
  - `dead_refs` phải rỗng. Nếu còn kết quả, mỗi dòng phải được giải thích trong mục 5 (ví dụ: chữ "triage" mang nghĩa khác).
  - `boundary_check` chỉ được có file trong `allowed_to_modify`.
- [ ] **Step 6.2**: Commit một lần với message `chore: remove Knowledge Triage and roadmap assistant votes (TASK-triage-removal-001)`, body liệt kê 5 phase. Không push.
- [ ] **Step 6.3**: Điền mục 4 và 5, đặt `status: COMPLETED`.

### Ngoài phạm vi executor (Owner / Architect làm)

- **Architect**: đã xong trước khi giao task. Đã có `docs/adr/0011-drop-knowledge-triage.md`, ADR-0003 đã chuyển sang `superseded by ADR-0011`, `GLOSSARY.md` đã bỏ "Knowledge Triage" và "Triage Status". Executor không sửa các file này.
- **Owner**, sau khi branch đã deploy:
  - Backup: `turso db shell <db> "SELECT * FROM KnowledgeTriage" > triage-backup-<ngày>.txt`, hoặc `.dump`.
  - Chạy `DROP TABLE IF EXISTS "KnowledgeTriage";` rồi kiểm tra lại bằng `.tables`.
  - Thao tác này không hoàn tác được.
- Sau khi merge: chạy `gitnexus analyze --skip-agents-md` và cập nhật memory `llmops-scope-langfuse-only`.

## 4. Verification Gate Results

- [ ] `TypeCheck`: PENDING
- [ ] `Lint`: PENDING
- [ ] `Test`: PENDING
- [ ] `Schema`: PENDING
- [ ] `Knowledge index`: PENDING
- [ ] `Python`: PENDING
- [ ] `Code intel`: PENDING
- [ ] `Dead refs`: PENDING
- [ ] `Boundary Check`: PENDING

## 5. Execution Audit Log

- **Git Commit Hash**: `Chưa có`
- **Số handler ở rag-reindex (Step 4.3)**: `Chưa có`
- **Modified Files**:
  - `Chưa có`
- **Ghi chú / lệch spec**:
  - `Chưa có`
