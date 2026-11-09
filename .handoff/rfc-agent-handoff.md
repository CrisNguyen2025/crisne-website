# RFC: Cross-Agent Handoff Protocol v3 (Claude Code ➔ Antigravity / Codex)

- **Trạng thái**: v3 (2026-11-09). Mục 3 và 4.1 giữ nội dung v2 để đối chiếu; chỗ nào mâu thuẫn thì mục 5 và mục 6 (v3) thắng. Template chuẩn: `.handoff/specs/TEMPLATE-TASK.md`
- **Kiến trúc**: Deterministic Dual-Agent Decoupled Execution (Architect / Worker Split)
- **Primary Architect**: Claude Code (High-reasoning, system design, boundary definition, task breakdown)
- **Primary Executor**: Antigravity / Codex (Local edits, fast tool execution, verification gates)
- **Shared Memory Medium**: Filesystem (`.handoff/`)

---

## 1. Problem Statement & Core Principles

Mô hình phân quyền giữa **Claude Code (Architect)** và **Antigravity / Codex (Executor)** giải quyết 3 điểm nghẽn lớn nhất của coding agent hiện nay:
1. **Context Preservation**: Claude Code không bị ô nhiễm context bởi hàng ngàn dòng terminal log, test failure hay raw git diff.
2. **Deterministic Boundaries**: Executor bị kiểm soát chặt chẽ bởi whitelist đường dẫn file và validation gates tự động, loại bỏ rủi ro "sửa nhầm" hay tự tiện cài package ngoài ý muốn.
3. **Mechanical Circuit Breaker**: Cơ chế ngắt cứng sau tối đa 3 lần thử thất bại, chỉ hoàn tác file do chính Executor sửa (không đụng thay đổi của Dev) và gửi báo cáo Escalation cho Claude Code.

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
    ├── {task_id}/                  # v3: baseline.txt (Claude), result.json + review.md (Executor)
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
- **Rollback (v3)**: Khi `current_attempt >= max_attempts`, Executor chỉ `git restore -- <file>` cho file nó đã sửa và sạch trong baseline. Không dùng `git restore .`: working tree có thay đổi chưa commit của Dev.
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

## 5. Standard Operating Procedure (SOP) v3

1. **Claude Code (Architect)**: nghiên cứu codebase, viết `.handoff/specs/TASK-{branch}-{id}.md` (`status: READY`), chạy `baseline.sh <task_id>`, in prompt cho Dev. Không commit spec (rule dự án), báo Dev để họ commit nếu muốn.
2. **Dev**: dán prompt cho Executor.
3. **Claude Code**: bật `wait-result.sh <task_id>` chạy nền, tiếp tục làm việc khác.
4. **Antigravity / Codex (Executor)**: preflight, đặt lock, `status: IN_PROGRESS`, làm theo checklist, chạy Verification Gate. Kết thúc ở bất kỳ trạng thái nào đều ghi `result.json`:
   - pass: `COMPLETED`, **không commit**;
   - fail đủ `max_attempts`: hoàn tác phần của mình, ghi `ESC-{task_id}.md`, `ESCALATED`;
   - không thể bắt đầu (sai branch, file đang dirty, lock): `ABORTED`.
5. **Claude Code (Verify & Report)**: watcher thoát nên được gọi lại; chạy `check-boundary.sh`, chạy lại gate, đối chiếu checklist và rule dự án (không tin `result.json`), rồi trả report PASS/PARTIAL/FAIL kèm next action (giao phase kế, sinh prompt sửa lần 2, Claude sửa nhỏ, hoặc đề xuất Dev commit).

---

## 6. Thay đổi v3 so với v2

| Thay đổi | Lý do |
|---|---|
| Executor không commit; bỏ `Git Commit Hash` khỏi mục 5 của spec | Rule dự án: không tự commit; Claude verify trên diff chưa commit |
| Rollback chỉ file của Executor, không `git restore .` | Working tree có thay đổi chưa commit của Dev |
| `baseline.sh` + `check-boundary.sh` | `git status --porcelain` không có mốc nên nhầm thay đổi cũ với vi phạm, hoặc che vi phạm thật |
| `result.json` bắt buộc ở mọi trạng thái kết thúc | Tín hiệu duy nhất để Claude biết Executor đã xong |
| `wait-result.sh` chạy nền (RESULT / SPEC_TERMINAL / TIMEOUT) | Claude được gọi lại, không poll, không im lặng khi Executor treo |
| `type: review` | Giao việc chỉ-đọc (xác minh giả định, đối chiếu docs); Executor không sửa file nào trừ chính file spec, kết quả vào `review.md` |
| Gate dùng script thật (`yarn tsc --noEmit -p .`) | `yarn type-check` không tồn tại trong repo |
| Rule dự án trỏ `AGENTS.md`, không chép vào spec | Tránh lệch hai bản |
| `wait-result.sh` thêm `STALLED` (30 phút không có file nào đổi khi spec `IN_PROGRESS`) | Phát hiện Executor treo sớm hơn 4 giờ timeout |
| `boundaries.continues_dirty` | Phase sau được sửa tiếp file phase trước đã verify nhưng chưa commit, không bị `ABORTED` vì "file đang dirty" |
| Executor không sửa `baseline.txt` | Baseline do Claude giữ; file lạ xuất hiện giữa chừng thì ghi `notes` và đánh `boundary_check` `FAILED` để Claude phân xử |
| `clean.sh` dọn `.handoff/runs/` (dry-run mặc định, chỉ task đã đóng và spec đã commit) | `runs/` tích tụ bằng chứng tạm sau mỗi task; không bao giờ đụng spec hay file trong repo |

Spec v2 cũ vẫn dùng được: thiếu `type` thì coi là `implement`; chỉ cần chạy `baseline.sh` trước khi giao.
