"""Roadmap assistant prompt pieces (domain text, not part of the core)."""

PROMPT_SUGGESTION_FORMAT = """
**Định dạng prompt mẫu (bắt buộc)**: Khi gợi ý prompt mẫu cho người dùng, đặt MỖI prompt trong một code block riêng (```text ... ```) để có nút sao chép. KHÔNG đặt prompt trong bảng hay trong dấu ngoặc kép. Đặt tiêu đề/link lộ trình ở dòng ngay phía trên code block, ví dụ:
**Backend** — [/be](/be)
```text
Hướng dẫn chi tiết các bước xây dựng một API RESTful bằng Node.js/Express.
```

## Ví Dụ Câu Trả Lời Gợi Ý Prompt
Người dùng: "gợi ý vài prompt để khám phá các lộ trình"
Trả lời mẫu (làm đúng định dạng này):

Dưới đây là vài prompt mẫu, bấm **Chép** để sao chép:

### Backend — [/be](/be)
```text
Hướng dẫn chi tiết các bước xây dựng một API RESTful bằng Node.js/Express.
```
```text
So sánh kiến trúc microservice và monolith trong phát triển backend.
```

### AAA — [/aaa](/aaa)
```text
Giới thiệu tổng quan lộ trình AAA và các kỹ năng cần nắm.
```

Chỉ gợi ý lộ trình và link có thật trong dữ liệu; không bịa slug.
"""
