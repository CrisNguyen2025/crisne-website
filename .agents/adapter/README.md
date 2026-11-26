# Agent Adapter Configuration

Thư mục này là nguồn cấu hình tập trung cho các coding agent (Claude Code, Antigravity).

## 1. Muốn làm gì → Sửa file nào

| Muốn làm | Nguồn cần sửa | Lệnh sau khi sửa |
|---|---|---|
| Cấu hình MCP server | `.agents/adapter/mcp.json` | `yarn agents:sync` |
| Thêm/sửa Skill | Thư mục `.agents/skills/<name>/SKILL.md` | `yarn agents:sync` |
| Không muốn Claude Code nạp một skill (Antigravity vẫn đọc thẳng) | `.agents/adapter/skills.json`, ví dụ `{ "exclude": { "claude": ["ui-taste"] } }` | `yarn agents:sync` (symlink cũ trong `.claude/skills/` tự bị dọn) |
| Subagents | `.agents/adapter/subagents/<name>/{agent.json,prompt.md}` (chỉ sinh cho Claude, Antigravity `unsupported`) | `yarn agents:sync` |
| Hooks | `.agents/adapter/hooks.json` và script `.agents/adapter/hooks/<id>.js` | `yarn agents:sync` |

## 2. File sinh ra tự động (KHÔNG sửa tay)

Các file sau do `yarn agents:sync` sinh ra và được commit trong git:
- **Claude Code**:
  - `.mcp.json`
  - `.claude/skills/<name>` (symlink trỏ sang `../../.agents/skills/<name>`)
  - `.claude/agents/<name>.md`
  - `.claude/settings.json` (quản lý key `hooks`, bảo toàn các settings khác)
- **Antigravity**:
  - `.agents/mcp_config.json`
  - `.agents/hooks.json`
  - (Skills được Antigravity đọc trực tiếp từ `.agents/skills/`)
  - (Subagents `unsupported`: Antigravity dùng skill `verify-ci` dùng chung trong phiên chính)

## 3. Cơ chế Hook và Các Guard Hiện Có

- **Hook Runner (`scripts/agent-adapter/hook-runner.js`)**: Runner dùng chung chuẩn hoá stdin/stdout giữa Claude Code và Antigravity, truyền payload `{ event, tool, repoRoot }` tới script thực thi. Runner tuân thủ nguyên tắc **fail-open** (exit code 0 nếu gặp lỗi cú pháp stdin, thiếu script, hoặc hook crash) để không làm treo phiên làm việc của agent.
- **Hook `guard-generated` (`PreToolUse` trên `edit`)**: Nếu agent định sửa các file sinh tự động (`.mcp.json`, `.agents/mcp_config.json`, `.agents/hooks.json`, `.claude/agents/*.md`), hook sẽ từ chối (`deny`) và hướng dẫn sửa tại nguồn trong `.agents/adapter/`.
- **Hook `guard-task-boundary` (`PreToolUse` trên `edit`)**: Khi có `.handoff/runs/.lock` còn hiệu lực (≤ 4 giờ), hook đối chiếu file sắp sửa với `allowed_to_modify` / `strictly_forbidden` / `type` trong `.handoff/specs/<task_id>.md`; cho phép các đường dẫn runtime hợp lệ của task (`.handoff/specs/<task_id>.md`, `.handoff/runs/.lock`, `ESC-<task_id>.md`, `.handoff/runs/<task_id>/**`) nhưng chặn sửa `baseline.txt` và chặn ghi thẳng vào `result.json` (bắt buộc ghi `result.json.tmp` rồi `mv`).
- **Hook `guard-git-safety` (`PreToolUse` trên `shell`)**: Luôn chặn các lệnh git phá hoại (`git reset --hard`, `git clean -f`, `git restore .`, `git checkout .`, `git branch -D`, `git push --force`, vẫn cho phép `git restore -- <file>` và `git clean -n`); đồng thời chặn `git commit` và `git push` khi đang giữ `.handoff/runs/.lock` của phiên Executor.
- **Ngoại lệ `.claude/settings.json`**: guard chặn theo cả file, mà file này còn các key khác được sửa tay (ví dụ `permissions`), nên guard không chặn. Mục `hooks` trong đó chỉ được `yarn agents:sync --check` bắt ở CI.

### Chọn hook, subagent hay skill

Hook do harness tự chạy theo event, agent không chọn gọi. Subagent và skill thì agent tự quyết định gọi dựa vào `description`.

| Cần | Dùng | Lý do |
|---|---|---|
| Rule bắt buộc, chạy nhanh (< timeout 10s), logic rõ: chặn, nhắc, chèn context | Hook | Chạy mỗi lần event xảy ra, không phụ thuộc model nhớ |
| Việc chạy lâu hoặc cần đọc, diễn giải kết quả, nên tách khỏi context chính | Subagent | Có context, tool và model riêng; chỉ trả báo cáo |
| Quy trình hoặc kiến thức agent chính tự làm trong phiên | Skill | Nạp khi cần, dùng chung cho cả Claude Code và Antigravity |

Chọn event cho hook. Adapter chỉ nhận 4 event dưới đây (`scripts/agent-adapter/core/load.ts`); `SessionStart` và `Stop` không được khai báo `tools`:

| Event | Dùng khi |
|---|---|
| `PreToolUse` | Chặn một tool call trước khi chạy (ví dụ `guard-generated`) |
| `PostToolUse` | Việc nhanh trên đúng file vừa sửa. Không chạy `tsc`/`yarn test` ở đây: chạy sau mỗi lần Edit, chậm và dễ quá timeout |
| `SessionStart` | Kiểm tra môi trường đầu phiên |
| `Stop` | Nhắc việc trước khi agent kết thúc lượt (ví dụ nhắc gọi `verifier`), không chạy CI nặng trong hook |

Claude Code còn các event khác (ví dụ `UserPromptSubmit`) nhưng adapter chưa hỗ trợ; muốn dùng thì phải mở rộng `load.ts` và adapter của từng agent trước. Tài liệu: [Claude Code hooks](https://code.claude.com/docs/en/hooks), [Claude Code subagents](https://code.claude.com/docs/en/sub-agents).

## 4. Cấu hình riêng cho từng agent (`x-claude`, `x-antigravity`)

Trong `.agents/adapter/mcp.json` và `agent.json`, mỗi mục hỗ trợ trường passthrough:
- `x-claude`: merge trực tiếp vào cấu hình tương ứng của Claude Code (`.mcp.json` hoặc frontmatter `.claude/agents/<name>.md`).
- `x-antigravity`: merge trực tiếp vào cấu hình server tương ứng trong `.agents/mcp_config.json`.

Ví dụ:
```json
{
  "id": "playwright",
  "transport": "stdio",
  "command": "npx",
  "args": ["@playwright/mcp@latest"],
  "x-claude": { "timeout": 30000 }
}
```

## 5. Lệnh CLI

- `yarn agents:sync`: Sinh và cập nhật toàn bộ file cấu hình agent.
- `yarn agents:sync --check`: Kiểm tra file cấu hình sinh ra có bị lệch so với nguồn không (chạy trong CI).
