# Workflow Builder — Kế hoạch theo mốc

> Triển khai [`workflow-builder-design.md`](./workflow-builder-design.md). Thiết kế là nguồn sự thật; file này chia việc.
> Cập nhật: 2026-10-14. **Mỗi mốc kết thúc bằng thứ bạn tự thử được bằng tay**, không chỉ unit test.

## Tổng quan

| Mốc | Bạn thử được gì khi xong | Ước lượng | Trạng thái |
|---|---|---|---|
| **M0. Nền tảng** | Đăng nhập Google vào `/workflows`; engine chạy được trong unit test | — | ✅ (còn việc tay ở mục M0) |
| **M1. Chạy qua API** | Gọi API → workflow chạy thật bằng Gemini, thấy kết quả trong DB + trace trên Langfuse | 2–3 ngày | ⏭ tiếp theo |
| **M2. Canvas chạy được** | **Kéo thả workflow trên trình duyệt, bấm Run, thấy từng node xanh/xám/đỏ** | 1–1,5 tuần | |
| **M3. Knowledge Base** | Upload `.md`, dựng workflow `input → rag → llm → output`, hỏi đáp trên tài liệu của mình | 1–1,5 tuần | |
| **M4. Publish + Production** | Publish version, chạy trên domain thật (Vercel) | 2–3 ngày | |
| **M5. Gia cố** | Tách Gemini key, nút Cancel, Sentry — theo nhu cầu | — | |

Thứ tự đổi so với lộ trình gốc: **Canvas (M2) làm trước Knowledge Base (M3)** để có giao diện thử sớm; canvas chỉ cần engine, không cần KB. Node `rewrite`/`rag` hiện trên canvas từ M2 nhưng báo "chưa có" tới M3.

Quy ước chung (mọi mốc):
- Mỗi mốc 1 nhánh, commit theo từng phần; `yarn test`, `yarn lint`, `tsc` xanh trước khi commit.
- Không sửa `lib/ai/*`, `lib/r2-client.ts`, `/api/chat`, 11 bảng cũ. Env server-only. UI chỉ Tailwind + shadcn/@base-ui. Node AI chỉ `gemini-2.5-flash-lite`. State cần chính xác nằm trong DB.
- ⚠️ `.env` chứa `TURSO_*`: script chạy local qua `lib/prisma` sẽ trỏ **Turso thật**. Script thử dùng `PrismaClient({ datasourceUrl: "file:./dev.db" })` hoặc bỏ 2 biến khỏi `.env`.

---

## M0. Nền tảng ✅

| Phần | File | Kiểm chứng |
|---|---|---|
| Auth Google + allowlist + `proxy.ts` | `auth.ts`, `proxy.ts`, `lib/auth/*` | Đăng nhập local OK |
| Mọi route ghi trả 401 khi ẩn danh; route công khai có chủ ý: `chat`, `chat/feedback`, `favorites` (rate limit) | `tests/route/write-routes-guard.test.ts`, `tests/route/write-access.test.ts` | 37 handler → 401; bỏ guard thử → test fail |
| 8 bảng workflow (local + SQL Turso) | `prisma/schema.prisma`, `prisma/init-turso.sql` | SQL chạy 2 lần trên SQLite trống, khớp schema; cascade OK |
| DSL types + `graphHash` | `lib/workflow/dsl-types.ts`, `graph-hash.ts` | Kéo thả không đổi hash |
| Node registry (port theo type + config) | `lib/workflow/node-registry.ts` | 9 test |
| Validator (cấu trúc JSON + 9 quy tắc) | `lib/workflow/dsl-validator.ts` | 40 test + mutation |
| Executor (SKIPPED, merge, dừng khi lỗi, timeout) | `lib/workflow/dag-executor.ts` | 12 test + mutation |
| Handler `input`/`condition`/`merge`/`llm`/`output` (provider truyền vào, không dùng `setLlmProvider` toàn cục) | `lib/workflow/nodes/*` | 20 test, chạy workflow mẫu với LLM giả |

**Việc tay còn lại (bạn làm, không chặn M1):**
- [ ] Đăng nhập bằng email ngoài allowlist → phải bị từ chối.
- [ ] `yarn db:turso:init` để tạo 8 bảng trên Turso (chỉ `CREATE … IF NOT EXISTS`).
- [ ] Vercel: thêm `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_OWNER_EMAILS`; thêm redirect URI domain thật trong Google Console; xem Fluid compute đã bật chưa, gói Hobby hay Pro.
- [ ] Langfuse: xem giới hạn trace/tháng của gói đang dùng.

---

## M1. Chạy qua API (2–3 ngày)

**Mục tiêu:** workflow lưu trong DB, chạy thật bằng Gemini qua HTTP, mỗi lần chạy để lại `WorkflowRun` + `NodeExecution` và 1 trace Langfuse.

### Phần việc

**1. Quota** — `lib/workflow/quota.ts`
- `withQuota(provider)` bọc `LlmProvider`: trước mỗi `generate`, tăng `WorkflowQuotaUsage(day UTC, model)` trong transaction; vượt hạn mức → lỗi `QUOTA_EXCEEDED`, **không** gọi Gemini.
- Hạn mức qua env `WORKFLOW_DAILY_LLM_LIMIT` (mặc định 15/ngày cho `flash-lite`, chừa quota cho chatbot).
- Dry-run dùng provider giả, không đi qua quota.

**2. Trace Langfuse** — `lib/workflow/tracing.ts`
- 1 run = 1 trace (`workflow-run`); mỗi node 1 observation qua hook `onNodeStart`/`onNodeFinish`: `llm` → generation (model, token), còn lại → span; node SKIPPED/CANCELLED vẫn có span với `level` tương ứng.
- Metadata `{ projectId, workflowId, runId, trigger, dryRun }`, `userId` = email chủ. Dùng lại `lib/ai/langfuse` (chỉ import, không sửa).

**3. Repository** — `lib/workflow/repository.ts`
- `listProjects`, `createProject`, `listWorkflows`, `createWorkflow`, `getWorkflow`, `saveDraft(graph, ui)` (tính `draftGraphHash`).
- `runWorkflow({ workflowId, input, dryRun })`: validate bản nháp → tạo `WorkflowRun` (snapshot + hash) → `executeWorkflow` với hook ghi `NodeExecution` → cập nhật trạng thái run, output, `traceId`.
- Mọi hàm lọc theo `ownerId` (email trong session).

**4. API** — `app/api/workflows/**/route.ts` (đã được `proxy.ts` chặn khi chưa đăng nhập)

| Method | Đường dẫn | Việc |
|---|---|---|
| `GET` / `POST` | `/api/workflows/projects` | Liệt kê / tạo project |
| `GET` / `POST` | `/api/workflows?projectId=` | Liệt kê / tạo workflow |
| `GET` / `PUT` | `/api/workflows/[id]` | Lấy / lưu nháp (validate, trả `errors[]` nếu sai — vẫn lưu nháp) |
| `POST` | `/api/workflows/[id]/runs` | Chạy (`{ input: { query }, dryRun? }`), `maxDuration = 120`, `after(flushLangfuse)` |
| `GET` | `/api/workflows/[id]/runs/[runId]` | Trạng thái run + từng node |

**5. Dữ liệu mẫu + script** — `scripts/seed-sample-workflow.ts`
- Tạo 1 project + workflow mẫu `input → condition → (greeting | else) → merge → llm → output` trong `dev.db`.

### Tự thử khi xong M1
1. `npx tsx scripts/seed-sample-workflow.ts` → in ra `workflowId`.
2. Mở `/workflows` để có session, rồi trong DevTools Console:
   ```js
   await (await fetch("/api/workflows/<id>/runs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ input: { query: "Hello Cris" }, dryRun: true }) })).json()
   ```
   → `status: "SUCCEEDED"`, nhánh `else` bị `SKIPPED`.
3. Bỏ `dryRun` → câu trả lời thật từ Gemini; xem trace trên Langfuse.
4. Đặt `WORKFLOW_DAILY_LLM_LIMIT=1`, chạy 2 lần → lần 2 lỗi `QUOTA_EXCEEDED`; chatbot `/portfolio` vẫn trả lời.

### Xong khi
- [ ] Test route: run dry-run ghi đủ `NodeExecution`; draft sai → `errors[]`; vượt quota → không gọi provider; trace có đúng cây span (Langfuse mock).
- [ ] Chạy thật 1 lần, thấy trace trên Langfuse.
- [ ] Không có session → 401.

---

## M2. Canvas chạy được (1–1,5 tuần)

**Mục tiêu:** dựng và chạy workflow hoàn toàn trên trình duyệt.

### Phần việc

**1. Trang danh sách** — `app/(workflow-builder)/workflows/page.tsx`
- Chọn/tạo project, danh sách workflow, nút "Tạo workflow" (tạo sẵn `input → output`). `loading.tsx` + `error.tsx`.

**2. Store + chuyển đổi** — `lib/workflow/canvas-store.ts`, `canvas-mapping.ts`
- Cài `@xyflow/react`, `zustand`. Store giữ `graph` và `ui` tách riêng; kéo node chỉ đổi `ui`.
- Chuyển DSL ↔ node/edge của React Flow; test round-trip giữ nguyên `graphHash`.

**3. Canvas** — `app/(workflow-builder)/workflows/[id]/page.tsx`, `components/workflow-canvas/*`
- `Canvas.tsx` import động (`ssr: false`); 7 custom node, handle lấy từ `resolveNodePorts` (port `condition` đổi theo nhánh).
- `Palette.tsx` kéo thả thêm node; chặn nối sai kiểu port ngay khi kéo (`isValidConnection`).
- Xoá node/edge bằng phím Delete.

**4. Cấu hình node** — `components/workflow-canvas/NodeConfigPanel.tsx`
- Form theo loại: danh sách nhánh `condition` (thêm/xoá/sắp xếp), `mode` của `merge`, `prompt`/`system`/`temperature` của `llm`.

**5. Lưu + validate** — dùng `PUT /api/workflows/[id]`
- Tự lưu nháp (debounce ~1s); lỗi validate hiện viền đỏ trên node/edge + danh sách lỗi; nút Run bị khoá khi còn lỗi.

**6. Chạy thử** — `components/workflow-canvas/RunPanel.tsx`
- Ô nhập query, công tắc dry-run, nút Run; tô màu node theo trạng thái (xanh SUCCEEDED, xám SKIPPED, đỏ FAILED); bấm node xem input/output/thời gian/token; hiện output cuối.

### Tự thử khi xong M2
1. Vào `/workflows` → tạo workflow.
2. Kéo `condition`, `merge`, `llm` vào, nối `input → condition → 2 nhánh → merge → llm → output`.
3. Thử nối `llm.text` vào port sai kiểu → không nối được. Bỏ một edge bắt buộc → thấy lỗi, Run bị khoá.
4. Run với "Hello" và "Something else" → thấy nhánh không chạy chuyển xám.
5. Kéo node đi chỗ khác, tải lại trang → vị trí giữ nguyên.

### Xong khi
- [ ] Dựng và chạy được workflow mẫu từ UI, thấy rõ nhánh SKIPPED.
- [ ] Kéo thả không đổi `graphHash` (test).
- [ ] Không lỗi console; dùng được trên màn hình ≥1024px.

---

## M3. Knowledge Base (1–1,5 tuần)

**Mục tiêu:** hỏi đáp trên tài liệu riêng của từng project.

### Phần việc

**1. Lưu file** — `lib/workflow/kb/storage.ts`
- R2 prefix `workflow-kb/{projectId}/{documentId}` (dùng lại `r2Client`, `isR2Configured`); dev không có R2 → thư mục local riêng. Nằm ngoài `uploads/` nên job dọn file không xoá nhầm.

**2. Đọc + chia đoạn** — `lib/workflow/kb/parser.ts`, `chunker.ts`
- `.md`, `.txt` (interface `DocumentParser` để thêm PDF sau); chia theo heading, giữ `heading`.

**3. Ingest** — `lib/workflow/kb/ingest.ts`
- Lưu file → chunk → `contentHash` → chỉ embed chunk mới (768 chiều, lưu `Bytes`). Đi qua quota.

**4. Retrieval** — `lib/workflow/kb/retrieval.ts`
- Keyword + vector (dùng lại `normalizeText`, `cosineSimilarity`), `topK`, `minScore`; **luôn lọc `projectId`**.

**5. Node `rewrite` + `rag`** — `lib/workflow/nodes/rewrite.ts`, `rag.ts`
- Thay handler "chưa có"; span Langfuse của `rag` ghi điểm từng chunk.

**6. API + UI tài liệu** — `app/api/workflows/projects/[projectId]/documents/**`, `components/workflow-canvas/DocumentsPanel.tsx`
- Upload/xoá/liệt kê; giới hạn kích thước + định dạng. Panel cấu hình `rag` chọn tài liệu.

**7. Eval** — `scripts/eval-kb.ts`, `lib/workflow/fixtures/kb-eval/*.json`
- Bộ câu hỏi mẫu + chunk kỳ vọng, đo Hit@4.

### Tự thử khi xong M3
1. Upload 2–3 file `.md` vào project A.
2. Dựng `input → rag → llm → output` (nối `rag.documents` vào `llm.context`), hỏi một câu có trong tài liệu → trả lời đúng; bấm node `rag` xem chunk + điểm.
3. Upload lại file cũ → không tốn lượt embed.
4. Project B hỏi cùng câu → không thấy tài liệu của A.

### Xong khi
- [ ] Project A không bao giờ trả chunk của B (test).
- [ ] Upload lại tài liệu không đổi → 0 lần `embed()` (test).
- [ ] Job dọn file không đụng `workflow-kb/` (test).
- [ ] Hit@4 ≥ 0.8 trên bộ câu hỏi mẫu.

**Rủi ro:** quá ~2.000 chunk/project thì tính cosine trong RAM chậm → thử vector native trên Turso thật.

---

## M4. Publish + Production (2–3 ngày)

**Phần việc**
- Publish → `WorkflowVersion` bất biến (`POST /api/workflows/[id]/versions`); danh sách version; chạy theo version; sửa nháp không đổi version cũ.
- Deploy Vercel: env đủ, Turso đã có bảng, R2 cho KB, `maxDuration` 120s.
- Rà `loading.tsx`/`error.tsx`, thông báo lỗi thân thiện (quota, timeout).

**Tự thử:** publish v1, sửa nháp, chạy lại v1 → kết quả theo v1; mở domain thật, đăng nhập, chạy workflow có `rag`.

**Xong khi:** chạy được trên production; email ngoài allowlist bị từ chối trên production.

---

## M5. Gia cố (theo nhu cầu)

| Việc | Khi nào làm |
|---|---|
| Tách Gemini key: `createGeminiProvider(apiKey)` (chỉ thêm export trong `lib/ai/gemini.ts`), project Google riêng + billing + hạn mức | Khi builder hay hết quota |
| Huỷ thật: `signal?` trong `LlmProvider`, nút Cancel | Khi run dài hay bị treo |
| Chạy song song các nhánh độc lập | Khi run gần chạm 120s |
| Rate limit dùng chung (DB/KV) thay `Map` theo instance | Khi route công khai bị lạm dụng |
| Sentry cho `/api/workflows/*` | Khi có người dùng ngoài chủ repo |

---

## Nhật ký kiểm chứng

| Ngày | Phần | Kết quả |
|---|---|---|
| 2026-10-14 | M0 · handlers | 5 node, 20 test; suite 422 pass / 8 skip |
| 2026-10-14 | M0 · executor | 12 test + mutation 3 luật |
| 2026-10-14 | M0 · validator | 40 test + mutation 4 quy tắc |
| 2026-10-14 | M0 · registry, DSL | 9 + 5 test |
| 2026-10-14 | M0 · schema | SQL Turso khớp schema trên SQLite trống; `dev.db` đã push (có backup); cascade OK. Chưa áp lên Turso |
| 2026-10-14 | M0 · auth | 37 handler ghi → 401; 3 route công khai có rate limit + test; đăng nhập Google local OK |
