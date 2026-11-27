# Test thủ công — Nút `+ Add Context` (`Actions` Slash & `Gmail Connector`)

Kiểm tra luồng UI và bảo mật theo `ADR-0021` + `.handoff/PLAN-abot-add-context.md`:

## Trường hợp kiểm tra

| ID | Ngữ cảnh | Thao tác | Kỳ vọng | Kết quả |
|---|---|---|---|---|
| `AC-1` | Visitor (`canWrite = false`) | Mở Abot, bấm nút `+` góc trái | Chỉ thấy **Actions** (Slash); không thấy mục **Gmail** và không gọi `/api/v1/connectors/gmail/*` | Tự động pass (`abot-add-context-ui.test.tsx`) |
| `AC-2` | Owner (`canWrite = true`), chưa nối Gmail | Bấm `+` → thấy **Actions** & **Gmail (`Set up`)** | Hiển thị đúng bố cục 2 hàng (`textarea` trên, toolbar dưới); `Escape` đóng menu mà không đóng Abot | Tự động pass (`abot-add-context-ui.test.tsx`) |
| `AC-3` | Owner gõ `/` hoặc bấm `Actions` → `/quiz` | Chọn `/quiz` trong danh sách | Hiện popover chọn **Topic** (ưu tiên `Topic` đang xem lên đầu); chọn 1 `Topic` gửi `/quiz <Topic>` và trả danh sách chips bài quiz + nút quiz tổng hợp | Tự động + Python (`test_slash_and_gmail_connector.py`) |
| `AC-4` | Owner kết nối Gmail thật | Bấm `Set up` → Popup Google OAuth (`gmail.readonly`) → Cấp quyền | Popup tự đóng, dialog cập nhật `accountEmail` + danh sách nhãn Gmail; bảng `OwnerConnector` lưu ciphertext AES-256-GCM | Chưa chạy thật |
| `AC-5` | Owner bật chip `[Gmail]` hoặc gõ `/gmail` | Gửi câu hỏi `"Trong Gmail tuần này có email kỹ thuật nào mới?"` | Abot gọi tool `query_gmail_connector`, không báo ngoài phạm vi (`OUT_OF_SCOPE`), trả lời có citation `[[gmail:<id>]]`, và không tạo gợi ý `OwnerMemory` từ nội dung thư | Tự động + Python (`gmail-connectors-route.test.ts`, `test_slash_and_gmail_connector.py`) |
| `AC-6` | Tải lại trang (`restoreLatestThread`) | F5 sau khi gửi lượt `/gmail` | `ThreadMessage.contextJson` khôi phục chip `[Gmail]` và nhãn `/gmail` trên bong bóng tin nhắn Owner | Tự động pass (`gmail-connectors-route.test.ts`, `abot-add-context-ui.test.tsx`) |
