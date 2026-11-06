# Context v3: AI Workflow Builder trên repo `crisne-website` — vòng phân tích thứ 3

> Trả lời bằng tiếng Việt, giữ nguyên thuật ngữ kỹ thuật tiếng Anh.
> Đây là **vòng 3**. Hai vòng trước đã được **kiểm chứng với code thật**. Tài liệu gồm: dữ kiện đã xác minh (mục 1–4), thiết kế đã chốt qua 2 vòng (mục 5), lỗi đã phát hiện ở vòng 2 (mục 6), và nhiệm vụ vòng 3 (mục 7).
> Nếu truy cập được repo, hãy tự đọc code để xác minh; nếu không, coi mục 2–4 là dữ kiện đã xác minh.
> Mọi nhận định phải gắn nhãn: **[Đã xác minh: <file:dòng>]** / **[Suy luận]** / **[Web: <nguồn>]** / **[Chưa xác minh]**.
> **Quy tắc quan trọng nhất của vòng này:** trước khi kết luận "không cần sửa file X", phải trace **mọi nơi dùng** file/hàm/dữ liệu đó (kể cả job nền, route khác, script) — hai vòng trước đều sai ở đúng điểm này.

## 1. Mục tiêu

Xây dựng **AI workflow builder** dựa trên repo hiện có:
1. **Builder:** Next.js + Tailwind + `@xyflow/react` + Zustand.
2. **Knowledge Base:** tài liệu theo **Project**.
3. **Runtime:** thực thi đồ thị theo **JSON DSL** do canvas sinh ra.
4. **Monitoring:** **Langfuse** (log, chi phí ước tính, đánh giá RAG, điều tra lỗi).

**Chưa quyết định:** một người dùng hay SaaS; billing Gemini hay BYOK; deploy Vercel hay Docker. Mặc định khi phân tích: **một người dùng**, key server-side, nền tảng deploy chưa biết.

## 2. Hiện trạng repo (đã xác minh)

**Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind, Yarn 4, Prisma 5, Vitest (66 test), GitHub Actions CI.

**Database (đính chính so với v1/v2):**
- `lib/prisma.ts`: **chỉ khi có cả `TURSO_DATABASE_URL` và `TURSO_AUTH_TOKEN`** mới dùng `@libsql/client` + `PrismaLibSQL` adapter. Ngược lại dùng **`PrismaClient` thuần với engine SQLite của Prisma** (file `prisma/dev.db`) — **không có** các hàm vector của libSQL ở local.
- Local đồng bộ schema bằng `prisma db push`; Turso quản lý **bằng tay** qua `prisma/init-turso.sql` (11 bảng) + `scripts/push-turso-schema.ts`.

**AI (`lib/ai/*`):**
- `llm-provider.ts`: interface `LlmProvider` { `generate`, `generateStream`, `embed` } + `setLlmProvider()`. `LlmGenerateParams` có `model: string`. **Không có tham số `AbortSignal`.**
- `gemini.ts`: `geminiProvider` là **singleton**; `getGenAI()` **đọc cứng `process.env.GEMINI_API_KEY`**. Khai báo `DEFAULT_CHAT_MODEL`, `FALLBACK_CHAT_MODEL`, `CHAT_MODEL_CHAIN`, embedding `gemini-embedding-001` 768 chiều.
- `resilient-llm.ts`: duyệt `CHAT_MODEL_CHAIN` (hardcode, ~dòng 28); lỗi quota/upstream/timeout → ngắt circuit, **chuyển ngay** sang model kế tiếp (không sleep). `llm-circuit-breaker.ts` export `isCircuitOpen`, `recordLlmFailure` (state `Map` in-memory).
- `rag-engine.ts`:
  - `findRelevantChunks(query, embedding, knowledgeBase: KnowledgeChunk[], topK)` → `ScoredChunk[]` với các trường **`score`**, `vectorScore`, `keywordScore` (không có `combinedScore`).
  - Ngưỡng `MIN_VECTOR_SCORE = 0.6`, `VECTOR_WEIGHT = 0.75`, `MAX_SCORE_GAP = 0.15` là hằng số module, dùng trong `findRelevantChunks`.
  - `STOP_WORDS` (có "cris", "nguyen") dùng trong **`keywordMatchScore`** (~dòng 77) — hàm export, có unit test.
  - Điểm keyword dựa nhiều vào `chunk.keywords` (keyword do người viết chọn) và `chunk.title`.
- `portfolio-knowledge.ts`: `KnowledgeChunk` = { `id`, `title`, **`category: "bio" | "experience" | "project" | "skill" | "service" | "faq" | "contact"`**, `content`, **`keywords: string[]` (bắt buộc)**, `embedding?` } — kiểu dữ liệu riêng của portfolio.
- `langfuse.ts`: Langfuse JS SDK v5 (OpenTelemetry), tracer provider riêng, `AsyncLocalStorageContextManager`, `exportMode: "immediate"`, mask PII, `environment`/`release`, score feedback. **Không gọi `after()`** (flush bằng `after()` nằm trong route).
- `chat-config.ts`: hằng số tên trace/observation/score dùng chung.

**Storage (`lib/r2-client.ts`):**
- `uploadToStorage(buffer, filename, contentType)`: key cố định `uploads/${filename}`. Nhánh fallback khi chưa cấu hình R2 ghi vào `public/uploads/` và **chỉ `mkdir` thư mục đó** (không tạo thư mục con).
- `deleteFromStorage(url)`: suy key từ public URL.
- **Job dọn file:** `listAllStorageFiles()` quét **toàn bộ prefix `uploads/`**; `findUnusedStorageFiles()` coi file là "không dùng" nếu URL **không xuất hiện trong nội dung `RoadmapItem`, `Roadmap`, `Note`**; `cleanupUnusedStorageFiles(targetFilenames?)` — không truyền danh sách thì **xoá toàn bộ file "không dùng"**. Được gọi từ `app/api/storage/cleanup/route.ts` (`GET` = quét, `POST` = xoá; **không có auth**).

**Khác:**
- Chưa cài `@xyflow/react`, `zustand`. `mapping-flow` là editor Lexical (localStorage), không phải canvas.
- UI kit đang trộn: antd, shadcn/@base-ui, @dnd-kit.
- Không có auth (không có `proxy.ts`/`middleware.ts`). `POST /api/v1/roadmaps` không auth; `POST /api/v1/clipper` cho qua khi thiếu `ADMIN_API_KEY`.
- `roadmap-rag-assistant/` (Python) không phải graph engine.

## 3. Ràng buộc vận hành (đã xác minh)

- **Next.js 16:** `middleware` đã deprecated, đổi tên thành **`proxy`**; file `proxy.ts` export `function proxy(request)` + `export const config = { matcher }` (tài liệu: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`).
- `maxDuration = 30` là cấu hình **riêng** của `app/api/chat/route.ts`; route mới tự đặt. Giới hạn thật theo nền tảng: **[Chưa xác minh]**.
- **Gemini free tier:** ~20 generate request/ngày cho `gemini-2.5-flash`, tính **theo project + model** (`GenerateRequestsPerDayPerProjectPerModel-FreeTier`).
- Cache, circuit breaker, rate limit: **in-memory theo instance**.
- **Langfuse Cloud** (JP): ingest trễ vài phút; Public API ~30 req/phút; dashboard API dưới `/api/public/unstable`; chi phí chỉ là **ước tính**.

## 4. Quy tắc làm việc của chủ repo

- Hạn chế tối đa thay đổi code legacy; chỉ sửa trong phạm vi task.
- Ưu tiên giải pháp đơn giản nhất; không thêm abstraction khi chưa cần.
- Trace đầy đủ từ usage đến logic trước khi kết luận.
- Đặt tên theo đúng component/hàm (ví dụ `isLoading`).

## 5. Thiết kế đã chốt qua 2 vòng (giữ nguyên, không phân tích lại)

- **Phạm vi:** một người dùng trước; SaaS cần store dùng chung (Redis), `projectId`/`tenantId` mọi nơi, metering riêng hoặc BYOK, job queue.
- **Cấu trúc:** `proxy.ts` (matcher `/workflows/:path*`, `/api/workflows/:path*`, **fail-closed**); `app/(workflow-builder)/workflows/*`; `app/api/workflows/*`; lõi `lib/workflow/*`; UI `components/workflow-canvas/*` chỉ dùng Tailwind + shadcn/@base-ui, `@xyflow/react` import động.
- **DSL v1:**
  - Tài liệu lưu = `graph` (`schemaVersion`, `nodes[{id,type,config}]`, `edges[{id,sourceNodeId,sourcePort,targetNodeId,targetPort}]`) + `ui` (`positions`, `labels`, `viewport`) tách riêng; `graphHash = sha256(canonical(graph))`.
  - **Port do registry phía server quyết định** qua `resolveNodePorts(node)`; DSL không chứa port. `condition`/`merge` sinh port từ `config`.
  - **Edge là nguồn sự thật duy nhất** cho thứ tự và dữ liệu; template chỉ đọc `{{inputs.<port>}}` của chính node.
  - Node v1: `input`, `rewrite`, `rag`, `condition`, `merge`, `llm`, `output`. Chưa có `http`/`code`.
  - Version: `Workflow.draftDsl` + `WorkflowVersion` bất biến (`versionNumber`, `graph`, `graphHash`, `ui`); mỗi `WorkflowRun` ghi `workflowVersionId` hoặc snapshot + hash của bản nháp.
  - 9 quy tắc validate: giới hạn quy mô (≤25 node, ≤10 node AI); ID duy nhất và tham chiếu tồn tại; không chu trình (Kahn); đúng 1 `input`, ≥1 `output`, mọi node nằm trên đường input→output; port tồn tại qua registry và cùng kiểu; port không `allowMultiple` nhận ≤1 edge, `merge.items` ≥2 edge; port `required` có edge; `condition` branch hợp lệ, không trùng, không trùng `else`; template chỉ tham chiếu port có edge.
  - **Ngữ nghĩa thực thi:** edge có trạng thái `PENDING → ACTIVE(value) | SKIPPED`; node được xét khi mọi edge vào khác `PENDING`; node thường chạy khi mọi port `required` có ≥1 edge `ACTIVE`, ngược lại `SKIPPED` và phát `SKIPPED` ra mọi edge; `condition` phát `ACTIVE` cho nhánh khớp đầu tiên (hoặc `else`), các nhánh khác `SKIPPED`; `merge` chờ đủ edge, chạy khi ≥1 `ACTIVE` (chiến lược `first_active` | `concat_documents` | `join_strings`), `SKIPPED` khi 100% edge `SKIPPED`; lỗi một node → **fail-fast toàn run**.
- **Langfuse:** 1 run = 1 trace; `sessionId` = id cuộc hội thoại (chạy đơn lẻ thì bỏ trống hoặc = `runId`), **không** dùng `workflowId`; `userId` = actor; metadata `{ projectId, workflowId, workflowVersion, runId, trigger }`, tags theo project/workflow/version. Trạng thái run trên UI lấy từ DB (`WorkflowRun`, `NodeExecution`), không từ Langfuse.
- **Quota:** bộ đếm ở `lib/workflow/workflow-llm.ts` + bảng `WorkflowQuotaUsage` (theo ngày + model); không đụng `resilient-llm.ts`; nên dùng **Google project/API key riêng** cho builder; model mặc định của node mới là `flash-lite`; có dry-run qua `setLlmProvider()`.
- **Timeout:** tham số hoá (`WORKFLOW_TIMEOUT_MS`, timeout theo node), không dựa vào con số 30s.
- **Vector store v1:** cột `embedding Bytes` (Float32Array) + tính điểm trong RAM; spike kiểm chứng vector native của Turso trước khi đổi (tiêu chí: chạy được ở mọi môi trường, recall Top-4 ≥95% so với quét toàn bộ, nhanh hơn ≥50ms ở 2.000 chunk).
- **Câu hỏi mở đã có mặc định:** auth = cookie `httpOnly` / header đối chiếu `WORKFLOW_ADMIN_SECRET` bằng `timingSafeEqual`, fail-closed; key = `GEMINI_WORKFLOW_API_KEY`; KB chỉ `.md`/`.txt` ở v1, có interface `DocumentParser`.

## 6. Lỗi của vòng 2 (đã kiểm chứng là sai — không được lặp lại)

| # | Vòng 2 nói | Thực tế |
|---|---|---|
| 1 | Lưu tài liệu vào `uploads/workflows/${projectId}/…` bằng cách truyền path qua `filename`, không sửa `r2-client.ts` | **Mất dữ liệu:** job dọn file quét toàn bộ `uploads/` và **xoá** mọi file không được tham chiếu trong `RoadmapItem`/`Roadmap`/`Note` → mọi tài liệu KB bị xoá. Phải dùng prefix tách khỏi `uploads/`. |
| 2 | Nhánh local (không R2) vẫn chạy với path con | Fallback chỉ `mkdir` `public/uploads` → `writeFile` vào thư mục con lỗi `ENOENT`. |
| 3 | Dùng `GEMINI_WORKFLOW_API_KEY` mà không sửa `gemini.ts` | `geminiProvider` singleton đọc cứng `GEMINI_API_KEY` → cần factory mới (sửa `gemini.ts`) hoặc adapter riêng. |
| 4 | Fail-fast bằng `AbortController` huỷ các nhánh đang bay | `LlmProvider` không nhận `AbortSignal` → request tới Gemini vẫn chạy và tốn quota. |
| 5 | Thêm `options?` cho `findRelevantChunks` là đủ cho `stopWords` | `STOP_WORDS` dùng trong `keywordMatchScore` (export, có test) → `options` phải truyền xuống hàm này. |
| 6 | Truyền chunk của project thẳng vào `findRelevantChunks` | `KnowledgeChunk.category` là union của portfolio, `keywords` bắt buộc; tài liệu chung không có keyword do người chọn → điểm keyword yếu. |
| 7 | `merge` sắp xếp theo `combinedScore` | Trường là `score`. |
| 8 | Spike giả định local là libSQL | Local dùng engine SQLite của Prisma (xem mục 2) — không có hàm vector. |

## 7. Nhiệm vụ của vòng 3

**Không viết lại thiết kế ở mục 5.** Chỉ trả về:

1. **Kế hoạch sửa file dùng chung tối thiểu**, giải quyết lỗi 1–6 ở mục 6. Với **mỗi** file dùng chung bị đụng (`lib/r2-client.ts`, `lib/ai/gemini.ts`, `lib/ai/llm-provider.ts`, `lib/ai/rag-engine.ts`, `lib/ai/portfolio-knowledge.ts`, `app/api/storage/cleanup/route.ts`…):
   - Thay đổi cụ thể (chữ ký hàm trước/sau).
   - **Toàn bộ nơi đang dùng** (route, script, test, job nền) và tác động lên từng nơi — đặc biệt `/api/chat`, job dọn file, `scripts/eval-retrieval.ts`, unit test.
   - Phương án thay thế **không sửa** file dùng chung (ví dụ viết bản riêng trong `lib/workflow/`) và lý do chọn/loại.
2. **Storage cho KB:** prefix mới, cách tránh job dọn file, cách chạy ở local khi chưa có R2, cách xoá file khi xoá document/project.
3. **Retrieval cho tài liệu chung:** kiểu dữ liệu chunk của project; điểm keyword khi không có `keywords` do người chọn (ví dụ dùng `title`/heading, hoặc giảm `vectorWeight` keyword); tham số hoá stop-words; có nên tách thuật toán thành hàm thuần mới thay vì sửa `findRelevantChunks`.
4. **Huỷ thật sự khi fail-fast:** có thêm `signal?` vào `LlmProvider` không, tác động tới `gemini.ts` và các test hiện có; nếu không thêm thì fail-fast còn ý nghĩa gì.
5. **Spike vector cập nhật** theo mục 2 (local là SQLite của Prisma): chạy spike ở đâu (Turso thật / libSQL local qua `file:` URL / bỏ qua local), và hệ quả cho dev workflow.
6. **Rủi ro bảo mật còn sót** trong thiết kế mục 5 (ví dụ toán tử `regex` của `condition` chạy biểu thức do người dùng nhập trên server → ReDoS).
7. **Danh sách test bắt buộc** cho giai đoạn 1–2 (tên test + hành vi kiểm chứng), ưu tiên các test bắt được đúng các lỗi ở mục 6.

Yêu cầu: ngắn gọn, ưu tiên bảng; mọi **[Đã xác minh]** kèm file:dòng; không lặp lại lỗi ở mục 6.
