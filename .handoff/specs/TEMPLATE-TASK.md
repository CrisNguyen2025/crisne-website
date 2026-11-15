---
task_id: "TASK-[branch-slug]-[id]"
branch: "[branch hiện tại, ví dụ main]"
version: "3.0.0"
type: "implement" # [implement | review]: review thì Executor không sửa file nào, trừ chính file spec này
priority: "P1" # [P0 | P1 | P2]
status: "READY" # [READY | IN_PROGRESS | COMPLETED | ESCALATED | ABORTED]
assigned_executor: "antigravity" # [antigravity | codex]
max_attempts: 3
current_attempt: 0

boundaries:
  allowed_to_modify:
    - "[đường dẫn hoặc glob trong repo, ví dụ lib/example/**]"
  continues_dirty: [] # file đang dirty vì phase trước đã verify mà chưa commit; Executor được sửa tiếp (executor.md mục 1, bước 4)
  read_only_references:
    - "[file chỉ đọc, ví dụ docs/adr/**]"
  strictly_forbidden:
    - "package.json"
    - "yarn.lock"
    - "tsconfig.json"

deploy_steps: [] # việc phải làm ngoài repo sau khi merge (migration DB, biến môi trường, reindex); để trống nếu không có

verification_gate:
  type_check: "yarn tsc --noEmit -p ."
  lint: "yarn lint"
  test: "yarn test"
  intel_status: "yarn intel status" # map cris-code-intel phải khớp code
  boundary_check: "bash .agents/skills/agent-handoff/scripts/check-boundary.sh [task_id]"
---

# TASK: [Tên nhiệm vụ ngắn gọn]

## 1. Context & Architectural Intent
- **Goal**: [Mục tiêu cốt lõi]
- **Why**: [Lý do kỹ thuật/nghiệp vụ]
- **Dependencies**: [Con trỏ tới file/symbol/ADR/flow, ví dụ `lib/example.ts#fn`, `FLOW_ABOT_CHAT_QUERY`. Không dán code]

## 2. Invariants & Rules
- Rule dự án: `AGENTS.md`. Chỉ ghi ở đây rule riêng của task và ADR liên quan.
- Lỗi hoặc test fail "có từ trước": chỉ ghi khi kèm lệnh tái hiện, commit và ngày. Thiếu một trong ba thì không ghi.
- Ngoài phạm vi: [liệt kê]

## 3. Step-by-Step Implementation Checklist
- [ ] **Step 1**: [việc + đường dẫn]
- [ ] **Step 2**: [việc + đường dẫn]

## 4. Verification Gate Results
<!-- Executor điền: PENDING | PASSED | FAILED | SKIPPED -->
- [ ] `TypeCheck`: PENDING
- [ ] `Lint`: PENDING
- [ ] `Test`: PENDING
- [ ] `Intel Status`: PENDING
- [ ] `Boundary Check`: PENDING

## 5. Execution Audit Log
<!-- Executor điền. Không commit: Dev commit sau khi Claude verify -->
- **Result file**: `.handoff/runs/[task_id]/result.json`
- **Modified Files**:
  - `...`
- **Bài học** (Claude điền khi verify PASS, tối đa 3 dòng): ...
