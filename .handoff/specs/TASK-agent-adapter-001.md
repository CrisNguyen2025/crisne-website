---
task_id: "TASK-agent-adapter-001"
branch: "main"
version: "3.0.0"
type: "implement"
priority: "P1"
status: "COMPLETED"
assigned_executor: "antigravity"
max_attempts: 3
current_attempt: 1

boundaries:
  allowed_to_modify:
    - "scripts/agent-adapter/**"
    - "tests/unit/agent-adapter/**"
    - "tests/manual/agent-adapter.md"
    - ".agents/adapter/**"
    - ".mcp.json"
    - ".agents/mcp_config.json"
    - ".claude/skills/ui-taste"
    - "package.json"
    - ".github/workflows/ci.yml"
  read_only_references:
    - ".handoff/PLAN-agent-adapter.md"
    - ".handoff/rfc-agent-handoff.md"
    - "AGENTS.md"
    - "GLOSSARY.md"
    - "docs/adr/**"
    - "scripts/check-knowledge-index.ts"
    - "vitest.config.mts"
  strictly_forbidden:
    - "yarn.lock"
    - "tsconfig.json"
    - "eslint.config.mjs"
    - ".gitignore"
    - "AGENTS.md"
    - "CLAUDE.md"
    - "tests/manual/README.md"
    - ".claude/settings.json"
    - ".agents/hooks.json"
    - ".agents/agents/**"
    - ".claude/agents/**"
    - ".handoff/PLAN-agent-adapter.md"
    - "app/**"
    - "components/**"
    - "lib/**"
    - "hooks/**"
    - "prisma/**"
    - "roadmap-rag-assistant/**"
    - "docs/**"

verification_gate:
  type_check: "yarn tsc --noEmit -p ."
  lint: "yarn eslint scripts/agent-adapter tests/unit/agent-adapter"
  test: "yarn test"
  agents_sync_check: "yarn agents:sync --check"
  boundary_check: "bash .agents/skills/agent-handoff/scripts/check-boundary.sh TASK-agent-adapter-001"
---

# TASK: AgentAdapter Phase 1, lõi + MCP + skill

## 1. Context & Architectural Intent
- **Goal**: Một nguồn config chung `.agents/adapter/` và lệnh `yarn agents:sync [--check]` sinh config cho Claude Code và Antigravity. Phase này chỉ làm kind `mcp` và `skills`.
- **Why**: Owner dùng hai coding agent và không muốn sửa tay từng bộ config. `--check` trong CI giữ hai bên không lệch.
- **Đọc trước khi làm**: `.handoff/PLAN-agent-adapter.md` (đã được Owner duyệt, Q1–Q6 theo đề xuất mặc định):
  - §3 cấu trúc thư mục, §4 contract TS, §5 bảng map, §8 "Phase 1" (bảng file và đặc tả `write.ts`), §10 test, §11 (U1, U2, U6 đã xác nhận).
  - Mục 14 là phần Antigravity viết, 14.5 là kết luận cuối. Plan sau 14.5 là bản đúng.
- **Dependencies**: `scripts/check-knowledge-index.ts` (mẫu script `ts-node` của repo), `vitest.config.mts` (test nằm trong `tests/**/*.test.ts`, env `node`).
- **Trạng thái gốc đã kiểm (2026-11-09)**: `yarn tsc --noEmit -p .` pass; `yarn test` 72 file / 818 pass, 8 skipped. `yarn lint` toàn repo đang có 78 lỗi có từ trước (CI chỉ lint file đổi), nên gate lint ở trên chỉ chạy trên thư mục mới.

### Quyết định đã chốt (không đề xuất lại)
- Chỉ Claude Code và Antigravity. Không Codex.
- Commit cả file sinh ra (Claude/Dev commit, bạn không commit).
- Tên loại config là **kind**, không dùng "section" (xung đột `GLOSSARY.md`, ADR-0009). Kiểu đầu ra tên `GeneratedOutput`. Không dùng chữ "workspace" trong tên của mình.
- Registry là mảng `const`, không Singleton. Config load một lần ở `cli.ts` rồi truyền xuống.

## 2. Invariants & Rules
- Rule dự án: `AGENTS.md`. Thêm vào đó, riêng task này:
  - **Không thêm dependency** (không đổi `yarn.lock`). Chỉ dùng module có sẵn của Node (`fs`, `path`, `child_process`, `os`).
  - TS strict, không `any`, không `@ts-ignore`, không `eslint-disable`.
  - Không `console.*`: CLI ghi ra bằng `process.stdout.write` / `process.stderr.write`.
  - Renderer là **hàm thuần** (không đụng filesystem). Mọi thao tác fs nằm ở `load.ts` và `write.ts`; hai file này nhận đường dẫn gốc repo làm tham số để test được bằng thư mục tạm.
  - `package.json`: chỉ thêm đúng một dòng script `agents:sync`. `ci.yml`: chỉ thêm đúng một step. Không sửa gì khác trong hai file.
- **Không làm** (Claude làm sau khi verify, vì các file này đang có thay đổi chưa commit của Owner): dòng mới trong `AGENTS.md`, dòng mới trong `tests/manual/README.md`.
- Ngoài phạm vi: kind `subagents`, `hooks` (Phase 2, 3), Codex, `.claude/settings.json`, `.agents/hooks.json`, `.agents/agents/`, `.claude/agents/`.

## 3. Step-by-Step Implementation Checklist
- [x] **Step 1 (Kiểu)**: `scripts/agent-adapter/core/model.ts` và `core/adapter.ts` theo plan §4, chỉ phần Phase 1: `KindModel = { mcp: McpServer[]; skills: SkillLink[] }`. Không định nghĩa `ToolCategory`, `ModelTier`, `HookEvent`, `Subagent`, `Hook` (chưa dùng). `AgentId = 'claude' | 'antigravity'`. `GeneratedOutput` giữ cả ba biến thể (`own`, `merge-key`, `symlink`); `write.ts` chưa hỗ trợ `merge-key` nên ném lỗi rõ ràng (Phase 3 làm). `AgentAdapter` có `render` (mapped type theo `KindId`, mỗi kind là renderer, `native` hoặc `unsupported`) và `managedDirs: string[]`.
- [x] **Step 2 (Nguồn MCP)**: tạo `.agents/adapter/mcp.json` dạng `{ "servers": [ { "id": "playwright", "transport": "stdio", "command": "npx", "args": ["@playwright/mcp@latest"], "env": {} } ] }`, chuyển từ `.mcp.json` hiện có. `transport` là `stdio` hoặc `http` (`http` có `url`, `headers`). Mọi server cho phép key `x-claude` / `x-antigravity` (object) để merge vào output của tool đó.
- [x] **Step 3 (Load)**: `core/load.ts` đọc `.agents/adapter/mcp.json` và liệt kê skill: mỗi thư mục con của `.agents/skills/` có `SKILL.md` thành một `SkillLink { name }`. Validate: JSON sai cú pháp → lỗi kèm đường dẫn file; `id` trùng → lỗi; `transport` lạ → lỗi; thiếu `command` (stdio) hoặc `url` (http) → lỗi.
- [x] **Step 4 (Adapter Claude)**: `adapters/claude/index.ts`. `mcp` → một file `own` `.mcp.json`: `{ "mcpServers": { "<id>": { "type": "stdio", "command", "args", "env" } } }` (http: `type: "http"`, `url`, `headers`), thứ tự key như vậy, JSON 2 dấu cách + `\n` cuối. `skills` → mỗi skill một `symlink` `.claude/skills/<name>` trỏ `../../.agents/skills/<name>`. `managedDirs: ['.claude/skills']`.
- [x] **Step 5 (Adapter Antigravity)**: `adapters/antigravity/index.ts`. `mcp` → `own` `.agents/mcp_config.json`: `{ "mcpServers": { "<id>": { "command", "args", "env" } } }`, không có `type`; http dùng key `url` (không dùng `serverUrl`), kèm `headers`. `skills` → `{ native: '...' }` (Antigravity đọc thẳng `.agents/skills/`). `managedDirs: []`.
- [x] **Step 6 (Registry và sync)**: `adapters/index.ts` export `adapters = [claude, antigravity]`. `core/sync.ts`: với mỗi adapter × mỗi kind, gọi renderer hoặc ghi nhận `native`/`unsupported`; kết quả gồm `outputs` và `notes` (dòng mô tả cho `native`/`unsupported`). Hai output trùng `path` → ném lỗi nêu cả hai adapter. Không có code riêng cho từng tool trong `sync.ts`.
- [x] **Step 7 (Ghi file)**: `core/write.ts` theo plan §8 Phase 1: `own` ghi đè (so byte khi `--check`); `symlink` tạo/sửa (symlink có sẵn trỏ đúng thì bỏ qua; trỏ sai thì sửa); nếu đường dẫn đích là thư mục/file thật: bị gitignore (`git check-ignore -q`) thì bỏ qua, ngược lại báo lỗi, không ghi đè. Dọn symlink cũ trong `managedDirs` (`.claude/skills`): chỉ symlink có target bắt đầu bằng `../../.agents/skills/` mà đích không còn tồn tại; không động vào mục khác. Chế độ `--check`: không ghi gì, trả danh sách path lệch.
- [x] **Step 8 (CLI)**: `cli.ts`: gốc repo suy từ `path.resolve(__dirname, '..', '..')`. `yarn agents:sync` ghi file, in các dòng `native`/`unsupported` và tổng kết (số file ghi mới/đổi/không đổi). `yarn agents:sync --check` không ghi, in path lệch, exit 1 nếu có lệch; lỗi nguồn hoặc va chạm path → exit 2. Chạy lần hai liền sau lần một phải báo 0 file đổi.
- [x] **Step 9 (README nguồn)**: `.agents/adapter/README.md` ngắn (khoảng 40 dòng): bảng "muốn làm gì → sửa file nào" (Phase 1: MCP, skill; ghi chú subagent/hook sẽ có sau), danh sách file sinh (không sửa tay), cách dùng `x-claude` / `x-antigravity`, lệnh `yarn agents:sync` và `--check`.
- [x] **Step 10 (Script và CI)**: `package.json` thêm `"agents:sync": "ts-node --compiler-options '{\"module\":\"CommonJS\"}' scripts/agent-adapter/cli.ts"`. `ci.yml` thêm step `Agent config is up to date` chạy `yarn agents:sync --check`, đặt ngay sau step `Knowledge vector index is up to date`.
- [x] **Step 11 (Unit test)**: `tests/unit/agent-adapter/{mcp,skills,sync}.test.ts` (import bằng đường dẫn tương đối). Phủ plan §10 cho Phase 1: MCP stdio/http và `x-*` chỉ vào đúng tool; skills (thiếu symlink → output symlink, skill bị xoá → symlink cũ bị dọn, bỏ qua mục bị gitignore, báo lỗi khi gặp thư mục thật không bị ignore); sync (trùng path → lỗi, `native`/`unsupported` được báo, chạy lại không đổi gì, `--check` thấy lệch). `write.ts` test trên thư mục tạm (`fs.mkdtempSync` dưới `os.tmpdir()`), không đụng repo thật.
- [x] **Step 12 (Sinh file)**: chạy `yarn agents:sync` một lần để sinh `.mcp.json`, `.agents/mcp_config.json`. Kỳ vọng thay đổi ngoài code: `.mcp.json` tương đương bản cũ (khác nhau tối đa ở dòng cuối), `.agents/mcp_config.json` mới, và **một symlink mới `.claude/skills/ui-taste`** (hiện `.agents/skills/ui-taste` có mà `.claude/skills/` chưa có). Ghi nhận trong `notes` của `result.json` đúng những gì sync đã tạo/đổi.
- [x] **Step 13 (Test thủ công)**: `tests/manual/agent-adapter.md` theo khuôn `tests/manual/README.md` và `tests/manual/agent-handoff.md`: các case thêm MCP, thêm skill, sửa tay file sinh (CI `--check` phải fail), tool nào đọc được MCP `playwright`. Mọi case để `Chưa chạy`.

## 4. Verification Gate Results
<!-- Executor điền: PENDING | PASSED | FAILED | SKIPPED -->
- [x] `TypeCheck`: PASSED
- [x] `Lint` (chỉ `scripts/agent-adapter`, `tests/unit/agent-adapter`): PASSED
- [x] `Test` (kỳ vọng ≥ 818 pass, 8 skipped, cộng test mới): PASSED
- [x] `agents:sync --check` (exit 0 ngay sau khi sinh file): PASSED
- [x] `Boundary Check`: PASSED

## 5. Execution Audit Log
<!-- Executor điền. Không commit: Dev commit sau khi Claude verify -->
- **Result file**: `.handoff/runs/TASK-agent-adapter-001/result.json`
- **Modified Files**:
  - `.agents/adapter/README.md`
  - `.agents/adapter/mcp.json`
  - `.agents/mcp_config.json`
  - `.claude/skills/ui-taste`
  - `.github/workflows/ci.yml`
  - `.mcp.json`
  - `package.json`
  - `scripts/agent-adapter/adapters/antigravity/index.ts`
  - `scripts/agent-adapter/adapters/claude/index.ts`
  - `scripts/agent-adapter/adapters/index.ts`
  - `scripts/agent-adapter/cli.ts`
  - `scripts/agent-adapter/core/adapter.ts`
  - `scripts/agent-adapter/core/load.ts`
  - `scripts/agent-adapter/core/model.ts`
  - `scripts/agent-adapter/core/sync.ts`
  - `scripts/agent-adapter/core/write.ts`
  - `tests/manual/agent-adapter.md`
  - `tests/unit/agent-adapter/mcp.test.ts`
  - `tests/unit/agent-adapter/skills.test.ts`
  - `tests/unit/agent-adapter/sync.test.ts`
