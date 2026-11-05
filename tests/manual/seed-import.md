# Kịch bản kiểm thử: Nhập bài seed vào topic AI Architecture (`seed-import`)

Phạm vi: Nhập toàn bộ 109 bài trong `INITIAL_ROADMAP_DATA` vào topic `ai-architecture` với trạng thái `target` ("Mục tiêu"), backup dữ liệu, đảm bảo tính idempotent và kích hoạt reindex cho Abot.

## Chuẩn bị

1. Đảm bảo file `.env.local` có cấu hình `TURSO_DATABASE_URL` và `TURSO_AUTH_TOKEN`.
2. Kiểm tra branch hiện tại và đối chiếu kết quả dry-run do Executor thực hiện trước khi chạy.
3. Server web `yarn dev` (cổng 3334) và RAG service `yarn rag:dev` (cổng 8000).

## Các bước thực hiện và kiểm tra

| # | Thao tác | Kết quả mong đợi |
|---|---|---|
| 1 | Chạy `yarn db:import-seed` (không `--apply`) | In ra kế hoạch dry-run: target `turso`, topic `ai-architecture`, 109 bài sẽ thêm theo 15 sections, 0 bài bị bỏ qua, và 5 bài đầu tiên. Không có dữ liệu nào bị thay đổi. |
| 2 | Chạy `yarn db:import-seed --apply` (do Owner chạy) | Tạo file backup `seed-import-backup-<timestamp>.json`. Ghi thành công 109 bài trong một transaction. Gửi yêu cầu reindex cho Abot (`Abot reindex triggered successfully` hoặc thông báo tự làm mới sau 30s). |
| 3 | Mở trình duyệt vào `http://localhost:3334/?topic=ai-architecture` (với tài khoản Owner) | Thấy 109 bài học xuất hiện theo đúng 15 sections và thứ tự tuần tự. Mỗi bài đều hiển thị badge "Mục tiêu" (`target`) theo ADR-0010. |
| 4 | Chạy lại `yarn db:import-seed --apply` lần thứ hai | In ra `target: turso`, `Skipped (already exist): 109`, và `Nothing to do.`. Không tạo thêm bài mới, không ghi đè bài cũ. |
| 5 | Mở khung chat Abot và hỏi: `tôi nên học gì tiếp` | Abot đọc được các bài có trạng thái `target` từ kho tri thức và đưa ra gợi ý lộ trình học tập (yêu cầu sau khi `TASK-lesson-status-002` được merge). |

## Ghi kết quả

- **Lần chạy thử nghiệm local**: 2026-11-05 trên `prisma/dev.db`.
  - Dry-run: 109 bài cần thêm, 0 bài bỏ qua -> `Pass`.
  - Apply local: backup được tạo, 109 bài được ghi thành công với trạng thái `target` -> `Pass`.
  - Chạy lại lần 2: `Skipped (already exist): 109`, `Nothing to do.` -> `Pass`.
- **Lần chạy dry-run Turso**: 2026-11-05 bởi Executor.
  - Kết quả: `target: turso (dry-run)`, 109 bài cần thêm theo 15 sections, 0 bài bỏ qua -> `Pass`.
- **Thực thi trên Turso production**: Chờ Owner tự chạy `--apply` theo SOP sau khi review code.
