# Abot — mục Context trong menu ⋮ (TASK-abot-context-panel-001)

Mục **Context** ở menu ⋮ mở một sheet theo concept Context của Claude Code: hội thoại đang mang theo gì vào câu trả lời kế tiếp, so với **ngân sách của Abot**.

- **Đang trong context:** System prompt và Tin nhắn (cửa sổ `history_turns × 2` = 20 tin). Phần này lớn dần theo hội thoại; khi cửa sổ đầy, tin cũ nhất rơi ra. Đây là cái tương đương auto-compact của Abot.
- **Giữ chỗ** cho mỗi câu trả lời: tài liệu truy xuất (tối đa 4), câu hỏi kế tiếp, câu trả lời.
- **Mẫu số** là tổng các giới hạn của Abot, không phải window của model. Window model chỉ ghi ở dòng chú thích.
- **Không nằm trong context** (hiện `—` như deferred tools): tin nhắn ngoài cửa sổ, tài liệu bị loại ở lượt gần nhất.
- **Lượt trả lời gần nhất:** đầu vào (provider đo nếu có), tài liệu đã gửi (mở rộng xem tên bài), câu trả lời.

Dữ liệu: `POST /chat/context` (`rag_service/context_usage.py`, đi qua BFF `app/api/roadmap-assistant/[...path]`, không tính vào rate limit của visitor). Chỉ gồm số, nhãn và tên bài học.

Test tự động: `roadmap-rag-assistant/tests/test_context_usage.py`, `tests/unit/abot-context-usage.test.ts`, `tests/route/roadmap-assistant-proxy.test.ts` (case `chat/context`).

## Cách chạy

`yarn dev` (3334) + `yarn rag:dev` (8000), mở Abot, ⋮ → Context.

## Kịch bản

| # | Việc | Kỳ vọng |
|---|---|---|
| C1 | Bấm ⋮ | Có mục **Context** giữa "Cuộc trò chuyện mới" và "Thu gọn" |
| C2 | Mở Context ở cuộc trò chuyện mới | Chỉ có System prompt; Tin nhắn 0 / 20; không có mục "Lượt trả lời gần nhất" |
| C3 | Hỏi tiếp một câu rồi mở lại | Tin nhắn tăng 2, có dòng "Thay đổi từ lần xem trước" (+…), System prompt không đổi |
| C4 | Sau một câu có tài liệu truy xuất | Mục "Lượt trả lời gần nhất": đầu vào, "Tài liệu truy xuất · n" mở ra thấy tên từng bài, câu trả lời |
| C5 | Bảng chính | `% đã dùng · used / ngân sách`; 3 dòng "Giữ chỗ" màu xám nằm cuối thanh; dòng Còn trống; chú thích ghi window của model |
| C6 | Mobile drawer (375×812) | Sheet nằm trong drawer, đọc được đủ, đóng được bằng X và bấm nền |
| C7 | Esc khi sheet mở | Chỉ sheet đóng, drawer vẫn mở |
| C8 | Hội thoại quá 20 tin | Chú thích báo cửa sổ đã đầy; "Tin nhắn ngoài cửa sổ" có số, cột % là `—` |

## Ghi kết quả

### Lần chạy 2 — 2026-11-14, trên `c98c5d7` + thay đổi chưa commit (hướng A)

Môi trường: `next dev` + `rag:dev` local, model `openai/gpt-oss-120b`, Browser pane của Claude.

| # | Kết quả | Ghi chú |
|---|---|---|
| C1 | Pass | |
| C2 | Pass | Gọi thẳng qua BFF với thread mới: ngân sách 9654, System prompt 746, Tin nhắn 0 / 20, `last_turn: null` |
| C3 | Pass | 8 / 20 → 10 / 20, "+75", System prompt giữ 747 |
| C4 | Pass | Đầu vào 1.4k (provider đo), 2 tài liệu "AI & LLM Architecture Roadmap" và "AI Engineering", câu trả lời 797. Mục này chỉ có sau khi server đã trả lời ít nhất một câu kể từ lần khởi động (lưu trong bộ nhớ) |
| C5 | Pass | 11% · 1.1k / 9.7k, window 131.1k ở chú thích |
| C6 | Pass | |
| C7 | Pass | Lần chạy 1 ở hướng cũ: Esc đóng cả drawer; đã sửa bằng handler capture trong sheet |
| C8 | Chưa chạy trên UI | Logic có test: `test_context_usage.py::test_messages_past_the_window_are_reported_as_omitted`, `abot-context-usage.test.ts` ("says when the message window is full") |

Giới hạn đã biết: token ước lượng theo ký tự / 4; chỉ "Đầu vào" của lượt gần nhất là số provider đo. Chưa tính các lần gọi LLM của router/verifier. Ô giữ chỗ tài liệu dùng hằng số 1200 ký tự/bài (`DOCUMENT_BUDGET_CHARS`), ô câu trả lời 2048 token (`OUTPUT_RESERVE_TOKENS`).

### Lần chạy 1 — 2026-11-14, trên `97525f9` + thay đổi chưa commit (đã thay thế)

Thiết kế cũ: SSE `event: context`, đo một lần gọi LLM so với window của model. Bị thay bằng hướng A vì lệch concept của Claude Code: phần trăm luôn khoảng 1% và không cho thấy hội thoại tích lũy. C1–C5 Pass, C6 chưa chạy.
