---
task_id: "TASK-intel-lean-001"
branch: "feat/topic-url-migration" # Dev yêu cầu làm luôn trên nhánh này, chưa merge
version: "3.0.0"
type: "implement"
priority: "P2"
status: "COMPLETED"
assigned_executor: "claude" # Dev yêu cầu Claude làm trực tiếp, 2026-11-15
max_attempts: 3
current_attempt: 0

boundaries:
  allowed_to_modify:
    - ".agents/skills/cris-code-intel/scripts/cris-intel.ts"
    - ".agents/skills/cris-code-intel/data/cris-workspace-map.json"
    - ".agents/skills/cris-code-intel/SKILL.md"
    - "docs/code-intel/CRIS_WORKSPACE_MAP.md"
    - "AGENTS.md"
  continues_dirty: []
  read_only_references:
    - ".agents/skills/cris-how-to-sync/**"
    - ".agents/skills/gitnexus-*/**"
    - "components/roadmap/RoadmapAssistantChatbot.tsx"
    - "logic/roadmap/roadmapAssistantService.ts"
    - "roadmap-rag-assistant/rag_service/**"
    - "roadmap-rag-assistant/sdk/typescript/**"
  strictly_forbidden:
    - "package.json"
    - "yarn.lock"
    - "tsconfig.json"
    - "CLAUDE.md"
    - ".agents/adapter/**"
    - ".github/**"
    - "components/floating-bot/**"
    - "hooks/use-floating-chat.ts"

verification_gate:
  type_check: "yarn tsc --noEmit -p ."
  lint: "yarn lint"
  test: "yarn test"
  intel_status: "yarn intel status" # phải exit 0 và in 0 ref lỗi
  intel_smoke: "yarn intel trace FLOW_ABOT_CHAT_QUERY && yarn intel how-to-sync \"Thêm trường metadata vào RoadmapItem\""
  agents_sync: "yarn agents:sync --check"
  boundary_check: "bash .agents/skills/agent-handoff/scripts/check-boundary.sh TASK-intel-lean-001"
---

# TASK: Tinh gọn cris-code-intel, để GitNexus lo phần cấu trúc

## 1. Context & Architectural Intent
- **Goal**: cris-code-intel chỉ giữ lớp nghiệp vụ (domain, flow, invariant, failure mode, ADR). Phần cấu trúc (impact, route map, symbol) giao cho GitNexus. `yarn intel status` kiểm tra thật xem map còn khớp code hay không.
- **Why**:
  - `cris-intel impact` và `route-map` làm lại việc của GitNexus với dữ liệu viết tay, nên kết quả thiếu (impact chỉ biết 4 symbol).
  - Trạng thái "FRESH" của `status` chỉ so `headCommit` với HEAD. Các spec cũ đạt FRESH bằng cách sửa hash tay, nên nó không chứng minh map đúng.
  - Claude đã quét thử: trong 98 ref `file[#symbol]` của map, có **19 ref không tồn tại** trong code. Ví dụ:
    - `rag_service/core/retrieval/vector_store.py` đã bị xoá.
    - `decide_route`, `apply_write_gate`, `run_turn`, `synthesize_answer`, `execute_pending_action`, `create_action_preview`, `sendRoadmapAssistantMessage`, `confirmPendingAction`, `handleStatusChange`, `handleRenameSection`, `uploadImagePlugin` không có ở đâu trong code.
    - Các flow Abot (`FLOW_ABOT_CHAT_QUERY` bước 1 và 7, `FLOW_ABOT_CUD_PREVIEW_CONFIRM` bước 4, `FLOW_ABOT_ACCESS_GUARD` bước 3) trỏ tới `components/floating-bot/FloatingChatDrawer.tsx`, là UI của Cris AI. UI thật của Abot là `components/roadmap/RoadmapAssistantChatbot.tsx`, dùng `RoadmapChatbotWidget` của SDK và `roadmapChatClient` trong `logic/roadmap/roadmapAssistantService.ts`.
  - GitNexus không thấy consumer của route FastAPI và proxy `/api/roadmap-assistant/[...path]`. `api_impact /chat/stream` trả `consumers: []`, `riskLevel: LOW`, trong khi đây là đường chat chính của Abot. Agent cần được dặn không tin mức risk này.
- **Dependencies**:
  - `.agents/skills/cris-code-intel/scripts/cris-intel.ts`: `handleStatus`, `handleQuery`, `handleRouteMap`, `handleImpact`, `main`, `interface WorkspaceMap`.
  - `handleHowToSync` đọc `domains`, `entryPoints`, `dataModels`, `executionFlows`, `invariantsAndRules`. **Giữ nguyên các field này.**

## 2. Invariants & Rules
- Không đổi behavior của `how-to-sync`, `trace`, `concept`, `query` (trừ việc `query` thôi tìm trong `symbols`).
- Không thêm dependency, script `package.json`, hook hay bước CI nào.
- Ref trong map sửa theo code thật: tìm bằng `git grep` hoặc `gitnexus_query`/`gitnexus_context`. Không đoán tên. Nếu không có hàm tương ứng rõ ràng thì bỏ phần `#symbol` hoặc `functionOrMethod`, chỉ giữ đường dẫn file.
- Phạm vi hiện tại (AGENTS.md): Cris AI ngoài phạm vi. Chỉ sửa **dữ liệu map** để flow Abot không trỏ vào `floating-bot`. Không đọc để sửa, không sửa code `components/floating-bot/**`.
- Ngoài phạm vi: hook tự re-index GitNexus, sửa `hook-io` của adapter, thêm GitNexus vào `.agents/adapter/mcp.json`, đổi map sang YAML, viết lại toàn bộ `CRIS_WORKSPACE_MAP.md`, sửa câu nhắc `CLAUDE.local.md` trong AGENTS.md, sửa các spec cũ trong `.handoff/specs/`.

## 3. Step-by-Step Implementation Checklist
- [x] **Step 0 (Preflight)**: xác nhận đang ở `main` và `feat/topic-url-migration` đã được merge (`git log --oneline -5`). `cris-workspace-map.json` không được dirty ngoài baseline. Sai một trong hai điều kiện thì ESCALATE.
- [x] **Step 1 (Bỏ phần trùng GitNexus trong `cris-intel.ts`)**:
  - Xoá `handleImpact`, `handleRouteMap`, `interface SymbolRef`, field `symbols` trong `WorkspaceMap`, và các `case "route-map"`, `"routes"`, `"impact"` trong `main`.
  - `handleQuery`: bỏ phần lọc `data.symbols` (quanh dòng 246).
  - Help text trong `main`: bỏ dòng `route-map`, `impact` và 2 ví dụ tương ứng. Thêm một dòng: `impact / route map: dùng GitNexus (gitnexus_impact, gitnexus_api_impact, gitnexus_route_map)`.
- [x] **Step 2 (`status` kiểm ref thật)**: viết lại `handleStatus`.
  - Gom ref từ `domains[].keyFiles`, `executionFlows[].steps[].component` (cộng `#functionOrMethod` nếu có), `steps[].callsNext`, `entryPoints[].handler`, `dataModels[].source`.
  - Một ref có dạng `path[#symbol]`. Chỉ xét ref mà `path` chứa `/` hoặc kết thúc bằng một đuôi file. Báo `MISSING_FILE` khi `path` không tồn tại. Báo `MISSING_SYMBOL` khi file tồn tại nhưng không chứa `symbol` dạng whole word. Tên symbol lấy phần sau dấu `.` cuối cùng và bỏ `(...)`.
  - In danh sách lỗi cùng tổng số. Có lỗi thì `process.exit(1)`, không có lỗi thì in `🟢 OK`.
  - Giữ dòng in `Map Commit` và `Current Commit` để tham khảo, nhưng bỏ nhãn FRESH/MODIFIED. Bỏ dòng `Core Symbols`.
  - Code ngắn, dùng `fs` và `execSync` đã import sẵn, không thêm thư viện.
- [x] **Step 3 (Sửa dữ liệu map `cris-workspace-map.json`)**:
  - Xoá mảng `symbols`.
  - Chạy `yarn intel status`, rồi sửa từng ref lỗi theo rule ở mục 2 cho tới khi exit 0. Gợi ý:
    - Bước Persistence của `FLOW_ABOT_CHAT_QUERY` thay cho `vector_store.py#search_similar` nằm ở `rag_service/domains/roadmap/retrieval/engine.py`. Kiểm tên hàm thật trước khi ghi.
    - Các bước dùng `FloatingChatDrawer.tsx` → đổi thành `components/roadmap/RoadmapAssistantChatbot.tsx`, hoặc `logic/roadmap/roadmapAssistantService.ts#roadmapChatClient` nếu bước đó là gọi API.
    - Ref `prisma/schema.prisma#RoadmapItem#prisma.roadmapItem.update*` → chuẩn hoá thành `prisma/schema.prisma#RoadmapItem`.
  - Cập nhật `generatedAt` và `headCommit` theo HEAD hiện tại.
- [x] **Step 4 (`CRIS_WORKSPACE_MAP.md`)**: chỉ thay các tên symbol hoặc file đã sửa ở Step 3 nếu file này cũng nhắc tới (`git grep` các tên cũ, ví dụ `create_action_preview`, `execute_pending_action`, `search_similar`). Dòng 4: `CLI Tra cứu: yarn intel`. Không viết lại phần khác.
- [x] **Step 5 (`SKILL.md` của cris-code-intel)**:
  - `description`: bỏ "blast radius impact analysis" và "ánh xạ API route", ghi rõ skill lo flow nghiệp vụ, domain và invariant, còn impact và route dùng GitNexus.
  - Bảng lệnh: bỏ `route-map`, `impact`. Dòng `status` ghi "kiểm mọi file/symbol mà map nhắc tới còn tồn tại (exit 1 nếu lệch)". Ví dụ đổi sang `yarn intel <lệnh>`.
  - Bỏ workflow 4 (Impact) và 5 (Route Mapping). Thay bằng một mục ngắn: "Impact / route → `gitnexus_impact`, `gitnexus_api_impact`, `gitnexus_route_map`. Ngoại lệ: route FastAPI và `/api/roadmap-assistant/*` thì GitNexus không thấy consumer, nên dùng `yarn intel trace FLOW_ABOT_*`."
- [x] **Step 6 (`AGENTS.md`)**: chỉ sửa bullet `cris-code-intel` ở mục Skills, tối đa 2 câu: dùng khi cần flow nghiệp vụ, domain, invariant (UI → API → Service → AI/DB). Impact và route map dùng GitNexus, **trừ** route FastAPI và `/api/roadmap-assistant/*` (GitNexus không thấy consumer, mức risk nó báo không đáng tin) thì dùng `yarn intel trace FLOW_ABOT_*`. Không đụng block GitNexus.
- [x] **Step 7 (Gate)**: chạy toàn bộ `verification_gate`, điền mục 4, ghi `result.json`.

## 4. Verification Gate Results
<!-- Executor điền: PENDING | PASSED | FAILED | SKIPPED -->
- [x] `TypeCheck`: PASSED
- [ ] `Lint`: FAILED. 77 lỗi đều ở file có sẵn (components/ui, tests/e2e, tests/load, app/notes...); `eslint cris-intel.ts` sạch
- [x] `Test`: PASSED (907 passed, 8 skipped)
- [x] `Intel Status`: PASSED (🟢 92 ref khớp code; thử chèn ref sai thì exit 1)
- [x] `Intel Smoke`: PASSED (trace, query, how-to-sync)
- [x] `Agents Sync Check`: PASSED
- [ ] `Boundary Check`: SKIPPED (không giao Executor nên không có baseline)

## 5. Execution Audit Log
<!-- Executor điền. Không commit: Dev commit sau khi Claude verify -->
- **Result file**: `.handoff/runs/TASK-intel-lean-001/result.json`
- **Modified Files**: `cris-intel.ts`, `cris-workspace-map.json`, `cris-code-intel/SKILL.md`, `docs/code-intel/CRIS_WORKSPACE_MAP.md`, `AGENTS.md`
- **Refs đã sửa ở Step 3**: 17 step trong 6 flow + 1 keyFile. Ví dụ `decide_route` → `IntentRouter.aroute`, `run_turn` → `NextGenRoadmapAgent.astream_events`, `vector_store.py#search_similar` → `retrieval/engine.py#HybridRagEngine.search_live_knowledge`, `synthesize_answer` → `GenerationPipeline.astream`, `create_action_preview` → `RoadmapCommands.handle_cud`, `execute_pending_action` → `RoadmapCommands.handle_pending`, `apply_write_gate` → `gate_route`, `FloatingChatDrawer.tsx` → `RoadmapAssistantChatbot.tsx`. Bỏ symbol (không có hàm tương ứng rõ): `handleStatusChange`, `uploadImagePlugin`.
