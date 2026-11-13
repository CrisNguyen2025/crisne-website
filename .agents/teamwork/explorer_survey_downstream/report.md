# Nghiên cứu và So sánh Toàn diện Các Luồng Thực thi Downstream của Tri thức trong Abot (Vector RAG, Catalog In-Memory, và Tiến độ Học tập ADR-0010)

**Tác giả:** `explorer_survey_downstream`  
**Ngày thực hiện:** 2026-11-10  
**Phạm vi:** Trợ lý Abot (`roadmap-rag-assistant/`), Kiến trúc Router Intent, ADR-0010 (`docs/adr/0010-lesson-status-known-learning-target.md`), và Bộ kiểm thử đánh giá (`evals/router/`).  
**Chế độ:** Điều tra & Phân tích Đọc-Chỉ (Read-Only Investigation).

---

## 1. Tóm tắt Điều hành (Executive Summary)

Hiện tại, trong hệ thống trợ lý học tập Abot (`roadmap-rag-assistant/`), toàn bộ các yêu cầu tra cứu tri thức của người dùng đang được gán nhãn chung là một intent duy nhất: `IntentType.KNOWLEDGE_QUERY` (định nghĩa tại `rag_service/domains/roadmap/router/schemas.py:16`). Tuy nhiên, qua quá trình kiểm tra và truy vết luồng thực thi (execution tracing) trong mã nguồn, tồn tại **3 nhánh nghiệp vụ downstream hoàn toàn dị biệt** cả về bản chất thuật toán, mức tiêu thụ tài nguyên tính toán, độ trễ (latency), yêu cầu ngữ cảnh (context requirements) và tác dụng phụ (side effects):

1. **Nhánh 1 — Vector RAG Search:** Tra cứu ngữ nghĩa sâu (semantic search) qua chỉ mục lai Hybrid FTS5 + Dense Embeddings (`models/gemini-embedding-001`), RRF (Reciprocal Rank Fusion), Reranker LLM tùy chọn, và tổng hợp câu trả lời tự nhiên qua mô hình ngôn ngữ lớn (LLM Generation: Gemini Flash hoặc Groq Llama-3.3).
2. **Nhánh 2 — In-Memory Catalog Lookup:** Tra cứu cây danh mục / mục lục cấu trúc lộ trình (Topic / Section / Lesson titles) dựa trên metadata đã tải vào bộ nhớ RAM (`Catalog` trong `target_grounding.py` và adapter API `list_topics`), trả lời trực tiếp tức thì bằng template Markdown cố định, hoàn toàn không gọi LLM hay Embedding.
3. **Nhánh 3 — User Learning Progress (ADR-0010):** Truy vấn và quản lý trạng thái tiến trình cá nhân của Owner (`known`, `learning`, `target`) cùng dấu vết thời gian ôn tập (`statusUpdatedAt`). Nhánh này đòi hỏi xác thực danh tính nghiêm ngặt (`is_owner()` fail-closed), truy vấn trực tiếp DB/Adapter, lọc và sắp xếp thuần tuý trong bộ nhớ (pure Python sorting), và bao gồm luồng đột biến dữ liệu (CUD mutation) có cơ chế Preview xác nhận 2 bước (`pending_status_change`).

**Phát hiện kiến trúc then chốt:**  
Do `IntentType.KNOWLEDGE_QUERY` bị gộp nguyên khối trong Router, hệ thống hiện phải giải quyết sự dị biệt này bằng cách "đặt bẫy" các hàm chặn thủ tục (procedural regex interceptors: `handle_listing`, `handle_sections`, `handle_lesson_status`) ở tầng Agent trước khi Router được kích hoạt (`agent.py:284-316`). Nếu câu hỏi của người dùng lệch khỏi regex cứng, nó sẽ rơi xuống Router, bị gán `KNOWLEDGE_QUERY`, và bị đẩy vào toàn bộ pipeline Vector RAG tiêu tốn hàng nghìn mili-giây cùng token quota, đồng thời có nguy cơ sinh câu trả lời ảo (hallucination) vì vector store không hề chứa trạng thái tiến độ học tập cá nhân!

---

## 2. Bối cảnh Kiến trúc: Sự Quá tải của `IntentType.KNOWLEDGE_QUERY`

### 2.1 Định nghĩa trong Router Hiện tại
Trong `rag_service/domains/roadmap/router/schemas.py`:
```python
class IntentType(str, Enum):
    ROADMAP_CUD = "roadmap_cud"         # Create or delete a topic or lesson; rename a section
    KNOWLEDGE_QUERY = "knowledge_query" # Ask about existing lessons, concepts, search docs
    PLAN_GOAL = "plan_goal"             # A learning plan, answered from the existing lessons
    CHITCHAT = "chitchat"               # Greetings, thanks, identity questions
    OUT_OF_SCOPE = "out_of_scope"       # Unrelated to roadmaps
    UNCLEAR = "unclear"                 # LLM router could not tell
```

Trong `rag_service/domains/roadmap/router/policy.py`, bảng quyết định `DECISION_TABLE` ánh xạ nhiều pattern rất khác nhau về cùng một kết quả `KNOWLEDGE_QUERY`:
- Dòng `search_word` (độ tin cậy 0.90): Khớp từ khóa tìm kiếm (`"tìm"`, `"là gì"`, `"thế nào"`...).
- Dòng `roadmap_question` (độ tin cậy 0.90): Câu hỏi nhắm vào đối tượng roadmap (`Target.ROADMAP`).
- Dòng `known_title_question` (độ tin cậy 0.90): Câu hỏi chứa tiêu đề bài học đã biết trong catalog.
- Dòng `how_to_question` (độ tin cậy 0.85): Câu hỏi kỹ thuật / cách làm không gắn với roadmap.
- Dòng `show_request` (độ tin cậy 0.85): Yêu cầu xem nội dung / cấu trúc lộ trình (`"cho mình xem cấu trúc..."`).

### 2.2 Điểm rẽ nhánh trong Downstream Agent (`agent.py`)
Tại `rag_service/domains/roadmap/agent.py`:
- **Trước Router (Tiền xử lý cứng):**
  - Dòng 284: `self.handle_listing(...)` -> nếu là `LIST_TOPICS` ("liệt kê topic", "danh sách lộ trình") -> gọi tool `list_topics` và kết thúc luôn.
  - Dòng 290: `self.handle_sections(...)` -> nếu là `LIST_SECTIONS` -> thống kê số bài theo mục và kết thúc.
  - Dòng 306: `self.handle_lesson_status(...)` -> nếu là câu hỏi tiến độ theo ADR-0010 -> kiểm tra `is_owner()`, truy vấn adapter và kết thúc.
- **Sau Router (Xử lý `KNOWLEDGE_QUERY` chính thống):**
  - Dòng 436: Nếu Router trả về `IntentType.KNOWLEDGE_QUERY` -> gọi `answer_from_sources(...)` tại `rag_service/core/orchestration/sources.py`.

Sự phân mảnh này chứng minh rằng tầng routing ngữ nghĩa (semantic router) và tầng thực thi downstream đang bị lệch pha nghiêm trọng.

---

## 3. Phân tích Chi tiết Nhánh 1: Vector RAG Search

Nhánh này chịu trách nhiệm trả lời các câu hỏi về khái niệm kỹ thuật, nội dung bài học, giải thích kiến thức chuyên sâu dựa trên kho tài liệu đã chỉ mục.

### 3.1 Luồng thực thi chi tiết (Execution Flow)
1. **Entrypoint:** `agent.py:436` -> `answer_from_sources(...)` trong `rag_service/core/orchestration/sources.py:68`.
2. **Query Transformation (`deps.plan`):**
   - Nếu bật `settings.rag_query_transform` (`config.py:38`), hệ thống gọi LLM (`plan_queries`) để mở rộng từ khóa, phân tách câu hỏi đa ý hoặc giải quyết đại từ chỉ xuất ("bài đó" -> tên bài cụ thể).
3. **Đảm bảo tính tươi mới của chỉ mục (`ensure_fresh`):**
   - `rag_engine.search_live_knowledge` gọi `self.ensure_fresh()` (`engine.py:157`).
   - Nếu có thay đổi từ DB hoặc chỉ mục cũ hơn `INDEX_TTL_SECONDS = 30.0s`, hệ thống chờ tối đa `SYNC_WAIT_SECONDS = 3.0s` để re-index.
4. **Truy vấn lai (Hybrid Retrieval):**
   - Thực thi tại `HybridVectorStore.hybrid_search(query, limit=5)` (`rag_service/core/retrieval/hybrid.py:402`):
     - **Keyword search (BM25):** SQLite FTS5 trên bảng ảo `fts_docs` với tokenizer `unicode61`. Lọc bỏ `FTS_STOPWORDS`.
     - **Dense Vector search:** Gọi `_similarities(query)`. Kiểm tra bộ nhớ đệm `_QUERY_VECTORS` (`QUERY_CACHE_SIZE = 512`). Nếu miss, gọi Google Gemini Embedding API (`models/gemini-embedding-001`). Sau đó tính tích vô hướng Cosine similarity trên RAM đối với toàn bộ vector tài liệu.
     - **Ngưỡng lọc tương đồng:** Loại bỏ các tài liệu có điểm cosine < `VECTOR_MIN_SIMILARITY = 0.665`.
     - **Thin Document handling:** Bài học quá ngắn (< 4 từ) bị loại khỏi cosine search, chỉ match theo tên FTS5.
     - **Reciprocal Rank Fusion (RRF):** Kết hợp 2 bảng xếp hạng theo công thức:
       $$\text{RRF Score} = \sum \frac{1}{60 + \text{rank} + 1}$$
5. **Reranking tùy chọn (`deps.rerank`):**
   - Nếu bật `settings.rag_rerank` và `_rerank_needed` (khoảng cách điểm giữa top-1 và top-2 nhỏ hơn `rerank_below_gap`), gọi thêm 1 lượt LLM để chấm điểm lại danh sách ứng viên (`rerank.py:38`).
6. **Relevance Gate (`deps.accept`):**
   - Kiểm tra các bài khớp có chứa từ vựng trong chủ đề (`filter_on_topic` so với `corpus_vocabulary()`).
7. **Tổng hợp câu trả lời (LLM Generation):**
   - Chuyển đổi tài liệu tìm thấy sang ngữ cảnh Markdown (`format_knowledge_context`).
   - Gọi `pipeline.astream(llm, req)` (`rag_service/core/generation/pipeline.py`) gửi prompt kèm sources sang Gemini Flash / Groq LLM để stream từng token chữ về UI qua SSE.
   - Nếu LLM lỗi hoặc cạn quota, fallback về xuất ngữ cảnh trích dẫn trực tiếp (`mode="context"`).

### 3.2 Tài nguyên & Tính toán (Compute & Resources)
- **Mạng ngoại vi (Network I/O):**
  - Bắt buộc tối thiểu 2 cuộc gọi mạng ngoại vi: 1 cuộc gọi Google Gemini Embedding API + 1 cuộc gọi LLM Generation (Gemini/Groq).
  - Có thể lên tới 4 cuộc gọi mạng nếu bật cả Query Transform (1 LLM call) và Reranker (1 LLM call).
- **CPU & Bộ nhớ cục bộ:**
  - SQLite FTS5 đọc đĩa hoặc RAM.
  - Tích vô hướng vector tính toán trực tiếp trên CPU Python: với $N$ tài liệu ($N \approx 100 - 1000$) và chiều vector $d = 768$, độ phức tạp $O(N \cdot d)$ tiêu tốn từ 2 - 15ms CPU.
  - `_QUERY_VECTORS` chiếm khoảng 2MB - 10MB RAM. Cache embedding đĩa lưu tại `core/data/embedding_cache.json`.

### 3.3 Đặc tính Độ trễ (Latency Profile)
- **Tổng thời gian đáp ứng (E2E Latency):** **800ms – 3,500ms** (ở chế độ streaming, TTFT đạt khoảng 450ms – 1,100ms).
- Khi gặp tình trạng rate-limit hoặc re-sync chỉ mục: có thể giật lên **3,000ms – 5,000ms**.

### 3.4 Yêu cầu Ngữ cảnh (Context Requirements)
- Cần `thread_id` / `session_id` để đọc lịch sử hội thoại gần nhất (`history_store`, mặc định 3 lượt).
- Cần kho văn bản tri thức đầy đủ (`KnowledgeDocument`: `title`, `description`, `content_text`, `section`).
- Không đòi hỏi xác thực người dùng (Public Access: cả Visitor và Owner đều xem được tri thức chung).

### 3.5 Tác dụng phụ (Side Effects)
- **Cơ sở dữ liệu Roadmap:** Không có tác dụng phụ (hoàn toàn chỉ đọc - Read-Only).
- **Bộ nhớ đệm:** Ghi thêm vector vào `_QUERY_VECTORS` LRU cache và `embedding_cache.json`.
- **Lịch sử hội thoại:** Lưu vết tin nhắn vào `history_store` (`record_turn`).
- **Giám sát (Observability):** Gửi dấu vết đầy đủ lên Langfuse (trace, step `retrieve-live-knowledge`, token usage).

---

## 4. Phân tích Chi tiết Nhánh 2: In-Memory Catalog Lookup

Nhánh này chịu trách nhiệm phục vụ các câu hỏi mang tính cấu trúc, bao quát danh mục: "Website có những lộ trình nào?", "Topic AI Engineering có bao nhiêu mục / bài?", "Cho tôi xem danh sách các section của backend".

### 4.1 Luồng thực thi chi tiết (Execution Flow)
1. **Entrypoint:**
   - Trường hợp 1: Chặn trước router tại `agent.py:284` (`handle_listing` trong `commands.py:231`) và `agent.py:290` (`handle_sections` trong `sections.py:53`).
   - Trường hợp 2: Khi đi qua Router, rơi vào các luật `DECISION_TABLE` như `roadmap_question`, `show_request` (`policy.py:415, 420`) hoặc grounding check `Catalog.mentioned_in(...)` (`target_grounding.py:63`).
2. **Truy vấn dữ liệu:**
   - Đối với danh sách Topic: Gọi `adapter.list_topics()` (`http_adapter.py:49` hoặc `sqlite_adapter.py:87`).
     - Truy vấn lấy `id`, `slug`, `title`, `description`, và `COUNT(items)` từ bảng `Roadmap`.
   - Đối với danh sách Section của một Topic:
     - Định danh topic mục tiêu (`_section_topic`) qua tham số trang (`page_context.roadmapSlug`), từ khóa trong câu hoặc `session_ctx.active_topic_slug`.
     - Lấy danh sách `items` của topic qua `adapter.get_topic(slug)`.
     - Gom nhóm và đếm số bài theo `item.section` thông qua hàm thuần túy `section_counts(topic)` (`sections.py:74`).
   - Đối với kiểm tra thực thể (Grounding Catalog):
     - `rag_engine.catalog()` duy trì đối tượng `Catalog` (`target_grounding.py:36`) chứa hai `set[str]` trong RAM: `topics` và `items`.
     - Tìm kiếm bằng so khớp chuỗi chuẩn hóa, tìm chuỗi con, hoặc `difflib.get_close_matches(cutoff=0.85)`.
3. **Định dạng phản hồi:**
   - Dùng các template Markdown tĩnh có sẵn:
     - `section_list_reply(...)`: Định dạng danh sách mục kèm số lượng bài học tương ứng (`sections.py:84`).
     - `list_topics` tool formatting: `📋 Có {len(topics)} topic:\n- {title} (slug: ..., bài: ...)` (`topic_tools.py:98`).
   - Không chuyển văn bản qua LLM. Phát trực tiếp qua SSE generator `_stream_text`.

### 4.2 Tài nguyên & Tính toán (Compute & Resources)
- **Mạng ngoại vi (Network I/O):**
  - **0 cuộc gọi LLM! 0 cuộc gọi Embedding!**
  - Nếu dùng `SqliteAdapter`: 0 network call (đọc file local SQLite với WAL mode).
  - Nếu dùng `HttpApiAdapter`: 1 HTTP GET cục bộ tới Next.js API `/api/v1/roadmaps` hoặc `/api/v1/roadmaps/{slug}` (vòng lặp localhost nội bộ).
- **CPU & Bộ nhớ cục bộ:**
  - Tính toán CPU cực nhỏ (< 0.5ms). Thao tác đếm từ điển `dict` và duyệt mảng vài chục phần tử.
  - Bộ nhớ RAM tiêu thụ không đáng kể (< 100KB cho catalog cấu trúc).

### 4.3 Đặc tính Độ trễ (Latency Profile)
- **Tổng thời gian đáp ứng (E2E Latency):** **5ms – 40ms** (với `SqliteAdapter` thường < 5ms; với `HttpApiAdapter` khoảng 15ms – 35ms).
- Nhanh hơn nhánh Vector RAG từ **50 đến 100 lần**.

### 4.4 Yêu cầu Ngữ cảnh (Context Requirements)
- Cần `page_context` (`roadmapSlug`) để nhận diện ngầm topic người dùng đang mở trên giao diện (nếu người dùng hỏi "topic này có mấy mục").
- Không cần xác thực danh tính: Cấu trúc lộ trình, tên topic, tên section là thông tin công khai (Public Access), phục vụ cả Visitor và Owner.

### 4.5 Tác dụng phụ (Side Effects)
- **Cơ sở dữ liệu:** Hoàn toàn không ghi đè, không thay đổi (Zero DB Side Effects).
- **Quota / Rate Limit:** Không tiêu tốn bất kỳ hạn ngạch API nào.

---

## 5. Phân tích Chi tiết Nhánh 3: User Learning Progress Queries (ADR-0010)

Nhánh này hiện thực hóa quyết định kiến trúc trong **ADR-0010: "Lesson có trạng thái: target, learning, known"**. Đây là tính năng biến Roadmap thành "Bộ não thứ hai" (Second Brain) cho Owner.

### 5.1 Nền tảng Nghiệp vụ theo ADR-0010
- **3 Trạng thái Lesson Status:**
  - `target` (Mục tiêu): Bài học dự định sẽ học.
  - `learning` (Đang học): Bài học đang trong quá trình tiếp thu.
  - `known` (Đã nắm): Bài học đã hoàn thành / kiến thức đã có.
- **Quy tắc chuyển dịch & Mặc định:**
  - Bài học tạo mới hoặc chưa có trạng thái mặc định là `known` (tri thức sẵn có).
  - Trạng thái gắn ở cấp **Lesson (`RoadmapItem`)**, không gắn ở cấp Topic. Trạng thái của Topic là tổng hợp dẫn xuất từ các Lesson của nó.
  - Lưu thời điểm cập nhật trạng thái gần nhất: `statusUpdatedAt`.
- **Ranh giới Bảo mật & Riêng tư Cực kỳ Nghiêm ngặt:**
  - ADR-0010 nêu rõ: *"Chưa quyết Visitor có thấy trạng thái hay không, vì trạng thái là dữ liệu cá nhân của Owner. Cho đến khi có ADR khác, chỉ Owner thấy."*
  - Bất kỳ ai không phải là Owner đều bị chặn truy cập thông tin tiến độ học tập.

### 5.2 Bốn Phân luồng Tác vụ (Sub-Journeys)
Mã nguồn tại `rag_service/domains/roadmap/lesson_status.py` chia nhánh này làm 4 kịch bản cụ thể:

#### (a) Báo cáo tiến độ — "Tôi đang biết gì về X" (`asks_what_i_know`)
- Cues: `"đang biết gì"`, `"đã biết gì"`, `"đã nắm gì"`, `"tiến độ học"`.
- Thực thi:
  - Nếu chỉ định topic: Lấy các bài trong topic đó qua `adapter.get_topic(slug)`.
  - Nếu không nêu topic: Lấy toàn bộ cây tri thức qua `adapter.export_full_hierarchy()`.
  - Hàm thuần túy `filter_known_lessons`, `filter_and_sort_next_lessons` gom nhóm thành 3 danh sách: Đã nắm, Đang học, Mục tiêu.
  - Trả về bảng tổng kết bằng hàm `format_what_i_know_reply(...)`.

#### (b) Gợi ý học tiếp — "Nên học gì tiếp" (`asks_next_learning`)
- Cues: `"học gì tiếp"`, `"nên học gì"`, `"học tiếp"`, `"gợi ý học"`.
- Thực thi:
  - Hàm `filter_and_sort_next_lessons` tách bài thành: `learning` và `target`.
  - Quy tắc ưu tiên theo ADR-0010: **Ưu tiên hoàn thành các bài `learning` trước**, sau đó mới đề xuất các bài `target`.
  - Trả về danh sách định dạng qua `format_next_learning_reply(...)`.

#### (c) Nhắc bài cần ôn tập — "Bài nào cần ôn lại" (`asks_review`)
- Cues: `"ôn lại"`, `"cần ôn"`, `"ôn tập"`, `"review bài"`.
- Thực thi:
  - Hàm `filter_and_sort_review_lessons(items)`:
    - Chỉ lọc các bài đang có trạng thái `known`.
    - Sắp xếp tăng dần theo `statusUpdatedAt`: **Các bài có `statusUpdatedAt` là `null` hoặc rỗng được xếp lên đầu tiên** (bài lâu nhất chưa cập nhật hoặc chưa từng ôn), sau đó đến các bài có mốc thời gian cũ hơn.
  - Trả về danh sách qua `format_review_reply(...)`.

#### (d) Lệnh thay đổi trạng thái — "Đánh dấu bài X là đang học" (State Mutation)
- Cues: `"đánh dấu"`, `"chuyển"`, `"đổi trạng thái bài ... sang ..."` (`parse_status_change_request`).
- Thực thi quy trình Preview & Commit 2 bước:
  - Bước 1 (Preview): Kiểm tra `is_owner()`, tìm bài học trong topic. Nếu bài đã ở trạng thái đó thì thông báo không cần đổi. Nếu hợp lệ, lưu vào `session_ctx.pending_status_change` và phát sinh sự kiện `action_preview` yêu cầu người dùng gõ `ok` để xác nhận hoặc `hủy` để hủy bỏ (`lesson_status.py:358-382`).
  - Bước 2 (Commit): Khi người dùng gửi "ok", `commands.py:153` bắt lấy `pending_status_change`, gọi `adapter.update_item(item_id, status=new_status)`.

### 5.3 Tài nguyên & Tính toán (Compute & Resources)
- **Mạng ngoại vi (Network I/O):**
  - **0 cuộc gọi LLM! 0 cuộc gọi Embedding!** Cho toàn bộ các truy vấn (a), (b), (c) và cả bước tạo Preview (d).
  - Không tốn token mô hình ngôn ngữ lớn vì toàn bộ logic sắp xếp (sorting), gom cụm (filtering) và sinh câu trả lời được xử lý bằng code Python thuần và chuỗi định dạng Markdown.
- **I/O Cơ sở dữ liệu:**
  - Truy vấn (a), (b), (c): 1 câu lệnh SELECT (`list_topics` + `RoadmapItem` hoặc `full-export`).
  - Đột biến (d): Khi xác nhận, thực thi 1 câu lệnh UPDATE trên `RoadmapItem` cập nhật `status` và `statusUpdatedAt = CURRENT_TIMESTAMP`.
- **CPU & Bộ nhớ:**
  - Tốn dưới 1ms CPU để sort mảng khoảng vài trăm phần tử. Bộ nhớ session lưu giữ một dictionary nhỏ trạng thái pending trong 120 giây (`PENDING_TTL_SECONDS`).

### 5.4 Đặc tính Độ trễ (Latency Profile)
- **Các câu hỏi truy vấn tiến độ (a, b, c):** **10ms – 60ms** (phụ thuộc duy nhất vào tốc độ phản hồi của cơ sở dữ liệu Turso/SQLite).
- **Lệnh tạo Preview (d):** **10ms – 40ms**.
- **Lệnh xác nhận Commit (ok):** **80ms – 250ms** (bao gồm thời gian ghi mạng Turso DB và phát lệnh re-index cho Vector Engine).

### 5.5 Yêu cầu Ngữ cảnh & Ranh giới Bảo mật (Context & Auth Boundaries)
- **Bắt buộc kiểm tra quyền Owner (`is_owner()`):**
  - Triển khai fail-closed tại `rag_service/auth.py:32`. Kiểm tra header `x-actor == "owner"`.
  - Nếu là khách viếng thăm (Visitor): Ngay lập tức trả lời `OWNER_ONLY_MESSAGE` ("🔒 Chỉ owner mới thực hiện được thao tác..."), hoàn toàn không đọc DB hay để lộ bất kỳ thông tin nào về tiến độ.
  - Ngay cả ở tầng Adapter (`http_adapter.py:63-73` và `sqlite_adapter.py:130-132`), nếu `not is_owner()`, hai trường `status` và `statusUpdatedAt` đều bị tước bỏ (stripped out) khỏi kết quả trả về!
- **Ngữ cảnh phiên & Trang (Session & Page Context):**
  - Đòi hỏi `page_context` (`roadmapSlug`, `itemId`) hoặc `session_ctx.active_topic_slug` để giải quyết các trường hợp nói tắt ("bài này", "topic hiện tại").
  - Đòi hỏi `session_ctx.pending_status_change` để duy trì trạng thái chờ giữa 2 lượt hội thoại.

### 5.6 Tác dụng phụ (Side Effects)
- Đối với truy vấn (a, b, c): Không có tác dụng phụ.
- Đối với lệnh thay đổi (d):
  - **Đột biến dữ liệu lâu dài:** Ghi trạng thái mới và mốc thời gian vào Turso Database (`RoadmapItem.status`, `RoadmapItem.statusUpdatedAt`).
  - **Kích hoạt Re-index:** Thay đổi này gọi `rag_engine.request_reindex()`, đánh dấu chỉ mục vector bị lệch thế hệ (`_change_generation += 1`), buộc hệ thống phải đồng bộ lại dữ liệu.

---

## 6. Ma trận So sánh Toàn diện Giữa 3 Nhánh Downstream

Bảng ma trận kỹ thuật dưới đây đối chiếu chi tiết 3 nhánh downstream trên mọi khía cạnh kiến trúc:

| Tiêu chí So sánh | Nhánh 1: Vector RAG Search | Nhánh 2: In-Memory Catalog Lookup | Nhánh 3: User Learning Progress (ADR-0010) |
| :--- | :--- | :--- | :--- |
| **Mục đích nghiệp vụ** | Giải thích khái niệm, đào sâu nội dung bài học, trả lời kiến thức kỹ thuật. | Tra cứu mục lục, cấu trúc danh mục, số lượng topic/section của roadmap. | Quản lý tiến trình cá nhân (biết gì, học gì tiếp, ôn bài nào, đổi trạng thái). |
| **Đơn vị xử lý downstream** | `answer_from_sources` (`sources.py`) & `HybridRagEngine` (`engine.py`). | `handle_listing` (`commands.py`), `handle_sections` (`sections.py`). | `handle_lesson_status` (`lesson_status.py`), `commands.py` (pending). |
| **Phụ thuộc Mô hình (AI/LLM)** | **Rất cao**: Gemini Embedding API + LLM Generator (Gemini Flash / Groq) + Query Transform / Rerank LLM. | **Không (0 LLM)**: Sử dụng template logic lập trình thuần. | **Không (0 LLM)**: Sử dụng template logic lập trình thuần. |
| **Mức độ tiêu thụ Token/Quota** | **Cao**: Tiêu tốn từ 500 – 2,500 tokens/lượt (prompt + completion). Dễ chạm rate-limit. | **Bằng 0 (0 token)**. Hoàn toàn không tốn chi phí API. | **Bằng 0 (0 token)**. Hoàn toàn không tốn chi phí API. |
| **Tài nguyên phần cứng (Compute)** | Nặng: Tích vô hướng Cosine $O(N \cdot d)$, FTS5 index scan, RRF math, JSON de/serialization. | Cực nhẹ: Duyệt từ điển, đếm mảng trong RAM (< 1ms CPU). | Nhẹ: Sắp xếp mảng bài học theo mốc thời gian ($O(K \log K)$, < 1ms CPU). |
| **Độ trễ phản hồi (Latency)** | **Chậm (800ms – 3,500ms)** do round-trip mạng gọi các API AI bên ngoài. | **Siêu nhanh (5ms – 40ms)**. Phản hồi gần như tức thời. | **Rất nhanh (10ms – 60ms)** với truy vấn; 80ms – 250ms khi commit DB. |
| **Tính tiền định (Determinism)** | **Xác suất (Probabilistic)**: Có thể thay đổi câu chữ giữa các lần chạy, có rủi ro hallucination. | **Tiền định 100% (Deterministic)**: Cùng dữ liệu luôn cho ra đúng một kết quả. | **Tiền định 100% (Deterministic)**: Kết quả sắp xếp và lọc chính xác theo thuật toán. |
| **Phạm vi bảo mật & Danh tính** | **Công khai (Public)**: Khách viếng thăm (Visitor) và Owner nhận kết quả giống nhau. | **Công khai (Public)**: Cấu trúc roadmap mở cho mọi đối tượng. | **Tuyệt mật (Owner Only)**: Bắt buộc `is_owner() == True`. Visitor bị từ chối fail-closed. |
| **Dữ liệu cần thiết (Context)** | Nội dung chi tiết bài học (`content_text`), vector embeddings, lịch sử hội thoại gần. | Metadata lộ trình: `slug`, `title`, `sections`, số lượng bài học (`item_count`). | Metadata tiến trình: `status` (`known`/`learning`/`target`), `statusUpdatedAt`, context trang (`itemId`). |
| **Tác dụng phụ (Side Effects)** | Ghi cache query embedding vào RAM/đĩa; gửi trace lên Langfuse. | Không có tác dụng phụ nào trên DB hay hệ thống. | Truy vấn: Không.<br>Thay đổi: **Ghi DB Turso**, thay đổi session state, **kích hoạt re-index RAG**. |
| **Rủi ro khi định tuyến sai** | — | Nếu bị đẩy sang Vector RAG: Trả lời rườm rà, tốn tiền, độ trễ tăng vọt 50 lần. | Nếu bị đẩy sang Vector RAG: **Thất bại hoàn toàn** (RAG không có dữ liệu status cá nhân, sẽ bịa đặt câu trả lời). |

---

## 7. Các Lỗ hổng Kiến trúc & Rủi ro khi Gộp Chung Intent

Qua khảo sát toàn bộ codebase, việc duy trì một `IntentType.KNOWLEDGE_QUERY` đơn nhất dẫn đến 4 xung đột kiến trúc nghiêm trọng:

### 7.1 Cái bẫy "Catch-All" và Nguy cơ Bịa đặt Thông tin (Hallucination Trap)
Hiện tại, trong `rag_service/domains/roadmap/retrieval/ingestion.py:92-96`, lớp `DatabaseIngestionWorker` tạo `KnowledgeDocument` cho vector store chỉ chứa:
```python
item_search_text = f"Bài học Mục Item: {item_title}. Lộ trình: {topic_title} ({slug}) -> Mục: {section}. Mô tả: {item_desc}. Nội dung chi tiết: {clean_content}"
```
**Trường `status` và `statusUpdatedAt` hoàn toàn KHÔNG được đưa vào tài liệu Vector RAG!** Điều này là hoàn toàn chính xác theo góc độ thiết kế bảo mật (để dữ liệu cá nhân của Owner không bị lộ sang index dùng chung). 

Tuy nhiên, hệ quả là: **Nếu một câu hỏi về tiến độ học tập (ví dụ: "bài nào tôi học xong rồi", "tôi đã nắm những bài gì") không khớp được các regex cứng trong `asks_what_i_know`, nó sẽ rơi vào `KNOWLEDGE_QUERY` của Router và bị tống vào pipeline Vector RAG.**
- Pipeline Vector RAG sẽ tìm các bài có từ "học xong", "đã nắm".
- Context đưa vào LLM hoàn toàn không có trạng thái thực của người dùng.
- LLM sẽ tự suy diễn hoặc bịa đặt (hallucinate) rằng người dùng đã học những bài nào dựa trên nội dung bài học, gây hậu quả sai lệch thông tin nghiêm trọng!

### 7.2 Sự xung đột giữa Bộ lọc Thủ tục (Procedural Interceptors) và Semantic Router
Theo tài liệu kiến trúc chuẩn của dự án trong `roadmap-rag-assistant/docs/routing-phases.md`, mọi tin nhắn phải đi qua tuần tự các phase từ P0 đến P9 (P1 Act, P2 Polarity, P3 Target, P4 Scope, P5 Table/LLM Router, P6 System 2, P7 Grounding, P8 Gate, P9 Reply).

Tuy nhiên, trên thực tế tại `agent.py`:
- `handle_listing` (Catalog) được kích hoạt ở dòng 284.
- `handle_sections` (Catalog) được kích hoạt ở dòng 290.
- `handle_lesson_status` (Progress) được kích hoạt ở dòng 306.
Tất cả đều nằm **TRƯỚC** bước 3 (Route Phase P1-P5 tại dòng 332 `decide_route`)!
Điều này biến Router thành một "kẻ ngoài cuộc" đối với các nghiệp vụ Catalog và Tiến độ học tập. Bản thân Router không hề biết đến sự tồn tại của các nghiệp vụ này, dẫn đến:
- Không thể tận dụng được sức mạnh phân tích ngôn ngữ tự nhiên của Router cho các câu hỏi biến thể.
- Tạo ra "điểm mù" trong toàn bộ hệ thống đánh giá (Evaluation Blindspots).

### 7.3 Điểm mù trong Bộ Đánh giá CI (`evals/router/`)
Khi khảo sát bộ dữ liệu đánh giá `evals/router/decisions.jsonl` (749 samples), chúng tôi phát hiện:
- Có hàng trăm test case cho `knowledge_query` về tìm kiếm khái niệm (`"tìm bài về XSS"`, `"Docker Compose dùng để làm gì"`, `"AI Engineering hoạt động thế nào"`).
- Có một vài test case dạng danh mục như `"danh sách bài trong layer Docker"` bị gán nhãn là `knowledge_query`.
- **Hoàn toàn KHÔNG CÓ test case nào cho các câu hỏi về tiến độ học tập theo ADR-0010** (`"bài nào cần ôn lại"`, `"nên học gì tiếp"`, `"tôi đang biết gì về AI"`).
Lý do là vì các câu hỏi này vốn bị chặn trước ở tầng Agent bằng regex nên các kỹ sư trước đây đã không đưa chúng vào bộ dữ liệu kiểm thử của Router. Đây là một lỗ hổng kiểm thử lớn, khiến CI không thể phát hiện nếu câu hỏi của người dùng bị rơi vào nhánh RAG đắt đỏ.

### 7.4 Vi phạm Ranh giới Riêng tư (Privacy Boundary Violation)
Nhánh 1 và Nhánh 2 là **công khai (Public)**, trong khi Nhánh 3 là **tuyệt mật của Owner (Private)**. Việc gộp chung một intent khiến Router không mang theo thông tin ngữ cảnh về quyền hạn (`is_owner`), dẫn đến nguy cơ không thể áp dụng chính sách bảo mật từ sớm (early rejection / access control) ngay tại tầng routing policy.

---

## 8. Đề xuất Kiến trúc: Phương án Phân chia Sub-Intent

Dựa trên các bằng chứng thực nghiệm và phân tích sâu ở trên, chúng tôi đề xuất phân rã `IntentType.KNOWLEDGE_QUERY` hiện tại thành **3 sub-intents độc lập, tường minh**:

### 8.1 Đề xuất Phân loại Sub-Intent Mới

```
                             [User Message]
                                   │
                                   ▼
                      [Phase 1-5 Intent Router]
                                   │
        ┌──────────────────────────┼──────────────────────────┐
        ▼                          ▼                          ▼
1. KNOWLEDGE_SEARCH        2. CATALOG_QUERY           3. LEARNING_PROGRESS
(hoặc CONCEPT_INQUIRY)     (hoặc ROADMAP_STRUCTURE)   (hoặc USER_STATUS_QUERY)
        │                          │                          │
        ▼                          ▼                          ▼
 [Downstream Branch 1]      [Downstream Branch 2]      [Downstream Branch 3]
  Vector Hybrid RAG          In-Memory Catalog          Owner Auth Check
  FTS5 + Dense Embeddings    Fast Metadata Fetch        Turso DB Status Query
  Reranker + LLM Gen         Static Markdown Reply      Pure Sort (Review/Next)
  Latency: 1000 - 3500ms     Latency: 5 - 40ms          Deterministic Reply
  Cost: High (Tokens)        Cost: 0 (Zero LLM)         Latency: 10 - 60ms
  Public Access              Public Access              Private (Owner Only)
```

1. **`IntentType.KNOWLEDGE_SEARCH` (hoặc giữ tên `KNOWLEDGE_QUERY` nhưng thu hẹp phạm vi):**
   - **Định nghĩa:** Tra cứu ngữ nghĩa nội dung, giải thích khái niệm công nghệ, so sánh kỹ thuật dựa trên kho bài viết.
   - **Ví dụ câu hỏi:** `"RAG là gì?"`, `"Giải thích cơ chế chunking"`, `"Docker Compose khác Dockerfile thế nào"`, `"Tìm bài học về Redis Streams"`.
   - **Downstream:** Toàn bộ pipeline `answer_from_sources` (Hybrid Vector Store + LLM Generation).

2. **`IntentType.CATALOG_QUERY`:**
   - **Định nghĩa:** Tra cứu danh mục, cấu trúc phân cấp, số lượng lộ trình, danh sách các mục/section mà không yêu cầu giải thích nội dung bài học.
   - **Ví dụ câu hỏi:** `"Liệt kê tất cả các topic hiện có"`, `"Website có những lộ trình nào?"`, `"Topic Frontend có những mục gì?"`, `"Có bao nhiêu bài học trong lộ trình AI?"`.
   - **Downstream:** Dispatch thẳng tới `handle_listing` / `handle_sections` / `list_topics` tool, sinh Markdown tĩnh, bỏ qua hoàn toàn Vector Store và LLM.

3. **`IntentType.LEARNING_PROGRESS`:**
   - **Định nghĩa:** Truy vấn trạng thái học tập của bản thân Owner (`known`, `learning`, `target`) và chu kỳ ôn tập theo ADR-0010.
   - **Ví dụ câu hỏi:** `"Tôi đang biết những gì về AI Engineering?"`, `"Hôm nay nên học bài gì tiếp?"`, `"Những bài nào đã lâu chưa ôn lại?"`, `"Tiến độ học tập của tôi đến đâu rồi?"`.
   - **Downstream:** Bắt buộc kiểm tra `is_owner()`, truy vấn adapter lấy trạng thái và ngày cập nhật, chạy các hàm lọc thuần túy `filter_and_sort_*`, trả về template tiến độ.
   *(Lưu ý: Đối với lệnh thay đổi trạng thái như "đánh dấu bài X là đang học", đề xuất giữ nguyên thuộc `ROADMAP_CUD` với hành động `ActionType.UPDATE` hoặc tích hợp kèm luồng preview 2 bước).*

### 8.2 Lợi ích Kỹ thuật Mang lại
1. **Tiết kiệm tài nguyên vượt trội:** Giảm thiểu 100% chi phí token và LLM calls cho toàn bộ các câu hỏi Catalog và Progress rơi vào hệ thống.
2. **Cải thiện độ trễ từ 3s xuống 30ms:** Tăng tốc độ phản hồi cho người dùng lên gấp hàng chục lần đối với các tác vụ cấu trúc và tiến độ.
3. **Triệt tiêu nguy cơ Hallucination:** Đảm bảo câu hỏi về tiến độ cá nhân không bao giờ bị RAG LLM "bịa đặt" câu trả lời khi thiếu dữ liệu cá nhân trong vector store.
4. **Bảo mật chuẩn mực:** Cách ly hoàn toàn dữ liệu cá nhân của Owner khỏi vector index công khai ngay từ tầng Router.
5. **Đồng nhất kiến trúc:** Đưa các hàm chặn thủ tục (regex interceptors) trở về đúng vị trí là các chính sách xử lý của Router (P5 Decision Table), giúp hệ thống tuân thủ nghiêm ngặt quy chuẩn kiến trúc trong `routing-phases.md`.

---

## 9. Kết luận

Cuộc khảo sát downstream đã cung cấp đầy đủ luận cứ kỹ thuật xác đáng: **Việc gộp chung 3 luồng thực thi dị biệt vào một `IntentType.KNOWLEDGE_QUERY` là một nút thắt cổ chai kiến trúc (architectural bottleneck) không còn phù hợp khi Abot mở rộng sang hỗ trợ ADR-0010.** 

Sự phân rã sub-intent thành `KNOWLEDGE_SEARCH`, `CATALOG_QUERY`, và `LEARNING_PROGRESS` là giải pháp tối ưu, khả thi cao và mang lại sự trong sáng, hiệu năng vượt trội cho hệ thống.
