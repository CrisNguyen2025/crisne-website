---
status: accepted
---

# Bỏ Knowledge Triage, Langfuse vẫn giữ Feedback và Golden Set

ADR-0003 giữ Knowledge Triage trong database làm quy trình biến 👎 của Roadmap Assistant thành Lesson mới. Từ 2026-11-05, nút 👍/👎 của Roadmap Assistant bị ẩn vì chưa có luật nào quyết định khi nào một lượt vote trở thành việc cần làm. Từ đó Knowledge Triage không còn đầu vào, nhưng vẫn kéo theo một model, bảy API route, một drawer và các bước trong spec khác. Vì vậy Knowledge Triage bị bỏ hẳn, cùng phần nối 👍/👎 của Roadmap Assistant. Owner thêm Lesson bằng tay hoặc qua Roadmap Assistant như mọi Change khác.

Phần còn hiệu lực của ADR-0003 được giữ nguyên. Mọi việc LLMOps (tracing, Feedback 👍/👎, dataset, chi phí, độ trễ) chỉ dùng Langfuse. Route feedback chỉ ghi score lên Langfuse và không ghi database. Golden Set đi từ Annotation Queue của Langfuse, được đồng bộ về repo để làm cổng CI. DeepEval, Arize Phoenix và LangSmith vẫn bị loại.

## Considered Options

- Giữ Knowledge Triage nhưng ẩn UI: vẫn phải bảo trì schema và route cho một luồng không còn dữ liệu vào.
- Bật lại 👍/👎 của Roadmap Assistant để nuôi Triage: cần luật chọn 👎 nào thành Lesson trước, và luật đó chưa có.

## Consequences

- Feedback của Cris AI vẫn đi vào Annotation Queue và Golden Set như trước.
- Các 👎 cũ vẫn nằm trên Langfuse. Nếu sau này cần lại luồng "👎 thành Lesson", phải viết ADR mới, kèm luật chọn vote.
- Bảng `KnowledgeTriage` bị drop. Production do Owner tự drop sau khi backup. Các Lesson đã được approve từ Triage vẫn giữ nguyên.
- Phần "gợi ý cập nhật nội dung Lesson qua Knowledge Triage" mà ADR-0010 để lại làm bước sau không còn đi qua Triage nữa.
