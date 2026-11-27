---
status: accepted
---

# Bổ sung nút thêm ngữ cảnh, lệnh Slash trước định tuyến và Gmail Connector một tài khoản cho Roadmap Assistant

Khi năng lực của Roadmap Assistant mở rộng (Active Recall Quiz, Lesson Status, soạn nháp Lesson, Owner Memory, WebMCP) nhưng chỉ kích hoạt qua câu tiếng Việt tự nhiên, Owner phải nhớ đúng mẫu câu. Đồng thời, các newsletter và thư kỹ thuật cá nhân của Owner nằm trong hộp thư Gmail mà nguồn RSS (`/news`) không thu thập được. Từ 2026-11-27, khung nhập của Roadmap Assistant chuyển sang bố cục hai hàng thống nhất với nút `+` góc trái mở hai khả năng: `Actions` (lệnh `/`) và `Gmail` (`Connector` kết nối một tài khoản Gmail với trợ lý).

## Quyết định

- **Bố cục khung nhập hai hàng & lệnh Slash định tuyến trước (`SlashCommandMixin`):**
  - Khung nhập luôn giữ `textarea` ở hàng trên và thanh công cụ ở hàng dưới trên cả điện thoại lẫn máy tính để không làm hẹp vùng gõ và không gây giật bố cục khi gắn chip ngữ cảnh.
  - Các lệnh bắt đầu bằng `/` ở đầu ô nhập được xử lý trước bộ định tuyến `P0–P8` để bảo toàn baseline định tuyến. Lệnh Slash chỉ bỏ qua bước đoán ý định, **không bao giờ** bỏ qua bước kiểm quyền `Owner` hay bước `Preview` xác nhận (`Pending Action`) đối với mọi `Change` và thao tác ghi `Owner Memory`.
  - Riêng lệnh `/quiz` gợi ý danh sách `Topic` ngay trên khung chọn lệnh; khi `Owner` chọn một `Topic`, Roadmap Assistant tổng hợp danh sách các bài quiz phù hợp với `Topic` đó (ưu tiên bài `learning`, tiếp đến bài `known` lâu chưa ôn và bài `target` đã có nội dung, kèm lựa chọn quiz tổng hợp toàn `Topic`).
- **Kết nối một tài khoản Gmail với trợ lý (`OwnerConnector`):**
  - Chỉ kết nối **một** tài khoản Gmail của `Owner` với Roadmap Assistant tại một thời điểm (`provider = "gmail"` duy nhất trong bảng `OwnerConnector` trên Turso).
  - Tái sử dụng cặp Google OAuth client hiện có (`AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`) nhưng chạy trên luồng ủy quyền và callback tách riêng khỏi `/login` với quyền chỉ đọc (`gmail.readonly`). Token OAuth được mã hóa `AES-256-GCM` bằng khóa riêng (`CONNECTOR_ENCRYPTION_KEY`) và chỉ lưu, làm mới, giải mã tại tầng Next.js; **không bao giờ** gửi sang tiến trình Python hay trình duyệt (ADR-0002).
  - Hộp thư Gmail **không bao giờ** được index vào bộ nhớ vector RAM (ADR-0006). Khi `Owner` bật ngữ cảnh Gmail cho lượt hỏi, Roadmap Assistant truy vấn hộp thư qua API nội bộ của Next.js trong phạm vi bộ lọc đã cấu hình (nhãn cho phép, truy vấn mặc định, loại trừ thư mã xác thực và thông tin nhạy cảm). Nội dung văn bản thuần sau khi làm sạch được nạp tạm thời dưới dạng `ContextDocument` cho riêng lượt đó để giữ nguyên kiểm chứng câu trả lời (`grounding`) và trích dẫn, đồng thời bị loại trừ khỏi luồng tự rút `Owner Memory` / `Owner Observation` (ADR-0020).
- **Lưu metadata ngữ cảnh trên `ThreadMessage` (`contextJson`):**
  - Mở rộng bảng `ThreadMessage` trên Turso (ADR-0012) thêm cột tùy chọn `contextJson` để lưu metadata cấu trúc gọn (nguồn `Connector`, tiêu đề/người gửi tham chiếu, lệnh Slash, ngữ cảnh trang) nhằm khôi phục chip hiển thị khi tải lại `Thread` của `Owner`. Tuyệt đối không lưu toàn văn nội dung email vào `ThreadMessage`.

## Considered Options

- **Gộp quyền `gmail.readonly` vào phiên đăng nhập `/login`:** làm phình JWT cookie, buộc xin Restricted Scope ngay lúc đăng nhập và không thể ngắt kết nối Gmail độc lập với phiên đăng nhập của trang.
- **Đồng bộ hộp thư Gmail vào `HybridRagEngine` hoặc bảng `NewsItem`:** làm phình RAM Render (vi phạm ADR-0006) và trộn lẫn thư cá nhân vào kho tri thức dùng chung.
- **Ghi chuỗi `[Đính kèm Gmail: ...]` thẳng vào `ThreadMessage.content` thay vì thêm cột:** làm bẩn văn bản nạp lại vào `<conversation_history>` ở các lượt sau và không khôi phục được chip ngữ cảnh có cấu trúc trên giao diện.

## Consequences

- Cần cập nhật `prisma/schema.prisma`, `prisma/init-turso.sql`, fixture test SQL và chạy script migration lên Turso cho bảng `OwnerConnector` cùng cột `ThreadMessage.contextJson` trước khi deploy.
- Với Google OAuth ở chế độ `Testing` cho một `Owner` (không cần kiểm định CASA), `refresh_token` của `gmail.readonly` hết hạn sau 7 ngày; giao diện cấu hình `Connector` phải hiển thị rõ trạng thái hết hạn và hỗ trợ kết nối lại một chạm giữ nguyên cấu hình lọc.
- Toàn bộ ranh giới cách ly `Visitor` của ADR-0002, ADR-0012 và ADR-0019 tiếp tục giữ nguyên cho `OwnerConnector`, các lệnh Slash ghi dữ liệu và trường `contextJson`.
