---
status: accepted
---

# Site chỉ dành cho Owner, bỏ Public News

Thay ADR-0018. Ngày 2026-11-23, Owner quyết định bỏ Public News: site không còn trang nào cho Visitor chưa đăng nhập đọc, trừ `/login` và các đường dẫn kỹ thuật (manifest, service worker, health check, cron). Hộp News Item riêng của Owner chuyển từ `/feed-ingestion` về `/news`, trang quản lý News Source về `/news/sources`.

Lý do: News phục vụ việc học cá nhân giống Topic và Lesson, chưa có nhu cầu công khai. Để `/news` công khai cạnh `/feed-ingestion` riêng tư làm đường dẫn dễ nhầm: link và shortcut PWA cũ `/news/sources` rơi vào trang public `/news/[slug]` và trả 404. Bỏ phần công khai thì middleware chỉ còn một luật, không còn trang nào phải chọn trường để tránh lộ dữ liệu của Owner.

## Considered Options

- Giữ Public News, chỉ thêm redirect cho các đường dẫn cũ: sửa được lỗi 404, nhưng vẫn giữ một bề mặt công khai chưa ai cần và hai tiền tố dễ nhầm.

## Consequences

- Cột `isPublic`, `publicAt` và `slug` của `NewsItem` vẫn giữ trong schema và dữ liệu, không migration. Code thôi đọc và ghi `isPublic`/`publicAt`. Muốn mở lại thì viết ADR mới.
- Link `/news/[slug]` đã chia sẻ ra ngoài sẽ dẫn về `/login`.
- `/feed-ingestion` redirect sang `/news` để bookmark cũ vẫn dùng được.
- Phần cách ly Visitor trong ADR-0002, ADR-0010, ADR-0012, ADR-0015, ADR-0017 vẫn giữ, như ADR-0018 đã ghi.
- Những việc còn treo từ ADR-0018 vẫn treo, cần Owner quyết riêng: route `/api/*` có header `x-internal-key`/`x-admin-key` phải tự kiểm quyền, và sitemap, robots, JSON-LD của Lesson vẫn giả định Visitor đọc được.
