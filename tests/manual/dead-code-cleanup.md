# Kịch bản kiểm thử: Dọn dẹp dead code & các điểm lệch sau commit b1cbf1e (`dead-code-cleanup`)

Phạm vi: Kiểm thử các chức năng đã điều chỉnh và dọn dẹp theo `TASK-dead-code-cleanup-001`, bao gồm:
- Action chip `project` kích hoạt modal dự án tại `/portfolio` (C1)
- Lọc triệt để thẻ `[[action:roadmap` cũ không hiển thị nguyên chuỗi (C2)
- `sitemap.xml` không còn chứa các route chết `/knowledge` và `/docs` (C3)
- Lấy topic thống nhất: `PATCH /api/v1/roadmaps/[slug]/sections` tìm được theo cả `title` của topic (C4)
- Các route chết đã bị xoá hoàn toàn trả về 404 (C5)

## Chuẩn bị

1. Next.js dev server chạy cổng 3334 (`yarn dev`).
2. Môi trường kiểm thử có quyền ghi (qua `DEV_OWNER_BYPASS=true` hoặc `ADMIN_API_KEY`).
3. Topic thử nghiệm: chỉ thao tác trên topic tạm `QA Sandbox` và dọn dẹp ngay sau khi kiểm thử hoàn tất.

## Các bước thực hiện và kiểm tra

| # | Case | Thao tác | Kết quả mong đợi | Kết quả |
|---|---|---|---|---|
| C1 | Chip project mở modal | Tại `/portfolio`, hỏi Cris AI về dự án Kamala, hoặc dispatch event `project:open-modal` với `detail.projectId = "kamala"` | `ProjectDetailModal` được mở hiển thị đúng thông tin dự án Kamala | `Pass` |
| C2 | Lọc sạch action roadmap cũ | Kiểm tra chuỗi chứa `[[action:roadmap\|layer-01\|X]]` qua `parseMessageContentAndActions` | Thẻ roadmap bị loại bỏ hoàn toàn khỏi `cleanContent`, không render nguyên chuỗi và không sinh chip lỗi | `Pass` |
| C3 | Sitemap không có route chết | `GET /sitemap.xml` | Không chứa URL `/knowledge` và `/docs`; chỉ chứa `/`, `/portfolio`, `/notes` | `Pass` |
| C4 | Topic resolution theo title | Tạo topic `QA Sandbox`, thêm item với section "Old Section". Gọi `PATCH /api/v1/roadmaps/QA%20Sandbox/sections` với `{ from: "Old Section", to: "New Section" }` | Section được đổi tên thành công; xoá topic `QA Sandbox` sau khi chạy | `Pass` |
| C5 | Các route đã xoá trả 404 | Kiểm tra các route đã xoá: topics (v1), workflows, notes | Tất cả đều trả HTTP 404 Not Found | `Pass` |

## Ghi kết quả

- **Lần chạy kiểm thử**: 2026-11-06 @ `a2828a5`
  - Môi trường: Local dev server (Next.js 16 Turbopack cổng 3334) + SQLite `dev.db`.
  - Kết quả từng case:
    - **C1**: Event `project:open-modal` được `components/projects-section.tsx` bắt và mở `ProjectDetailModal` chính xác (khoá bởi unit test `tests/unit/projects-section.test.tsx`) -> `Pass`.
    - **C2**: Thẻ `[[action:roadmap]]` được loại bỏ hoàn toàn khỏi `cleanContent` và không sinh chip (khoá bởi unit test `tests/unit/action-chips.test.ts`) -> `Pass`.
    - **C3**: `GET /sitemap.xml` trả về đúng 3 static routes (`/`, `/portfolio`, `/notes`), không có `/knowledge` hay `/docs` -> `Pass`.
    - **C4**: `PATCH /api/v1/roadmaps/QA%20Sandbox/sections` với title `QA Sandbox` đổi tên section thành công (`{"success":true,"renamed":1,"section":"New Section"}`), topic `QA Sandbox` đã xoá sạch sau khi chạy -> `Pass`.
    - **C5**: Các endpoint đã xoá (topics v1, workflows, notes) đều trả mã 404 -> `Pass`.
  - Tổng kết: 5/5 Pass.
