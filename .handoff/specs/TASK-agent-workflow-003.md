---
task_id: "TASK-agent-workflow-003"
branch: "chore/agent-workflow-3" # tách từ main 671edeb
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
    - "AGENTS.md"
    - "docs/README.md"
    - ".agents/skills/cris-code-intel/scripts/cris-intel.ts"
    - ".agents/skills/cris-code-intel/SKILL.md"
    - ".handoff/specs/TEMPLATE-TASK.md"
    - ".agents/skills/agent-handoff/references/architect.md"
  continues_dirty: []
  read_only_references:
    - ".agents/skills/cris-code-intel/data/cris-workspace-map.json"
    - "docs/code-intel/CRIS_WORKSPACE_MAP.md"
    - ".agents/skills/design-doc-mermaid/**"
    - "CLAUDE.md"
  strictly_forbidden:
    - "package.json"
    - "yarn.lock"
    - "tsconfig.json"
    - ".claude/**"
    - ".agents/adapter/**"
    - "app/**"
    - "lib/**"
    - "components/**"
    - "roadmap-rag-assistant/**"

fast_gate: ["intel_status", "how_to_sync_reason", "agents_md_size", "boundary_check"]
verification_gate:
  intel_status: "yarn intel status"
  how_to_sync_reason: "yarn intel how-to-sync 'router stress baseline' | grep -q 'khớp vì'"
  agents_md_size: "test $(wc -l < AGENTS.md) -le 90"
  type_check: "yarn tsc --noEmit -p ."
  lint: "yarn eslint .agents/skills/cris-code-intel/scripts/cris-intel.ts"
  agents_sync: "yarn agents:sync --check"
  boundary_check: "bash .agents/skills/agent-handoff/scripts/check-boundary.sh TASK-agent-workflow-003"
---

# TASK: Đợt 3 cải thiện quy trình agent: gọn AGENTS.md, intel nói rõ lý do và kiểm docs, giữ spec không mất

## 1. Context & Architectural Intent
- **Goal**: Đóng các mục còn "một phần" hoặc "chưa" trong bảng cover ngày 2026-11-15:
  - **A. Out context**: gọn `AGENTS.md`; spec có dòng trạng thái ở đầu.
  - **B. Mismatch**: `how-to-sync` in lý do khớp; `intel status` kiểm thêm ref trong `docs/code-intel/*.md`.
  - **13. Sản phẩm ngoài repo**: spec phải được commit cùng code của task.
- **Why**:
  - `AGENTS.md` có 107 dòng và được nạp ở mọi lượt. Trong đó có bảng "Skills" của GitNexus (`AGENTS.md:75-87`) lặp lại description mà agent đã tự thấy trong danh sách skill, và 4 dòng con của `design-doc-mermaid` (`AGENTS.md:23-26`) chỉ cần khi vẽ sơ đồ.
  - `how-to-sync` chọn flow bằng `queryLower.includes(domainId)` hoặc bất kỳ chữ > 3 ký tự nào trong `name` của flow (`cris-intel.ts` khoảng dòng 580). Query "router stress ..." trả về `FLOW_EVALS_RUN_PROBE` chỉ vì tên flow có chữ "Router", và output không cho biết vì sao.
  - `docs/code-intel/CRIS_WORKSPACE_MAP.md` có 15 ref dạng `` `path` `` / `` `path#symbol` ``, nhưng không lệnh nào kiểm. 2 ref trong số đó (`rag_service/api/routes.py#chat_stream`, `rag_service/auth.py`) tương đối với `roadmap-rag-assistant/`, không phải gốc repo.
  - `TASK-abot-bugs-001.md` được `tests/manual/assistant-sections.md` nhắc tới nhưng chỉ nằm trong worktree, suýt mất khi gỡ worktree. Nguyên nhân: `architect.md` §1 ghi "Không commit spec".
- **Dependencies**:
  - `.agents/skills/cris-code-intel/scripts/cris-intel.ts#handleHowToSync`, `#handleStatus`, `#checkRef`, `#collectRefs`
  - `AGENTS.md` mục Skills và mục GitNexus Skills
  - `architect.md` §1, §6, §8
  - `TEMPLATE-TASK.md`

## 2. Invariants & Rules
- Rule dự án: `AGENTS.md`. Tài liệu viết tiếng Việt.
- **Gọn, không mất rule.** Mọi rule bỏ khỏi `AGENTS.md` phải còn ở đúng một nơi khác, và `AGENTS.md` trỏ tới nơi đó. Không bỏ: Commands, Safety rules, Conventions, Phạm vi hiện tại, Core docs, các mục Always Do / Never Do của GitNexus.
- Block GitNexus trong `AGENTS.md` do `gitnexus analyze` sinh ra. Giữ nguyên dòng Setup nhắc cờ `--skip-agents-md`.
- `checkRef` giữ hành vi hiện tại với ref trong map; chỉ thêm nguồn ref mới và quy tắc fallback đường dẫn.
- Lỗi hoặc test fail "có từ trước": chỉ ghi khi kèm lệnh tái hiện, commit và ngày.
- Ngoài phạm vi:
  - ADR cho quyết định "intel không vào CI, không thêm hook" (chỉ viết ADR khi Owner yêu cầu, theo `AGENTS.md`);
  - đổi thuật toán khớp của `how-to-sync` (chỉ in lý do);
  - sửa `CLAUDE.md`;
  - sửa nội dung `CRIS_WORKSPACE_MAP.md`, trừ khi `intel status` báo ref chết. Khi đó **dừng và ESCALATE**, vì file này nằm ngoài `allowed_to_modify`.

## 3. Step-by-Step Implementation Checklist
- [x] **Step 1 — Mermaid ra khỏi AGENTS.md**:
  - Chuyển 4 dòng con của `design-doc-mermaid` (`AGENTS.md:23-26`) vào `docs/README.md`, thành mục mới `## Sơ đồ Mermaid`, giữ nguyên nội dung.
  - Trong `AGENTS.md`, bullet `design-doc-mermaid` còn một dòng: khi nào dùng, kèm "Quy ước vị trí, style, validate: `docs/README.md` mục Sơ đồ Mermaid".
- [x] **Step 2 — Bỏ bảng Skills của GitNexus**:
  - Xoá mục `## Skills` (bảng 6 dòng) trong block GitNexus của `AGENTS.md`.
  - Thay bằng một dòng: "Skill `gitnexus-*` (exploring, impact-analysis, debugging, refactoring, guide, cli) nằm ở `.agents/skills/`."
- [x] **Step 3 — Đo**: `wc -l AGENTS.md` ≤ 90. Chưa đạt thì chỉ được rút gọn **câu chữ** trong mục Skills của dự án; không bỏ rule nào trong danh sách giữ ở mục 2. Ghi số dòng trước và sau vào Audit Log.
- [x] **Step 4 — how-to-sync in lý do khớp** (`cris-intel.ts#handleHowToSync`):
  - Khi lọc `matchedFlows`, giữ lại lý do: `domainId` nào hoặc những chữ nào của `name` đã khớp.
  - Mỗi flow in thêm `khớp vì: <lý do>`.
  - Dưới danh sách flow in một dòng cố định: `⚠️ Khớp theo keyword: xác nhận bằng yarn intel trace <FLOW_ID> trước khi ghi vào Dependencies.`
  - Không đổi điều kiện lọc.
- [x] **Step 5 — intel status kiểm docs** (`cris-intel.ts#handleStatus`):
  - Ngoài ref từ map, gom thêm mọi chuỗi trong backtick có dạng `path.(ts|tsx|py|prisma|json)` hoặc `path.(…)#symbol` trong `docs/code-intel/*.md`. Bỏ qua file `.md` và ref không có dấu `/`.
  - Kiểm bằng `checkRef`. Không thấy file ở gốc repo thì thử thêm tiền tố `roadmap-rag-assistant/` trước khi báo `MISSING_FILE`.
  - Lỗi từ docs in kèm tên file nguồn, ví dụ `MISSING_SYMBOL docs/code-intel/CRIS_WORKSPACE_MAP.md: <ref>`.
  - Dòng OK in hai số, ví dụ `🟢 OK: 92 ref map + N ref docs đều khớp code`.
- [x] **Step 6 — SKILL.md**: trong `.agents/skills/cris-code-intel/SKILL.md`, cập nhật mô tả lệnh `status` (kiểm cả ref trong `docs/code-intel/`) và `how-to-sync` (in lý do khớp, cần xác nhận bằng `trace`). Mỗi lệnh tối đa 1 dòng.
- [x] **Step 7 — Dòng trạng thái của spec** (`TEMPLATE-TASK.md`): ngay dưới tiêu đề `# TASK:`, thêm:
  ```markdown
  > **Trạng thái hiện tại** (cập nhật mỗi khi dừng): đang ở bước ..., đã quyết ..., đang chờ ...
  ```
  Thêm vào `architect.md` §4 một dòng: sau mỗi lần verify thì cập nhật dòng này, để sau khi context bị nén chỉ cần đọc lại spec.
- [x] **Step 8 — Spec đi cùng code** (`architect.md`):
  - §1: thay "Không commit spec. Báo Dev spec đã sẵn sàng để họ commit nếu muốn." bằng "Spec được commit cùng code của task (cùng nhánh). Chưa commit thì không được gỡ worktree hay xoá nhánh."
  - Bảng ở §6, dòng "PASS, hết plan": đề xuất commit **gồm cả spec**.
  - §8: thêm bước trước khi gỡ worktree hoặc xoá nhánh: `git -C <worktree> status --porcelain` phải trống, hoặc các file untracked phải được commit hay backup.

## 4. Verification Gate Results
<!-- Executor điền: PENDING | PASSED | FAILED | SKIPPED -->
- [x] `Intel Status`: PASSED (92 ref map + 27 ref docs)
- [x] `How-to-sync Reason`: PASSED
- [x] `AGENTS.md Size`: PASSED (90 dòng)
- [x] `TypeCheck`: PASSED
- [x] `Lint`: PASSED
- [x] `Agents Sync`: PASSED
- [x] `Boundary Check`: PASSED (7 file kể cả spec, 0 vi phạm)

## 5. Execution Audit Log
<!-- Executor điền. Không commit: Dev commit sau khi Claude verify -->
- **Result file**: `.handoff/runs/TASK-agent-workflow-003/result.json`
- **Executor**: Claude (Owner yêu cầu); watcher đã dừng.
- **AGENTS.md**: trước 107 dòng, sau 90 dòng. Bước 1–2 mới xuống 94; phải gộp 3 bullet skill ngắn (`abot-trace-report`, `agent-handoff`, `verify-ci`) thành một dòng và bỏ 2 dòng trống ở mục Skills mới đạt ≤ 90. Không bỏ rule nào.
- **Output how-to-sync "router stress baseline"**: `FLOW_EVALS_RUN_PROBE` kèm `khớp vì: tên flow chứa "router"` và dòng cảnh báo cần xác nhận bằng `trace`. Lý do này cho thấy ngay flow bị chọn chỉ vì tên có chữ "Router".
- **Kiểm âm cho `intel status`**: thêm tạm 2 ref sai vào `CRIS_WORKSPACE_MAP.md` thì báo `MISSING_FILE` và `MISSING_SYMBOL` kèm tên file nguồn, exit 1. Đã khôi phục file (git status sạch).
- **Lệch spec**: Step 6 nói cập nhật mô tả `how-to-sync` trong `cris-code-intel/SKILL.md`, nhưng file này không có dòng nào cho lệnh đó (nó thuộc skill `cris-how-to-sync`, nằm ngoài `allowed_to_modify`). Chỉ cập nhật dòng `status`.
- **Số ref docs**: 27, không phải 13 như thử nghiệm trước, vì regex trong code lấy cả `.json` và path dài hơn.
- **Modified Files**:
  - `AGENTS.md`, `docs/README.md` (mục Sơ đồ Mermaid mới)
  - `.agents/skills/cris-code-intel/scripts/cris-intel.ts` (`handleHowToSync`, `handleStatus`, `collectDocRefs`, `checkDocRef`), `.agents/skills/cris-code-intel/SKILL.md`
  - `.handoff/specs/TEMPLATE-TASK.md`, `.agents/skills/agent-handoff/references/architect.md` (§1, §4, §6, §8)
- **Bài học**:
  - Mục tiêu "≤ N dòng" cho file nạp mỗi lượt nên đặt ngay từ đầu; bỏ chữ ít khi đủ, phải gộp hoặc chuyển nội dung đi nơi khác.
  - Một check mới phải được kiểm âm (cố tình làm sai rồi xem nó bắt được không), không chỉ xem nó pass.
  - Spec nêu số liệu thử nghiệm (13 ref) thì Executor nên đo lại bằng chính code thật, vì hai cách đếm cho ra số khác nhau.
