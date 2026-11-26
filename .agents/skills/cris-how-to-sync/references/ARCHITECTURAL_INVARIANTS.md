# Cẩm Nang Tra Cứu Bất Biến & Đồng Bộ Kiến Trúc (`cris-how-to-sync`)

Tài liệu tham chiếu chuẩn cho skill `cris-how-to-sync` khi đánh giá tính tương thích, xung đột và hiệu ứng đồng bộ của bất kỳ Target nào đối với repo `crisne-website`.

---

## 1. Bảng ADRs (ADR-0001..ADR-0019) & Các Bất Biến Cấm Vi Phạm

| ADR | Trọng tâm | Bất biến bắt buộc | Dấu hiệu vi phạm (Anti-pattern) |
| :--- | :--- | :--- | :--- |
| **ADR-0001** | Microservice Python | Toàn bộ logic AI Reasoning, Langfuse prompt generation, P0-P8 Intent Routing, Vector Search nằm ở Python FastAPI (`roadmap-rag-assistant`). Next.js chỉ là Web App & BFF. | Viết LLM prompt orchestration hoặc AI agent workflow trực tiếp trong Next.js route handler. |
| **ADR-0002** | Gateway Proxy & Phân quyền Actor | Chỉ duy nhất một đường gọi máy chủ Python qua proxy Next.js: `/api/roadmap-assistant/[...path]`. Phân quyền Actor chặt chẽ: `Owner` (được ghi, email xác thực) vs `Visitor` (chỉ đọc & hỏi đáp). | Gọi trực tiếp port 8000 từ trình duyệt (bypass proxy); cấp quyền CUD cho Visitor; thiếu check `requireWriteAccess`. |
| **ADR-0003** | Langfuse Feedback & Golden Set | Langfuse là nguồn sự thật duy nhất giữ Feedback (thumbs up/down) và tập Golden Set đánh giá RAG. | Tự tạo bảng riêng trong DB để lưu feedback mà không push lên Langfuse, hoặc bỏ qua trace logging. |
| **ADR-0004** | Embedding Model Duy nhất | Toàn bộ vector embeddings bắt buộc dùng Google Gemini `text-embedding-004` (768 dimensions). | Dùng OpenAI `text-embedding-3-small`, Cohere, HuggingFace, hoặc embedding model khác gây lệch chiều vector space. |
| **ADR-0005** | Production DB là Turso | Database production sử dụng Turso (libSQL/SQLite distributed). Mọi migration và query phải tương thích SQLite dialect. | Sử dụng các tính năng riêng của Postgres/MySQL (e.g. JSONB query nâng cao, enum kiểu native Postgres mà SQLite không hỗ trợ). |
| **ADR-0006** | In-Memory Vector Search | Hệ thống RAG của Abot dùng in-memory vector store (numpy cosine similarity + BM25 FTS) nạp khi khởi động. Không dùng external vector database. | Cài đặt Pinecone, Qdrant, Weaviate, Milvus, ChromaDB. |
| **ADR-0007** | Đồng nghĩa trong Glossary | Thuật ngữ đồng nghĩa hợp lệ khai báo qua `_Also_` trong `GLOSSARY.md`. Code mới đặt theo tên đang có trong codebase (ví dụ `RoadmapItem`). | Bắt lỗi tùy tiện khi dùng từ đồng nghĩa hợp lệ; đổi tên file/biến lệch với pattern codebase đang chạy. |
| **ADR-0008** | Superseded | Đã bị thay thế bởi ADR-0009. Không áp dụng. | |
| **ADR-0009** | Topic chứa Lesson theo Section | Topic chứa Lesson trực tiếp. Section là chuỗi tự do (string) gom bài tùy chọn, so khớp không phân biệt hoa thường. Không có phân cấp sâu. | Đưa lại khái niệm Level, Group, Category, Module, Layer vào cấu trúc bài học. |
| **ADR-0010** | Trạng thái bài học (Lesson Status) | Lesson Status gồm 3 giá trị duy nhất: `target` (muốn học), `learning` (đang học), `known` (đã nắm). Chỉ phản ánh tiến trình của Owner, ẩn hoàn toàn với Visitor. Chỉ đổi `status`/`markReviewed` không kích hoạt RAG reindex. | Thêm status khác (`completed`, `mastered`, `dropped`); hiển thị status badge cho Visitor. |
| **ADR-0011** | Bỏ Knowledge Triage | Đã bỏ Knowledge Triage; Langfuse vẫn giữ Feedback (`Cris AI` 👍/👎 ở portfolio) và Golden Set. Abot giữ tắt `onFeedback`, chỉ hiển thị nút `ID` copy Langfuse `traceId` cho `Owner`. | Khôi phục Knowledge Triage hoặc xóa luồng 👍/👎 của Cris AI (`app/api/chat/feedback/route.ts`). |
| **ADR-0012** | Thread State của Owner ở Turso | Lịch sử và ngữ cảnh `Topic`/`Lesson` của `Thread` `Owner` lưu ở Turso (`ThreadState`, `ThreadMessage` schema tối giản); `Thread` `Visitor` và mọi `Pending Action` (`PENDING_TTL_SECONDS = 600s`) chỉ nằm trong RAM. | Lưu `Pending Action` xuống DB, lưu lịch sử `Visitor` bền, hoặc lưu lịch sử `Owner` vào `localStorage`. |
| **ADR-0013** | Superseded by ADR-0014 | URL bài học phẳng `/lessons/[lessonSlug]` (đã thay thế bởi ADR-0014; phần `RoadmapItem.slug` duy nhất toàn cục và `SlugRedirect` vẫn giữ). | Bỏ `SlugRedirect` hoặc cho phép trùng `RoadmapItem.slug` giữa các `Topic`. |
| **ADR-0014** | Topic-Scoped URLs & Anchors | Topic ở `/[topicSlug]`, Lesson ở `/[topicSlug]/[lessonSlug]#[headingSlug]`. Slug Topic không được trùng route gốc (`lib/roadmap/paths.ts`); URL cũ chuyển hướng 308. | Đặt slug Topic trùng route hệ thống (`/news`, `/login`, `/share`, ...). |
| **ADR-0015** | Abot Owner Memory | `Owner Memory` lưu ở Turso (5 `kind`: `profile`, `techstack`, `goal`, `preference`, `learning_note`, <= 300 ký tự, `pending <= 10`). Cách ly hoàn toàn với `Visitor`. Ghi/xóa qua chat qua `Preview -> ok`; gợi ý tự động chỉ vào `pending`; `<owner_memory>` không rò rỉ vào Lesson draft. | Để `Visitor` đọc/ghi `OwnerMemory`, tự kích hoạt memory thành `active`, hoặc nhồi `<owner_memory>` thành chỉ dẫn hệ thống. |
| **ADR-0016** | News Ingest Worker Độc lập | `news-ingest-worker` là service Python riêng chỉ trích xuất và tóm tắt từng `NewsItem`; mọi đối chiếu với `Lesson` (`match-lessons`) thuộc Abot. Hai service không gọi trực tiếp nhau. | Cho `news-ingest-worker` gọi trực tiếp Abot hoặc ghép logic RAG vào `news-ingest-worker`. |
| **ADR-0017** | Statement Provenance (Owner-only) | Nguồn từ `NewsItem` gắn theo từng câu bằng marker rỗng `<span data-provenance-ref="<uuid>">` + `KnowledgeProvenance`. Chỉ `Owner` thấy (nạp client-side), không vào SSR/`full-export`/index Abot. Concept promotion từ chat không tạo Provenance. | Nhúng URL nguồn vào HTML bài học, lộ cho `Visitor`, hoặc tạo `KnowledgeProvenance` từ chat. |
| **ADR-0018** | Superseded by ADR-0019 | Từng mở Public News; đã thay thế hoàn toàn bởi ADR-0019. | Dùng lại `isPublic`/`publicAt` để mở trang công khai không qua ADR mới. |
| **ADR-0019** | Owner-Only Site, Bỏ Public News | Middleware bắt đăng nhập mọi trang trừ `/login` và technical endpoints (`/feed-ingestion` redirect `/news`); vì middleware cho qua request có header key, mọi route `/api/*` riêng tư tự kiểm `requireWriteAccess`. WebMCP giữ read-only và chỉ đăng ký khi `canWrite === true`. | Cấp WebMCP write tools cho `Visitor` / thực thi CUD không qua `Preview -> ok`, hoặc bỏ `requireWriteAccess` trong API route. |

---

## 2. Bảng Tra Cứu Từ Ngữ Cấm (`_Avoid_`) Từ `GLOSSARY.md`

| Nhóm Domain | Thuật ngữ Chuẩn Nên Dùng | Từ đồng nghĩa hợp lệ (`_Also_`) | ❌ TỪ BỊ CẤM (`_Avoid_`) |
| :--- | :--- | :--- | :--- |
| **Roadmap** | `Topic` | Roadmap | `course`, `lộ trình con` |
| **Roadmap** | `Section` | mục | `layer`, `group`, `category`, `module`, `domain`, `level` |
| **Roadmap** | `Lesson` | Item, `RoadmapItem` | `knowledge node`, `bài viết` |
| **Roadmap** | `Lesson Status` | trạng thái bài, `target`, `learning`, `known` | `level`, `progress`, `mastery` |
| **Assistant** | `Roadmap Assistant` (Abot) | Abot | `RAG bot`, `roadmap chatbot` |
| **Assistant** | `Actor` | | `role` (thuật ngữ riêng của API Docs), `user type` |
| **Assistant** | `Owner` | | `admin`, `author` |
| **Assistant** | `Visitor` | | `guest`, `anonymous`, `user` |
| **Assistant** | `Thread` | | `session`, `conversation` |
| **Assistant** | `Change` | CUD | `write`, `mutation` |
| **Assistant** | `Preview` | | `confirm card`, `pending card` |
| **Assistant** | `Pending Action` | | `queued action` |
| **Notes** | `Note` | | `bookmark`, `post` |
| **Notes** | `Tag` | | `label`, `category` |
| **Notes** | `Favorite` | | `bookmark`, `star` |
| **Workflows** | `Project` | | `workspace` |
| **Workflows** | `Document` | | `file`, `attachment`, `KB doc` |
| **Workflows** | `Workflow` | | `flow`, `pipeline`, `graph` |
| **Workflows** | `Node` | | `step`, `block` |
| **Workflows** | `Run` | | `execution`, `job` |

---

## 3. Ma Trận Hiệu Ứng Đồng Bộ (Sync Effects Checklist)

Khi một Target được chấp thuận (hoặc cần cải thiện), hãy đối chiếu checklist 6 tầng:

```markdown
- [ ] 1. Core Docs Sync
      - GLOSSARY.md: Nếu target đưa vào từ vựng nghiệp vụ mới -> Thêm định nghĩa, _Also_, _Avoid_.
      - docs/adr/: Nếu thay đổi kiến trúc khó đảo ngược -> Soạn thảo ADR mới.
- [ ] 2. Dual-Service Sync
      - Next.js (BFF / Gateway): Cập nhật proxy route, server action, DTO mapping.
      - Python Microservice: Cập nhật route FastAPI, schemas Pydantic, Intent Router P0-P8.
- [ ] 3. Data & Migration Sync
      - prisma/schema.prisma: Thêm model, field, quan hệ.
      - scripts/push-turso-schema.ts hoặc yarn db:push: Đồng bộ lên Turso database.
      - scripts/export-test-schema.ts: Export schema cho test suites.
- [ ] 4. RAG & Vector Index Sync
      - Hook `after(notifyRoadmapChanged)`: gọi khi thay đổi Topic/Lesson/Section để Python reload in-memory store (riêng `status`/`markReviewed` và `OwnerMemory` dùng `notifyOwnerMemoryChanged`, không RAG reindex).
      - scripts/index-knowledge.ts / `yarn check:knowledge-index`: kiểm tra tính sẵn sàng của embeddings.
- [ ] 5. Observability & Feedback Sync
      - Langfuse: Gắn thẻ metadata, trace ID (`traceId`), generation span (`feedback` giữ cho Cris AI; Abot giữ nút copy `ID`).
- [ ] 6. Code Intelligence Dataset Sync (cris-code-intel)
      - .agents/skills/cris-code-intel/data/cris-workspace-map.json: Cập nhật entryPoints, executionFlows, dataModels, symbols.
      - docs/code-intel/CRIS_WORKSPACE_MAP.md: Cập nhật bản đồ markdown.
      - `yarn intel status`: Đảm bảo trạng thái báo `🟢 OK`.
```
