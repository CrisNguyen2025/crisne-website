---
status: accepted
---

# Lesson có trạng thái: target, learning, known

Roadmap đến nay chỉ ghi kiến thức: Topic chứa các Lesson, chia theo Section (ADR-0009). Nó chưa cho biết Owner đang ở đâu với từng Lesson. Mục tiêu mới là để roadmap làm "second brain" cho Owner: vừa là kho kiến thức đã có, vừa là danh sách những gì muốn học, và cập nhật theo thời gian. Roadmap Assistant dựa vào đó để cá nhân hoá: nhắc ôn những gì đã nắm mà lâu không động tới, và gợi ý học tiếp những gì đang nhắm tới. Định nghĩa Topic, Section và Lesson giữ nguyên; quyết định này chỉ thêm một chiều.

## Quyết định

- Mỗi Lesson có một Lesson Status: `target` (mục tiêu), `learning` (đang học) hoặc `known` (đã nắm).
- Trạng thái gắn ở Lesson, không ở Topic. Một Topic có thể vừa có bài đã nắm vừa có bài đang nhắm tới. Nếu cần trạng thái của Topic thì tính từ các Lesson của nó, không lưu riêng.
- Lesson đã có trước quyết định này, và Lesson tạo mới mà không nêu trạng thái, là `known`: roadmap đến nay là nơi ghi kiến thức đã có.
- Lưu thời điểm trạng thái đổi lần gần nhất, để Roadmap Assistant biết một Lesson đã ở trạng thái hiện tại bao lâu.
- Đổi trạng thái là một Change: chỉ Owner làm được, và qua Roadmap Assistant thì phải có Preview rồi chờ xác nhận, như mọi Change khác.
- Lesson Status nói về tiến trình của Owner, không phải độ khó của bài. Nó không đưa lại Level đã bỏ ở ADR-0008.

## Consequences

- Schema `RoadmapItem` thêm trạng thái và thời điểm đổi trạng thái. Migration chạy thử trước, rồi mới áp lên Turso (ADR-0005), giống `scripts/flatten-to-sections.ts`.
- Trang roadmap hiển thị trạng thái của từng Lesson và cho Owner đổi trực tiếp.
- Roadmap Assistant đọc được trạng thái để trả lời "tôi đang biết gì về X", "nên học gì tiếp", "bài nào cần ôn lại", và đổi được trạng thái qua chat.
- Chưa quyết Visitor có thấy trạng thái hay không, vì trạng thái là dữ liệu cá nhân của Owner. Cho đến khi có ADR khác, chỉ Owner thấy.
- Gợi ý cập nhật nội dung một Lesson (qua Knowledge Triage) và rà soát định kỳ là bước sau, chưa nằm trong quyết định này.
