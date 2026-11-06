# Workflow Builder — Thiết kế đã chốt

> Tài liệu tham chiếu duy nhất cho Workflow Builder. Chốt sau 2 vòng phân tích độc lập + kiểm chứng với code (thay thế `workflow-builder-context*.md`).
> Nhãn: **[XM]** đã xác minh trong code/tài liệu · **[CXM]** chưa xác minh, kiểm tra khi tới lúc.

## 1. Quyết định sản phẩm

| Chủ đề | Quyết định |
|---|---|
| Phạm vi | Công cụ **một người dùng** (chủ repo), là dự án nổi bật trên portfolio. Chưa làm SaaS. Mọi bảng mới có `projectId` + `ownerId` để mở rộng sau. |
| Build vs adopt | **Tự xây**, tận dụng `lib/ai/*`, Prisma, R2, bộ test và CI hiện có. |
| Vị trí code | Module riêng trong repo: `proxy.ts`, `app/(workflow-builder)/workflows/*`, `app/api/workflows/*`, `lib/workflow/*`, `components/workflow-canvas/*`. |
| Auth | **Google OAuth**, chỉ cho phép email trong allowlist. |
| Gemini key | **Dùng chung key hiện tại** giai đoạn đầu; sau này tách Google project riêng + bật billing (kèm quota giới hạn). |
| Deploy | **Vercel**; domain cấu hình DNS ở **Hostinger**. |

## 2. Hệ quả của các quyết định

### 2.1 Google OAuth
- Thư viện: **Auth.js v5 (`next-auth@beta`)** — `auth()` dùng được trong `proxy.ts`, Server Component và route handler; session **JWT, không cần bảng DB**. Peer dependency hỗ trợ Next 16 **[XM: npm `next-auth@5.0.0-beta.32`]**. Vẫn là bản beta → spike ngắn ở giai đoạn 0; phương án dự phòng: `next-auth` v4 (stable) với `getToken()` trong proxy.
- `proxy.ts` chạy Node.js runtime **[XM: `node_modules/next/dist/docs/.../proxy.md`]**, matcher `/workflows/:path*`, `/api/workflows/:path*`.
- Callback `signIn` chỉ chấp nhận email trong `AUTH_OWNER_EMAILS`; **biến trống → từ chối tất cả** (fail-closed).
- Env: `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_OWNER_EMAILS` (server-only, không `NEXT_PUBLIC_`).
- Google Cloud Console: tạo OAuth client, **Authorized redirect URI** = `https://<domain-chính>/api/auth/callback/google` và `http://localhost:3334/api/auth/callback/google`. Chọn **một** domain chính (apex hoặc `www`) và redirect domain còn lại về đó, nếu không sẽ gặp `redirect_uri_mismatch`.
- Các route ghi dữ liệu **gọi từ máy** (service Python Roadmap Assistant gọi `/api/v1/roadmaps/*`) không dùng session Google được → giữ cơ chế header `x-admin-key` nhưng sửa thành **fail-closed**.

### 2.2 Dùng chung Gemini key (free tier)
- Quota free tier tính **theo project + model** (~20 request/ngày cho `gemini-2.5-flash`) **[XM: lỗi trả về `GenerateRequestsPerDayPerProjectPerModel-FreeTier`]** → builder và chatbot `/portfolio` **cạnh tranh cùng quota**.
- Giảm thiểu trong giai đoạn đầu:
  - Node AI của builder **chỉ dùng `gemini-2.5-flash-lite`** (để dành `flash` cho chatbot).
  - Bộ đếm quota của builder (bảng `WorkflowQuotaUsage`, theo ngày + model) chặn trước khi gọi.
  - Chế độ **dry-run** dùng `setLlmProvider()` để thử luồng mà không tốn quota.
- **Không sửa `lib/ai/gemini.ts`** lúc này. Khi tách key: thêm factory `createGeminiProvider(apiKey)` tương thích ngược (`geminiProvider` giữ nguyên).

### 2.3 Vercel + Hostinger
- **Thời lượng function:** Fluid compute mặc định **300s trên mọi gói**; Hobby tối đa 300s, Pro tối đa 800s **[XM: [Vercel Functions Limits](https://vercel.com/docs/functions/limitations), [Fluid compute](https://vercel.com/docs/fluid-compute)]** → workflow v1 **chạy trực tiếp trong route**, đặt `maxDuration` rõ ràng (đề xuất 120s) + timeout theo node; **chưa cần job queue**. **[CXM]** project đã bật Fluid compute chưa — kiểm tra trong dashboard Vercel.
- **Filesystem chỉ tạm thời** → tài liệu KB **bắt buộc lưu R2** ở production; ghi file local chỉ dùng khi dev.
- **Nhiều instance** → state cần chính xác (bộ đếm quota, trạng thái run) phải nằm trong **DB**, không dùng `Map` in-memory.
- **Hostinger:** chỉ là DNS trỏ về Vercel; không ảnh hưởng runtime. Ảnh hưởng duy nhất là domain dùng cho OAuth redirect URI và `AUTH_URL` (nếu cần).
- Gói Hobby của Vercel dành cho mục đích cá nhân, phi thương mại **[CXM: kiểm tra điều khoản nếu sau này thương mại hoá]**.

## 3. Kiến trúc kỹ thuật

### 3.1 DSL v1 (`lib/workflow/dsl-types.ts`)
- Tài liệu lưu = **`graph`** (`schemaVersion`, `nodes[{id, type, config}]`, `edges[{id, sourceNodeId, sourcePort, targetNodeId, targetPort}]`) + **`ui`** (`positions`, `labels`, `viewport`). `graphHash = sha256(canonical(graph))` — kéo thả không đổi hash.
- **Port do registry phía server quyết định** qua `resolveNodePorts(node)`; DSL không chứa port. `condition`/`merge` sinh port từ `config`.
- **Edge là nguồn sự thật duy nhất** cho thứ tự và dữ liệu. Template trong node chỉ đọc `{{inputs.<port>}}` của chính node.
- 7 loại node: `input`, `rewrite`, `rag`, `condition`, `merge`, `llm`, `output`. Toán tử của `condition`: `contains`, `equals`, `length_gt` (**không có `regex`** — tránh ReDoS). Chưa có `http`/`code`.
- Version: `Workflow.draftGraph`/`draftUi` + `WorkflowVersion` bất biến (`versionNumber`, `graph`, `graphHash`, `ui`); mỗi `WorkflowRun` ghi `workflowVersionId` hoặc snapshot + hash của bản nháp.

### 3.2 Quy tắc validate (`lib/workflow/dsl-validator.ts`, chạy ở server — không tin client)
1. Quy mô: ≤25 node, ≤10 node AI (`rewrite`, `rag`, `llm`).
2. ID node/edge duy nhất; edge trỏ tới node tồn tại.
3. Không chu trình (Kahn); trả về danh sách node trong chu trình.
4. Đúng 1 `input`, ≥1 `output`; mọi node nằm trên đường đi `input` → `output`.
5. Port tồn tại theo `resolveNodePorts`, kiểu dữ liệu trùng nhau.
6. Port không `allowMultiple` nhận ≤1 edge; `merge.items` ≥2 edge.
7. Port `required` có edge.
8. `condition`: tên nhánh hợp lệ, không trùng, không trùng `else`; ≥1 nhánh có edge đi ra.
9. Template chỉ tham chiếu `inputs.<port>` có trong registry của chính node và đã có edge.

### 3.3 Ngữ nghĩa thực thi (`lib/workflow/dag-executor.ts`, hàm thuần `executeWorkflow(graph, inputs, deps)`)
- Edge: `PENDING → ACTIVE(value) | SKIPPED`. Node được xét khi **mọi** edge vào khác `PENDING`.
- Node thường: chạy khi mọi port `required` có ≥1 edge `ACTIVE`; ngược lại `SKIPPED` và phát `SKIPPED` ra mọi edge.
- `condition`: nhánh khớp đầu tiên (hoặc `else`) `ACTIVE`, các nhánh còn lại `SKIPPED`.
- `merge`: chờ đủ edge; chạy khi ≥1 `ACTIVE` (`first_active` | `concat_documents` | `join_strings`; `concat_documents` khử trùng theo chunk id, sắp theo `score`); `SKIPPED` khi 100% edge `SKIPPED`.
- Lỗi một node → **dừng cả run** (node lỗi `FAILED`, phần còn lại `CANCELLED`). v1 chỉ ngừng chờ; huỷ thật request đang bay (thêm `signal?` vào `LlmProvider`) để giai đoạn 4.
- Không phụ thuộc `next/server`; route chịu trách nhiệm `after(flushLangfuse)`.

### 3.4 Knowledge Base
- **Storage:** prefix riêng **`workflow-kb/{projectId}/{documentId}`**, helper mới trong `lib/workflow/` dùng lại `r2Client`/`isR2Configured` **[XM: export từ `lib/r2-client.ts`]**. Nằm **ngoài `uploads/`** → job dọn file (`findUnusedStorageFiles` quét `uploads/`) không xoá nhầm **[XM]**. Dev không có R2: ghi vào thư mục riêng với `mkdir -p`.
- Định dạng v1: `.md`, `.txt`; interface `DocumentParser` cho PDF sau.
- **Retrieval:** hàm mới trong `lib/workflow/`, dùng lại `normalizeText`, `cosineSimilarity` **[XM: export từ `lib/ai/rag-engine.ts`]**. Kiểu chunk tổng quát (`id`, `documentId`, `heading`, `content`, `embedding`); điểm keyword từ heading + nội dung; `topK`, ngưỡng vector, trọng số, khoảng cách điểm, stop-words cấu hình theo node. **Không sửa** `findRelevantChunks`, `KnowledgeChunk`, `rag-engine.ts`.
- **Vector:** cột `embedding Bytes` (Float32Array 768d) + tính điểm trong RAM; `contentHash` theo document/chunk để không embed lại. Chỉ thử vector native Turso khi >~2.000 chunk/project, chạy spike **trên Turso thật** (local dùng engine SQLite của Prisma, không có hàm vector **[XM: `lib/prisma.ts`]**).

### 3.5 Langfuse
- 1 run = 1 trace; mỗi node = 1 observation (`llm`/`rewrite` → generation; `rag` → span chứa embedding + retriever có điểm từng chunk; còn lại → span).
- `sessionId` = id cuộc hội thoại (chạy đơn lẻ: `runId`); `userId` = email chủ; metadata `{ projectId, workflowId, workflowVersion, runId, trigger }`; tags theo project/workflow/version. Hằng số tên dùng chung trong `lib/workflow/` (giống `chat-config.ts`).
- **Trạng thái run trên UI lấy từ DB** (`WorkflowRun`, `NodeExecution`); Langfuse dùng để điều tra (ingest trễ vài phút, Public API ~30 req/phút **[XM]**).
- Chi phí trên Langfuse chỉ là ước tính; chặn quota bằng bảng riêng. Cảnh báo lỗi tức thời: Sentry ở giai đoạn 4.

### 3.6 Thay đổi vào file dùng chung (toàn bộ)
| File | Thay đổi |
|---|---|
| `prisma/schema.prisma` + `prisma/init-turso.sql` | Thêm bảng mới (`WorkflowProject`, `ProjectDocument`, `ProjectChunk`, `Workflow`, `WorkflowVersion`, `WorkflowRun`, `NodeExecution`, `WorkflowQuotaUsage`). Không sửa 11 bảng cũ. |
| `package.json` | Thêm `next-auth@beta`, `@xyflow/react`, `zustand`. |
| Các route ghi dữ liệu hiện có | Giai đoạn 0: thêm auth (session Google cho trình duyệt; `x-admin-key` fail-closed cho máy). |

Không sửa `lib/ai/*`, `lib/r2-client.ts`, `/api/chat`.

## 4. Lộ trình

| Giai đoạn | Nội dung | Xong khi |
|---|---|---|
| **0. Tiền đề** (1–2 ngày) | Spike Auth.js v5 + Google trên Next 16 (local + Vercel preview); `proxy.ts`; auth cho các route ghi hiện có, nhất là `POST /api/storage/cleanup`; kiểm tra Fluid compute trên Vercel. | Đăng nhập Google bằng email trong allowlist vào được `/workflows`, email khác bị từ chối, biến allowlist trống → từ chối tất cả; mọi route ghi trả 401 khi không có session/key; 66 test cũ pass. |
| **1. Engine headless** (1–2 tuần) | Bảng Prisma (local + Turso), DSL types, validator, executor, node `input`/`condition`/`merge`/`llm`/`output`, quota counter, trace Langfuse. | Test dùng provider giả kiểm chứng đủ 9 quy tắc validate, `SKIPPED` lan truyền, `merge` khi một nhánh bị bỏ qua, dừng run khi node lỗi, cây span đúng; chạy thật 1 workflow và thấy trace trên Langfuse. |
| **2. Knowledge Base** (1–2 tuần) | Upload `.md/.txt` → R2 `workflow-kb/`, chunk, embed, `contentHash`, hàm retrieval mới, node `rewrite`/`rag`, eval theo project. | Project A không bao giờ trả chunk của project B; upload lại tài liệu không đổi → 0 lần `embed()`; job dọn file không đụng `workflow-kb/`; eval trên tập câu hỏi mẫu đạt Hit@4 ≥ 0.8. |
| **3. Canvas** (2–3 tuần) | `@xyflow/react` + Zustand, form cấu hình node, validate realtime, Run draft, Publish. | Kéo thả không đổi `graphHash`; dựng và chạy được `input → condition → 2 nhánh → merge → llm → output` từ UI, thấy rõ nhánh `SKIPPED`. |
| **4. Gia cố** | Tách Gemini key + billing + quota giới hạn; `signal?` để huỷ thật; Sentry; job queue nếu cần. | Theo nhu cầu thực tế. |

## 5. Còn chưa xác minh
- Project Vercel đã bật Fluid compute chưa; gói Hobby hay Pro.
- Giới hạn số trace/observation của gói Langfuse đang dùng.
- Auth.js v5 (beta) chạy ổn trên Next 16 + Vercel — kiểm chứng ở spike giai đoạn 0.
