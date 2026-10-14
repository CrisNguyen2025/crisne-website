# Workflow Builder — Handoff cho M1 → M4

> Tài liệu bàn giao cho agent tiếp quản. Đọc hết file này trước khi viết code.
> Nguồn sự thật về thiết kế: [`workflow-builder-design.md`](./workflow-builder-design.md). Kế hoạch tổng: [`workflow-builder-plan.md`](./workflow-builder-plan.md).
> Cập nhật: 2026-10-14 · Nhánh hiện tại: `feat/chat-rag-observability`.

## 0. Cách dùng tài liệu này

- Làm **tuần tự M1 → M2 → M3 → M4**. Mỗi mốc có 4 phần: *Đầu vào* (đã có gì), *Việc cần làm*, *Bàn giao* (mốc sau sẽ dựa vào gì — **không được đổi** mà không cập nhật file này), *Kết quả cần đạt* (tự động + thử tay).
- Một mốc chỉ được coi là xong khi **mọi ô trong "Kết quả cần đạt" đã tick** và ghi vào mục 7 (Báo cáo).
- Gặp quyết định không có trong tài liệu: chọn phương án đơn giản nhất phù hợp ràng buộc ở mục 2, ghi lại ở mục "Quyết định đã tự chọn" của mốc đó.

---

## 1. Hiện trạng (M0 — đã xong)

### 1.1 Đã có và đã test

| Thành phần | File | Ghi chú |
|---|---|---|
| Auth Google (Auth.js v5 beta, JWT) | `auth.ts` | Callback `signIn` chỉ nhận email trong `AUTH_OWNER_EMAILS` |
| Chặn `/workflows/*`, `/api/workflows/*` | `proxy.ts` | Chưa đăng nhập: trang → redirect sign-in, API → 401 |
| Guard route ghi | `lib/auth/write-access.ts` (`requireWriteAccess(req)`), `lib/auth/owner-access.ts` (`isOwnerEmail`, `hasValidAdminKey`) | |
| Test guard tự quét mọi route ghi | `tests/route/write-routes-guard.test.ts` | Route ghi mới dưới `app/api` **phải** trả 401 khi ẩn danh, hoặc thêm vào `PUBLIC_WRITE_ROUTES` |
| 8 bảng workflow | `prisma/schema.prisma` (cuối file), `prisma/init-turso.sql` | Đã `db push` vào `dev.db`. **Chưa áp lên Turso** |
| DSL types | `lib/workflow/dsl-types.ts` | |
| `graphHash` | `lib/workflow/graph-hash.ts` | |
| Node registry | `lib/workflow/node-registry.ts` | |
| Validator | `lib/workflow/dsl-validator.ts` | |
| Executor | `lib/workflow/dag-executor.ts` | |
| Handler node | `lib/workflow/nodes/{index,template,condition,merge,llm}.ts` | `rewrite`, `rag` đang ném lỗi "phase 2" |
| Trang placeholder | `app/(workflow-builder)/workflows/page.tsx` | Hiện email + nút Sign out |

Test: `yarn test` → 422 pass / 8 skip (mốc 2026-10-14).

### 1.2 Hợp đồng (contract) đang có — dùng lại, không viết lại

```ts
// dsl-types.ts
type NodeType = "input" | "rewrite" | "rag" | "condition" | "merge" | "llm" | "output";
interface WorkflowGraph { schemaVersion: 1; nodes: WorkflowNode[]; edges: WorkflowEdge[] }
interface WorkflowEdge { id; sourceNodeId; sourcePort; targetNodeId; targetPort }
interface WorkflowUi { positions: Record<nodeId,{x,y}>; labels: Record<nodeId,string>; viewport: {x,y,zoom} }
// WorkflowNode là union phân biệt theo `type` → `config` tự thu hẹp
// config: rewrite{instruction} · rag{topK 1–20, minScore? 0–1, documentIds?}
//         condition{branches:[{name, operator: contains|equals|length_gt, value}]}
//         merge{mode: first_active|concat_documents|join_strings, separator?}
//         llm{prompt, system?, temperature? 0–2, maxOutputTokens?} · input{description?} · output{}

// graph-hash.ts
graphHash(graph): string            // sha256 hex; bỏ qua ui, thứ tự key, thứ tự node/edge

// node-registry.ts
resolveNodePorts(node): { inputs: PortDefinition[]; outputs: PortDefinition[] }
// PortDefinition { name; type: "text"|"documents"; required; allowMultiple }
// input→query · rewrite query→query · rag query→documents · condition value→<mỗi nhánh>+else
// merge items(nhiều edge)→value (kiểu theo mode) · llm question★ + context(documents, tuỳ chọn)→text · output value
NODE_LABELS: Record<NodeType,string>

// dsl-validator.ts
validateWorkflowGraph(raw: unknown):
  | { ok: true; graph: WorkflowGraph }
  | { ok: false; errors: { code; message; nodeId?; edgeId?; nodeIds?; path? }[] }

// dag-executor.ts
executeWorkflow(graph, runInput: { query: string }, deps: {
  handlers: NodeHandlers; nodeTimeoutMs?; now?;
  onNodeStart?(node, inputs); onNodeFinish?(node, result: NodeResult);
}): Promise<{ status: "SUCCEEDED"|"FAILED"; outputs: Record<outputNodeId, PortValue>; nodes: NodeResult[]; error? }>
// NodeResult { nodeId; nodeType; status: SUCCEEDED|SKIPPED|FAILED|CANCELLED; inputs?; outputs?; usage?{model,inputTokens,outputTokens}; error?; startedAt?; finishedAt?; durationMs? }
// PortValue = string | RetrievedDocument[];  RetrievedDocument { id; content; score; documentId?; heading? }

// nodes/index.ts
createNodeHandlers({ llm?: LlmProvider; model?: string }): NodeHandlers
WORKFLOW_LLM_MODEL = "gemini-2.5-flash-lite"
```

### 1.3 Bảng DB (Prisma model → dùng thế nào)

| Model | Trường chính | Dùng ở |
|---|---|---|
| `WorkflowProject` | `ownerId`, `name` | M1 |
| `Workflow` | `projectId`, `ownerId`, `draftGraph` (JSON text), `draftUi` (JSON text), `draftGraphHash` | M1, M2 |
| `WorkflowRun` | `workflowId`, `workflowVersionId?`, `graphSnapshot?`, `graphHash`, `status`, `trigger` (`MANUAL`\|`API`), `dryRun`, `input`, `output`, `error`, `traceId`, `startedAt`, `finishedAt` | M1 |
| `NodeExecution` | `runId`, `nodeId` (unique theo run), `nodeType`, `status`, `input`, `output`, `error`, `model`, `inputTokens`, `outputTokens`, `durationMs` | M1, M2 |
| `WorkflowQuotaUsage` | unique `(day "YYYY-MM-DD" UTC, model)`, `count` | M1 |
| `ProjectDocument` | `projectId`, `storageKey` (unique), `contentHash`, `status` (`PENDING`\|`READY`\|`FAILED`) | M3 |
| `ProjectChunk` | `projectId`, `documentId`, `ordinal`, `heading`, `content`, `contentHash`, `embedding Bytes?`, `embeddingModel` | M3 |
| `WorkflowVersion` | unique `(workflowId, versionNumber)`, `graph`, `graphHash`, `ui` | M4 |

Trạng thái là `String` (Prisma 5 + SQLite không có enum); JSON lưu dạng text → luôn `JSON.parse` rồi chạy qua `validateWorkflowGraph` trước khi dùng.

---

## 2. Ràng buộc bắt buộc (mọi mốc)

1. **Không sửa** `lib/ai/*`, `lib/r2-client.ts`, `app/api/chat/*`, 11 bảng Prisma cũ. Chỉ import. (Ngoại lệ duy nhất ở M5, không thuộc phạm vi này.)
2. Node AI chỉ dùng `WORKFLOW_LLM_MODEL` (`gemini-2.5-flash-lite`). Provider **truyền vào** `createNodeHandlers`; **không** gọi `setLlmProvider()` (đổi toàn cục → ảnh hưởng chatbot `/portfolio`).
3. Mọi truy vấn dữ liệu workflow lọc theo `ownerId` = email trong session (`auth()`); dữ liệu KB lọc thêm theo `projectId`.
4. State cần chính xác (quota, trạng thái run) nằm trong DB, không dùng `Map` in-memory.
5. Env chỉ dùng phía server (không `NEXT_PUBLIC_`).
6. UI: Tailwind + component trong `components/ui` (shadcn/@base-ui). Không inline style. `@xyflow/react` import động `ssr: false`. Server Component mặc định; mỗi route async có `loading.tsx` + `error.tsx`.
7. Chỉ thêm dependency: `@xyflow/react`, `zustand` (M2). Thêm gói khác phải ghi lý do.
8. Test đặt trong `tests/` (vitest chỉ quét `tests/**/*.test.ts`). Test không bao giờ gọi Gemini/Langfuse thật.
9. Trước commit: `yarn test`, `yarn lint`, `npx tsc --noEmit` không có lỗi mới (lỗi sẵn có trong `.next/` và `roadmap-rag-assistant/` không tính). Commit message kết thúc bằng dòng `Co-Authored-By` theo quy ước repo.
10. CLAUDE.md yêu cầu GitNexus `impact`/`detect_changes`, nhưng repo **chưa cài** (`.gitnexus/run.cjs` không có). Nếu vẫn chưa có: ghi rõ đã bỏ qua trong báo cáo.

### Bẫy đã gặp

- ⚠️ **`.env` chứa `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN`.** Prisma tự nạp `.env`, nên script chạy local qua `lib/prisma` sẽ ghi vào **Turso thật**. Script thử/seed phải dùng `new PrismaClient({ datasourceUrl: "file:./dev.db" })`, hoặc chủ repo bỏ 2 biến đó khỏi `.env`.
- `prisma format` căn lại cả model cũ → đừng chạy; nếu chạy, khôi phục phần cũ để diff chỉ có dòng thêm.
- Đổi schema: cập nhật cả `schema.prisma` lẫn `init-turso.sql` (sinh bằng `prisma migrate diff --from-schema-datamodel <cũ> --to-schema-datamodel prisma/schema.prisma --script`, đổi sang `IF NOT EXISTS`), rồi `prisma db push` (local dùng `db push`, thư mục `migrations/` đã cũ).
- `after()` của Next cần request scope → trong test route phải mock `next/server` (`after: vi.fn()`), xem `tests/route/chat-route.test.ts`.
- `lib/prisma.ts` có `isCurrentClient` kiểm tra delegate để bỏ client cũ sau hot reload; thêm model mới thì không cần sửa (đã kiểm tra `workflow`).

---

## 3. M1 — Chạy qua API

**Mục tiêu:** workflow lưu trong DB, chạy thật qua HTTP; mỗi run để lại `WorkflowRun` + `NodeExecution` và 1 trace Langfuse.

**Đầu vào:** toàn bộ mục 1.

### 3.1 Việc cần làm

| # | Việc | File |
|---|---|---|
| 1 | `withQuota(provider, { limit, now? })` bọc `LlmProvider`: trước mỗi `generate`/`embed`, tăng `WorkflowQuotaUsage(day UTC, model)` **nguyên tử** (upsert + kiểm tra trong 1 transaction); vượt → ném `QuotaExceededError` (code `QUOTA_EXCEEDED`), không gọi provider. `limit` từ env `WORKFLOW_DAILY_LLM_LIMIT`, mặc định 15. | `lib/workflow/quota.ts` |
| 2 | Provider giả cho dry-run: trả câu cố định có nhắc lại prompt (vd `"[dry-run] <80 ký tự đầu prompt>"`), usage 0. Dry-run **không** đi qua quota. | `lib/workflow/dry-run-provider.ts` |
| 3 | Trace: tạo root observation tên `workflow-run` (theo mẫu `app/api/chat/route.ts`, dùng `startObservation` của `@langfuse/tracing`); trả về `{ traceId, onNodeStart, onNodeFinish, end(result) }`. Node `llm` → generation (model, usage); còn lại → span; SKIPPED/CANCELLED vẫn có span (level `DEFAULT`/`WARNING`), FAILED level `ERROR`. Metadata `{ projectId, workflowId, runId, trigger, dryRun, graphHash }`, `userId` = email. Tên hằng đặt trong `lib/workflow/constants.ts`. | `lib/workflow/tracing.ts`, `lib/workflow/constants.ts` |
| 4 | Repository (mọi hàm nhận `ownerId`): `listProjects`, `createProject`, `listWorkflows(projectId)`, `createWorkflow(projectId, name)` (tạo sẵn graph `input → output` hợp lệ + ui mặc định), `getWorkflow(id)`, `saveDraft(id, graph, ui)` (tính `draftGraphHash`, **lưu cả khi graph chưa hợp lệ** và trả `errors`). | `lib/workflow/repository.ts` |
| 5 | `runWorkflow({ ownerId, workflowId, input, dryRun, trigger })`: đọc nháp → `validateWorkflowGraph` (sai → không tạo run, trả `errors`) → tạo `WorkflowRun` (`RUNNING`, `graphSnapshot`, `graphHash`) → `executeWorkflow` với handler `createNodeHandlers({ llm: dryRun ? dryRunProvider : withQuota(geminiProvider) })`, hook ghi `NodeExecution` (input/output JSON, cắt mỗi trường ≤ 20 KB) + trace → cập nhật run (`SUCCEEDED`/`FAILED`, `output`, `error`, `traceId`, `finishedAt`). Lỗi quota → run `FAILED` với `error` chứa `QUOTA_EXCEEDED`. | `lib/workflow/run-service.ts` |
| 6 | API (lấy `ownerId` từ `auth()`; proxy đã chặn ẩn danh nhưng route vẫn tự kiểm tra, trả 401 nếu không có session; body sai → 400; không thuộc owner → 404). | `app/api/workflows/**/route.ts` |
| 7 | Seed: tạo project "Demo" + workflow mẫu `input → condition(greeting: contains "hello") → (greeting \| else) → merge(join_strings) → llm → output` vào `dev.db` (dùng `datasourceUrl` file, xem bẫy). In ra `workflowId`. | `scripts/seed-sample-workflow.ts` |

**API cần có**

| Method | Đường dẫn | Request | Response |
|---|---|---|---|
| GET | `/api/workflows/projects` | — | `{ projects: {id,name,createdAt}[] }` |
| POST | `/api/workflows/projects` | `{ name, description? }` | `201 { project }` |
| GET | `/api/workflows?projectId=` | — | `{ workflows: {id,name,updatedAt,draftGraphHash}[] }` |
| POST | `/api/workflows` | `{ projectId, name }` | `201 { workflow }` |
| GET | `/api/workflows/[id]` | — | `{ workflow: {id,name,projectId,graph,ui,draftGraphHash,updatedAt}, errors: ValidationError[] }` |
| PUT | `/api/workflows/[id]` | `{ graph, ui, name? }` | `{ draftGraphHash, errors }` (200 cả khi có lỗi validate; 400 chỉ khi `ui`/body sai cấu trúc) |
| POST | `/api/workflows/[id]/runs` | `{ input: { query }, dryRun?: boolean }` | `200 { run }` khi chạy xong (cả `FAILED`); `422 { errors }` khi graph không hợp lệ. `export const maxDuration = 120`; `after(flushLangfuse)` |
| GET | `/api/workflows/[id]/runs?limit=20` | — | `{ runs: RunSummary[] }` |
| GET | `/api/workflows/[id]/runs/[runId]` | — | `{ run: RunDetail }` |

```ts
type RunSummary = { id; status; dryRun; graphHash; startedAt; finishedAt; error? };
type RunDetail = RunSummary & {
  input: { query: string }; output: Record<string, PortValue> | null; traceId: string | null;
  nodes: { nodeId; nodeType; status; input; output; error; model; inputTokens; outputTokens; durationMs }[]; // theo thứ tự chạy
};
```

### 3.2 Bàn giao cho M2 (không đổi nếu không cập nhật file này)

- Toàn bộ API ở bảng trên với đúng shape request/response; `RunDetail.nodes` đủ để tô màu node trên canvas.
- `PUT /api/workflows/[id]` luôn lưu nháp và trả `errors` — canvas dựa vào đây để autosave + hiện lỗi.
- `createWorkflow` tạo sẵn graph `input → output` hợp lệ.
- `dryRun: true` không tốn quota → canvas bật mặc định khi dev.

### 3.3 Kết quả cần đạt

Tự động (vitest, không mạng):
- [x] `quota`: N lần trong hạn mức gọi provider N lần; lần N+1 ném `QUOTA_EXCEEDED` và **không** gọi provider; sang ngày UTC mới đếm lại; hai lần gọi song song không vượt hạn mức (dùng `dev.db` tạm hoặc mock Prisma transaction).
- [x] `run-service`: dry-run workflow mẫu → run `SUCCEEDED`, có đủ `NodeExecution` (gồm node `SKIPPED`), `graphHash` khớp; node lỗi → run `FAILED`, node sau `CANCELLED`; graph sai → không tạo run.
- [x] `tracing` (Langfuse InMemorySpanExporter như `tests/route/chat-route.test.ts`): 1 trace, mỗi node 1 observation, `llm` là generation có usage.
- [x] Route: không session → 401; owner khác → 404; body sai → 400; `PUT` graph sai → 200 + `errors`; `POST runs` graph sai → 422.
- [x] `tests/route/write-routes-guard.test.ts` vẫn pass (route mới tự được quét).
- [x] `yarn test`, `yarn lint`, `tsc` sạch.

Thử tay (chủ repo hoặc agent qua browser pane, dev server `localhost:3334`):
- [x] `npx tsx scripts/seed-sample-workflow.ts` in ra `workflowId`.
- [x] Đăng nhập `/workflows`, DevTools: `POST /api/workflows/<id>/runs` với `{ input:{query:"Hello Cris"}, dryRun:true }` → `SUCCEEDED`, nhánh `else` `SKIPPED`.
- [x] Bỏ `dryRun` → câu trả lời thật; trace `workflow-run` xuất hiện trên Langfuse (có thể trễ vài phút).
- [x] `WORKFLOW_DAILY_LLM_LIMIT=1`, chạy 2 lần thật → lần 2 `FAILED` với `QUOTA_EXCEEDED`; chatbot `/portfolio` vẫn trả lời.

**Ngoài phạm vi M1:** UI, KB, publish/version.

---

## 4. M2 — Canvas chạy được

**Mục tiêu:** dựng, lưu và chạy workflow hoàn toàn trên trình duyệt.

**Đầu vào:** API M1 (mục 3.2), `resolveNodePorts`, `NODE_LABELS`, `validateWorkflowGraph`, `graphHash`.

### 4.1 Việc cần làm

| # | Việc | File |
|---|---|---|
| 1 | Cài `@xyflow/react`, `zustand`. | `package.json` |
| 2 | Trang danh sách: chọn/tạo project, danh sách workflow, nút tạo workflow → chuyển tới trang canvas. Server Component lấy dữ liệu qua repository (không fetch trong `useEffect`). | `app/(workflow-builder)/workflows/page.tsx`, `loading.tsx`, `error.tsx` |
| 3 | Mapping DSL ↔ React Flow: `toFlow(graph, ui) → { nodes, edges, viewport }`, `fromFlow(nodes, edges, viewport, previousGraph) → { graph, ui }`; config node nằm trong `node.data.config`; vị trí → `ui.positions`. Hàm thuần, test được. | `lib/workflow/canvas-mapping.ts` |
| 4 | Store Zustand: `graph`, `ui`, `errors`, `selectedNodeId`, `lastRun`, `saveState` (`idle`\|`saving`\|`saved`\|`error`); action `addNode(type, position)`, `updateConfig(nodeId, config)`, `connect`, `removeElements`, `moveNode` (chỉ đổi `ui`). | `lib/workflow/canvas-store.ts` |
| 5 | Canvas (client, import động `ssr:false`): 7 custom node, mỗi port 1 `Handle` lấy từ `resolveNodePorts` (port `condition` đổi theo nhánh); màu/biểu tượng theo loại; `isValidConnection` chặn: sai kiểu port, port đích không `allowMultiple` đã có edge, tạo chu trình. Delete xoá node/edge (node `input` không xoá được). | `app/(workflow-builder)/workflows/[id]/page.tsx`, `components/workflow-canvas/{Canvas,WorkflowNode,Palette}.tsx` |
| 6 | Panel cấu hình theo loại node: `condition` (thêm/xoá/sắp xếp nhánh, chọn operator), `merge` (mode, separator), `llm` (prompt, system, temperature, maxOutputTokens; gợi ý `{{inputs.question}}`, `{{inputs.context}}`), `rag` (topK, minScore — dữ liệu tài liệu ở M3), `rewrite` (instruction). Đổi nhánh → edge trỏ tới nhánh đã xoá bị xoá theo. | `components/workflow-canvas/NodeConfigPanel.tsx` |
| 7 | Autosave: debounce 1 s gọi `PUT`; hiển thị trạng thái lưu; lỗi validate → viền đỏ node/edge theo `nodeId`/`edgeId`/`nodeIds` + danh sách lỗi bấm được (focus node). Validate realtime phía client bằng `validateWorkflowGraph` để phản hồi tức thì; server vẫn là chuẩn. | `components/workflow-canvas/{SaveIndicator,ErrorList}.tsx` |
| 8 | Run panel: ô query, công tắc dry-run (mặc định bật), nút Run (khoá khi có lỗi hoặc đang chạy) → `POST runs`; tô node theo `RunDetail.nodes` (xanh SUCCEEDED, xám SKIPPED, đỏ FAILED, mờ CANCELLED) + edge theo trạng thái node nguồn; bấm node xem input/output/thời lượng/token; hiện output cuối; lịch sử 20 run gần nhất. | `components/workflow-canvas/RunPanel.tsx` |
| 9 | Node `rewrite`/`rag` có trong palette, đánh dấu "Cần Knowledge Base (M3)"; chạy thì nhận lỗi rõ ràng từ handler. | — |

### 4.2 Bàn giao cho M3/M4

- `canvas-mapping.ts` + store là cách duy nhất UI đọc/ghi graph — M3 thêm panel tài liệu, M4 thêm version đều đi qua store.
- `NodeConfigPanel` có chỗ cho `rag.documentIds` (M3 nối dữ liệu).
- Run panel đọc `RunDetail` — M3 chỉ cần thêm hiển thị chunk + điểm cho node `rag` (trong `output.documents`).

### 4.3 Kết quả cần đạt

Tự động:
- [x] `canvas-mapping`: round-trip `toFlow → fromFlow` giữ nguyên `graphHash`; đổi vị trí node chỉ đổi `ui`.
- [x] Store: `moveNode` không đổi `graphHash`; xoá nhánh `condition` xoá edge của nhánh đó.
- [x] `isValidConnection` (hàm thuần, tách ra để test): chặn sai kiểu, quá số edge, chu trình.
- [x] `yarn test`, `yarn lint`, `tsc`, `yarn build` sạch.

Thử tay (browser pane, ảnh chụp kèm báo cáo):
- [x] `/workflows` → tạo workflow → mở canvas thấy `input → output`.
- [x] Kéo `condition`, `merge`, `llm` vào; nối thành `input → condition → 2 nhánh → merge → llm → output`.
- [x] Nối `llm.text` vào `llm.context` (sai kiểu) → không nối được; bỏ edge `merge → llm` → lỗi đỏ, Run bị khoá.
- [x] Run dry-run với "Hello" và "Something else" → nhánh không chạy chuyển xám; bấm node `llm` thấy input/output.
- [x] Kéo node, tải lại trang → vị trí giữ nguyên; `draftGraphHash` không đổi.
- [x] Không lỗi console; dùng được ở chiều rộng ≥ 1024 px.

**Ngoài phạm vi M2:** upload tài liệu, publish/version, mobile.

---

## 5. M3 — Knowledge Base

**Mục tiêu:** mỗi project có tài liệu riêng; node `rewrite` + `rag` chạy thật.

**Đầu vào:** M1 (quota, run-service, tracing), M2 (canvas, NodeConfigPanel, RunPanel), bảng `ProjectDocument`/`ProjectChunk`.

### 5.1 Việc cần làm

| # | Việc | File |
|---|---|---|
| 1 | Storage: key `workflow-kb/{projectId}/{documentId}`; có R2 (`isR2Configured`) → dùng `r2Client`; không có → ghi `.data/workflow-kb/...` (thêm vào `.gitignore`, `mkdir -p`). Không dùng `uploads/`. | `lib/workflow/kb/storage.ts` |
| 2 | Parser `.md`, `.txt` qua interface `DocumentParser { canParse(mime, name); parse(buffer): string }`. Giới hạn 1 MB/file, 50 file/project. | `lib/workflow/kb/parser.ts` |
| 3 | Chunker: tách theo heading markdown, mỗi chunk ≤ ~1.500 ký tự (cắt theo đoạn), giữ `heading` gần nhất, `ordinal` tăng dần. | `lib/workflow/kb/chunker.ts` |
| 4 | Ingest: `sha256` file; trùng `contentHash` trong project → không làm gì. Chunk → `contentHash` từng chunk → chunk đã có embedding cùng hash (trong project) thì **dùng lại**, còn lại gọi `embed(content, "RETRIEVAL_DOCUMENT")` qua `withQuota`. Lưu `Float32Array` 768 chiều dạng `Bytes`, `embeddingModel`. Trạng thái `PENDING → READY`/`FAILED`. | `lib/workflow/kb/ingest.ts` |
| 5 | Retrieval: `retrieve({ projectId, query, topK, minScore?, documentIds? })` → `RetrievedDocument[]`; điểm = kết hợp vector (`cosineSimilarity`) + keyword (`normalizeText` trên heading + content), trọng số đặt trong `constants.ts`. **Luôn** `where: { projectId }`. Embedding truy vấn: `embed(query, "RETRIEVAL_QUERY")` qua quota. | `lib/workflow/kb/retrieval.ts` |
| 6 | Handler `rewrite` (LLM viết lại câu hỏi theo `instruction`, output `query`) và `rag` (gọi `retrieve`, output `documents`); thay `notAvailableYet` trong `createNodeHandlers` (thêm tuỳ chọn `retrieve` được truyền vào, dry-run dùng retrieval giả). Trace: `rag` → span chứa từng chunk id + điểm. | `lib/workflow/nodes/{rewrite,rag,index}.ts`, `lib/workflow/tracing.ts` |
| 7 | API: `GET/POST /api/workflows/projects/[projectId]/documents` (multipart upload), `DELETE /api/workflows/projects/[projectId]/documents/[documentId]` (xoá file + chunk). | `app/api/workflows/projects/[projectId]/documents/**` |
| 8 | UI: panel tài liệu của project (upload, trạng thái, xoá); `NodeConfigPanel` cho `rag` chọn `documentIds`; Run panel hiển thị chunk + điểm cho node `rag`. | `components/workflow-canvas/{DocumentsPanel,NodeConfigPanel,RunPanel}.tsx` |
| 9 | Eval: bộ ≥ 15 câu hỏi + id chunk kỳ vọng trên 2–3 tài liệu mẫu; script in Hit@4. | `lib/workflow/fixtures/kb-eval/*`, `scripts/eval-kb.ts` |

### 5.2 Bàn giao cho M4

- `retrieve()` và handler `rag` dùng chung cho chạy nháp lẫn chạy version.
- Tài liệu production nằm trên R2 dưới `workflow-kb/` — M4 cần R2 cấu hình trên Vercel.

### 5.3 Kết quả cần đạt

Tự động:
- [x] Project A không bao giờ nhận chunk của project B (test với 2 project cùng nội dung).
- [x] Upload lại tài liệu không đổi → `embed()` được gọi **0** lần; sửa 1 đoạn → chỉ embed chunk đổi.
- [x] `findUnusedStorageFiles` không liệt kê file dưới `workflow-kb/` (test với R2 mock).
- [x] Upload `.pdf` hoặc > 1 MB → 400.
- [x] Hit@4 ≥ 0.8 trên bộ eval (chạy với embedding thật một lần, ghi kết quả vào Nhật ký; test CI dùng embedding giả).

Thử tay:
- [x] Upload 2–3 file `.md` vào project A; dựng `input → rag → llm → output` (`rag.documents → llm.context`); hỏi câu có trong tài liệu → trả lời đúng; bấm `rag` thấy chunk + điểm.
- [x] Project B hỏi cùng câu → không thấy tài liệu của A.

**Rủi ro:** > ~2.000 chunk/project → tính điểm trong RAM chậm; khi đó mới thử vector native trên Turso thật (local không có hàm vector).

---

## 6. M4 — Publish + Production

**Mục tiêu:** version bất biến và chạy trên domain thật.

**Đầu vào:** M1–M3; bảng `WorkflowVersion`.

### 6.1 Việc cần làm

| # | Việc | File |
|---|---|---|
| 1 | `POST /api/workflows/[id]/versions`: validate nháp (sai → 422) → tạo `WorkflowVersion` (`versionNumber` = max + 1, trong transaction) với `graph`, `graphHash`, `ui`. `GET` liệt kê version. Không có API sửa/xoá version. | `app/api/workflows/[id]/versions/route.ts`, `lib/workflow/repository.ts` |
| 2 | `POST runs` nhận `versionId?`: có → chạy `graph` của version, ghi `workflowVersionId`; không → chạy nháp như cũ. | `lib/workflow/run-service.ts` |
| 3 | UI: nút Publish, danh sách version, chọn version để chạy, nhãn "đã đổi so với v{n}" khi `draftGraphHash ≠ graphHash` của version mới nhất. | `components/workflow-canvas/VersionPanel.tsx` |
| 4 | Thông báo lỗi thân thiện cho `QUOTA_EXCEEDED`, timeout, graph sai. | UI |
| 5 | Production (cần chủ repo cấp quyền/biến môi trường): `yarn db:turso:init` trên Turso; Vercel env `AUTH_*`, `R2_*`, `WORKFLOW_DAILY_LLM_LIMIT`; redirect URI domain thật trong Google Console; xác nhận Fluid compute + `maxDuration` 120 s. | — |

### 6.2 Kết quả cần đạt

Tự động:
- [x] Publish 2 lần → `versionNumber` 1, 2; sửa nháp sau publish không đổi `graph`/`graphHash` của version cũ.
- [x] Chạy theo `versionId` dùng graph của version, kể cả khi nháp đã khác.
- [x] Publish graph sai → 422, không tạo version.

Thử tay:
- [x] Publish v1, sửa nháp, chạy v1 → kết quả theo v1.
- [ ] Trên domain production: đăng nhập email chủ → vào được; email khác → bị từ chối; chạy workflow có `rag` thành công; trace có trên Langfuse (Cần chủ repo cấu hình env và deploy Vercel/Turso).

**Ngoài phạm vi (M5):** tách Gemini key, huỷ request thật, chạy song song nhánh, rate limit dùng chung, Sentry.

---

## 7. Báo cáo khi xong mỗi mốc

Agent ghi vào bảng dưới và trả lời chủ repo theo mẫu: *đã làm gì (file), kết quả test (số pass), các ô thử tay đã tick + ảnh chụp, quyết định đã tự chọn, việc còn lại cần chủ repo làm*.

| Ngày | Mốc | Kết quả | Quyết định đã tự chọn |
|---|---|---|---|
| 2026-10-14 | M0 | 422 pass / 8 skip; auth, schema, DSL, registry, validator, executor, handler | Provider truyền vào thay `setLlmProvider`; 2 kiểu port `text`/`documents`; giới hạn validator (id ≤ 64 ký tự, nhánh ≤ 32, topK ≤ 20, template ≤ 8.000 ký tự) |
| 2026-10-14 | M1 | 442 pass / 8 skip; quota, dry-run, tracing, repository, run-service, 5 routes | Quota atomic transaction rollback khi count > limit; `vitest.config.mts` clear `TURSO_DATABASE_URL` để tests dùng `dev.db`; `NodeExecution` lưu input/output JSON cắt ≤ 20 KB |
| 2026-10-14 | M2 | 450 pass / 8 skip, build sạch; React Flow canvas, Zustand store, Palette, NodeConfigPanel, RunPanel, SaveIndicator, ErrorList | Tách logic gọi API sang `logic/workflow/api.ts`; autosave debounce 1s; custom nodes với port handles tự động từ registry; edge styling theo kết quả run trước đó |
| 2026-10-14 | M3 | 473 pass / 8 skip, build sạch, Hit@4: 100%; storage, parser, chunker, ingest, hybrid retrieval, real rewrite & rag handlers, DocumentsPanel, document filtering | Lưu local tại `.data/workflow-kb/` riêng biệt ngoài `uploads/`; chunk theo heading markdown ≤ 1500 ký tự; tái sử dụng embedding theo contentHash trong project; RAG span trace enriched với chunk ID và score; documents được truyền từ Server Component tránh useEffect fetching |
| 2026-10-14 | M4 | 480 pass / 8 skip, build sạch; WorkflowVersion repository & API, execution by versionId, VersionPanel UI, friendly error banners | `versionNumber` auto-increment trong transaction Prisma; kiểm tra tính hợp lệ của graph trước khi tạo version (trả 422 nếu có lỗi); VersionPanel so sánh `draftGraphHash` với latestVersion để cảnh báo draft bị sửa; target execution có thể switch linh hoạt giữa draft và published version |
