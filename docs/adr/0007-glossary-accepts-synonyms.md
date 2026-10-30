---
status: accepted
---

# Glossary chấp nhận tên đồng nghĩa qua `_Also_`

Format gốc của skill `domain-modeling` chỉ cho mỗi khái niệm một tên, mọi tên khác vào `_Avoid_`. Ở crisne, cùng một khái niệm được gọi khác nhau theo góc nhìn: người học và Roadmap Assistant nói "Lesson", "Topic", còn schema và code dùng `RoadmapItem`, `Roadmap`. Ép về một tên sẽ hoặc phải đổi tên code (rủi ro, ngoài phạm vi), hoặc bắt lỗi cách nói tự nhiên. Vì vậy glossary thêm dòng `_Also_` cho tên đồng nghĩa hợp lệ, tách khỏi `_Avoid_` là tên nên tránh.

## Consequences

- Code mới đặt theo tên đang có trong code, không theo tên chính của glossary, để không có hai cách đặt tên cho cùng một thứ.
- `_Also_` chỉ dùng khi hai tên chỉ đúng một khái niệm; một tên mang hai nghĩa thì phải tách thuật ngữ, không ghép đồng nghĩa.
- Agent đọc glossary không "sửa" `_Also_` về format gốc của skill.
