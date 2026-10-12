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
