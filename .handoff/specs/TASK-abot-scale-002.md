---
task_id: "TASK-abot-scale-002"
branch: "feat/abot-scale-002" # nhánh đề xuất từ main sau khi TASK-abot-scale-001 hoàn tất
version: "3.0.0"
type: "implement"
priority: "P1"
status: "COMPLETED" # Owner đã chốt Q1–Q7 = (A) ngày 2026-11-26; B1/B2/B3 đã qua full verification gate (HEAD 1dfcd0b + 3 file vá chờ commit)
assigned_executor: "antigravity"
max_attempts: 3
current_attempt: 0

boundaries:
  allowed_to_modify:
    - "roadmap-rag-assistant/rag_service/core/memory/extractor.py"
    - "roadmap-rag-assistant/rag_service/core/memory/store.py"
    - "roadmap-rag-assistant/rag_service/core/memory/__init__.py"
    - "roadmap-rag-assistant/rag_service/api/routes.py"
    - "roadmap-rag-assistant/rag_service/domains/roadmap/agent.py"
    - "roadmap-rag-assistant/rag_service/domains/roadmap/commands.py"
    - "roadmap-rag-assistant/rag_service/domains/roadmap/lesson_content.py"
    - "roadmap-rag-assistant/rag_service/domains/roadmap/linking_advisor.py"
    - "roadmap-rag-assistant/rag_service/domains/roadmap/quiz_commands.py"
    - "roadmap-rag-assistant/rag_service/domains/roadmap/router/grounding.py"
    - "roadmap-rag-assistant/rag_service/domains/roadmap/router/scope.py"
    - "roadmap-rag-assistant/rag_service/execution/executor.py"
    - "roadmap-rag-assistant/rag_service/tools/item_tools.py"
    - "roadmap-rag-assistant/rag_service/adapters/base.py"
    - "roadmap-rag-assistant/rag_service/adapters/http_adapter.py"
    - "roadmap-rag-assistant/rag_service/adapters/sqlite_adapter.py"
    - "roadmap-rag-assistant/rag_service/state/session_store.py"
    - "app/api/v1/memories/route.ts"
    - "app/api/v1/memories/*/route.ts"
    - "logic/roadmap/roadmapAssistantService.ts"
    - "roadmap-rag-assistant/sdk/typescript/src/react/components/OwnerMemorySheet.tsx"
    - "roadmap-rag-assistant/sdk/typescript/src/react/useOwnerMemories.ts"
    - "roadmap-rag-assistant/sdk/typescript/src/client.ts"
    - "roadmap-rag-assistant/sdk/typescript/src/types.ts"
    - "roadmap-rag-assistant/tests/test_memory_phase2_and_quiz.py"
    - "roadmap-rag-assistant/tests/test_owner_memory.py"
    - "roadmap-rag-assistant/tests/test_phase3_provenance_and_linking.py"
    - "roadmap-rag-assistant/tests/test_lesson_content.py"
    - "roadmap-rag-assistant/tests/test_scope.py"
    - "roadmap-rag-assistant/tests/test_concept_promotion.py"
    - "tests/route/memories-route.test.ts"
    - "tests/unit/owner-memory-sheet.test.tsx"
    - "tests/unit/roadmap-cud-ui.test.tsx"
  continues_dirty: []
  read_only_references:
    - "GLOSSARY.md"
    - "docs/adr/**"
    - "lib/roadmap/owner-memory.ts"
    - "lib/roadmap/create-lesson.ts"
    - "lib/roadmap/duplicates.ts"
    - "lib/roadmap/rag-reindex.ts"
    - "lib/provenance/**"
    - "app/api/v1/roadmaps/items/route.ts"
    - "app/api/v1/roadmaps/items/*/relations/route.ts"
    - "app/api/news/*/integrate/route.ts"
    - "app/api/news/*/match-lessons/route.ts"
    - "roadmap-rag-assistant/rag_service/write_grant.py"
    - "roadmap-rag-assistant/rag_service/domains/roadmap/retrieval/engine.py"
    - "roadmap-rag-assistant/tests/test_write_invariants.py"
    - "roadmap-rag-assistant/tests/test_generation_pipeline.py"
  strictly_forbidden:
    - "package.json"
    - "yarn.lock"
    - "tsconfig.json"
    - "middleware.ts"
    - "prisma/**"
    - "lib/roadmap/owner-memory.ts"
    - "lib/roadmap/queries.ts"
    - "app/api/v1/roadmaps/full-export/**"
    - "app/api/roadmap-assistant/**"
    - "docs/adr/**"
    - "GLOSSARY.md"
    - "roadmap-rag-assistant/rag_service/domains/roadmap/profile.py"
    - "roadmap-rag-assistant/rag_service/domains/roadmap/prompts.py"
    - "roadmap-rag-assistant/rag_service/core/augmentation/context.py"
    - "roadmap-rag-assistant/rag_service/core/generation/pipeline.py"
    - "roadmap-rag-assistant/rag_service/context_usage.py"
    - "roadmap-rag-assistant/rag_service/webmcp_planner.py"

deploy_steps: [] # Owner đã chốt Q1–Q7 = (A) (giữ 5 kind, giới hạn 300 ký tự, không đụng schema Turso) nên không có bước deploy ngoài repo.

fast_gate: ["type_check", "python_tests", "vitest_targeted", "boundary_check"]
verification_gate:
  type_check: "yarn tsc --noEmit -p ."
  lint: "yarn lint"
  vitest_targeted: "yarn vitest run tests/route/memories-route.test.ts tests/unit/owner-memory-sheet.test.tsx tests/unit/roadmap-cud-ui.test.tsx tests/route/roadmap-item-content-and-reorder.test.ts tests/route/roadmap-duplicates.test.ts tests/route/phase3-relations-and-provenance.test.ts"
  test: "yarn test"
  python_tests: "cd roadmap-rag-assistant && .venv/bin/python -m pytest -q"
  evals_validate: "cd roadmap-rag-assistant && .venv/bin/python -m evals validate"
  router_check: "cd roadmap-rag-assistant && .venv/bin/python -m evals router-check"
  router_confuse: "cd roadmap-rag-assistant && .venv/bin/python -m evals.router.confuse"
  intel_status: "yarn intel status"
  doctor_delta: "yarn doctor --since HEAD --check"
  boundary_check: "bash .agents/skills/agent-handoff/scripts/check-boundary.sh TASK-abot-scale-002"
---

# TASK: Batch B — Mở rộng Auto-Capture hai tầng (`Owner Memory` & đưa khái niệm từ chat vào `Lesson`)

> **Trạng thái hiện tại**: COMPLETED (2026-11-26) — Owner đã chốt **(A)** cho Q1–Q7; B1/B2/B3 đã qua full verification gate trên `main` @ `1dfcd0b` cùng 3 file vá sau commit (`routes.py`, `useOwnerMemories.ts`, `test_owner_memory.py` chờ `git commit`).

## 0. Quyết định đã chốt của Owner (2026-11-26)

> **Đã khóa (2026-11-26)**: Owner duyệt phương án **(A)** cho toàn bộ **Q1–Q7**. Vì không thay đổi schema Turso (giữ 5 `OWNER_MEMORY_KINDS`, giới hạn 300 ký tự, và giữ `KnowledgeProvenance` cho `News Item`), `deploy_steps: []` tiếp tục giữ nguyên hiệu lực.

| # | Câu hỏi | Lựa chọn | Đề xuất / Đã chốt |
|---|---|---|---|
| Q1 | Chính sách khi chạm trần `MAX_PENDING_MEMORIES = 10` (`extractor.py`, `quiz_commands.py`) | (A) Giữ trần 10, hiện nhắc duyệt trong `OwnerMemorySheet` và ưu tiên đẩy khoảng trống khái niệm thành `Preview` tạo/bổ sung `Lesson` thay vì làm đầy hàng chờ `Owner Memory`; (B) Tăng trần (vd 20) hoặc thay thế mục `pending` cũ nhất theo FIFO; (C) Dành riêng 2 slot cho ghi chú từ Quiz. | **ĐÃ CHỐT (A)** — Giữ trần 10 để tránh nhiễu hàng chờ; Quiz vẫn gợi ý `Preview` cập nhật `Lesson` độc lập với trần memory. |
| Q2 | Giữ 5 giá trị `OWNER_MEMORY_KINDS` (`profile`, `techstack`, `goal`, `preference`, `learning_note`) hay thêm loại `concept`? | (A) Giữ nguyên 5 loại theo ADR-0015; mọi khái niệm kỹ thuật bền vững đều đưa sang `Lesson` (`RoadmapItem`) qua `Preview → ok`; (B) Thêm loại `concept` vào `OwnerMemory` (cần sửa ADR-0015, `prisma/schema.prisma`, `lib/roadmap/owner-memory.ts`, migration Turso). | **ĐÃ CHỐT (A)** — Giữ 5 loại; `Owner Memory` chỉ chứa sự thật/quy ước cá nhân của `Owner`, kiến thức chuyên môn sống trong `Lesson`. |
| Q3 | Có tạo bản ghi `KnowledgeProvenance` cho `Lesson` được tạo/bổ sung từ chat không? | (A) Giữ `KnowledgeProvenance` dành riêng cho `News Item` theo ADR-0017; `Lesson` tạo từ chat là nội dung chuẩn của `Lesson` (có thể kèm liên kết `KnowledgeRelation` `relates`); (B) Cho phép tạo `KnowledgeProvenance` với `newsItemId = null`, `authorType = "ai_assisted"` (cần ADR mới/cập nhật ADR-0017). | **ĐÃ CHỐT (A)** — Giữ `Provenance` cho `News Item` theo ADR-0017 để không pha loãng semantics nguồn ngoài. |
| Q4 | Giới hạn 300 ký tự của `Owner Memory` và cơ chế chống trùng ngữ nghĩa | (A) Giữ giới hạn 300 ký tự (`lib/roadmap/owner-memory.ts`, ADR-0015); chống trùng bằng chuẩn hóa token/Jaccard + `replacesMemoryId` (không dùng Vector DB ngoài theo ADR-0015); (B) Nới giới hạn lên 500–600 ký tự (cần sửa `lib/roadmap/owner-memory.ts` và ADR-0015). | **ĐÃ CHỐT (A)** — Giữ 300 ký tự; nội dung dài hơn thuộc về `Lesson`, không thuộc `Owner Memory`. |
| Q5 | Mặc định `Lesson Status` và tự gợi ý `KnowledgeRelation` (`relates`) khi đưa khái niệm từ chat thành `Lesson` | (A) `Lesson` mới từ `Domain Gap` hoặc lỗ hổng Quiz mặc định `status = "target"` (giống `IntegrateRequestSchema` của News); `linking_advisor` gợi ý các `Lesson` liên quan trong `Preview` để nối `relates` khi `Owner` đồng ý; (B) Mặc định `status = "known"` như `create-lesson.ts`; không gợi ý `relates` qua chat. | **ĐÃ CHỐT (A)** — Mặc định `"target"` cho bài mới từ khoảng trống kiến thức (chỉ chuyển `"learning"`/`"known"` nếu `Owner` soạn nội dung hoặc yêu cầu rõ) + gợi ý `relates` trong `Preview`. |
| Q6 | Cơ chế nút "Đưa vào `Lesson`" trong `OwnerMemorySheet.tsx` | (A) Mở chọn `Topic` + `Section` ngay trong `OwnerMemorySheet`, gọi `POST /api/v1/roadmaps/items` rồi chuyển `OwnerMemory` sang `archived` (`PATCH /api/v1/memories/[id]`); (B) Chèn lệnh mẫu vào ô chat để `Owner` gửi qua `Roadmap Assistant` soạn bài. | **ĐÃ CHỐT (A)** — Gọi API trực tiếp từ `OwnerMemorySheet` kèm lựa chọn lưu trữ (`archived`) để thao tác gọn trong một bước, không phụ thuộc độ trễ LLM. |
| Q7 | Có chạy `_maybe_schedule_memory_extraction` cho endpoint đồng bộ `POST /chat` (`routes.py`) ngoài `POST /chat/stream` không? | (A) Gọi chung helper bất đồng bộ fail-open ở cả `/chat/stream` và `/chat` (chỉ khi `is_owner()`); (B) Giữ chạy nền chỉ trên `/chat/stream`. | **ĐÃ CHỐT (A)** — Gom helper cho cả hai endpoint để hành vi `Owner` nhất quán. |

## 1. Context & Architectural Intent
- **Goal**: Nâng cấp khả năng ghi nhớ và kết tinh tri thức của `Roadmap Assistant` theo kiến trúc hai tầng:
  - **Tầng 1 (`Owner Memory`)**: Nắm bắt được các tín hiệu ngữ nghĩa ngoài danh sách từ khóa tĩnh (`_SIGNAL_CUES`), có ngữ cảnh câu trả lời, chống trùng theo ngữ nghĩa/paraphrase, xếp hạng chọn lọc theo ngữ cảnh truy vấn và `lastUsedAt`, hoàn thiện luồng duyệt/chỉnh sửa/lưu trữ/đẩy lên `Lesson` tại `OwnerMemorySheet`.
  - **Tầng 2 (`Lesson` / `RoadmapItem`)**: Kết nối `Domain Gap`, lỗ hổng khái niệm từ Active Recall `Quiz`, và yêu cầu lưu khái niệm qua chat tới `linking_advisor.py` (kiểm tra trùng lặp `>= 0.75`, gợi ý bài để nối tiếp, cảnh báo phiên bản, gợi ý `Topic`/`Section` và liên kết `relates`), đi qua `LessonContentCommands` / `ActionExecutor` theo đúng luồng `Preview → ok`, đồng thời thống nhất cơ chế re-index giữa chế độ HTTP và SQLite.
- **Why**:
  - Hiện `core/memory/extractor.py#has_memory_signal` bị trói bởi 49 chuỗi con tĩnh và chặn mọi câu kết thúc bằng `?`, khiến các nhận định/quyết định nảy sinh trong hỏi đáp bị bỏ sót; `select_owner_memories` bỏ qua `lastUsedAt` và mức liên quan với câu hỏi; `POST /api/v1/memories` gọi `notifyOwnerMemoryChanged()` cả khi ghi `pending`; `usePendingMemoryCount` phụ thuộc `setTimeout(..., 2000)` nên badge dễ trễ.
  - Ở phía kiến thức nền, `Scope.DOMAIN_GAP` (`grounding.py#domain_gap_reply`) chỉ trả một dòng lệnh mẫu rỗng `thêm bài ... vào topic …` khi retrieval về 0 kết quả; `QuizCommands#_maybe_suggest_quiz_gap_note` chỉ ghi tối đa 1 `learning_note` `pending` (300 ký tự) và không giúp làm giàu `Lesson`; `ActionExecutor._create_items` bỏ qua `content`/`status`; `update_item_content`, `import_items_from_text`, `rename_section` thiếu trigger sync ở chế độ SQLite trong khi `ActionExecutor` lại chạy sync dư ở chế độ HTTP; `ROADMAP_WRITE_TOOL_RE` thiếu các tool mới khiến UI không tự làm mới.
- **Dependencies**:
  - Phụ thuộc hoàn thành **Batch A** (`TASK-abot-scale-001`): `profile.py`, `prompts.py`, `context.py`, `pipeline.py`, `context_usage.py`, proxy timeout tại `app/api/roadmap-assistant/[...path]/route.ts`. Batch C (`TASK-abot-scale-003`) sẽ tiếp nối trên phần chuẩn hóa toàn bộ pending slot, `/chat/confirm`, `MessageList.tsx`, WebMCP và bổ sung `evals/`.
  - Symbols & files liên quan:
    - Tier 1: `roadmap-rag-assistant/rag_service/core/memory/extractor.py#has_memory_signal`, `#maybe_suggest_memories`, `store.py#select_owner_memories`, `api/routes.py#_maybe_schedule_memory_extraction`, `app/api/v1/memories/route.ts#POST`, `app/api/v1/memories/*/route.ts#PATCH`, `OwnerMemorySheet.tsx`, `useOwnerMemories.ts#usePendingMemoryCount`.
    - Tier 2: `domains/roadmap/linking_advisor.py#match_news_to_lessons`, `domains/roadmap/router/scope.py#classify_scope`, `domains/roadmap/router/grounding.py#domain_gap_reply`, `domains/roadmap/agent.py#_handle_knowledge_or_plan`, `domains/roadmap/lesson_content.py#handle_lesson_content`, `domains/roadmap/quiz_commands.py#_finish_active_quiz_turn`, `domains/roadmap/commands.py#handle_pending`, `execution/executor.py#ActionExecutor`, `tools/item_tools.py#update_item_content`, `adapters/{base,http_adapter,sqlite_adapter}.py`, `state/session_store.py#SessionContext`, `logic/roadmap/roadmapAssistantService.ts#isRoadmapWriteTool`.
  - Flows (`cris-code-intel`): `FLOW_ABOT_CHAT_QUERY`, `FLOW_ABOT_CUD_PREVIEW_CONFIRM`, `FLOW_ABOT_ACCESS_GUARD`, `FLOW_ABOT_OWNER_MEMORY_MANAGE`, `FLOW_ABOT_ACTIVE_RECALL_QUIZ`, `FLOW_ABOT_LINKING_AND_PROVENANCE`.

## 2. Invariants & Rules
- Tuân thủ `AGENTS.md` và thuật ngữ chuẩn tại `GLOSSARY.md`: tránh các từ cấm như `knowledge node`, `bài viết`, `confirm card`, `queued action`, `user profile`, `global context`, `long-term prompt`, `mastery`, `no-context`, `missing lesson`, `citation` (khi nói về Provenance).
- **Cách ly `Actor` (`ADR-0002`, `ADR-0015`)**: `Visitor` tuyệt đối không được kích hoạt auto-extraction, không đọc/ghi `/api/v1/memories`, không nhận `<owner_memory>` hay `Provenance`, và không được thấy các nút `Preview` tạo/bổ sung `Lesson` từ `Domain Gap`. Mọi đường ghi ở Next.js phải gọi `requireWriteAccess(req)` và mọi đường ghi ở Python phải kiểm `is_owner()`.
- **Kiểm soát HITL (`ADR-0015`, `ADR-0012`)**:
  - Auto-capture vào `Owner Memory` luôn tạo `source = "suggested", status = "pending"` — không bao giờ tự bật thành `active`.
  - Mọi `Change` tạo hoặc cập nhật `Lesson` từ `Domain Gap`, `Quiz`, hoặc chat đều phải đi qua `Preview → ok` với `Pending Action` chỉ giữ trong RAM (`PENDING_TTL_SECONDS = 600.0`, không ghi xuống Turso).
- **Ranh giới tri thức (`ADR-0006`, `ADR-0010`, `ADR-0017`)**: `HybridRagEngine` dùng chung cho mọi `Actor`, nên nội dung `Lesson` (`RoadmapItem`) được tạo hoặc bổ sung từ chat KHÔNG được sao chép nguyên văn `<owner_memory>` hay thông tin riêng tư của `Owner` vào `RoadmapItem.content` (chỉ dùng `Owner Memory` làm ngữ cảnh ví dụ/phong cách ở bước nháp).
- **Bất biến lớp ghi (`roadmap-rag-assistant/tests/test_write_invariants.py`)**:
  - Mọi phương thức `create_*`, `update_*`, `delete_*` trên adapter (`HttpApiAdapter`, `SqliteAdapter`) bắt buộc giữ decorator `@guard_writes`.
  - Chỉ `WRITE_LAYER` (`executor.py`, `commands.py`, `tools/*.py`) được gọi `adapter.create_*` / `update_*` / `delete_*` — cấm gọi trực tiếp từ `agent.py`, `quiz_commands.py`, hay `lesson_content.py`.
  - Chỉ `DECISION_POINTS` (`commands.py`, `api/routes.py`) được mở ngữ cảnh `write_granted(...)`.
- **Tính trung lập nghiệp vụ của `core/` (`tests/test_generation_pipeline.py#test_core_never_names_a_business_domain`)**: Mã mới trong `rag_service/core/memory/extractor.py` và `store.py` KHÔNG được chứa từ vựng nghiệp vụ (`lộ trình`, `topic`, `layer`, `abot`, `roadmap`, `bài học`).
- **Không làm tụt ratchet định tuyến**: Sau khi sửa, chạy `evals validate`, `evals router-check` và `evals.router.confuse` phải đạt `wrong_write = 0` và không làm giảm độ chính xác hiện tại.
- **Không sửa phần thuộc Batch A / Batch C**: Không chạm `profile.py`, `prompts.py`, `context.py`, `pipeline.py`, `context_usage.py`, `app/api/roadmap-assistant/**`, `webmcp_planner.py`, hay phần `/chat/confirm` của `routes.py` (chỉ sửa `_maybe_schedule_memory_extraction` và endpoint `/chat` trong `routes.py`).
- **Ngoài phạm vi**: Tách hợp nhất UI `ConfirmActions` khỏi heuristic text và `/chat/confirm` toàn phần (Batch C `TASK-abot-scale-003`); WebMCP write safety (Batch C); mở rộng lớn bộ `evals/datasets` và đồng bộ `cris-workspace-map.json` (Batch C).

## 3. Step-by-Step Implementation Checklist

- [x] **Step 1 — Nâng cấp Tier 1 Auto-Extraction & Chống trùng ngữ nghĩa (`extractor.py`, `routes.py`)**
  - `roadmap-rag-assistant/rag_service/core/memory/extractor.py#has_memory_signal`, `#_build_extraction_prompt`, `#_parse_suggestions`, `#maybe_suggest_memories`:
    - Mở rộng tiền lọc `has_memory_signal` (tùy chọn nhận `assistant_reply` hoặc ngữ cảnh lượt chat) để bắt các tuyên bố/quyết định/đính chính hiểu nhầm không phụ thuộc cứng 49 chuỗi `_SIGNAL_CUES`, nhưng vẫn lọc rẻ các câu xã giao ngắn (`< MIN_MESSAGE_CHARS`, `_TRIVIAL_MESSAGES`) và câu hỏi tra cứu thuần túy để tránh gọi LLM lãng phí.
    - Bổ sung chống trùng theo token/Jaccard overlap (ngoài khớp chuỗi `_fold_ascii` tuyệt đối) giữa ứng viên mới và `existing_active` / `existing_pending`, ưu tiên gán `replaces_memory_id` khi cập nhật phiên bản/quyết định mới.
    - Xử lý trần `MAX_PENDING_MEMORIES = 10` theo Q1 và giữ nguyên `source = "suggested", status = "pending"`. Giữ câu chữ trong `core/memory/` hoàn toàn trung lập nghiệp vụ.
  - `roadmap-rag-assistant/rag_service/api/routes.py#_maybe_schedule_memory_extraction`, `#chat`:
    - Truyền đủ ngữ cảnh cần thiết cho tín hiệu trích xuất mới, giữ nguyên bỏ qua khi `not is_owner()`, `state.had_preview`, `state.changes`, hoặc tool thuộc `_SKIP_MEMORY_TOOLS`. Áp dụng cả ở `POST /chat` nếu Q7 chọn (A). Không sửa `confirm_action` / `cancel_action`.

- [x] **Step 2 — Nâng cấp xếp hạng `Owner Memory`, `lastUsedAt` & tối ưu cache Next.js (`store.py`, `app/api/v1/memories/**`)**
  - `roadmap-rag-assistant/rag_service/core/memory/store.py#select_owner_memories`, `#OwnerMemoryApi`, `#OwnerMemoryStore`:
    - Bổ sung tham số `query: Optional[str] = None` (mặc định `None` giữ tương thích ngược) cho `select_owner_memories` để ưu tiên các mục `learning_note`/`techstack` khớp token truy vấn bên cạnh `(scope, KIND_PRIORITY)` và `last_used_at`.
    - Hỗ trợ trường `lastUsedAt` / `last_used_at` trong `OwnerMemoryItem` và `_item_from_dict` (chỉ tăng độ ưu tiên/cập nhật không chặn luồng chính nếu dùng).
  - `app/api/v1/memories/route.ts#POST` & `app/api/v1/memories/*/route.ts#PATCH`:
    - Trong `POST`, chỉ gọi `notifyOwnerMemoryChanged()` khi `memory.status === 'active'` (vì RAM cache chỉ nạp mục `active`, ghi `pending` không cần xóa cache).
    - Lưu ý `GET /api/v1/memories?status=archived` (`memories/route.ts` L45) và `PATCH archived -> active` (`memories/*/route.ts` L57) **đã hoạt động sẵn**; phạm vi sửa ở `*/route.ts` chỉ tập trung vào cập nhật `lastUsedAt` (khi được dùng trong context) và bảo đảm sửa nội dung/loại trên mục `pending` hoạt động trơn tru dưới `requireWriteAccess(req)`.

- [x] **Step 3 — Hoàn thiện `OwnerMemorySheet`, `RoadmapChatClient` & đồng bộ badge `Chờ duyệt` (`OwnerMemorySheet.tsx`, `useOwnerMemories.ts`, `client.ts`, `types.ts`)**
  - `roadmap-rag-assistant/sdk/typescript/src/client.ts` & `types.ts`:
    - Thêm `roadmapsBaseUrl?: string` (mặc định `'/api/v1/roadmaps'`) vào `RoadmapChatClientOptions` / `RoadmapChatClient` (tương tự `memoriesBaseUrl`) cùng 3 method dùng lại route có sẵn: `listRoadmaps()` (`GET /api/v1/roadmaps`), `getRoadmap(slug)` (`GET /api/v1/roadmaps/${slug}?mode=outline`), và `createLesson(input)` (`POST /api/v1/roadmaps/items`), không sửa `RoadmapChatbotWidget.tsx` hay `RoadmapAssistantChatbot.tsx`.
    - Chỉ bổ sung kiểu `OwnerMemory*` hoặc DTO cho `listRoadmaps`/`createLesson` trong `types.ts` (không đụng `HealthResponse.index` thuộc Batch C).
  - `roadmap-rag-assistant/sdk/typescript/src/react/components/OwnerMemorySheet.tsx`:
    - Cho phép bấm Sửa (`startEdit`/`saveEdit`) ngay trên tab `Chờ duyệt` trước khi bấm `Duyệt`.
    - Thêm tab hoặc chế độ xem `Đã gỡ` (`archived`) dùng `client.listMemories('archived')` (đã có sẵn ở `GET /api/v1/memories?status=archived`) với nút khôi phục (`status: 'active'`) hoặc xóa hẳn.
    - Thêm nút **Đưa vào Lesson** theo Q6 (dùng `client.listRoadmaps` / `getRoadmap` chọn `Topic` và `Section`, gọi `client.createLesson`, rồi tự động `PATCH` mục memory sang `archived` và phát sự kiện `roadmap:updated` để UI làm mới).
    - Hiển thị cảnh báo rõ ràng khi danh sách `pending` chạm trần `10` mục.
  - `roadmap-rag-assistant/sdk/typescript/src/react/useOwnerMemories.ts#usePendingMemoryCount`, `#useOwnerMemories`:
    - Thay thế `setTimeout(..., 2000)` đơn lẻ trong `usePendingMemoryCount` bằng cơ chế làm mới thích ứng (ví dụ kiểm tra ngay + lặp có giới hạn ngắn khi vừa kết thúc stream của `Owner`, hoặc lắng nghe sự kiện cập nhật sau khi `OwnerMemorySheet` duyệt/xóa/tạo), luôn giữ `enabled === false` với `Visitor`.

- [x] **Step 4 — Tổng quát hóa `linking_advisor.py` cho cả News và Khái niệm từ chat (`linking_advisor.py`)**
  - `roadmap-rag-assistant/rag_service/domains/roadmap/linking_advisor.py`:
    - Tách hàm dùng chung `match_concept_to_lessons(*, title: str, summary: str = "", keywords: Sequence[str] = (), limit: int = 5, engine: Any = None) -> dict[str, Any]` trả về `suggested_topic_slug`, `suggested_topic_title`, `suggested_section`, và danh sách `matches` kèm `duplicate_warning` (`_is_duplicate_candidate`), `version_update_hint` (`_has_version_update_signal`), `append_candidate` / `relation_candidates`.
    - Giữ `match_news_to_lessons` gọi lại `match_concept_to_lessons` để tương thích 100% với `POST /internal/match-lessons` và `app/api/news/[id]/match-lessons/route.ts`.

- [x] **Step 5 — Kết nối `Domain Gap` & lệnh đẩy khái niệm từ chat sang `Preview` tạo/bổ sung `Lesson` (`agent.py`, `scope.py`, `grounding.py`, `lesson_content.py`)**
  - `roadmap-rag-assistant/rag_service/domains/roadmap/agent.py#_handle_knowledge_or_plan`, `router/grounding.py#domain_gap_reply`, `router/scope.py`:
    - Khi `Scope.DOMAIN_GAP` xảy ra cho `Owner` (`is_owner()`) và `looks_like_title(focus_topic)` đạt, gọi `linking_advisor.match_concept_to_lessons(title=focus_topic)` để:
      - Nếu có `Lesson` gần trùng (`duplicate_warning` hoặc điểm cao): đề xuất `Preview` bổ sung/làm giàu nội dung bài đó qua `LessonContentCommands`.
      - Nếu chưa có bài trùng và xác định được `suggested_topic_slug` (hoặc `page_context.roadmapSlug` / `active_topic_slug`): chuẩn bị `Pending Action` tạo `Lesson` mới (trạng thái mặc định theo Q5, kèm tùy chọn soạn nội dung khởi tạo hoặc nối `relates`) và phát `action_preview` để `Owner` bấm Xác nhận / gõ `ok` (hoặc sửa tên/đích ngay trên `Preview`).
    - Hỗ trợ lệnh đẩy khái niệm rõ ràng trong chat (ví dụ `"lưu khái niệm này thành bài học"`, `"đưa phần vừa giải thích vào bài …"`) chạy qua `Preview → ok`, không làm nhiễu `IntentRouter` baseline (`evals router-check`).
  - `roadmap-rag-assistant/rag_service/domains/roadmap/lesson_content.py`:
    - Bổ sung helper tạo bản nháp gắn với khái niệm vừa thăng cấp từ chat (`validate_lesson_draft`, `markdown_to_html`), bảo toàn marker `data-provenance-ref=` nếu bổ sung vào bài đã có, và không đưa nội dung `<owner_memory>` vào HTML công khai.

- [x] **Step 6 — Nâng cấp `QuizCommands` & `Pending Action` hỗ trợ bắt lỗ hổng khái niệm không đè `pending_status_change` (`quiz_commands.py`, `session_store.py`, `commands.py`)**
  - `roadmap-rag-assistant/rag_service/domains/roadmap/quiz_commands.py#_finish_active_quiz_turn`, `#_maybe_suggest_quiz_gap_note`, `#_prepare_quiz_status_preview`:
    - Phân loại kết quả `gaps` khi kết thúc Quiz: lỗi nhớ cá nhân ngắn hạn giữ ở `Owner Memory` (`learning_note` `pending`), còn khoảng trống khái niệm/thiếu mục kiến thức trong `Lesson` đề xuất `Preview` bổ sung mục `H2` cho bài đang ôn (`fill_h2_section`/`append`) hoặc tạo bài `target` mới qua `linking_advisor`.
    - Bỏ việc `clear_pending()` làm mất hoặc ghi đè lẫn nhau giữa `pending_status_change` (`known` / `markReviewed`) và đề xuất lấp khoảng trống `Lesson` sau Quiz.
  - `roadmap-rag-assistant/rag_service/state/session_store.py#SessionContext` & `domains/roadmap/commands.py#handle_pending`:
    - Bổ sung khe/cấu trúc RAM-only cho `Pending Action` thăng cấp khái niệm (`pending_concept_promotion` hoặc hỗ trợ tạo `Lesson` kèm `content` + `status` + optional `related_lesson_ids`), giữ `PENDING_TTL_SECONDS = 600.0` và chỉ cấp `write_granted(...)` tại `commands.py` khi `Owner` xác nhận `CONFIRM_WORDS`.
    - Chuẩn hóa tên `tool_start`/`tool_end` phát ra CHỈ khi thực thi sau xác nhận `ok` trong `commands.py`: dùng `promote_concept_to_lesson` khi tạo `Lesson` mới từ khái niệm (`Domain Gap` / Quiz gap / chat promotion), `update_item_content` khi bổ sung/điền `H2` vào `Lesson` có sẵn, `update_item` / `mark_lesson_reviewed` cho `Lesson Status`, và `save_owner_memory` / `archive_owner_memory` cho `Owner Memory`. Các tool preview/đọc/chấm điểm (`draft_item_content`, `start_lesson_quiz`, `grade_lesson_quiz`, `list_*`, `get_lesson_status`) tuyệt đối không phát sự kiện ghi.

- [x] **Step 7 — Mở rộng Adapter/Executor (`content` + `status`), thống nhất RAG Reindex HTTP/SQLite & đồng bộ `ROADMAP_WRITE_TOOL_RE` (`adapters/*`, `executor.py`, `item_tools.py`, `roadmapAssistantService.ts`)**
  - `roadmap-rag-assistant/rag_service/adapters/base.py`, `http_adapter.py`, `sqlite_adapter.py`:
    - Cập nhật `create_item(..., status: Optional[str] = None)` để truyền `status` (cùng `content`) qua `POST /api/v1/roadmaps/items` (endpoint Next.js đã nhận sẵn `status` & `content` trong `CreateLessonSchema`) và lưu đúng cột `status` trong `SqliteAdapter.create_item`. Giữ nguyên `@guard_writes`.
    - (Nếu Q5 chọn tự nối `relates`): bổ sung `create_relation(lesson_id, target_lesson_id)` gọi `POST /api/v1/roadmaps/items/{id}/relations` (hoặc ghi bảng `KnowledgeRelation` ở SQLite).
  - `roadmap-rag-assistant/rag_service/execution/executor.py#ActionExecutor._create_items`, `tools/item_tools.py#create_item`, `#update_item_content`, `#import_items_from_text`, `#rename_section`, `commands.py#_execute_pending_lesson_edit`:
    - Cho phép `ActionExecutor.aexecute` / `tools/item_tools.py#create_item` nhận tùy chọn `content` và `status` khi thực thi thăng cấp khái niệm mà không thay đổi schema trích xuất `StructuredRoadmapAction` của LLM.
    - Thống nhất trigger reindex qua một helper: ở chế độ `http`, dựa vào `notifyRoadmapChanged()` của Next.js (`/internal/reindex` → `rag_engine.request_reindex()`) thay vì gọi thừa `rag_engine.sync_live_database()`; ở chế độ non-HTTP (`sqlite`), luôn kích hoạt `rag_engine.sync_live_database()` cho tất cả đường ghi (`create_*`, `update_*`, `delete_*`, `update_item_content`, `import_items_from_text`, `rename_section`) để tránh trễ 30s (`INDEX_TTL_SECONDS`).
  - `logic/roadmap/roadmapAssistantService.ts#ROADMAP_WRITE_TOOL_RE`:
    - Cập nhật `ROADMAP_WRITE_TOOL_RE` thành `/^(create|update|delete|generate|reorder|rename)_|^(import_items_from_text|mark_lesson_reviewed|promote_concept_to_lesson|save_owner_memory|archive_owner_memory)$/` để khớp 1:1 với các tool event phát ở Step 5–6 mà không khớp nhầm `draft_item_content`, `start_lesson_quiz`, `grade_lesson_quiz`, `list_*`, giúp `RoadmapAssistantChatbot.tsx` bắn `roadmap:updated` chuẩn xác.

- [x] **Step 8 — Kiểm thử tự động (Bảo mật, Chống rò rỉ, HITL, Reindex & Luồng nghiệp vụ)**
  - Python (`roadmap-rag-assistant/tests/`):
    - `test_owner_memory.py` & `test_memory_phase2_and_quiz.py`: test trích xuất ngoài `_SIGNAL_CUES` / từ `assistant_reply`, chống trùng paraphrase, trần `MAX_PENDING_MEMORIES`, `lastUsedAt` + query-aware selection, Quiz gap coexistence với `pending_status_change`, Visitor luôn bị chặn (401/rỗng, không bao giờ trích xuất hoặc thấy memory).
    - `test_concept_promotion.py` (mới) + `test_phase3_provenance_and_linking.py` + `test_lesson_content.py` + `test_scope.py`: test `Scope.DOMAIN_GAP` → `linking_advisor.match_concept_to_lessons` → `Preview` tạo/bổ sung `Lesson` (từ chối nếu chưa `ok`, bắt buộc `write_granted`, chặn `Visitor`), cảnh báo trùng `>= 0.75`, bảo toàn marker `data-provenance-ref=`, không rò rỉ `<owner_memory>` vào HTML `Lesson`, và test reindex đồng bộ ở cả chế độ HTTP lẫn SQLite.
    - Xác nhận `test_write_invariants.py` và `test_generation_pipeline.py#test_core_never_names_a_business_domain` pass nguyên vẹn.
  - Next.js (`tests/`):
    - `tests/route/memories-route.test.ts`: test `POST` `status: "pending"` không gọi `notifyOwnerMemoryChanged()`; `status: "active"` / `PATCH` / `DELETE` vẫn gọi; `Visitor` nhận `401`.
    - `tests/unit/owner-memory-sheet.test.tsx`: test sửa nội dung trên tab `Chờ duyệt` trước khi bấm `Duyệt`, tab `Đã gỡ` (`archived`), luồng "Đưa vào `Lesson`", badge cập nhật đúng mà không rò rỉ sang `Visitor`.
    - `tests/unit/roadmap-cud-ui.test.tsx`: test `isRoadmapWriteTool` khớp đúng các tool ghi memory/draft/review/promotion.

## 4. Verification Gate Results
<!-- Executor điền: PENDING | PASSED | FAILED | SKIPPED -->
- [x] `TypeCheck`: PASSED (`yarn tsc --noEmit -p .` & `npx tsc --noEmit -p roadmap-rag-assistant/sdk/typescript/tsconfig.json`: 0 errors)
- [x] `Lint`: PASSED trên phạm vi file đổi (`npx eslint` 6 file Next.js/test + `npx eslint --no-ignore` 4 file SDK `.ts/.tsx`: 0 errors, 0 warnings; `.venv/bin/ruff check rag_service` & 6 file test Python: `All checks passed!`)
- [x] `Vitest Targeted`: PASSED (`yarn vitest run` 6 file từ spec L89: `6 files passed, 38 passed` in `3.03s`)
- [x] `Test`: PASSED (`yarn test`: `140 test files passed`, `1344 passed | 8 skipped (1352)` in `19.98s`; 8 skipped có sẵn ở `tests/e2e/tier1-r3-action-chips.test.ts`)
- [x] `Python Tests`: PASSED (`1253 passed in 51.59s`; `test_write_invariants.py` & `test_core_never_names_a_business_domain` pass; `.venv/bin/mypy` 13 file nguồn typed mới/sửa: `Success: no issues found`; CI `PY-MYPY` `--no-site-packages`: 0 lỗi)
- [x] `Evals Validate`: PASSED (`OK: 484 samples in 4 datasets, 125 documents in 1 corpora`)
- [x] `Router Check`: PASSED (`heldout.intent_cases.correct=64`, `heldout.routing.correct=261`, `stress.dropped=0`, `stress.misroute=0`, `stress.ok=410`, `stress.undecided=94`, `stress.wrong_write=0`; `evals.router.holdout`: `n=65, write_now_violations=0, missed_writes=0`)
- [x] `Router Confuse`: PASSED (`TOTAL n=504, write_now_violation=0, preview_violation=23, missed_write=3, wrong_branch=91 — ratchet: ok`)
- [x] `Intel Status`: PASSED (`yarn intel status`: `🟢 OK: 213 ref map + 40 ref docs đều khớp code` tại `1dfcd0b`; `yarn agents:sync --check`: up to date)
- [x] `Doctor Delta`: PASSED (`yarn doctor --since HEAD --check`: `0 bug · 0 risk · 0 nit · 0 mới`)
- [x] `Boundary Check`: PASSED trên phạm vi Batch B (`32` file thuộc `allowed_to_modify` trong `476eef3..1dfcd0b` + 3 file vá working tree; `0` file `strictly_forbidden` riêng của `002` bị chạm; `1dfcd0b` gộp cùng `20` file UI header/sidebar của Dev; không dùng `baseline.txt` nên đối chiếu trực tiếp qua `git diff`)

## 5. Execution Audit Log
<!-- Executor điền. Không commit: Dev commit sau khi verify -->
- **Result file**: N/A (thực thi qua swarm B1 `#39`/`#43`, B2 `#41`, B3 `#38`/`#44` & verify bởi `@verifier-sync`)
- **Modified Files** (32 files: B1 `7`, B2 `18`, B3 `7`):
  - `roadmap-rag-assistant/rag_service/core/memory/extractor.py`
  - `roadmap-rag-assistant/rag_service/core/memory/store.py`
  - `roadmap-rag-assistant/rag_service/api/routes.py`
  - `app/api/v1/memories/route.ts`
  - `app/api/v1/memories/[id]/route.ts`
  - `roadmap-rag-assistant/tests/test_owner_memory.py`
  - `tests/route/memories-route.test.ts`
  - `roadmap-rag-assistant/rag_service/adapters/base.py`
  - `roadmap-rag-assistant/rag_service/adapters/http_adapter.py`
  - `roadmap-rag-assistant/rag_service/adapters/sqlite_adapter.py`
  - `roadmap-rag-assistant/rag_service/domains/roadmap/agent.py`
  - `roadmap-rag-assistant/rag_service/domains/roadmap/commands.py`
  - `roadmap-rag-assistant/rag_service/domains/roadmap/lesson_content.py`
  - `roadmap-rag-assistant/rag_service/domains/roadmap/linking_advisor.py`
  - `roadmap-rag-assistant/rag_service/domains/roadmap/quiz_commands.py`
  - `roadmap-rag-assistant/rag_service/domains/roadmap/router/grounding.py`
  - `roadmap-rag-assistant/rag_service/domains/roadmap/router/scope.py`
  - `roadmap-rag-assistant/rag_service/execution/executor.py`
  - `roadmap-rag-assistant/rag_service/state/session_store.py`
  - `roadmap-rag-assistant/rag_service/tools/item_tools.py`
  - `roadmap-rag-assistant/tests/test_concept_promotion.py`
  - `roadmap-rag-assistant/tests/test_lesson_content.py`
  - `roadmap-rag-assistant/tests/test_memory_phase2_and_quiz.py`
  - `roadmap-rag-assistant/tests/test_phase3_provenance_and_linking.py`
  - `roadmap-rag-assistant/tests/test_scope.py`
  - `logic/roadmap/roadmapAssistantService.ts`
  - `roadmap-rag-assistant/sdk/typescript/src/client.ts`
  - `roadmap-rag-assistant/sdk/typescript/src/types.ts`
  - `roadmap-rag-assistant/sdk/typescript/src/react/useOwnerMemories.ts`
  - `roadmap-rag-assistant/sdk/typescript/src/react/components/OwnerMemorySheet.tsx`
  - `tests/unit/owner-memory-sheet.test.tsx`
  - `tests/unit/roadmap-cud-ui.test.tsx`
- **Bài học** (Review điền khi verify PASS, tối đa 3 dòng):
  - `_schedule_sync_chat_memory` cần duyệt chung `_PENDING_FIELDS` từ `session_store.py` thay vì liệt kê tay tập con slot pending, tránh bỏ sót `pending_concept_promotion` trên endpoint đồng bộ `POST /chat`.
  - SDK nằm dưới `roadmap-rag-assistant/**` bị `eslint.config.mjs` ignore mặc định nên phải chạy `npx eslint --no-ignore` trên file SDK sửa; gọi thẳng helper `fetchPending` trong `useEffect` kích hoạt `react-hooks/set-state-in-effect` và cần bọc qua hàm `async` cục bộ trong effect.
