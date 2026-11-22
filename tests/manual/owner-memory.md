# Abot — Owner Memory xuyên Thread & Nối tiếp hội thoại (ADR-0015)

Kiểm thử thủ công luồng **Owner Memory** lưu ở Turso (`/api/v1/memories`), cache invalidation tức thì (`POST /internal/memory-cache/invalidate`), Preview xác nhận 1 chạm qua chat, nối tiếp `Thread` của Owner (`/api/roadmap-assistant/thread`) và cách ly tuyệt đối với `Visitor`.

- **Tài liệu thiết kế:** `docs/adr/0015-abot-owner-memory.md`
- **Test tự động đã khoá:**
  - Python: `roadmap-rag-assistant/tests/test_owner_memory.py`, `roadmap-rag-assistant/tests/test_working_memory_fixes.py`
  - Next.js API: `tests/route/memories-route.test.ts`, `tests/route/assistant-thread-route.test.ts`, `tests/route/threads-route.test.ts`, `tests/route/rag-reindex.test.ts`
  - UI SDK: `tests/unit/owner-memory-sheet.test.tsx`

## Điều kiện trước khi chạy

1. Đã chạy migration Turso (hoặc DB local đang trỏ): `yarn db:owner-memory` (dry-run) → `yarn db:owner-memory --apply`.
2. Khởi động `yarn dev` (3334) và `yarn rag:dev` (8000) với `RAG_SERVICE_URL` + `RAG_INTERNAL_KEY` khớp nhau.
3. Kiểm tra bằng cả hai vai trò:
   - **Owner:** `DEV_OWNER_BYPASS=true` trong `.env.local` (hoặc đăng nhập Google Owner).
   - **Visitor:** tắt `DEV_OWNER_BYPASS` / cửa sổ ẩn danh chưa đăng nhập.

## Kịch bản

| # | Vai trò | Việc | Kỳ vọng |
|---|---|---|---|
| M1 | Owner | Mở Abot → ⋮ → bấm **Bộ nhớ** | Mở sheet `OwnerMemorySheet` có 2 tab `Đang nhớ` / `Chờ duyệt`; bấm `Esc` chỉ đóng sheet, drawer vẫn mở |
| M2 | Owner | Thêm 1 mục toàn cục (vd: `"Khi giải thích luôn kết thúc bằng 1 dòng Tóm tắt"`) qua `OwnerMemorySheet` rồi hỏi ngay 1 câu bất kỳ trong chat | Không phải chờ 60s cache: câu trả lời áp dụng ngay quy ước vừa thêm; `GET /api/v1/memories?status=active` có mục vừa tạo |
| M3 | Owner | Đang mở 1 Topic cụ thể, nhắn `"nhớ giúp mình là đang học Next.js 15 trong topic này"` | Abot trả Preview có nút `[✅ Xác nhận thực hiện]` và `[❌ Hủy bỏ]`, **chưa** ghi vào DB trước khi xác nhận |
| M4 | Owner | Bấm `[✅ Xác nhận thực hiện]` trên Preview ở M3 | Tool pill hiện nhãn tiếng Việt **Lưu bộ nhớ Owner**; DB có mục mới gắn đúng `scopeTopicSlug` của Topic đang mở |
| M5 | Owner | Nhắn `"bạn đang nhớ gì về mình?"` rồi mở ⋮ → **Context** | Chat liệt kê đúng các mục đang bật; `ContextUsageSheet` hiển thị dòng màu xanh **Bộ nhớ Owner** với số mục & token hợp lệ |
| M6 | Owner | Nhắn `"quên việc Next.js 15 đi"` → bấm `[❌ Hủy bỏ]`, sau đó nhắn lại và bấm `[✅ Xác nhận thực hiện]` | Lần hủy giữ nguyên dữ liệu; lần xác nhận hiện tool **Gỡ bộ nhớ Owner** và mục biến mất khỏi `status=active` |
| M7 | Owner | Reload trang / mở tab mới ở cùng domain | Abot tự nối tiếp `Thread` đang mở gần nhất từ server (`GET /api/roadmap-assistant/thread`) mà không lưu tin nhắn Owner vào `localStorage` |
| M8 | Owner | Bấm **Cuộc trò chuyện mới** rồi reload trang | `DELETE /api/roadmap-assistant/thread` đóng `Thread` cũ (`closedAt`); sau khi reload Abot mở lời chào mới, không kéo lại `Thread` cũ |
| M9 | Visitor | Đăng xuất / mở ẩn danh: kiểm tra menu ⋮, gửi `"bạn đang nhớ gì về mình?"`, `"nhớ giúp mình..."`, và prompt injection đòi in `<owner_memory>` | Không thấy nút **Bộ nhớ**, không khôi phục `Thread` của Owner, mọi lệnh nhớ/xem/quên bị từ chối bằng thông báo chỉ dành cho Owner, không lộ bất kỳ nội dung Owner Memory nào; `GET /api/v1/memories` trả 401 |
| M10 | Owner | Chat tự nhiên có thông tin bền vững (vd: `"Mình vừa nâng cấp dự án lên Next.js 15 thay vì 14"`) → mở ⋮ | Sau khi trả lời xong (~2s), badge số mục chờ duyệt hiện bên cạnh **Bộ nhớ**; mở tab **Chờ duyệt** thấy gợi ý mới kèm dòng `Thay thế: “...”` (không tự `active`); bấm **Duyệt** tự archive mục cũ |
| M11 | Owner | Gửi `"quiz bài Hybrid Search"` (bài đang `learning`), trả lời 3 câu (2 câu đúng, 1 câu thiếu ý) | Hỏi từng câu 1–3, chấm từng câu; kết thúc tự tạo 1 mục `learning_note` vào tab **Chờ duyệt** + trả Preview đổi trạng thái sang `Đã nắm` có nút `[✅ Xác nhận thực hiện]` |
| M12 | Owner | Gửi `"ôn nhanh 1 câu bài cần ôn nhất"` (bài đang `known`) → trả lời đạt → bấm `[✅ Xác nhận thực hiện]` | Bốc bài `known` quá hạn lâu nhất; tool pill hiện **Đánh dấu đã ôn bài** (`markReviewed=true`), cập nhật `statusUpdatedAt` mà không re-index RAG |
| M13 | Owner / Visitor | Owner bắt đầu quiz rồi gõ `"dừng quiz"`; Visitor gửi `"quiz bài Hybrid Search"` | Owner thoát sạch phiên quiz; Visitor bị từ chối bằng thông báo chỉ dành cho Owner và không gọi `/api/v1/memories?status=pending` |

## Ghi kết quả

*Chưa chạy trên UI thật. Sau khi chạy, thêm mục `### Lần chạy 1 — YYYY-MM-DD, trên <commit>` theo quy ước trong `tests/manual/README.md`, và dọn các mục memory test tạo ra trong quá trình chạy.*
