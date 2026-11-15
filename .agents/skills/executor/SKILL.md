---
name: executor
description: Vào vai Executor của quy trình agent-handoff và thực thi một spec `.handoff/specs/TASK-*.md`. Dùng khi Dev gõ `/executor` (tự tìm spec theo nhánh hiện tại) hoặc `/executor <task_id>` trong Antigravity.
---

# Executor (`/executor [task_id]`)

Lệnh này chỉ chọn spec rồi giao cho quy trình Executor. Không chép lại quy trình ở đây.

## 1. Chọn spec

- Có `task_id`: dùng `.handoff/specs/<task_id>.md`.
- Không có `task_id`: tìm trong `.handoff/specs/TASK-*.md` các spec có `branch` (bỏ phần comment `#`) trùng với `git branch --show-current` và `status` là `READY` hoặc `IN_PROGRESS`.
  - Đúng một spec: dùng spec đó, in ra một dòng `Spec: <task_id>`.
  - Không có spec nào, hoặc nhiều hơn một: dừng, liệt kê những gì tìm thấy (kèm `branch` và `status`), hỏi Dev chọn. Không đoán.

## 2. Thực thi

Làm đúng `.agents/skills/agent-handoff/references/executor.md`, từ mục 1 (Preflight) tới mục 6 (`result.json`). Không commit, không push.

## 3. Kết thúc

In: `Xong <task_id> (<status>). Gõ "verify <task_id>" cho Claude nếu phiên Claude đã đóng.`
