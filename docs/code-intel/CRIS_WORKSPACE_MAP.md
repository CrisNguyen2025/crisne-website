# BẢN ĐỒ KIẾN TRÚC & CẤU TRÚC XỬ LÝ LOGIC WORKSPACE CRIS (`crisne-website`)

> **Phiên bản:** 1.1.0 | **Commit:** `1dfcd0b` | **Mô hình:** GitNexus Code Intelligence  
> **Skill đi kèm:** `.agents/skills/cris-code-intel/` | **CLI Tra cứu:** `yarn intel`

---

## 1. TỔNG QUAN KIẾN TRÚC HỆ THỐNG (HYBRID ARCHITECTURE)

Dự án `crisne-website` hoạt động theo mô hình lai (Hybrid Full-Stack) gồm hai dịch vụ chính tương tác chặt chẽ:

1. **Next.js 16 App Router (TypeScript)**: Đóng vai trò Web UI, API Gateway, và Service Layer cho Roadmap, OwnerMemory, ThreadState, Private News, Storage.
2. **Python FastAPI Microservice (`roadmap-rag-assistant`)**: Đảm nhiệm AI Reasoning, Intent Routing P0-P8, Hybrid Vector Store (Gemini 768d + BM25 FTS), Active Recall Quiz, Concept Promotion, và thẻ `Preview` có cấu trúc.

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
        end

        subgraph Service_Layer ["Domain Logic & Services"]
            RoadmapService["roadmapService.ts"]
            ReindexHook["rag-reindex.ts (after request)"]
        end

        subgraph Storage_Layer ["Persistence"]
            PrismaORM["Prisma Client"]
            SQLiteTurso[("Database (SQLite / Turso)")]
            S3R2[("Cloudflare R2 / AWS S3")]
        end
    end

    subgraph Python_Microservice ["Roadmap RAG Assistant (Python FastAPI - Port 8000)"]
        FastAPI_Server["FastAPI Router (/api/chat/stream, /confirm, /plan)"]
        IntentRouter["Intent Router (Phases P0-P8)"]

        subgraph AI_Engine ["AI Engines"]
            HybridRAG["Hybrid Retriever (BM25 FTS + Vector)"]
            InMemoryStore[("In-Memory Vector Store<br/>Gemini 768d")]
            CUDActions["Commands & SessionStore<br/>(Unified Preview / Quiz / Memory)"]
            GeminiLLM["Gemini / Groq LLM"]
        end

        LangfuseObs["Langfuse Observability & Tracing"]
    end

    %% Client calls
    UI_Roadmap --> API_Roadmap
    UI_FloatingBot --> Proxy_Route

    %% Gateway & Routing
    API_Roadmap --> RoadmapService --> PrismaORM
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
```

---

## 2. 6 DOMAINS TRỌNG YẾU (COMMUNITIES)

| ID Domain                | Tên Domain               | ADRs Quy định                                    | Trọng tâm Logic                                                                                            | Key Files                                                                                                                 |
| ------------------------ | ------------------------ | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `roadmap-learning`       | Roadmap & Learning       | ADR-0008, ADR-0009, ADR-0010, ADR-0014           | Quản lý Topic, Section (chuỗi tự do), Lesson, Lesson Status (`target`, `learning`, `known`), KnowledgeRelation | `lib/roadmap/*`, `logic/roadmap/roadmapService.ts`, `components/roadmap/*`, `app/api/v1/roadmaps/*`                       |
| `roadmap-assistant-abot` | Roadmap Assistant (Abot) | ADR-0001..0004, ADR-0006, ADR-0011, 0012, 0015, 0017 | Trợ lý RAG AI, proxy cùng domain, router P0-P8, in-memory vector store, unified `Pending Action` / `Preview`, `OwnerMemory`, Quiz, Concept Promotion | `app/api/roadmap-assistant/*`, `roadmap-rag-assistant/rag_service/*`, `logic/roadmap/roadmapAssistantService.ts`          |
| `storage-media`          | Storage & Media          | N/A                                              | S3/R2 client, image upload                                                                                 | `app/api/upload-image/*`, `lib/r2-client.ts`                                                                               |
| `auth-security`          | Auth & Actor Model       | ADR-0002, ADR-0019                               | NextAuth, site Owner-only trừ `/login`, `requireWriteAccess`, proxy `x-actor`, WebMCP read-only cho Owner | `auth.ts`, `lib/auth/*`, `hooks/use-can-write.ts`, `rag_service/auth.py`, `rag_service/webmcp_planner.py`                  |
| `observability`          | Observability & Golden Set | ADR-0003, ADR-0011                               | Langfuse traces, feedback scores (Cris AI), Abot copy `traceId`, Golden set evals (`_routing`, `_answer`, `holdout`) | `lib/ai/langfuse.ts`, `app/api/chat/feedback/route.ts`                                                                    |
| `private-news`           | Private News Reader      | ADR-0005, ADR-0016, ADR-0017, ADR-0019           | Kho đọc tin private `/news` cho `Owner` (bỏ Public News), `/share` PWA Share Target, RSS cron (`ETag`/`304`), `news-ingest-worker/` 3 tầng, `KnowledgeProvenance` | `app/(news)/*`, `components/news/*`, `lib/news/*`, `app/api/news/*`, `app/api/ingest/route.ts`, `news-ingest-worker/*`   |

---

## 3. BIỂU ĐỒ TRACE CÁC LUỒNG THỰC THI CỐT LÕI (EXECUTION FLOWS)

### Luồng 1: Hỏi đáp Kiến thức RAG với Abot (`FLOW_ABOT_CHAT_QUERY`)

```mermaid
sequenceDiagram
    autonumber
    actor User as Người dùng (Visitor/Owner)
    participant UI as RoadmapAssistantChatbot.tsx
    participant Proxy as /api/roadmap-assistant/[...path]
    participant Agent as Python agent.py
    participant Router as intent_router.py (P0-P8)
    participant RAG as sources.py & retrieval/engine.py
    participant LLM as Google Gemini 2.5 Flash
    participant Obs as Langfuse Tracing

    User->>UI: Gửi câu hỏi về Topic
    UI->>Proxy: POST /api/roadmap-assistant/chat/stream
    Proxy->>Proxy: hasWriteAccess() ➔ Gán x-actor: owner / visitor
    Proxy->>Proxy: Rate limit check (Visitor: max 30/5min)
    Proxy->>Agent: Forward với Bearer RAG_INTERNAL_KEY
    Agent->>Obs: Bắt đầu traced_turn()
    Agent->>Router: IntentRouter.aroute() (Phases P0-P8)
    Router-->>Agent: Intent = KNOWLEDGE_QUERY + sub_intent (search | catalog | lesson_status)
    Note over Agent: catalog / lesson_status: trả lời từ dữ liệu (Visitor bị chặn với lesson_status).<br/>Handler không nhận câu ➔ rơi xuống tìm kiếm
    Agent->>RAG: HybridRagEngine.search_live_knowledge(query)
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
    participant UI as RoadmapAssistantChatbot.tsx
    participant Proxy as /api/roadmap-assistant/[...path]
    participant Router as intent_router.py
    participant Actions as commands.py (RoadmapCommands)
    participant Commands as commands.py
    participant NextAPI as Next.js /api/v1/roadmaps/items
    participant Prisma as Prisma DB (RoadmapItem)
    participant Reindex as rag-reindex.ts

    Owner->>UI: "Thêm bài Prompt Engineering vào section LLM của topic AI"
    UI->>Proxy: POST /api/roadmap-assistant/chat/stream
    Proxy->>Proxy: hasWriteAccess() = true ➔ x-actor: owner
    Proxy->>Router: IntentRouter.aroute() ➔ Intent: ROADMAP_CUD, write: CONFIRM
    Router->>Actions: handle_cud()
    Actions->>Actions: Lưu PendingAction (7 slot hợp nhất RAM, TTL 600s) + build_action_preview_event()
    Actions-->>UI: SSE event action_preview { action_id, kind, confirmable: true }
    UI-->>Owner: MessageItem (!isRestored && confirmable) ➔ ConfirmActions

    Owner->>UI: Bấm nút "Xác nhận" (hoặc gõ "ok")
    UI->>Proxy: POST /api/roadmap-assistant/chat/confirm { thread_id, titles?, target? }
    Proxy->>Commands: confirm_pending_action() (write_granted)
    Commands->>NextAPI: POST/PATCH /api/v1/roadmaps/items* | /api/v1/memories
    NextAPI->>Prisma: prisma.roadmapItem.* / prisma.ownerMemory.*
    NextAPI->>Reindex: after(notifyRoadmapChanged) (hoặc notifyOwnerMemoryChanged)
    Commands-->>UI: event change_review (ChangeSet thêm/cập nhật/xoá) ➔ ChangeReviewCard
    Reindex--)Agent: POST /internal/reindex (Python microservice nạp lại vector)
```

---

### Luồng bổ sung (ADR-0012..ADR-0019 & Batch A–C)

- **`FLOW_ABOT_OWNER_MEMORY_MANAGE`**: `roadmap-rag-assistant/rag_service/domains/roadmap/memory_commands.py#handle_memory_command` · `roadmap-rag-assistant/rag_service/core/memory/extractor.py#has_memory_signal` / `#maybe_suggest_memories` · `roadmap-rag-assistant/rag_service/core/memory/store.py#list_active` · `app/api/v1/memories/route.ts#PATCH` · `roadmap-rag-assistant/sdk/typescript/src/react/components/OwnerMemorySheet.tsx#OwnerMemorySheet`.
- **`FLOW_ABOT_ACTIVE_RECALL_QUIZ`**: `roadmap-rag-assistant/rag_service/domains/roadmap/quiz_commands.py#handle_quiz_command` · `#handle_active_quiz_turn` · `#classify_quiz_gaps` (chuyển tiếp lỗ hổng kiến thức sang `pending_concept_promotion` nối sau `pending_status_change`).
- **`FLOW_ABOT_CONCEPT_PROMOTION`**: `roadmap-rag-assistant/rag_service/domains/roadmap/lesson_content.py#handle_concept_promotion` / `#build_concept_promotion_proposal` (`include_owner_memory=False`, mặc định `status="target"`, không tạo Provenance) · `roadmap-rag-assistant/rag_service/domains/roadmap/linking_advisor.py#advise_concept_promotion` · `roadmap-rag-assistant/rag_service/domains/roadmap/commands.py#_handle_pending_concept_promotion` · `roadmap-rag-assistant/rag_service/execution/executor.py#schedule_local_rag_sync`.
- **`FLOW_ABOT_WEBMCP_SAFETY`**: `components/roadmap/RoadmapWebMcpRegistrar.tsx#RoadmapWebMcpRegistrar` · `hooks/use-roadmap-webmcp.ts#useRoadmapWebMcpTools` (chỉ mount khi `canWrite === true`) · `roadmap-rag-assistant/rag_service/api/routes.py#plan` · `roadmap-rag-assistant/rag_service/webmcp_planner.py#plan_webmcp_call` (read-only tools cho Owner, chuyển hướng lệnh ghi sang `Preview` -> `ok`).

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
| `GET`    | `/`                                             | None                | `roadmap-learning`       | `app/page.tsx`                                                   | View Publication Hub      |
| `GET`    | `/[topicSlug]`                                  | None                | `roadmap-learning`       | `app/[topicSlug]/page.tsx`                                       | View Topic Syllabus       |
| `GET`    | `/[topicSlug]/[lessonSlug]`                     | None                | `roadmap-learning`       | `app/[topicSlug]/[lessonSlug]/page.tsx`                          | View Editorial Lesson     |
| `GET`    | `/topic/[topicSlug]`                            | None                | `roadmap-learning`       | `app/topic/[topicSlug]/page.tsx`                                 | 308 Redirect to Topic     |
| `GET`    | `/lessons/[lessonSlug]`                         | None                | `roadmap-learning`       | `app/lessons/[lessonSlug]/page.tsx`                              | 308 Redirect to Lesson    |
| `GET`    | `/topic/[topicSlug]/[itemSlug]`                 | None                | `roadmap-learning`       | `app/topic/[topicSlug]/[itemSlug]/page.tsx`                      | 308 Redirect to Lesson    |
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
| `POST`   | `/api/roadmap-assistant/[...path]`              | None (Actor Header) | `roadmap-assistant-abot` | `app/api/roadmap-assistant/[...path]/route.ts#forward`           | Proxy to Python Service   |
| `GET`    | `/api/roadmap-assistant/thread`                 | Owner Only          | `roadmap-assistant-abot` | `app/api/roadmap-assistant/thread/route.ts#GET`                  | Restore Owner Thread (`isRestored`) |
| `POST`   | `/api/chat/stream`                              | Internal Bearer     | `roadmap-assistant-abot` | `rag_service/api/routes.py#chat_stream`                          | RAG SSE Stream            |
| `POST`   | `/api/chat/confirm` · `/api/chat/cancel`        | Internal Bearer     | `roadmap-assistant-abot` | `rag_service/api/routes.py#confirm_action`                       | Execute / Cancel Pending Action |
| `POST`   | `/api/chat/plan`                                | Internal Bearer     | `roadmap-assistant-abot` | `rag_service/api/routes.py#plan`                                 | WebMCP Read-Only Planner  |
| `GET/POST/PATCH` | `/api/v1/memories` · `/api/v1/memories/[id]` | Owner Only      | `roadmap-assistant-abot` | `app/api/v1/memories/route.ts`                                   | `FLOW_ABOT_OWNER_MEMORY_MANAGE` |
| `POST`   | `/api/upload-image`                             | Owner Only          | `storage-media`          | `app/api/upload-image/route.ts#POST`                             | S3 / R2 Upload            |
| `GET`    | `/news` · `/news/sources` · `/share` | Owner Only          | `private-news`           | `app/(news)/**`                                                  | Private News Inbox & PWA  |
| `POST`   | `/api/ingest`                                   | Owner Only          | `private-news`           | `app/api/ingest/route.ts#POST`                                   | `FLOW_NEWS_INGEST_PIPELINE` |
| `GET`    | `/api/news` · `/api/news/[id]` · `/api/news/worker-health` | Owner Only | `private-news`       | `app/api/news/**`                                                | `FLOW_NEWS_FEED_BROWSE_AND_STATE` |
| `PATCH`  | `/api/news/[id]` · `DELETE /api/news/[id]` · `POST /api/news/mark-read` | Owner Only | `private-news` | `app/api/news/**`                                       | `FLOW_NEWS_FEED_BROWSE_AND_STATE` |
| `GET/POST` | `/api/news/cron`                              | Owner / Cron Secret | `private-news`           | `app/api/news/cron/route.ts`                                     | `FLOW_NEWS_RSS_CRON_SYNC` |
| `POST`   | `/api/news/sources/preview`                     | Owner Only          | `private-news`           | `app/api/news/sources/preview/route.ts#POST`                     | `FLOW_NEWS_RSS_CRON_SYNC` |
| `GET`    | `/api/news/sources/[id]/scans`                  | Owner Only          | `private-news`           | `app/api/news/sources/[id]/scans/route.ts#GET`                   | `FLOW_NEWS_RSS_CRON_SYNC` |
| `POST`   | `/api/news/[id]/integrate`                      | Owner Only          | `private-news`           | `app/api/news/[id]/integrate/route.ts#POST`                      | `FLOW_NEWS_ADD_TO_LESSON` |
| `POST`   | `/api/news/[id]/match-lessons`                  | Owner Only          | `private-news`           | `app/api/news/[id]/match-lessons/route.ts#POST`                  | `FLOW_ABOT_LINKING_AND_PROVENANCE` |
| `GET`    | `/api/v1/roadmaps/items/[id]/provenance`        | Owner Only          | `roadmap-learning`       | `app/api/v1/roadmaps/items/[id]/provenance/route.ts#GET`         | `FLOW_NEWS_ADD_TO_LESSON` |
| `GET/POST/DELETE` | `/api/v1/roadmaps/items/[id]/relations` | Owner Only         | `roadmap-learning`       | `app/api/v1/roadmaps/items/[id]/relations/route.ts`              | `FLOW_ABOT_LINKING_AND_PROVENANCE` |
| `GET`    | `/api/v1/roadmaps/provenance-by-lessons`        | Owner Only          | `roadmap-learning`       | `app/api/v1/roadmaps/provenance-by-lessons/route.ts#GET`         | `FLOW_ABOT_LINKING_AND_PROVENANCE` |

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
- **ADR-0010**: Lesson Status gồm 3 trạng thái (`target`, `learning`, `known`), phản ánh tiến trình của Owner, ẩn với Visitor và mặc định là `known` (bài mới từ Concept Promotion / News Integrate mặc định `target`).
- **ADR-0011**: Bỏ Knowledge Triage; Langfuse giữ Feedback (`Cris AI` 👍/👎 giữ nguyên) và Golden Set; Abot giữ tắt nút 👍/👎 (`onFeedback` tắt theo Q3 Option A), giữ nút `ID` copy `traceId` cho Owner.
- **ADR-0012**: Lịch sử và ngữ cảnh `Topic`/`Lesson` của Thread Owner lưu ở Turso (`ThreadState`, `ThreadMessage` schema tối giản); Thread Visitor và mọi `Pending Action` chỉ nằm trong RAM (TTL 600s).
- **ADR-0013** (superseded by ADR-0014): URL bài học phẳng `/lessons/[lessonSlug]`. Phần `RoadmapItem.slug` duy nhất toàn cục và `SlugRedirect` vẫn giữ.
- **ADR-0014**: Topic ở `/[topicSlug]`, Lesson ở `/[topicSlug]/[lessonSlug]#[headingSlug]`; slug Topic không trùng route gốc (`lib/roadmap/paths.ts`); URL cũ 308 về URL mới.
- **ADR-0015**: `Owner Memory` xuyên Thread lưu ở Turso (5 kind `profile | techstack | goal | preference | learning_note`, <= 300 ký tự, trần `pending <= 10`), cách ly hoàn toàn với Visitor, chat qua `Preview -> ok`, `<owner_memory>` không rò rỉ vào Lesson draft.
- **ADR-0016**: `news-ingest-worker` là service Python riêng, chỉ trích xuất và tóm tắt từng NewsItem; mọi suy luận đối chiếu với Lesson thuộc Abot.
- **ADR-0017**: Provenance theo từng câu: marker rỗng `<span data-provenance-ref="<uuid>">` trong `RoadmapItem.content`, metadata ở `KnowledgeProvenance`; chỉ Owner thấy, nạp phía client (`useLessonProvenance`), không vào index Abot; marker mất thì thành "Nguồn tham khảo của bài" (`FLOW_NEWS_ADD_TO_LESSON`); concept promotion từ chat không tạo Provenance.
- **ADR-0018** (superseded by ADR-0019): Từng mở Public News; đã thay thế hoàn toàn.
- **ADR-0019**: Site chỉ dành cho Owner, trừ `/login`; không còn Public News, `/feed-ingestion` redirect sang `/news`; route riêng tư tự kiểm `requireWriteAccess` vì middleware cho qua request có header key; WebMCP chỉ đăng ký read-only khi `canWrite === true`.
