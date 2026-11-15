---
task_id: "TASK-agent-workflow-002"
branch: "chore/agent-workflow-2" # tách từ chore/agent-workflow (2c8cbb0 chưa vào main)
version: "3.0.0"
type: "implement"
priority: "P2"
status: "COMPLETED"
assigned_executor: "claude"
max_attempts: 3
current_attempt: 1
deploy_steps: []

boundaries:
  allowed_to_modify:
    - "eslint.config.mjs"
    - "AGENTS.md"
    - ".handoff/specs/TEMPLATE-TASK.md"
    - ".agents/skills/agent-handoff/references/architect.md"
    - ".agents/skills/agent-handoff/references/executor.md"
    - "docs/abot-next-actions-plan.md"
  continues_dirty: []
  read_only_references:
    - ".github/workflows/ci.yml"
    - "roadmap-rag-assistant/tests/test_write_invariants.py"
    - "roadmap-rag-assistant/evals/router/confuse_baseline.json"
    - "tests/manual/assistant-sections.md"
  strictly_forbidden:
    - "package.json"
    - "yarn.lock"
    - "tsconfig.json"
    - "CLAUDE.md"
    - ".claude/**"
    - ".agents/adapter/**"
    - "app/**"
    - "lib/**"
    - "components/**"
    - "hooks/**"

fast_gate: ["no_console_probe", "agents_sync", "boundary_check"]
verification_gate:
  no_console_probe: "printf 'export const f = () => console.log(1);\\n' | yarn eslint --stdin --stdin-filename lib/__probe__.ts; test $? -ne 0"
  allowed_console_probe: "printf 'export const f = () => console.error(1);\\n' | yarn eslint --stdin --stdin-filename lib/__probe__.ts"
  type_check: "yarn tsc --noEmit -p ."
  agents_sync: "yarn agents:sync --check"
  intel_status: "yarn intel status"
  boundary_check: "bash .agents/skills/agent-handoff/scripts/check-boundary.sh TASK-agent-workflow-002"
---

# TASK: Đợt 2 cải thiện quy trình agent: no-console, gate hai tầng, khép vòng verify

## 1. Context & Architectural Intent
- **Goal**: 4 việc còn lại sau top 5 (`TASK-agent-workflow-001`).
  1. Chuyển quy ước "không `console.log`" từ chữ trong `AGENTS.md` sang rule ESLint.
  2. Thêm gate hai tầng: gate nhanh cho mỗi lần thử, gate đầy đủ một lần trước `COMPLETED`.
  3. Prompt giao việc nhắc Dev gõ `verify <task_id>`, để vòng giao việc khép lại dù watcher của Claude đã chết.
  4. Đánh dấu 2 mục đã cũ trong `docs/abot-next-actions-plan.md`.
- **Why**:
  - `eslint.config.mjs` không có `no-console`. Có 19 `console.log` trong `app/ lib/ components/` (grep 2026-11-15). `AGENTS.md` mục Conventions tự nói "những gì ESLint đã bắt thì không ghi lại ở đây", nên khi ESLint bắt được rule này thì dòng đó trong `AGENTS.md` phải bỏ.
  - CI chỉ lint file đổi (`.github/workflows/ci.yml:69-81`). Vì vậy bật rule không làm vỡ CI với 19 chỗ cũ: chỗ nào được sửa tới thì mới phải dọn.
  - Spec `TASK-router-stress-001` chỉ đổi một file JSON mà mỗi lần thử phải chạy toàn bộ pytest (1062 test).
  - Watcher `wait-result.sh` chỉ sống khi phiên Claude còn mở (`architect.md` §3) và đã bị dừng giữa chừng một lần.
  - `docs/abot-next-actions-plan.md`: mục 5 (lỗi 2) đã sửa ở `TASK-abot-bugs-001`, theo `tests/manual/assistant-sections.md`. Mục 9 cũng đã cũ: không còn test `test_evals_answer_target`, và `wrong_branch` đo được 91, dưới mốc 103.
- **Dependencies**: `eslint.config.mjs`; `AGENTS.md` mục Conventions; `TEMPLATE-TASK.md` frontmatter; `executor.md` §3; `architect.md` §2, §6.
- **Nhánh**: `chore/agent-workflow-2` tách từ `chore/agent-workflow` (commit `2c8cbb0` chưa vào `main`).

## 2. Invariants & Rules
- Rule dự án: `AGENTS.md`. Tài liệu viết tiếng Việt.
- **Không sửa 19 chỗ `console.log` hiện có.** `app/ lib/ components/ hooks/` đều nằm trong `strictly_forbidden`; chúng được dọn dần khi file bị sửa tới.
- Rule `no-console` cho phép `console.warn` và `console.error`.
- Không thêm dependency. Gói `server-only` (cho rule "không import server-only vào client") nằm ngoài phạm vi, chờ Owner quyết.
- Không đổi chữ ký hay hành vi của script handoff (`scripts/**`). `fast_gate` chỉ là quy ước trong tài liệu.
- Spec cũ không có `fast_gate` thì hiểu là mọi gate đều chạy ở mỗi lần thử, giữ hành vi như trước.
- Lỗi hoặc test fail "có từ trước": chỉ ghi khi kèm lệnh tái hiện, commit và ngày.
- Ngoài phạm vi:
  - `server-only`;
  - sửa các chỗ `console.log`;
  - Langfuse legacy API (`docs/abot-next-actions-plan.md` mục 8; Owner đã nói bỏ qua);
  - các mục khác của `docs/abot-next-actions-plan.md`.

## 3. Step-by-Step Implementation Checklist
- [x] **Step 1 — ESLint**: trong `eslint.config.mjs`, thêm một block sau `eslintConfigPrettier` với `rules: { "no-console": ["error", { allow: ["warn", "error"] }] }`, áp dụng cho `app/**`, `lib/**`, `components/**`, `hooks/**`, `logic/**` (file `.ts` và `.tsx`). Không áp cho `scripts/**`, `tests/**`, `roadmap-rag-assistant/**`. Có comment một dòng: CI chỉ lint file đổi nên các chỗ cũ được dọn khi file bị sửa tới.
- [x] **Step 2 — AGENTS.md**: bỏ dòng "Không để console.log/debug log trong code commit" ở mục Conventions, vì ESLint đã bắt. Không sửa dòng nào khác.
- [x] **Step 3 — Gate hai tầng (template)**: trong frontmatter của `TEMPLATE-TASK.md`, ngay trên `verification_gate`, thêm:
  ```yaml
  fast_gate: ["type_check", "boundary_check"] # key của verification_gate chạy ở mỗi lần thử; mọi key chạy một lần trước COMPLETED. Bỏ trống = chạy tất cả mỗi lần
  ```
- [x] **Step 4 — Gate hai tầng (executor.md §3)**: viết lại gạch đầu dòng `implement` thành:
  - Mỗi lần thử: chạy các key trong `fast_gate`, hoặc mọi key nếu spec không có `fast_gate`.
  - Khi `fast_gate` pass: chạy mọi key còn lại một lần. Fail thì tính là một lần thử.
  - Chỉ ghi `COMPLETED` khi **mọi** key đều pass ở lần chạy cuối.
- [x] **Step 5 — Chọn gate nhanh (architect.md §1)**: thêm một dòng: `fast_gate` chọn các lệnh nhanh và đúng phạm vi file sửa (ví dụ `type_check`, `boundary_check`, một test file cụ thể); test toàn bộ (`yarn test`, `pytest -q`) để ngoài `fast_gate`.
- [x] **Step 6 — Khép vòng verify (architect.md §2 và §6)**: trong khối prompt ở §2 và khối "Prompt sửa lần 2" ở §6, thêm dòng cuối:
  `Xong thì nhắc Dev: gõ "verify <task_id>" cho Claude.`
  §3 câu "Watcher chỉ sống khi phiên Claude còn mở..." giữ nguyên.
- [x] **Step 7 — Docs cũ**: trong `docs/abot-next-actions-plan.md`:
  - Mục 5: thêm ngay dưới tiêu đề dòng `**Đã xong** (ở `TASK-abot-bugs-001`, xem lỗi 2 trong `tests/manual/assistant-sections.md`).`
  - Mục 9: thêm ngay dưới tiêu đề dòng `**Đã cũ (kiểm 2026-11-15):** không còn test `test_evals_answer_target`; `wrong_branch` đo offline là 91 ≤ mốc 103, nên `test_write_invariants` pass.`
  - Không xoá nội dung cũ.

## 4. Verification Gate Results
<!-- Executor điền: PENDING | PASSED | FAILED | SKIPPED -->
- [x] `No Console Probe`: PASSED (ESLint báo `no-console` ở 1:24)
- [x] `Allowed Console Probe`: PASSED
- [x] `TypeCheck`: PASSED
- [x] `Agents Sync`: PASSED
- [x] `Intel Status`: PASSED (92 ref)
- [x] `Boundary Check`: PASSED (7 file kể cả spec, 0 vi phạm)

## 5. Execution Audit Log
<!-- Executor điền. Không commit: Dev commit sau khi Claude verify -->
- **Result file**: `.handoff/runs/TASK-agent-workflow-002/result.json`
- **Executor**: Claude (Owner yêu cầu); watcher đã dừng.
- **Kiểm thêm**: `scripts/**` không bị rule áp (probe pass); `yarn eslint app/notes/NotesClient.tsx` báo đúng 3 `no-console`, nên các chỗ cũ sẽ bị bắt khi file đó được sửa.
- **Modified Files**:
  - `eslint.config.mjs`, `AGENTS.md` (bỏ dòng console.log, còn 107 dòng)
  - `.handoff/specs/TEMPLATE-TASK.md` (`fast_gate`), `.agents/skills/agent-handoff/references/executor.md` §3, `.agents/skills/agent-handoff/references/architect.md` (§1 chọn `fast_gate`, 2 khối prompt)
  - `docs/abot-next-actions-plan.md` (mục 5, 9)
- **Bài học**:
  - Gate kiểm rule lint nên dùng probe qua stdin (một đoạn phải fail, một đoạn phải pass); chỉ chạy ESLint thì không chứng minh được rule đang bật.
  - Ai sửa file nằm trong 19 chỗ `console.log` cũ sẽ phải dọn ngay: Architect nên tính phần này vào phạm vi task đó.
