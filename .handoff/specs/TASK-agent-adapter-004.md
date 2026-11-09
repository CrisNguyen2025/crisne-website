---
task_id: "TASK-agent-adapter-004"
branch: "main"
version: "3.0.0"
type: "review"
priority: "P1"
status: "COMPLETED"
assigned_executor: "antigravity"
max_attempts: 1
current_attempt: 1

boundaries:
  allowed_to_modify: []
  continues_dirty: []
  read_only_references:
    - ".handoff/PLAN-agent-adapter.md"
    - ".agents/hooks.json"
    - ".agents/adapter/**"
    - "scripts/agent-adapter/**"
    - "tests/manual/agent-adapter.md"
    - "AGENTS.md"
  strictly_forbidden:
    - "package.json"
    - "yarn.lock"
    - "tsconfig.json"
    - "eslint.config.mjs"
    - ".gitignore"
    - ".agents/hooks.json"
    - ".agents/mcp_config.json"
    - ".mcp.json"
    - ".claude/**"

verification_gate:
  agents_sync_check: "yarn agents:sync --check"
  boundary_check: "bash .agents/skills/agent-handoff/scripts/check-boundary.sh TASK-agent-adapter-004"
---

# TASK: Thử hook `guard-generated` trên Antigravity thật (T8)

## 1. Context & Architectural Intent
- **Goal**: Xác nhận bằng cách làm thật trên Antigravity: (1) hook `guard-generated` trong `.agents/hooks.json` có được nạp và chặn việc sửa file do `yarn agents:sync` sinh ra không; (2) định dạng stdin thật của hook `PreToolUse` (tên key đường dẫn, đường dẫn tuyệt đối hay tương đối, cwd của lệnh hook).
- **Why**: Hook mới được thử bằng stdin giả theo docs. Tên key đường dẫn (`Path`?) và kiểu đường dẫn của Antigravity chưa từng được xác nhận (plan §11, U5). Đây là case T8 trong `tests/manual/agent-adapter.md`.
- **Điều kiện**: phải chạy trong một **cuộc trò chuyện (phiên) Antigravity mới**, để `.agents/hooks.json` được nạp từ đầu phiên. Nếu phiên này không thấy hook kích hoạt, ghi rõ và dừng các bước chặn, không tự sửa `.agents/hooks.json`.
- **Công cụ ghi log**: runner `scripts/agent-adapter/hook-runner.js` ghi stdin thật khi tồn tại file `.handoff/runs/hook-debug/ENABLED` (mặc định tắt) vào `.handoff/runs/hook-debug/stdin-antigravity.jsonl`, mỗi dòng là một JSON có `cwd`, `raw` (stdin nguyên văn) và `decision` (`allow` hoặc `deny`). Thư mục `runs/` nằm trong `.gitignore`.

## 2. Invariants & Rules
- Đây là task `review`: **không sửa file nào trong repo** ngoài chính file spec này. File tạm và kết quả đặt dưới `.handoff/runs/TASK-agent-adapter-004/` và `.handoff/runs/hook-debug/` (ngoại lệ được phép của task này).
- **Mọi thao tác thử trên file sinh phải là thao tác không đổi nội dung** (no-op), phòng khi hook không chặn:
  - `edit_file`: `Target` là một chuỗi có trong file đúng một lần, `Replacement` giống hệt `Target`.
  - `write_file`: `Content` phải giống hệt nội dung hiện tại của file (đọc bằng `read_file` hoặc `cat`, ghi lại chính xác kể cả dòng cuối).
  - Nếu một lần ghi **lọt qua** và làm file đổi: chạy `yarn agents:sync` để khôi phục (không sửa tay), và ghi vào báo cáo.
- Không sửa `.agents/hooks.json`, `.agents/adapter/**`, `scripts/**`, `.claude/**`. Không commit, không push, không cài dependency, không đọc `.env`.
- Không sửa `baseline.txt` (`executor.md` quy tắc 6).
- Mọi kết luận phải có bằng chứng: lệnh đã chạy, kết quả thấy, trích dòng log nguyên văn.

## 3. Step-by-Step Implementation Checklist
- [x] **Step 1 (Preflight)**: làm theo `executor.md` mục 1 (spec, branch, baseline, lock, `IN_PROGRESS`).
- [x] **Step 2 (Bật log)**: tạo file rỗng `.handoff/runs/hook-debug/ENABLED` (tạo thư mục nếu cần). Ghi lại `git hash-object .mcp.json .agents/mcp_config.json .agents/hooks.json .claude/agents/verifier.md` làm mốc.
- [x] **Step 3 (Đối chứng cho qua)**: dùng tool `read_file` đọc 5 dòng đầu `AGENTS.md`; `write_file` tạo `.handoff/runs/TASK-agent-adapter-004/probe.txt`; `run_command` chạy `echo ok`. Cả ba không được bị chặn. Mở `.handoff/runs/hook-debug/stdin-antigravity.jsonl`: có dòng nào được ghi không? Nếu hook đã kích hoạt, mỗi lần gọi tool khớp matcher (`edit_file|write_file`) sinh một dòng.
- [x] **Step 4 (T8, thử chặn)**: lần lượt thử, mỗi lần ghi lại: bị chặn hay không, thông báo bạn nhận được **nguyên văn**, và hash file trước/sau.
  - (a) `edit_file` no-op trên `.mcp.json` bằng đường dẫn tuyệt đối.
  - (b) `write_file` no-op `.mcp.json` bằng đường dẫn tương đối `.mcp.json`.
  - (c) `write_file` no-op `./.mcp.json`.
  - (d) `write_file` no-op `.claude/agents/../../.mcp.json`.
  - (e) `edit_file` no-op `.agents/mcp_config.json`.
  - (f) `edit_file` no-op `.claude/agents/verifier.md`.
  Nếu ở Step 3 và (a) không có dòng log nào và thao tác lọt qua, kết luận "hook chưa được nạp trong phiên này", bỏ các bước (b) đến (f), ghi rõ vào báo cáo và sang Step 6.
- [x] **Step 5 (Hạn chế đã biết)**: thử ghi đè `.mcp.json` bằng chính nội dung của nó qua `run_command`: `cp .mcp.json .mcp.json.tmp && mv .mcp.json.tmp .mcp.json` (không dùng `cat .mcp.json > .mcp.json`, lệnh đó làm rỗng file). Ghi lại hook có chặn không (dự kiến: không, vì matcher chỉ gồm tool sửa file) và hash trước/sau.
- [x] **Step 6 (T9)**: chạy `yarn agents:sync` rồi `yarn agents:sync --check`. Kỳ vọng `0 created, 0 updated` và exit 0.
- [x] **Step 7 (Phân tích log)**: đọc `.handoff/runs/hook-debug/stdin-antigravity.jsonl` và trả lời bằng trích dẫn nguyên văn từ log: (1) các key cấp trên cùng của stdin; (2) tên tool đúng như `toolCall.name`; (3) các key trong `toolCall.args` của `write_file`, `edit_file`, `run_command`; (4) đường dẫn trong `args` là tuyệt đối hay đúng như bạn gõ (tương đối)? (5) `cwd` thật của lệnh hook; (6) cột `decision` của từng lần; (7) có key nào cho biết tên sự kiện (ví dụ `hookEvent`) không, giá trị là gì.
- [x] **Step 8 (Tắt log)**: xoá `.handoff/runs/hook-debug/ENABLED`. Giữ nguyên file `.jsonl`. Kiểm hash bốn file ở Step 2 không đổi so với mốc.
- [x] **Step 9 (Báo cáo)**: ghi `.handoff/runs/TASK-agent-adapter-004/review.md` gồm: bảng Step 3, 4, 5, 6 (thao tác, kết quả, bằng chứng), câu trả lời Step 7, kết luận về T8 (`Pass`/`Fail`/`Chưa kiểm được` kèm lý do), và danh sách đề xuất sửa phân loại bug / risk / nit. Rồi ghi `result.json` theo `executor.md` mục 6 (`type: "review"`, `report` trỏ tới `review.md`, `gate` có `agents_sync_check` và `boundary_check`), sau đó đổi spec `status: COMPLETED`, xoá lock.

## 4. Verification Gate Results
<!-- Executor điền: PENDING | PASSED | FAILED | SKIPPED -->
- [x] `agents_sync_check`: PASSED
- [x] `Boundary Check`: PASSED

## 5. Execution Audit Log
<!-- Executor điền. Không commit -->
- **Result file**: `.handoff/runs/TASK-agent-adapter-004/result.json`
- **Modified Files**:
  - (task `review`: không có)
