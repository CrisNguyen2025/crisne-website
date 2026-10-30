---
status: proposed
---

# Turso (SQLite qua libsql) cho database production

Từ 2026-09-26 (commit `a38fea1`), production dùng Turso thông qua driver adapter libsql của Prisma, còn local chạy file SQLite; cùng một schema SQLite cho cả hai môi trường. Lý do chọn Turso thay vì Postgres (ví dụ Neon hoặc Supabase) chưa được ghi lại; cần xác nhận trong buổi `/grill-with-docs` trước khi chuyển sang `accepted`.

## Consequences

- `prisma migrate` không chạy thẳng trên Turso; schema được đẩy bằng `yarn db:turso:init`, và bước này chưa nằm trong quy trình deploy.
- Không dùng được các tính năng chỉ có ở Postgres (pgvector, JSON operator).
