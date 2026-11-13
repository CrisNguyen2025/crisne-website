## 2026-11-10T09:25:07Z

Kiểm tra và pull thay đổi mới nhất từ nhánh `main` (nếu có), sau đó thực hiện rà soát và lập báo cáo toàn diện về các tính năng, logic, UI component, dead code, schema, API route hoặc tài liệu còn dư thừa, lỗi thời, mồ côi trong toàn bộ codebase (bao gồm các thành phần liên quan đến việc Abot migrate theo ADR-0009 loại bỏ Layer và Group). Không thực hiện sửa đổi hay xóa code/docs trong đợt này.

Integrity mode: development

## Requirements

### R1. Đồng bộ trạng thái nhánh main
Kiểm tra remote và pull các thay đổi mới nhất từ nhánh `main` trước khi tiến hành rà soát.

### R2. Rà soát và lập báo cáo thành phần dư thừa toàn diện
Rà soát toàn bộ codebase (frontend Next.js, backend Python Abot `roadmap-rag-assistant/`, database schema/migrations, API routes và tài liệu hướng dẫn/spec). Lập báo cáo chi tiết chỉ ra các thành phần dư thừa, lỗi thời hoặc mồ côi, bao gồm:
- Logic và UI component không còn được tham chiếu hoặc không còn trang/luồng sử dụng.
- Schema DB, model hoặc API routes mồ côi không còn kết nối với frontend hoặc backend logic.
- Các công cụ (tools), prompt, schema hoặc tài liệu của Abot liên quan đến Layer/Group bị loại bỏ sau khi migrate sang Topic -> Section -> Item theo ADR-0009.
- Tài liệu spec hoặc hướng dẫn lệch pha với implementation thực tế.
Lưu ý: Không chỉnh sửa, xóa file hoặc thay đổi mã nguồn trong đợt rà soát này.

### R3. Xác minh bằng công cụ kiểm tra sẵn có
Sử dụng các công cụ và bộ kiểm tra sẵn có của repository (`yarn tsc`, `yarn lint`, `yarn check:knowledge-index`, pytest trong `roadmap-rag-assistant/`, GitNexus impact analysis / CLI) để đối chiếu, kiểm chứng rằng các thành phần được báo cáo thực sự là dead code / mồ côi mà không gây false positive.

## Verification Resources
- CI / Linter scripts: `yarn tsc --noEmit -p .`, `yarn lint`, `yarn check:knowledge-index`
- Backend Python test suite: `pytest` trong `roadmap-rag-assistant/`
- Code intelligence / Call graph: GitNexus CLI (`gitnexus impact`, `yarn intel`)
- Tài liệu kiến trúc tham chiếu: `docs/adr/ADR-0009-*.md`, `docs/code-intel/CRIS_WORKSPACE_MAP.md`, `GLOSSARY.md`

## Acceptance Criteria

### Đồng bộ
- [ ] Nhánh `main` được kiểm tra và cập nhật mới nhất trước khi phân tích.

### Báo cáo kiểm tra
- [ ] Báo cáo rà soát liệt kê chi tiết từng thành phần dư thừa/lỗi thời/mồ côi kèm đường dẫn file cụ thể (`file:line`), loại thành phần (logic, UI, schema, API route, tool, docs), và lý do xác định là dư thừa.
- [ ] Phần rà soát Abot xác minh đầy đủ tình trạng 14 tools cũ so với 11 tools hiện tại và các tài liệu/code liên quan đến Layer/Group theo ADR-0009.
- [ ] Không có file mã nguồn, schema hay tài liệu nào trong codebase bị chỉnh sửa hoặc xóa bỏ ngoài file báo cáo.

### Kiểm chứng kỹ thuật
- [ ] Mọi thành phần được kết luận là dead code hoặc mồ côi đều được xác minh không có tham chiếu hợp lệ nào trong call graph hoặc quy trình thực thi qua công cụ kiểm tra (`tsc`, `lint`, test suites hoặc GitNexus).


## 2026-11-10T09:28:03Z

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
