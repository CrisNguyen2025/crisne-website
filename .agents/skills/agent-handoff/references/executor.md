# Executor SOP (Antigravity / Codex)

Bạn nhận task từ Claude Code (Architect) qua spec `.handoff/specs/<task_id>.md`. Dev dán prompt có `task_id` cho bạn. Dưới đây là toàn bộ quy trình. Rule dự án (ngôn ngữ, naming, không `any`, i18n, ...) lấy từ `AGENTS.md`, không chép lại ở đây.

## Quy tắc không thương lượng

1. **Không commit, không push.** Claude verify trên diff chưa commit, Dev tự commit.
2. **Luôn ghi `result.json`** khi kết thúc, ở bất kỳ trạng thái nào (`COMPLETED`, `ESCALATED`, `ABORTED`). Không có file này thì Claude không biết bạn đã xong.
3. **Chỉ sửa file trong `allowed_to_modify`**, cộng với chính file spec của task (chỉ frontmatter `status`/`current_attempt`, đánh `[x]` checklist, điền mục 4 và 5). Không đụng `strictly_forbidden`. Không thêm dependency.
4. **Không bao giờ chạy `git restore .`, `git reset --hard`, `git clean`.** Working tree có thay đổi chưa commit của Dev. Rollback chỉ theo mục 5.
5. Đừng sửa phần "Verification Gate Results" để che lỗi: ghi đúng kết quả lệnh thật.
6. **Không sửa `baseline.txt`** (do Claude giữ). Nếu `check-boundary.sh` báo một file mà bạn chắc chắn không phải của mình (ví dụ Dev tạo file mới trong lúc bạn làm), đừng thêm nó vào baseline: để nguyên kết quả, ghi tên file và lý do bạn nghĩ nó không phải của bạn vào `notes` của `result.json`, và đánh `boundary_check` là `FAILED`. Claude sẽ phân xử khi verify.

## 1. Preflight

1. Đọc spec. Xác định `type`: `implement` (mặc định nếu thiếu) hoặc `review`.
2. `git branch --show-current` phải khớp `branch` trong frontmatter. Lệch thì `ABORTED`, lý do ghi vào `notes`.
3. Đọc `.handoff/runs/<task_id>/baseline.txt` (Claude tạo lúc giao). Không có thì chạy `bash .agents/skills/agent-handoff/scripts/baseline.sh <task_id>` và ghi chú trong `notes`.
4. Nếu file nào trong `allowed_to_modify` đã có dòng `FILE` trong baseline (Dev đang sửa dở) thì dừng, `ABORTED`, liệt kê file đó. Đừng sửa chồng lên. **Ngoại lệ:** file có trong `boundaries.continues_dirty` của spec. Đó là kết quả phase trước đã được Claude verify nhưng chưa commit, bạn được sửa tiếp; `check-boundary.sh` vẫn so với baseline nên chỉ tính phần bạn đổi thêm.
5. Lock `.handoff/runs/.lock` (`{"task_id": "...", "started_at": "..."}`):
   - Chưa có: tạo mới.
   - Có và `task_id` trùng task này (phiên trước của chính task chết giữa chừng, hoặc chạy lại): ghi đè, ghi chú trong `notes`.
   - Có của task khác (mới hơn 4 giờ, hoặc `started_at` không đọc được): `ABORTED`, `notes` nêu task đang giữ lock.
   - Có của task khác và cũ hơn 4 giờ: có thể là lock mồ côi nhưng bạn không phân biệt được với phiên khác còn chạy. **Không xoá, không ghi đè.** Ghi `result.json` `ABORTED` với `notes` chứa nội dung lock và số giờ đã qua, rồi báo Dev trong chat: "Lock của `<task_id khác>` đã `<n>` giờ. Xoá `.handoff/runs/.lock` rồi giao lại?" Dừng, chờ Dev.
6. Đổi frontmatter spec: `status: IN_PROGRESS`, `current_attempt: 1`.

## 2. Thực thi

- **`implement`:** làm tuần tự checklist mục 3 của spec, đánh `[x]` sau mỗi bước. Con trỏ trong spec (`path#symbol`) là chỗ bắt đầu, đọc code thật trước khi sửa.
- **`review`:** không sửa file mã nguồn hay tài liệu nào trong repo; ngoại lệ duy nhất là cập nhật trạng thái và kết quả trên chính file spec (quy tắc 3). Đọc các file được chỉ định, kiểm từng mục, ghi kết quả vào `.handoff/runs/<task_id>/review.md` (bảng kết quả + bằng chứng + đề xuất, phân loại bug / risk / nit). Bắt buộc ghi nguồn cho mọi kết luận: docs chính thức kèm link, hoặc quan sát thực tế (đã chạy gì, thấy gì).
- File thử nghiệm tạm chỉ đặt dưới `.handoff/runs/<task_id>/`, không đặt trong repo.

## 3. Verification gate

- **`implement`:** chạy lần lượt mọi lệnh trong `verification_gate` (`type_check`, `lint`, `test`, `boundary_check`).
- **`review`:** vẫn **bắt buộc** chạy `boundary_check`, để chắc chắn không có file nào bị sửa ngoài ý muốn. Các lệnh khác thường không có trong spec review; nếu có thì chạy.

Lệnh `boundary_check` thường là `bash .agents/skills/agent-handoff/scripts/check-boundary.sh <task_id>`: nó so với baseline nên không nhầm thay đổi cũ của Dev.

- Tất cả pass: sang mục 4.
- Fail: tăng `current_attempt`, tự sửa. Cùng một lỗi đến `max_attempts` (mặc định 3) vẫn fail thì sang mục 5.
- `check-boundary.sh` báo `FORBIDDEN`/`OUT_OF_SCOPE`: hoàn tác phần đó (mục 5, bước 1) rồi chạy lại. Không đánh dấu `COMPLETED` khi còn vi phạm.

## 4. Kết thúc thành công

1. Điền mục 4 (kết quả gate) và mục 5 của spec (`Modified Files`, `Result file`).
2. Ghi `result.json` (mục 6) với `status: COMPLETED`.
3. **Sau khi `result.json` đã ghi xong**, mới đổi frontmatter spec: `status: COMPLETED`. Xoá `.handoff/runs/.lock`. Thứ tự này là bắt buộc: watcher của Claude coi spec đã đóng mà chưa có `result.json` là `SPEC_TERMINAL` (sau 60 giây) và sẽ báo là thiếu kết quả nếu bạn dừng giữa hai bước.
4. Báo Dev đúng 3 dòng: task_id, trạng thái, đường dẫn `result.json`. Dừng, không tự review thêm: Claude sẽ verify.

## 5. Circuit breaker (fail ≥ `max_attempts`)

1. Chỉ hoàn tác file **do bạn sửa** và **sạch trong baseline**: `git restore -- <file>`. File Dev đang sửa dở (có trong baseline) thì không đụng, ghi vào escalation.
2. File **do bạn tạo mới**: không xoá. Liệt kê trong escalation để Claude/Dev quyết.
3. Viết `.handoff/runs/escalations/ESC-<task_id>.md`: 5 dòng log lỗi quan trọng nhất, 3 giả thuyết đã thử, 1 câu hỏi kiến trúc cụ thể cho Claude.
4. Ghi `result.json` với `status: ESCALATED` và `escalation` trỏ tới file ESC. **Sau đó** mới đổi spec `status: ESCALATED` (cùng lý do thứ tự như mục 4). Xoá lock. Dừng.

## 6. `result.json`

Ghi vào `.handoff/runs/<task_id>/result.json` **bằng cách ghi file tạm rồi đổi tên**, để watcher của Claude không đọc phải file ghi dở. Cách làm (agent thường không có tool đổi tên file):

1. Dùng tool ghi file tạo `.handoff/runs/<task_id>/result.json.tmp` với nội dung JSON đầy đủ.
2. Dùng tool chạy shell: `mv .handoff/runs/<task_id>/result.json.tmp .handoff/runs/<task_id>/result.json`.

Không ghi thẳng vào `result.json` bằng tool ghi file.

```json
{
  "task_id": "TASK-example-001",
  "type": "implement",
  "status": "COMPLETED",
  "finished_at": "2026-11-09T15:20:00+07:00",
  "attempts": 1,
  "modified_files": ["scripts/example.ts"],
  "gate": { "type_check": "PASSED", "lint": "PASSED", "test": "PASSED", "boundary_check": "PASSED" },
  "report": null,
  "escalation": null,
  "notes": "1–3 dòng: điều Claude cần biết trước khi verify"
}
```

- `status`: `COMPLETED` | `ESCALATED` | `ABORTED`.
- `gate.*`: `PASSED` | `FAILED` | `SKIPPED` (kèm lý do trong `notes` nếu `SKIPPED`).
- `type: review`: `modified_files: []`, `report` trỏ tới `review.md`. `gate` chứa kết quả của các gate có trong spec, luôn có `boundary_check` (ví dụ `"gate": { "boundary_check": "PASSED" }`). Không ghi `{}` hay `null`.
- `ABORTED`: ghi lý do ở `notes` (sai branch, file đang dirty, lock của task khác hoặc lock cũ cần Dev xác nhận, ...).
