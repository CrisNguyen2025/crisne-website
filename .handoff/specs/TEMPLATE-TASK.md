---
task_id: "TASK-[branch-slug]-[id]"
branch: "feature/[feature-name]"
version: "2.0.0"
priority: "P1" # [P0 | P1 | P2]
status: "READY" # [READY | IN_PROGRESS | COMPLETED | ESCALATED | ABORTED]
assigned_executor: "antigravity" # [antigravity | codex]
max_attempts: 3
current_attempt: 0

boundaries:
  allowed_to_modify:
    - "src/features/[module]/**"
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
  test: "yarn test"
  boundary_check: "git status --porcelain"
---

# TASK: [Tên nhiệm vụ ngắn gọn]

## 1. Context & Architectural Intent
- **Goal**: [Mục tiêu cốt lõi]
- **Why**: [Lý do kỹ thuật/nghiệp vụ]
- **Dependencies**: [Tham chiếu tới các file, ví dụ src/.../types.ts]

## 2. Invariants & Rules
- TypeScript strict mode, cấm dùng `any`, cấm `@ts-ignore`.
- Không thêm comment giải thích vào code mới.
- Styling: Chỉ dùng Tailwind 4 + rem, cấm hardcode px.

## 3. Step-by-Step Implementation Checklist
- [ ] **Step 1 (Interface/Type)**: Khởi tạo types trong `src/...`.
- [ ] **Step 2 (Service/API)**: Thêm API endpoint trong `src/...`.
- [ ] **Step 3 (Feature UI/Hook)**: Triển khai logic trong `src/...`.
- [ ] **Step 4 (Tests)**: Viết test case nghiệm thu trong `src/...`.

## 4. Verification Gate Results
- [ ] `TypeCheck`: [PENDING | PASSED | FAILED]
- [ ] `Lint`: [PENDING | PASSED | FAILED]
- [ ] `Test`: [PENDING | PASSED | FAILED]
- [ ] `Boundary Check`: [PENDING | PASSED | FAILED]

## 5. Execution Audit Log
- **Git Commit Hash**: `[Chưa có / Điền hash commit khi hoàn thành]`
- **Modified Files**:
  - `src/...`
