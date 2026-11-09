---
name: agent-handoff
description: Giao task giữa Claude Code (Architect) và Antigravity/Codex (Executor) qua spec `.handoff/specs/TASK-*.md`. Dùng khi được dán prompt "vai Executor" kèm task_id, khi Claude Code cần giao một plan đã duyệt cho agent khác thực thi, hoặc khi cần verify kết quả Executor đã báo (`result.json`).
---

# Agent Handoff v3

Dev dán prompt cho Executor, Executor làm xong ghi `result.json`, Claude Code được báo lại, verify độc lập rồi báo cáo và đề xuất bước tiếp theo.

| Bạn là | Đọc | Việc |
|---|---|---|
| **Executor** (Antigravity, Codex) | `references/executor.md` | Preflight → làm theo spec → gate → ghi `result.json` |
| **Architect** (Claude Code) | `references/architect.md` | Viết spec → baseline → in prompt → chờ chạy nền → verify → report |

## Bất biến (cả hai vai)

- **Executor không commit, không push.** Dev tự commit sau khi Claude verify.
- **Executor luôn ghi `.handoff/runs/<task_id>/result.json`** khi dừng, kể cả `ESCALATED`/`ABORTED`.
- Executor chỉ sửa file trong `boundaries.allowed_to_modify` của spec, cộng với chính file spec (trạng thái, checklist, mục 4–5). Task `review` thì chỉ sửa file spec. Không bao giờ chạy `git restore .`, `git reset --hard`, `git clean`.
- Claude **không tin `result.json`**: tự chạy `check-boundary.sh` và gate rồi mới kết luận.
- Rule dự án nằm ở `AGENTS.md`. Spec chỉ ghi rule riêng của task.

## Thành phần

- Spec: `.handoff/specs/TASK-<branch-slug>-<id>.md` (mẫu: `.handoff/specs/TEMPLATE-TASK.md`, schema: `.handoff/rfc-agent-handoff.md`).
- Trạng thái runtime (gitignore): `.handoff/runs/<task_id>/{baseline.txt,result.json,review.md}`, `.handoff/runs/.lock`, `.handoff/runs/escalations/`.
- Script (bash, không cần dependency), trong `scripts/`:
  - `baseline.sh <task_id>`: ghi mốc working tree trước khi giao.
  - `check-boundary.sh <task_id>`: so với baseline, đối chiếu `allowed_to_modify`/`strictly_forbidden`.
  - `wait-result.sh <task_id> [timeout] [chu_kỳ] [stall]`: chờ `result.json`, in một dòng rồi thoát (chạy nền): `RESULT`, `SPEC_TERMINAL`, `STALLED` hoặc `TIMEOUT`.
  - `clean.sh [--apply] [--days N] [--force-uncommitted] [--remove-lock]`: dọn `.handoff/runs/` của task đã đóng; mặc định chỉ liệt kê (xem `references/architect.md` mục 8).
