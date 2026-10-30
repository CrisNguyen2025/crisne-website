---
status: accepted
---

# Turso (SQLite qua libsql) cho database production

Từ 2026-09-26 (commit `a38fea1`), production dùng Turso thông qua driver adapter libsql của Prisma, còn local chạy file SQLite. Repo vốn dùng SQLite từ đầu, nên Turso là đường ngắn nhất lên production: giữ một schema Prisma và một dialect cho cả hai môi trường, kết nối qua mạng mà không cần connection pool (hợp với serverless trên Vercel), và có gói free.

## Consequences

- `prisma migrate` không chạy thẳng trên Turso; schema được đẩy bằng `yarn db:turso:init`, và bước này chưa nằm trong quy trình deploy.
- Không dùng được các tính năng chỉ có ở Postgres (pgvector, JSON operator).
