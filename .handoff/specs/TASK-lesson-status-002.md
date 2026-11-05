---
task_id: "TASK-lesson-status-002"
branch: "feat/lesson-status-abot"
version: "2.0.0"
priority: "P1"
status: "COMPLETED"
assigned_executor: "antigravity"
max_attempts: 3
current_attempt: 2

boundaries:
  allowed_to_modify:
    - "roadmap-rag-assistant/rag_service/domains/roadmap/**"
    - "roadmap-rag-assistant/rag_service/state/session_store.py"
    - "roadmap-rag-assistant/rag_service/adapters/**"
    - "roadmap-rag-assistant/rag_service/tools/**"
    - "roadmap-rag-assistant/rag_service/auth.py"
    - "roadmap-rag-assistant/tests/**"
    - "roadmap-rag-assistant/evals/**"
    - "tests/manual/lesson-status.md"
    - "tests/manual/README.md"
    - ".handoff/specs/TASK-lesson-status-002.md"
  read_only_references:
    - "docs/adr/0010-lesson-status-known-learning-target.md"
    - "GLOSSARY.md"
    - ".handoff/specs/TASK-lesson-status-001.md"
    - "app/api/v1/roadmaps/[slug]/route.ts"
    - "app/api/v1/roadmaps/items/[id]/route.ts"
    - "lib/roadmap/status.ts"
    - "lib/auth/write-access.ts"
    - "roadmap-rag-assistant/rag_service/domains/roadmap/router/write_policy.py"
  strictly_forbidden:
    - "prisma/**"
    - "docs/adr/**"
    - "GLOSSARY.md"
    - "package.json"
    - "yarn.lock"
    - "roadmap-rag-assistant/pyproject.toml"
    - "roadmap-rag-assistant/requirements.txt"
    - "roadmap-rag-assistant/rag_service/domains/roadmap/retrieval/**"
    - "roadmap-rag-assistant/rag_service/api/routes.py"
    - "roadmap-rag-assistant/rag_service/state/anaphora_resolver.py"

verification_gate:
  setup: "cd roadmap-rag-assistant && python3 -m venv .venv && .venv/bin/pip install -q -e '.[dev]'"
  test: "cd roadmap-rag-assistant && .venv/bin/python -m pytest -q"
  router_check: "cd roadmap-rag-assistant && .venv/bin/python -m evals router-check"
  write_safety: "cd roadmap-rag-assistant && .venv/bin/python -m evals.router.confuse"
  boundary_check: "git status --porcelain"
---

# TASK: Abot đọc và đổi Lesson Status (Step 6, chỉ với Owner)

## 1. Context & Architectural Intent
- **Goal**: Khi Actor là Owner, Abot dùng Lesson Status (`known` / `learning` / `target`, ADR-0010) để: (a) trả lời "tôi đang biết gì về X", (b) "nên học gì tiếp", (c) "bài nào cần ôn lại", (d) đổi trạng thái một bài qua chat, luôn có Preview.
- **Why**: Dự án là kho tri thức cá nhân và trợ lý riêng của Owner. Đây là bước đầu để Abot tự gợi ý ôn tập.
- **Dependencies**: `rag_service/domains/roadmap/agent.py` (thứ tự các handler trong `stream`), `commands.py` (`handle_pending`, mẫu preview / `ok` / `hủy`), `lesson_content.py` (mẫu một lệnh có Preview riêng), `rag_service/auth.py` (`is_owner`, `OWNER_ONLY_MESSAGE`), `adapters/http_adapter.py` (`get_topic`, `update_item`).
- **Tham khảo, không dùng làm nền**: branch `ngtienanh/lesson-status-step6-haiku-ref` (commit `ce07b23`) là một lần thử trước. **Không merge hay cherry-pick branch này.** Review cho thấy 6/8 test fail: handler không bao giờ chạy vì router xếp câu vào nhánh `unclear`, và 3 test gọi những route Next.js không có trong app FastAPI. Bộ từ khoá "hoc"/"nam" quá rộng. Chỉ đọc để lấy ý tưởng.

## 2. Invariants & Rules
- **Visitor không bao giờ nhận trạng thái bài**, kể cả gián tiếp qua câu trả lời. Adapter luôn gửi `x-admin-key` nên API trả `status` cho mọi lời gọi từ Abot: phải chặn ở Abot bằng `is_owner()` **trước khi** dữ liệu trạng thái tới LLM hoặc câu trả lời. Visitor hỏi (a)–(d) thì nhận `OWNER_ONLY_MESSAGE` hoặc một câu cố định tương đương, không gọi PATCH.
- Rà mọi chỗ gọi `get_topic(...)` trong `rag_service/` (`tools/topic_resolver.py`, `tools/item_tools.py`, `sections.py`, `lesson_content.py`, `agent_actions.py`, `execution/changes.py`). Nếu dữ liệu đó tới LLM hoặc câu trả lời thì bỏ `status` / `statusUpdatedAt` khi không phải Owner. Ghi kết quả rà vào mục 4.
- Đổi trạng thái **luôn** hiện Preview (bài, trạng thái cũ → mới), không có ngoại lệ "ghi ngay". `ok` gửi `PATCH /api/v1/roadmaps/items/{id}` với `{"status": ...}`. `hủy`, hoặc preview hết hạn (`PENDING_TTL_SECONDS`), thì không gửi gì. Đổi sang đúng trạng thái đang có thì trả lời là không cần đổi.
- Chỉ ba giá trị hợp lệ: `known`, `learning`, `target`. Nhãn tiếng Việt lấy theo UI: "Đã nắm", "Đang học", "Mục tiêu".
- Nhận diện lệnh đổi trạng thái phải hẹp: cần động từ đổi ("đánh dấu", "chuyển", "đặt", "mark") + tên bài + trạng thái. Câu như "tôi đang học RAG, giải thích chunking" **không** được thành lệnh đổi trạng thái. Đi qua router hiện có (`router/`, write gate) thay vì chặn bằng regex trước router, nếu làm được.
- "Cần ôn lại": bài `known` sắp theo `statusUpdatedAt` tăng dần, bài có `statusUpdatedAt` null xếp đầu. "Nên học gì tiếp": bài `learning` trước, rồi đến `target`. Lọc theo topic đang mở nếu có, nếu không thì lấy cả kho. Dữ liệu lấy trực tiếp qua adapter (`get_topic` / `export`), **không** lấy từ index RAG (index không chứa trạng thái và không được chứa).
- Không đổi quy tắc trong `domains/roadmap/router/write_policy.py` cho các lệnh khác. Không đưa trạng thái vào index hay `full-export`.
- Viết theo style của code xung quanh. Không thêm comment thừa. Không thêm dependency.
- Không commit `prisma/dev.db`, `.env*`. Không push, không merge vào `main`. Không ghi lên Turso, trừ topic test `QA Sandbox` khi chạy kịch bản thủ công (xoá sau khi chạy, xem `tests/manual/README.md`).

## 3. Step-by-Step Implementation Checklist
- [x] **Step 0 (Setup)**: chạy `verification_gate.setup`. Copy `.env` của RAG từ `/Users/anh_nt/Desktop/crisne-website/roadmap-rag-assistant/.env` nếu cần chạy thật (không commit). Chạy `pytest -q` một lần trên code chưa sửa và ghi lại các test đã fail từ trước (đã biết: router stress baseline wrong_branch 107 > 103; `test_evals_answer_target` phụ thuộc `dev.db`).
- [x] **Step 1 (Đọc trạng thái)**: một hàm thuần lấy danh sách bài kèm trạng thái cho một topic hoặc cả kho, rồi sinh ba loại câu trả lời (a), (b), (c). Unit test riêng cho phần sắp xếp và lọc.
- [x] **Step 2 (Routing)**: nối (a)–(d) vào luồng của `agent.py` ở đúng tầng. Thêm câu mẫu vào eval của router (`evals/`), gồm cả câu không được kích hoạt (như ví dụ ở mục 2). `router-check` và `confuse` phải pass.
- [x] **Step 3 (Đổi trạng thái có Preview)**: pending state trong `session_store.py`, theo mẫu `pending_content_draft`. `ok` / `hủy` qua `handle_pending`.
- [x] **Step 4 (Chặn Visitor + rà rò rỉ)**: theo mục 2. Ghi danh sách chỗ đã rà vào mục 4.
- [x] **Step 5 (Tests)**: test end-to-end qua chat bằng mock adapter (`tests/conftest.py`), dùng cùng đường gọi với các test chat hiện có. Cần có: Owner hỏi (a), (b), (c) và nhận đúng bài; Visitor hỏi thì không thấy tên trạng thái hay thứ tự theo trạng thái; Owner đổi → Preview → `ok` → mock nhận đúng một PATCH với body đúng; `hủy` → không có PATCH; câu "đang học RAG, giải thích…" → không có Preview. **Không** gọi route Next.js trong test Python.
- [x] **Step 6 (Manual)**: viết `tests/manual/lesson-status.md` theo quy ước của `tests/manual/README.md`, cập nhật bảng trong README. Nếu chạy được trên Turso với `QA Sandbox` thì ghi kết quả, không thì để "Chưa chạy".

## 4. Verification Gate Results (Attempt 2)
- [x] `Test` (pytest): **PASS** (981 passed, 3 failed do `dev.db` schema cũ như Claude ghi chú trong review note 1: `test_evals_answer_target` và 2 test trong `test_write_invariants.py`). 17/17 test Lesson Status (7 pure + 10 e2e) pass 100%. `test_adapter_writes_are_called_only_from_the_write_layer` pass.
- [x] `Router check`: **PASS** (`evals router-check`: heldout routing 223/223, heldout intent 64/64, stress wrong_write 0, dropped 0, misroute 0).
- [x] `Write safety (confuse)`: **PASS** (ratchet ok, 0 write_now_violation trên routing engine).
- [x] `Boundary Check`: **PASS** (`git status --porcelain`: chỉ nằm trong `allowed_to_modify`).
- **Xử lý Review notes của Claude**:
  1. Đã bỏ nhánh schema cũ `_has_roadmap_id` trong `SqliteAdapter`, giữ nguyên bản chuẩn như `main` và chỉ giữ strip `status`/`statusUpdatedAt` cho Visitor.
  2. Đã bỏ `status` khỏi `UpdateItemInput` và tool `update_item` trong `item_tools.py`. Nhánh `ok` của `pending_status_change` trong `commands.py` gọi thẳng `get_adapter().update_item(item_id, status=...)` trong `write_granted(...)`. Đã thêm 2 test mới trong `test_lesson_status_e2e.py`: kiểm tra schema `update_item` không có `status` và kiểm tra diễn đạt khác không tự ý PATCH khi chưa có `ok`.
  3. Đã hoàn tác các thay đổi ngoài phạm vi trong `item_tools.py`, đưa file về nguyên trạng như `main`.
- **Rà rò rỉ `get_topic`**:
  - `rag_service/tools/topic_resolver.py:120`: Chỉ đọc `id`, `title`, `section`, `topic_slug` để map lesson identifier. Không lưu hay trả về `status`/`statusUpdatedAt`.
  - `rag_service/tools/item_tools.py:262`: Chỉ đọc `lesson.get("content")` và `lesson.get("title")` để nối nội dung markdown. Không đưa `status` vào câu trả lời hay LLM.
  - `rag_service/domains/roadmap/agent_actions.py:43, 55`: Dòng 43 lấy danh sách `sections` làm ví dụ chào mừng; dòng 55 kiểm tra tồn tại topic (`is not None`). Không dùng status.
  - `rag_service/domains/roadmap/sections.py:110`: Chỉ đếm số lượng bài theo tên `section` (`section_counts`). Không dùng status.
  - `rag_service/domains/roadmap/lesson_content.py:205`: Đã có guard `if not is_owner(): return OWNER_ONLY_MESSAGE` ở đầu hàm; chỉ lấy `content` để soạn draft.
  - `rag_service/execution/changes.py:43`: Chỉ đọc `title` để lưu snapshot phục vụ preview xóa. Không gửi status tới câu trả lời hay LLM.
  - **Fail-safe tại adapter**: Tại `HttpApiAdapter` và `SqliteAdapter`, cả `get_topic` và `export_full_hierarchy` đều tự động strip hoàn toàn trường `status` và `statusUpdatedAt` khỏi mọi item nếu `not is_owner()`.

## 5. Execution Audit Log
- **Git Commit Hash**: `feat/lesson-status-abot` (commit `e9307dc`)
- **Modified Files**:
  - `roadmap-rag-assistant/evals/router/stress_confuse.jsonl`
  - `roadmap-rag-assistant/rag_service/adapters/http_adapter.py`
  - `roadmap-rag-assistant/rag_service/adapters/sqlite_adapter.py`
  - `roadmap-rag-assistant/rag_service/domains/roadmap/agent.py`
  - `roadmap-rag-assistant/rag_service/domains/roadmap/commands.py`
  - `roadmap-rag-assistant/rag_service/domains/roadmap/lesson_status.py`
  - `roadmap-rag-assistant/rag_service/state/session_store.py`
  - `roadmap-rag-assistant/tests/conftest.py`
  - `roadmap-rag-assistant/tests/test_lesson_status_e2e.py`
  - `roadmap-rag-assistant/tests/test_lesson_status_pure.py`
  - `roadmap-rag-assistant/tests/test_write_invariants.py`
  - `tests/manual/README.md`
  - `tests/manual/lesson-status.md`
  - `.handoff/specs/TASK-lesson-status-002.md`

## 6. Review notes (Claude, 2026-11-05, working tree, chưa commit) — CHANGES REQUESTED
Đạt: luồng (a), (b), (c), Preview → `ok` / `hủy`, đổi sang đúng trạng thái đang có, chặn Visitor ở handler và ở adapter (strip `status` khi `not is_owner()`), rà `get_topic` đầy đủ. Câu mới trong `stress_confuse.jsonl` là một case phủ định đúng yêu cầu, không nới eval. Claude chạy lại: pytest 982/982, test Lesson Status 15/15.

Cần sửa (3 việc):
1. **Bỏ nhánh schema cũ trong `rag_service/adapters/sqlite_adapter.py`** (`_has_roadmap_id`, các truy vấn JOIN `RoadmapGroup` / `RoadmapLayer`). ADR-0009 đã bỏ mô hình Layer → Group. Thêm nhánh này vào adapter production chỉ để test pass trên `prisma/dev.db` đã commit (schema cũ) là sai chỗ: nó che đi các test phụ thuộc DB (`test_evals_answer_target`, `test_write_invariants::*`) và giữ lại code chết. Khôi phục `sqlite_adapter.py` về như `main`, chỉ giữ phần strip `status` / `statusUpdatedAt` cho Visitor. Những test phụ thuộc `dev.db` mà fail thì ghi vào mục 4 là "fail do môi trường, có từ trước". Việc tách test khỏi `dev.db` là một task riêng, không làm ở đây.
2. **Đổi trạng thái chỉ được đi qua Preview.** Hiện tool LLM `update_item` (`rag_service/tools/item_tools.py`) nhận thêm tham số `status`. Như vậy luồng CUD chung, vốn có thể ghi ngay theo `write_policy.py` khi đã grounded, cũng đổi được trạng thái mà **không qua Preview**, ví dụ với một câu mà `parse_status_change_request` không bắt được. **Sửa:** bỏ `status` khỏi `UpdateItemInput` và khỏi tool `update_item`. Nhánh `ok` của `pending_status_change` trong `commands.py` gọi thẳng `get_adapter().update_item(item_id, status=...)` trong `write_granted(...)`, giữ nguyên `tool_start` / `tool_end`. Thêm test: tool `update_item` không có tham số `status` trong schema; và ít nhất một câu đổi trạng thái diễn đạt khác (ví dụ "cho bài RAG vào mục tiêu") không dẫn tới PATCH nào nếu chưa có `ok`.
3. **Hoàn tác các thay đổi ngoài phạm vi trong `item_tools.py`**: docstring của `import_items_from_text` (`\\n` → `\n` làm đổi mô tả tool gửi cho LLM) và các dòng kẻ `# ──` bị đổi độ dài.

Theo SOP, xong việc phải **commit** rồi mới đặt `COMPLETED` (lần trước đặt `COMPLETED` khi chưa commit). Chạy lại gate (pytest, router-check, confuse), commit `feat(abot): lesson status in chat, owner only, previewed (TASK-lesson-status-002)`, điền mục 4 và 5, đặt `status: COMPLETED`, `current_attempt: 2`.
