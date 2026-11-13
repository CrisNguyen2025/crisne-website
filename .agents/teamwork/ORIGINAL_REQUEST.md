# Original User Request

## Approved Task Prompt — 2026-11-10T09:26:40Z

Đánh giá IntentType.KNOWLEDGE_QUERY hiện tại của trợ lý Abot để đề xuất và thiết kế phương án phân chia sub-intent (hoặc giữ nguyên/tinh chỉnh) dưới dạng báo cáo phân tích và tài liệu thiết kế kiến trúc, không sửa đổi mã nguồn router hay dataset eval.

Integrity mode: development

Tài liệu và mã nguồn tham chiếu:
- `roadmap-rag-assistant/docs/routing-phases.md`
- `rag_service/domains/roadmap/router/schemas.py`
- `rag_service/domains/roadmap/router/policy.py`
- `rag_service/domains/roadmap/router/intent_router.py`
- `evals/router/`
- `docs/adr/0010-lesson-status-known-learning-target.md`

## Requirements

### R1. Phân tích hiện trạng và downstream execution differences
Phân tích hiện trạng `IntentType.KNOWLEDGE_QUERY` (hiện đang gộp tra cứu bài học qua Vector RAG, tra cứu danh mục / mục lục in-memory catalog, và tiềm năng truy vấn tiến độ học tập người dùng `known`, `learning`, `target` theo ADR-0010) và làm rõ sự khác biệt trong luồng thực thi downstream giữa các nhánh nghiệp vụ này về mặt tài nguyên, latency, context cần thiết và side effects.

### R2. Thiết kế và đề xuất phương án sub-intent
Đề xuất các sub-intent ứng viên (hoặc phương án giữ nguyên/tinh chỉnh kèm luận cứ kỹ thuật) cùng schema Pydantic/typing dự kiến, ranh giới phân định (boundaries) và ví dụ câu truy vấn điển hình cho từng nhánh. Đánh giá rủi ro phân mảnh intent, khả năng gây nhầm lẫn/chồng lấn (confusion/ambiguity) cho router và các biện pháp giảm thiểu rủi ro.

### R3. Đánh giá tác động eval CI và lộ trình triển khai
Phân tích tác động lên bộ eval CI hiện tại (`evals/router/`), bao gồm các test case bị ảnh hưởng, ca kiểm thử cần bổ sung/cập nhật và nguy cơ suy giảm độ chính xác (regression). Xây dựng lộ trình triển khai chi tiết theo từng giai đoạn (phasing) để áp dụng an toàn vào hệ thống.

### R4. Tài liệu bàn giao
Tổng hợp toàn bộ nội dung phân tích và đề xuất thiết kế thành một tài liệu Markdown (Design Doc hoặc đề xuất ADR) tại vị trí do nhóm tự quyết định trong repository. Phạm vi công việc không bao gồm việc sửa đổi mã nguồn router hay dataset eval.

## Acceptance Criteria

### Tính đầy đủ của nội dung phân tích & thiết kế
- [ ] Tài liệu phân tích làm rõ sự khác biệt downstream execution giữa Vector RAG, in-memory catalog, và truy vấn tiến độ học tập (`known`, `learning`, `target`).
- [ ] Tài liệu đề xuất các sub-intent ứng viên (hoặc luận cứ bảo lưu/tinh chỉnh) có đầy đủ định nghĩa schema dự kiến, ranh giới phân định và ví dụ câu hỏi minh họa.
- [ ] Tài liệu có phần phân tích rủi ro phân mảnh/nhầm lẫn intent và đề xuất biện pháp phòng ngừa/giảm thiểu.
- [ ] Tài liệu phân tích tác động cụ thể lên bộ eval CI trong `evals/router/` (test cases bị ảnh hưởng, ca kiểm thử cần thêm).
- [ ] Tài liệu cung cấp lộ trình triển khai chi tiết theo các giai đoạn thực hiện.

### Ranh giới phạm vi (Scope constraints)
- [ ] Toàn bộ nội dung bàn giao nằm trong file tài liệu thiết kế Markdown được tạo mới trong repository; không sửa đổi file mã nguồn router (`schemas.py`, `policy.py`, `intent_router.py`) hay file dataset trong `evals/router/`.
