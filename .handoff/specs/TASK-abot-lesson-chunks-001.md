---
task_id: "TASK-abot-lesson-chunks-001"
branch: "feat/abot-lesson-chunks"
version: "3.0.0"
type: "implement"
priority: "P1"
status: "COMPLETED"
assigned_executor: "claude-code" # Owner giao Claude làm thẳng (2026-11-24)
max_attempts: 3
current_attempt: 1

boundaries:
  allowed_to_modify:
    - "lib/roadmap/content-utils.ts"
    - "app/api/v1/roadmaps/full-export/route.ts"
    - "app/api/v1/roadmaps/route.ts"
    - "app/api/v1/roadmaps/index-version/route.ts"
    - "lib/roadmap/index-version.ts"
    - "tests/unit/lesson-chunks.test.ts"
    - "tests/unit/roadmap-export-access.test.ts"
    - "roadmap-rag-assistant/rag_service/domains/roadmap/retrieval/ingestion.py"
    - "roadmap-rag-assistant/rag_service/domains/roadmap/retrieval/engine.py"
    - "roadmap-rag-assistant/rag_service/domains/roadmap/retrieval/scope_centroid.py"
    - "roadmap-rag-assistant/rag_service/domains/roadmap/retrieval/relevance.py"
    - "roadmap-rag-assistant/rag_service/domains/roadmap/profile.py"
    - "roadmap-rag-assistant/rag_service/adapters/http_adapter.py"
    - "roadmap-rag-assistant/rag_service/adapters/sqlite_adapter.py"
    - "roadmap-rag-assistant/rag_service/core/retrieval/hybrid.py"
    - "roadmap-rag-assistant/tests/test_lesson_chunks.py"
    - "roadmap-rag-assistant/tests/test_index_version_gate.py"
    - "roadmap-rag-assistant/tests/test_embedding_cache_path.py"
    - "roadmap-rag-assistant/tests/test_index_freshness.py"
    - "roadmap-rag-assistant/tests/test_index_sync_e2e.py"
    - "roadmap-rag-assistant/tests/test_index_fts_first.py"
    - "roadmap-rag-assistant/tests/test_health_index.py"
    - "roadmap-rag-assistant/tests/conftest.py"
    - "docs/DEPLOY_ENV.md"
    - "tests/manual/rag-index-sync.md"
    - ".agents/skills/cris-code-intel/data/cris-workspace-map.json"
  continues_dirty: []
  read_only_references:
    - "docs/adr/0004-embeddings-always-gemini.md"
    - "docs/adr/0006-in-memory-vector-search.md"
    - "docs/adr/0014-topic-scoped-urls-and-heading-anchors.md"
    - "docs/adr/0017-owner-only-statement-provenance.md"
    - "docs/adr/0018-owner-only-site-except-public-news.md"
    - "lib/roadmap/queries.ts"
    - "lib/roadmap/rag-reindex.ts"
    - "lib/auth/write-access.ts"
    - "lib/provenance/markers.ts"
    - "roadmap-rag-assistant/rag_service/domains/roadmap/links.py"
    - "roadmap-rag-assistant/rag_service/domains/roadmap/router/**"
    - "roadmap-rag-assistant/evals/**"
  strictly_forbidden:
    - "package.json"
    - "yarn.lock"
    - "tsconfig.json"
    - "prisma/schema.prisma"
    - "roadmap-rag-assistant/requirements.txt"
    - "roadmap-rag-assistant/evals/router/confuse_baseline.json"
    - "docs/adr/**"
    - "GLOSSARY.md"
    - "components/news/**"
    - "app/(news)/**"

deploy_steps:
  - "Kiểm tra ADMIN_API_KEY của service Abot khớp với Next.js: full-export, GET /api/v1/roadmaps và index-version giờ trả 401 nếu thiếu hoặc lệch key, khi đó Abot không index được gì."
  - "Host chạy Abot: gắn ổ đĩa bền (Railway Volume hoặc Render Persistent Disk), mount ví dụ /data, rồi đặt EMBEDDING_CACHE_PATH=/data/embedding_cache.json. Không có ổ bền thì bỏ biến này (hành vi như cũ) và báo Claude: cần task riêng lưu cache ở Turso."
  - "Deploy Next.js trước Python: Python mới gọi GET /api/v1/roadmaps/index-version; Next cũ chưa có route này thì Python tự quay về full sync (Step 7)."
  - "Sau deploy: mở GET /health của Abot, kiểm documents/chunks/vectors_pending/last_sync_ms; chờ vectors_pending về 0 rồi chạy case mới trong tests/manual/rag-index-sync.md."

fast_gate: ["type_check", "unit_new", "py_new", "boundary_check"]
verification_gate:
  type_check: "yarn tsc --noEmit -p ."
  lint: "yarn lint"
  unit_new: "yarn vitest run tests/unit/lesson-chunks.test.ts tests/unit/roadmap-export-access.test.ts"
  test: "yarn test"
  py_new: "cd roadmap-rag-assistant && .venv/bin/python -m pytest -q tests/test_lesson_chunks.py tests/test_index_version_gate.py tests/test_embedding_cache_path.py tests/test_index_freshness.py tests/test_index_sync_e2e.py tests/test_index_fts_first.py tests/test_health_index.py"
  py_all: "cd roadmap-rag-assistant && .venv/bin/python -m pytest -q"
  evals_validate: "cd roadmap-rag-assistant && .venv/bin/python -m evals validate"
  schema_sql: "yarn test:schema-sql --check"
  intel_status: "yarn intel status"
  boundary_check: "bash .agents/skills/agent-handoff/scripts/check-boundary.sh TASK-abot-lesson-chunks-001"
---

# TASK: Abot đọc được toàn bộ Lesson (chia đoạn theo heading) và đồng bộ index nhẹ hơn

> **Trạng thái hiện tại** (cập nhật mỗi khi dừng): 2026-11-24 Owner nói "Claude xử lí luôn": chấp nhận 2 quyết định mặc định ở mục 2, Claude làm thẳng trên nhánh `feat/abot-lesson-chunks` (không qua Antigravity, không chạy `baseline.sh`). Mọi gate pass (mục 4), E2E case 6–8 pass trên Turso. Đã commit trên nhánh, chưa merge; còn `deploy_steps` và case 9 trên production.

## 1. Context & Architectural Intent

- **Goal**:
  - (A) Abot tìm và trả lời được từ **mọi đoạn** của một Lesson, không chỉ phần đầu bài. Câu trả lời trích được link tới đúng đoạn `/[topicSlug]/[lessonSlug]#[headingSlug]`.
  - (B) Đồng bộ Roadmap → Abot rẻ hơn và đo được. Vòng TTL 30 giây chỉ kéo lại toàn bộ khi dữ liệu thật sự đổi. Cache embedding giữ được qua các lần deploy. `full-export` không còn mở cho request không có quyền.
- **Why** (đo trên `main` @ `fd46546`):
  - LLM chỉ nhận 300 ký tự đầu của nội dung mỗi Lesson (`retrieval/engine.py` `format_knowledge_context`, `profile.py` `_roadmap_document`). Embedding chỉ lấy 1.000 ký tự đầu của `searchable_text` (`core/retrieval/hybrid.py` `embed_missing_documents`). News nối ý vào **cuối** bài (`app/api/news/[id]/integrate/route.ts`), lesson_content cũng nối vào cuối bài, nên tri thức mới thêm không tới được câu trả lời. FTS vẫn khớp được toàn văn, nhưng đoạn khớp không nằm trong context.
  - `ensure_fresh` kéo lại toàn bộ `full-export` (mọi topic, mọi nội dung HTML) mỗi khi index cũ quá 30 giây và có câu hỏi, kể cả khi không có gì đổi. Mỗi lần ghi đã có `/internal/reindex` đẩy sang, nên TTL chỉ là lưới an toàn.
  - Cache embedding nằm ở đường dẫn cố định `roadmap-rag-assistant/data/embedding_cache.json`, mất sau mỗi lần deploy (ADR-0006, mục Consequences). Chia đoạn làm số embedding tăng lên vài lần, nên phải làm cache bền cùng lúc.
  - `GET /api/v1/roadmaps/full-export` và `GET /api/v1/roadmaps` chưa tự kiểm quyền, trong khi middleware cho qua mọi request chỉ cần có header key (ADR-0018 mục Consequences, BACKLOG).
- **Dependencies**: `FLOW_ABOT_CHAT_QUERY`, `FLOW_NEWS_ADD_TO_LESSON` (chỉ là nguồn nội dung, không sửa), ADR-0004, ADR-0006, ADR-0014, ADR-0017, ADR-0018. `lib/roadmap/content-utils.ts#withHeadingIds`, `lib/roadmap/queries.ts` (pipeline render: `contentToHtml` → `withHeadingIds`), `lib/roadmap/rag-reindex.ts#notifyRoadmapChanged`, `rag_service/domains/roadmap/retrieval/engine.py#HybridRagEngine`, `core/retrieval/hybrid.py#HybridVectorStore`.
- **Impact (GitNexus, index chậm 60 commit so với HEAD, coi là mức sàn)**: `hybrid_search` **CRITICAL** (evals `retrieval_probe`, `scope_tune` và chat gọi thẳng) → task này **không sửa thân `hybrid_search`**. `format_knowledge_context`, `search_live_knowledge`, `ensure_fresh` đều LOW, chỉ ảnh hưởng `chat` và `chat_stream`.

## 2. Invariants & Rules

- **Thiết kế cộng thêm, không đổi hình dạng cũ**:
  - Thêm `doc_type = "chunk"`. Document `topic` và `item` giữ nguyên id, trường và `searchable_text`.
  - Mọi chỗ đọc `_docs_map` theo `doc_type` để làm việc khác ngoài tìm đoạn phải **bỏ qua `chunk`**: `known_item_ids`, `known_item_slugs`, `title_vocabulary`, `corpus_vocabulary`, `Catalog.from_documents`, `router/grounding.py`, `DomainCentroids.from_store`. Lý do: ngưỡng scope đã tinh chỉnh trên vector của topic và item (ADR-0004). Thêm vector chunk vào centroid làm lệch router. Không sửa file trong `router/**`: các chỗ đó đã lọc theo `"topic"`/`"item"`. Phải kiểm lại bằng test, không chỉ đọc code.
  - `search_live_knowledge` vẫn trả list `(KnowledgeDocument, score)` mà document là **topic hoặc item** như cũ. Chunk được gộp về Lesson cha, gắn vào trường mới `passages` của bản sao doc item. Không chỗ gọi nào nhận được doc `chunk`.
- **Một nguồn sự thật cho anchor**: anchor của đoạn do Next.js tính bằng đúng pipeline trang Lesson đang dùng (`contentToHtml` → `withHeadingIds`, `lib/roadmap/queries.ts`). Python **không** tự viết lại `headingSlug`.
- **Provenance không vào index** (ADR-0017): text của đoạn bỏ marker `<span data-provenance-ref>` như `strip_html` đang làm. Không thêm dữ liệu `KnowledgeProvenance` vào export.
- **Lesson Status không vào export** (ADR-0010): `full-export` vẫn liệt kê trường theo `select`, không thêm `status`.
- **Quyền**: `full-export`, `GET /api/v1/roadmaps`, `index-version` dùng `requireWriteAccess` (Owner đăng nhập hoặc `x-admin-key` hợp lệ; Python đã gửi `x-admin-key`, `adapters/http_adapter.py`).
- **Embedding**: vẫn Gemini `models/gemini-embedding-001` (ADR-0004), giữ nhịp `EMBEDDING_REQUEST_INTERVAL`. Khoá cache vẫn là hash của text, nên đoạn không đổi thì không embed lại.
- Lỗi hoặc test fail "có từ trước": chỉ ghi khi kèm lệnh tái hiện, commit và ngày.
- **Ngoài phạm vi**:
  - Reindex theo từng id bài (diff per-item). Chỉ làm khi `last_sync_ms` trên `/health` thường xuyên vượt 5 giây; ghi số đo vào mục 5.
  - Lưu cache embedding ở Turso, đổi schema Prisma, vector database (ADR-0006).
  - Sửa `hybrid_search`, `router/**`, prompt hệ thống, UI News, UI Lesson.
  - Kiểm tra anchor có tồn tại thật khi Abot sinh link: `links.py` hiện cho qua fragment `#...`; giữ nguyên.

### Quyết định chờ Owner (trả lời trước khi giao)

1. **Reindex**: spec chọn *cổng version* (TTL chỉ kéo toàn bộ khi `index-version` đổi), **chưa** làm diff theo id bài. Lý do: mỗi lần ghi vẫn đẩy reindex toàn bộ, mà Owner ghi ít; diff theo id phải xử lý thêm xoá bài, đổi tên topic, đổi tên mục, đổi thứ tự. Owner muốn làm luôn diff theo id thì thêm Step riêng.
2. **Cache bền**: spec chỉ thêm biến `EMBEDDING_CACHE_PATH` để trỏ vào ổ bền của host. Nếu host đang dùng gói không có ổ bền, cần task riêng lưu cache ở Turso (đổi schema).

## 3. Step-by-Step Implementation Checklist

### Phần A: chia Lesson thành đoạn

- [x] **Step 1: Hàm chia đoạn phía Next.js** (`lib/roadmap/content-utils.ts`). Export `lessonChunks(content: string | null | undefined): LessonChunk[]`, với `LessonChunk = { anchor: string | null; heading: string | null; text: string }`.
  - Dùng đúng pipeline của trang Lesson: `contentToHtml(content)` → `withHeadingIds(html)`. Cắt HTML tại mỗi `h2`/`h3` có id. Phần trước heading đầu tiên là đoạn `anchor: null, heading: null`.
  - `text` là plain text: bỏ tag, bỏ marker provenance, gộp khoảng trắng. Bỏ đoạn rỗng.
  - Đoạn dài hơn `CHUNK_MAX_CHARS = 1200` thì cắt tiếp tại ranh giới đoạn văn hoặc câu, các phần giữ cùng `anchor` và `heading`.
  - Không đổi `withHeadingIds` hay `headingSlug`.
- [x] **Step 2: Export trả đoạn** (`app/api/v1/roadmaps/full-export/route.ts`). Mỗi item thêm `chunks: lessonChunks(item.content)`. Giữ nguyên các trường cũ. Thêm `requireWriteAccess(req)` ở đầu `GET` (đổi chữ ký sang `GET(req: Request)`). Sửa comment "Public" cho đúng.
- [x] **Step 3: Python tạo document đoạn** (`retrieval/ingestion.py`).
  - `KnowledgeDocument` thêm các trường tuỳ chọn `parent_id: Optional[str]`, `anchor: Optional[str]`, `heading: Optional[str]`, và `passages: list[dict] = []` (chỉ engine gán, ingestion không gán). Mô tả `doc_type` thành `'topic' | 'item' | 'chunk'`.
  - Một Lesson chỉ sinh doc `chunk` khi có ít nhất một heading **hoặc** text đã bỏ tag dài hơn `ITEM_CONTEXT_CHARS = 1200`. Bài ngắn không heading giữ một doc `item` như cũ.
  - Doc chunk: `id = f"{item_id}::{i}"` (i là thứ tự đoạn), `doc_type="chunk"`, `parent_id=item_id`, copy `topic_slug`, `topic_title`, `item_slug`, `section`, `title` của bài; `content_text = text`; `searchable_text = f"{item_title} › {heading}: {text}"` (không có heading thì bỏ `› heading`).
  - Export không có `chunks` (Next cũ, sqlite adapter cũ) thì không sinh chunk, không lỗi.
  - `adapters/sqlite_adapter.py#export_full_hierarchy` (chỉ dùng khi dev hoặc test) không bắt buộc sinh `chunks`. Ghi rõ trong docstring là adapter này không có đoạn.
- [x] **Step 4: Gộp đoạn về Lesson khi tìm** (`retrieval/engine.py#search_live_knowledge`).
  - Gọi `hybrid_search(query, limit=limit * 3)`. Duyệt theo thứ hạng: doc `chunk` quy về `parent_id`. Nếu parent không có trong `_docs_map` thì bỏ qua.
  - Kết quả là bản sao (`model_copy`) của doc item cha, `passages` chứa tối đa 2 đoạn khớp tốt nhất `{anchor, heading, text}`. Thứ hạng của Lesson là thứ hạng tốt nhất trong các doc của nó (item hoặc chunk). Topic giữ nguyên. Cắt còn `limit`.
  - Không sửa `HybridVectorStore.hybrid_search`.
- [x] **Step 5: Đưa đoạn vào context và link** (`engine.py#format_knowledge_context`, `engine.py#knowledge_href`, `profile.py#_roadmap_document`).
  - `knowledge_href(doc, anchor=None)`: có anchor thì nối `#anchor`.
  - Item có `passages`: mỗi đoạn một dòng gồm heading, link `knowledge_href(doc, anchor)` và text cắt ở `PASSAGE_CONTEXT_CHARS = 700`. Item không có `passages`: dùng `content_text` cắt ở `ITEM_CONTEXT_CHARS = 1200`, thay cho 300. Hai hàm format phải ra cùng nội dung như comment trong `profile.py` đang yêu cầu.
  - Không đổi `_known_links` trong `profile.py`: link có `#anchor` vẫn được `links.py` cho qua.
- [x] **Step 6: Giữ nguyên router và scope**. `scope_centroid.py#DomainCentroids.from_store` chỉ dùng vector của doc `topic`/`item`. `engine.py`: `title_vocabulary` và `corpus_vocabulary` bỏ qua `chunk` (nếu `relevance.corpus_vocabulary` cần lọc thì sửa ở đó). Test chứng minh centroid, catalog và các tập vocabulary **giống hệt** trước và sau khi index có chunk, với cùng dữ liệu.

### Phần B: đồng bộ nhẹ hơn và đo được

- [x] **Step 7: Cổng version cho TTL**.
  - Next: `lib/roadmap/index-version.ts#getRoadmapIndexVersion()` trả chuỗi ổn định từ `count` và `max(updatedAt)` của `Roadmap` và `RoadmapItem` (hai query aggregate, không đọc `content`). Route mới `app/api/v1/roadmaps/index-version/route.ts` `GET` có `requireWriteAccess`, trả `{ version }`, `Cache-Control: no-store`.
  - Python: `http_adapter.py#index_version()` gọi route trên. 404 hoặc lỗi thì trả `None`. `sqlite_adapter.py#index_version()` tính tương tự bằng SQL.
  - `engine.py`: lưu `_indexed_version` sau mỗi lần sync thành công. Trong `ensure_fresh`, khi quá `INDEX_TTL_SECONDS` mà `is_current()` vẫn đúng: gọi `index_version()`; bằng `_indexed_version` thì chỉ đặt lại `_synced_at`, không kéo export; khác hoặc `None` thì sync toàn bộ như cũ. Việc kiểm version chạy nền giống `_start_sync`, không làm chậm câu trả lời. `/internal/reindex` giữ nguyên (luôn sync toàn bộ).
- [x] **Step 8: Cache embedding bền và rẻ** (`core/retrieval/hybrid.py`).
  - `EMBEDDING_CACHE_PATH` đọc từ biến môi trường cùng tên, mặc định là đường dẫn hiện tại.
  - Ghi atomic (file tạm rồi `os.replace`).
  - Giữ bản cache trong RAM, chỉ đọc lại file khi `mtime` đổi, để không parse JSON nhiều MB ở mỗi lần sync.
  - Không đổi `_embedding_key`.
- [x] **Step 9: Đo trên `/health`** (`engine.py#index_status`). Thêm `chunks` (số doc chunk), `last_sync_ms` (thời gian lần sync toàn bộ gần nhất) và `version_checks_skipped` (số lần TTL bỏ qua nhờ version). Giữ nguyên các khoá cũ, test `test_health_index.py` cũ vẫn pass.
- [x] **Step 10: Siết quyền** `app/api/v1/roadmaps/route.ts#GET`. Thêm `requireWriteAccess` (không có caller nào phía trình duyệt; Python gửi `x-admin-key`). Không đổi các handler ghi.

### Test và tài liệu

- [x] **Step 11: Test TS**.
  - `tests/unit/lesson-chunks.test.ts`: anchor giống hệt `withHeadingIds` (gồm heading trùng `-2`, heading tiếng Việt); đoạn mở đầu `anchor: null`; đoạn dài bị cắt và giữ anchor; marker provenance bị bỏ; content rỗng ra `[]`.
  - `tests/unit/roadmap-export-access.test.ts`: `full-export`, `GET /api/v1/roadmaps`, `index-version` trả 401 khi không có quyền, 200 khi có `x-admin-key` đúng; `full-export` có `chunks` và không có `status`.
- [x] **Step 12: Test Python**.
  - `tests/test_lesson_chunks.py`:
    - Một Lesson có dữ kiện chỉ nằm ở heading thứ 3, sau hơn 2.000 ký tự. Hỏi đúng dữ kiện đó thì `search_live_knowledge` trả Lesson đó, `passages` chứa dữ kiện, context chứa dữ kiện và link `#anchor`. Phải fail trên code cũ.
    - Không bao giờ trả doc `chunk`. Hai đoạn cùng bài gộp thành một kết quả.
    - Bài ngắn không heading không sinh chunk.
    - Export thiếu `chunks` thì vẫn index được.
    - Centroid, catalog, `known_item_ids`, `title_vocabulary`, `corpus_vocabulary` không đổi khi có chunk.
  - `tests/test_index_version_gate.py`: version không đổi thì TTL không gọi `export_full_hierarchy`; version đổi hoặc `None` thì có gọi; `/internal/reindex` luôn sync.
  - `tests/test_embedding_cache_path.py`: biến môi trường đổi đường dẫn; ghi atomic; `mtime` không đổi thì không đọc lại file.
  - Sửa fixture trong các test index cũ chỉ khi cần cho chữ ký mới. Không nới assertion cũ.
- [x] **Step 13: Tài liệu**.
  - `docs/DEPLOY_ENV.md`: thêm `EMBEDDING_CACHE_PATH` (🟡, mặc định file trong image, nên trỏ vào ổ bền).
  - `tests/manual/rag-index-sync.md`: thêm case "hỏi dữ kiện ở cuối bài dài / ý vừa đưa từ News vào bài" và case "/health có chunks, last_sync_ms".
  - `.agents/skills/cris-code-intel/data/cris-workspace-map.json`: thêm route `GET /api/v1/roadmaps/index-version` vào `FLOW_ABOT_CHAT_QUERY`, ghi `full-export` là Owner/admin-key. Chạy `yarn intel status`.
- [x] **Step 14: Đo trước và sau** (ghi vào mục 5). Với dữ liệu `prisma/dev.db` (hoặc fixture có sẵn), đo số doc, số chunk, thời gian `sync_live_database` và số ký tự context của một câu hỏi mẫu, trước và sau thay đổi. Chạy `evals validate`. Ratchet router trong `py_all` (`test_write_invariants`) không được tệ hơn.

## 4. Verification Gate Results
<!-- Executor điền: PENDING | PASSED | FAILED | SKIPPED -->
Chạy 2026-11-24 trên `feat/abot-lesson-chunks` (gốc `fd46546`, chưa commit):
- [x] `TypeCheck`: PASSED (`yarn tsc --noEmit -p .`, exit 0)
- [x] `Lint`: PASSED trên các file của task (`npx eslint <file>`). Chưa chạy `yarn lint` toàn repo: repo có sẵn nhiều lỗi lint cũ (spec lesson-status-001 ghi 168).
- [x] `Unit (new)`: PASSED 13/13
- [x] `Test`: PASSED `yarn test` 124 file, 1.223 pass, 8 skip
- [x] `Py (new + index)`: PASSED
- [x] `Py (all)`: PASSED 1.231/1.231 (gồm ratchet router `test_write_invariants`)
- [x] `Evals validate`: PASSED (484 samples, 4 datasets)
- [x] `Schema SQL`: PASSED (không đổi schema)
- [x] `Intel Status`: PASSED (206 ref map + 38 ref docs khớp code)
- [ ] `Boundary Check`: SKIPPED. Không có baseline vì Claude làm thẳng. Thay vào đó đã đối chiếu `git status`: file của task nằm trong `allowed_to_modify`. Các file `components/news/**`, `app/(news)/**`, `lib/news/worker-health.ts`, `components/ui/dialog.tsx`, `hooks/use-swipe-drawer.ts` và các test news là việc dở của Owner từ trước (có cả `QuickPasteDialog.tsx` đổi trong lúc làm), task này không đụng.

## 5. Execution Audit Log
- **Result file**: không có (không qua Executor).
- **Lệch so với spec** (cố ý):
  - `CHUNK_MAX_CHARS = 900` (spec ghi 1200) và `PASSAGE_CONTEXT_CHARS = 900` (spec ghi 700). Lý do: Python chỉ embed 1.000 ký tự đầu của `searchable_text` (`hybrid.py#_embedding_key`), nên đoạn 1.200 ký tự sẽ mất phần đuôi trong vector; context hiện nguyên đoạn.
  - Dòng đoạn trong context không kèm link: `rules_rag` cấm model chèn link. Thay vào đó `ContextDocument.href` (link của nguồn trích dẫn) trỏ `#anchor` của đoạn khớp nhất (`engine.py#lesson_href`).
  - Khi index không có chunk nào, `search_live_knowledge` gọi `hybrid_search(limit)` y như cũ; pool `limit × 3` chỉ dùng khi có chunk. Lý do: pool rộng hơn làm đổi kết quả RRF ngay cả với dữ liệu không có chunk.
  - Lần sync trước không có version (nguồn cũ, mock test) thì TTL sync toàn bộ ngay như trước, không qua bước kiểm version.
  - E2E 2026-11-24 lộ ra 2 lỗi, đã sửa ngoài `allowed_to_modify` ban đầu: `rag_service/api/schemas.py#IndexHealthInfo` lọc mất 3 trường mới của `/health`, và `rag_service/domains/roadmap/agent.py` (`href_of=lesson_href`) để bước retrieve hiện link `#anchor`. Kết quả E2E: `tests/manual/rag-index-sync.md`, lần chạy 2026-11-24. Lỗi thứ ba (cổng scope chặn câu hỏi về tri thức nằm sâu trong bài) đã sửa sau khi Owner đồng ý, **đảo một phần Step 6**: `nearest` giờ tính cả vector đoạn; centroid (`domain`) vẫn chỉ topic và bài, ngưỡng không đổi. Đo bằng Gemini thật: câu case 7 từ 0,6106 (EXTERNAL) thành 0,7525 (ROADMAP), câu ngoài lề không đổi. Eval scope hiện có không đo được thay đổi này (corpus eval không có đoạn); khoá bằng `test_a_question_near_a_later_section_is_near_the_roadmap` và E2E lần 2. Pytest 1.233/1.233.
  - Cột loại doc của FTS đổi từ `doc_type` sang thuộc tính `fts_kind` (bằng `doc_type` với topic/item, rỗng với chunk). Lý do: FTS khớp mọi cột, nên câu hỏi có chữ "chunk" (ví dụ về chunking) sẽ khớp mọi doc chunk qua chữ loại của nó. Topic và item giữ nguyên nội dung cột. Có test `test_the_word_chunk_does_not_match_every_chunk_through_its_type`; full pytest chạy lại 1.232/1.232.
- **Số đo trước / sau (Step 14)**, `prisma/dev.db`, adapter SQLite, không embedding: 125 doc (2 topic, 123 bài), 0 chunk, ingest ~360–400 ms, sync ~70–76 ms, context câu "RAG" 1.618 ký tự, **giống hệt trước và sau**. Không bài nào trong `dev.db` có `h2`/`h3` (bài dài nhất 741 ký tự), và adapter SQLite không sinh `chunks`. Chưa đo trên Turso: làm ở `deploy_steps` và case 6–8 của `tests/manual/rag-index-sync.md`.
- **Test mới fail trên code cũ**: `tests/test_lesson_chunks.py` chạy trên `fd46546` → 4/5 fail (test centroid pass vì code cũ không có chunk).
- **Modified Files**:
  - Next: `lib/roadmap/content-utils.ts` (`lessonChunks`), `lib/roadmap/index-version.ts` (mới), `app/api/v1/roadmaps/full-export/route.ts`, `app/api/v1/roadmaps/index-version/route.ts` (mới), `app/api/v1/roadmaps/route.ts`
  - Python: `retrieval/ingestion.py`, `retrieval/engine.py`, `retrieval/scope_centroid.py`, `profile.py`, `adapters/http_adapter.py`, `adapters/sqlite_adapter.py`, `core/retrieval/hybrid.py`
  - Test: `tests/unit/lesson-chunks.test.ts`, `tests/unit/roadmap-export-access.test.ts`, `roadmap-rag-assistant/tests/test_lesson_chunks.py`, `test_index_version_gate.py`, `test_embedding_cache_path.py` (đều mới; không sửa test cũ)
  - Docs: `docs/DEPLOY_ENV.md`, `tests/manual/rag-index-sync.md` (case 6–9), `.agents/skills/cris-code-intel/data/cris-workspace-map.json`, `.handoff/BACKLOG.md`
- **Bài học**:
  - Đổi kích thước pool truy hồi làm lệch RRF ngay cả khi dữ liệu không đổi; thay đổi kiểu cộng thêm phải giữ nguyên lời gọi cũ khi tính năng mới chưa có dữ liệu.
  - Giới hạn đoạn phải đặt theo giới hạn embed phía Python (1.000 ký tự), không theo cảm giác "độ dài đoạn hợp lý".
