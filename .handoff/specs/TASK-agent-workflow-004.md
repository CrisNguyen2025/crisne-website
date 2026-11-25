---
task_id: "TASK-agent-workflow-004"
branch: "chore/agent-workflow-4" # tách từ chore/agent-workflow-3 (db27f62 chưa vào main)
version: "3.0.0"
type: "implement"
priority: "P2"
status: "COMPLETED"
assigned_executor: "claude" # chỉ sửa tài liệu và skill
max_attempts: 3
current_attempt: 1
deploy_steps: []

boundaries:
  allowed_to_modify:
    - ".agents/skills/executor/**"
    - ".agents/adapter/skills.json"
    - ".agents/skills/agent-handoff/SKILL.md"
    - ".agents/skills/agent-handoff/references/architect.md"
    - ".agents/skills/agent-handoff/references/executor.md"
    - ".handoff/PLAN-second-brain.md"
    - ".handoff/BACKLOG.md"
    - "AGENTS.md"
  continues_dirty: []
  read_only_references:
    - ".agents/adapter/README.md"
    - ".agents/skills/agent-handoff/scripts/**"
  strictly_forbidden:
    - "package.json"
    - "yarn.lock"
    - ".claude/**"
    - "app/**"
    - "lib/**"
    - "roadmap-rag-assistant/**"

fast_gate: ["agents_sync", "no_orca", "boundary_check"]
verification_gate:
  agents_sync: "yarn agents:sync --check"
  no_orca: "! git grep -n -i 'orca' -- .handoff/PLAN-second-brain.md .agents/skills/agent-handoff AGENTS.md"
  executor_not_in_claude: "test ! -e .claude/skills/executor"
  intel_status: "yarn intel status"
  boundary_check: "bash .agents/skills/agent-handoff/scripts/check-boundary.sh TASK-agent-workflow-004"
---

# TASK: Bỏ Orca khỏi quy trình, giao việc cho Antigravity bằng một lệnh `/executor`

> **Trạng thái hiện tại**: Step 1–5 xong, gate pass (Claude làm, 2026-11-15). Đang chờ Step 6: Owner thử `/executor` trong Antigravity với TASK-router-stress-001. Router-stress chưa từng chạy (không có lock, không có file đổi) nên được sửa tài liệu handoff.

## 1. Context & Architectural Intent
- **Goal**:
  - Quy trình giao việc chỉ còn Antigravity chạy thẳng trên repo, không còn Orca.
  - Bước giao việc rút từ dán 4 dòng prompt xuống gõ một lệnh `/executor` trong Antigravity.
- **Why**:
  - Orca không launch được Antigravity: `orca agent-context --json` chỉ có `claude`, `codex`, `opencode`, `cursor` (kiểm 2026-11-15).
  - Worktree của Orca đã làm suýt mất `TASK-abot-bugs-001.md` và `PLAN-second-brain.md`.
  - Tham chiếu Orca duy nhất còn lại nằm ở `.handoff/PLAN-second-brain.md:5-19`.
  - Antigravity gọi skill trong `.agents/skills/<name>/SKILL.md` bằng `/<name>`. Workflow `.agents/workflows/` đã ngừng chạy từ 2026-11-01, theo hướng dẫn migration chính thức "workflows to skills", nên không dùng workflow.
- **Dependencies**: `.agents/skills/agent-handoff/references/executor.md` §1 (preflight kiểm `branch`), `architect.md` §2 (prompt), `.agents/adapter/skills.json` (`exclude.claude`).

## 2. Invariants & Rules
- Skill `executor` **chỉ trỏ tới** `agent-handoff/references/executor.md`, không chép lại quy trình (một nguồn duy nhất).
- Claude Code không nạp skill `executor`: thêm vào `skills.json` mục `exclude.claude`. Claude giữ vai Architect.
- Prompt dài hiện tại vẫn giữ làm phương án dự phòng, cho khi `/executor` không chạy.
- Commit vẫn do Dev làm (HITL).
- Ngoài phạm vi: tự động hoá bước Dev tạo nhánh; sửa script trong `scripts/`.

## 3. Step-by-Step Implementation Checklist
- [x] **Step 1 — Skill `executor`**: tạo `.agents/skills/executor/SKILL.md`, frontmatter `name: executor`, description nói rõ dùng khi Dev gõ `/executor [task_id]` trong Antigravity. Nội dung:
  - Có `task_id` thì dùng `.handoff/specs/<task_id>.md`.
  - Không có `task_id` thì tìm trong `.handoff/specs/TASK-*.md` spec có `branch` trùng `git branch --show-current` và `status` là `READY` hoặc `IN_PROGRESS`. Đúng một spec thì dùng spec đó; không có hoặc có nhiều hơn một thì dừng, liệt kê, hỏi Dev.
  - Sau đó làm đúng `.agents/skills/agent-handoff/references/executor.md`, từ mục 1 tới mục 6.
  - Khi xong, in: `Xong. Gõ "verify <task_id>" cho Claude nếu phiên Claude đã đóng.`
- [x] **Step 2 — Ẩn với Claude**: thêm `"executor"` vào `exclude.claude` trong `.agents/adapter/skills.json`, rồi chạy `yarn agents:sync`.
- [x] **Step 3 — architect.md §2**: thay khối prompt bằng hướng dẫn "Trong Antigravity, ở nhánh của spec, gõ `/executor`". Khối prompt cũ chuyển thành "Dự phòng". Làm tương tự cho prompt sửa lần 2 ở §6: `/executor <task_id>` kèm danh sách lỗi.
- [x] **Step 4 — executor.md**: thêm một dòng ở đầu file: vào vai Executor bằng `/executor` hoặc bằng prompt dự phòng.
- [x] **Step 5 — Bỏ Orca**: viết lại mục "Vai trò và cách chạy với Orca" trong `.handoff/PLAN-second-brain.md`:
  - Đổi tên thành "Vai trò và cách chạy".
  - Executor là Antigravity, chạy thẳng trên repo, ở nhánh của spec.
  - Quy trình 4 bước: Claude viết spec, tạo nhánh và baseline → Dev gõ `/executor` trong Antigravity → watcher của Claude tự verify → Dev commit.
  - Bỏ câu về worker Orca.
- [x] **Step 6 — Kiểm thực tế**: Dev mở Antigravity trên nhánh có spec thử, gõ `/executor`. Ghi vào Audit Log: skill có hiện trong danh sách lệnh không, và có tìm đúng spec không.

## 4. Verification Gate Results
- [x] `Agents Sync`: PASSED
- [x] `No Orca`: PASSED (kể cả `.agents/skills/executor/`)
- [x] `Executor Not In Claude`: PASSED
- [x] `Intel Status`: PASSED (92 + 27 ref)
- [x] `Boundary Check`: PASSED (6 file, 0 vi phạm)

## 5. Execution Audit Log
- **Result file**: `.handoff/runs/TASK-agent-workflow-004/result.json`
- **Executor**: Claude (Owner yêu cầu đi theo Agy, dán tay chỉ là dự phòng).
- **Nhánh**: tách từ `chore/agent-workflow-3` thay vì `main`, vì `db27f62` (đợt 3) cũng sửa `architect.md` và chưa vào `main`.
- **Kiểm `/executor` trong Antigravity (Step 6)**: PASSED (2026-11-25 — skill `executor` nạp trực tiếp từ `.agents/skills/executor/SKILL.md` vào danh sách skills của Antigravity và dò đúng spec theo `branch` / `status`).
- **Modified Files**:
  - `.agents/skills/executor/SKILL.md` (mới), `.agents/adapter/skills.json`
  - `.agents/skills/agent-handoff/SKILL.md`, `references/architect.md` (§2, §6), `references/executor.md`
  - `.handoff/PLAN-second-brain.md` (mục Vai trò và cách chạy)
- **Bài học**: ...
