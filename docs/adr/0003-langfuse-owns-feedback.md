---
status: accepted
---

# Langfuse là nơi duy nhất giữ Feedback và Golden Set

Từ 2026-10-21, mọi việc LLMOps (tracing, Feedback 👍/👎, dataset, chi phí, độ trễ) chỉ dùng Langfuse. Route feedback chỉ ghi score lên Langfuse, không ghi database. Golden Set đi từ Annotation Queue của Langfuse, được đồng bộ về repo để làm cổng CI. Knowledge Triage vẫn giữ trong database, nhưng chỉ là quy trình biến 👎 thành Lesson mới; Owner import các mục từ Langfuse về, không tạo trực tiếp từ lượt vote. Loại DeepEval, Arize Phoenix và LangSmith vì trùng chức năng và nặng dependency.

## Consequences

- Không thêm adapter đa vendor cho LLMOps.
- Không ghi Knowledge Triage từ route feedback.
