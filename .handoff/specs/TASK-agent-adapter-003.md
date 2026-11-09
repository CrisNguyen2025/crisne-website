---
task_id: "TASK-agent-adapter-003"
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
    - ".claude/settings.json"
    - ".agents/hooks.json"
  continues_dirty:
    - ".agents/adapter/README.md"
    - ".agents/adapter/mcp.json"
    - ".agents/adapter/subagents/verifier/agent.json"
    - ".agents/adapter/subagents/verifier/prompt.md"
    - "scripts/agent-adapter/adapters/antigravity/index.ts"
    - "scripts/agent-adapter/adapters/claude/index.ts"
    - "scripts/agent-adapter/adapters/claude/maps.ts"
    - "scripts/agent-adapter/adapters/index.ts"
    - "scripts/agent-adapter/cli.ts"
    - "scripts/agent-adapter/core/adapter.ts"
    - "scripts/agent-adapter/core/load.ts"
    - "scripts/agent-adapter/core/model.ts"
    - "scripts/agent-adapter/core/sync.ts"
    - "scripts/agent-adapter/core/write.ts"
    - "tests/manual/agent-adapter.md"
    - "tests/unit/agent-adapter/mcp.test.ts"
    - "tests/unit/agent-adapter/skills.test.ts"
    - "tests/unit/agent-adapter/subagents.test.ts"
    - "tests/unit/agent-adapter/sync.test.ts"
  read_only_references:
    - ".handoff/PLAN-agent-adapter.md"
    - ".handoff/specs/TASK-agent-adapter-001.md"
    - ".handoff/specs/TASK-agent-adapter-002.md"
    - "AGENTS.md"
    - "GLOSSARY.md"
    - "docs/adr/**"
    - "vitest.config.mts"
  strictly_forbidden:
    - "package.json"
    - "yarn.lock"
    - "tsconfig.json"
    - "eslint.config.mjs"
    - ".gitignore"
    - ".github/**"
    - "AGENTS.md"
    - "CLAUDE.md"
    - "tests/manual/README.md"
    - "tests/manual/agent-handoff.md"
    - ".mcp.json"
    - ".agents/mcp_config.json"
    - ".agents/skills/**"
    - ".claude/skills/**"
    - ".claude/agents/**"
    - ".claude/settings.local.json"
    - ".agents/agents/**"
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
  lint: "yarn eslint scripts/agent-adapter tests/unit/agent-adapter .agents/adapter/hooks"
  test: "yarn test"
  agents_sync_check: "yarn agents:sync --check"
  boundary_check: "bash .agents/skills/agent-handoff/scripts/check-boundary.sh TASK-agent-adapter-003"
---

# TASK: AgentAdapter Phase 3, kind `hooks` và hook `guard-generated`

## 1. Context & Architectural Intent
- **Goal**: Thêm kind `hooks`. Nguồn `.agents/adapter/hooks.json` + `.agents/adapter/hooks/<id>.js` sinh cấu hình hook cho Claude Code (`.claude/settings.json`, chỉ key `hooks`) và Antigravity (`.agents/hooks.json`). Một runner dùng chung `scripts/agent-adapter/hook-runner.js` chuẩn hoá stdin/stdout giữa hai tool. Hook đầu tiên `guard-generated` chặn agent sửa trực tiếp file do `yarn agents:sync` sinh ra.
- **Why**: Agent mặc định sửa thẳng `.mcp.json` hay `.agents/mcp_config.json` rồi bị sync ghi đè. Hook này nhắc agent sửa ở `.agents/adapter/`.
- **Đọc trước khi làm**: `.handoff/PLAN-agent-adapter.md` §3, §4, §5 (các dòng "Hook: ..."), §8 "Phase 3", §10 (dòng Unit: hooks), §11 (U5), 14.2 và 14.5. Phase 1, 2 đã xong và verify; file của chúng đang dirty (chưa commit) nên nằm ở `continues_dirty`. Docs hook của Antigravity có sẵn trên máy bạn: `~/.gemini/antigravity/builtin/skills/agy-customizations/docs/hooks.md`.
- **Trạng thái gốc đã kiểm (2026-11-09)**: `tsc` pass; `yarn test` 76 file / 860 pass, 8 skipped; `yarn agents:sync --check` pass; eslint trên `scripts/agent-adapter` và `tests/unit/agent-adapter` pass. Hiện chưa có `.claude/settings.json` và `.agents/hooks.json`.

### Sự thật đã xác nhận (dùng làm căn cứ, không suy đoán lại)
- **Claude** (docs chính thức, https://code.claude.com/docs/en/hooks): stdin snake_case; `tool_name` (`Edit`, `Write`, `Bash`, `Read`...); `tool_input.file_path` là đường dẫn **tuyệt đối** cho `Write`/`Edit`/`Read`; `tool_input.command` cho `Bash`. Chặn bằng stdout JSON, exit 0: `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"..."}}`. Cấu hình ở `.claude/settings.json` → `hooks.<Event>[{matcher, hooks:[{type:"command", command, timeout}]}]`; matcher là danh sách tên tool nối bằng `|`. Biến `${CLAUDE_PROJECT_DIR}` là gốc dự án.
- **Antigravity** (docs đi kèm + kết quả verify ở plan mục 14): `.agents/hooks.json` có key ngoài cùng là **tên hook**, rồi event: `{ "<hook-id>": { "<Event>": [...] } }`. `PreToolUse`/`PostToolUse` là mảng `{matcher, hooks:[handler]}`; `SessionStart`, `Stop` là mảng handler trực tiếp (không matcher). Handler: `{type?:"command", command, timeout}`. **Cwd của lệnh hook là thư mục chứa `hooks.json`** (tức `.agents/`). stdin camelCase: `toolCall.name`, `toolCall.args`. Tên tool: `read_file`, `edit_file`, `write_file`, `run_command`. Chặn bằng stdout JSON `{"decision":"deny","reason":"..."}`. Tên key đường dẫn trong `toolCall.args` (nhiều khả năng `Path`) **chưa được xác nhận**: xem Step 1.

### Quyết định đã chốt (không đề xuất lại)
- Runner và `hook-io` viết bằng JavaScript CommonJS (`.js`), không dùng TS: mỗi lần hook chạy mà khởi động `ts-node` thì quá chậm. Hook trong `.agents/adapter/hooks/*.js` chỉ dùng `module.exports`.
- Runner **fail-open**: mọi lỗi (stdin hỏng, thiếu hook, hook ném lỗi) thì ghi stderr, không ghi stdout, exit 0. Runner tự xác định gốc repo từ `__dirname`, không dựa vào cwd.
- `guard-generated` không chặn `.claude/settings.json` (còn key khác do Owner sửa tay; nếu key `hooks` bị sửa tay thì `--check` bắt).
- Không thêm dependency. Tên loại config là **kind**; `GeneratedOutput`; không dùng chữ "workspace" trong tên của mình.

## 2. Invariants & Rules
- Rule dự án: `AGENTS.md`. Riêng task này:
  - Không thêm dependency (không đổi `yarn.lock`). Chỉ dùng module có sẵn của Node.
  - TS strict, không `any`, không `@ts-ignore`, không `eslint-disable`; không `console.*` (dùng `process.stdout.write` / `process.stderr.write`).
  - Renderer là hàm thuần (không đụng fs). fs nằm ở `load.ts`, `write.ts`, runner và `guard-generated`.
  - **Chỉ sửa đúng file trong `allowed_to_modify`.** `package.json`, `ci.yml`, `AGENTS.md`, `tests/manual/README.md`, `tests/manual/agent-handoff.md`, `.mcp.json`, `.agents/mcp_config.json`, mọi thứ dưới `.agents/skills/` và `.claude/` (trừ `.claude/settings.json`) nằm ngoài phạm vi. `yarn agents:sync` không được làm đổi các file MCP, `.claude/agents/verifier.md`, các symlink skill.
- Không sửa `baseline.txt` (`executor.md` quy tắc 6).
- Ngoài phạm vi: Codex, plugin Antigravity, quyền (`permissions`) trong `.claude/settings.json`.

## 3. Step-by-Step Implementation Checklist
- [x] **Step 1 (U5, chỉ Antigravity tự làm được)**: ghi lại stdin thật của một hook `PreToolUse` khi bạn dùng tool sửa file và tool shell. Tạo script tạm `.handoff/runs/TASK-agent-adapter-003/capture.js` (ghi nối stdin vào `.handoff/runs/TASK-agent-adapter-003/stdin-antigravity.jsonl`) và `.agents/hooks.json` tạm với một hook `PreToolUse` matcher `edit_file|write_file|run_command` gọi nó bằng đường dẫn tương đối tính từ `.agents/` (`node ../.handoff/runs/TASK-agent-adapter-003/capture.js`). Dùng `write_file` ghi một file thử `.handoff/runs/TASK-agent-adapter-003/probe.txt` và `run_command` chạy `echo ok`. Nếu hook không kích hoạt trong phiên hiện tại (cấu hình chưa nạp lại), ghi rõ "không capture được" và dùng phần parse chịu lỗi ở Step 6. Ghi vào `notes` của `result.json`: tên các key thực tế trong `toolCall.args` của `write_file`/`edit_file`/`run_command`, và cwd của lệnh hook (in `process.cwd()` vào capture). **Xoá `.agents/hooks.json` tạm trước Step 9.**
- [x] **Step 2 (Kiểu)**: `core/model.ts`: thêm `HookEvent = 'SessionStart' | 'PreToolUse' | 'PostToolUse' | 'Stop'`, `Hook = { id: string; event: HookEvent; tools?: ToolCategory[]; script: string; timeout?: number; targets?: AgentId[] }` (`tools` rỗng nghĩa là mọi tool; `targets` rỗng/thiếu nghĩa là mọi adapter), và `KindModel.hooks: Hook[]`. `core/adapter.ts` giữ nguyên hợp đồng (`merge-key` đã có sẵn trong `GeneratedOutput`).
- [x] **Step 3 (Load)**: `core/load.ts`: thêm `loadHooks(repoRoot)` đọc `.agents/adapter/hooks.json` dạng `{ "hooks": [ { "id", "event", "tools", "script", "timeout", "targets" } ] }` (file không có thì trả `[]`); đưa vào `loadConfig`. Validate (lỗi kèm đường dẫn file): JSON sai cú pháp; `id` phải khớp `^[a-z0-9][a-z0-9-]*$` và không trùng; `event` thuộc `HookEvent`; `tools` thuộc `ToolCategory`; `script` là đường dẫn tương đối tính từ `.agents/adapter/` và file phải tồn tại; `timeout` là số nguyên dương (mặc định 30); `targets` thuộc `AgentId`; hook có `tools` không rỗng mà `event` là `SessionStart`/`Stop` thì lỗi (hai event này không có tool).
- [x] **Step 4 (generated.js)**: `core/generated.js` (CommonJS): export `GENERATED_MARKER` (cùng giá trị với hằng trong `core/adapter.ts`; thêm test khẳng định hai giá trị bằng nhau), danh sách đường dẫn file sinh cố định (`.mcp.json`, `.agents/mcp_config.json`, `.agents/hooks.json`) và `isGeneratedFile(repoRoot, relPath)`: đúng với các đường dẫn cố định, hoặc file `.md` trực tiếp trong `.claude/agents/` có dòng bắt đầu bằng `GENERATED_MARKER` trong 40 dòng đầu. Thêm test: mọi đường dẫn của output kiểu `own` mà `sync()` sinh ra cho cấu hình thật của repo đều thoả `isGeneratedFile` (để danh sách không lệch khi thêm output mới).
- [x] **Step 5 (Runner)**: `scripts/agent-adapter/hook-runner.js`: `node hook-runner.js <hook-id> --agent=<claude|antigravity>`. Đọc toàn bộ stdin, nạp `adapters/<agent>/hook-io.js` (`parse`, `format`), nạp `.agents/adapter/hooks/<hook-id>.js` (`module.exports = function (input) { ... }` trả `undefined` (cho qua) hoặc `{ decision: 'deny', reason: string }`). Đầu vào chuẩn hoá cho hook: `{ event, tool: { category: 'read' | 'shell' | 'edit' | 'other', name, path?, command? }, repoRoot }`. Ghi stdout/exit code theo `format`. Fail-open như mục 1.
- [x] **Step 6 (hook-io)**: `adapters/claude/hook-io.js` và `adapters/antigravity/hook-io.js`, mỗi file export `parse(rawText)` và `format(result)`. Claude: `tool_name` → category (`Read|Grep|Glob` = read, `Bash` = shell, `Edit|Write` = edit, còn lại `other`); `tool_input.file_path` → `path`; `tool_input.command` → `command`; `format` deny → stdout JSON `hookSpecificOutput` như mục 1, exit 0; cho qua → không ghi gì, exit 0. Antigravity: `toolCall.name` → category (`read_file` = read, `run_command` = shell, `edit_file|write_file` = edit, còn lại `other`); đường dẫn lấy theo thứ tự các key `Path`, `path`, `AbsolutePath`, `TargetFile`, `FilePath`, `file_path` (dùng key đầu tiên có giá trị chuỗi, cập nhật danh sách này theo kết quả Step 1); lệnh lấy từ `CommandLine`; `format` deny → stdout `{"decision":"deny","reason":"..."}`, exit 0; cho qua → không ghi gì.
- [x] **Step 7 (Adapter render)**: `adapters/claude/index.ts`: `render.hooks` → một output `merge-key` `{ path: '.claude/settings.json', key: 'hooks', value }` với `value` gom theo event: `{ PreToolUse: [ { matcher: 'Edit|Write', hooks: [ { type: 'command', command: 'node "${CLAUDE_PROJECT_DIR}/scripts/agent-adapter/hook-runner.js" <id> --agent=claude', timeout } ] } ] }` (matcher lấy từ `tools` qua `CLAUDE_TOOL_MAP`, nối bằng `|`, bỏ trùng; `tools` rỗng thì không có `matcher`). `adapters/antigravity/index.ts`: `render.hooks` → một output `own` `.agents/hooks.json` dạng `{ "<hook-id>": { "<Event>": [...] } }`: `PreToolUse`/`PostToolUse` là `[ { matcher, hooks: [ { command: 'node ../scripts/agent-adapter/hook-runner.js <id> --agent=antigravity', timeout } ] } ]` với matcher từ bảng tool Antigravity (`read` → `read_file`; `shell` → `run_command`; `edit` → `edit_file|write_file`; thêm `ANTIGRAVITY_TOOL_MAP` vào `adapters/antigravity/maps.ts`), `SessionStart`/`Stop` là `[ handler ]`. Hook có `targets` thì chỉ render cho adapter trong `targets`. Không có hook nào thì Antigravity vẫn sinh `{}` (để `--check` biết file thuộc quyền adapter), Claude không sinh output.
- [x] **Step 8 (write.ts)**: `core/write.ts`: hỗ trợ `merge-key` (thay lỗi "chưa hỗ trợ"): đọc JSON hiện có (file thiếu thì coi là `{}`; JSON hỏng thì báo lỗi kèm đường dẫn, không ghi đè), so sánh giá trị của `key` (bằng `JSON.stringify` của giá trị đã sắp xếp ổn định, hoặc so sánh sâu), nếu khác thì ghi lại với các key khác giữ nguyên thứ tự, 2 dấu cách + `\n` cuối. `--check` không ghi, báo `created`/`changed` như `own`.
- [x] **Step 9 (Nguồn hook và guard)**: `.agents/adapter/hooks.json` với một hook: `{ "id": "guard-generated", "event": "PreToolUse", "tools": ["edit"], "script": "hooks/guard-generated.js", "timeout": 10 }`. `.agents/adapter/hooks/guard-generated.js`: nhận input chuẩn hoá; nếu `tool.category === 'edit'` và có `tool.path`: chuyển `path` về đường dẫn tương đối so với `repoRoot` (chấp nhận cả đường dẫn tuyệt đối và tương đối), và nếu `isGeneratedFile(repoRoot, rel)` thì trả `{ decision: 'deny', reason }` với lý do tiếng Việt nêu file đó do `yarn agents:sync` sinh ra, chỉ ra nguồn cần sửa (`.agents/adapter/mcp.json` cho hai file MCP, `.agents/adapter/hooks.json` cho `.agents/hooks.json`, `.agents/adapter/subagents/<tên>/` cho `.claude/agents/<tên>.md`) và nhắc chạy `yarn agents:sync`. Ngoài ra trả `undefined`. Đường dẫn nằm ngoài repo thì cho qua. File `.claude/agents/*.md` viết tay (không marker) và file mới chưa tồn tại thì cho qua.
- [x] **Step 10 (Sinh file)**: xoá `.agents/hooks.json` tạm của Step 1 (nếu có), chạy `yarn agents:sync`. Kỳ vọng: `.claude/settings.json` mới (chỉ có key `hooks`), `.agents/hooks.json` mới; mọi file sinh khác không đổi. Ghi đúng những gì sync đã tạo/đổi vào `notes`. Chạy lần hai phải báo 0 file đổi.
- [x] **Step 11 (Unit test)**: `tests/unit/agent-adapter/hooks.test.ts` (import đường dẫn tương đối) phủ plan §10 cho hook: (a) `hook-io` của cả hai tool cho cùng đầu vào chuẩn hoá (kể cả `file_path` / các key đường dẫn của Antigravity); (b) `format` deny cho từng tool đúng định dạng, cho qua thì không có stdout; (c) render Claude (gom theo event, matcher, lệnh dùng `${CLAUDE_PROJECT_DIR}`) và Antigravity (key tên hook ngoài cùng, lệnh dùng `../scripts/...`, `SessionStart` không matcher, `{}` khi không có hook); (d) `write.ts` `merge-key`: tạo file mới, giữ nguyên key khác, idempotent, `--check`, JSON hỏng thì lỗi; (e) loader: từng trường hợp lỗi ở Step 3; (f) `guard-generated`: chặn `.mcp.json`, `.agents/mcp_config.json`, `.agents/hooks.json`, `.claude/agents/verifier.md` (đường dẫn tuyệt đối và tương đối), cho qua `.agents/adapter/mcp.json`, `.claude/settings.json`, file `.claude/agents/` viết tay, đường dẫn ngoài repo; (g) runner chạy bằng `child_process.spawnSync('node', [...], { input, cwd: os.tmpdir() })` để kiểm cwd không ảnh hưởng: deny đúng định dạng cho cả hai tool; stdin hỏng, hook id không tồn tại, hook ném lỗi đều exit 0 và stdout rỗng (fail-open). Cập nhật test cũ nếu thay đổi kiểu làm chúng hỏng.
- [x] **Step 12 (Tài liệu)**: `.agents/adapter/README.md`: thêm hàng Hook (nguồn, lệnh), danh sách file sinh mới (`.claude/settings.json` chỉ key `hooks`, `.agents/hooks.json`), ghi chú hook `guard-generated` và fail-open. `tests/manual/agent-adapter.md`: thêm case (T7) bảo Claude Code sửa `.mcp.json` thì bị chặn và nêu nguồn cần sửa; (T8) cùng việc đó trên Antigravity; (T9) `yarn agents:sync` vẫn ghi được file sinh. Mọi case `Chưa chạy`.

## 4. Verification Gate Results
<!-- Executor điền: PENDING | PASSED | FAILED | SKIPPED -->
- [x] `TypeCheck`: PASSED
- [x] `Lint` (`scripts/agent-adapter`, `tests/unit/agent-adapter`, `.agents/adapter/hooks`): PASSED
- [x] `Test` (kỳ vọng ≥ 860 pass, 8 skipped, cộng test mới): PASSED (877 passed, 8 skipped)
- [x] `agents:sync --check` (exit 0 ngay sau khi sinh file): PASSED
- [x] `Boundary Check`: PASSED

## 5. Execution Audit Log
<!-- Executor điền. Không commit: Dev commit sau khi Claude verify -->
- **Result file**: `.handoff/runs/TASK-agent-adapter-003/result.json`
- **Modified Files**:
  - `.agents/adapter/README.md`
  - `.agents/adapter/hooks.json`
  - `.agents/adapter/hooks/guard-generated.js`
  - `.agents/hooks.json`
  - `.claude/settings.json`
  - `scripts/agent-adapter/adapters/antigravity/hook-io.js`
  - `scripts/agent-adapter/adapters/antigravity/index.ts`
  - `scripts/agent-adapter/adapters/antigravity/maps.ts`
  - `scripts/agent-adapter/adapters/claude/hook-io.js`
  - `scripts/agent-adapter/adapters/claude/index.ts`
  - `scripts/agent-adapter/core/generated.js`
  - `scripts/agent-adapter/core/load.ts`
  - `scripts/agent-adapter/core/model.ts`
  - `scripts/agent-adapter/core/write.ts`
  - `scripts/agent-adapter/hook-runner.js`
  - `tests/manual/agent-adapter.md`
  - `tests/unit/agent-adapter/hooks.test.ts`
  - `tests/unit/agent-adapter/subagents.test.ts`
  - `tests/unit/agent-adapter/sync.test.ts`
