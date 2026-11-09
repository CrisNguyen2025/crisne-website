---
task_id: "TASK-agent-adapter-002"
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
    - ".agents/skills/verify-ci/**"
    - ".claude/skills/verify-ci"
    - ".claude/agents/**"
  continues_dirty:
    - "scripts/agent-adapter/core/model.ts"
    - "scripts/agent-adapter/core/adapter.ts"
    - "scripts/agent-adapter/core/load.ts"
    - "scripts/agent-adapter/core/sync.ts"
    - "scripts/agent-adapter/core/write.ts"
    - "scripts/agent-adapter/adapters/claude/index.ts"
    - "scripts/agent-adapter/adapters/antigravity/index.ts"
    - "scripts/agent-adapter/adapters/index.ts"
    - "scripts/agent-adapter/cli.ts"
    - ".agents/adapter/mcp.json"
    - "tests/unit/agent-adapter/mcp.test.ts"
    - "tests/unit/agent-adapter/skills.test.ts"
    - "tests/unit/agent-adapter/sync.test.ts"
    - "tests/manual/agent-adapter.md"
    - ".agents/adapter/README.md"
  read_only_references:
    - ".handoff/PLAN-agent-adapter.md"
    - ".handoff/specs/TASK-agent-adapter-001.md"
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
    - ".mcp.json"
    - ".agents/mcp_config.json"
    - ".claude/settings.json"
    - ".agents/hooks.json"
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
  lint: "yarn eslint scripts/agent-adapter tests/unit/agent-adapter"
  test: "yarn test"
  agents_sync_check: "yarn agents:sync --check"
  boundary_check: "bash .agents/skills/agent-handoff/scripts/check-boundary.sh TASK-agent-adapter-002"
---

# TASK: AgentAdapter Phase 2, kind `subagents` (Claude) và skill `verify-ci`

## 1. Context & Architectural Intent
- **Goal**: Thêm kind `subagents` vào adapter. Nguồn `.agents/adapter/subagents/<name>/{agent.json,prompt.md}` sinh `.claude/agents/<name>.md` cho Claude Code. Antigravity khai báo `unsupported`. Thêm skill dùng chung `verify-ci` và subagent `verifier` dùng skill đó.
- **Why**: Antigravity không nạp subagent từ file tĩnh (đã xác nhận, plan mục 14), nên subagent chỉ có ở Claude; phần quy trình nằm ở skill để cả hai tool dùng.
- **Đọc trước khi làm**: `.handoff/PLAN-agent-adapter.md` §3, §4, §5, §8 "Phase 2", §10 (dòng Unit: subagents), §11 (U3, U7), §13 (Q6), 14.5. Phase 1 đã xong, đã verify: xem `.handoff/specs/TASK-agent-adapter-001.md` và mã trong `scripts/agent-adapter/`. File của Phase 1 đang dirty (chưa commit), nên được liệt kê ở `continues_dirty`.
- **Trạng thái gốc đã kiểm (2026-11-09)**: `tsc` pass; `yarn test` 75 file / 842 pass, 8 skipped; `yarn agents:sync --check` pass; eslint trên `scripts/agent-adapter` và `tests/unit/agent-adapter` pass.

### Quyết định đã chốt (không đề xuất lại)
- Subagent chỉ sinh cho Claude. `adapters/antigravity/index.ts` đặt `render.subagents = { unsupported: '<lý do: Antigravity chỉ nạp subagent từ plugin hoặc define_subagent lúc runtime, xem PLAN-agent-adapter.md mục 14>' }`. Không làm plugin cho Antigravity (U7 chưa rõ).
- Frontmatter tự ghép bằng chuỗi, không thêm thư viện YAML. Chuỗi dùng `JSON.stringify` (JSON string là YAML hợp lệ).
- Tên loại config là **kind** (không dùng "section"), `GeneratedOutput` (không `OutputFile`), không dùng chữ "workspace" trong tên của mình.

## 2. Invariants & Rules
- Rule dự án: `AGENTS.md`. Riêng task này:
  - Không thêm dependency (không đổi `yarn.lock`). Chỉ dùng module có sẵn của Node.
  - TS strict, không `any`, không `@ts-ignore`, không `eslint-disable`, không `console.*` (dùng `process.stdout.write` / `process.stderr.write`).
  - Renderer là hàm thuần, không đụng filesystem. fs nằm ở `load.ts` và `write.ts`.
  - **Chỉ sửa đúng các file trong `allowed_to_modify`.** `package.json`, `ci.yml`, `AGENTS.md`, `tests/manual/README.md`, `.mcp.json`, `.agents/mcp_config.json` nằm ngoài phạm vi. `yarn agents:sync` không được làm đổi hai file MCP (nội dung sinh ra phải giống hệt).
- Không sửa `baseline.txt` (`executor.md` quy tắc 6).
- Ngoài phạm vi: kind `hooks` (Phase 3), Codex, plugin Antigravity, `.claude/settings.json`.

## 3. Step-by-Step Implementation Checklist
- [x] **Step 1 (Kiểu)**: `core/model.ts`: thêm `ToolCategory = 'read' | 'shell' | 'edit'`, `ModelTier = 'fast' | 'strong' | 'inherit'`, `Subagent = Passthrough & { name; description; tools: ToolCategory[]; model: ModelTier; readOnly: boolean; skills: string[]; prompt: string }`, và `KindModel.subagents: Subagent[]`. Dọn nit: thử đổi `Passthrough` thành `Record<\`x-${string}\`, Record<string, unknown>>` như plan §4; nếu làm test/kiểu phức tạp hơn mức hợp lý thì giữ nguyên, ghi vào `notes` (không dùng `as any`). `core/adapter.ts`: export hằng `GENERATED_MARKER = '<!-- generated by yarn agents:sync'` dùng chung cho renderer và `write.ts`.
- [x] **Step 2 (Load)**: `core/load.ts`: thêm `loadSubagents(repoRoot)` đọc `.agents/adapter/subagents/<name>/agent.json` và `prompt.md` (thư mục `subagents/` không có thì trả `[]`), và đưa vào `loadConfig`. `agent.json` gồm: `name` (phải bằng tên thư mục), `description` (chuỗi không rỗng), `tools` (mảng không rỗng các `ToolCategory`), `model` (`ModelTier`), `readOnly` (boolean, mặc định `false`), `skills` (mảng tên skill, mặc định `[]`; mỗi tên phải có `.agents/skills/<tên>/SKILL.md`), cùng `x-claude` / `x-antigravity` (object). Lỗi (kèm đường dẫn file): JSON sai cú pháp, `name` lệch tên thư mục, `tools` rỗng hoặc có giá trị lạ, `model` lạ, `readOnly: true` mà `tools` có `edit`, skill không tồn tại, `prompt.md` rỗng hoặc thiếu.
- [x] **Step 3 (sync.ts, risk của Phase 1)**: `core/sync.ts`: bỏ danh sách kind viết cứng `['mcp','skills']`, lấy kind từ `Object.keys(config)` (ép kiểu `KindId[]` gọn, không `any`). Thêm kind mới vào `KindModel` chỉ cần sửa `load.ts` và các adapter, không đụng `sync.ts` (plan §7).
- [x] **Step 4 (Adapter Claude)**: `adapters/claude/maps.ts`: `read` → `Read, Grep, Glob`; `shell` → `Bash`; `edit` → `Edit, Write`; `fast`/`strong`/`inherit` → `haiku`/`opus`/`inherit`. `adapters/claude/index.ts`: `subagents` → mỗi subagent một `own` `.claude/agents/<name>.md` với định dạng sau (thứ tự dòng cố định; `tools` khử trùng lặp giữ thứ tự):
  ```
  ---
  name: <name>
  description: <JSON.stringify(description)>
  tools: Read, Grep, Glob, Bash
  disallowedTools: Edit, Write        (chỉ khi readOnly)
  model: haiku
  <các key trong x-claude, mỗi key một dòng: số và boolean để nguyên, chuỗi dùng JSON.stringify>
  skills:                              (bỏ cả khối nếu skills rỗng)
    - <tên skill>
  ---
  <!-- generated by yarn agents:sync — sửa ở .agents/adapter/subagents/<name>/ -->

  <nội dung prompt.md, kết thúc bằng đúng một dòng trống>
  ```
  `managedDirs: ['.claude/skills', '.claude/agents']`.
- [x] **Step 5 (Adapter Antigravity)**: `adapters/antigravity/index.ts`: `render.subagents = { unsupported: ... }` như mục 1. `yarn agents:sync` phải in một dòng `antigravity: subagents unsupported (...)`.
- [x] **Step 6 (write.ts)**: `core/write.ts`: mở rộng dọn file cũ cho `managedDirs`: ngoài symlink (giữ nguyên logic Phase 1), xoá file `.md` nằm trực tiếp trong thư mục quản lý mà **có dòng `GENERATED_MARKER`** nhưng không còn trong output. File `.md` viết tay (không có marker) tuyệt đối không bị đụng. `--check` báo `stale` cho các file này. Đổi thông báo lỗi `merge-key` sang tiếng Việt cho nhất quán.
- [x] **Step 7 (Skill verify-ci)**: tạo `.agents/skills/verify-ci/SKILL.md` (frontmatter `name: verify-ci`, `description` nêu khi nào dùng; **không** đặt `disable-model-invocation`). Nội dung (tiếng Việt, thuật ngữ kỹ thuật giữ tiếng Anh): chạy đúng các lệnh ở mục "Commands" của `AGENTS.md` theo phạm vi được giao, chọn theo file đổi (`git status --porcelain`): `yarn tsc --noEmit -p .` khi có `.ts/.tsx`; **lint chỉ trên file đổi** (`yarn eslint <các file>`) giống CI, **không chạy `yarn lint` toàn repo** (đang có 78 lỗi cũ); `yarn test`; Python (`cd roadmap-rag-assistant && python -m pytest -q`, `python -m evals validate`) chỉ khi `roadmap-rag-assistant/` có thay đổi; `yarn test:schema-sql --check` khi `prisma/` đổi; `yarn check:knowledge-index` khi dữ liệu knowledge đổi. Quy tắc: không sửa file nào; chạy cả khi lệnh trước fail; báo bảng pass/fail từng lệnh, mỗi lỗi dạng `file:line` kèm một dòng mô tả; nêu rõ lệnh nào không chạy được hoặc chưa verify. Symlink `.claude/skills/verify-ci` do `yarn agents:sync` tạo.
- [x] **Step 8 (Nguồn verifier)**: tạo `.agents/adapter/subagents/verifier/agent.json`: `name: "verifier"`, `description` (một câu tiếng Việt: chạy các lệnh CI của repo, báo pass/fail kèm lỗi `file:line`, chỉ đọc không sửa file, dùng chủ động sau khi sửa code), `tools: ["read", "shell"]`, `model: "fast"`, `readOnly: true`, `skills: ["verify-ci"]`, `x-claude: { "maxTurns": 15 }`. Và `prompt.md` ngắn (3 đến 5 dòng): làm theo skill `verify-ci` trong phạm vi người gọi giao, không sửa file, trả lời tiếng Việt giữ nguyên thuật ngữ kỹ thuật tiếng Anh.
- [x] **Step 9 (Sinh file)**: chạy `yarn agents:sync`. Kỳ vọng thay đổi: `.claude/agents/verifier.md` mới và symlink `.claude/skills/verify-ci` mới. `.mcp.json` và `.agents/mcp_config.json` không đổi. Ghi đúng những gì sync đã tạo/đổi vào `notes`.
- [x] **Step 10 (Unit test)**: `tests/unit/agent-adapter/subagents.test.ts` (import đường dẫn tương đối) phủ: (a) Claude render đúng chuỗi mong đợi cho một subagent mẫu, gồm `disallowedTools` khi `readOnly`, `skills` có/không, `x-claude` số/chuỗi/boolean, header nằm sau frontmatter, `tools` khử trùng lặp; (b) loader báo lỗi cho từng trường hợp ở Step 2; (c) Antigravity `unsupported` và không sinh file; (d) `write.ts`: file `.md` có marker không còn trong output bị xoá, file `.md` không marker còn nguyên, `--check` báo `stale`; (e) `sync.ts` lấy kind từ config (một config có kind phụ vẫn được xử lý mà không sửa `sync.ts`). Cập nhật `mcp.test.ts`, `skills.test.ts`, `sync.test.ts` nếu thay đổi kiểu làm chúng hỏng.
- [x] **Step 11 (Tài liệu)**: `.agents/adapter/README.md`: hàng Subagent ghi rõ "chỉ sinh cho Claude, Antigravity `unsupported`", thêm file sinh `.claude/agents/<name>.md`, nhắc skill `verify-ci` là cách Antigravity dùng chung. `tests/manual/agent-adapter.md`: thêm case: (T5) thêm một subagent chỉ đọc, chạy sync, Claude thấy `.claude/agents/<name>.md`, Antigravity báo `unsupported`; (T6) sửa tay `.claude/agents/verifier.md`, `--check` phải fail. Mọi case `Chưa chạy`.

## 4. Verification Gate Results
<!-- Executor điền: PENDING | PASSED | FAILED | SKIPPED -->
- [x] `TypeCheck`: PASSED
- [x] `Lint` (chỉ `scripts/agent-adapter`, `tests/unit/agent-adapter`): PASSED
- [x] `Test` (kỳ vọng ≥ 842 pass, 8 skipped, cộng test mới): PASSED (857 pass, 8 skipped)
- [x] `agents:sync --check` (exit 0 ngay sau khi sinh file): PASSED
- [x] `Boundary Check`: PASSED

## 5. Execution Audit Log
<!-- Executor điền. Không commit: Dev commit sau khi Claude verify -->
- **Result file**: `.handoff/runs/TASK-agent-adapter-002/result.json`
- **Modified Files**:
  - `.agents/adapter/README.md`
  - `.agents/adapter/subagents/verifier/agent.json`
  - `.agents/adapter/subagents/verifier/prompt.md`
  - `.agents/skills/verify-ci/SKILL.md`
  - `.claude/agents/verifier.md`
  - `.claude/skills/verify-ci`
  - `scripts/agent-adapter/adapters/antigravity/index.ts`
  - `scripts/agent-adapter/adapters/claude/index.ts`
  - `scripts/agent-adapter/adapters/claude/maps.ts`
  - `scripts/agent-adapter/core/adapter.ts`
  - `scripts/agent-adapter/core/load.ts`
  - `scripts/agent-adapter/core/model.ts`
  - `scripts/agent-adapter/core/sync.ts`
  - `scripts/agent-adapter/core/write.ts`
  - `tests/manual/agent-adapter.md`
  - `tests/unit/agent-adapter/subagents.test.ts`
  - `tests/unit/agent-adapter/sync.test.ts`
