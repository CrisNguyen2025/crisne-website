---
task_id: "TASK-agent-workflow-001"
branch: "chore/agent-workflow" # Dev tạo nhánh này trước khi giao, xem mục 1 "Nhánh"
version: "3.0.0"
type: "implement"
priority: "P2"
status: "COMPLETED"
assigned_executor: "claude"
max_attempts: 3
current_attempt: 1

boundaries:
  allowed_to_modify:
    - "AGENTS.md"
    - ".handoff/BACKLOG.md"
    - ".handoff/specs/TEMPLATE-TASK.md"
    - ".agents/skills/agent-handoff/references/architect.md"
    - ".agents/skills/agent-handoff/references/executor.md"
    - ".agents/skills/verify-ci/SKILL.md"
  continues_dirty: []
  read_only_references:
    - ".handoff/specs/TASK-*.md"
    - ".handoff/specs/PLAN-*.md"
    - "docs/abot-next-actions-plan.md"
    - "tests/manual/**"
    - ".agents/skills/agent-handoff/scripts/**"
  strictly_forbidden:
    - "package.json"
    - "yarn.lock"
    - "tsconfig.json"
    - "CLAUDE.md"
    - ".claude/**"
    - ".agents/adapter/**"

verification_gate:
  agents_sync: "yarn agents:sync --check"
  intel_status: "yarn intel status"
  lint_proof: "git show HEAD:hooks/use-roadmap.ts | yarn eslint --stdin --stdin-filename hooks/use-roadmap.ts; true"
  boundary_check: "bash .agents/skills/agent-handoff/scripts/check-boundary.sh TASK-agent-workflow-001"
---

# TASK: Top 5 cải thiện quy trình agent ↔ repo

## 1. Context & Architectural Intent
- **Goal**: Sửa tài liệu quy trình để chặn 5 lỗi đã lặp lại khi agent làm việc với repo.
  1. Nhiều việc dồn chung một nhánh, và bước deploy chỉ được nhắc trong chat.
  2. Số lỗi lint "có từ trước" ghi cứng và lệch nhau.
  3. Lệnh trong `AGENTS.md` không chạy được trên máy thật.
  4. Không có bước rút kinh nghiệm sau mỗi task.
  5. Việc đang mở nằm rải rác ở nhiều nơi.
- **Why**: bằng chứng cho từng lỗi:
  - Nhánh `feat/topic-url-migration` chứa 3 việc; phải dựng staged blob riêng mới tách được commit intel. Bước migration Turso của `de51a44` chỉ nằm trong chat và nội dung PR.
  - Số lỗi lint "có từ trước" là 78 ở `verify-ci/SKILL.md:24` và `TASK-agent-adapter-001.md:69`, là 168 ở `TASK-rag-sync-001.md:71` và `TASK-lesson-status-001.md:68`; đo ngày 2026-11-15 được 77.
  - `AGENTS.md:13` ghi `python -m pytest`, nhưng máy không có `python`, chỉ có `roadmap-rag-assistant/.venv/bin/python`.
  - Ghi chú "wrong_branch 107 > 103" đã sai nhưng vẫn bị chép sang 3 spec.
  - Việc mở nằm ở `TASK-lesson-status-001.md` mục 6, `docs/abot-next-actions-plan.md` mục 5–9 và `tests/manual/assistant-sections.md`.
- **Dependencies**: `AGENTS.md` mục Commands và "Việc đang mở"; `architect.md` §1, §5, §8; `executor.md` §1, §4; `TEMPLATE-TASK.md`; `verify-ci/SKILL.md:24`.
- **Nhánh**:
  - Commit `ac02853` (đã sửa `architect.md`, `TEMPLATE-TASK.md`, `verify-ci`, `AGENTS.md`) **chưa vào `main`**.
  - Vì vậy Dev tạo `chore/agent-workflow` từ `feat/topic-url-migration`, hoặc từ `main` sau khi PR của nhánh đó đã merge. Tạo từ `main` lúc này sẽ thiếu các thay đổi intel và gây conflict.

## 2. Invariants & Rules
- Rule dự án: `AGENTS.md`. Tài liệu viết tiếng Việt, thuật ngữ giữ tiếng Anh như tên trong code.
- **Chỉ sửa tài liệu.** Không sửa script trong `.agents/skills/agent-handoff/scripts/`, không thêm hook, không thêm bước CI.
- Mỗi chỗ sửa ngắn: tối đa khoảng 6 dòng mới cho mỗi file, riêng `BACKLOG.md` không giới hạn. `AGENTS.md` không được dài hơn hiện tại quá 3 dòng (đang 108 dòng).
- Không sửa các spec `TASK-*.md` đã có, dù chúng chứa số lint cũ: đó là lịch sử.
- `BACKLOG.md` chỉ chứa **con trỏ**: mỗi dòng gồm mô tả ngắn và đường dẫn tới nơi chứa chi tiết. Không chép nội dung chi tiết.
- Ngoài phạm vi:
  - các nhóm cải thiện ngoài top 5, như gate hai tầng, chuyển convention sang ESLint, nhắc "verify" trong prompt;
  - dọn file backup trong `.handoff/runs/`;
  - sửa `CLAUDE.md`.

## 3. Step-by-Step Implementation Checklist
- [x] **Step 1 — Một spec một nhánh** (`architect.md` §1 và §2):
  - §1: thêm quy tắc "mỗi spec một nhánh riêng; tạo nhánh trước khi chạy `baseline.sh`. Nhánh gốc là `main`, trừ khi spec phụ thuộc commit chưa merge, khi đó ghi rõ nhánh gốc vào mục Context".
  - §2: thêm "baseline chạy trên đúng nhánh của spec".
- [x] **Step 2 — `deploy_steps`** (`TEMPLATE-TASK.md` và `architect.md` §5):
  - Template: thêm vào frontmatter `deploy_steps: []`, kèm comment: các bước phải chạy ngoài repo sau khi merge (migration DB, biến môi trường, reindex); để trống nếu không có.
  - `architect.md` §5: report và nội dung PR phải liệt kê `deploy_steps` nếu có.
- [x] **Step 3 — Bỏ số lint cứng** (`verify-ci/SKILL.md:24`):
  - Thay "(tránh 78 lỗi cũ)" bằng "(toàn repo có lỗi cũ, không ghi số cứng)".
  - Thêm một ghi chú: lỗi lint trong file đổi mà nghi là có từ trước thì chứng minh bằng `git show <nhánh gốc>:<file> | yarn eslint --stdin --stdin-filename <file>`. Có cùng lỗi thì ghi "có từ trước (đã chứng minh)"; không chứng minh được thì coi là lỗi mới.
  - Template mục 2 thêm một dòng: không ghi số lỗi hay test fail "có từ trước" nếu thiếu lệnh tái hiện, commit và ngày.
- [x] **Step 4 — Lệnh chạy được** (`AGENTS.md:13`, `executor.md` §1):
  - `AGENTS.md:13`: đổi thành `.venv/bin/python -m pytest -q` · `.venv/bin/python -m evals validate`.
  - `executor.md` §1 Preflight thêm 2 kiểm tra; thiếu thì `ABORTED`, ghi rõ thiếu gì:
    - `node -v` (≥ 20);
    - nếu `allowed_to_modify` có `roadmap-rag-assistant/**`: `test -x roadmap-rag-assistant/.venv/bin/python`.
  - `architect.md` §5 hoặc §6: trước khi đề xuất push hoặc PR, Claude chạy `gh auth status`; chưa đăng nhập thì báo Dev chạy `gh auth login`.
- [x] **Step 5 — Bài học sau task** (`architect.md` §5 và `TEMPLATE-TASK.md` mục 5):
  - Template mục 5: thêm dòng `- **Bài học** (Claude điền khi verify xong): ...`.
  - `architect.md` §5: khi report PASS, Claude điền tối đa 3 dòng "Bài học" vào spec. Bài học nào đáng thành rule thì đề xuất sửa `AGENTS.md` hoặc skill trong mục Next action, không tự sửa.
- [x] **Step 6 — `BACKLOG.md`**: tạo `.handoff/BACKLOG.md`.
  - Tiêu đề và một câu: file chỉ mục, mỗi dòng trỏ tới nơi chứa chi tiết; việc nào xong thì xoá dòng.
  - Các dòng ban đầu. Mỗi đường dẫn phải được mở ra kiểm là có thật; dòng nào không xác nhận được thì bỏ và ghi vào Audit Log:
    - Lesson Status Step 6, Abot đọc và đổi trạng thái: `.handoff/specs/TASK-lesson-status-001.md` Step 6
    - Việc mở ngày 2026-11-05 (mobile Android, 👍/👎 portfolio, gợi ý cập nhật bài, Visitor thấy Lesson Status): `.handoff/specs/TASK-lesson-status-001.md` mục 6
    - Lỗi 2 và lỗi 8: `tests/manual/assistant-sections.md`
    - Mục 5–9: `docs/abot-next-actions-plan.md`
    - `test_evals_answer_target` phụ thuộc `dev.db`: `roadmap-rag-assistant/tests/` (tìm file chứa test này và ghi đường dẫn đúng)
    - Pilot Next.js (PROPOSED): `.handoff/specs/PLAN-nextjs-topic-pilot.md`
    - Ratchet router và flow eval router: `.handoff/specs/TASK-router-stress-001.md`
    - Migration slug Turso trước khi deploy `de51a44`: `scripts/migrate-roadmap-item-slugs.ts`
  - `AGENTS.md` mục "📌 Việc đang mở": thay câu hiện tại bằng "Không ghi ở đây. Chỉ mục: `.handoff/BACKLOG.md`."
- [x] **Step 7 — Tự kiểm**:
  - `grep -n "78 lỗi" .agents/skills/verify-ci/SKILL.md` không ra kết quả.
  - `wc -l AGENTS.md` ≤ 111.
  - Chạy đủ gate.

## 4. Verification Gate Results
<!-- Executor điền: PENDING | PASSED | FAILED | SKIPPED -->
- [x] `Agents Sync`: PASSED
- [x] `Intel Status`: PASSED (92 ref)
- [x] `Lint Proof`: PASSED. Với `HEAD` thì không có lỗi (de51a44 đã sửa `use-roadmap.ts`); chạy với `main:` thì in đúng 1 lỗi `set-state-in-effect`, nên lệnh hoạt động. Gate trong spec ghi `HEAD` là sai mốc.
- [x] `Boundary Check`: PASSED (6 file, 0 vi phạm)

## 5. Execution Audit Log
<!-- Executor điền. Không commit: Dev commit sau khi Claude verify -->
- **Result file**: `.handoff/runs/TASK-agent-workflow-001/result.json`
- **Executor**: Claude (Owner yêu cầu), nhánh `chore/agent-workflow` từ `feat/topic-url-migration`.
- **Dòng BACKLOG bị bỏ**:
  - `test_evals_answer_target` phụ thuộc `dev.db`: không còn test nào tên này trong `roadmap-rag-assistant/` (grep 2026-11-15).
  - Lỗi 2 và lỗi 8 của `tests/manual/assistant-sections.md`: đều đã ghi "Đã sửa ở `TASK-abot-bugs-001`" kèm test.
  - `docs/abot-next-actions-plan.md` mục 5 (lỗi 2, đã sửa) và mục 9 (cả hai test fail đã hết): không đưa vào. File này là read-only trong task nên không sửa.
- **Thêm ngoài danh sách gợi ý** (đã kiểm còn mở): mục 6, 7, 8 của `docs/abot-next-actions-plan.md`. Mục 8: Langfuse legacy API bị gỡ ngày 2026-11-16, `lib/ai/langfuse.ts:134` vẫn gọi.
- **Ngoài checklist nhưng cùng mục tiêu Step 4**: dòng Python ở `verify-ci/SKILL.md:26` cũng đổi sang `.venv/bin/python`.
- **Modified Files**:
  - `AGENTS.md` (dòng 13, mục Việc đang mở), `.handoff/BACKLOG.md` (mới)
  - `.handoff/specs/TEMPLATE-TASK.md`, `.agents/skills/agent-handoff/references/architect.md`, `.agents/skills/agent-handoff/references/executor.md`, `.agents/skills/verify-ci/SKILL.md`
- **Bài học**:
  - 3 trong 8 việc "đang mở" đã xong từ lâu mà nơi ghi không được cập nhật. Phải kiểm từng con trỏ trước khi dùng, không chỉ kiểm file có tồn tại.
  - Gate dùng để chứng minh lỗi cũ phải trỏ vào mốc còn lỗi (`main:`), không trỏ `HEAD`.
  - `docs/abot-next-actions-plan.md` mục 5 và 9 đã cũ: đề xuất đánh dấu là đã xong.
