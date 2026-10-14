# Context v2: AI Workflow Builder trên repo `crisne-website` — vòng phân tích thứ 2

> Trả lời bằng tiếng Việt, giữ nguyên thuật ngữ kỹ thuật tiếng Anh.
> Đây là **vòng 2**. Vòng 1 đã có một bản phân tích; bản đó đã được **kiểm chứng với code thật**. Tài liệu này gồm: dữ kiện đã xác minh (mục 1–4), tóm tắt kết quả vòng 1 kèm phần đính chính (mục 5), và nhiệm vụ của vòng 2 (mục 6).
> Nếu bạn truy cập được repo, hãy tự đọc code để xác minh; nếu không, coi mục 2–4 là dữ kiện đã được xác minh.
> Mọi nhận định trong câu trả lời phải gắn một trong ba nhãn: **[Đã xác minh: <file:dòng>]** / **[Suy luận]** / **[Web: <nguồn>]** (không có nguồn thì ghi **[Chưa xác minh]**).

## 1. Mục tiêu

Dựa trên repo hiện có để xây dựng một nền tảng **AI workflow builder** gồm 4 phần:

1. **Frontend / Builder:** Next.js + Tailwind CSS + `@xyflow/react` + Zustand — canvas kéo thả để thiết kế workflow.
2. **Knowledge Base:** quản lý tài liệu theo **Project**.
3. **Execution Runtime:** engine thực thi đồ thị, dựa trên **JSON DSL do Canvas sinh ra**.
4. **Monitoring & Trace:** **Langfuse** — ghi log, theo dõi chi phí, đánh giá chất lượng RAG, phát hiện lỗi.

**Chưa quyết định:** một người dùng (công cụ cá nhân/nội bộ) hay **SaaS nhiều người dùng**; bật billing Gemini hay BYOK; deploy Vercel hay Docker (VPS/Railway/Fly).

## 2. Hiện trạng repo (đã xác minh)

**Stack:** Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind, Yarn 4 (`nodeLinker: node-modules`), Prisma 5 + SQLite qua adapter libSQL (có cấu hình Turso), Vitest (66 test), GitHub Actions CI.
Repo là site cá nhân: `/` = Roadmap Workspace, `/portfolio` = portfolio có chatbot RAG "Cris AI" (`/api/chat`), cùng `/notes` (Notion), `/knowledge`, `/docs`…

**Phần AI (`lib/ai/*`):**
- `llm-provider.ts`: interface `LlmProvider` độc lập vendor (`generate`, `generateStream`, `embed`) + `setLlmProvider()` để thay bằng bản giả khi test. `LlmGenerateParams` **đã có `model: string`** (model chọn theo từng lời gọi).
- `gemini.ts`: adapter Gemini — chat `gemini-2.5-flash`, fallback `gemini-2.5-flash-lite`, embedding `gemini-embedding-001` 768 chiều; khai báo `CHAT_MODEL_CHAIN`.
- `resilient-llm.ts`: duyệt `CHAT_MODEL_CHAIN` (**hardcode**, khoảng dòng 28); gặp lỗi quota/upstream/timeout thì **ngắt circuit và chuyển ngay** sang model kế tiếp — **không chờ/sleep theo `retryDelay`**. Lỗi khác báo ngay.
- `llm-circuit-breaker.ts`: circuit theo model, state là `Map` in-memory theo instance; quota ngắt theo `retryDelay` (tối đa 1h), upstream 30s.
- `llm-errors.ts`: phân loại lỗi `quota | timeout | upstream | unknown`, đọc `retryDelay`.
- `rag-engine.ts`: `findRelevantChunks(query, embedding, knowledgeBase, topK)` (đã nhận KB làm tham số); hybrid cosine + keyword, bỏ dấu tiếng Việt. Ngưỡng `MIN_VECTOR_SCORE = 0.6`, `VECTOR_WEIGHT = 0.75`, `MAX_SCORE_GAP = 0.15` và `STOP_WORDS` (có cả "cris", "nguyen") là **hằng số cấp module**, tinh chỉnh riêng cho dữ liệu portfolio. Tìm kiếm brute-force trong RAM.
- `knowledge-base.ts`: KB là **hằng số TypeScript 17 chunk**, vector trong `lib/ai/data/knowledge-vectors.json` (commit vào git, import tĩnh), có content hash phát hiện index cũ. **Không có** upload/parse/chunking.
- `response-cache.ts`: cache câu trả lời in-memory (TTL 6h).
- `langfuse.ts`: Langfuse JS SDK v5 trên OpenTelemetry, tracer provider riêng + đăng ký `AsyncLocalStorageContextManager`, `exportMode: "immediate"`, che email/số điện thoại, gắn `environment`/`release`, score feedback 👍/👎 với id cố định. **Không gọi `after()`** — việc flush bằng `after()` nằm trong route.
- `chat-config.ts`: hằng số dùng chung cho tên trace/observation/score/dataset giữa route, dashboard và eval.

**Route mẫu `app/api/chat/route.ts`:** `export const maxDuration = 30` (cấu hình **riêng của route này**); mỗi request = 1 trace với observation `rewrite-query` (generation), `embed-query` (embedding), `retrieve` (retriever, có điểm từng chunk), `answer` (generation, có token usage); `propagateAttributes` cho `traceName`/`sessionId`; flush bằng `after()`.

**Script & test:** `eval-retrieval.ts`, `setup-langfuse-dashboard.ts`, `sync-langfuse-dataset.ts`, `check-knowledge-index.ts`, `scripts/lib/langfuse-api.ts` (REST client có retry 429); 66 test Vitest, gồm contract test cho route dùng `LlmProvider` giả + `InMemorySpanExporter` (không gọi mạng).

**Hạ tầng khác:**
- `lib/r2-client.ts`: `uploadToStorage(buffer, filename, contentType)` **gán cứng key `uploads/${filename}`** (không nhận prefix); `deleteFromStorage(url)` suy key từ public URL.
- `lib/rate-limit.ts`: rate limit theo IP, `Map` in-memory.
- DB: local dùng `prisma db push` (SQLite qua libSQL); schema trên Turso quản lý **bằng tay** qua `prisma/init-turso.sql` (11 bảng) + `scripts/push-turso-schema.ts`.

**Không có / không dùng lại được:**
- Chưa cài `@xyflow/react`, `zustand`.
- `app/mapping-flow`, `components/mapping-flow`: editor Lexical dạng tab lưu `localStorage` — **không phải canvas đồ thị**.
- Repo dùng cùng lúc **antd, shadcn/@base-ui, @dnd-kit**.
- **Không có auth:** không có `proxy.ts`/`middleware.ts`, không có thư viện auth. `POST /api/v1/roadmaps` không kiểm tra auth; `POST /api/v1/clipper` kiểm tra `x-admin-key` nhưng **cho qua khi không đặt `ADMIN_API_KEY`**.
- Prisma chưa có model cho project / document / workflow / run.
- `roadmap-rag-assistant/` (Python FastAPI, có cài LangChain/LangGraph nhưng không dùng `StateGraph`) là executor tạo/sửa roadmap — không phải graph engine.
- Không có `vercel.json`; nơi deploy chưa chốt.

## 3. Ràng buộc vận hành đã quan sát

- **Gemini free tier:** khoảng 20 generate request/ngày cho `gemini-2.5-flash`; quota tính **theo project + model** (lỗi trả về ghi `GenerateRequestsPerDayPerProjectPerModel-FreeTier`). `flash-lite` có quota riêng.
- **Next.js 16:** file convention `middleware` **đã deprecated, đổi tên thành `proxy`** (tài liệu đi kèm: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`).
- **`maxDuration`** là cấu hình theo route; route mới có thể tự đặt. Giới hạn tối đa thực tế phụ thuộc nền tảng/gói deploy — **chưa xác minh**.
- Cache, circuit breaker, rate limit đều **in-memory theo instance**.
- **Langfuse Cloud** (region JP): ingest trễ vài phút; Public API khoảng 30 request/phút; API dashboard nằm dưới `/api/public/unstable`; org mới bị chặn một số API cũ (dùng v2/v3). Chi phí trên Langfuse chỉ là **ước tính** (token × bảng giá của Langfuse), vẫn hiện chi phí khi đang free tier.

## 4. Quy tắc làm việc của chủ repo

- Hạn chế tối đa thay đổi code legacy; chỉ sửa trong phạm vi task.
- Ưu tiên giải pháp đơn giản nhất; không thêm abstraction khi chưa cần.
- Trace đầy đủ từ usage đến logic trước khi kết luận.
- Đặt tên theo đúng component/hàm, không theo use-case (ví dụ `isLoading`).

## 5. Kết quả vòng 1 và phần kiểm chứng

### 5.1 Các đề xuất của vòng 1 được giữ lại (đã kiểm chứng hợp lý)

- **Khả thi:** bản một người dùng khả thi trên repo hiện tại; SaaS chỉ khả thi khi thay toàn bộ state in-memory bằng store dùng chung (Redis/Upstash), có `projectId`/`tenantId` trên mọi bảng và prefix R2, metering riêng hoặc BYOK, và job queue cho tác vụ dài.
- **Cấu trúc code:** module riêng trong repo hiện tại — route group `app/(workflow-builder)/workflows/`, API `app/api/workflows/*`, lõi `lib/workflow/` (dsl-types, dsl-validator, dag-executor, nodes/, document-ingestor, canvas-store), component `components/workflow-canvas/`; **không sửa** `lib/ai/*` phục vụ `/api/chat` trừ khi tách thêm hàm thuần.
- **DSL — luồng dữ liệu:** **edge là nguồn sự thật duy nhất** cho cả thứ tự chạy lẫn dữ liệu; template trong node **chỉ** đọc `{{inputs.<port>}}` của chính node; cấm `{{nodes.X...}}`.
- **7 quy tắc validate:** không chu trình (Kahn); đúng 1 node `input` và ≥1 `output` có đường đi từ `input`; port tồn tại và cùng kiểu; mỗi port nhận ≤1 edge trừ khi `allowMultiple`; port `required` phải có edge; template chỉ tham chiếu port khai báo của chính node; node `condition` mỗi nhánh là một output port riêng.
- **Node set MVP:** `input`, `rewrite`, `rag`, `merge`, `condition`, `llm`, `output` (7 loại); **chưa** làm `http`/`code`.
- **Langfuse:** 1 run = 1 trace; mỗi node = 1 observation (`llm`/`rewrite` → generation; `rag` → span chứa embedding + retriever có điểm từng chunk; còn lại → span). **Trạng thái run trên UI lấy từ DB** (`WorkflowRun`, `NodeExecution`), không lấy từ Langfuse. Chi phí trên Langfuse chỉ để tham khảo; chặn quota cần bộ đếm riêng. Phát hiện lỗi cần thêm Sentry hoặc tương đương + ghi trạng thái `RUNNING` vào DB trước khi chạy để phát hiện run bị kill.
- **Giữ trace liền mạch qua nhiều invocation:** lưu `traceId` (32 hex) + `rootSpanId` (16 hex) vào `WorkflowRun`, khôi phục parent context bằng `trace.setSpanContext(...)` + `context.with(...)` ở mỗi invocation, flush cuối mỗi invocation — **cần kiểm chứng bằng test**.
- **Bảo mật:** auth cho cả bản một người dùng, kiểm tra key theo kiểu **fail-closed**; `projectId` luôn lấy từ bản ghi `Workflow` đã xác thực, không tin body; key R2 theo project và chặn `..`; nếu sau này có node HTTP thì chặn SSRF (chỉ https, chặn dải IP nội bộ sau khi phân giải DNS, cấm redirect, timeout, giới hạn body); node code dùng biến đổi khai báo (JSONata/JMESPath) thay cho chạy JS tự do; bọc context RAG trong thẻ phân cách để giảm prompt injection; secret mã hoá AES-256-GCM, không bao giờ đưa vào span.
- **Quota:** dùng **2 API key ở 2 project Google khác nhau** (một cho `/api/chat`, một cho builder) để builder không làm hết quota của chatbot; mặc định model `flash-lite` cho builder; có chế độ dry-run dùng `setLlmProvider()`.
- **UI:** module mới chỉ dùng Tailwind + shadcn/@base-ui, `@xyflow/react` import động (`ssr: false`).
- **Build vs adopt:** tự xây hợp lý khi muốn giữ stack TypeScript/Next.js/Turso/R2 đồng nhất và tận dụng `lib/ai/*` + bộ test; adopt (Langflow MIT, Flowise Apache 2.0) khi chỉ cần dùng ngay. Dify có điều khoản hạn chế multi-tenant SaaS — **[Chưa xác minh trong vòng này]**.

### 5.2 Lỗi của vòng 1 (đã kiểm chứng là sai — không được lặp lại)

| # | Vòng 1 nói | Thực tế |
|---|---|---|
| 1 | Builder phải dừng trước 27 giây vì "giới hạn cứng 30s"; soft timeout 27s và ≤5 node dựa trên tiền đề này | `maxDuration = 30` chỉ là cấu hình của `/api/chat`. Route mới tự đặt `maxDuration`; giới hạn thật phụ thuộc nền tảng deploy (chưa xác minh). |
| 2 | Tạo `middleware.ts` | Next.js 16 đã đổi tên thành **`proxy.ts`** (`middleware` deprecated). |
| 3 | `resilient-llm.ts` gặp 429 sẽ chờ `retryDelay` vài chục giây rồi bị kill | Không chờ; ngắt circuit và chuyển ngay sang model kế tiếp. |
| 4 | Cần thêm tham số `options.model` vào `gemini.ts` | `LlmGenerateParams` đã có `model`. Chỗ cần tham số hoá là `CHAT_MODEL_CHAIN` hardcode trong `resilient-llm.ts`. |
| 5 | `r2-client.ts` không cần sửa, chỉ cần truyền key | `uploadToStorage` gán cứng prefix `uploads/`; muốn prefix theo project phải thêm hàm mới (hoặc sửa hàm — file dùng chung). |
| 6 | `langfuse.ts` flush bằng `after()` | `after()` nằm trong route, không nằm trong `langfuse.ts`. |

### 5.3 Lỗ hổng thiết kế còn mở từ vòng 1 (vòng 2 phải giải quyết)

| # | Vấn đề |
|---|---|
| A | Vòng 1 đặt **`sessionId = workflowId`** → mọi lượt chạy của một workflow dồn vào một session khổng lồ trên Langfuse. Cần định nghĩa lại `sessionId`, `userId`, metadata. |
| B | DSL vòng 1 khai báo **port ngay trong từng node**, đồng thời có registry ngầm theo `type` → **hai nguồn sự thật cho port**; client có thể tự khai báo port tuỳ ý. |
| C | DSL **không có version của workflow** (chỉ có `schemaVersion`) → không ghim được version cho từng lượt chạy, không có khái niệm bản publish bất biến. |
| D | **Chưa định nghĩa lan truyền `SKIPPED`** sau `condition`, nhất là khi đi vào `merge` có port bắt buộc (chạy, bỏ qua hay chờ mãi?). |
| E | Bộ đếm quota được đề xuất đặt **trong `resilient-llm.ts`** — file dùng chung với `/api/chat`, mâu thuẫn với nguyên tắc tách module. |
| F | Vector Turso (`F32_BLOB(768)` + `libsql_vector_idx`, Prisma `Unsupported(...)` + `$queryRaw`) được đề xuất là **lựa chọn số 1**, nhưng chưa xét: local dùng `prisma db push` còn Turso quản lý bằng `init-turso.sql` viết tay; vector có chạy được ở cả local lẫn Turso không. |
| G | Vị trí node (`position`) nằm chung với phần ngữ nghĩa mà runtime đọc — chưa có lý do. |
| H | Các số liệu từ web của vòng 1 chưa có nguồn: gói Langfuse Hobby ~50.000 unit/tháng và lưu dữ liệu ~30 ngày; Vercel giới hạn 30s/60s; Prisma hỗ trợ `Unsupported("F32_BLOB(768)")` trên SQLite. |

## 6. Nhiệm vụ của vòng 2

**Không viết lại toàn bộ bản phân tích.** Lấy mục 5.1 làm nền, và chỉ trả về:

1. **Đính chính theo mục 5.2:** với mỗi lỗi, nêu phần nào của đề xuất vòng 1 thay đổi (ví dụ: soft timeout và giới hạn số node có còn cần không, đặt ở đâu, theo tiêu chí gì khi chưa chốt nền tảng deploy).
2. **Giải quyết từng lỗ hổng A–H ở mục 5.3**, mỗi mục gồm: phương án chọn, lý do, phương án đã loại và vì sao.
3. **DSL v1 hoàn chỉnh** sau khi giải quyết B, C, D, G:
   - TypeScript types + một ví dụ JSON hợp lệ có `condition` → hai nhánh → `merge` → `llm` → `output`.
   - Danh sách quy tắc validate cập nhật.
   - Đặc tả ngữ nghĩa thực thi: thứ tự chạy, `SKIPPED` lan truyền thế nào, `merge` nhận gì khi một nhánh bị bỏ qua, xử lý lỗi của một node (dừng cả run hay tiếp tục nhánh khác).
4. **Phương án vector store** sau khi giải quyết F, kèm một **spike** cụ thể (các bước, tiêu chí đạt/không đạt) để kiểm chứng trước khi chốt.
5. **Lộ trình cập nhật** (chỉ ghi phần thay đổi so với vòng 1), mỗi giai đoạn có tiêu chí "xong khi" đo được.
6. **Câu hỏi mở còn lại** — chỉ những câu thực sự chặn quyết định, kèm phương án mặc định nếu chủ repo chưa trả lời.

Yêu cầu:
- Ngắn gọn, ưu tiên bảng và gạch đầu dòng.
- Mọi nhãn **[Đã xác minh]** phải kèm file (và dòng nếu được).
- Tách rõ **sửa file dùng chung** (`lib/ai/*`, `lib/r2-client.ts`, …) với **code mới trong module riêng**; nếu đề xuất sửa file dùng chung thì nêu lý do và tác động tới `/api/chat`.
- Không lặp lại các lỗi ở mục 5.2.
