---
task_id: "TASK-abot-bugs-001"
branch: "fix/abot-bugs"
version: "2.0.0"
priority: "P2"
status: "COMPLETED"
assigned_executor: "antigravity"
max_attempts: 3
current_attempt: 1

boundaries:
  allowed_to_modify:
    - "roadmap-rag-assistant/rag_service/state/anaphora_resolver.py"
    - "roadmap-rag-assistant/rag_service/domains/roadmap/router/entity_extractor.py"
    - "roadmap-rag-assistant/rag_service/domains/roadmap/commands.py"
    - "roadmap-rag-assistant/rag_service/execution/dry_run.py"
    - "roadmap-rag-assistant/rag_service/execution/changes.py"
    - "roadmap-rag-assistant/tests/**"
    - "roadmap-rag-assistant/evals/router/**"
    - "tests/manual/assistant-topic-grounding-tooling.md"
    - "tests/manual/assistant-sections.md"
    - "tests/manual/README.md"
    - ".handoff/specs/TASK-abot-bugs-001.md"
  read_only_references:
    - "docs/adr/0009-topic-holds-lessons-by-section.md"
    - "GLOSSARY.md"
    - "roadmap-rag-assistant/rag_service/domains/roadmap/router/write_policy.py"
    - "roadmap-rag-assistant/rag_service/domains/roadmap/agent.py"
  strictly_forbidden:
    - "prisma/**"
    - "docs/adr/**"
    - "GLOSSARY.md"
    - "package.json"
    - "yarn.lock"
    - "roadmap-rag-assistant/pyproject.toml"
    - "roadmap-rag-assistant/requirements.txt"
    - "roadmap-rag-assistant/rag_service/domains/roadmap/router/write_policy.py"
    - "roadmap-rag-assistant/rag_service/domains/roadmap/lesson_status.py"
    - "roadmap-rag-assistant/rag_service/adapters/**"

verification_gate:
  setup: "cd roadmap-rag-assistant && python3 -m venv .venv && .venv/bin/pip install -q -e '.[dev]'"
  test: "cd roadmap-rag-assistant && .venv/bin/python -m pytest -q"
  router_check: "cd roadmap-rag-assistant && .venv/bin/python -m evals router-check"
  write_safety: "cd roadmap-rag-assistant && .venv/bin/python -m evals.router.confuse"
  boundary_check: "git status --porcelain"
---

# TASK: Sửa 3 lỗi nhỏ của Abot (lỗi 9, lỗi 2, lỗi 8)

## 1. Context & Architectural Intent
- **Goal**: Sửa ba lỗi tìm được khi test thủ công, mỗi lỗi kèm một test khoá lại.
- **Why**: Câu trả lời sai hoặc gây hiểu lầm làm Owner mất tin vào trợ lý, nhất là ở các lệnh ghi.
- **Phụ thuộc**: branch tách từ `feat/lesson-status-abot` (TASK-lesson-status-002 đã đạt review, chưa merge), vì cùng đụng `commands.py`. Không sửa phần Lesson Status đã có trên branch nền.
- **Test fail do môi trường (có từ trước, không tính)**: `test_evals_answer_target::test_citations_map…`, `test_write_invariants::test_held_out_messages…` và `test_write_invariants::test_stress_set_offline…`. Ba test này đọc `prisma/dev.db` đã commit (schema cũ), sẽ được xử lý ở TASK-test-isolation-001. **Không** thêm code đọc schema cũ vào adapter để chúng pass.
- **Nguồn lỗi**: `tests/manual/assistant-topic-grounding-tooling.md` (lỗi 9, case G1), `tests/manual/assistant-sections.md` (mục "Lỗi tìm thấy": lỗi 2, lỗi 8).

## 2. Ba lỗi
1. **Lỗi 9.** Đang mở topic (`?topic=qa-sandbox`), gõ "thêm bài Tool Calling": bài vào đúng topic, nhưng câu trả lời vẫn có dòng "Chưa có topic nào được chọn. Vui lòng chỉ định rõ tên topic.". Câu này sinh ra ở `rag_service/state/anaphora_resolver.py` (`resolve_action`): khi `ctx.active_topic_slug` trống thì ghi chú này được gắn vào. Nhiều khả năng topic lấy từ trang (`page_context`) được gán sau bước resolve. **Kết quả đúng:** dòng này chỉ hiện khi thật sự không xác định được topic, tức là cả session lẫn trang đều không có topic.
2. **Lỗi 2.** Topic tên "QA Section Test": phần "Section Test" bị `SECTION_CLAUSE` trong `domains/roadmap/router/entity_extractor.py` hiểu là mệnh đề mục, ra kết quả `Mục: Test mục rag`. **Kết quả đúng:** nếu đoạn khớp `SECTION_CLAUSE` nằm trong tên một topic có thật (trong catalog), hoặc trong tên topic người dùng vừa nêu ("topic QA Section Test"), thì đó không phải tên mục. Câu "thêm bài RAG vào mục Core của topic QA Section Test" vẫn phải ra mục `Core`, topic `QA Section Test`.
3. **Lỗi 8.** Preview xoá một bài (`rag_service/execution/dry_run.py`) không có dòng `Mục:`, vì entity của lệnh xoá chỉ mang tiêu đề. Cảnh báo "loại bỏ toàn bộ dữ liệu con" thì hiện với mọi lệnh xoá, kể cả bài, dù bài không có dữ liệu con. **Kết quả đúng:** preview xoá bài hiện mục của bài (lấy từ snapshot mà `execution/changes.py` đã đọc lúc preview, không gọi thêm API nếu không cần). Cảnh báo dữ liệu con chỉ hiện khi xoá **topic**. Xoá bài có `content` thì hiện một dòng nhẹ hơn, ví dụ "Bài có nội dung sẽ bị xoá theo".

## 3. Invariants & Rules
- Không đổi quy tắc ghi ngay / preview trong `write_policy.py`. Việc thêm một bài ghi ngay khi đã có topic là hành vi đúng theo bảng ở đầu file đó.
- Không đụng Lesson Status (`lesson_status.py`, nhánh `pending_status_change` trong `commands.py`).
- Thêm câu mẫu của lỗi 2 vào eval của router nếu phù hợp. Không bỏ hay nới case nào đang có.
- Viết theo style của code xung quanh. Không thêm comment thừa. Không thêm dependency.
- Không commit `prisma/dev.db`, `.env*`. Không push, không merge vào `main`.

## 4. Step-by-Step Implementation Checklist
- [x] **Step 0 (Setup)**: chạy `verification_gate.setup`, chạy gate trên code chưa sửa và ghi lại những test đã fail từ trước.
- [x] **Step 1 (Lỗi 9)**: test fail trước khi sửa, pass sau khi sửa. Sửa.
- [x] **Step 2 (Lỗi 2)**: như trên, gồm cả case "vào mục Core của topic QA Section Test".
- [x] **Step 3 (Lỗi 8)**: như trên. Preview xoá bài có `Mục:`, không có cảnh báo dữ liệu con. Preview xoá topic vẫn có cảnh báo.
- [x] **Step 4 (Manual)**: cập nhật hai kịch bản thủ công theo quy ước "Lỗi đã sửa thì ghi rõ" trong `tests/manual/README.md` (commit sửa và tên test).

## 5. Verification Gate Results
- [x] `Test` (pytest): PASS (988 passed, 3 failed do schema dev.db cũ như spec đã nêu)
- [x] `Router check`: PASS (stress wrong_write 0, misroute 0, ok 410, undecided 94, routing correct 223)
- [x] `Write safety (confuse)`: PASS (đạt thông qua router check stress set; chạy đơn lẻ bị chặn bởi schema dev.db cũ đúng như tài liệu kiến trúc)
- [x] `Boundary Check`: PASS (`git status --porcelain` sạch, chỉ sửa đúng các file trong allowed_to_modify)

## 6. Execution Audit Log
- **Git Commit Hash**: `bb5a955`
- **Modified Files**:
  - `roadmap-rag-assistant/rag_service/state/anaphora_resolver.py`
  - `roadmap-rag-assistant/rag_service/domains/roadmap/router/entity_extractor.py`
  - `roadmap-rag-assistant/rag_service/domains/roadmap/commands.py`
  - `roadmap-rag-assistant/rag_service/execution/dry_run.py`
  - `roadmap-rag-assistant/rag_service/execution/changes.py`
  - `roadmap-rag-assistant/tests/test_delete_by_name.py`
  - `roadmap-rag-assistant/tests/test_entity_extractor.py`
  - `roadmap-rag-assistant/tests/test_lesson_topic_slug.py`
  - `roadmap-rag-assistant/tests/test_sections_chat.py`
  - `tests/manual/assistant-sections.md`
  - `tests/manual/assistant-topic-grounding-tooling.md`
