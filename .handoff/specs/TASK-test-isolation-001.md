---
task_id: "TASK-test-isolation-001"
branch: "chore/test-isolation"
version: "2.0.0"
priority: "P2"
status: "COMPLETED"
assigned_executor: "antigravity"
max_attempts: 3
current_attempt: 1

boundaries:
  allowed_to_modify:
    - "roadmap-rag-assistant/tests/**"
    - "roadmap-rag-assistant/evals/**"
    - "scripts/export-test-schema.ts"
    - "package.json"
    - ".github/workflows/ci.yml"
    - ".handoff/specs/TASK-test-isolation-001.md"
  read_only_references:
    - "prisma/schema.prisma"
    - "roadmap-rag-assistant/rag_service/adapters/sqlite_adapter.py"
    - "roadmap-rag-assistant/rag_service/config.py"
    - "docs/adr/0009-topic-holds-lessons-by-section.md"
  strictly_forbidden:
    - "prisma/**"
    - "docs/adr/**"
    - "GLOSSARY.md"
    - "yarn.lock"
    - "roadmap-rag-assistant/rag_service/**"
    - "roadmap-rag-assistant/pyproject.toml"
    - "roadmap-rag-assistant/requirements.txt"

verification_gate:
  setup: "yarn install --frozen-lockfile && cd roadmap-rag-assistant && python3 -m venv .venv && .venv/bin/pip install -q -e '.[dev]'"
  test: "cd roadmap-rag-assistant && .venv/bin/python -m pytest -q"
  router_check: "cd roadmap-rag-assistant && .venv/bin/python -m evals router-check"
  test_js: "yarn test"
  boundary_check: "git status --porcelain"
---

# TASK: Test Python không còn phụ thuộc `prisma/dev.db`

## 1. Context & Architectural Intent
- **Goal**: Mọi test Python chạy giống nhau ở mọi worktree và trên CI, không cần `prisma/dev.db`. Ba test hiện đang "fail do môi trường" phải pass hoặc skip có lý do rõ ràng, không được fail.
- **Why**: Trong vòng review đầu, mỗi worktree mới dùng bản `prisma/dev.db` đã commit (schema cũ trước ADR-0009), còn `main` của Owner lại có `dev.db` sửa tay. Kết quả test khác nhau giữa các máy, và một Executor đã phải thêm nhánh schema cũ vào adapter production để test pass. Chuyện đó không được lặp lại.
- **Đã biết đang phụ thuộc `dev.db`**: `tests/test_evals_answer_target.py::test_citations_map_every_listed_source_to_corpus_section_ids`, `tests/test_write_invariants.py::test_stress_set_offline_never_writes_at_once_and_does_not_regress`, `tests/test_write_invariants.py::test_held_out_messages_never_write_at_once_where_they_must_not`, cùng các test tạo `SqliteAdapter(...)` mặc định (`config.sqlite_db_path = "../prisma/dev.db"`), ví dụ `test_adapters.py`, `test_auth.py`, `test_change_review.py`, `test_duplicates.py`, `eval_retrieval.py`.
- **Phụ thuộc**: làm sau khi TASK-lesson-status-002 merge (cùng đụng `tests/conftest.py`). Branch tách từ `main` sau lần merge đó.

## 2. Invariants & Rules
- **Không sửa code production** (`rag_service/**` bị cấm). Chỉ sửa test, fixture và cách test chọn DB.
- DB của test được tạo mới từ **schema hiện tại** (`prisma/schema.prisma`), mỗi phiên test một file tạm (`tmp_path_factory`), không bao giờ đọc hay ghi `prisma/dev.db`.
- Nguồn DDL: sinh bằng `npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script` vào file `roadmap-rag-assistant/tests/fixtures/schema.sql` (commit file này). Thêm script `scripts/export-test-schema.ts` và dòng `"test:schema-sql"` trong `package.json` để sinh lại file, cùng một test (JS hoặc Python) báo lỗi khi `schema.sql` lệch với `schema.prisma`. Trong `package.json` chỉ được thêm đúng dòng script đó.
- Dữ liệu mẫu cho test là fixture nhỏ, khai báo trong `tests/` (vài topic, vài bài có section và trạng thái), không copy từ DB thật.
- Test nào thật sự cần corpus thật (eval) thì `skip` với lý do rõ ràng khi thiếu nguồn, như `test_evals_answer_target` đang làm ở một chỗ, chứ không fail.
- Không đổi ngưỡng hay baseline của eval để test pass. Nếu `test_stress_set_offline…` fail vì baseline (wrong_branch 107 > 103) chứ không vì DB thì **dừng lại và escalate**, không sửa baseline.
- Không commit `prisma/dev.db`, `.env*`. Không push, không merge vào `main`.

## 3. Step-by-Step Implementation Checklist
- [x] **Step 0 (Setup)**: chạy `verification_gate.setup`. Chạy `pytest -q` hai lần: một lần như bình thường (3 failed, 984 passed do lỗi cột `roadmapId` của dev.db cũ), một lần sau khi tạm đổi tên `prisma/dev.db` (2 failed do thiếu file, 1 skipped). Đã phục hồi dev.db.
- [x] **Step 1 (Schema fixture)**: `roadmap-rag-assistant/tests/fixtures/schema.sql` sinh từ `prisma/schema.prisma`, `scripts/export-test-schema.ts`, script `"test:schema-sql"` trong `package.json`, và test `tests/test_schema_sql.py` kiểm tra schema bị lệch.
- [x] **Step 2 (Fixture DB)**: fixture cấp phiên `session_test_db` trong `tests/conftest.py` tạo DB tạm từ `schema.sql` và nạp dữ liệu mẫu (topic `ai-architecture`, `frontend`; các item có section và trạng thái `known`, `learning`, `target`). Autouse fixture `isolated_test_db` monkeypatch `settings.sqlite_db_path`, `evals.corpus_export.DEV_DB`, `evals.target.DEV_DB` trỏ vào DB tạm.
- [x] **Step 3 (Ba test đã biết)**:
  - `test_citations_map_every_listed_source_to_corpus_section_ids`: Cập nhật nạp từ static corpus `documents.jsonl` (hoặc DB tạm), pass hoàn toàn (không còn crash vì dev.db cũ).
  - `test_held_out_messages_never_write_at_once_where_they_must_not`: Pass hoàn toàn (0 write_now_violations, 0 missed_writes).
  - `test_stress_set_offline_never_writes_at_once_and_does_not_regress`: Pass hoàn toàn (`wrong_branch` 91 <= 103 baseline, 0 write_now_violation, 3 missed_write <= 3 baseline).
- [x] **Step 4 (Kiểm chéo)**: tạm đổi tên `prisma/dev.db` rồi chạy `pytest -q`: kết quả **giống hệt 100%** khi có file (đều 988 passed in ~13s). Đã hoàn trả `prisma/dev.db`.
- [x] **Step 5 (CI)**: Thêm bước kiểm tra `yarn test:schema-sql --check` vào job `checks` trong `.github/workflows/ci.yml`.

## 4. Verification Gate Results
- [x] `Test` có `dev.db`: 988 passed in 13.10s
- [x] `Test` không có `dev.db`: 988 passed in 13.13s (kết quả giống hệt khi có file)
- [x] `Router check`: PASS (`.venv/bin/python -m evals router-check`: heldout.intent_cases 64, heldout.routing 223, stress: 0 wrong_write, 0 dropped, 0 misroute, 410 ok, 94 undecided)
- [x] `Test JS`: PASS (`yarn test`: 83 test files passed, 995 passed, 8 skipped)
- [x] `Boundary Check`: PASS (`git status --porcelain`: mọi file chỉnh sửa/tạo mới đều nằm trong danh sách `allowed_to_modify`)

## 5. Execution Audit Log
- **Git Commit Hash**: `b9c77836428f58373f1be0b29ad772755907dab1`
- **Modified Files**:
  - `.github/workflows/ci.yml`
  - `package.json`
  - `roadmap-rag-assistant/evals/target.py`
  - `roadmap-rag-assistant/tests/conftest.py`
  - `roadmap-rag-assistant/tests/fixtures/schema.sql`
  - `roadmap-rag-assistant/tests/test_evals_answer_target.py`
  - `roadmap-rag-assistant/tests/test_schema_sql.py`
  - `scripts/export-test-schema.ts`
