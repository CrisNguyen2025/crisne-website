# PLAN: AgentAdapter, một nguồn config cho nhiều coding agent

- **Trạng thái:** Đã triển khai Phase 1–3 (2026-11-09) qua handoff v3 và verify; hook đã được thử trên Antigravity thật (T8 Pass). Chưa commit. Q1–Q6 theo đề xuất mặc định; còn mở: `ui-taste`, spec chạy thử, dòng `AGENTS.md`.
- **Người viết:** Claude Code (Opus 5.5), 2026-11-09
- **Phạm vi:** tooling cho coding agent: `scripts/agent-adapter/`, `.agents/adapter/`, các file config agent do script sinh ra, 1 script trong `package.json`, 1 step CI, 1 dòng `AGENTS.md`. Không đụng code ứng dụng, Python service, DB.
- **Target hiện tại:** Claude Code, Antigravity. Codex thêm sau bằng một adapter mới (mục 7).
- **Liên quan:** `.handoff/PLAN-agent-instructions-sync.md` (cấu trúc 3 tầng, đã chốt). `.handoff/PLAN-agents-md-slim.md` (đang sửa `AGENTS.md`, chưa commit).

---

## 1. Căn cứ (docs chính thức)

| Loại | Claude Code | Antigravity |
|---|---|---|
| Rule | `CLAUDE.md` (repo đang `@AGENTS.md`) | `AGENTS.md`/`GEMINI.md` ở root, `.agents/rules/*.md` ([rules](https://antigravity.google/docs/rules)) |
| Skill | `.claude/skills/<x>/SKILL.md` | `.agents/skills/<x>/SKILL.md` ([skills](https://antigravity.google/docs/skills)) |
| MCP | `.mcp.json`: `mcpServers.<id>.{type,command,args,env,url,headers}` | `.agents/mcp_config.json`: `mcpServers.<id>.{command \| url,args,env,headers,…}`, không có `type`; `serverUrl` là key cũ, vẫn nhận ([mcp](https://antigravity.google/docs/mcp); `mcp_servers.md` đi kèm Antigravity) |
| Subagent | `.claude/agents/<name>.md`, YAML: `tools: Read, Bash`, `model: haiku\|sonnet\|opus\|inherit`, `disallowedTools`, `maxTurns` ([sub-agents](https://code.claude.com/docs/en/sub-agents)) | **không nạp** file tĩnh `.agents/agents/*.md` (đã thử, mục 14.1 U3). Chỉ nạp từ plugin hoặc `define_subagent` lúc runtime. Docs công khai ghi plugin có thư mục `agents/`, nhưng `plugins.md` đi kèm Antigravity không liệt kê thư mục này (U7), nên đợt này chưa dùng ([subagents](https://antigravity.google/docs/subagents)) |
| Hook | `.claude/settings.json` → `hooks.<Event>[{matcher, hooks:[{type,command,timeout}]}]`; stdin snake_case (`tool_name`, `tool_input`); deny bằng `hookSpecificOutput.permissionDecision` ([hooks](https://code.claude.com/docs/en/hooks)) | `.agents/hooks.json` → `<hook-id>: { <Event>: [{matcher, hooks:[{command,timeout}]}] }` (key ngoài cùng là tên hook); CWD của lệnh hook là thư mục chứa `hooks.json`, tức `.agents/`; stdin camelCase (`toolCall.name`, `toolCall.args`); deny bằng `{"decision":"deny","reason":"..."}` ([hooks](https://antigravity.google/docs/hooks)) |

Event hook có ở cả hai: `SessionStart`, `PreToolUse`, `PostToolUse`, `Stop`.

Tên tool của Antigravity (kiểm trong runtime, mục 14.1 U6): đọc `read_file`, sửa `edit_file` và `write_file`, shell `run_command`. Không có tool tìm kiếm hay liệt kê thư mục riêng.

## 2. Mục tiêu và ngoài phạm vi

**Làm:** Owner và agent chỉ sửa config ở `.agents/adapter/`. `yarn agents:sync` sinh config đúng định dạng cho từng tool. `yarn agents:sync --check` trong CI fail khi file sinh ra lệch nguồn.

**Không làm:**
- Rule: cả hai tool đọc thẳng `AGENTS.md`, không cần adapter.
- Permission/settings khác ngoài key `hooks` (`permissions`, `commandExecutionPolicy` toàn cục): mô hình bảo mật khác nhau, Owner tự quản.
- Tầng cá nhân (`~/.claude`, `~/.gemini`): thuộc repo `agent-config`.
- Tầng máy: MCP build local trong `.agents/mcp-servers/` (lighthouse, next-devtools, chưa track) và MCP đăng ký scope local. Vẫn nằm ở `CLAUDE.local.md`.
- Codex trong đợt này.
- Subagent cho Antigravity (cần plugin hoặc `define_subagent`): kind `subagents` của Antigravity là `unsupported` đợt này. Thay bằng skill `verify-ci` dùng chung (Phase 2, Q6).

## 3. Cấu trúc

```
.agents/adapter/                     ← NGUỒN, chỉ sửa ở đây
  README.md                          ← bản đồ "muốn làm gì → sửa file nào"
  mcp.json                           ← Phase 1
  subagents/<name>/agent.json        ← Phase 2 (metadata)
  subagents/<name>/prompt.md         ← Phase 2 (system prompt)
  hooks.json                         ← Phase 3 (khai báo)
  hooks/<id>.js                      ← Phase 3 (logic hook, viết trung lập)

scripts/agent-adapter/               ← ENGINE, chỉ sửa khi thêm target hoặc kind
  cli.ts                             ← yarn agents:sync [--check]
  core/
    model.ts                         ← kiểu trung lập + KindModel
    adapter.ts                       ← interface AgentAdapter, GeneratedOutput
    load.ts                          ← đọc + validate nguồn → AgentConfig
    sync.ts                          ← adapters × kinds → GeneratedOutput[]
    write.ts                         ← ghi / --check / dọn file sinh cũ
    generated.js                     ← danh sách pattern file sinh (Phase 3 dùng chung với hook)
  adapters/
    index.ts                         ← export const adapters = [claude, antigravity]
    claude/index.ts · maps.ts · hook-io.js
    antigravity/index.ts · maps.ts · hook-io.js
  hook-runner.js                     ← Phase 3

FILE SINH RA (commit, không sửa tay)
  Claude:      .mcp.json · .claude/agents/*.md · .claude/settings.json (chỉ key hooks) · .claude/skills/<x> (symlink)
  Antigravity: .agents/mcp_config.json · .agents/hooks.json   (subagents: unsupported · skills: đọc thẳng .agents/skills)
```

Quy ước đặt tên: dùng **kind** cho loại config (mcp, skills, subagents, hooks). Không dùng "section", vì `Section` là thuật ngữ domain trong `GLOSSARY.md` (ADR-0009). Cũng tránh "workspace" (glossary: `Project` _Avoid_ workspace) trong tên của mình. Field ngoài như `workspacePaths` của Antigravity thì giữ nguyên.

Hook viết bằng `.js` (CommonJS, repo không có `"type": "module"`), không dùng `.ts`: mỗi lần chạy hook mà khởi động `ts-node` thì rất chậm, còn Node 20 chưa chạy TS trực tiếp được. File `.js` trong `scripts/**` đã được ESLint cho phép dùng `require()` (`eslint.config.mjs:10-14`). Hook trong `.agents/adapter/hooks/` chỉ dùng `module.exports`, không cần `require`.

## 4. Contract

```ts
// core/model.ts
export type ToolCategory = 'read' | 'shell' | 'edit';
export type ModelTier = 'fast' | 'strong' | 'inherit';
export type HookEvent = 'SessionStart' | 'PreToolUse' | 'PostToolUse' | 'Stop';
export type Passthrough = Record<`x-${string}`, Record<string, unknown>>;

export type McpServer = Passthrough & (
  | { id: string; transport: 'stdio'; command: string; args: string[]; env: Record<string, string> }
  | { id: string; transport: 'http'; url: string; headers: Record<string, string> }
);
export type SkillLink = { name: string };
export type Subagent = Passthrough & {
  name: string; description: string; tools: ToolCategory[];
  model: ModelTier; readOnly: boolean; skills: string[]; prompt: string;
};
export type Hook = {
  id: string; event: HookEvent; tools: ToolCategory[];   // tools rỗng = mọi tool
  script: string; timeout: number; targets?: AgentId[];  // targets rỗng = mọi adapter
};

export type KindModel = {      // Phase 1: mcp, skills · Phase 2: + subagents · Phase 3: + hooks
  mcp: McpServer[]; skills: SkillLink[]; subagents: Subagent[]; hooks: Hook[];
};
export type KindId = keyof KindModel;
export type AgentConfig = KindModel;

// core/adapter.ts
export type AgentId = 'claude' | 'antigravity';
export type GeneratedOutput =
  | { kind: 'own'; path: string; content: string }
  | { kind: 'merge-key'; path: string; key: string; value: unknown }
  | { kind: 'symlink'; path: string; target: string };

export type Renderer<T> = (items: T) => GeneratedOutput[];
export type Native = { native: string };            // tool tự đọc nguồn, không cần sinh
export type Unsupported = { unsupported: string };  // tool không có tính năng này

export interface AgentAdapter {
  id: AgentId;
  render: { [K in KindId]: Renderer<KindModel[K]> | Native | Unsupported };
  managedDirs: string[];  // thư mục chứa file sinh có header, để dọn file cũ
}
```

- Nhờ mapped type `render`, thiếu một kind trong một adapter là `yarn tsc` fail.
- Renderer là hàm thuần (không đụng fs), test bằng input/output.
- `sync.ts` không biết gì về từng tool. Nó chạy `adapters × kinds`, in `native`/`unsupported` ra màn hình, và fail nếu hai output trùng `path`.
- Antigravity khai báo `render.subagents = { unsupported: '...' }` (lý do: chỉ nạp từ plugin hoặc `define_subagent`) và `managedDirs: []`.
- Registry là mảng `const` cấp module, không có class Singleton. Config load một lần trong `cli.ts` rồi truyền xuống.

## 5. Bảng map (nằm trong `adapters/<id>/maps.ts`)

| Trung lập | Claude | Antigravity |
|---|---|---|
| `read` | `Read, Grep, Glob` | `read_file` |
| `shell` | `Bash` | `run_command` |
| `edit` | `Edit, Write` | `edit_file, write_file` |
| `fast` / `strong` / `inherit` | `haiku` / `opus` / `inherit` | `flash` / `pro` / `inherit` |
| `readOnly: true` | `disallowedTools: Edit, Write` | không áp dụng (subagent Antigravity là `unsupported`) |
| `skills` của subagent | `skills:` trong frontmatter | không áp dụng |
| MCP `stdio` | `type: "stdio"`, `command`, `args`, `env` | `command`, `args`, `env` |
| MCP `http` | `type: "http"`, `url`, `headers` | `url`, `headers` |
| Hook: khai báo | `hooks.<Event>[]` trong `.claude/settings.json` (gom theo event) | `{ "<hook-id>": { "<Event>": [] } }` trong `.agents/hooks.json` (mỗi hook một key) |
| Hook: matcher tool `edit` | `Edit\|Write` | `edit_file\|write_file` |
| Hook: đọc đường dẫn file từ stdin | `tool_input.file_path` | `toolCall.args.Path` |
| Hook: kết quả deny | `hookSpecificOutput.permissionDecision: "deny"` hoặc exit 2 | `{"decision":"deny","reason":"..."}` |
| `x-claude` / `x-antigravity` | merge vào frontmatter hoặc server của Claude | merge vào frontmatter hoặc server của Antigravity |

Antigravity còn tier model `flash_lite`, không dùng. Hai dòng đọc đường dẫn file (`file_path`, `Path`) chưa thấy trong docs, kiểm bằng stdin thật ở Phase 3 (U5).

Validate ở `load.ts`: `readOnly` mà có `edit` thì lỗi. Trùng `name`/`id` thì lỗi. Hook có event mà adapter không hỗ trợ, lại không giới hạn `targets`, thì lỗi.

## 6. Cách dùng

### Owner và agent

| Muốn làm | Sửa | Sau đó |
|---|---|---|
| Rule dự án | `AGENTS.md` | không cần sync |
| Skill | `.agents/skills/<x>/SKILL.md` | `yarn agents:sync` (tạo symlink cho Claude) |
| MCP dự án | `.agents/adapter/mcp.json` | `yarn agents:sync` |
| Subagent | `.agents/adapter/subagents/<name>/{agent.json,prompt.md}` | `yarn agents:sync` (chỉ sinh cho Claude) |
| Hook | `.agents/adapter/hooks.json` + `hooks/<id>.js` | `yarn agents:sync` |

Commit cả nguồn lẫn file sinh. Người clone repo không cần chạy script vẫn có config.

### Để agent tự tìm đúng chỗ

1. **`AGENTS.md`**, 1 dòng, cả hai tool luôn nạp: *"Config agent (MCP, subagent, hook) sửa ở `.agents/adapter/`, rồi chạy `yarn agents:sync`. Không sửa file do sync sinh ra. Chi tiết: `.agents/adapter/README.md`."*
2. **`.agents/adapter/README.md`**: bảng trên + danh sách file sinh + cách dùng `x-<tool>`.
3. **Header** dòng đầu body của mọi file `.md` sinh ra: `<!-- generated by yarn agents:sync — sửa ở .agents/adapter/subagents/<name>/ -->`. Đặt sau frontmatter, vì frontmatter phải nằm ở dòng 1.
4. **Hook `guard-generated`** (Phase 3) deny khi tool `edit` đụng vào file sinh.
5. **`--check`** trong CI. Nó cũng báo thư mục thật (không phải symlink, không bị gitignore) trong `.claude/skills/`, tức skill bị tạo sai chỗ.

## 7. Mở rộng

| Việc | Sửa | Không đụng |
|---|---|---|
| Thêm Codex | `adapters/codex/{index.ts,maps.ts,hook-io.js}`, thêm vào `adapters/index.ts`, thêm `'codex'` vào `AgentId` | `core/`, adapter khác, nguồn |
| Thêm kind (ví dụ slash command) | key mới trong `KindModel`, loader trong `load.ts`, render/`native`/`unsupported` ở mỗi adapter (tsc sẽ chỉ chỗ thiếu) | `sync.ts`, `write.ts`, `cli.ts` |
| Đổi tên tool/model của một tool | `adapters/<id>/maps.ts` | còn lại |
| Subagent cho Antigravity | thay `unsupported` bằng renderer sinh plugin `.agents/plugins/<name>/` (sau khi U7 rõ) | `core/`, Claude |

Ghi chú cho Codex: nó đọc thẳng `AGENTS.md` và `.agents/skills` (đều `native`); subagent sinh ra `.codex/agents/<name>.toml` ([docs](https://learn.chatgpt.com/docs/agent-configuration/subagents.md)). MCP nằm trong `.codex/config.toml` cùng setting khác: muốn ghi riêng `[mcp_servers]` thì phải parse TOML (cần dependency, phải hỏi Owner), nếu không thì adapter sở hữu cả file. Hook của Codex chưa có docs chính thức.

## 8. Các phase

Mỗi phase ship độc lập: sau phase N, repo chạy đúng dù N+1 không bao giờ làm.

### Phase 1: lõi + MCP + skill

| File | Việc |
|---|---|
| `scripts/agent-adapter/core/{model,adapter,load,sync,write}.ts` | mới; `KindModel = { mcp, skills }` |
| `scripts/agent-adapter/adapters/{index.ts, claude/index.ts, antigravity/index.ts}` | mới; Claude: mcp → `.mcp.json`, skills → symlink; Antigravity: mcp → `.agents/mcp_config.json`, skills → `native` |
| `scripts/agent-adapter/cli.ts` | mới |
| `.agents/adapter/mcp.json` | mới, chuyển từ `.mcp.json` hiện tại (`playwright`, stdio, `npx @playwright/mcp@latest`, `env: {}`) |
| `.agents/adapter/README.md` | mới |
| `.mcp.json` | sinh lại, nội dung tương đương bản hiện tại |
| `.agents/mcp_config.json` | mới (sinh) |
| `package.json` | thêm `"agents:sync": "ts-node --compiler-options '{\"module\":\"CommonJS\"}' scripts/agent-adapter/cli.ts"` |
| `.github/workflows/ci.yml` | thêm step `Agent config is up to date: yarn agents:sync --check`, sau step `Knowledge vector index is up to date` |
| `AGENTS.md` | thêm 1 dòng ở mục 6 (sau khi `PLAN-agents-md-slim` đã commit, xem Q3) |
| `tests/unit/agent-adapter/{mcp,skills,sync}.test.ts` | mới |
| `tests/manual/agent-adapter.md` + 1 dòng `tests/manual/README.md` | mới |

`write.ts`:
- `own`: ghi đè cả file. `--check` so byte.
- `symlink`: tạo/sửa symlink. Xoá symlink trong `.claude/skills/` trỏ vào `../../.agents/skills/` mà đích không còn. Không đụng thư mục bị gitignore (`gitnexus/`, `think/`, `prompt-master/`, `query-optimizer/`); kiểm bằng `git check-ignore`.
- JSON: `JSON.stringify(v, null, 2) + "\n"`.
- `--check`: không ghi gì; in danh sách path lệch; exit 1.

**Nghiệm thu:** `yarn tsc`, `yarn lint`, `yarn test` pass. `yarn agents:sync` chạy hai lần liền thì lần hai không đổi file nào. Sửa tay `.mcp.json` thì `--check` exit 1. Claude Code và Antigravity đều thấy MCP `playwright`.

Khoảng 18 file (vượt ngưỡng 8). Phần lớn là file mới, nhỏ; file sửa chỉ có `.mcp.json`, `package.json`, `ci.yml`, `AGENTS.md`, `tests/manual/README.md`.

### Phase 2: subagent (Claude) + skill `verify-ci` (cả hai tool)

| File | Việc |
|---|---|
| `core/model.ts`, `core/load.ts` | thêm kind `subagents` (có field `skills`) |
| `adapters/claude/{index.ts,maps.ts}` | render subagent → `.claude/agents/<name>.md` |
| `adapters/antigravity/index.ts` | `render.subagents = { unsupported: ... }` |
| `core/write.ts` | dọn file sinh cũ trong `managedDirs` của Claude (`.claude/agents/`): xoá file có header generated mà không còn trong output. File viết tay (không header) không bị đụng |
| `.agents/skills/verify-ci/SKILL.md` | skill dùng chung: chạy các lệnh ở mục "Commands" của `AGENTS.md` theo phạm vi được giao, không sửa file, trả pass/fail từng lệnh kèm lỗi dạng `file:line`, trả lời tiếng Việt. Không đặt `disable-model-invocation`: Antigravity áp dụng field này thật (U2) |
| `.claude/skills/verify-ci` | symlink (sinh) |
| `.agents/adapter/subagents/verifier/{agent.json,prompt.md}` | agent đầu tiên |
| `.claude/agents/verifier.md` | sinh |
| `tests/unit/agent-adapter/subagents.test.ts` | mới |

`verifier`: `tools: [read, shell]`, `model: fast`, `readOnly: true`, `skills: ["verify-ci"]`, `x-claude: { maxTurns: 15 }`. `prompt.md` chỉ vài dòng: dùng skill `verify-ci`, không sửa file. Nội dung quy trình nằm ở skill, nên không có hai bản lệch nhau. Subagent của Antigravity nạp `AGENTS.md` (U3), nhưng Antigravity không có `verifier`: nó dùng skill `verify-ci` ngay trong phiên chính, không tách context riêng.

Frontmatter tự ghép, không cần thư viện YAML: chuỗi dùng `JSON.stringify` (JSON string là YAML hợp lệ), `tools` của Claude là chuỗi phân cách dấu phẩy.

**Nghiệm thu:** Claude liệt kê và gọi được `verifier` (nạp skill `verify-ci`, chạy gate, không có tool sửa file). Antigravity thấy skill `verify-ci` trong danh sách skill. `yarn agents:sync` in dòng `antigravity: subagents unsupported (...)`.

### Phase 3: hook

| File | Việc |
|---|---|
| `core/model.ts`, `core/load.ts` | thêm kind `hooks` |
| `core/generated.js` | pattern file sinh: `.mcp.json`, `.agents/mcp_config.json`, `.agents/hooks.json`, và file có header generated trong `.claude/agents/` |
| `scripts/agent-adapter/hook-runner.js` | `node hook-runner.js <id> --agent=<id>`: đọc stdin → `adapters/<id>/hook-io.js` `parse` → gọi `.agents/adapter/hooks/<id>.js` → `format` → stdout/exit code. Tự xác định gốc repo từ `__dirname`, không dựa vào cwd (cwd của lệnh hook khác nhau giữa hai tool) |
| `adapters/{claude,antigravity}/hook-io.js` | `parse(raw) → { event, tool: { category, name, path?, command? } }`: Claude đọc `tool_name`, `tool_input.file_path`, `tool_input.command`; Antigravity đọc `toolCall.name`, `toolCall.args.Path`, `toolCall.args.CommandLine`. `format({ decision, reason }) → { stdout, exitCode }` theo bảng mục 5 |
| `adapters/{claude,antigravity}/index.ts` | render: Claude → `merge-key` key `hooks` của `.claude/settings.json`; Antigravity → `own` `.agents/hooks.json` dạng `{ "<hook-id>": { "<Event>": [...] } }` |
| `.agents/adapter/hooks.json` + `hooks/guard-generated.js` | hook đầu tiên |
| `.claude/settings.json` (mới), `.agents/hooks.json` | sinh |
| `tests/unit/agent-adapter/hooks.test.ts` | mới |

Lệnh được sinh:
- Claude: `node "${CLAUDE_PROJECT_DIR}/scripts/agent-adapter/hook-runner.js" guard-generated --agent=claude`, matcher `Edit|Write`.
- Antigravity: `node ../scripts/agent-adapter/hook-runner.js guard-generated --agent=antigravity` (cwd là `.agents/`), matcher `edit_file|write_file`.

Việc đầu tiên của phase: ghi stdin thật của một lần sửa file ở cả hai tool (bằng hook tạm chỉ ghi ra `.handoff/runs/`), xác nhận `file_path` (Claude) và `Path` (Antigravity) trước khi viết `hook-io.js` (U5).

Runner lỗi (crash, không có hook-io, hook ném lỗi) thì **fail-open**: exit 0, ghi stderr. Lý do: một bug trong runner không được phép chặn mọi thao tác sửa file. `--check` trong CI vẫn bắt được file sinh bị sửa.

`guard-generated` không chặn `.claude/settings.json`: file đó còn key khác mà Owner được sửa tay. Nếu key `hooks` bị sửa tay thì `--check` sẽ bắt.

**Nghiệm thu:** trong cả hai tool, bảo agent sửa `.mcp.json` thì bị deny kèm lời nhắc sửa ở `.agents/adapter/mcp.json`. Chạy `yarn agents:sync` vẫn ghi được (sync ghi bằng Node, không qua tool edit của agent).

## 9. Thẩm định `cris-how-to-sync`

```
# 🛡️ CRIS TARGET ASSESSMENT: AgentAdapter

- Phân loại: ARCHITECTURE_PATTERN (tooling cho coding agent, không phải runtime của app)
- Domain tiếp nhận: không thuộc 6 domain của app; là tooling repo
- KẾT LUẬN: 🟡 CẢI THIỆN → 🟢 sau khi áp các điều chỉnh dưới (đã đưa vào plan)
```

**CLI `yarn intel how-to-sync`** (2026-11-09): 🟢 NÊN. Không vi phạm ADR, không có từ cấm.

**Phân tích sâu:**

| Kiểm tra | Kết quả |
|---|---|
| ADR-0001…0011 | Không liên quan: không đụng Python service, proxy, Langfuse, embedding, DB, vector search, cấu trúc Topic/Lesson, Lesson Status |
| Glossary | **Đã sửa:** bản nháp dùng "section" cho loại config, trùng `Section` của domain (ADR-0009). CLI còn trả `FLOW_TOPIC_SECTION_REORGANIZE` như luồng bị ảnh hưởng; đó là báo nhầm do chữ "section". Plan đổi sang **kind**. Đổi `OutputFile` → `GeneratedOutput` để khỏi lẫn với `Document` (_Avoid_: file). Tránh "workspace" (`Project` _Avoid_ workspace) trong tên của mình |
| Trùng lặp | Repo chưa có công cụ sinh config agent. Symlink skill hiện tạo tay theo `PLAN-agent-instructions-sync.md`; adapter thay phần tạo tay đó và giữ nguyên quy ước. `gitnexus analyze` ghi `.claude/skills/gitnexus/` (gitignore), adapter không đụng |
| Phạm vi Abot | Không phải việc của Abot, nhưng cũng không phải Cris AI. Không vi phạm mục "Phạm vi hiện tại" |

**Ma trận hiệu ứng đồng bộ:**

- [ ] Core Docs: `GLOSSARY.md` không đổi (không có thuật ngữ domain mới). ADR: không cần, vì đây là tooling đảo ngược được (mục 12). Owner muốn ghi lại thì mở buổi `/grill-with-docs`.
- [x] Dual-Service: không có.
- [x] RAG Re-index: không có.
- [x] Database & Migration: không có.
- [x] Observability: không có.
- [x] Environment: không có biến mới. MCP cần token thì nguồn chỉ chứa `${VAR}` (U4).
- [ ] CI: thêm 1 step (Phase 1).
- [ ] Lint/Typecheck: `scripts/agent-adapter/**/*.ts` nằm trong `tsconfig.json` `include: **/*.ts`, được `yarn tsc` kiểm. `.js` trong `scripts/**` đã có override ESLint. Không sửa `eslint.config.mjs`, `tsconfig.json`.
- [ ] Test: `tests/unit/agent-adapter/*.test.ts` khớp `vitest.config.mts` (`tests/**/*.test.ts`, env `node`).
- [ ] `.gitignore`: không đổi. Đã kiểm `git check-ignore`: `.agents/mcp_config.json`, `.agents/hooks.json`, `.claude/agents/`, `.claude/settings.json` đều không bị ignore, commit được.
- [ ] Instruction: 1 dòng `AGENTS.md`. `CLAUDE.md` không đổi.
- [ ] Handoff: TASK spec giao Executor cho plan này phải đưa các file config sinh ra vào `allowed_to_modify`, vì `agent-handoff` thường liệt config vào `strictly_forbidden`.

**Data spec cho `cris-code-intel`:** không cập nhật. `cris-workspace-map.json` chỉ mô tả runtime của app (6 domain, entry point page/API, execution flow nghiệp vụ). Thêm tooling vào sẽ làm map lẫn sang thứ ngoài app. CLI có gợi ý cập nhật, nhưng đó là gợi ý mặc định cho mọi target.

```json
{ "newEntryPoints": [], "newExecutionFlows": [], "updatedDataModels": [] }
```

## 10. Test

| Loại | Case |
|---|---|
| Unit: MCP | stdio → Claude có `type: "stdio"`, Antigravity không có `type`; http → `url` (cả hai tool); `x-claude` chỉ vào file Claude |
| Unit: skills | thiếu symlink → output symlink; skill bị xoá → symlink cũ bị dọn; bỏ qua thư mục gitignore |
| Unit: subagents | Claude: map tool/model, `readOnly` → `disallowedTools`, `skills` vào frontmatter, frontmatter đúng YAML, header nằm sau frontmatter. Antigravity: kind `subagents` được báo `unsupported`, không sinh file nào |
| Unit: hooks | stdin Claude và Antigravity ra cùng input trung lập (kể cả `file_path` / `Path`); `deny` → `permissionDecision` (Claude), `{"decision":"deny"}` (Antigravity); `.agents/hooks.json` có key tên hook ngoài cùng; lệnh Antigravity dùng `../scripts/...`; runner fail-open và không phụ thuộc cwd |
| Unit: sync | hai output trùng path → lỗi; kind `unsupported`/`native` được báo; chạy lại không đổi gì |
| Error | `readOnly` + `edit`; trùng `name`; event không hỗ trợ mà không có `targets`; JSON nguồn sai cú pháp → lỗi kèm path |
| Thủ công | `tests/manual/agent-adapter.md`: mở phiên mới ở mỗi tool, yêu cầu "thêm MCP `lighthouse`", "thêm skill `foo`", và (chỉ ở Claude) "thêm subagent review chỉ đọc". Đạt khi agent sửa đúng nguồn, tự chạy sync, không đụng file sinh |

## 11. Giả định và chưa rõ

| # | Điều cần biết | Trạng thái | Hệ quả / việc còn lại |
|---|---|---|---|
| U1 | Antigravity không quét `.agents/adapter/` | **Đã xác nhận** (14.1: subagent và rule trong `_probe/` không được nạp; docs chỉ quét `skills/ rules/ plugins/ workflows/ teamwork/`, `hooks.json`, `mcp_config.json`) | Giữ nguồn ở `.agents/adapter/` |
| U2 | Antigravity bỏ qua field SKILL.md riêng của Claude (`context: fork`, `allowed-tools`) | **Đã xác nhận.** Lưu ý: `disable-model-invocation: true` có hiệu lực thật trên Antigravity (ẩn skill khỏi model turn) | Không cần strip field khi dùng chung skill. Skill chung không đặt `disable-model-invocation` trừ khi cố ý |
| U3 | Subagent Antigravity nạp `AGENTS.md` không | **Có** (subagent tạo bằng `define_subagent` trả lời đúng rule của `AGENTS.md`). **Nhưng** không nạp subagent từ file tĩnh | Q6: kind `subagents` của Antigravity là `unsupported` đợt này |
| U4 | Hai tool có expand `${VAR}` trong config MCP không | Chưa kiểm | Không chặn: `playwright` hiện không cần env. Kiểm khi thêm MCP đầu tiên cần token |
| U5 | Cwd của lệnh hook; tên field đường dẫn file trong stdin | **Đã xác nhận cả hai tool (2026-11-09).** Claude: `tool_input.file_path` tuyệt đối (docs chính thức). Antigravity: log stdin thật từ `TASK-agent-adapter-004`: cwd của lệnh hook là `<repo>/.agents`; `toolCall.args.Path` giữ nguyên văn chuỗi agent truyền vào (tuyệt đối, `.mcp.json`, `./.mcp.json`, `.claude/agents/../../.mcp.json`); key cấp trên cùng: `artifactDirectoryPath`, `conversationId`, `lastUserInput`, `modelName`, `stepIdx`, `toolCall`, `transcriptPath`, `workspacePaths`; **không có key tên sự kiện** | Không cần đổi `hook-io.js`; guard chuẩn hoá mọi kiểu đường dẫn. Thông báo agent thấy khi bị chặn: `tool call denied by pre-tool hook: <reason>` |
| U6 | Danh sách tool Antigravity | **Đã sửa:** `read_file`, `edit_file`, `write_file`, `run_command`; không có tool tìm kiếm hay liệt kê riêng | Bảng mục 5 đã cập nhật. Category chưa map được thì `load.ts` báo lỗi rõ |
| U7 | Layout plugin để chứa subagent của Antigravity | **Chưa rõ.** Docs công khai ghi `plugins/<name>/agents/`; `plugins.md` đi kèm chỉ liệt kê `plugin.json`, `mcp_config.json`, `hooks.json`, `rules/`, `skills/` | Chưa làm plugin. Khi cần subagent thật trên Antigravity: thử một plugin probe rồi mới thêm renderer (mục 7) |

## 12. Rollback

Không đụng dữ liệu. Muốn bỏ adapter thì xoá `scripts/agent-adapter/`, `.agents/adapter/`, step CI, script `agents:sync`, dòng `AGENTS.md`. File đã sinh ở lại và trở thành file viết tay bình thường (xoá header nếu muốn). Mỗi phase revert riêng được.

## 13. Câu hỏi cho Owner

1. **Q1.** Đợt này bỏ Codex, chỉ Claude Code + Antigravity. Đề xuất: đồng ý (khác `PLAN-agent-instructions-sync.md`, vốn có Codex).
2. **Q2.** Commit file sinh ra. Đề xuất: có, để clone xong dùng được ngay, CI giữ đồng bộ.
3. **Q3.** Dòng mới trong `AGENTS.md` thêm sau khi `PLAN-agents-md-slim` Phase A được commit, để hai thay đổi không lẫn diff. Đề xuất: đúng vậy.
4. **Q4.** MCP tầng máy (`.agents/mcp-servers/`, scope local) giữ ngoài adapter. Đề xuất: giữ ngoài.
5. **Q5.** `strong` map sang `opus` (Claude). Đề xuất: `opus`. Nếu muốn tiết kiệm hơn thì `sonnet`.
6. **Q6.** Subagent chỉ sinh cho Claude. Antigravity dùng skill `verify-ci` dùng chung, chạy trong phiên chính, không có context riêng. Đề xuất: đồng ý. Muốn Antigravity có subagent thật thì làm plugin sau khi U7 rõ.

## 14. Antigravity verify (2026-11-09)

Mục này do Antigravity kiểm tra và ghi lại trực tiếp trên môi trường Antigravity 2.29.0 / macOS.

### 14.1. Bảng kết quả kiểm tra giả định (U1, U2, U3, U5, U6)

| # | Giả định trong plan | Kết quả | Bằng chứng thực tế & Nguồn | Hệ quả cho plan |
|---|---|---|---|---|
| **U1** | Antigravity không quét `.agents/adapter/` | **Đúng** | - Tạo `.agents/adapter/_probe/agent.md` (`probe-u1`) và `rule.md` (`always_on`). Khi gọi `invoke_subagent(TypeName="probe-u1")`, agent báo lỗi `subagent "probe-u1" not found`. Rule cũng không xuất hiện trong `<user_rules>`.<br>- Docs [agy-customizations: discovery locations](~/.gemini/antigravity/builtin/skills/agy-customizations/SKILL.md) & [rules.md](~/.gemini/antigravity/builtin/skills/agy-customizations/docs/rules.md): Antigravity chỉ quét các thư mục quy ước bên trong `.agents/`: `skills/`, `rules/`, `plugins/`, `workflows/`, `teamwork/` và các file `hooks.json`, `mcp_config.json`. Thư mục lạ như `adapter/` bị bỏ qua hoàn toàn. | Nguồn `.agents/adapter/` an toàn, không lo Antigravity quét nhầm. Giữ nguyên vị trí như thiết kế, không cần chuyển sang `tools/agent-adapter/`. |
| **U2** | Antigravity bỏ qua field SKILL.md riêng của Claude (`context: fork`, `allowed-tools`, `disable-model-invocation`) | **Đúng** (với lưu ý quan trọng về `disable-model-invocation`) | - Thực tế trong repo: `.agents/skills/ui-taste/SKILL.md` chứa `license` và `metadata: {...}` vẫn được Antigravity parse và nạp bình thường vào danh sách `Available skills`.<br>- `.agents/skills/grill-with-docs/SKILL.md` chứa `disable-model-invocation: true`. Antigravity **natively hỗ trợ** trường này (struct tag trong binary `language_server`: `yaml:"disable-model-invocation"` và `yaml:"disable-slash-command"`), khiến skill này bị ẩn khỏi model turn (chỉ dùng cho slash command) mà không báo lỗi.<br>- Binary dùng `yamlv3/yaml.Unmarshal` chuẩn của Go, các field không có trong struct schema (`context`, `allowed-tools`) được bỏ qua (silent ignore). | Không cần strip các field này khi symlink hoặc sync skill sang Antigravity. Tuy nhiên, lưu ý `disable-model-invocation: true` có hiệu lực thật trên Antigravity (ẩn skill khỏi model turn). |
| **U3** | Subagent của Antigravity có nạp `AGENTS.md` không | **Đúng** (có nạp `AGENTS.md`), nhưng **Sai về cơ chế subagent tĩnh** | - Tạo dynamic subagent `probe-defined` qua `define_subagent` và gọi qua `invoke_subagent`. Hỏi về quy ước riêng trong `AGENTS.md` (`naming props/biến sai/đúng của chat loading` và `phạm vi tập trung từ 2026-11-09`). Subagent trả lời chính xác ngay lập tức tại turn 1 mà không cần gọi tool đọc file. `transcript.jsonl` ghi nhận `AGENTS.md` được inject tự động vào system prompt dưới dạng `<RULE[...]>`.<br>- **Phát hiện quan trọng:** Antigravity **KHÔNG** discover subagent từ file tĩnh `.agents/agents/*.md` ở root workspace. Thử tạo `.agents/agents/_probe.md` rồi gọi `invoke_subagent(TypeName="probe")` bị lỗi `subagent "probe" not found`. Subagent trong Antigravity chỉ được nạp qua Plugin (`.agents/plugins/<name>/agents/*.md`) hoặc tạo động runtime qua tool `define_subagent`. | Không cần lặp lại nội dung `AGENTS.md` trong prompt subagent. Tuy nhiên, Phase 2 sinh file ra `.agents/agents/*.md` sẽ **không chạy được** trên Antigravity trừ khi đóng gói dạng Plugin hoặc hỗ trợ cơ chế của Antigravity. |
| **U5** | Tên arg đường dẫn file trong `toolCall.args`, và cwd khi chạy hook | **Đã xác định chính xác từ Docs & Schema** | - Docs chính thức [hooks.md](~/.gemini/antigravity/builtin/skills/agy-customizations/docs/hooks.md) (dòng 131, 142, 171-227):<br>  1. **CWD của hook**: *"The working directory is set to the directory containing hooks.json."* Khi đặt tại `.agents/hooks.json`, CWD là `<workspace_root>/.agents` (không phải workspace root).<br>  2. **Tên argument**: Argument casing trong `toolCall.args` đi theo schema định nghĩa của tool: PascalCase. Với tool file của Antigravity (`read_file`, `edit_file`, `write_file`), field đường dẫn là `"Path"` (chữ P viết hoa). Tương tự, lệnh shell là `"CommandLine"`.<br>  3. **Tên tool**: Tool sửa file của Antigravity là `edit_file` và `write_file` (hoặc step type `file_change`). | `hook-io.js` của Antigravity phải đọc `toolCall.args.Path`. Lệnh hook trong `.agents/hooks.json` không được gọi `node scripts/...` vì CWD là `.agents` (phải dùng `node ../scripts/...` hoặc resolve theo `workspacePaths[0]`). Matcher phải là `edit_file\|write_file`, không phải `write_to_file\|replace_file_content`. |
| **U6** | Danh sách tool đầy đủ của Antigravity (đọc file, tìm kiếm, chạy lệnh, sửa file, web) | **Sai lệch so với Plan mục 5** | - Tra cứu trực tiếp system prompt và schema của Antigravity 2.29.0:<br>  - Đọc file: `read_file` (tham số `Path`, `StartLine`, `EndLine`, `ByteOffset`). Không có `view_file`.<br>  - Sửa file: `edit_file` (exact match replacement: `Path`, `Target`, `Replacement`), `write_file` (overwrite/append: `Path`, `Content`, `Overwrite`, `Append`). Hoàn toàn không có `write_to_file`, `replace_file_content`, `multi_replace_file_content`.<br>  - Shell: `run_command` (`CommandLine`, `WaitMsBeforeAsync`, `IsDaemon`, `toolSummary`). Khớp.<br>  - Web: `search_web` (`query`, `domain`).<br>  - Liệt kê thư mục & Tìm kiếm: Không có native tool riêng trong agent toolset (dùng `run_command` với `ls`, `find`, `grep` hoặc MCP). | Bảng mapping ở mục 5 của plan bị sai tên tool ở 2 nhóm quan trọng nhất: `read` và `edit`. Cần sửa mapping thành `read_file` và `edit_file, write_file`. |

---

### 14.2. Danh sách chỗ lệch với docs chính thức của Antigravity

1. **Sai cấu trúc root của `hooks.json`:**
   - **Plan mục 1 & 8:** Khai báo `.agents/hooks.json → <Event>[{matcher, hooks:[{command,timeout}]}]`.
   - **Docs chính thức ([hooks.md](~/.gemini/antigravity/builtin/skills/agy-customizations/docs/hooks.md)):** `hooks.json` bắt buộc có top-level key là **tên của hook** (hook identifier):
     ```json
     {
       "guard-generated": {
         "PreToolUse": [
           {
             "matcher": "edit_file|write_file",
             "hooks": [
               {
                 "command": "node ../scripts/agent-adapter/hook-runner.js guard-generated --agent=antigravity"
               }
             ]
           }
         ]
       }
     }
     ```
     Nếu sinh JSON dạng phẳng theo event ở root, Antigravity sẽ không load được hook (`failed to get JSON hooks`).
2. **Sai CWD khi chạy hook command:**
   - **Plan mục 8:** Command sinh ra là `node scripts/agent-adapter/hook-runner.js ...`.
   - **Docs chính thức ([hooks.md](~/.gemini/antigravity/builtin/skills/agy-customizations/docs/hooks.md) dòng 131):** CWD là thư mục chứa `hooks.json`, tức `<workspace_root>/.agents`. Chạy lệnh với path tương đối `scripts/...` sẽ văng lỗi `Cannot find module`. Cần dùng `node ../scripts/agent-adapter/hook-runner.js` hoặc dùng `node "${workspacePaths[0]}/scripts/..."`.
3. **Sai tên tool thao tác file trong matcher và bảng mapping:**
   - **Plan mục 5 & 8:** Ghi `view_file, grep_search` cho read và `write_to_file, replace_file_content, multi_replace_file_content` cho edit.
   - **Thực tế Antigravity:** Tool tên là `read_file` (đọc) và `edit_file`, `write_file` (sửa/ghi). Matcher regex phải là `edit_file|write_file` (hoặc `.*`).
4. **Key URL của MCP Streamable HTTP:**
   - **Plan mục 1 & 5:** Ghi `serverUrl, headers`.
   - **Docs chính thức ([mcp_servers.md](~/.gemini/antigravity/builtin/skills/agy-customizations/docs/mcp_servers.md) dòng 65):** Key chuẩn hiện hành là `"url"`. Key `"serverUrl"` chỉ là legacy fallback. Nên ưu tiên sinh key `"url"`.
5. **Cơ chế nạp Subagent tĩnh:**
   - **Plan mục 1 & 3 & 8:** Giả định Antigravity quét file markdown tĩnh tại `.agents/agents/*.md` giống như Claude Code quét `.claude/agents/*.md`.
   - **Docs & Thực tế ([plugins.md](~/.gemini/antigravity/builtin/skills/agy-customizations/docs/plugins.md)):** Antigravity không quét thư mục loose `.agents/agents/*.md`. Custom agents chỉ được nạp nếu nằm trong Plugin (`.agents/plugins/<name>/agents/*.md` hoặc `~/.gemini/config/plugins/<name>/`), hoặc tạo động lúc runtime qua tool `define_subagent`.

---

### 14.3. Đề xuất sửa plan

| Phân loại | Mục trong plan | Vấn đề & Lý do | Đề xuất cụ thể |
|---|---|---|---|
| 🔴 **BUG** | Mục 5 & Mục 8 (Phase 3) | Tên tool `edit` và `read` của Antigravity bị sai hoàn toàn (`view_file`, `write_to_file`, `replace_file_content`, `multi_replace_file_content`). Cả 4 tên này không tồn tại trong runtime Antigravity. Matcher của hook `guard-generated` sẽ không bao giờ match được tool sửa file thật (`edit_file` / `write_file`). | Sửa bảng map mục 5: `read` → `read_file`; `edit` → `edit_file, write_file`.<br>Sửa matcher mục 8: `edit_file\|write_file`. |
| 🔴 **BUG** | Mục 1 & Mục 8 (Phase 3) | Schema `.agents/hooks.json` bị thiếu wrapper top-level hook name. Antigravity parse `hooks.json` thành `map[string]HookSpec`, không phải map direct `<Event>`. | Sửa cấu trúc render của Antigravity thành `{ "<hook-id>": { "<Event>": [ { "matcher": "...", "hooks": [...] } ] } }`. |
| 🔴 **BUG** | Mục 8 (Phase 3) & Mục 11 (U5) | CWD của lệnh hook trong Antigravity là thư mục chứa file config (`<root>/.agents`). Lệnh `node scripts/agent-adapter/hook-runner.js` sẽ bị lỗi không tìm thấy script. Ngoài ra `toolCall.args` dùng PascalCase (`Path`). | Sinh lệnh Antigravity: `node ../scripts/agent-adapter/hook-runner.js ...`. Trong `adapters/antigravity/hook-io.js`, trích xuất file path bằng `raw.toolCall?.args?.Path`. |
| 🟠 **RISK** | Mục 1, Mục 3 & Mục 8 (Phase 2) | Antigravity không discover subagent tĩnh từ `.agents/agents/*.md`. Nếu Phase 2 sinh file vào `.agents/agents/`, Claude Code sẽ nhận subagent `verifier` nhưng Antigravity sẽ không nhận. | Đối với Phase 2, cần đóng gói subagent cho Antigravity dưới dạng plugin nội bộ tại `.agents/plugins/verifier/` (chứa `plugin.json` và `agents/verifier.md`), hoặc xem xét cơ chế dynamic injection qua script khởi tạo / `define_subagent`. |
| 🟡 **NIT** | Mục 1 & Mục 5 | MCP HTTP transport trong Antigravity đã chuẩn hoá dùng key `"url"` (mặc dù vẫn chấp nhận legacy `"serverUrl"`). | Trong adapter Antigravity cho MCP HTTP, sinh cả key `"url"` để đúng chuẩn hiện hành của [mcp_servers.md](~/.gemini/antigravity/builtin/skills/agy-customizations/docs/mcp_servers.md). |
| 🟡 **NIT** | Mục 4 & Mục 5 | Giá trị model tier: Antigravity hỗ trợ 4 tier: `"inherit"`, `"flash"`, `"pro"`, `"flash_lite"`. Model mapping `fast` → `flash` và `strong` → `pro` là hoàn toàn chính xác. | Giữ nguyên mapping model tier như plan đã đề xuất. |

---

### 14.4. Xác nhận dọn dẹp probe files & hooks

Tất cả các file và thư mục thử nghiệm (`.agents/adapter/_probe/`, `.agents/agents/`, `.agents/hooks.json`) đã được xoá sạch hoàn toàn.

Kết quả kiểm tra `git status`:
```
On branch main
Your branch is up to date with 'origin/main'.

Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
	modified:   .handoff/specs/TASK-triage-removal-001.md
	modified:   AGENTS.md
	modified:   app/page.tsx
	modified:   components/roadmap/RoadmapAssistantChatbot.tsx
	modified:   prisma/init-turso.sql

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	.agents/skills/design-doc-mermaid/
	.claude/skills/design-doc-mermaid
	.handoff/PLAN-agent-adapter.md
	.handoff/PLAN-agents-md-slim.md

no changes added to commit (use "git add" and/or "git commit -a")
```
Không còn bất kỳ file probe hay hook tạm nào tồn tại trong working tree.

### 14.5. Đối chiếu của Claude Code (2026-11-09)

Claude đối chiếu từng đề xuất với docs đi kèm Antigravity trên máy này (`~/.gemini/antigravity/builtin/skills/agy-customizations/docs/`: `hooks.md`, `mcp_servers.md`, `plugins.md`), không chỉ tin báo cáo. Các đường dẫn `file://` ở trên là docs cục bộ; link công khai nằm ở mục 1.

| Phát hiện | Mức | Kết quả đối chiếu | Xử lý trong plan |
|---|---|---|---|
| Tên tool `read`/`edit` sai | bug | Chấp nhận (U6, kiểm trong runtime) | Mục 1, 5, 8 (Phase 3) |
| `hooks.json` thiếu key tên hook ngoài cùng | bug | Chấp nhận: `hooks.md` dòng 15 ghi mỗi key ngoài cùng là một hook | Mục 1, 5, 8 (Phase 3) |
| Cwd của lệnh hook | bug | Chấp nhận: `hooks.md` dòng 131 | Lệnh `../scripts/...`; runner tự xác định gốc repo từ `__dirname` |
| `toolCall.args.Path` | bug | **Chưa xác nhận được:** docs chỉ có ví dụ `CommandLine` | Ghi stdin thật đầu Phase 3 (U5) |
| Không nạp subagent tĩnh | risk | Chấp nhận. **Không** theo đề xuất làm plugin: `plugins.md` đi kèm không liệt kê `agents/` (U7) | Antigravity `subagents` là `unsupported`; skill `verify-ci` dùng chung (Q6) |
| MCP http dùng `url` | nit | Chấp nhận: `mcp_servers.md` dòng 66 (`serverUrl` là key cũ); docs công khai cũng ghi `url` dùng được | Sinh `url` (mục 1, 5) |
| Tier model `fast`→`flash`, `strong`→`pro` | nit | Đúng | Giữ nguyên |
