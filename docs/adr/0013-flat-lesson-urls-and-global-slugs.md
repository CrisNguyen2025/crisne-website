---
status: superseded by ADR-0014
---

# URL bài học phẳng /lessons/[lessonSlug] và slug duy nhất toàn cục

Trước đây, URL của mỗi `Lesson` nằm lồng trong `Topic` (`/topic/[topicSlug]/[itemSlug]`) và `RoadmapItem.slug` chỉ duy nhất trong phạm vi một `Topic` (`@@unique([roadmapId, slug])`). Khi di chuyển `Lesson` sang `Topic` khác hoặc đổi `slug` bài học, liên kết cũ và giá trị SEO bị đứt gãy; đồng thời các trang roadmap tải dữ liệu hoàn toàn ở client (`RoadmapWorkspace`), thiếu metadata/canonical riêng cho từng `Topic` và `Lesson`.

## Quyết định

- URL canonical của `Lesson` là `/lessons/[lessonSlug]` (độc lập với `Topic`); URL canonical của `Topic` giữ nguyên là `/topic/[topicSlug]`.
- `RoadmapItem.slug` là `@unique` toàn cục trên toàn bộ bảng `RoadmapItem`. Tên `Lesson` (`title`) vẫn chỉ cần duy nhất trong phạm vi một `Topic` (`@@unique([roadmapId, title])`, ADR-0009).
- Khi tạo `Lesson` mới có `slug` trùng với một bài học hoặc redirect đang tồn tại ở `Topic` khác, hệ thống tự động nối `-${topicSlug}`, nếu vẫn trùng thì nối `-2`, `-3`, …
- Đổi `title` của `Lesson` không tự động đổi `slug` hiện tại để giữ ổn định URL. Khi `Owner` chủ động sửa `slug`, hệ thống lưu `slug` cũ vào bảng `SlugRedirect` (`fromSlug -> targetId`) để đường dẫn cũ chuyển hướng thẳng 1 bước qua HTTP `308 Permanent Redirect`.
- Các đường dẫn cũ `/topic/[topicSlug]/[itemSlug]` và query `/?topic=...&item=...` trả HTTP `308` về `/lessons/[lessonSlug]` (hoặc `/topic/[topicSlug]` khi không có `item`).

## Consequences

- Di chuyển `Lesson` giữa các `Topic` không làm thay đổi URL bài học.
- Việc đẩy schema lên Turso (ADR-0005) cần chạy script `scripts/migrate-global-lesson-slugs.ts` (mặc định dry-run, ghi khi truyền `--apply` và có backup JSON) để xử lý mọi `slug` rỗng hoặc trùng giữa các `Topic` trước khi áp đặt unique index toàn cục.
- Roadmap Assistant (`roadmap-rag-assistant/`) sinh liên kết `/lessons/<slug>` khi trích dẫn `Lesson`, và bộ kiểm tra liên kết (`links.py`) chấp nhận cả `/lessons/<slug>` lẫn `/topic/<slug>`.
