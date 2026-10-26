# Roadmap RAG Assistant

Mini RAG service cho phép CUD (Create / Update / Delete) các entity Roadmap qua ngôn ngữ tự nhiên.

## Architecture

```
User Prompt ("tạo cho tôi 3 topic A, B và C")
    ↓
FastAPI Server (:8000)
    ↓
LangChain Agent (Gemini / GPT / Ollama)
    ↓
CUD Tools (14 tools for Topic/Layer/Group/Item)
    ↓
Adapter (HTTP → Next.js API  |  SQLite → prisma/dev.db)
    ↓
Database (SQLite / Turso)
```

## Nguồn dữ liệu (đọc trước khi debug)

Có hai nguồn khác nhau, và chúng có thể không chứa cùng một nội dung:

| Dùng cho | Nguồn | Ghi chú |
|---|---|---|
| RAG server khi `RAG_ADAPTER_MODE=http` | Next.js API (`NEXTJS_API_BASE_URL`), tức là database Next.js đang dùng (Turso khi có `TURSO_*`) | Đây là dữ liệu UI và chatbot thấy |
| Evals, corpus export, `RAG_ADAPTER_MODE=sqlite` | `prisma/dev.db` | Corpus tĩnh `evals/corpus` được export từ đây |

Dòng khởi động của server in nguồn đang dùng. Mỗi lượt chat in một dòng `[turn]` với intent, mode, fallback và tool, để tìm được hội thoại trong log mà không cần ảnh chụp màn hình.

Chạy server có tự reload khi sửa code: `yarn rag:dev` (từ thư mục gốc).

## Quick Start

### 1. Setup

```bash
cd roadmap-rag-assistant

# Create virtualenv and install deps
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"

# Configure environment
cp .env.example .env
# Edit .env — set GEMINI_API_KEY
```

### 2. Start Server

```bash
# Mode HTTP (requires Next.js running on :3000)
RAG_ADAPTER_MODE=http uvicorn rag_service.api.server:app --reload --port 8000

# Mode SQLite (direct DB, no Next.js needed)
RAG_ADAPTER_MODE=sqlite uvicorn rag_service.api.server:app --reload --port 8000
```

### 3. Use CLI Chat

```bash
python -m sdk.python.cli
# 👤 > tạo cho tôi 3 topic A, B và C
# 🔧 create_topics_batch
#    → ✅ Đã tạo 3 topic: A, B, C
# 🤖 Đã tạo thành công 3 topic...
```

### 4. Use Python SDK

```python
from roadmap_sdk import RoadmapAssistantClient

client = RoadmapAssistantClient(base_url="http://localhost:8000")
response = client.chat("tạo cho tôi 3 topic A, B và C")
print(response.message)
for tc in response.tool_calls:
    print(f"  🔧 {tc.name} → {tc.result}")
```

### 5. Use TypeScript SDK (Next.js)

```typescript
import { RoadmapChatClient } from '@/roadmap-rag-assistant/sdk/typescript/src';

const client = new RoadmapChatClient({ baseUrl: 'http://localhost:8000' });
const response = await client.chat('tạo cho tôi 3 topic A, B và C');
console.log(response.message);
```

## Available Tools (14)

| Category | Tool | Description |
|----------|------|-------------|
| Topic | `create_topic` | Tạo 1 topic mới |
| Topic | `create_topics_batch` | Tạo nhiều topic cùng lúc |
| Topic | `list_topics` | Liệt kê tất cả topic |
| Topic | `delete_topic` | Xóa topic theo slug |
| Layer | `create_layer` | Tạo layer trong topic |
| Layer | `update_layer` | Cập nhật layer |
| Layer | `delete_layer` | Xóa layer |
| Group | `create_group` | Tạo group trong layer |
| Group | `update_group` | Đổi tên group |
| Group | `delete_group` | Xóa group |
| Item | `create_item` | Tạo 1 item |
| Item | `create_items_batch` | Tạo nhiều item cùng lúc |
| Item | `update_item` | Cập nhật/di chuyển item |
| Item | `delete_item` | Xóa item |

## SSE Events (`POST /chat/stream`)

| Event | Data |
|-------|------|
| `token` | `{"delta": "..."}` — a piece of the answer |
| `tool_start` / `tool_end` | `{"name", "args"}` / `{"name", "result"}` |
| `step` | One step of the turn's timeline (below) |
| `done` | `{"message", "tool_calls", "steps", "metadata"?}` — `steps` holds the final state of every step; `metadata.sources` lists the sources (below) |
| `error` | `{"error": "..."}` |

`step` events share an `id` per step: a `running` event, then `done` (with `duration_ms`) or `error`.
Kinds: `routing` → `retrieval` → `tool` → `generation` → `guard`. Clients that ignore unknown
events keep working. Full field list and owner-only fields: `rag_service/steps.py`.

```text
event: step
data: {"id": "retrieve", "kind": "retrieval", "status": "done", "duration_ms": 412, "count": 1,
       "detail": "1 tài liệu", "items": [{"title": "Vector Database", "type": "item", "topic": "ai", "href": "/?topic=ai"}]}
```

## Nguồn của câu trả lời (khi nào hiện dải "Nguồn")

Prompt yêu cầu model không chèn link, id tài liệu hay dòng "Nguồn:" vào câu trả lời. Nguồn đi riêng trong `done.metadata.sources`,
và UI hiện một dải "Nguồn" duy nhất ở cuối câu trả lời. Quy tắc nằm ở `metadata_event`
(`rag_service/core/generation/delivery.py`).

| # | Trường hợp | Route / `answer.mode` | Dải "Nguồn" |
|---|---|---|---|
| 1 | Câu hỏi kiến thức, câu trả lời nhắc tới bài đã truy xuất | `knowledge_query` / `llm` | **Có**: bài được nhắc tên, tối đa 3 |
| 2 | Câu hỏi kiến thức, câu trả lời không nhắc bài nào | `knowledge_query` / `llm` | Không |
| 3 | LLM lỗi, chưa cấu hình, hoặc grounding không đạt | `knowledge_query` / `context` | Không: nội dung đã là danh sách bài có link |
| 4 | Không có bài nào khớp | `knowledge_query` / `no_match` | Không |
| 5 | Lỗi truy xuất | `knowledge_query` | Không |
| 6 | Chào hỏi, hỏi về trợ lý, hỏi lại điều đã nói | `chitchat` | Không |
| 7 | Ngoài phạm vi roadmap | `out_of_scope` | Không |
| 8 | Tạo, sửa, xoá topic/layer/group/item | `roadmap_cud` | Không: kết quả là thao tác, không phải tri thức |
| 9 | `/plan`, `/goal` | `plan_goal` | Không |

## Run Tests

```bash
PYTHONPATH=. pytest tests/ -v
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `GEMINI_API_KEY` | (required) | Google Gemini API key |
| `LLM_MODEL` | `gemini-2.0-flash` | LLM model name |
| `LLM_PROVIDER` | `google_genai` | LangChain model provider |
| `RAG_ADAPTER_MODE` | `http` | `http` or `sqlite` |
| `NEXTJS_API_BASE_URL` | `http://localhost:3000` | Next.js API URL |
| `SQLITE_DB_PATH` | `../prisma/dev.db` | SQLite database path |
| `RAG_QUERY_TRANSFORM` | `false` | Viết lại câu hỏi tham chiếu lịch sử ("bài đó") bằng LLM trước khi tìm. Chỉ gọi LLM khi câu có tham chiếu và có lịch sử |
| `RAG_HISTORY_DB` | (trống: RAM) | File SQLite lưu hội thoại, ví dụ `data/history.db`. Đặt ở local để trace lại được một thread |
| `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` | (trống: tắt) | Bật trace từng bước (retrieve, generation, guard) theo thread |

Mỗi lượt chat in một dòng `[turn]` gồm: `intent`, `route` (heuristic, vocabulary, llm), `queries`, `rewritten`, `retrieved` (trước cổng on-topic), `on_topic` (sau cổng), `mode`, `grounding`, `sources`. Đủ để biết lượt đó hỏng ở bước nào mà không cần replay.

## Observability: trace flags worth an alert

Each chat turn's Langfuse trace carries flags (also in the `[turn]` log line). Alert on their rate, not on
single turns:

| flag | means | suggested alert |
|---|---|---|
| `embedding_degraded` | the query could not be embedded: search ran on FTS5 only (weaker off-topic rejection) | > 5% of turns over 1 h |
| `system2_unavailable` | a write candidate got no System 2 verdict: it was previewed instead of run | > 10% of write candidates over 1 h |
| `router_llm_unavailable` | the LLM router failed or was rate limited: the turn fell back to a default intent | > 10% of turns over 1 h |
| `llm_fallback` | the answer model failed: the reply is the formatted sources | > 5% of turns over 1 h |
| `router_disagreement` | System 1 read a change that System 2 or the data did not confirm | review weekly; each is a golden-sample candidate |
| `visitor_write_attempt` | a visitor sent a change request | a spike means probing |

Keys: `GROQ_API_KEYS` and `GEMINI_API_KEYS` (comma-separated) rotate when one key is rate limited; `LLM_FALLBACK_PROVIDER`
takes over when every key of `LLM_PROVIDER` is. Live-model evals take `--max-llm-calls N` and exit 2 (INVALID) when
more than 10% of their model calls failed.
