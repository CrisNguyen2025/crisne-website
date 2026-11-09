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

## 3. Cơ chế Hook và Guard Generated

- **Hook Runner (`scripts/agent-adapter/hook-runner.js`)**: Runner dùng chung chuẩn hoá stdin/stdout giữa Claude Code và Antigravity, truyền payload `{ event, tool, repoRoot }` tới script thực thi. Runner tuân thủ nguyên tắc **fail-open** (exit code 0 nếu gặp lỗi cú pháp stdin, thiếu script, hoặc hook crash) để không làm treo phiên làm việc của agent.
- **Hook `guard-generated`**: Hook `PreToolUse` kiểm tra công cụ `edit` (bao gồm `Edit`, `Write` trên Claude; `edit_file`, `write_file` trên Antigravity). Nếu agent định sửa các file sinh tự động (`.mcp.json`, `.agents/mcp_config.json`, `.agents/hooks.json`, `.claude/agents/*.md`), hook sẽ từ chối (`deny`) và hướng dẫn sửa tại nguồn trong `.agents/adapter/`.

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
