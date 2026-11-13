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
