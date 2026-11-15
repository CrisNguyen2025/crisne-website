# Architect SOP (Claude Code)

Dùng khi một plan đã được Dev duyệt và cần giao cho Executor (Antigravity/Codex). Dev dán prompt cho Executor, Claude chờ tín hiệu xong rồi verify và báo cáo. Mọi script nằm ở `.agents/skills/agent-handoff/scripts/`.

```
Claude: spec → baseline → in PROMPT ──→ Dev dán ──→ Executor làm, ghi result.json
Claude: watcher chạy nền ◀─────────────────────────────┘ (watcher thoát → Claude được gọi lại)
Claude: verify độc lập → REPORT → NEXT ACTION
```

## 1. Viết spec

- **Mỗi spec một nhánh riêng**, tạo trước khi chạy `baseline.sh`. Nhánh gốc là `main`; nếu spec phụ thuộc commit chưa merge thì ghi rõ nhánh gốc trong mục Context của spec.
- Copy `.handoff/specs/TEMPLATE-TASK.md` thành `.handoff/specs/TASK-<branch-slug>-<id>.md`, `status: "READY"`, `current_attempt: 0`.
- Việc cần làm ngoài repo sau khi merge (migration DB, biến môi trường, reindex) ghi vào `deploy_steps`.
- Ánh xạ plan → spec theo `.claude/skills/think/references/task-spec.md` (nếu máy có skill `think`), nếu không thì theo bảng trong RFC mục 3.
- `type: "implement"` cho việc sửa code; `type: "review"` cho việc chỉ kiểm tra và báo cáo (Executor không sửa file nào trừ chính file spec).
- Trước khi viết: chạy `yarn intel how-to-sync "<target>"` (kết quả khớp theo keyword, chỉ là bước lọc sơ bộ). Flow `FLOW_*` mà task thật sự đụng tới thì ghi vào mục Dependencies.
- `allowed_to_modify` lấy từ `gitnexus_impact` / danh sách file của plan. `verification_gate` dùng script có thật trong `package.json` và các lệnh ở mục Commands của `AGENTS.md`, luôn có `intel_status: "yarn intel status"`.
- `fast_gate` chọn lệnh nhanh và đúng phạm vi file sửa (ví dụ `type_check`, `boundary_check`, một test file cụ thể). Test toàn bộ (`yarn test`, `pytest -q`) để ngoài `fast_gate`.
- Spec được commit cùng code của task (cùng nhánh). Spec chưa commit thì không được gỡ worktree hay xoá nhánh.

## 2. Baseline và prompt

```bash
bash .agents/skills/agent-handoff/scripts/baseline.sh <task_id>
```

Lệnh này ghi HEAD và danh sách file đang dirty (kèm hash) vào `.handoff/runs/<task_id>/baseline.txt`. Có nó thì `check-boundary.sh` mới phân biệt được thay đổi của Dev với thay đổi của Executor. Chạy **trên đúng nhánh của spec, sau khi spec đã xong và trước khi Dev giao việc**; không sửa file nào trong `allowed_to_modify` giữa hai thời điểm đó.

**Mặc định: Claude tự giao qua CLI**, chạy nền (Bash `run_in_background`) từ thư mục repo, đúng nhánh của spec:

```bash
agy -p "/executor <task_id>" --model gemini-3.8-flash-high --mode auto --print-timeout 3600s --output-format json --log-file <scratchpad>/agy-<task_id>.log
```

Luôn truyền `--model` (mặc định `gemini-3.8-flash-high`, tức Gemini 3.8 Flash (High)) để không phụ thuộc model đang chọn trong IDE. Xem model khác bằng `agy models`. Lệnh thoát thì sang mục 4, không cần watcher. Trong lúc agy chạy, không sửa file nào trong working tree (kể cả spec khác), nếu không `check-boundary.sh` sẽ báo `OUT_OF_SCOPE`.

**Dự phòng khi CLI lỗi:** báo Dev mở Antigravity ở đúng thư mục repo, đúng nhánh của spec, rồi gõ:

```text
/executor
```

Skill `executor` tự tìm spec theo nhánh hiện tại. Nhiều spec cùng nhánh thì dùng `/executor <task_id>`.

**Dự phòng** (khi `/executor` không chạy): in prompt cho Dev trong một khối `text` để copy:

```text
Dùng skill agent-handoff, vai Executor. Thực thi `.handoff/specs/<task_id>.md`.
Kết thúc ở bất kỳ trạng thái nào cũng phải ghi `.handoff/runs/<task_id>/result.json`
theo references/executor.md mục 6. Không commit.
Xong thì nhắc Dev: gõ "verify <task_id>" cho Claude.
```

Với task `review`, thêm một dòng: `Task này chỉ đọc và báo cáo, ghi kết quả vào .handoff/runs/<task_id>/review.md.`

## 3. Chờ chạy nền

Ngay sau khi in prompt, chạy bằng Bash `run_in_background` (không poll, không `sleep` trong vòng lặp của chính bạn):

```bash
bash .agents/skills/agent-handoff/scripts/wait-result.sh <task_id> 14400 5 1800
```

Tham số: `timeout` 14400 giây (4 giờ), chu kỳ 5 giây, `stall` 1800 giây. Báo Dev một dòng: watcher đã bật, tối đa 4 giờ, báo sớm nếu 30 phút không có file nào đổi sau khi Executor bắt đầu, dán prompt lúc nào cũng được (đồng hồ stall chỉ chạy khi spec đã `IN_PROGRESS`). Khi watcher thoát bạn được gọi lại với một trong các dòng:

| Dòng | Làm gì |
|---|---|
| `RESULT <status> <path>` | Sang mục 4 |
| `SPEC_TERMINAL <status> (không có result.json)` | Executor đã đóng spec nhưng quên ghi kết quả. Verify bằng diff và gate như mục 4, ghi vào report: "thiếu result.json" |
| `STALLED 1800s (...)` | Spec đã `IN_PROGRESS` mà 30 phút không có file nào đổi. Chạy `check-boundary.sh` xem phần đã làm, rồi hỏi Dev: Executor có đang chạy lệnh lâu không (chờ tiếp: bật lại watcher), hay đã treo (verify phần dở hoặc huỷ). Có thể báo nhầm khi Executor chạy test/tsc rất lâu mà chưa ghi file |
| `TIMEOUT` | Hỏi Dev: Executor còn chạy không? Chờ tiếp (bật lại watcher) hay huỷ |

Watcher chỉ sống khi phiên Claude còn mở. Nếu phiên đã đóng, Dev gõ "verify `<task_id>`" thì bắt đầu từ mục 4.

## 4. Verify độc lập

Sau mỗi lần verify, cập nhật dòng **Trạng thái hiện tại** ở đầu spec, để sau khi context bị nén chỉ cần đọc lại spec.

**Không tin `result.json`.** Đọc nó để biết Executor nói gì, rồi tự kiểm:

1. **Boundary:** `bash .agents/skills/agent-handoff/scripts/check-boundary.sh <task_id>`. `FORBIDDEN`/`OUT_OF_SCOPE` là lỗi. `WARN ... commit` nghĩa là Executor đã commit trái quy ước.
2. **Gate:** chạy lại từng lệnh trong `verification_gate`. Khi máy có subagent `verifier` thì giao cho nó để log dài không vào context chính.
3. **Checklist:** đối chiếu từng bước mục 3 của spec với diff (`git diff` theo danh sách file của `check-boundary`). Bước nào đánh `[x]` mà không có thay đổi tương ứng thì ghi nhận.
4. **Rule dự án:** đọc diff theo `AGENTS.md` (naming, không `any`, format giá trị optional, không `console.log`, không import server-only vào client). Chạy `gitnexus_detect_changes()` nếu GitNexus sẵn sàng.
5. `type: review`: đọc `review.md`, kiểm bằng chứng của các kết luận quan trọng nhất (mở nguồn được trích, chạy lại lệnh nếu có thể) trước khi dùng chúng.
6. `ESCALATED`: đọc `ESC-<task_id>.md`, trả lời câu hỏi kiến trúc trước khi nghĩ đến giao lại.

## 5. Report

```markdown
## Report: <task_id> — PASS | PARTIAL | FAIL

| Kiểm tra | Executor báo | Claude chạy lại |
|---|---|---|
| type_check | PASSED | PASSED |
| ... | | |

- **Boundary:** sạch | <danh sách vi phạm>
- **Checklist:** <x>/<n> bước; bước lệch: ...
- **Findings:** [bug|risk|nit] `file:line` mô tả ngắn
- **Chưa verify được:** ... (nếu có)
```

PASS chỉ khi boundary sạch, mọi gate Claude chạy lại đều pass, checklist đủ, không có finding loại bug.

- Spec có `deploy_steps` thì report và nội dung PR phải liệt kê đủ.
- Khi PASS, Claude ghi tối đa 3 dòng **Bài học** vào mục 5 của spec. Bài học nào đáng thành rule thì đề xuất sửa `AGENTS.md`/skill trong mục 6, không tự sửa.

## 6. Next action

Chọn **một** đề xuất chính và nêu lý do ngắn; kèm nút qua `wrap_up`:

| Tình huống | Đề xuất |
|---|---|
| PASS, còn phase sau | Giao phase kế tiếp (quay về mục 1). Chưa commit: theo rule, xong cả plan rồi mới đề xuất commit |
| PASS, hết plan | Đề xuất Dev commit, gồm cả spec (Claude không tự commit). Trước khi đề xuất push/PR, chạy `gh auth status`; chưa đăng nhập thì báo Dev chạy `gh auth login` |
| PARTIAL/FAIL, lỗi nhỏ rõ ràng | Claude sửa ngay tại đây, hoặc sinh prompt sửa lần 2 |
| PARTIAL/FAIL, nhiều lỗi hoặc cần chạy dài | Sinh prompt sửa lần 2 cho Executor |
| ESCALATED | Trả lời câu hỏi kiến trúc, rồi sinh prompt giao lại |
| ABORTED vì lock cũ | Cho Dev xem nội dung `.handoff/runs/.lock` và hỏi có xoá không. Chỉ xoá khi Dev đồng ý trong chat, rồi chạy lại `baseline.sh` và sinh prompt giao lại |

**Prompt sửa lần 2:** cùng `task_id`, đặt `current_attempt` = lần trước + 1 trong spec, chạy lại `baseline.sh` (result cũ tự được lưu thành `result.<thời gian>.json`), rồi báo Dev gõ `/executor <task_id>` kèm danh sách lỗi bên dưới. Dự phòng là prompt đầy đủ:

```text
Dùng skill agent-handoff, vai Executor. Tiếp tục `.handoff/specs/<task_id>.md` (lần <n>).
Claude verify lần trước còn các lỗi sau, chỉ sửa đúng các mục này:
1. <file:line — lỗi — cách kiểm>
2. ...
Kết thúc ghi lại `.handoff/runs/<task_id>/result.json`. Không commit.
Xong thì nhắc Dev: gõ "verify <task_id>" cho Claude.
```

## 7. Nhiều phase và nhiều task

- **Phase sau sửa file mà phase trước đã tạo (chưa commit):** theo rule dự án, plan nhiều phase thì xong hết mới commit. Spec phase sau liệt kê chính các file đó trong `boundaries.continues_dirty` (và cả trong `allowed_to_modify`). Chỉ đưa vào file phase trước đã được verify. `continues_dirty` phải liệt kê **mọi** file đang dirty mà khớp `allowed_to_modify`, kể cả file phase này không định sửa (Executor dừng nếu thấy một file dirty khớp `allowed_to_modify` mà không có trong danh sách). Kiểm trước khi giao: các dòng `FILE` trong `baseline.txt` khớp `allowed_to_modify` đều phải có trong `continues_dirty`. Chạy `baseline.sh` ngay trước khi giao phase sau, để phần phase trước đã làm thành mốc.
- **Một Executor mỗi lần.** Working tree dùng chung, nên hai task chạy cùng lúc sẽ thấy file của nhau là vi phạm; `.handoff/runs/.lock` cũng chặn task thứ hai. Task nào còn `READY` mà baseline cũ hơn thay đổi của task trước thì chạy lại `baseline.sh` trước khi giao.
- **Không sửa tài liệu handoff (`.agents/skills/agent-handoff/**`, `.handoff/specs/TEMPLATE-TASK.md`) khi một Executor đang chạy:** nếu file đó nằm ngoài `allowed_to_modify` của task, thay đổi sẽ bị tính là vi phạm.

## 8. Dọn dẹp sau khi commit

`.handoff/runs/<task_id>/` (baseline, result, review, file thử) chỉ là bằng chứng tạm; kết quả bền vững nằm ở `tests/manual/*.md` và git. Spec trong `.handoff/specs/` là lịch sử, không dọn.

- **Khi nào:** sau khi Dev commit xong một plan (hoặc khi Dev nói "dọn handoff"). Không dọn khi một Executor đang chạy.
- **Cách làm:** chạy `bash .agents/skills/agent-handoff/scripts/clean.sh` (mặc định chỉ liệt kê), cho Dev xem danh sách, và **chỉ chạy `--apply` khi Dev đồng ý trong chat**. Script chỉ xoá `runs/TASK-*/` của task `COMPLETED`/`DONE` mà spec đã commit và sạch, hoặc `ABORTED` quá 7 ngày. `ESCALATED` luôn giữ và in danh sách file Executor đã đổi hoặc tạo để Dev quyết.
- **Trước khi gỡ worktree hoặc xoá nhánh:** `git -C <worktree> status --porcelain` phải trống; file untracked (spec, plan) phải được commit hoặc backup trước.
- **Lock:** `.handoff/runs/.lock` mồ côi chỉ báo, không xoá. Xoá bằng `--apply --remove-lock` sau khi Dev đồng ý (cùng quy tắc với `ABORTED` vì lock cũ ở mục 6).
- **Spec của lần chạy thử** (ví dụ task mock để thử luồng) là sản phẩm của bài thử, không phải lịch sử của sản phẩm: hỏi Dev giữ làm ví dụ hay xoá khi commit.
