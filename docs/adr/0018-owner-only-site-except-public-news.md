---
status: accepted
---

# Site chỉ dành cho Owner, trừ Public News

Từ commit `d01612a` (2026-11-10), middleware bắt đăng nhập cho mọi trang và API, trừ `/login`, Public News (`/news`, `/news/[slug]`) và vài đường dẫn kỹ thuật (manifest, service worker, health check, cron). Ngày 2026-11-23, Owner xác nhận đây là chủ ý: Topic, Lesson và Roadmap Assistant đang phục vụ mục tiêu học tập cá nhân, nên chỉ Owner dùng. Public News là phần duy nhất Visitor đọc được.

## Considered Options

- Mở lại Topic và Lesson cho Visitor, chỉ giữ riêng dữ liệu của Owner (Lesson Status, Owner Memory, provenance): khớp với sitemap và SEO đang có, nhưng Owner chưa muốn công khai kho tri thức.

## Consequences

- Phần cách ly Visitor đã có (ADR-0002, ADR-0010, ADR-0012, ADR-0015, ADR-0017) vẫn giữ. Nó là lớp phòng thủ thứ hai, và vẫn đúng nếu sau này site mở lại.
- Middleware cho qua mọi request `/api/*` có header `x-internal-key` hoặc `x-admin-key` mà không kiểm giá trị. Route nào cần riêng tư phải tự kiểm quyền. `GET /api/v1/roadmaps/full-export` và `GET /api/v1/roadmaps` hiện chưa kiểm, cần sửa.
- Vài chỗ vẫn giả định Visitor đọc được Lesson: `app/sitemap.ts` liệt kê mọi Lesson, `app/robots.ts` cho phép `/`, trang Lesson có JSON-LD và OpenGraph, proxy Roadmap Assistant ghi chú "Public on purpose" và có rate limit cho Visitor. Dọn hay giữ những chỗ này là việc riêng, cần Owner quyết định.
- Visitor không còn vào được Roadmap Assistant từ trình duyệt, nên các luồng Visitor của nó chỉ còn kiểm được qua test.
