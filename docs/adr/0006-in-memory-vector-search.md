---
status: proposed
---

# Tìm kiếm vector bằng cosine trong bộ nhớ, chưa dùng vector database

Cris AI, Roadmap Assistant và kiến thức của Workflow Builder đều so khớp vector bằng cosine trong bộ nhớ của tiến trình, không dùng vector database. Cách này đủ với lượng kiến thức nhỏ hiện tại và không thêm hạ tầng. Cần xác nhận ngưỡng kích thước kiến thức mà khi vượt qua thì chuyển sang vector database (pgvector, Turso vector hoặc Qdrant).

## Consequences

- Mỗi instance tự load toàn bộ vector khi khởi động; kiến thức càng lớn thì cold start càng chậm và tốn RAM.
