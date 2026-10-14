# Context: Đánh giá hướng xây dựng AI Workflow Builder dựa trên repo `crisne-website`

> Trả lời bằng tiếng Việt, giữ nguyên thuật ngữ kỹ thuật tiếng Anh.
> Nếu bạn truy cập được repo, hãy tự đọc code để xác minh các dữ kiện bên dưới; nếu không, coi chúng là dữ kiện đã được xác minh.
> Phân biệt rõ trong câu trả lời: **đã xác minh** / **giả định – suy luận** / **thông tin từ web** (ghi nguồn; nếu không chắc thì nói không chắc).

## 1. Mục tiêu

Dựa trên repo hiện có để xây dựng một nền tảng **AI workflow builder** gồm 4 phần:

1. **Frontend / Builder:** Next.js + Tailwind CSS + `@xyflow/react` + Zustand — canvas kéo thả để thiết kế workflow.
2. **Knowledge Base:** quản lý tài liệu theo **Project**.
3. **Execution Runtime:** engine thực thi đồ thị, dựa trên **JSON DSL do Canvas sinh ra**.
4. **Monitoring & Trace:** **Langfuse**, đảm nhiệm toàn bộ việc ghi log, tính tiền, đánh giá chất lượng RAG và phát hiện lỗi.

**Chưa quyết định:** dùng cho một người (công cụ cá nhân/nội bộ) hay **SaaS nhiều người dùng** → hãy phân tích cả hai kịch bản và khuyến nghị.

## 2. Hiện trạng repo (đã xác minh)

**Stack:** Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind, Yarn 4 (`nodeLinker: node-modules`), Prisma 5 + SQLite qua adapter libSQL (có cấu hình Turso), Vitest, GitHub Actions CI.
Repo là site cá nhân: `/` = Roadmap Workspace, `/portfolio` = portfolio có chatbot RAG "Cris AI" (`/api/chat`), cùng `/notes` (Notion), `/knowledge`, `/docs`…

**Phần AI tái sử dụng được (`lib/ai/*`):**
- `llm-provider.ts`: interface `LlmProvider` độc lập vendor (`generate`, `generateStream`, `embed`) + hook `setLlmProvider()` để thay bằng bản giả khi test.
- `gemini.ts`: adapter Gemini — chat `gemini-2.5-flash`, fallback `gemini-2.5-flash-lite` (chuỗi model đang hardcode trong `CHAT_MODEL_CHAIN`), embedding `gemini-embedding-001` 768 chiều.
- `resilient-llm.ts` + `llm-circuit-breaker.ts`: chuyển model khi lỗi quota/upstream/timeout; circuit breaker theo model (state là `Map` in-memory theo instance).
- `llm-errors.ts`: phân loại lỗi `quota | timeout | upstream | unknown`, đọc `retryDelay` từ lỗi Gemini.
- `rag-engine.ts`: hybrid retrieval (cosine + keyword, bỏ dấu tiếng Việt, ngưỡng vector 0.6, cắt theo khoảng cách điểm 0.15), viết lại câu hỏi nối tiếp. Tìm kiếm là brute-force trên mảng trong RAM; stop-words và ngưỡng được tinh chỉnh riêng cho dữ liệu portfolio.
- `knowledge-base.ts`: knowledge base là **hằng số TypeScript 17 chunk**, vector lưu trong `lib/ai/data/knowledge-vectors.json` (commit vào git, import tĩnh), có content hash để phát hiện index cũ. **Không có** upload/parse/chunking tài liệu.
- `response-cache.ts`: cache câu trả lời in-memory (TTL 6h).
- `langfuse.ts`: Langfuse JS SDK v5 trên OpenTelemetry, tracer provider riêng, `exportMode: "immediate"`, che email/số điện thoại trước khi gửi, gắn `environment`/`release`, score feedback 👍/👎 với id cố định.
- `chat-config.ts`: hằng số dùng chung cho tên trace/observation/score giữa route, dashboard và eval.

**Route mẫu `app/api/chat/route.ts`:** mỗi request = 1 trace với các observation `rewrite-query` (generation), `embed-query` (embedding), `retrieve` (retriever, kèm điểm từng chunk), `answer` (generation, có token usage); `propagateAttributes` cho `traceName`/`sessionId`; flush Langfuse bằng `after()` của Next.js; `maxDuration = 30` (serverless).

**Script & test:** `eval-retrieval.ts` (Hit@4, MRR, Precision@4, off-topic), `setup-langfuse-dashboard.ts` (dựng dashboard 11 widget qua Public API), `sync-langfuse-dataset.ts` (đẩy eval case + trace bị 👎 vào Langfuse Dataset), `check-knowledge-index.ts`; 66 test Vitest gồm contract test cho route dùng `LlmProvider` giả + `InMemorySpanExporter` (không tốn quota).

**Hạ tầng khác:** `lib/r2-client.ts` upload/xoá/list file trên Cloudflare R2 (chưa có prefix theo project); `lib/rate-limit.ts` rate limit theo IP bằng `Map` in-memory.

**Không có / không dùng lại được:**
- Chưa cài `@xyflow/react` và `zustand`.
- `app/mapping-flow` + `components/mapping-flow` **không phải canvas đồ thị** — là editor Lexical dạng tab, lưu `localStorage`.
- Repo đang dùng cùng lúc **antd, shadcn/@base-ui, @dnd-kit** (UI kit bị phân mảnh).
- **Không có auth:** không có `middleware.ts`/`proxy.ts`, không có thư viện auth. `POST /api/v1/roadmaps` không kiểm tra auth; `POST /api/v1/clipper` kiểm tra header `x-admin-key` nhưng **cho qua khi không đặt `ADMIN_API_KEY`**.
- Prisma schema chưa có model nào cho project / document / workflow / run.
- Service Python `roadmap-rag-assistant/` (FastAPI, cài LangChain/LangGraph nhưng không dùng `StateGraph`) chỉ là executor tạo/sửa roadmap — không phải graph engine.
- Không có `vercel.json`; nơi deploy chưa chốt (code có đọc `VERCEL_GIT_COMMIT_SHA`).

## 3. Ràng buộc vận hành đã quan sát

- **Gemini API key đang ở free tier:** khoảng 20 generate request/ngày cho `gemini-2.5-flash`; đã hết quota nhiều lần khi phát triển. `flash-lite` có quota riêng.
- **Serverless:** route có `maxDuration = 30` giây.
- Cache, circuit breaker, rate limit đều **in-memory theo instance** (sai khi chạy nhiều instance).
- **Langfuse Cloud** (region JP): ingest trễ vài phút; Public API giới hạn khoảng 30 request/phút; API dashboard nằm dưới `/api/public/unstable`; org mới bị chặn một số API cũ (phải dùng v2/v3). Chi phí hiển thị trên Langfuse chỉ là **ước tính** = token × bảng giá của Langfuse (vẫn hiện chi phí dù đang free tier).

### 3.1 Dữ kiện bổ sung (đã xác minh, dễ bị hiểu sai)

- `maxDuration = 30` là **cấu hình riêng của route `app/api/chat/route.ts`**, không phải giới hạn chung của ứng dụng. Route mới có thể tự đặt `maxDuration`; giới hạn tối đa thực tế phụ thuộc nền tảng và gói deploy (**chưa xác minh** — nơi deploy chưa chốt).
- Repo dùng **Next.js 16**: file convention `middleware` **đã deprecated và đổi tên thành `proxy`** (theo tài liệu đi kèm `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`). Route guard mới phải dùng `proxy.ts`.
- `lib/ai/resilient-llm.ts` **không chờ/sleep theo `retryDelay`**: gặp lỗi quota/upstream/timeout thì ngắt circuit của model đó và **chuyển ngay** sang model kế tiếp trong `CHAT_MODEL_CHAIN` (đang hardcode trong file này, dòng ~28).
- `LlmGenerateParams` (`lib/ai/llm-provider.ts`) **đã có trường `model: string`** — provider đã nhận model theo từng lời gọi.
- `lib/ai/rag-engine.ts`: `findRelevantChunks(query, embedding, knowledgeBase, topK)` đã nhận knowledge base làm tham số; các ngưỡng (`MIN_VECTOR_SCORE = 0.6`, `VECTOR_WEIGHT = 0.75`, `MAX_SCORE_GAP = 0.15`) và `STOP_WORDS` là **hằng số cấp module**.
- `lib/r2-client.ts`: `uploadToStorage(buffer, filename, contentType)` **gán cứng prefix `uploads/${filename}`**, không nhận key/prefix tuỳ ý; `deleteFromStorage(url)` suy ra key từ public URL.
- Flush Langfuse bằng `after()` được gọi **trong route**, không nằm trong `lib/ai/langfuse.ts`.
- Schema DB: local dùng `prisma db push` (SQLite qua adapter libSQL); schema trên Turso được quản lý **bằng tay** qua `prisma/init-turso.sql` + `scripts/push-turso-schema.ts`.
- Quota free tier của Gemini tính **theo project + model** (lỗi trả về ghi `GenerateRequestsPerDayPerProjectPerModel-FreeTier`).

## 4. Quy tắc làm việc của chủ repo

- Hạn chế tối đa thay đổi code legacy; chỉ sửa trong phạm vi task.
- Ưu tiên giải pháp đơn giản nhất; không thêm abstraction khi chưa cần.
- Trace đầy đủ từ usage đến logic trước khi kết luận.
- Đặt tên theo đúng component/hàm, không theo use-case (ví dụ `isLoading`, không phải `isFeatLoading`).

## 5. Những gì cần phân tích (theo đúng thứ tự)

1. **Kết luận khả thi** có điều kiện, cho từng kịch bản: một người dùng / SaaS.
2. **Những gì repo đã có và tái sử dụng được** (kèm file, mức tái sử dụng).
3. **Những gì còn thiếu** (độ khó, rủi ro).
4. **Điều kiện cần** và **điều kiện đủ** — tách bạch — cho cả 4 phần Builder / Knowledge Base / Runtime / Monitoring.
5. **Phác thảo JSON DSL tối thiểu** (workflow, node, edge, port, version) và các ràng buộc validate. Yêu cầu bắt buộc phải trả lời:
   - **Một nguồn sự thật cho luồng dữ liệu**: edge quyết định luồng và thứ tự; template trong node chỉ tham chiếu input của chính node đó.
   - **Một nguồn sự thật cho port**: port của từng loại node do registry phía server quy định hay khai báo trong từng node của DSL? Nếu cả hai thì xử lý xung đột thế nào?
   - **Version của workflow** (không chỉ version của schema): bản đã publish có bất biến không, mỗi lượt chạy ghi lại version nào.
   - **Ngữ nghĩa nhánh bị bỏ qua (`SKIPPED`)** sau node `condition`, đặc biệt khi đi vào node gộp (`merge`) có port bắt buộc.
   - Tách thông tin layout của canvas (vị trí node) khỏi phần ngữ nghĩa mà runtime đọc, hay để chung — và lý do.
6. **Kiến trúc runtime** (chạy trong Next.js route / job queue như Inngest, Trigger.dev, BullMQ / service riêng) với trade-off, có xét giới hạn serverless; cách giữ trace Langfuse liền mạch khi một run chạy qua nhiều step/invocation.
7. **Vector store và lưu trữ tài liệu theo project** (Turso vector, Postgres + pgvector, Qdrant/Upstash/Pinecone, giữ brute-force…) với trade-off.
8. **Langfuse:** cách ánh xạ run/node sang trace/observation (nêu rõ `sessionId`, `userId`, metadata mang giá trị gì và vì sao — tránh gom mọi lượt chạy của một workflow vào một session); đánh giá thực tế từng kỳ vọng "ghi log / tính tiền / đánh giá chất lượng RAG / phát hiện lỗi" — cái nào Langfuse đáp ứng được, cái nào cần công cụ khác (ví dụ metering riêng, Sentry); giới hạn khối lượng trace của các gói Langfuse.
9. **Bảo mật:** auth (kể cả cho bản một người dùng, vì runtime gọi LLM mà public sẽ bị lạm dụng quota), cách ly dữ liệu giữa project/tenant, SSRF (node HTTP), sandbox (node code), prompt injection từ tài liệu, lưu secret/API key.
10. **Rủi ro lớn nhất** và cách giảm thiểu.
11. **Lộ trình theo giai đoạn**, mỗi giai đoạn có tiêu chí "xong khi" đo được.
12. **Build vs adopt:** so sánh ngắn với Langflow, Flowise, Dify (license, khả năng làm SaaS, tích hợp Langfuse, mức tuỳ biến) — khi nào nên tự xây.
13. **Cấu trúc code:** đặt builder trong repo hiện tại (module riêng như `app/workflows/`, `lib/workflow/`) hay tách monorepo/app riêng.
14. **Câu hỏi mở** cần chủ repo quyết định.

Yêu cầu: ngắn gọn, ưu tiên bảng và gạch đầu dòng; không đề xuất sửa code legacy ngoài phạm vi cần thiết.

Yêu cầu bổ sung:
- Mọi nhãn **"đã xác minh"** phải kèm đường dẫn file (và dòng nếu được). Không gắn nhãn này cho suy luận.
- Phân biệt rõ **sửa file dùng chung** (`lib/ai/*`, `lib/r2-client.ts`, …) với **code mới trong module riêng**; nếu đề xuất sửa file dùng chung thì nêu lý do và tác động tới `/api/chat`.
- Với lựa chọn vector store, nêu rõ cách quản lý schema ở **cả local lẫn Turso** (xem mục 3.1) và đề xuất một bước thử nghiệm (spike) nếu chưa chắc.
- Số liệu từ web (giới hạn gói Langfuse, giới hạn thời gian function của nền tảng deploy, license) phải ghi nguồn; nếu không có nguồn thì ghi "chưa xác minh".
