---
task_id: "TASK-rag-sync-002"
branch: "feat/rag-index-fts-first"
version: "2.0.0"
priority: "P1"
status: "COMPLETED"
assigned_executor: "antigravity"
max_attempts: 3
current_attempt: 2

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
    - "roadmap-rag-assistant/evals/target.py"
    - "roadmap-rag-assistant/tests/eval_retrieval.py"
    - "roadmap-rag-assistant/tests/test_vector_store.py"
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
- [x] `Test` (pytest): PASS 973 passed, 3 failed in 10.09s. 3 tests fail từ trước do môi trường `prisma/dev.db` (thiếu cột `i.roadmapId`), không có regression. Toàn bộ 24 unit tests về sync/health/freshness/fts-first/standalone-store đều PASS (5 tests trong `test_index_fts_first.py`, 8 tests trong `test_vector_store.py`).
- [x] `Boundary Check`: PASS, chỉ sửa và tạo các file nằm trong `allowed_to_modify`.

## 5. Execution Audit Log
- **Git Commit Hash**: `b6947bfa01d8abb3c29334e6b43004f37784039d` (review fixes) / `e7dc4b60528838a1d75972054b9cf47b39f783f2` (initial implementation)
- **Modified Files**:
  - `roadmap-rag-assistant/rag_service/api/schemas.py`
  - `roadmap-rag-assistant/rag_service/core/retrieval/hybrid.py`
  - `roadmap-rag-assistant/rag_service/domains/roadmap/retrieval/engine.py`
  - `roadmap-rag-assistant/tests/test_health_index.py`
  - `roadmap-rag-assistant/tests/test_index_fts_first.py`
  - `tests/manual/rag-index-sync.md`
  - `roadmap-rag-assistant/evals/target.py`
  - `roadmap-rag-assistant/tests/eval_retrieval.py`
  - `roadmap-rag-assistant/tests/test_vector_store.py`
  - `.handoff/specs/TASK-rag-sync-002.md`

## 6. Review notes (Claude, 2026-11-05, commit `e7dc4b6`) — CHANGES REQUESTED
Đạt: pha 1 thay FTS, `_docs_map` và vector có sẵn trong cache cùng lúc. Vector chỉ được ghi khi **cả** generation **lẫn** `_embedding_key` của tài liệu hiện tại khớp, nên an toàn cả khi chạy song song giữa các thread. Một tiến trình embed tại một thời điểm, có vòng lặp khi generation đổi. `vectors_pending` có trong `/health`. Boundary đúng. pytest 972 pass, 3 fail là ba test đã biết phụ thuộc `dev.db`.

Cần sửa (2 việc):
1. **Những nơi khác gọi `index_documents` giờ không còn vector.** Trước đây `index_documents` embed luôn. Hai chỗ dưới đây dùng store độc lập (không qua engine), nên nay chỉ có FTS. Eval vì thế đo sai mà **không báo lỗi gì**, nhất là trên CI, nơi cache trống:
   - `evals/target.py:131` (`_get_store`, chế độ `vector` / `hybrid`, chạy bởi `yarn eval:rag` trên CI)
   - `tests/eval_retrieval.py:69`
   **Sửa:** sau `index_documents(...)`, ở hai chỗ này gọi `store.embed_missing_documents()` khi chế độ cần vector. Kiểm cả `tests/test_vector_store.py` (đang gọi `index_documents`): nếu test nào ở đó cần vector thì cũng gọi `embed_missing_documents()`. Thêm một test: store độc lập có embedder giả, sau `index_documents` rồi `embed_missing_documents`, thì mọi tài liệu đều có vector.
2. **Bỏ alias `embed_pending = embed_missing_documents`** trong `hybrid.py`: không ai dùng, chỉ tạo hai tên cho cùng một việc.

Chạy lại gate, commit `fix: embed vectors for standalone stores after FTS-first indexing (TASK-rag-sync-002)`, điền mục 4 và 5, đặt `status: COMPLETED`, `current_attempt: 2`.
