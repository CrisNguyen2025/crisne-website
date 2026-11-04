# RFC: Cross-Agent Handoff Protocol v2 (Claude Code ➔ Antigravity / Codex)

- **Trạng thái**: READY FOR CLAUDE CODE REVIEW (Đã qua Red-Team Stress-Test)
- **Kiến trúc**: Deterministic Dual-Agent Decoupled Execution (Architect / Worker Split)
- **Primary Architect**: Claude Code (High-reasoning, system design, boundary definition, task breakdown)
- **Primary Executor**: Antigravity / Codex (Local edits, fast tool execution, verification gates)
- **Shared Memory Medium**: Filesystem (`.handoff/`)

---

## 1. Problem Statement & Core Principles

Mô hình phân quyền giữa **Claude Code (Architect)** và **Antigravity / Codex (Executor)** giải quyết 3 điểm nghẽn lớn nhất của coding agent hiện nay:
1. **Context Preservation**: Claude Code không bị ô nhiễm context bởi hàng ngàn dòng terminal log, test failure hay raw git diff.
2. **Deterministic Boundaries**: Executor bị kiểm soát chặt chẽ bởi whitelist đường dẫn file và validation gates tự động, loại bỏ rủi ro "sửa nhầm" hay tự tiện cài package ngoài ý muốn.
3. **Mechanical Circuit Breaker**: Cơ chế ngắt cứng sau tối đa 3 lần thử thất bại, tự động rollback workspace về trạng thái sạch và gửi báo cáo Escalation cho Claude Code.

---

## 2. Directory Structure

```
.handoff/
├── .gitignore                      # Ignore thư mục runs/ và logs/
├── rfc-agent-handoff.md            # Tài liệu RFC kiến trúc
├── specs/                          # Tracked in Git: Chứa đặc tả công việc từ Claude Code
│   ├── TEMPLATE-TASK.md            # Template mẫu cho task mới
│   └── TASK-{branch}-{id}.md
└── runs/                           # .gitignored: Chứa runtime state, logs, locks
    ├── .lock                       # Tránh xung đột agent
    ├── logs/                       # Lưu raw terminal outputs
    └── escalations/                # Chứa báo cáo khi Circuit Breaker kích hoạt
        └── ESC-{task_id}.md
```

Nội dung `.handoff/.gitignore`:
```gitignore
runs/
*.lock
*.log
```

---

## 3. Task Contract Schema v2 (YAML Frontmatter + Markdown)

Mỗi task là một file tại `.handoff/specs/TASK-{branch}-{id}.md`:

```markdown
---
task_id: "TASK-{branch-slug}-{id}"
branch: "feature/{feature-name}"
version: "2.0.0"
priority: "P1" # [P0 | P1 | P2]
status: "READY" # [READY | IN_PROGRESS | COMPLETED | ESCALATED | ABORTED]
assigned_executor: "antigravity" # [antigravity | codex]
max_attempts: 3
current_attempt: 0

boundaries:
  allowed_to_modify:
    - "src/features/example/**"
  read_only_references:
    - "src/config/**"
    - "src/constants/**"
  strictly_forbidden:
    - "package.json"
    - "yarn.lock"
    - "src/styles/**"
    - "tsconfig.json"

verification_gate:
  type_check: "yarn type-check"
  lint: "yarn lint"
  test: "yarn test path/to/spec"
  boundary_check: "git status --porcelain"
---

# TASK: [Tên tính năng ngắn gọn]

## 1. Context & Architectural Intent
- **Goal**: Mục tiêu cốt lõi cần đạt được.
- **Why**: Lý do kỹ thuật hoặc nghiệp vụ.
- **Dependencies**: Dẫn hướng tới file tham chiếu (pointer-over-payload, không dump raw code).

## 2. Invariants & Rules
- TypeScript strict mode, cấm dùng `any`, cấm `@ts-ignore`.
- Không comment giải thích vào code mới.
- Styling: Chỉ dùng Tailwind 4 + rem, cấm hardcode px.

## 3. Step-by-Step Implementation Checklist
- [ ] **Step 1 (Interface/Type)**: Khởi tạo schema/types tại `src/...`.
- [ ] **Step 2 (Service/API)**: Thêm API call tại `src/...`.
- [ ] **Step 3 (Feature Logic)**: Triển khai hook hoặc component tại `src/...`.
- [ ] **Step 4 (Tests)**: Viết test case nghiệm thu tại `src/...`.

## 4. Verification Gate Results
- [ ] `TypeCheck`: [PENDING | PASSED | FAILED]
- [ ] `Lint`: [PENDING | PASSED | FAILED]
- [ ] `Test`: [PENDING | PASSED | FAILED]
- [ ] `Boundary Check`: [PENDING | PASSED | FAILED]

## 5. Execution Audit Log
- **Git Commit Hash**: `[Điền commit hash khi hoàn thành]`
- **Modified Files**:
  - `src/...`
```

---

## 4. Four Core Mechanisms (Kết quả Stress-Test)

### 4.1. Mechanical Circuit Breaker & Escalation Packet
- **Attempt Budget**: Executor chỉ được tự thử sửa lỗi tối đa **3 lần** cho cùng một lỗi.
- **Auto Rollback**: Khi `current_attempt >= 3`, Executor chạy `git restore .` để trả workspace về trạng thái sạch.
- **Escalation Packet**: Tạo file `.handoff/runs/escalations/ESC-{task_id}.md` chứa:
  - Error Fingerprint (tối đa 5 dòng log quan trọng nhất, không dump stack trace).
  - 3 giả thuyết đã thử nhưng thất bại.
  - Câu hỏi kiến trúc cụ thể dành cho Claude Code.

### 4.2. Concurrency & Git Isolation
- Tách rời: **Spec** lưu trong Git (`.handoff/specs/`), **Runtime State** lưu cục bộ (`.handoff/runs/` được gitignore).
- Tên task gắn liền branch slug: `TASK-{branch-slug}-{id}.md`.
- Process Lock: Executor tạo `.handoff/runs/.lock` trước khi chạy, tránh 2 agent chạy đè lên nhau.

### 4.3. Pointer-Over-Payload (Chống phình Context)
- Spec chỉ chứa đường dẫn file và symbol anchor (ví dụ: `src/features/auth/hooks/useAuth.ts#useAuth`).
- Không copy paste toàn bộ file code vào spec.
- Toàn bộ raw log từ terminal được ghi vào `.handoff/runs/logs/`, chỉ ghi tóm tắt 1 dòng vào task contract.

### 4.4. Hard Boundary Enforcement
- Trước khi đóng task, Executor phải chạy kiểm tra `git status --porcelain`.
- Nếu có file nằm ngoài `allowed_to_modify` hoặc thuộc `strictly_forbidden` bị thay đổi, task sẽ bị từ chối đánh dấu `COMPLETED`.

---

## 5. Standard Operating Procedure (SOP)

1. **Claude Code (Architect)**:
   - Nghiên cứu codebase ➔ Tạo file `.handoff/specs/TASK-{branch}-{id}.md` với `status: READY`.
   - Commit spec vào git branch hiện tại.
2. **Antigravity / Codex (Executor)**:
   - Đọc spec ➔ Kiểm tra đúng git branch ➔ Đặt lock `.lock` ➔ Đổi `status: IN_PROGRESS`.
   - Thực thi từng bước checklist.
   - Chạy toàn bộ Verification Gate.
   - *Nếu pass*: Tạo git commit, đổi `status: COMPLETED`, giải phóng lock.
   - *Nếu fail >= 3 lần*: Rollback, tạo file `ESC-{task_id}.md`, đổi `status: ESCALATED`.
3. **Claude Code (Review & Sign-off)**:
   - Đọc commit diff hoặc đọc file `ESC-{task_id}.md` để điều chỉnh kiến trúc.
