# crisne-website — Claude Code

Nguồn chính là `AGENTS.md`, dùng chung cho mọi agent. Sửa rule ở đó, không sửa ở đây. File này chỉ chứa phần riêng của Claude Code.

@AGENTS.md

## GitNexus qua MCP

Chỉ áp dụng khi MCP `gitnexus` đã kết nối trong phiên (tìm bằng ToolSearch `gitnexus`). Không có thì theo phương án thay thế trong `AGENTS.md`.

- Impact: `gitnexus_impact({target, direction: "upstream"})` · trước commit: `gitnexus_detect_changes()` · đổi tên: `gitnexus_rename`
- Khám phá: `gitnexus_query({query})` · `gitnexus_context({name})` · resources `gitnexus://repo/crisne-website/...`

## Compact instructions

Khi compact, giữ lại:

- Task đang làm: task_id và đường dẫn spec `.handoff/specs/TASK-*.md` hoặc `.handoff/PLAN-*` nếu có, phase hiện tại và phần còn lại.
- Danh sách file đã sửa trong phiên và lý do; những gì user đã chốt hoặc đã loại.
- Kết quả verify gần nhất (lệnh, pass/fail, lỗi `file:line`) và phần chưa verify.
- Kết quả impact analysis có risk HIGH/CRITICAL.

Bỏ được: output đầy đủ của lệnh, nội dung file đã đọc (đọc lại khi cần).
