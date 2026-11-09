# Kịch bản kiểm thử: Agent Handoff v3 (Claude Code ↔ Antigravity)

Phạm vi: luồng Claude sinh prompt → Dev dán cho Executor → Executor ghi `result.json` → Claude được báo lại, verify và báo cáo. Gồm 3 script (`baseline.sh`, `check-boundary.sh`, `wait-result.sh`) và quy trình trong `.agents/skills/agent-handoff/`.

## Chuẩn bị

1. Spec thử trong `.handoff/specs/` (xoá sau khi test). Ví dụ `TASK-selftest-000` với `allowed_to_modify`: `scratch-selftest/ok/**`, `strictly_forbidden`: `package.json`.
2. Case E1–E4 cần Antigravity thật, mở phiên mới ở repo này.

## Các bước thực hiện và kiểm tra

| # | Case | Thao tác | Kết quả mong đợi | Kết quả |
|---|---|---|---|---|
| S1 | `baseline.sh` ghi mốc | Chạy với working tree đang có thay đổi chưa commit | `baseline.txt` có `HEAD`, `BRANCH`, và một dòng `FILE <hash> <path>` cho mỗi file đang dirty | `Pass` |
| S2 | `check-boundary.sh` phân loại | Tạo file trong/ngoài `allowed_to_modify` và một file `strictly_forbidden` | `OK` / `OUT_OF_SCOPE` / `FORBIDDEN` đúng; exit 1; thay đổi cũ của Dev không bị tính | `Pass` |
| S3 | Hoàn tác sửa file đã dirty từ trước | Sửa rồi khôi phục đúng nội dung một file có trong baseline | Hash trùng baseline nên không hiện trong kết quả | `Pass` |
| S4 | `wait-result.sh` | Chạy khi chưa có `result.json`, rồi tạo `result.json` | Lần 1 in `TIMEOUT`, lần 2 in `RESULT COMPLETED <path>` | `Pass` |
| S5 | `wait-result.sh` khi spec đóng mà thiếu result | Đặt `status: COMPLETED` trong spec, không tạo `result.json` | Sau 60 giây in `SPEC_TERMINAL COMPLETED` | `Pass` (repo git tạm, 2026-11-09) |
| S6 | `STALLED` | Spec `IN_PROGRESS`, không đổi file nào quá `stall` giây; thêm biến thể spec `READY`; thêm biến thể có ghi file rồi dừng | `STALLED` đúng sau `stall` giây tính từ lần đổi cuối; spec `READY` thì không báo STALLED (chỉ `TIMEOUT`) | `Pass` (repo git tạm, tham số rút ngắn; chưa thử với Executor thật) |
| S7 | `clean.sh` | Repo git tạm có task `COMPLETED` đã commit, `COMPLETED` chưa commit, `ABORTED` cũ và mới, `ESCALATED`, `IN_PROGRESS`, thiếu spec, lock mồ côi; chạy dry-run, `--apply`, `--apply --remove-lock`, `--force-uncommitted`, tham số sai | Dry-run không đổi gì; chỉ xoá đúng task đủ điều kiện; `ESCALATED` giữ và in danh sách file; lock mồ côi chỉ xoá khi có `--remove-lock`; spec không bao giờ bị đụng | `Pass` (repo git tạm, 9 trường hợp; trên repo thật mới chạy dry-run: giữ cả 5 task vì spec chưa commit) |
| E1 | Executor `implement` đúng boundary | Dán prompt cho Antigravity với task nhỏ (thêm một file trong `allowed_to_modify`) | Ghi `result.json` `COMPLETED` (tmp → mv), không commit (`git log` không đổi), watcher thoát, Claude gọi lại được | `Pass` (task lớn hơn: `TASK-agent-adapter-001`, lần chạy 3) |
| E2 | Claude verify độc lập | Sau E1, Claude chạy `check-boundary.sh` và gate | Report có bảng "Executor báo / Claude chạy lại", next action rõ | `Pass` (task `review` và `implement` có gate code, lần chạy 2 và 3) |
| E3 | Executor `review` | Giao một spec `type: review` | Không file nào bị sửa (`check-boundary.sh` sạch), có `review.md` kèm nguồn cho từng kết luận | `Pass` |
| E4 | Vi phạm boundary | Giao task mà bước cuối khiến Executor dễ sửa `package.json` | Executor hoàn tác phần vi phạm trước khi `COMPLETED`; hoặc Claude bắt được `FORBIDDEN` và đánh FAIL | `Chưa chạy` |
| E5 | Circuit breaker | Giao task có gate không thể pass | `ESCALATED` sau `max_attempts`; chỉ file của Executor bị `git restore`; thay đổi của Dev còn nguyên; có `ESC-<task_id>.md` | `Chưa chạy` |
| E6 | Lock cũ của task khác | Tạo `.handoff/runs/.lock` giả với `task_id` khác và `started_at` cách đây hơn 4 giờ, rồi giao một task bất kỳ | Executor không xoá/ghi đè lock; ghi `result.json` `ABORTED` kèm nội dung lock; hỏi Dev trong chat. Claude hỏi Dev trước khi xoá lock | `Chưa chạy` |
| E7 | `continues_dirty` | Giao một task mà `allowed_to_modify` có file đang dirty từ phase trước, file đó nằm trong `continues_dirty` | Executor không `ABORTED`; chỉ phần Executor đổi thêm hiện trong `check-boundary.sh`. Bỏ file khỏi `continues_dirty` thì `ABORTED` | `Pass` (lần chạy 4, `TASK-agent-adapter-002`; chưa thử nhánh bỏ file khỏi `continues_dirty`) |
| E8 | `clean.sh --apply` trên repo thật | Sau khi Dev commit một plan, chạy `clean.sh`, Dev duyệt, chạy `--apply` | Chỉ thư mục `runs/` của task đã commit bị xoá; spec và code còn nguyên | `Chưa chạy` |

## Ghi kết quả

Lưu ý: spec của hai task thử `TASK-handoff-v3-review-001` (lần chạy 2) và `TASK-handoff-v3-implement-001` (mock E1, chưa chạy lần nào) đã xoá sau khi chốt (2026-11-09). Kết quả của lần chạy 2 giữ ở đây.

- **Lần chạy 6**: 2026-11-09, `TASK-agent-adapter-004` (`type: review`, thử hook trên Antigravity thật), Executor: Antigravity trong phiên mới. Chưa commit, @ `5a75dce`.
  - E3 lại `Pass` trong điều kiện có hook `guard-generated` đang chạy: Executor ghi `result.json` và `review.md` bằng `write_file` mà không bị chặn nhầm; `check-boundary.sh` `changed=1 violations=0` (chỉ spec); hash 4 file sinh không đổi; `baseline.txt` không bị sửa.
  - Watcher STALLED không báo nhầm (Executor làm khoảng 9 phút). Mọi kết luận trong `review.md` đối chiếu được với `stdin-antigravity.jsonl` (7 dòng).
  - Cách giao việc cho phép Executor tự ghi log và đối chứng (cờ `ENABLED` trong `runs/`) hoạt động như thiết kế.

- **Lần chạy 5**: 2026-11-09, `TASK-agent-adapter-003` (`type: implement`, AgentAdapter Phase 3, hook), Executor: Antigravity. Chưa commit, @ `5a75dce`.
  - E1, E2, E7 lại `Pass` với một task có thêm file JS/TS, hook và `merge-key`: 19 file đổi, 0 vi phạm, `baseline.txt` không bị sửa, gate chạy lại (do subagent `verifier`) khớp báo cáo: tsc, eslint, `agents:sync --check` pass, `yarn test` 877 pass.
  - Lệch: Step 1 của spec (ghi stdin thật của Antigravity) không được báo trong `notes` và không còn file capture; chưa rõ có làm hay không.
  - `clean.sh` được thêm vào sau lần chạy này (S7, E8).

- **Lần chạy 4**: 2026-11-09, task `TASK-agent-adapter-002` (`type: implement`, AgentAdapter Phase 2), Executor: Antigravity. Chưa commit, @ `5a75dce`.
  - **E7 Pass**: 12 file dirty từ Phase 1 (+3 file bổ sung sau khi kiểm) nằm trong `continues_dirty`; Executor không `ABORTED`, `check-boundary.sh` chỉ tính phần đổi thêm (19 file, 0 vi phạm). `baseline.txt` không bị sửa (quy tắc 6 được tuân thủ).
  - Watcher có STALLED chạy xuyên suốt, không báo nhầm (Executor làm khoảng 6 phút). Lần đầu viết spec còn thiếu 3 file trong `continues_dirty` (Executor sẽ bị dừng oan); đã thêm bước kiểm tự động trước khi giao (`architect.md` mục 7).
  - Claude giao việc chạy lại gate cho subagent `verifier` (do chính Phase 2 sinh ra): tsc, eslint, `agents:sync --check` pass; `yarn test` báo 1 fail do test thời gian (`m1-challenger-stress`, 342ms > 250ms) khi máy đang bận; chạy lại riêng và chạy lại toàn bộ khi máy rảnh đều pass (76 file, 857 pass, 8 skipped). Report của `verifier` đúng định dạng, không sửa file nào.
  - Lệch nhỏ: `result.json` không liệt kê `cli.ts` dù file này đã đổi (chỉ đổi định dạng quote do prettier); `check-boundary.sh` vẫn bắt được.

- **Lần chạy 3**: 2026-11-09, task `TASK-agent-adapter-001` (`type: implement`, AgentAdapter Phase 1), Executor: Antigravity. Chưa commit, @ `5a75dce`.
  - **E1 Pass (task lớn hơn kịch bản)**: Antigravity làm 21 file trong đúng `allowed_to_modify`, ghi `result.json` `COMPLETED`, không commit (`git log` vẫn `5a75dce`), watcher thoát và Claude được gọi lại.
  - **E2 Pass (đủ)**: Claude chạy lại tsc, eslint (thư mục mới), `yarn test` (842 pass), `agents:sync --check`, `check-boundary.sh`; thêm các thử phá (sửa tay file sinh, symlink treo, thiếu symlink, nguồn sai cú pháp). Kết quả khớp báo cáo.
  - **Lệch quy trình**: Executor sửa `baseline.txt` để thêm một spec lạ do Dev tạo giữa chừng. Đã thêm quy tắc 6 vào `executor.md`. **E4, E5, E6, E7 chưa chạy.**
  - Phát hiện khi giao Phase 2: spec phase sau phải sửa file phase trước chưa commit mà quy tắc "file dirty thì `ABORTED`" chặn lại, nên thêm `boundaries.continues_dirty` (case E7).

- **Lần chạy 1**: 2026-11-09 @ `5a75dce` (kèm thay đổi chưa commit của `agent-handoff` v3)
  - Môi trường: macOS, bash 3.2, repo đang có 41 file dirty tại thời điểm baseline; spec thử `TASK-selftest-000` và thư mục `scratch-selftest/` đã xoá sau khi chạy.
  - S1–S4: chạy trực tiếp, đúng kỳ vọng. S3 kiểm bằng `git hash-object app/page.tsx` trùng hash trong baseline.
  - S5, E1–E5: chưa chạy (cần Antigravity thật hoặc chờ 60 giây).
- **Lần chạy 2**: 2026-11-09 @ `5a75dce` (kèm thay đổi chưa commit), task `TASK-handoff-v3-review-001` (`type: review`), Executor: Antigravity.
  - Môi trường: macOS, bash 3.2, branch `main`, watcher `wait-result.sh` chạy nền trong phiên Claude Code.
  - **E3 Pass**: Antigravity ghi `result.json` (`COMPLETED`) và `review.md`, xoá `probe.json` và `.lock`. Claude chạy lại `check-boundary.sh`: `changed=1 violations=0` (chỉ file spec). `git log` vẫn ở `5a75dce`, không có commit mới; stash duy nhất là `On main: sss` từ 2026-09-26, có từ trước.
  - **E2 Pass (một phần)**: watcher thoát với `RESULT COMPLETED` và Claude được gọi lại tự động; verify độc lập đúng quy trình. Chưa có gate `type_check/lint/test` để đối chiếu vì là task `review`.
  - **E1 chưa chạy**: chưa giao task `implement`. **S5, E4, E5**: chưa chạy.
  - Phát hiện từ `review.md` (đã đối chiếu với file thật): 4 điểm đúng, cần sửa tài liệu (mâu thuẫn "không sửa file" với việc cập nhật spec, tiêu đề mục 3 `executor.md`, hướng dẫn `write` + `mv`, quy ước trường `gate` của `review`); 1 điểm đúng nhưng nên hạ mức (race `SPEC_TERMINAL`, thứ tự bước hiện đã an toàn); 1 điểm đúng, cần thiết kế (lock thiếu cách xử lý lock cũ). Đã sửa F1, F2, F3, F5, F6 trong `executor.md`, `SKILL.md`, `TEMPLATE-TASK.md`, `architect.md` và RFC (2026-11-09, chưa chạy lại với Antigravity). F4 (lock cũ) sửa theo lựa chọn của Owner: lock của task khác cũ hơn 4 giờ thì Executor `ABORTED` và hỏi Dev, không tự ghi đè (case E6 bên dưới, chưa chạy).
