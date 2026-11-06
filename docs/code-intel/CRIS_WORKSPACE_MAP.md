# BẢN ĐỒ KIẾN TRÚC & CẤU TRÚC XỬ LÝ LOGIC WORKSPACE CRIS (`crisne-website`)

> **Phiên bản:** 1.0.0 | **Commit:** `52a3596` | **Mô hình:** GitNexus Code Intelligence  
> **Skill đi kèm:** `.agents/skills/cris-code-intel/` | **CLI Tra cứu:** `cris-intel`

---

## 1. TỔNG QUAN KIẾN TRÚC HỆ THỐNG (HYBRID ARCHITECTURE)

Dự án `crisne-website` hoạt động theo mô hình lai (Hybrid Full-Stack) gồm hai dịch vụ chính tương tác chặt chẽ:

1. **Next.js 15+ App Router (TypeScript)**: Đóng vai trò Web UI, API Gateway, và Service Layer cho Roadmap, Notes, Storage.
2. **Python FastAPI Microservice (`roadmap-rag-assistant`)**: Đảm nhiệm AI Reasoning, Intent Routing P0-P8, Hybrid Vector Store (Gemini 768d + BM25 FTS) và sinh thẻ Preview CUD.

```mermaid
graph TB
    subgraph Browser_Client ["Trình duyệt (Browser / Client)"]
        UI_Roadmap["Roadmap UI (Topics / Lessons)"]
        UI_Lexical["Lexical Notes Editor"]
        UI_FloatingBot["Floating Chatbot (Abot)"]
    end

    subgraph NextJS_AppRouter ["Next.js Fullstack (Port 3334)"]
        subgraph Gateway_Layer ["Gateway & Auth Boundary"]
            AuthCheck["NextAuth / write-access.ts<br/>(Owner vs Visitor)"]
            Proxy_Route["Same-Origin Proxy Route<br/>/api/roadmap-assistant/[...path]"]
            API_Roadmap["/api/v1/roadmaps/*"]
            API_Triage["/api/v1/roadmaps/triage/*"]
        end

        subgraph Service_Layer ["Domain Logic & Services"]
            RoadmapService["roadmapService.ts"]
            TriageService["knowledgeTriageService.ts"]
            ReindexHook["rag-reindex.ts (after request)"]
        end

        subgraph Storage_Layer ["Persistence"]
            PrismaORM["Prisma Client"]
            SQLiteTurso[("Database (SQLite / Turso)")]
            S3R2[("Cloudflare R2 / AWS S3")]
        end
    end

    subgraph Python_Microservice ["Roadmap RAG Assistant (Python FastAPI - Port 8000)"]
        FastAPI_Server["FastAPI Router (/api/chat, /api/changes)"]
        IntentRouter["Intent Router (Phases P0-P8)"]

        subgraph AI_Engine ["AI Engines"]
            HybridRAG["Hybrid Retriever (BM25 FTS + Vector)"]
            InMemoryStore[("In-Memory Vector Store<br/>Gemini 768d")]
            CUDActions["RoadmapAgentActions (Preview Card)"]
            GeminiLLM["Google Gemini 2.5 Flash"]
        end

        LangfuseObs["Langfuse Observability & Tracing"]
    end

    %% Client calls
    UI_Roadmap --> API_Roadmap
    UI_FloatingBot --> Proxy_Route

    %% Gateway & Routing
    API_Roadmap --> RoadmapService --> PrismaORM
    API_Triage --> TriageService --> PrismaORM
    PrismaORM --> SQLiteTurso

    %% Proxying to Python
    Proxy_Route -- "Forward (Bearer + x-actor)" --> FastAPI_Server
    FastAPI_Server --> IntentRouter
    IntentRouter -- "Query Route" --> HybridRAG --> InMemoryStore
    HybridRAG --> GeminiLLM
    IntentRouter -- "Write Route (Owner)" --> CUDActions
    CUDActions -- "Callback CUD" --> API_Roadmap
    RoadmapService --> ReindexHook -- "POST /internal/reindex" --> FastAPI_Server

    %% Observability
    FastAPI_Server --> LangfuseObs
    LangfuseObs -. "Negative Feedback" .-> API_Triage
```

---

## 2. 6 DOMAINS TRỌNG YẾU (COMMUNITIES)

| ID Domain                | Tên Domain               | ADRs Quy định                                    | Trọng tâm Logic                                                                                            | Key Files                                                                                                                 |
| ------------------------ | ------------------------ | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `roadmap-learning`       | Roadmap & Learning       | ADR-0008, ADR-0009, ADR-0010                     | Quản lý Topic, Section (chuỗi tự do), Lesson, Lesson Status (`target`, `learning`, `known`)                | `lib/roadmap/*`, `logic/roadmap/roadmapService.ts`, `components/roadmap/*`, `app/api/v1/roadmaps/*`                       |
| `roadmap-assistant-abot` | Roadmap Assistant (Abot) | ADR-0001, ADR-0002, ADR-0003, ADR-0004, ADR-0006 | Trợ lý RAG AI trên Topic, proxy cùng domain, router P0-P8, in-memory vector store Gemini 768d, CUD Preview | `app/api/roadmap-assistant/*`, `roadmap-rag-assistant/rag_service/*`, `logic/roadmap/roadmapAssistantService.ts`          |
| `notes-editor`           | Notes & Lexical CMS      | N/A                                              | Lexical Editor, autosave debounce, tag taxonomy, markdown serialize                                        | `app/notes/*`, `app/api/tags/*`, `lib/notion.ts`                                                                          |
| `storage-media`          | Storage & Media          | N/A                                              | S3/R2 client, image upload                                                                                 | `app/api/upload-image/*`, `lib/r2-client.ts`                                                                               |
| `auth-security`          | Auth & Actor Model       | ADR-0002                                         | NextAuth, Actor `Owner` vs `Visitor`, `requireWriteAccess`, internal Bearer token                          | `auth.ts`, `lib/auth/*`, `hooks/use-can-write.ts`, `rag_service/auth.py`                                                  |
| `triage-observability`   | Triage & Active Learning | ADR-0003                                         | Missing Knowledge Triage queue, Langfuse 👎 vote sync, Golden set evals                                    | `app/api/v1/roadmaps/triage/*`, `logic/roadmap/knowledgeTriageService.ts`, `components/roadmap/KnowledgeTriageDrawer.tsx` |

---

## 3. BIỂU ĐỒ TRACE CÁC LUỒNG THỰC THI CỐT LÕI (EXECUTION FLOWS)

### Luồng 1: Hỏi đáp Kiến thức RAG với Abot (`FLOW_ABOT_CHAT_QUERY`)

```mermaid
sequenceDiagram
    autonumber
    actor User as Người dùng (Visitor/Owner)
    participant UI as FloatingChatDrawer.tsx
    participant Proxy as /api/roadmap-assistant/[...path]
    participant Agent as Python agent.py
    participant Router as intent_router.py (P0-P8)
    participant RAG as sources.py & vector_store.py
    participant LLM as Google Gemini 2.5 Flash
    participant Obs as Langfuse Tracing

    User->>UI: Gửi câu hỏi về Topic
    UI->>Proxy: POST /api/roadmap-assistant/chat/stream
    Proxy->>Proxy: hasWriteAccess() ➔ Gán x-actor: owner / visitor
    Proxy->>Proxy: Rate limit check (Visitor: max 30/5min)
    Proxy->>Agent: Forward với Bearer RAG_INTERNAL_KEY
    Agent->>Obs: Bắt đầu traced_turn()
    Agent->>Router: decide_route() (Phases P0-P8)
    Router-->>Agent: Intent = KNOWLEDGE_QUERY
    Agent->>RAG: search_similar(query, topic_slug)
    RAG->>RAG: Hybrid Search (BM25 FTS + In-memory Gemini 768d vectors)
    RAG-->>Agent: Trả về danh sách bài học có độ liên quan cao
    Agent->>LLM: Gọi Gemini với System Prompt + Grounded Chunks
    LLM-->>Agent: Sinh token câu trả lời kèm trích dẫn (citations)
    Agent-->>Proxy: SSE Stream chunks (data: { token, sources, trace_id })
    Proxy-->>UI: SSE Stream chunks
    UI-->>User: Hiển thị typewriter effect + Badges trích dẫn
```

---

### Luồng 2: Thao tác CUD Roadmap qua Abot (`FLOW_ABOT_CUD_PREVIEW_CONFIRM`)

```mermaid
sequenceDiagram
    autonumber
    actor Owner as Owner
    participant UI as FloatingChatDrawer.tsx
    participant Proxy as /api/roadmap-assistant/[...path]
    participant Router as intent_router.py
    participant Actions as agent_actions.py (PendingAction)
    participant Commands as commands.py
    participant NextAPI as Next.js /api/v1/roadmaps/items
    participant Prisma as Prisma DB (RoadmapItem)
    participant Reindex as rag-reindex.ts

    Owner->>UI: "Thêm bài Prompt Engineering vào section LLM của topic AI"
    UI->>Proxy: POST /api/roadmap-assistant/chat
    Proxy->>Proxy: hasWriteAccess() = true ➔ x-actor: owner
    Proxy->>Router: decide_route() ➔ Intent: ROADMAP_CUD, write: CONFIRM
    Router->>Actions: create_action_preview()
    Actions->>Actions: Lưu PendingAction (store id: 'owner:UUID')
    Actions-->>UI: Trả về thẻ Preview (Preview Card)
    UI-->>Owner: Hiển thị thẻ Preview kèm nút "Xác nhận" và "Huỷ"

    Owner->>UI: Bấm nút "Xác nhận"
    UI->>Proxy: POST /api/roadmap-assistant/chat/confirm { action_id }
    Proxy->>Commands: execute_pending_action(action_id)
    Commands->>NextAPI: POST /api/v1/roadmaps/items (Internal HTTP)
    NextAPI->>Prisma: prisma.roadmapItem.create()
    NextAPI->>Reindex: after(requestRagReindex)
    NextAPI-->>Commands: 201 Created
    Commands-->>UI: Thông báo "Đã tạo thành công bài học"
    Reindex--)Agent: POST /internal/reindex (Python microservice nạp lại vector)
```

---

### Luồng 3: Cập nhật Lesson Status (`FLOW_LESSON_STATUS_UPDATE`)

```mermaid
sequenceDiagram
    autonumber
    actor Owner as Owner
    participant Badge as LessonStatus.tsx
    participant API as /api/v1/roadmaps/items/[id]
    participant Guard as requireWriteAccess()
    participant Prisma as Prisma (RoadmapItem)

    Owner->>Badge: Click chuyển trạng thái ('target' ➔ 'learning' ➔ 'known')
    Badge->>Badge: Optimistic UI update
    Badge->>API: PATCH /api/v1/roadmaps/items/[id] { status: 'learning' }
    API->>Guard: requireWriteAccess(req)
    alt Không phải Owner
        Guard-->>API: 401 Unauthorized
        API-->>Badge: 401 Error (Rollback UI)
    else Là Owner hợp lệ
        Guard-->>API: Allow
        API->>API: isLessonStatus(status) == true
        API->>Prisma: prisma.roadmapItem.update({ data: { status, statusUpdatedAt: now() } })
        Prisma-->>API: Updated item
        API-->>Badge: 200 OK
    end
```

---

## 4. MA TRẬN API ROUTE TO HANDLER (ROUTE MAP)

| Method   | Path                                            | Quyền (Auth)        | Domain                   | Controller / Handler File                                        | Triggered Flow            |
| -------- | ----------------------------------------------- | ------------------- | ------------------------ | ---------------------------------------------------------------- | ------------------------- |
| `GET`    | `/`                                             | None                | `roadmap-learning`       | `app/page.tsx`                                                   | View Dashboard            |
| `GET`    | `/notes`                                        | None                | `notes-editor`           | `app/notes/page.tsx`                                             | View Notes                |
| `GET`    | `/notes/[slug]`                                 | None                | `notes-editor`           | `app/notes/[slug]/page.tsx`                                      | View / Edit Note          |
| `GET`    | `/api/v1/roadmaps`                              | None                | `roadmap-learning`       | `app/api/v1/roadmaps/route.ts#GET`                               | List Topics               |
| `POST`   | `/api/v1/roadmaps`                              | Owner Only          | `roadmap-learning`       | `app/api/v1/roadmaps/route.ts#POST`                              | Create Topic              |
| `GET`    | `/api/v1/roadmaps/[slug]`                       | None                | `roadmap-learning`       | `app/api/v1/roadmaps/[slug]/route.ts#GET`                        | Topic Detail              |
| `PATCH`  | `/api/v1/roadmaps/[slug]`                       | Owner Only          | `roadmap-learning`       | `app/api/v1/roadmaps/[slug]/route.ts#PATCH`                      | Update Topic              |
| `DELETE` | `/api/v1/roadmaps/[slug]`                       | Owner Only          | `roadmap-learning`       | `app/api/v1/roadmaps/[slug]/route.ts#DELETE`                     | Delete Topic              |
| `PATCH`  | `/api/v1/roadmaps/[slug]/sections`              | Owner Only          | `roadmap-learning`       | `app/api/v1/roadmaps/[slug]/sections/route.ts#PATCH`             | Rename Section (ADR-0009) |
| `DELETE` | `/api/v1/roadmaps/[slug]/sections`              | Owner Only          | `roadmap-learning`       | `app/api/v1/roadmaps/[slug]/sections/route.ts#DELETE`            | Dissolve Section          |
| `POST`   | `/api/v1/roadmaps/items`                        | Owner Only          | `roadmap-learning`       | `app/api/v1/roadmaps/items/route.ts#POST`                        | Create Lesson             |
| `PATCH`  | `/api/v1/roadmaps/items/[id]`                   | Owner Only          | `roadmap-learning`       | `app/api/v1/roadmaps/items/[id]/route.ts#PATCH`                  | Update Lesson & Status    |
| `PATCH`  | `/api/v1/roadmaps/items/[id]/content`           | Owner Only          | `roadmap-learning`       | `app/api/v1/roadmaps/items/[id]/content/route.ts#PATCH`          | Update HTML Content       |
| `DELETE` | `/api/v1/roadmaps/items/[id]`                   | Owner Only          | `roadmap-learning`       | `app/api/v1/roadmaps/items/[id]/route.ts#DELETE`                 | Delete Lesson             |
| `POST`   | `/api/v1/roadmaps/items/reorder`                | Owner Only          | `roadmap-learning`       | `app/api/v1/roadmaps/items/reorder/route.ts#POST`                | Reorder Lessons           |
| `GET`    | `/api/v1/roadmaps/full-export`                  | None                | `roadmap-learning`       | `app/api/v1/roadmaps/full-export/route.ts#GET`                   | RAG Export Corpus         |
| `POST`   | `/api/roadmap-assistant/[...path]`              | None (Actor Header) | `roadmap-assistant-abot` | `app/api/roadmap-assistant/[...path]/route.ts#POST`              | Proxy to Python Service   |
| `POST`   | `/api/chat/stream`                              | Internal Bearer     | `roadmap-assistant-abot` | `rag_service/api/routes.py#chat_stream`                          | RAG SSE Stream            |
| `POST`   | `/api/upload-image`                             | Owner Only          | `storage-media`          | `app/api/upload-image/route.ts#POST`                             | S3 / R2 Upload            |
| `POST`   | `/api/v1/roadmaps/triage`                       | Owner Only          | `triage-observability`   | `app/api/v1/roadmaps/triage/route.ts#POST`                       | Create Triage Item        |
| `POST`   | `/api/v1/roadmaps/triage/[id]/approve`          | Owner Only          | `triage-observability`   | `app/api/v1/roadmaps/triage/[id]/approve/route.ts#POST`          | Approve Triage to Lesson  |

---

## 5. BẢNG QUY TẮC BẤT BIẾN & ADR THAM CHIẾU

- **ADR-0001**: Trợ lý Roadmap phải luôn chạy trên dịch vụ Python FastAPI tách biệt.
- **ADR-0002**: Trình duyệt tuyệt đối không gọi trực tiếp Python service; bắt buộc thông qua Same-origin proxy `/api/roadmap-assistant` để bảo vệ phân quyền Actor.
- **ADR-0003**: Feedback người dùng (vote 👍/👎) thuộc quản lý của Langfuse.
- **ADR-0004**: Tất cả mô hình nhúng vector (embeddings) bắt buộc dùng Google Gemini `text-embedding-004` (768 dimensions).
- **ADR-0005**: Môi trường production sử dụng Turso (libSQL edge db) tương thích SQLite.
- **ADR-0006**: RAG Assistant sử dụng in-memory vector search trên RAM để đảm bảo độ trễ thấp và đơn giản hóa kiến trúc.
- **ADR-0007**: Thuật ngữ tuân thủ `GLOSSARY.md`, nhưng chấp nhận các từ đồng nghĩa trong mục `_Also_` đã tồn tại trong codebase.
- **ADR-0008**: Loại bỏ cấu trúc nhóm `level` trung gian; Topic trực tiếp chứa các bài học.
- **ADR-0009**: Section là mục tuỳ chọn của Topic để gom bài; là chuỗi tự do (free-form string), so khớp không phân biệt hoa thường; không tạo bảng riêng.
- **ADR-0010**: Lesson Status gồm 3 trạng thái (`target`, `learning`, `known`), phản ánh tiến trình của Owner, ẩn với Visitor và mặc định là `known`.
