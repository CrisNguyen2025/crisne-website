---
task_id: "TASK-rag-sync-001"
branch: "feat/rag-sync-hardening"
version: "2.0.0"
priority: "P1"
status: "IN_PROGRESS"
assigned_executor: "antigravity"
max_attempts: 3
current_attempt: 1

boundaries:
  allowed_to_modify:
    - "roadmap-rag-assistant/rag_service/domains/roadmap/retrieval/**"
    - "roadmap-rag-assistant/rag_service/core/retrieval/**"
    - "roadmap-rag-assistant/rag_service/api/routes.py"
    - "roadmap-rag-assistant/rag_service/api/schemas.py"
    - "roadmap-rag-assistant/tests/test_index_freshness.py"
    - "roadmap-rag-assistant/tests/test_engine_sync_wait.py"
    - "roadmap-rag-assistant/tests/test_index_sync_e2e.py"
    - "roadmap-rag-assistant/tests/test_health_index.py"
    - "lib/roadmap/rag-reindex.ts"
    - "app/api/v1/roadmaps/items/[id]/route.ts"
    - "tests/route/rag-reindex.test.ts"
    - "tests/route/roadmap-item-patch-reindex.test.ts"
    - "tests/manual/rag-index-sync.md"
    - "tests/manual/README.md"
    - ".handoff/specs/TASK-rag-sync-001.md"
  read_only_references:
    - "app/api/v1/roadmaps/full-export/route.ts"
    - "roadmap-rag-assistant/rag_service/adapters/http_adapter.py"
    - "roadmap-rag-assistant/tests/conftest.py"
    - "docs/RAG_PRODUCTION_READINESS.md"
  strictly_forbidden:
    - "prisma/**"
    - "docs/adr/**"
    - "GLOSSARY.md"
    - "package.json"
    - "yarn.lock"
    - "roadmap-rag-assistant/pyproject.toml"
    - "roadmap-rag-assistant/requirements.txt"
    - "roadmap-rag-assistant/rag_service/domains/roadmap/agent.py"
    - "roadmap-rag-assistant/rag_service/domains/roadmap/commands.py"
    - "roadmap-rag-assistant/rag_service/state/**"
    - "app/api/v1/roadmaps/full-export/route.ts"

verification_gate:
  setup: "yarn install --frozen-lockfile && cd roadmap-rag-assistant && python3 -m venv .venv && .venv/bin/pip install -q -e '.[dev]'"
  type_check: "npx tsc --noEmit -p tsconfig.json"
  lint: "yarn lint"
  test: "yarn test"
  test_rag: "cd roadmap-rag-assistant && .venv/bin/python -m pytest -q"
  boundary_check: "git status --porcelain"
---

# TASK: Làm chắc việc sync data roadmap ↔ index RAG

## 1. Context & Architectural Intent
- **Goal**: Index RAG của Abot luôn khớp với roadmap trong DB, có bằng chứng kiểm chứng được, và xem được trạng thái của index trên server thật.
- **Why**: Abot là trợ lý trên kho tri thức cá nhân. Nếu index cũ, Abot chối có những bài vẫn còn, hoặc nhắc tới bài đã xoá. Hiện không có cách nào biết index trên Railway đang mới hay cũ.
- **Hiện trạng (đã kiểm, không cần làm lại)**: mọi route ghi roadmap đều gọi `notifyRoadmapChanged()` (`lib/roadmap/rag-reindex.ts`) → `POST /internal/reindex`. `HybridRagEngine` (`domains/roadmap/retrieval/engine.py`) có `request_reindex`, TTL 30 giây (`INDEX_TTL_SECONDS`), chờ tối đa 3 giây (`SYNC_WAIT_SECONDS`), giữ index cũ khi đọc nguồn lỗi, và chỉ thay index sau khi đã rebuild xong (`core/retrieval/hybrid.py:index_documents`).

## 2. Invariants & Rules
- `/health` vẫn trả các trường đang có (không phá client cũ). Chỉ thêm trường mới. Không lộ secret, URL nội bộ hay nội dung bài, chỉ số liệu.
- Không đưa `status` / `statusUpdatedAt` vào index hay `full-export`.
- Một lần ghi roadmap không bao giờ được fail hay chậm đi vì reindex (giữ nguyên cách `after()` đang làm).
- Bỏ reindex chỉ khi PATCH thực sự **chỉ** đổi `status`. Nếu có bất kỳ trường nào được index (title, description, section, content…) cũng đổi thì vẫn reindex. Test hiện có trong `tests/route/rag-reindex.test.ts` kiểm rằng mọi route ghi đều gọi `notifyRoadmapChanged`: giữ test đó pass, nếu cần thì sửa test cho đúng quy tắc mới chứ không xoá nó.
- Viết theo style của code xung quanh. TypeScript strict, không `any`, không `@ts-ignore`. Không thêm dependency.
- Không commit `prisma/dev.db`, `.env*`. Không push, không merge vào `main`. Không ghi lên Turso, trừ topic test `QA Sandbox` khi chạy kịch bản thủ công (xoá sau khi chạy).

## 3. Step-by-Step Implementation Checklist
- [x] **Step 0 (Setup)**: chạy `verification_gate.setup`. Copy `.env.local` từ `/Users/anh_nt/Desktop/crisne-website/.env.local` và `roadmap-rag-assistant/.env` nếu cần chạy thật (không commit). Chạy toàn bộ gate một lần trên code chưa sửa và ghi lại những gì đã fail từ trước (đã biết: Python router stress baseline wrong_branch 107 > 103; `test_evals_answer_target` phụ thuộc `dev.db`; khoảng 168 lỗi lint có từ trước).
- [x] **Step 1 (Trạng thái index trong `/health`)**: thêm một khối `index` vào `HealthResponse`, gồm `synced` (bool), `current` (bool, = `is_current()`), `documents` (int), `age_seconds` (float hoặc null), `last_error` (str ngắn hoặc null, chỉ là loại lỗi). Engine ghi lại lỗi sync gần nhất. Test: `tests/test_health_index.py`.
- [x] **Step 2 (Test sync end-to-end)**: `tests/test_index_sync_e2e.py` dùng mock adapter. Thêm bài → `request_reindex` → tìm kiếm thấy bài. Sửa tiêu đề → thấy tiêu đề mới. Xoá → không còn thấy. Nguồn lỗi → index cũ vẫn được giữ và `last_error` có giá trị. Không gọi Gemini thật (embedder tắt hoặc mock, chạy được trong CI không cần key).
- [x] **Step 3 (Không reindex khi chỉ đổi status)**: trong `PATCH /api/v1/roadmaps/items/[id]`, chỉ gọi `notifyRoadmapChanged()` khi có trường được index thay đổi. Test: `tests/route/roadmap-item-patch-reindex.test.ts` (PATCH chỉ có status → không gọi; PATCH có title → có gọi; PATCH status + title → có gọi).
- [x] **Step 4 (Manual)**: `tests/manual/rag-index-sync.md` theo quy ước `tests/manual/README.md`. Gồm: gọi `/health` xem khối `index`; thêm bài ở `QA Sandbox` qua UI rồi hỏi Abot ngay; xoá bài rồi hỏi lại; đổi trạng thái bài rồi xem `/health` (`age_seconds` không bị reset vì không có rebuild). Cập nhật bảng trong README. Chạy được thì ghi kết quả, không thì để "Chưa chạy".

## 4. Verification Gate Results
- [x] `TypeCheck`: PASS (`npx tsc --noEmit -p tsconfig.json` exit code 0)
- [x] `Lint`: PASS (168 errors, 173 warnings — 0 lỗi mới, toàn bộ là lỗi có sẵn từ trước)
- [x] `Test` (vitest): PASS (82 test files passed, 988 tests passed, 0 failed)
- [x] `Test RAG` (pytest): PASS (967 passed, 3 failed — 3 failed là lỗi cũ đã biết: `test_evals_answer_target.py` và `test_write_invariants.py` phụ thuộc dev.db / baseline)
- [x] `Boundary Check`: PASS (`git status --porcelain` chỉ chứa các file được phép trong `allowed_to_modify`)

## 5. Execution Audit Log
- **Git Commit Hash**: `[Chưa có - sẽ điền sau khi commit]`
- **Modified Files**:
  - `app/api/v1/roadmaps/items/[id]/route.ts`
  - `roadmap-rag-assistant/rag_service/api/routes.py`
  - `roadmap-rag-assistant/rag_service/api/schemas.py`
  - `roadmap-rag-assistant/rag_service/domains/roadmap/retrieval/engine.py`
  - `roadmap-rag-assistant/tests/test_health_index.py`
  - `roadmap-rag-assistant/tests/test_index_sync_e2e.py`
  - `tests/route/roadmap-item-patch-reindex.test.ts`
  - `tests/manual/rag-index-sync.md`
  - `tests/manual/README.md`
  - `.handoff/specs/TASK-rag-sync-001.md`
