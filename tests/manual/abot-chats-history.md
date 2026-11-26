# Abot — Chats History (Bottom Sheet Gần đây, Tìm kiếm & Chuyển Thread)

Kiểm thử thủ công luồng **Chats history** của **Owner** trên widget Abot: mở Bottom Sheet `Lịch sử chat`, tìm kiếm tiếng Việt có/không dấu, chuyển hẳn sang một `Thread` cũ và giữ nguyên sau reload, xóa `Thread` 2 chạm, và cách ly với `Visitor`.

- **Spec triển khai:** `.handoff/specs/TASK-abot-chats-history-001.md`
- **Tài liệu thiết kế:** `docs/adr/0012-owner-thread-state-in-turso.md`, `docs/adr/0015-abot-owner-memory.md`
- **Test tự động đã khoá:**
  - Next.js API: `tests/route/assistant-threads-route.test.ts`, `tests/route/assistant-thread-route.test.ts`
  - UI SDK: `tests/unit/thread-history-sheet.test.tsx`, `tests/unit/sdk-chat-hook.test.tsx`, `tests/unit/sdk-widget.test.tsx`

## Điều kiện trước khi chạy

1. Khởi động `yarn dev` (3334) và `yarn rag:dev` (8000) với `RAG_SERVICE_URL` + `RAG_INTERNAL_KEY` + `ADMIN_API_KEY` khớp nhau (`RAG_HISTORY_DB` để trống để lưu qua Turso/SQLite Next.js).
2. Có ít nhất 2 `Thread` đã chat trước đó của `Owner` (trong đó có ít nhất 1 `Thread` đã bấm **Cuộc trò chuyện mới** để đóng).
3. Kiểm tra bằng cả hai vai trò:
   - **Owner:** `DEV_OWNER_BYPASS=true` trong `.env.local` (hoặc đăng nhập Google Owner).
   - **Visitor:** tắt `DEV_OWNER_BYPASS` / cửa sổ ẩn danh chưa đăng nhập.

## Kịch bản

| # | Vai trò | Việc | Kỳ vọng |
|---|---|---|---|
| H1 | Owner | Mở Abot → kiểm tra header → bấm icon **Lịch sử chat** (cạnh nút **Cuộc trò chuyện mới**) | Nút **Lịch sử chat** hiện trên header; bấm mở Bottom Sheet trượt từ đáy lên mượt mà, hiển thị danh sách **Gần đây** có tiêu đề, thời gian tương đối (`… phút trước`), số tin và badge Topic (nếu có) |
| H2 | Owner | Gõ từ khóa không dấu vào ô tìm kiếm (vd `"bo nho"` hoặc từ nằm ở câu trả lời lượt sau) | Danh sách lọc ngay lập tức theo tiêu đề/Topic, sau ~250ms hiện kết quả khớp sâu kèm đoạn trích `matchedSnippet` |
| H3 | Owner | Chọn một `Thread` cũ (trước đó đã bấm **Cuộc trò chuyện mới**) | Sheet tự đóng, Abot nạp lại toàn bộ lịch sử `Thread` cũ và cuộn xuống cuối; nhấn **F5 reload trang** vẫn ở đúng `Thread` vừa chọn |
| H4 | Owner | Nhắn tiếp 1 câu hỏi nối tiếp trong `Thread` vừa khôi phục (vd nhắc lại ngữ cảnh cũ trong `Thread`) | Abot trả lời giữ đúng mạch hội thoại và Topic của `Thread` đó; không hiện nút xác nhận `Pending Action` cũ đã hết hạn |
| H5 | Owner | Bấm **Cuộc trò chuyện mới** rồi **F5 reload trang** | Abot về lời chào mới và không tự kéo lại `Thread` vừa đóng; mở **Lịch sử chat** vẫn thấy `Thread` đó trong danh sách |
| H6 | Owner | Trong **Lịch sử chat**, bấm icon thùng rác ở 1 `Thread` → nhấn `Esc`, sau đó bấm lại và xác nhận **Xoá** (thử với `Thread` đang mở) | Lần nhấn `Esc` chỉ hủy xác nhận xóa (sheet vẫn mở); xác nhận xóa gỡ `Thread` khỏi danh sách và DB; nếu xóa đúng `Thread` đang mở thì khung chat về lời chào mới |
| H7 | Owner | Kiểm tra ở chế độ **Floating**, **Sidebar** (desktop) và **Mobile Drawer** (`< 768px`) | Trên mobile không tự bật bàn phím khi vừa mở sheet, vuốt ngang không làm đóng nhầm drawer Abot khi đang mở sheet, chạm backdrop hoặc `Esc` đóng sheet gọn |
| H8 | Visitor | Tắt đăng nhập / kiểm tra header Abot và gọi `GET /api/roadmap-assistant/threads` | Không thấy nút **Lịch sử chat** trên header; API `/api/roadmap-assistant/threads` trả `401` |

## Ghi kết quả

*Chưa chạy trên UI thật. Sau khi chạy, thêm mục `### Lần chạy 1 — YYYY-MM-DD, trên <commit>` theo quy ước trong `tests/manual/README.md`.*
