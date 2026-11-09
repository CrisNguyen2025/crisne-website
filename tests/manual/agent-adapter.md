# Kịch bản kiểm thử: AgentAdapter (MCP, Skills & Subagents Sync)

Phạm vi: Cơ chế quản lý cấu hình tập trung từ `.agents/adapter/` và tự động sinh cấu hình cho Claude Code và Antigravity qua lệnh `yarn agents:sync [--check]`.

## Chuẩn bị

1. Mã nguồn đã hoàn tất Phase 2: `scripts/agent-adapter/`, `.agents/adapter/{mcp.json,subagents/}`, `.agents/skills/verify-ci/`.
2. Môi trường phát triển có sẵn Claude Code và Antigravity.

## Các bước thực hiện và kiểm tra

| # | Case | Thao tác | Kết quả mong đợi | Kết quả |
|---|---|---|---|---|
| T1 | Thêm MCP Server mới | Thêm một MCP server (ví dụ `echo-test`, transport `stdio`) vào `.agents/adapter/mcp.json`, chạy `yarn agents:sync` | `.mcp.json` có `type: "stdio"`, `.agents/mcp_config.json` không có `type`; `yarn agents:sync --check` exit 0 | `Chưa chạy` |
| T2 | Thêm Skill mới | Tạo thư mục `.agents/skills/sample-manual-skill/SKILL.md`, chạy `yarn agents:sync` | Symlink `.claude/skills/sample-manual-skill` được tạo trỏ `../../.agents/skills/sample-manual-skill`; Antigravity báo `native`; `--check` exit 0 | `Chưa chạy` |
| T3 | Sửa tay file sinh (CI check phát hiện lệch) | Sửa trực tiếp nội dung `.mcp.json` hoặc `.agents/mcp_config.json`, chạy `yarn agents:sync --check` | Lệnh báo lệch, in danh sách file bị sửa tay, exit code 1; chạy lại `yarn agents:sync` khôi phục đúng nội dung | `Chưa chạy` |
| T4 | Cả hai tool nạp MCP Playwright | Mở phiên làm việc mới trên Claude Code và Antigravity | Cả hai công cụ đều nhận diện được MCP server `playwright` từ config tương ứng (`.mcp.json` và `.agents/mcp_config.json`) | `Chưa chạy` |
| T5 | Thêm Subagent chỉ đọc | Tạo `.agents/adapter/subagents/reader/{agent.json,prompt.md}` với `readOnly: true`, chạy `yarn agents:sync` | Claude có `.claude/agents/reader.md` với `disallowedTools: Edit, Write`; Antigravity in dòng `unsupported` và không sinh file; `--check` exit 0 | `Chưa chạy` |
| T6 | Sửa tay file Subagent sinh ra (CI check) | Sửa trực tiếp nội dung `.claude/agents/verifier.md`, chạy `yarn agents:sync --check` | Lệnh báo lệch, in đường dẫn `.claude/agents/verifier.md` bị outdated, exit code 1; chạy lại sync khôi phục nội dung | `Chưa chạy` |
| T7 | Thêm Hook mới | Khai báo hook mới trong `.agents/adapter/hooks.json` và tạo script `.agents/adapter/hooks/<id>.js`, chạy `yarn agents:sync` | Claude có entry trong `.claude/settings.json` (key `hooks`), Antigravity có `.agents/hooks.json`; `yarn agents:sync --check` exit 0 | `Chưa chạy` |
| T8 | `guard-generated` chặn sửa file tự sinh | Yêu cầu Claude/Antigravity sửa một file do sync sinh ra (`.mcp.json`, `.agents/mcp_config.json`, `.agents/hooks.json`, `.claude/agents/verifier.md`) | Hook `PreToolUse` từ chối thao tác sửa với thông báo chỉ rõ nguồn trong `.agents/adapter/` | `Chưa chạy` |
| T9 | Hook Runner fail-open | Chạy hook-runner với stdin JSON hỏng hoặc script hook ném lỗi | Runner in lỗi ra stderr, không in stdout, và thoát với exit code 0 | `Chưa chạy` |

## Ghi kết quả

- **Lần tạo**: 2026-11-09 @ `TASK-agent-adapter-001` (T1–T4), cập nhật @ `TASK-agent-adapter-002` (T5–T6), cập nhật @ `TASK-agent-adapter-003` (T7–T9)
  - Các case T1–T9 sẵn sàng cho kiểm thử tích hợp thủ công giữa Claude Code và Antigravity.

- **Lần chạy 1 (Claude verify Phase 2)**: 2026-11-09, `TASK-agent-adapter-002`.
  - T5 (một phần): sau `yarn agents:sync`, Claude Code thấy subagent `verifier` ngay trong phiên đang mở (danh sách agent tự cập nhật) và gọi được; nó chạy đúng 4 lệnh được giao và không sửa file. Dòng `antigravity: subagents unsupported (...)` có trong output của sync. Chưa mở Antigravity để xác nhận nó thấy skill `verify-ci`.
  - T6 (một phần, thử bằng file giả): file `.md` có marker không còn trong nguồn bị `--check` báo `stale` và sync xoá; file `.md` viết tay không có marker còn nguyên. Chưa thử sửa tay chính `verifier.md`.

- **Lần chạy 2 (Claude verify Phase 3)**: 2026-11-09, `TASK-agent-adapter-003`.
  - **T7 Pass (Claude Code)**: trong phiên đang mở, Claude thử `Edit` `.mcp.json` thì hook `guard-generated` chặn ngay với lý do tiếng Việt; hash `.mcp.json` không đổi và `agents:sync --check` vẫn pass.
  - **T9 Pass**: `yarn agents:sync` ghi file sinh bình thường (sync ghi bằng Node, không qua tool sửa file), chạy hai lần liền báo 0 file đổi.
  - **T8 (Antigravity) chưa chạy**: chỉ thử runner bằng stdin giả theo định dạng Antigravity (xem bên dưới); chưa mở Antigravity thật để thử chặn.
  - Runner thử trực tiếp (cwd `/tmp`): `Edit`/`Write` vào `.mcp.json`, `.agents/hooks.json`, `.claude/agents/verifier.md` bị deny đúng định dạng của từng tool; sửa `.agents/adapter/mcp.json`, `.claude/settings.json` và lệnh `Bash` được cho qua; stdin hỏng, hook id lạ, agent lạ đều exit 0 (fail-open).
  - **Lỗi tìm thấy**: với đường dẫn tương đối của Antigravity, `./.mcp.json`, `.agents/../.mcp.json`, `.claude/agents/../../.mcp.json`, `.claude/agents/./verifier.md` lọt qua guard (đường dẫn không được chuẩn hoá). Đường dẫn tuyệt đối và `.mcp.json` thuần thì bị chặn. **Đã sửa (2026-11-09)**: guard chuẩn hoá đường dẫn bằng `path.resolve` + `path.relative`, `isGeneratedFile` so khớp không phân biệt hoa thường và tự chuẩn hoá `./`, `..`; lý do chặn nêu đúng nguồn cần sửa; thêm 3 test (đường dẫn lách, đường dẫn cho qua, nội dung lý do). Chạy lại các đường dẫn lọt ở trên: đều bị chặn, còn `../.mcp.json` (ngoài repo) và `docs/.mcp.json` được cho qua.

- **Lần chạy 3 (T8, Antigravity thật)**: 2026-11-09, `TASK-agent-adapter-004` (`type: review`), phiên Antigravity mới.
  - **T8 Pass**: hook được nạp ngay từ đầu phiên. 6 lần thử sửa file sinh (`edit_file` và `write_file`; đường dẫn tuyệt đối, `.mcp.json`, `./.mcp.json`, `.claude/agents/../../.mcp.json`; `.agents/mcp_config.json`; `.claude/agents/verifier.md`) đều bị chặn với thông báo `tool call denied by pre-tool hook: ...` nêu đúng nguồn cần sửa. Lần ghi vào file thường (`probe.txt`) được cho qua. Claude đối chiếu log `stdin-antigravity.jsonl` (7 dòng, `decision` khớp từng lần) và hash 4 file sinh không đổi.
  - **T9 Pass trên Antigravity**: `yarn agents:sync` báo `22 unchanged`, `--check` exit 0.
  - **Hạn chế xác nhận bằng thực nghiệm**: `cp` + `mv` qua `run_command` ghi đè được file sinh (hook chỉ gắn với tool sửa file); `agents:sync --check` trong CI là lớp chặn còn lại.
  - **Stdin thật** (U5 đã đóng): cwd hook = `<repo>/.agents`; `toolCall.args.Path` giữ nguyên văn agent truyền; không có key tên sự kiện. Đường dẫn tương đối và `..` đúng như lỗi đã sửa ở lần chạy 2: bản guard cũ sẽ để lọt các dạng này.
  - Còn lại: log debug `stdin-antigravity.jsonl` chứa nguyên văn `lastUserInput` và nội dung file được ghi; đã xoá sau khi trích kết quả.

- **Lần chạy 4 (loại trừ skill)**: 2026-11-09. Thêm `.agents/adapter/skills.json` (`exclude.claude = ["ui-taste"]`): `yarn agents:sync` xoá symlink `.claude/skills/ui-taste` (`1 removed`), `.agents/skills/ui-taste` còn nguyên (Antigravity vẫn đọc thẳng); chạy lại 0 file đổi; `--check` pass. Unit test: loại trừ theo agent, từ chối agent/skill không tồn tại và JSON hỏng, dọn symlink còn trỏ tới skill đã bị loại trừ. Chưa thử mở Claude Code mới để xác nhận không còn thấy skill `ui-taste` từ repo.
