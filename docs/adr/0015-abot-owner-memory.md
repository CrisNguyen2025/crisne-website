---
status: accepted
---

# Owner Memory xuyên Thread lưu ở Turso, cách ly hoàn toàn với Visitor

ADR-0012 giữ lịch sử và `Topic` đang mở của từng `Thread` thuộc `Owner`, nhưng mọi ngữ cảnh về chính `Owner` (nền tảng, techstack, mục tiêu học tập, quy ước trả lời, ghi chú học tập) vẫn mất khi mở `Thread` mới. Để Roadmap Assistant làm trợ lý cá nhân xuyên suốt nhiều `Thread` mà không thêm hạ tầng ngoài hay làm rò rỉ dữ liệu riêng tư ra `Visitor`, từ 2026-11-22 dự án thêm lớp `Owner Memory` lưu ở Turso và truy cập qua API nội bộ của Next.js.

## Quyết định

- **Phạm vi và cách ly `Actor`**: `Owner Memory` chỉ tồn tại cho `Owner`. Mọi đường đọc, ghi và tiêm vào prompt chỉ chạy khi `Actor` là `Owner`; `Visitor` không bao giờ đọc, ghi hay nhận bất kỳ mục `Owner Memory` nào trong prompt (ADR-0002).
- **Cấu trúc và lưu trữ**: Lưu thành bảng `OwnerMemory` trong Turso (ADR-0005), truy cập từ service Python qua API nội bộ `/api/v1/memories` của Next.js (ADR-0001, ADR-0012). Mỗi mục có `kind` thuộc 5 giá trị cố định (`profile`, `techstack`, `goal`, `preference`, `learning_note`), nội dung ngắn (tối đa 300 ký tự), phạm vi toàn cục hoặc gắn vào một `Topic` (`scopeTopicSlug`), và trạng thái (`active`, `pending`, `archived`).
- **Quyền kiểm soát của `Owner` (HITL)**:
  - Ghi hoặc xoá `Owner Memory` qua chat đi qua `Preview` và chờ `Owner` xác nhận (`ok` / `hủy`), giống mọi `Change` khác. `Pending Action` cho thao tác bộ nhớ chỉ nằm trong RAM và hết hạn sau 10 phút (ADR-0012).
  - Các gợi ý bộ nhớ rút ra tự động từ hội thoại (giai đoạn sau) luôn đi vào trạng thái `pending` chờ `Owner` duyệt, không bao giờ tự kích hoạt thành `active`.
  - `Owner` có giao diện xem, thêm, sửa, xoá và duyệt trực tiếp các mục `Owner Memory`.
- **Nạp vào prompt không cần vector database**: Ở quy mô một `Owner`, tập `Owner Memory` ngắn và có cấu trúc. Hệ thống lọc các mục `active` (toàn cục + trùng `Topic` đang mở), giới hạn cứng số mục và tổng ký tự, tiêm vào khối XML riêng `<owner_memory>` đặt sau `<system>` và trước `<conversation_history>`. Khối này chỉ là dữ liệu tham khảo về `Owner`, không phải chỉ dẫn hệ thống, không được trích dẫn như `<document>`, và nếu mâu thuẫn kiến thức kỹ thuật với `<document>` thì `<document>` thắng.
- **Nối tiếp `Thread` của `Owner`**: Phía trình duyệt chỉ tự động nối tiếp `Thread` đang mở gần nhất của `Owner` từ server (không làm danh sách nhiều `Thread`, không lưu tin nhắn `Owner` vào `localStorage` để tránh rò rỉ khi đăng xuất). Khi `Owner` bắt đầu cuộc trò chuyện mới, `Thread` cũ được đánh dấu đóng (`closedAt`) để không bị nạp lại. `ThreadState` mở rộng thêm ngữ cảnh `Lesson` và `Section` đang nói tới.

## Considered Options

- **Framework bộ nhớ ngoài (Mem0, Zep, LangGraph Store + vector DB)**: bị loại. Trái với ADR-0005/ADR-0006, tăng độ trễ và chi phí LLM trên gói miễn phí, khó kiểm soát memory poisoning và cách ly `Actor`.
- **Tự động lưu memory ở trạng thái `active` không cần duyệt**: bị loại. Câu hỏi giả định hoặc trích dẫn của `Owner` dễ làm nhiễm bộ nhớ lâu dài.
- **Lưu lịch sử `Owner` vào `localStorage` để nối `Thread`**: bị loại. Không đồng bộ giữa các thiết bị và có rủi ro lộ tin nhắn `Owner` nếu đăng xuất trên máy dùng chung.
- **Tóm tắt tự động lịch sử `Thread` (`Thread Summary`) ngay lập tức**: giữ nguyên nguyên tắc của ADR-0012 — chỉ kích hoạt khi có bộ eval multi-turn dài chứng minh `Thread` dài bị thiếu ngữ cảnh.

## Consequences

- Bảng `OwnerMemory` và các cột mới của `ThreadState` phải được đẩy lên Turso bằng tay (ADR-0005), đồng thời cập nhật fixture schema cho test.
- Thay đổi `Owner Memory` chỉ xoá cache RAM của memory trong service Python, không kích hoạt re-index RAG (giống `Lesson Status` ở ADR-0010).
- Bộ kiểm thử bắt buộc có case chống rò rỉ sang `Visitor` (kể cả prompt injection), case `Preview`/`ok`, và kiểm tra `<owner_memory>` không làm lệch trích dẫn hay grounding.
