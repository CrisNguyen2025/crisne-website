---
name: agent-handoff
description: Tiêu chuẩn tiếp nhận, thực thi và bàn giao task giữa Claude Code (Architect) và Antigravity/Codex (Executor).
---

# Agent Handoff Protocol (Executor Guide)

## Vai trò: Executor (Người thực thi kỹ thuật)
Bạn tiếp nhận chỉ đạo kỹ thuật từ **Claude Code (Lead Architect)** thông qua task file trong `.handoff/specs/TASK-*.md`.

---

## Quy trình thực thi bắt buộc (SOP):

### Bước 1: Pre-flight Check & Khởi động
1. Đọc file task chỉ định trong `.handoff/specs/`.
2. Kiểm tra nhánh git hiện tại (`git branch --show-current`). Nhánh git **bắt buộc** phải khớp với trường `branch` trong frontmatter.
3. Tạo lock file tại `.handoff/runs/.lock` với nội dung JSON: `{ "task_id": "...", "started_at": "..." }`.
4. Cập nhật task frontmatter: `status: IN_PROGRESS`, `current_attempt: 1`.

### Bước 2: Atomic Execution (Tuân thủ Boundary)
1. Chỉ được phép tạo/sửa các file nằm trong danh sách `allowed_to_modify`.
2. **Tuyệt đối cấm** chỉnh sửa bất kỳ file nào trong danh sách `strictly_forbidden` (ví dụ: `package.json`, `yarn.lock`, config files).
3. Tuân thủ style guide của dự án:
   - TypeScript strict mode, không dùng `any`, không `@ts-ignore`.
   - Không comment vào code mới.
   - Không dùng `px`, chỉ dùng `rem` hoặc Tailwind class có sẵn.
4. Đánh dấu `[x]` vào checklist sau mỗi bước hoàn thành.

### Bước 3: Verification Gate & Circuit Breaker (Cơ chế 3 lần)
Chạy toàn bộ các lệnh trong `verification_gate`:
- Nếu toàn bộ test/lint/type-check đều **PASS**:
  - Chạy `git status --porcelain` để kiểm tra boundary. Nếu không có file vi phạm, chuyển sang Bước 4.
- Nếu **FAIL**:
  - Tăng `current_attempt`.
  - Tự debug tối đa 3 lần. Nếu `current_attempt >= 3`:
    - **Dừng ngay lập tức (Trigger Circuit Breaker)**.
    - Chạy `git restore .` để hoàn trả workspace về trạng thái sạch ban đầu.
    - Tạo file `.handoff/runs/escalations/ESC-{task_id}.md` (ghi 5 dòng log lỗi + 3 giả thuyết đã thử + câu hỏi kiến trúc cho Claude Code).
    - Cập nhật task frontmatter: `status: ESCALATED`.
    - Xóa `.handoff/runs/.lock` và dừng lại.

### Bước 4: Handback (Bàn giao hoàn tất)
1. Commit code bằng git theo format: `feat/fix: [task description] ({task_id})`.
2. Điền commit hash và danh sách modified files vào mục `Execution Audit Log`.
3. Cập nhật task frontmatter: `status: COMPLETED`.
4. Xóa file `.handoff/runs/.lock`.
5. Báo cáo hoàn tất để người dùng chuyển sang Claude Code review.
