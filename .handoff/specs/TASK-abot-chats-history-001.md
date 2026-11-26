---
task_id: "TASK-abot-chats-history-001"
branch: "feat/abot-chats-history" # Tạo nhánh này từ main trước khi chạy baseline.sh
version: "3.0.0"
type: "implement"
priority: "P1"
status: "COMPLETED" # Đã triển khai và qua toàn bộ verification gate trên nhánh feat/abot-chats-history (2026-11-26)
assigned_executor: "antigravity"
max_attempts: 3
current_attempt: 0

boundaries:
  allowed_to_modify:
    - "app/styles/toast.css"
    - "components/ui/toast.tsx"
    - "components/roadmap/RoadmapAssistantChatbot.tsx"
    - "lib/roadmap/thread-state.ts"
    - "app/api/roadmap-assistant/thread/route.ts"
    - "app/api/roadmap-assistant/threads/route.ts"
    - "app/api/roadmap-assistant/threads/[threadId]/route.ts"
    - "roadmap-rag-assistant/sdk/typescript/src/types.ts"
    - "roadmap-rag-assistant/sdk/typescript/src/client.ts"
    - "roadmap-rag-assistant/sdk/typescript/src/react/types.ts"
    - "roadmap-rag-assistant/sdk/typescript/src/react/icons.tsx"
    - "roadmap-rag-assistant/sdk/typescript/src/react/useThreadHistory.ts"
    - "roadmap-rag-assistant/sdk/typescript/src/react/useRoadmapAssistantChat.ts"
    - "roadmap-rag-assistant/sdk/typescript/src/react/components/ChatHeader.tsx"
    - "roadmap-rag-assistant/sdk/typescript/src/react/components/MessageList.tsx"
    - "roadmap-rag-assistant/sdk/typescript/src/react/components/ThreadHistorySheet.tsx"
    - "roadmap-rag-assistant/sdk/typescript/src/react/RoadmapChatbotWidget.tsx"
    - "roadmap-rag-assistant/sdk/typescript/src/react/index.ts"
    - "tests/route/assistant-thread-route.test.ts"
    - "tests/route/assistant-threads-route.test.ts"
    - "tests/unit/sdk-chat-hook.test.tsx"
    - "tests/unit/sdk-widget.test.tsx"
    - "tests/unit/thread-history-sheet.test.tsx"
    - "tests/manual/abot-chats-history.md"
    - ".agents/skills/cris-code-intel/data/cris-workspace-map.json"
    - "docs/code-intel/CRIS_WORKSPACE_MAP.md"
  continues_dirty: []
  read_only_references:
    - "AGENTS.md"
    - "GLOSSARY.md"
    - "docs/adr/**"
    - "docs/design-system.md"
    - "prisma/schema.prisma"
    - "lib/auth/write-access.ts"
    - "lib/utils.ts"
    - "app/api/v1/threads/[threadId]/route.ts"
    - "app/api/v1/memories/route.ts"
    - "roadmap-rag-assistant/rag_service/core/augmentation/history.py"
    - "roadmap-rag-assistant/rag_service/state/session_store.py"
    - "roadmap-rag-assistant/rag_service/domains/roadmap/agent.py"
    - "roadmap-rag-assistant/sdk/typescript/src/react/components/ContextUsageSheet.tsx"
    - "roadmap-rag-assistant/sdk/typescript/src/react/components/OwnerMemorySheet.tsx"
    - "roadmap-rag-assistant/sdk/typescript/src/react/utils/useWidgetDismiss.ts"
    - "roadmap-rag-assistant/sdk/typescript/src/react/utils/useDrawerMotion.ts"
    - "roadmap-rag-assistant/sdk/typescript/src/react/utils/formatters.ts"
    - "tests/unit/owner-memory-sheet.test.tsx"
    - "tests/unit/sdk-widget-a11y-interaction.test.tsx"
    - "tests/manual/README.md"
  strictly_forbidden:
    - "package.json"
    - "yarn.lock"
    - "tsconfig.json"
    - "prisma/**"
    - "docs/adr/**"
    - "GLOSSARY.md"
    - "middleware.ts"
    - "components/floating-bot/**"
    - "hooks/use-floating-chat.ts"
    - "roadmap-rag-assistant/rag_service/**"
    - "roadmap-rag-assistant/evals/**"

deploy_steps: [] # Zero-migration V1: dùng ThreadMessage và ThreadState sẵn có, không sửa schema Turso

fast_gate: ["type_check", "vitest_targeted", "boundary_check"]
verification_gate:
  type_check: "yarn tsc --noEmit -p . && npx tsc --noEmit -p roadmap-rag-assistant/sdk/typescript/tsconfig.json"
  lint: "npx eslint --max-warnings=0 components/ui/toast.tsx components/roadmap/RoadmapAssistantChatbot.tsx lib/roadmap/thread-state.ts app/api/roadmap-assistant/thread/route.ts app/api/roadmap-assistant/threads/route.ts app/api/roadmap-assistant/threads/[threadId]/route.ts tests/route/assistant-thread-route.test.ts tests/route/assistant-threads-route.test.ts tests/unit/sdk-chat-hook.test.tsx tests/unit/sdk-widget.test.tsx tests/unit/thread-history-sheet.test.tsx && npx eslint --no-ignore --max-warnings=0 roadmap-rag-assistant/sdk/typescript/src/types.ts roadmap-rag-assistant/sdk/typescript/src/client.ts roadmap-rag-assistant/sdk/typescript/src/react/types.ts roadmap-rag-assistant/sdk/typescript/src/react/icons.tsx roadmap-rag-assistant/sdk/typescript/src/react/useThreadHistory.ts roadmap-rag-assistant/sdk/typescript/src/react/useRoadmapAssistantChat.ts roadmap-rag-assistant/sdk/typescript/src/react/components/ChatHeader.tsx roadmap-rag-assistant/sdk/typescript/src/react/components/MessageList.tsx roadmap-rag-assistant/sdk/typescript/src/react/components/ThreadHistorySheet.tsx roadmap-rag-assistant/sdk/typescript/src/react/RoadmapChatbotWidget.tsx"
  vitest_targeted: "yarn vitest run tests/route/assistant-thread-route.test.ts tests/route/assistant-threads-route.test.ts tests/unit/sdk-chat-hook.test.tsx tests/unit/sdk-widget.test.tsx tests/unit/thread-history-sheet.test.tsx tests/unit/sdk-widget-a11y-interaction.test.tsx tests/unit/roadmap-stale-cache.test.tsx"
  test: "yarn test"
  intel_status: "yarn intel status"
  doctor_delta: "yarn doctor --since HEAD --check"
  boundary_check: "bash .agents/skills/agent-handoff/scripts/check-boundary.sh TASK-abot-chats-history-001"
---

# TASK: Chats History (Bottom Sheet Gần Đây, Tìm Kiếm & Chuyển Thread) cho Abot

> **Trạng thái hiện tại** (cập nhật mỗi khi dừng): `COMPLETED` (2026-11-26) — Đã triển khai đầy đủ API, SDK hooks, Bottom Sheet `ThreadHistorySheet`, tests và đồng bộ `cris-code-intel` trên nhánh `feat/abot-chats-history`; toàn bộ gate đều PASS (chờ Owner review & `git commit`).

## 0. Quyết định đã chốt của Owner (2026-11-26)

| # | Hạng mục | Quyết định đã chốt | Tác động thiết kế |
|---|---|---|---|
| Q1 | Phạm vi schema V1 | **Zero-migration** | Không sửa `prisma/schema.prisma`, `deploy_steps: []`. Tổng hợp tiêu đề `Thread` từ tin nhắn `user` đầu tiên có nghĩa trong `ThreadMessage`, kết hợp ngữ cảnh `Topic`/`Lesson` từ `ThreadState`. Chưa hỗ trợ đổi tên `Thread`. |
| Q2 | Chính sách lưu giữ | **Không cần Pin**, giữ `ADR-0012` | Giữ nguyên `MAX_THREAD_MESSAGES = 50` tin/`Thread` và `THREAD_RETENTION_MS = 30` ngày. |
| Q3 | Vị trí & hình thức UI | **Bottom Sheet, UX mượt** | Nút icon `Lịch sử chat` (`HistoryIcon`) đặt trên `ChatHeader` (chỉ hiện khi `canWrite === true`). Bấm mở `ThreadHistorySheet` trượt từ đáy lên (đồng bộ `ContextUsageSheet` / `OwnerMemorySheet`), có skeleton loading, fade/slide mượt, `overscroll-contain`, `Esc`/backdrop dismiss và không tự bật bàn phím trên mobile. |
| Q4 | Hành vi khi chọn `Thread` | **Chuyển hẳn sang `Thread` đó làm `Thread` đang mở** | Gọi `PATCH /api/roadmap-assistant/threads/[threadId]`: trong `$transaction` đóng các `ThreadState` đang mở khác (`closedAt = now`), mở lại `Thread` đích (`closedAt = null`, cập nhật `updatedAt`), đồng thời trả đầy đủ messages + state để UI nạp ngay. F5 reload tab sau đó khôi phục đúng `Thread` vừa chọn. |
| Q5 | Quản lý & Tìm kiếm | **Có nút xóa từng `Thread` + có Search** | `ThreadHistorySheet` có thanh tìm kiếm (lọc tức thì ở client + gọi server `GET /api/roadmap-assistant/threads?q=...` hỗ trợ tiếng Việt có/không dấu, trả `matchedSnippet` khi khớp ở tin nhắn sau) và nút xóa inline xác nhận 2 chạm (`DELETE /api/roadmap-assistant/threads/[threadId]`). |

---

## 1. Context & Architectural Intent

- **Goal**: Cho phép `Owner` mở danh sách các `Thread` gần đây của Abot trong một Bottom Sheet mượt mà, tìm kiếm theo tiêu đề/nội dung/Topic, xóa từng `Thread`, và bấm vào bất kỳ `Thread` nào để chuyển hẳn sang `Thread` đó làm `Thread` đang mở (liên tục qua reload tab).
- **Why**:
  - Hiện `ThreadMessage` và `ThreadState` trên Turso đã lưu toàn bộ `Thread` của `Owner` trong 30 ngày (`ADR-0012`), kể cả sau khi Owner bấm **"Cuộc trò chuyện mới"** (vốn chỉ đặt `closedAt = now` trên `ThreadState`). Tuy nhiên `GET /api/roadmap-assistant/thread` chỉ trả về **duy nhất 1** `Thread` chưa đóng gần nhất, khiến `Owner` không có cách nào quay lại hoặc tìm lại các `Thread` cũ.
  - Phía Python backend (`agent.py#_astream_events_impl` và `routes.py#chat_context`) đã gọi sẵn `history_store.load(session_id)` + `session_store.load(session_id)`, nên khi UI chuyển `conversationId` sang một `Thread` cũ và Owner gửi tin mới, Python tự nạp lại lịch sử và ngữ cảnh `Topic`/`Lesson` từ Turso mà không cần sửa code Python.
- **Pre-flight (`yarn intel how-to-sync` & `cris-doctor`)**:
  - `cris-how-to-sync`: 🟡 **CẢI THIỆN (CONDITIONAL)** — hợp chuẩn kiến trúc nếu giữ cách ly `Actor` (`Owner`-only), giữ thuật ngữ `Thread` (`GLOSSARY.md`), không đưa `Pending Action` vào DB, và xử lý đúng case `Thread` cũ kích hoạt lại trên `GET /api/roadmap-assistant/thread`.
  - `cris-doctor` (`--scope ui`, `--scope next`, `--scope rag`, `2026-11-26`): vùng Abot có **0 `bug`, 0 `risk` mới**.
- **Dependencies**:
  - `lib/roadmap/thread-state.ts#MAX_THREAD_MESSAGES`, `#THREAD_RETENTION_MS`, `#OWNER_THREAD_PREFIX`, `#toOwnerThreadId`, `#stripOwnerThreadPrefix`
  - `app/api/roadmap-assistant/thread/route.ts#GET`, `#DELETE`
  - `app/api/v1/threads/[threadId]/route.ts#GET`, `#POST`, `#PATCH`
  - `lib/auth/write-access.ts#requireWriteAccess`, `#hasWriteAccess`
  - `roadmap-rag-assistant/sdk/typescript/src/client.ts#RoadmapChatClient`
  - `roadmap-rag-assistant/sdk/typescript/src/react/useRoadmapAssistantChat.ts#useRoadmapAssistantChat`
  - `roadmap-rag-assistant/sdk/typescript/src/react/RoadmapChatbotWidget.tsx#RoadmapChatbotWidget`
  - `roadmap-rag-assistant/sdk/typescript/src/react/components/ChatHeader.tsx#ChatHeader`
  - `roadmap-rag-assistant/sdk/typescript/src/react/components/MessageList.tsx` (`!msg.isRestored` giữ nguyên để chặn nút xác nhận hết hạn)
  - Flow liên quan: `FLOW_ABOT_CHAT_QUERY`, `FLOW_ABOT_OWNER_MEMORY_MANAGE`, `FLOW_ABOT_ACCESS_GUARD`.

---

## 2. Invariants & Rules

1. **Cách ly Actor (`ADR-0002`, `ADR-0012`, `ADR-0019`)**:
   - Toàn bộ route mới (`/api/roadmap-assistant/threads` và `/api/roadmap-assistant/threads/[threadId]`) **bắt buộc** gọi `requireWriteAccess(req)` ngay đầu handler (trả `401` cho `Visitor`).
   - Mọi truy vấn Prisma đều lọc `threadId` bắt đầu bằng `OWNER_THREAD_PREFIX` (`"owner:"`) và validate đầu vào qua `toOwnerThreadId(threadId)` (trả `400` nếu thiếu, là `"default"`, hoặc vượt độ dài).
   - Trên UI, nút `Lịch sử chat` trên `ChatHeader` và `ThreadHistorySheet` **chỉ render khi `canWrite === true`**. Tuyệt đối không lưu lịch sử `Owner` vào `localStorage` (`ADR-0015`).
2. **Giữ tương thích `GET /api/roadmap-assistant/thread` & Switch Thread Bug Guard**:
   - Lỗ hổng tiềm ẩn phải xử lý: `POST /api/v1/threads/[threadId]` chỉ tạo `ThreadMessage`, không phải lúc nào cũng tạo `ThreadState` (ví dụ khi Owner hỏi câu chung không mở `Topic`). Ngoài ra, `GET /api/roadmap-assistant/thread` cũ chỉ tìm `ThreadMessage` có `id` lớn nhất. Nếu Owner chuyển hẳn sang một `Thread` cũ `T1` (có `ThreadMessage.id` nhỏ hơn `T2`) rồi reload trang trước khi nhắn thêm tin mới, query theo `MAX(ThreadMessage.id)` sẽ trả nhầm `T2` (hoặc `{ threadId: null }`)!
   - **Quy tắc bắt buộc**:
     - Khi `PATCH /api/roadmap-assistant/threads/[threadId]` kích hoạt `T1`: trong cùng `prisma.$transaction`, phải (a) đóng tất cả `ThreadState` đang mở khác (`closedAt: null`, `threadId != T1`), (b) kiểm tra `latestMessage` của `owner:*` — nếu `latestMessage.threadId !== T1`, upsert `ThreadState` cho `latestMessage.threadId` với `closedAt = now`, và (c) upsert `ThreadState` cho `T1` với `closedAt = null` (làm `updatedAt` của `T1` mới nhất).
     - Khi `GET /api/roadmap-assistant/thread` chạy: tìm song song `latestMessage` (trong 30 ngày) và `latestOpenState` (`ThreadState` có `closedAt: null`, `updatedAt >= cutoff`, sort `updatedAt desc`). Nếu `latestOpenState` tồn tại, vẫn còn ít nhất 1 `ThreadMessage` trong 30 ngày, và (`latestMsgState?.closedAt != null` hoặc `latestOpenState.updatedAt >= latestMessage.createdAt`), khôi phục `latestOpenState.threadId`. Nếu `latestMessage` có `closedAt != null` và không có `latestOpenState` hợp lệ -> trả `{ threadId: null, messages: [] }` (giữ nguyên hành vi không hồi sinh `Thread` cũ sau khi bấm "Cuộc trò chuyện mới").
3. **Không `BE-QUERY-IN-LOOP`, không `BE-RAW-SQL` unsafe (`cris-doctor`)**:
   - Tuyệt đối không query Prisma bên trong vòng lặp `for` / `map`. Dùng `groupBy` + batch `findMany({ where: { threadId: { in: ... } } })` hoặc 1 batch query có giới hạn rõ ràng trong 30 ngày.
   - Không rò rỉ `error.message` nội bộ ra JSON HTTP response (`BE-ERROR-LEAK`).
4. **Glossary & Naming (`GLOSSARY.md` & `AGENTS.md`)**:
   - Tên API, types, hooks, props dùng `Thread` / `ThreadHistory` (không dùng `session` hay `conversation` cho model/route mới, giữ `conversationId` hiện có trong hook `useRoadmapAssistantChat` để không phá caller).
   - Nhãn hiển thị tiếng Việt trong UI tuân quy ước Abot (`"Lịch sử chat"`, `"Gần đây"`, `"Đang mở"`, `"Tìm theo tiêu đề, nội dung hoặc Topic…"`), tránh từ cấm (`_Avoid_`).
   - Props/state tuân `AGENTS.md`: đặt tên theo single component (`isOpen`, `threads`, `query`, `isLoading`, không gắn tên use-case kiểu `isAbotThreadHistoryLoading`).
5. **Accessibility & Smooth UX (`axe-core` + Mobile)**:
   - Không đặt `<button>` lồng trong `<button>` (row chọn `Thread` và nút xóa nằm cạnh nhau trong cùng `<li>`).
   - Mọi ô input trên mobile giữ tối thiểu `text-base md:text-xs` (16px trên mobile tránh iOS Safari tự zoom).
   - Nút icon có `aria-label` và vùng chạm tối thiểu `min-h-11 min-w-11` trên mobile (`md:min-h-0 md:min-w-0`), tương phản chữ dùng bảng màu SDK (`#1F1E1C`, `#5E5B55`, `#FFFFFF`, `#FAF9F7`, `#F4F3F0`, `#E6E4DF`, `#3F7D58`, `#B42318`, `#C2410C`).
   - Không tự gọi fetch history khi widget mount (chỉ fetch khi Owner mở `ThreadHistorySheet`), để không ảnh hưởng latency mount hay các unit test hiện tại.
6. **Ngoài phạm vi**:
   - Thay đổi `prisma/schema.prisma`, chạy migration Turso, thêm tính năng đổi tên hoặc ghim (`pin`) `Thread`.
   - Lưu `sources`, `citations`, `changes`, `traceId` xuống `ThreadMessage` (`TASK-abot-scale-003` Q2 Option A giữ nguyên).
   - Thay đổi code Python `roadmap-rag-assistant/rag_service/**` hoặc `Cris AI`.

---

## 3. Contract & Thiết kế chi tiết

### 3.1. Helper trong `lib/roadmap/thread-state.ts`
- `DEFAULT_THREAD_LIST_LIMIT = 30`, `MAX_THREAD_LIST_LIMIT = 100`, `MAX_THREAD_SEARCH_CHARS = 100`, `MAX_THREAD_TITLE_CHARS = 80`.
- `foldThreadSearchText(text: string): string`: chuyển chữ thường, thay `đ -> d`, `.normalize('NFD')`, bỏ dấu thanh (`[\u0300-\u036f]`), gom khoảng trắng thành 1 dấu cách, `trim()`.
- `buildThreadTitle(contents: string[]): string`: nhận các nội dung tin nhắn `user` đầu tiên của `Thread` theo thứ tự cũ -> mới; bỏ qua tin ngắn dạng lời chào thuần túy (`hi`, `hello`, `hey`, `alo`, `chào`, `chao`, `ok`, `oki`, `test` sau khi trim & lowercase); nếu tất cả đều ngắn thì dùng tin `user` đầu tiên; làm sạch markdown đơn giản (`#`, `*`, `` ` ``, xuống dòng -> dấu cách) và cắt ở `MAX_THREAD_TITLE_CHARS` kèm `…` nếu vượt. Fallback cuối cùng: `"Cuộc trò chuyện"`.
- `extractMatchSnippet(content: string, query: string): string | null`: tìm vị trí match theo `foldThreadSearchText` (ưu tiên so khớp chính xác cụm `query`, hoặc token đầu tiên nếu tách từ); trích cửa sổ ~90 ký tự quanh đoạn khớp (kèm `…` ở đầu/cuối nếu bị cắt) để hiển thị preview dòng khớp dưới tiêu đề khi đang tìm kiếm.
- Type `ThreadSummary`:
  ```ts
  export interface ThreadSummary {
    threadId: string;
    title: string;
    matchedSnippet: string | null;
    lastMessageAt: string;
    messageCount: number;
    activeTopicSlug: string | null;
    activeTopicTitle: string | null;
    activeLessonTitle: string | null;
    isClosed: boolean;
  }
  ```

### 3.2. API Routes Next.js

1. **`GET /api/roadmap-assistant/threads`** (`app/api/roadmap-assistant/threads/route.ts`):
   - `requireWriteAccess(req)` -> 401 nếu không phải Owner.
   - Params: `q` (optional, cắt `MAX_THREAD_SEARCH_CHARS`), `limit` (clamp `1..100`, mặc định `30`).
   - Retention cutoff: `new Date(Date.now() - THREAD_RETENTION_MS)`.
   - **Khi `q` rỗng**:
     1. `prisma.threadMessage.groupBy({ by: ['threadId'], where: { threadId: { startsWith: OWNER_THREAD_PREFIX }, createdAt: { gte: cutoff } }, _max: { createdAt: true, id: true }, _count: { id: true }, orderBy: { _max: { id: 'desc' } }, take: limit })`.
     2. Lấy `threadIds` từ `groups`. Chạy song song:
        - `prisma.threadState.findMany({ where: { threadId: { in: threadIds } }, select: ... })`.
        - `prisma.threadMessage.groupBy({ by: ['threadId'], where: { threadId: { in: threadIds }, role: 'user' }, _min: { id: true } })` -> batch `findMany` đúng các `id` đó (`select: { threadId: true, content: true }`). Nếu có thread tin đầu thuộc lời chào ngắn hoặc không có role `user`, chạy tối đa **1** batch query bổ sung lấy vài tin đầu tiên cho nhóm thread đó (không loop!).
     3. Trả `{ threads: ThreadSummary[] }` kèm `NO_STORE`.
   - **Khi có `q`**:
     1. Tải song song tối đa `2500` `ThreadMessage` gần nhất trong `cutoff` (`orderBy: { id: 'desc' }`, `select: { id: true, threadId: true, role: true, content: true, createdAt: true }`) và tối đa `300` `ThreadState` gần nhất trong `cutoff`.
     2. Gom theo `threadId` trong memory (1 pass): xác định tin nhắn `user` đầu tiên làm `title`, `lastMessageAt`, `messageCount`, và kiểm tra `foldThreadSearchText` khớp trên `content` tin nhắn hoặc `activeTopicTitle` / `activeLessonTitle` / `activeTopicSlug`.
     3. Với thread khớp trong nội dung tin nhắn mà không nằm ở `title`, gán `matchedSnippet = extractMatchSnippet(...)` từ tin nhắn khớp gần nhất. Sort theo `lastMessageAt` giảm dần, cắt `limit`.
     4. Trả `{ threads: ThreadSummary[] }` kèm `NO_STORE`.

2. **`GET | PATCH | DELETE /api/roadmap-assistant/threads/[threadId]`** (`app/api/roadmap-assistant/threads/[threadId]/route.ts`):
   - Cả 3 method đều gọi `requireWriteAccess(req)` và validate `toOwnerThreadId(rawId)` (trả `400` nếu không hợp lệ).
   - **`GET`**: kiểm tra có ít nhất 1 `ThreadMessage` trong `cutoff` (không có -> `404`), trả `{ threadId: stripOwnerThreadPrefix(scoped), messages, state }` (format `messages` giống `GET /api/roadmap-assistant/thread` với `isRestored: true`).
   - **`PATCH`** (Switch hẳn sang Thread này làm Thread đang mở):
     - Kiểm tra Thread tồn tại trong `cutoff` -> không có trả `404`.
     - `prisma.$transaction`:
       - Tìm `latestMessage` của `owner:*` (`orderBy: { id: 'desc' }`, `select: { threadId: true }`).
       - `tx.threadState.updateMany({ where: { threadId: { startsWith: OWNER_THREAD_PREFIX, not: scoped }, closedAt: null }, data: { closedAt: now } })`.
       - Nếu `latestMessage && latestMessage.threadId !== scoped`: `tx.threadState.upsert({ where: { threadId: latestMessage.threadId }, create: { threadId: latestMessage.threadId, closedAt: now }, update: { closedAt: now } })`.
       - `tx.threadState.upsert({ where: { threadId: scoped }, create: { threadId: scoped, closedAt: null }, update: { closedAt: null } })`.
     - Đọc lại tối đa `MAX_THREAD_MESSAGES` tin mới nhất (`orderBy: { id: 'desc' }`, rồi `.reverse()`) và `state` của `scoped`, trả `{ threadId: stripOwnerThreadPrefix(scoped), messages, state }`.
   - **`DELETE`** (Xóa vĩnh viễn khỏi lịch sử):
     - `prisma.$transaction` chạy `threadMessage.deleteMany` + `threadState.deleteMany` cho `scoped`.
     - Trả `{ ok: true, threadId: stripOwnerThreadPrefix(scoped) }`.

3. **`GET /api/roadmap-assistant/thread`** (`app/api/roadmap-assistant/thread/route.ts`):
   - Cập nhật logic chọn `targetThreadId` như quy định ở Mục 2.2 (hỗ trợ khôi phục đúng Thread cũ vừa `PATCH` kích hoạt sau F5, nhưng vẫn giữ nguyên hành vi trả `{ threadId: null, messages: [] }` sau `DELETE /api/roadmap-assistant/thread`).

### 3.3. TypeScript SDK & Widget UX (`roadmap-rag-assistant/sdk/typescript/`)

1. **`client.ts` & `types.ts`**:
   - Khai báo `ThreadSummary`, `ThreadListResponse`, `ThreadDetailResponse` (`threadId`, `messages`, `state`).
   - Thêm trên `RoadmapChatClient`:
     - `listThreads(query?: string, signal?: AbortSignal): Promise<ThreadSummary[]>` (`GET ${this.baseUrl}/threads?q=...`)
     - `switchThread(threadId: string): Promise<ThreadDetailResponse>` (`PATCH ${this.baseUrl}/threads/${encodeURIComponent(threadId)}`)
     - `deleteThread(threadId: string): Promise<void>` (`DELETE ${this.baseUrl}/threads/${encodeURIComponent(threadId)}`)

2. **`useRoadmapAssistantChat.ts`**:
   - Thêm `switchToThread: (threadId: string) => Promise<void>` (hoặc `selectThread`):
     - Nếu đang stream (`abortControllerRef.current`), flush smooth stream và abort request hiện tại trước khi thay thế state.
     - Gọi `client.switchThread(threadId)` -> cập nhật `conversationId`, map `messages` (`status: 'complete'`, `isRestored: true`, `timestamp: new Date(m.timestamp)`), reset `error`, `activeTool`, `conversationContext` về `EMPTY_CONTEXT`, lưu vào `sessionStorage`.
   - Thêm `onThreadDeleted` / xử lý trong `clearMessages` hoặc `handleDeletedThread(deletedId)`: nếu `deletedId === conversationId`, reset widget về màn hình chào mới (`generateConversationId()`, `clearConversation(storageKey)`) **không cần** gọi `DELETE /thread` vì DB đã xóa rồi.

3. **`useThreadHistory.ts`**:
   - Nhận `baseUrl`, `isOpen`, `enabled` (`canWrite`).
   - Khi `isOpen && enabled`: tải danh sách ban đầu (`listThreads('')`), giữ danh sách đang có trong state khi search để không bị nháy màn hình (`isSearching` nhỏ ở ô input thay vì thay cả list bằng spinner).
   - Debounce `250ms` khi `query` thay đổi và hủy request trước qua `AbortController`.
   - Cung cấp lọc instant ở client (`filterThreadsLocally`) trong lúc đợi server trả `matchedSnippet` cho kết quả sâu trong nội dung tin nhắn.
   - `removeThread(threadId)`: gọi `client.deleteThread(threadId)` và cập nhật optimistic/local list ngay khi thành công; trả `boolean` để widget xử lý nếu trùng `conversationId` đang mở.

4. **`ThreadHistorySheet.tsx` & `ChatHeader.tsx` & `RoadmapChatbotWidget.tsx`**:
   - **`ChatHeader.tsx`**:
     - Thêm nút `Lịch sử chat` (`HistoryIcon` trong `icons.tsx`, viewBox `24x24`, stroke `1.5` kiểu Lucide) khi `canWrite` là `true`, đặt cạnh nút `Cuộc trò chuyện mới`.
     - Bấm mở: gọi `closeMenus()` rồi `openHistory()`.
   - **`RoadmapChatbotWidget.tsx`**:
     - State `isHistoryOpen`, đóng lẫn nhau với `isContextOpen` và `isMemoryOpen`.
     - Truyền `!isHistoryOpen` vào `useDrawerMotion` giống `isMemoryOpen` / `isContextOpen` để swipe mobile không đóng cả panel Abot.
     - Khi `switchToThread(id)` thành công: đóng `ThreadHistorySheet` (`setIsHistoryOpen(false)`), set `isAtBottomRef.current = true` và `autoFollowRef.current = true` để scroll gọn về cuối đoạn chat.
   - **`ThreadHistorySheet.tsx` (Bottom Sheet UX mượt)**:
     - Backdrop `absolute inset-0 z-30 flex items-end bg-black/20` (bấm nền hoặc nhấn `Esc` capture-phase để đóng).
     - Sheet `max-h-[85%] w-full flex-col overflow-hidden rounded-t-2xl border-t border-[#E6E4DF] bg-[#FFFFFF] shadow-[0_-0.25rem_1rem_rgba(0,0,0,0.06)] animate-in slide-in-from-bottom-2 duration-200`.
     - **Header**: icon `HistoryIcon` + `"Lịch sử chat"` + nút đóng `CloseIcon` (chạm lớn trên mobile `min-h-11 min-w-11`).
     - **Search bar**: icon `SearchIcon` + input `placeholder="Tìm tiêu đề, nội dung hoặc Topic…"` + nút xóa query `CloseIcon` (hiện khi `query.length > 0`) + spinner/chấm nhỏ khi `isSearching`. Chỉ `autoFocus` khi viewport `>= 768px`.
     - **Subheading**: `"Gần đây"` (hoặc `"Kết quả tìm kiếm"` khi đang lọc).
     - **List (`overscroll-contain`)**:
       - Skeleton 3 dòng khi đang load lần đầu (`isLoading && items.length === 0`).
       - Empty state rõ ràng: chưa có lịch sử (`"Chưa có cuộc trò chuyện nào trong 30 ngày qua."`) hoặc không tìm thấy (`"Không tìm thấy cuộc trò chuyện phù hợp."`).
       - Mỗi `<li>` gồm:
         - Button chọn chính (`flex-1 min-w-0`): `title` (1 dòng truncate) + badge `"Đang mở"` nếu `threadId === currentThreadId`; dòng dưới gồm `formatTime(lastMessageAt)` + badge `activeTopicTitle` (nếu có) + `matchedSnippet` (1-2 dòng `line-clamp-2` khi có match sâu).
         - Button xóa (`TrashIcon`): bấm lần 1 chuyển sang nút xác nhận inline `"Xóa?"` (`CheckIcon` + `CloseIcon` hủy, tự hết sau 4s) tránh xóa nhầm mà không cần dialog trình duyệt.
     - **Footer note**: `"Lưu tối đa 50 tin mỗi cuộc trò chuyện trong 30 ngày gần nhất."`

---

## 4. Step-by-Step Implementation Checklist

- [x] **Step 1 — Shared helpers & Validation (`lib/roadmap/thread-state.ts`)**:
  - Bổ sung constants (`DEFAULT_THREAD_LIST_LIMIT`, `MAX_THREAD_LIST_LIMIT`, `MAX_THREAD_SEARCH_CHARS`, `MAX_THREAD_TITLE_CHARS`), `ThreadSummary` type, `foldThreadSearchText`, `buildThreadTitle`, `extractMatchSnippet`.

- [x] **Step 2 — API Routes Next.js (`threads/route.ts`, `threads/[threadId]/route.ts`, `thread/route.ts`)**:
  - Tạo `app/api/roadmap-assistant/threads/route.ts#GET` (Owner-only, list + search tiếng Việt bỏ dấu + snippet, không query trong loop).
  - Tạo `app/api/roadmap-assistant/threads/[threadId]/route.ts#GET`, `#PATCH` (chuyển hẳn sang Thread đó trong `$transaction`), `#DELETE` (xóa Thread).
  - Cập nhật `app/api/roadmap-assistant/thread/route.ts#GET` để khôi phục đúng Thread cũ vừa được kích hoạt bằng `PATCH` sau F5 reload, vẫn giữ test không hồi sinh Thread sau `DELETE /thread`.

- [x] **Step 3 — TypeScript SDK Client & Hooks (`sdk/typescript/src/`)**:
  - Cập nhật `types.ts` và `client.ts` (`listThreads`, `switchThread`, `deleteThread`).
  - Tạo `react/useThreadHistory.ts` (fetch khi mở sheet, client filter tức thì + debounced server search `250ms` với `AbortController`, remove thread).
  - Cập nhật `react/useRoadmapAssistantChat.ts` (`switchToThread`, `handleThreadDeleted`).

- [x] **Step 4 — UI Components (`icons.tsx`, `ChatHeader.tsx`, `ThreadHistorySheet.tsx`, `RoadmapChatbotWidget.tsx`)**:
  - Thêm `HistoryIcon` và `SearchIcon` vào `icons.tsx`.
  - Cập nhật `ChatHeader.tsx` (nút `Lịch sử chat` khi `canWrite`).
  - Tạo `ThreadHistorySheet.tsx` (Bottom Sheet animation mượt, search bar, skeleton, relative time, topic tag, snippet, 2-step delete inline, `Esc`/backdrop dismiss, đạt chuẩn `axe-core`).
  - Nối vào `RoadmapChatbotWidget.tsx` (mutex với `ContextUsageSheet` / `OwnerMemorySheet`, khóa swipe drawer mobile khi đang mở sheet, auto-scroll sau switch).

- [x] **Step 5 — Tests (Route + Unit + A11y) & Manual Scenario**:
  - Tạo `tests/route/assistant-threads-route.test.ts` (**bắt buộc copy `prisma/test.db` riêng như `tests/route/assistant-thread-route.test.ts`** để không race condition với các suite test khác khi chạy `yarn test` song song): test `401` Visitor, `400` invalid ID, list + title fallback bỏ qua greeting, search tiếng Việt có/không dấu + snippet, `PATCH` switch hẳn trong `$transaction` kể cả khi Thread trước chưa có `ThreadState`, `DELETE`.
  - Cập nhật `tests/route/assistant-thread-route.test.ts` (F5 sau `PATCH` switch trả đúng Thread vừa chọn; sau `DELETE /thread` vẫn trả rỗng).
  - Tạo `tests/unit/thread-history-sheet.test.tsx` (render `Gần đây`, search debounce, switch Thread, 2-step delete, `Esc`/backdrop, `expectNoA11yViolations`).
  - Cập nhật `tests/unit/sdk-chat-hook.test.tsx` & `tests/unit/sdk-widget.test.tsx` (`switchToThread` abort stream cũ + nạp messages `isRestored`, nút `Lịch sử chat` chỉ hiện với `canWrite`).
  - Tạo kịch bản `tests/manual/abot-chats-history.md` theo quy ước `tests/manual/README.md`.

- [x] **Step 6 — Đồng bộ Code Intelligence (`cris-code-intel`) & Verification Gate**:
  - Cập nhật `.agents/skills/cris-code-intel/data/cris-workspace-map.json` (thêm entry points `/api/roadmap-assistant/threads`, `/api/roadmap-assistant/threads/[threadId]`, flow `FLOW_ABOT_THREAD_HISTORY`) và `docs/code-intel/CRIS_WORKSPACE_MAP.md`.
  - Chạy toàn bộ `verification_gate` và điền kết quả vào Mục 5.

---

## 5. Verification Gate Results
<!-- Executor điền: PENDING | PASSED | FAILED | SKIPPED -->
- [x] `TypeCheck`: PASSED (`yarn tsc --noEmit -p .` & `npx tsc --noEmit -p roadmap-rag-assistant/sdk/typescript/tsconfig.json`: 0 errors)
- [x] `Lint`: PASSED (`npx eslint --max-warnings=0` 11 file Next.js/test + `npx eslint --no-ignore --max-warnings=0` 10 file SDK: 0 errors, 0 warnings)
- [x] `Vitest Targeted`: PASSED (`7 test files passed (7)`, `56 passed (56)` in `4.75s`)
- [x] `Test`: PASSED (`yarn test`: `143 test files passed (143)`, `1370 passed | 8 skipped (1378)` in `16.81s`)
- [x] `Intel Status`: PASSED (`yarn intel status`: `🟢 OK: 260 ref map + 64 ref docs đều khớp code`, `Domains 6 | Entry Points 58 | Flows 20 | Data Models 10 | ADR Rules 17`)
- [x] `Doctor Delta`: PASSED (`yarn doctor --since main --check`: `0 bug · 0 risk · 0 nit · 0 mới`)
- [x] `Boundary Check`: PASSED (`25` file thay đổi/tạo mới đều nằm trong `allowed_to_modify`, 0 file vi phạm `strictly_forbidden`; thực thi trực tiếp nên không tạo `baseline.txt`/`result.json`)

## 6. Execution Audit Log
<!-- Executor điền. Không commit: Dev commit sau khi Claude verify -->
- **Result file**: N/A (thực thi trực tiếp theo yêu cầu Owner trên nhánh `feat/abot-chats-history`)
- **Modified Files** (`25` files + spec):
  - `app/styles/toast.css`
  - `components/ui/toast.tsx`
  - `components/roadmap/RoadmapAssistantChatbot.tsx`
  - `lib/roadmap/thread-state.ts`
  - `app/api/roadmap-assistant/thread/route.ts`
  - `app/api/roadmap-assistant/threads/route.ts`
  - `app/api/roadmap-assistant/threads/[threadId]/route.ts`
  - `roadmap-rag-assistant/sdk/typescript/src/types.ts`
  - `roadmap-rag-assistant/sdk/typescript/src/client.ts`
  - `roadmap-rag-assistant/sdk/typescript/src/react/types.ts`
  - `roadmap-rag-assistant/sdk/typescript/src/react/icons.tsx`
  - `roadmap-rag-assistant/sdk/typescript/src/react/useThreadHistory.ts`
  - `roadmap-rag-assistant/sdk/typescript/src/react/useRoadmapAssistantChat.ts`
  - `roadmap-rag-assistant/sdk/typescript/src/react/components/ChatHeader.tsx`
  - `roadmap-rag-assistant/sdk/typescript/src/react/components/MessageList.tsx`
  - `roadmap-rag-assistant/sdk/typescript/src/react/components/ThreadHistorySheet.tsx`
  - `roadmap-rag-assistant/sdk/typescript/src/react/RoadmapChatbotWidget.tsx`
  - `tests/route/assistant-thread-route.test.ts`
  - `tests/route/assistant-threads-route.test.ts`
  - `tests/unit/sdk-chat-hook.test.tsx`
  - `tests/unit/sdk-widget.test.tsx`
  - `tests/unit/thread-history-sheet.test.tsx`
  - `tests/manual/abot-chats-history.md`
  - `.agents/skills/cris-code-intel/data/cris-workspace-map.json`
  - `docs/code-intel/CRIS_WORKSPACE_MAP.md`
- **Bài học** (tối đa 3 dòng):
  - Khi kích hoạt lại một `Thread` cũ bằng `PATCH`, phải đồng thời upsert đóng cả `Thread` đang mở mới nhất chưa có row `ThreadState`, nếu không `GET /api/roadmap-assistant/thread` sẽ khôi phục nhầm sau reload.
  - Suy ra trạng thái loading lần đầu từ `!hasLoaded && !error` thay vì gọi `setIsLoading(true)` đồng bộ trong `useEffect` giúp tránh cascading renders và pass `react-hooks/set-state-in-effect`.
  - Suite test truy vấn toàn cục `owner:*` (`assistant-threads-route.test.ts`) phải copy `prisma/test.db` riêng để chạy song song không race condition với `threads-route.test.ts` và `assistant-thread-route.test.ts`, còn các token xác nhận nút bấm (`ok` từ `ConfirmActions`) cần được loại trừ khỏi search bucket và dùng word-boundary với truy vấn ngắn `<= 3` ký tự.
