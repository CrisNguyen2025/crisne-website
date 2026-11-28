# Kịch bản kiểm thử: Lesson Reader Docs Layout (Phương án A)

Phạm vi: bố cục docs cho trang Lesson (`/[topicSlug]/[lessonSlug]`) và khung `LectureShell` dùng chung với trang Topic (`/[topicSlug]`).
Code: `components/roadmap/LectureShell.tsx`, `components/roadmap/LectureToc.tsx`, `components/roadmap/LessonEditorialReader.tsx`, `components/roadmap/LessonStatus.tsx`, `components/roadmap/RelatedLessons.tsx`, `hooks/use-abot-sidebar.ts`, `app/styles/roadmap-theme.css`.
Wireframe tham chiếu: `.handoff/specs/assets/lesson-docs-wireframe.html` (phương án A).

## Chuẩn bị

1. Chạy `yarn dev` (cổng 3334) với `DEV_OWNER_BYPASS=true` cho các case Owner; mở cửa sổ ẩn danh hoặc tắt bypass cho case Visitor.
2. Mở một Topic có nhiều Section, Lesson có mô tả, nội dung gồm nhiều `h2`/`h3`, trạng thái khác nhau và có Bài học liên quan.

## Case

| # | Thao tác | Kỳ vọng | Trạng thái |
|---|---|---|---|
| L1 | Mở trang Lesson ở viewport `1440px`, Abot đóng | Khớp layout Reading Desk: thanh trên toàn trang có nút brand `Crisne`, link Topic, ô tìm kiếm `⌘K`, link `Topics`/`News`, `DesignMenu`; menu trái 264px nền `--editorial-sidebar` kèm viền `border-border`, lesson đang mở chữ màu `--editorial-accent` không khung; mục lục `h2`/`h3` xổ ra ngay dưới lesson đang mở; cột đọc 720px căn giữa thẳng trên nền `bg-background` (không tờ giấy `editorial-paper`), không có cột phải | Chưa chạy |
| L2 | Ở `1440px`, mở Abot ở chế độ sidebar | Menu trái vẫn giữ nguyên; Abot mở bên phải; cột đọc mở rộng hết bề rộng vùng còn lại (`max-w-none`), không tràn ngang | Chưa chạy |
| L3 | Thu viewport xuống `1280px` và mở Abot sidebar | Menu trái desktop tự ẩn (`useCollapseLeftNav`); nút mở drawer ở góc trái thanh trên hiện ra; cột đọc giữ tối đa 720px | Chưa chạy |
| L4 | Thu viewport xuống `375px` (mobile) | Không cuộn ngang trang; nút mở drawer trên thanh trên mở ngăn kéo chứa cây section/lesson và mục lục `h2`/`h3` dưới lesson đang mở; bấm một mục lục nhảy đúng heading và tự đóng drawer | Chưa chạy |
| L5 | Ở hàng meta dưới mô tả, bấm nút trạng thái (`Mục tiêu` / `Đang học` / `Đã nắm`) và chọn trạng thái mới | Popover 3 trạng thái mở ra (có tick mục đang chọn); sau khi chọn, nút trạng thái đổi màu/icon/nhãn ngay và icon `size-3.5` tương ứng bên cạnh tên Lesson trong menu trái đổi theo; tải lại trang vẫn giữ trạng thái mới | Chưa chạy |
| L6 | Thử 3 thao tác Owner ở hàng meta: bấm icon bút chì, mở menu `…` → `Sửa bài học`, mở menu `…` → `Xoá bài học` | Bút chì mở `EditItemContentDrawer`; `Sửa bài học` mở `EditItemInfoDrawer`; `Xoá bài học` hiện bước xác nhận tại chỗ trước khi xoá và điều hướng về trang Topic | Chưa chạy |
| L7 | Mở trang Topic (`/[topicSlug]`) ở `1440px` khi Abot đóng và khi Abot mở | Thanh trên toàn trang và menu trái mới áp dụng sạch sẽ; bài học trong phần `Đang theo dõi` vẫn hiện ở cột phải khi đủ rộng và thu gọn hợp lý khi Abot mở | Chưa chạy |
| L8 | Đổi chế độ Sáng / Tối và chuyển sang một theme khác (ví dụ `Linear`) qua `DesignMenu` | Màu chữ, đường kẻ `border-border`, màu nhấn `--editorial-accent`, và màu trạng thái `--status-*` đổi đúng theo theme mới ở cả thanh trên, menu trái, mục lục, prose (`1.0625rem` / `1.75`) và bài học liên quan | Chưa chạy |
