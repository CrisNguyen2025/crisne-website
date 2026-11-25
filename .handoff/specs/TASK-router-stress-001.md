---
task_id: "TASK-router-stress-001"
branch: "chore/router-stress" # Dev tạo từ main trước khi chạy baseline
version: "3.0.0"
type: "implement"
priority: "P2"
status: "COMPLETED"
assigned_executor: "antigravity"
max_attempts: 3
current_attempt: 1
deploy_steps: []

boundaries:
  allowed_to_modify:
    - "roadmap-rag-assistant/evals/router/confuse_baseline.json"
    - ".agents/skills/cris-code-intel/data/cris-workspace-map.json"
    - ".handoff/specs/TASK-lesson-status-001.md"
  continues_dirty: []
  read_only_references:
    - "roadmap-rag-assistant/evals/router/confuse.py"
    - "roadmap-rag-assistant/evals/router/holdout.py"
    - "roadmap-rag-assistant/tests/test_write_invariants.py"
    - ".agents/skills/cris-code-intel/SKILL.md"
    - "docs/adr/**"
  strictly_forbidden:
    - "package.json"
    - "yarn.lock"
    - "tsconfig.json"
    - "roadmap-rag-assistant/rag_service/**"
    - "roadmap-rag-assistant/evals/router/*.jsonl"
    - "roadmap-rag-assistant/evals/router/*.py"

fast_gate: ["ratchet", "intel_status", "boundary_check"]
verification_gate:
  pytest: "cd roadmap-rag-assistant && .venv/bin/python -m pytest -q"
  evals_validate: "cd roadmap-rag-assistant && .venv/bin/python -m evals validate"
  ratchet: "cd roadmap-rag-assistant && .venv/bin/python -m pytest -q tests/test_write_invariants.py -k stress"
  intel_status: "yarn intel status"
  agents_sync: "yarn agents:sync --check"
  boundary_check: "bash .agents/skills/agent-handoff/scripts/check-boundary.sh TASK-router-stress-001"
---

# TASK: Siết ratchet stress router và thêm flow eval router vào map

## 1. Context & Architectural Intent
- **Goal**:
  - Hạ `confuse_baseline.json` xuống con số thật hiện tại.
  - Cho eval router một flow riêng trong map cris-code-intel.
  - Xoá ghi chú "test fail" đã cũ.
- **Why**:
  - Ratchet đang lỏng. Baseline cho phép `wrong_branch` 103, `preview_violation` 35, trong khi bộ stress hiện chạy offline ra 91 và 23 (`n` = 504, baseline ghi 498). Router có thể tụt 12 điểm `wrong_branch` mà test vẫn pass.
  - Khi thử intel flow, `yarn intel how-to-sync "router stress ..."` trả về `FLOW_EVALS_RUN_PROBE`. Đó là flow eval **retrieval** (`retrieval_probe.py`, `scorers.py`), không chạm tới `evals/router/`. Map đang không có flow nào cho eval router.
  - Mục 6 của `TASK-lesson-status-001.md` vẫn ghi "router stress baseline: wrong_branch 107 > 103", nhưng test này đã pass từ sau các commit router ngày 2026-10-26.
- **Dependencies**:
  - `roadmap-rag-assistant/evals/router/confuse.py#run`, `#main`
  - `roadmap-rag-assistant/evals/router/holdout.py#write_outcome`, `#_router`
  - `roadmap-rag-assistant/tests/test_write_invariants.py#test_stress_set_offline_never_writes_at_once_and_does_not_regress`
  - `FLOW_EVALS_RUN_PROBE` (flow đang có, chỉ sửa tên/invariant)
  - ADR-0003

## 2. Invariants & Rules
- Rule dự án: `AGENTS.md`.
- **Chỉ hạ baseline, không bao giờ nâng.** Mỗi số mới phải ≤ số cũ và đúng bằng số đo được ở Step 1. Nếu đo ra số nào **lớn hơn** baseline hiện tại, hoặc `write_now_violation` ≠ 0: dừng lại và ESCALATE, không sửa baseline.
- Chỉ đo offline (`use_llm=False`), không dùng `--llm`.
- Mọi ref trong flow mới viết dạng `path` hoặc `path#symbol`, với symbol có thật trong file (`yarn intel status` sẽ kiểm).
- Không sửa các spec đã `COMPLETED` khác (`TASK-lesson-status-002`, `TASK-rag-sync-001`, `TASK-test-isolation-001`). Chúng là lịch sử.
- Ngoài phạm vi:
  - `test_evals_answer_target` (phụ thuộc `dev.db`);
  - ngưỡng của holdout (`evals/router/baseline.json`);
  - trigger `yarn eval:rag` của `FLOW_EVALS_RUN_PROBE` đang trỏ `scripts/eval-retrieval.ts` trong khi các chặng lại trỏ `retrieval_probe.py`: chỉ ghi vào Audit Log, không sửa.

## 3. Step-by-Step Implementation Checklist
- [x] **Step 1 — Đo**: trong `roadmap-rag-assistant/`, chạy lệnh dưới đây và ghi output vào Audit Log. Kỳ vọng xấp xỉ: `n` 504, `wrong_branch` 91, `preview_violation` 23, `missed_write` 3, `write_now_violation` 0. Lệch so với kỳ vọng mà vẫn ≤ baseline thì dùng số đo được. Lớn hơn baseline thì ESCALATE.
  ```bash
  .venv/bin/python -c "import asyncio,json; from evals.router.confuse import run; print(json.dumps(asyncio.run(run(False))['total']))"
  ```
- [x] **Step 2 — Baseline**: ghi đúng 5 khoá `n`, `write_now_violation`, `missed_write`, `wrong_branch`, `preview_violation` của Step 1 vào `roadmap-rag-assistant/evals/router/confuse_baseline.json`. Giữ thứ tự khoá và định dạng 2 space như file hiện tại.
- [x] **Step 3 — Flow mới**: thêm vào `executionFlows` của `.agents/skills/cris-code-intel/data/cris-workspace-map.json` một flow, theo đúng schema của `FLOW_EVALS_RUN_PROBE`:
  - `id`: `FLOW_EVALS_ROUTER_STRESS`; `domainId`: `roadmap-assistant-abot`; `actor`: `System / Developer`; `relatedAdrs`: `["ADR-0003"]`.
  - `trigger`: chạy `pytest tests/test_write_invariants.py -k stress`, hoặc `python -m evals.router.confuse`, trong `roadmap-rag-assistant/`.
  - `preconditions`: có venv Python; có bộ dữ liệu `evals/router/stress_confuse.jsonl`.
  - `steps`, tối thiểu 3 chặng:
    1. `roadmap-rag-assistant/evals/router/confuse.py#run`: đọc `stress_confuse.jsonl`, sinh biến thể nhiễu (`no-diacritics`, `greeting`, `emoji`, `typo`, `upper`).
    2. `roadmap-rag-assistant/evals/router/holdout.py#write_outcome`: router heuristic (`_router(use_llm=False)`) quyết định write `now`/`preview`/`none` và nhánh.
    3. `roadmap-rag-assistant/tests/test_write_invariants.py#test_stress_set_offline_never_writes_at_once_and_does_not_regress`: so `total` với `evals/router/confuse_baseline.json`. `callsNext`: `null`.
  - `invariants`:
    - `write_now_violation` luôn bằng 0;
    - `missed_write` và `wrong_branch` không vượt baseline;
    - baseline chỉ được hạ (ratchet), không nâng để test pass.
  - `failureModes`: số đo vượt baseline nghĩa là router regress, phải sửa router, không sửa baseline.
- [x] **Step 4 — Flow cũ**: trong `FLOW_EVALS_RUN_PROBE`, bỏ chữ "& Router" khỏi `name`. Chuyển invariant "Mọi thay đổi trong router/policy.py phải giữ vững baseline của held-out test sets" sang flow mới ở Step 3. Không sửa gì khác của flow này.
- [x] **Step 5 — Meta map**: cập nhật `headCommit` (bằng `git rev-parse --short HEAD`) và `generatedAt` (ngày chạy) của map.
- [x] **Step 6 — Ghi chú cũ**: ở dòng "Còn tồn đọng khác" (mục 6 của `.handoff/specs/TASK-lesson-status-001.md`), bỏ "router stress baseline: wrong_branch 107 > 103" và đổi "hai test fail có từ trước" thành "một test fail có từ trước". Không sửa chỗ nào khác của file đó.
- [x] **Step 7 — Kiểm intel**: chạy `yarn intel how-to-sync "router stress baseline wrong_branch"`, rồi `yarn intel trace FLOW_EVALS_ROUTER_STRESS`. Ghi vào Audit Log: how-to-sync có trả `FLOW_EVALS_ROUTER_STRESS` hay không. Không có thì ghi lại để Claude xem; không sửa script `cris-intel.ts`.

## 4. Verification Gate Results
<!-- Executor điền: PENDING | PASSED | FAILED | SKIPPED -->
- [x] `Pytest`: PASSED
- [x] `Evals Validate`: PASSED (`484 samples in 4 datasets, 125 documents in 1 corpora`)
- [x] `Ratchet`: PASSED (`1 passed` in `test_write_invariants.py -k stress`)
- [x] `Intel Status`: PASSED (`209 ref map + 38 ref docs`)
- [x] `Agents Sync`: PASSED
- [x] `Boundary Check`: PASSED

## 5. Execution Audit Log
<!-- Executor điền. Không commit: Dev commit sau khi Claude verify -->
- **Result file**: `.handoff/runs/TASK-router-stress-001/result.json`
- **Số đo Step 1**: `{"n": 504, "write_now_violation": 0, "preview_violation": 23, "missed_write": 3, "wrong_branch": 91}`
- **how-to-sync Step 7**: Trả về đúng duy nhất `[FLOW_EVALS_ROUTER_STRESS]` (khớp keyword `"stress"`, `"router"`). Ghi nhận ngoài phạm vi: `FLOW_EVALS_RUN_PROBE` có trigger `yarn eval:rag` (`scripts/eval-retrieval.ts`) trong khi step 1 trỏ `retrieval_probe.py`.
- **Modified Files**:
  - `roadmap-rag-assistant/evals/router/confuse_baseline.json`
  - `.agents/skills/cris-code-intel/data/cris-workspace-map.json`
  - `.handoff/specs/TASK-lesson-status-001.md`
