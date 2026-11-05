---
task_id: "TASK-rag-sync-002"
branch: "feat/rag-index-fts-first"
version: "2.0.0"
priority: "P1"
status: "COMPLETED"
assigned_executor: "antigravity"
max_attempts: 3
current_attempt: 1

boundaries:
  allowed_to_modify:
    - "roadmap-rag-assistant/rag_service/core/retrieval/hybrid.py"
    - "roadmap-rag-assistant/rag_service/domains/roadmap/retrieval/engine.py"
    - "roadmap-rag-assistant/rag_service/api/schemas.py"
    - "roadmap-rag-assistant/tests/test_index_fts_first.py"
    - "roadmap-rag-assistant/tests/test_index_sync_e2e.py"
    - "roadmap-rag-assistant/tests/test_health_index.py"
    - "roadmap-rag-assistant/tests/test_engine_sync_wait.py"
    - "roadmap-rag-assistant/tests/test_index_freshness.py"
    - "tests/manual/rag-index-sync.md"
    - ".handoff/specs/TASK-rag-sync-002.md"
  read_only_references:
    - ".handoff/specs/TASK-rag-sync-001.md"
    - ".handoff/PLAN-second-brain.md"
    - "roadmap-rag-assistant/rag_service/domains/roadmap/retrieval/ingestion.py"
  strictly_forbidden:
    - "prisma/**"
    - "docs/adr/**"
    - "GLOSSARY.md"
    - "package.json"
    - "yarn.lock"
    - "roadmap-rag-assistant/pyproject.toml"
    - "roadmap-rag-assistant/requirements.txt"
    - "roadmap-rag-assistant/Dockerfile"
    - "roadmap-rag-assistant/railway.json"
    - "roadmap-rag-assistant/rag_service/domains/roadmap/agent.py"
    - "roadmap-rag-assistant/rag_service/domains/roadmap/commands.py"
    - "roadmap-rag-assistant/rag_service/adapters/**"
    - "roadmap-rag-assistant/rag_service/state/**"

verification_gate:
  setup: "cd roadmap-rag-assistant && python3 -m venv .venv && .venv/bin/pip install -q -e '.[dev]'"
  test: "cd roadmap-rag-assistant && .venv/bin/python -m pytest -q"
  boundary_check: "git status --porcelain"
---

# TASK: Index FTS ngay, embedding chạy nền sau

## 1. Context & Architectural Intent
- **Goal**: Mỗi lần sync, index FTS và danh sách tài liệu được thay **ngay** (vài mili giây). Embedding cho các tài liệu chưa có trong cache chạy nền, xong thì gắn vector vào. Tìm kiếm luôn có index đầy đủ theo nghĩa FTS, vector có tới đâu dùng tới đó.
- **Why**: `HybridRagEngine.sync_live_database` gọi `index_documents`, và hàm này embed **mọi** tài liệu còn thiếu trong cache (0,67 giây một tài liệu, `EMBEDDING_REQUEST_INTERVAL`) **trước khi** thay index. Trên Railway, cache `data/embedding_cache.json` mất sau mỗi lần deploy (không có trong image, không có volume), nên sau deploy Abot không có index trong khoảng N × 0,67 giây. Khi kho có 109 bài (seed), con số này là khoảng 75 giây, và tăng dần theo kho.
- **Nền**: branch này tách từ `feat/rag-sync-hardening` (TASK-rag-sync-001 đã đạt review, chưa merge). Dùng lại khối `index` trong `/health` mà task đó đã thêm.

## 2. Invariants & Rules
- Thay FTS và `_docs_map` một lần, nguyên khối (như hiện tại). Không bao giờ để tìm kiếm thấy một index nửa cũ nửa mới.
- Vector của tài liệu chưa embed xong thì để trống. `hybrid_search` đã xử lý được tài liệu không có vector (rơi về FTS): giữ nguyên hành vi này và có test khoá lại.
- **Không để kết quả cũ đè lên mới:** nếu một lần sync mới bắt đầu trong khi lần embed nền trước còn chạy, kết quả của lần trước không được ghi vector vào index mới cho tài liệu đã bị xoá hoặc đổi nội dung. Gợi ý: gắn mã thế hệ (generation) cho mỗi lần thay index, và chỉ ghi vector khi mã còn khớp. Khoá vector theo `_embedding_key(searchable_text)`, không theo id.
- Embedding vẫn chạy ngoài event loop (`asyncio.to_thread`) và vẫn giãn cách theo quota. Tại một thời điểm chỉ có một tiến trình embed.
- `is_current()` chỉ nói về FTS và tài liệu. Thêm vào khối `index` của `/health` trường `vectors_pending` (int), là số tài liệu còn chờ embed. `/health` vẫn chỉ trả số liệu.
- Không đổi cách lưu cache, không thêm dependency, không đụng Dockerfile hay Railway.
- Không commit `prisma/dev.db`, `.env*`. Không push, không merge vào `main`.

## 3. Step-by-Step Implementation Checklist
- [x] **Step 0 (Setup)**: chạy `verification_gate.setup`. Chạy `pytest -q` trên code chưa sửa và ghi lại những test đã fail từ trước (đã biết: `test_evals_answer_target::test_citations_map…`, `test_write_invariants::test_stress_set_offline…`, `test_held_out_messages…`. Cả ba phụ thuộc `prisma/dev.db`, sẽ được xử lý ở TASK-test-isolation-001).
- [x] **Step 1 (Tách hai pha trong `hybrid.py`)**: pha 1 xây FTS và `_docs_map`, rồi thay ngay. Vector lấy từ cache cho những tài liệu đã có. Pha 2 embed phần còn thiếu, rồi gắn vào `_vectors` theo luật generation ở mục 2.
- [x] **Step 2 (Engine)**: `sync_live_database` trả về ngay sau pha 1. Pha 2 chạy nền, lỗi ở pha 2 không làm sync bị coi là thất bại (ghi vào `last_error` với tiền tố `embedding:`).
- [x] **Step 3 (Tests)**: `tests/test_index_fts_first.py` dùng embedder giả, có độ trễ, đếm số lần gọi. Phải kiểm được: sau sync, tìm theo FTS thấy ngay tài liệu mới trong khi embed còn chạy; `vectors_pending` giảm dần về 0; sync mới trong lúc embed cũ đang chạy thì không có vector "lạc thế hệ"; tài liệu đã có trong cache không bị embed lại. Không gọi Gemini thật.
- [x] **Step 4 (Manual)**: thêm vào `tests/manual/rag-index-sync.md` một case: khởi động lại RAG service với cache trống, gọi `/health` ngay (thấy `documents` > 0, `vectors_pending` > 0), hỏi Abot một câu có từ khoá trong tên bài (phải trả lời được), rồi chờ đến khi `vectors_pending` = 0.

## 4. Verification Gate Results
- [x] `Test` (pytest): PASS 972 passed, 3 failed in 10.34s. 3 tests fail từ trước do môi trường `prisma/dev.db` (thiếu cột `i.roadmapId`), không có regression. Toàn bộ 23 unit tests về sync/health/freshness/fts-first đều PASS (5 tests mới trong `test_index_fts_first.py`).
- [x] `Boundary Check`: PASS, chỉ sửa và tạo các file nằm trong `allowed_to_modify`.

## 5. Execution Audit Log
- **Git Commit Hash**: `e7dc4b60528838a1d75972054b9cf47b39f783f2`
- **Modified Files**:
  - `roadmap-rag-assistant/rag_service/api/schemas.py`
  - `roadmap-rag-assistant/rag_service/core/retrieval/hybrid.py`
  - `roadmap-rag-assistant/rag_service/domains/roadmap/retrieval/engine.py`
  - `roadmap-rag-assistant/tests/test_health_index.py`
  - `roadmap-rag-assistant/tests/test_index_fts_first.py`
  - `tests/manual/rag-index-sync.md`
  - `.handoff/specs/TASK-rag-sync-002.md`
