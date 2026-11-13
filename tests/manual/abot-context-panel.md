# Abot — mục Context trong menu ⋮ (TASK-abot-context-panel-001)

Mục **Context** ở menu ⋮ mở một sheet cho biết lượt trả lời LLM gần nhất đã đưa gì vào context và tốn bao nhiêu token. Dữ liệu đến từ SSE `event: context` (`rag_service/context_usage.py`), chỉ gồm số và nhãn.

Test tự động: `roadmap-rag-assistant/tests/test_context_usage.py`, `tests/test_generation_pipeline.py::test_pipeline_event_shape_is_unchanged`.

## Cách chạy

`yarn dev` (3334) + `yarn rag:dev` (8000), mở Abot, ⋮ → Context.

## Kịch bản

| # | Việc | Kỳ vọng |
|---|---|---|
| C1 | Bấm ⋮ | Có mục **Context** giữa "Cuộc trò chuyện mới" và "Thu gọn" |
| C2 | Mở Context trước khi hỏi gì | Sheet báo "Gửi một câu hỏi để xem context của lượt trả lời." |
| C3 | Hỏi câu mà Abot trả lời bằng template (ví dụ "context window là gì?" khi DB chưa có bài) rồi mở Context | Sheet vẫn rỗng: lượt không gọi LLM nên không có `event: context` |
| C4 | Hỏi câu có tài liệu truy xuất ("AI Engineering gồm những gì?") rồi mở Context | Thanh % đã dùng, 4 phần (System prompt, Lịch sử · số lượt, Tài liệu truy xuất · số bài, Câu hỏi), dòng Còn trống; mẫu số là window của model |
| C5 | "Cuộc trò chuyện mới" rồi mở Context | Sheet rỗng lại như C2 |
| C6 | Mobile drawer | Sheet nằm trong drawer, đóng được bằng X, bấm nền, Esc |

## Ghi kết quả

### Lần chạy 1 — 2026-11-14, trên `97525f9` + thay đổi chưa commit

Môi trường: `next dev` + `rag:dev` local, model `openai/gpt-oss-120b`, Playwright không dùng (Browser pane của Claude).

| # | Kết quả | Ghi chú |
|---|---|---|
| C1 | Pass | |
| C2 | Pass | |
| C3 | Pass | Hai lượt template liên tiếp, sheet vẫn rỗng |
| C4 | Pass | 1.5k / 131.1k (1.2%): 371 + 320 + 811 + 44; lịch sử 6 lượt, 3 tài liệu. Lần đầu mẫu số hiện 1M (sai) vì hằng số cố định theo Gemini; đã sửa thành tra theo tên model, test: `test_context_usage.py::test_window_follows_the_model_and_unknown_models_get_the_default` |
| C5 | Pass | |
| C6 | Chưa chạy | Chưa thử viewport mobile |

Giới hạn đã biết: token từng phần là ước lượng (`ceil(ký tự / 4)`), chỉ tổng `input_tokens` lấy từ provider khi có (`measured`). Chỉ tính lượt sinh câu trả lời, không gồm router/verifier. Esc khi sheet mở chỉ đóng sheet.
