---
status: accepted
---

# Lịch sử và Topic đang mở của Thread Owner lưu ở Turso, Thread Visitor chỉ nằm trong RAM

Roadmap Assistant giữ lịch sử Thread và Topic đang mở trong RAM của tiến trình. Trên Render Free, filesystem là tạm và service spin down sau 15 phút không có traffic ([Render Free](https://render.com/docs/free)), nên những thứ này mất sau mỗi lần idle, chứ không chỉ khi redeploy. Câu hỏi nối tiếp như "bài đó" vì thế không còn gì để tham chiếu. Từ 2026-11-16, lịch sử và Topic đang mở của Thread Owner được lưu ở Turso. Service Python ghi và đọc chúng qua API nội bộ của Next.js, giống cách nó đã đọc ghi dữ liệu roadmap. Thread Visitor vẫn chỉ nằm trong RAM, để không lưu bền tin nhắn của người ngoài.

## Considered Options

- Persistent disk trên Render và dùng lại store SQLite sẵn có: chỉ có ở gói trả phí, làm mất zero-downtime deploy và khoá service ở một instance ([Render Disks](https://render.com/docs/disks)).
- Service Python kết nối thẳng Turso: phải đưa credential của database vào service Python và phá ranh giới "Python chỉ đi qua Next.js".
- Lưu cả Thread Visitor: kéo theo việc giữ tin nhắn của người ngoài 30 ngày trong database. Lợi ích nhỏ vì Visitor không có Pending Action hay Change nào để nối tiếp.
- Tóm tắt lịch sử (compaction): mỗi lượt tốn thêm một lần gọi LLM, trong khi prompt đã có trần cố định là một số lượt gần nhất, mỗi tin nhắn bị cắt độ dài. Chỉ xem lại khi có eval cho thấy Thread dài trả lời sai vì thiếu ngữ cảnh cũ.

## Consequences

- Pending Action không được lưu. Sau khi tiến trình khởi động lại, một câu "ok" không bao giờ chạy lại một Change cũ.
- Hai lớp chặn Thread Visitor: service Python chỉ gửi khi Actor là Owner, và API Next.js từ chối mọi Thread không thuộc Owner.
- Lưu lịch sử là phụ: Next.js hoặc Turso không trả lời thì lượt chat vẫn chạy, chỉ dùng RAM như trước.
- Schema mới phải được đẩy lên Turso bằng tay (ADR-0005).
