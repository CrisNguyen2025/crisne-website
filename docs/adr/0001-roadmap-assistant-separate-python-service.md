---
status: proposed
---

# Roadmap Assistant là service Python riêng

Roadmap Assistant chạy trong một service FastAPI riêng (`roadmap-rag-assistant/`), deploy tách khỏi Next.js, và đọc/ghi Roadmap qua REST API `/api/v1/roadmaps/*` của Next.js thay vì truy cập thẳng database (quyết định ngày 2026-10-12, commit `de58f42`). Cris AI thì vẫn chạy ngay trong Next.js. Lý do chọn Python và tách service chưa được ghi lại; cần xác nhận trong buổi `/grill-with-docs` trước khi chuyển sang `accepted`.

## Consequences

- Có hai nơi deploy và hai bộ ENV phải khớp nhau (xem `docs/DEPLOY_ENV.md`).
- Mọi thay đổi Roadmap của Roadmap Assistant đi qua cùng API và cùng kiểm tra quyền với UI.
