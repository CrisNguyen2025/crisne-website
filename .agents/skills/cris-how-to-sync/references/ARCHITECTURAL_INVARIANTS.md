# Cẩm Nang Tra Cứu Bất Biến & Đồng Bộ Kiến Trúc (`cris-how-to-sync`)

Tài liệu tham chiếu chuẩn cho skill `cris-how-to-sync` khi đánh giá tính tương thích, xung đột và hiệu ứng đồng bộ của bất kỳ Target nào đối với repo `crisne-website`.

---

## 1. Bảng 10 ADRs & Các Bất Biến Cấm Vi Phạm

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
| **ADR-0010** | Trạng thái bài học (Lesson Status) | Lesson Status gồm 3 giá trị duy nhất: `target` (muốn học), `learning` (đang học), `known` (đã nắm). Chỉ phản ánh tiến trình của Owner, ẩn hoàn toàn với Visitor. | Thêm status khác (`completed`, `mastered`, `dropped`); hiển thị status badge cho Visitor. |

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
      - Hook after(requestRagReindex): Phải gọi khi thay đổi Topic/Lesson để Python reload in-memory store.
      - scripts/index-knowledge.ts: Kiểm tra tính sẵn sàng của embeddings.
- [ ] 5. Observability & Feedback Sync
      - Langfuse: Gắn thẻ metadata, trace ID, generation span.
      - Triage: Kiểm tra ảnh hưởng tới luồng Negative Feedback -> Knowledge Triage Queue.
- [ ] 6. Code Intelligence Dataset Sync (cris-code-intel)
      - .agents/skills/cris-code-intel/data/cris-workspace-map.json: Cập nhật entryPoints, executionFlows, dataModels, symbols.
      - docs/code-intel/CRIS_WORKSPACE_MAP.md: Cập nhật bản đồ markdown.
      - yarn intel status: Đảm bảo trạng thái báo 🟢 FRESH.
```
