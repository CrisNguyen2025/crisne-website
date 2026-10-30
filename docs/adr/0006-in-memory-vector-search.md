---
status: accepted
---

# Tìm kiếm vector bằng cosine trong bộ nhớ, chưa dùng vector database

Cris AI, Roadmap Assistant và Workflow Builder đều so khớp vector bằng cosine trong bộ nhớ của tiến trình, không dùng vector database. Lượng kiến thức hiện nhỏ (Portfolio Knowledge 17 chunk, khoảng 100 Lesson), nên cách này đủ nhanh và không thêm hạ tầng. Mỗi hệ thống chỉ chuyển khi chạm ngưỡng riêng dưới đây.

| Hệ thống | Khi nào xem lại | Bước tiếp theo |
|---|---|---|
| Cris AI | Ngoài phạm vi; chỉ xem lại nếu Portfolio Knowledge được sinh tự động | — |
| Roadmap Assistant | Index đầy đủ sau mỗi lần deploy mất hơn 5 phút (khoảng 500 Lesson với Gemini free tier) | Lưu cache embedding bền vững trước; chỉ cân nhắc vector database khi đã có cache mà tìm kiếm vẫn chậm |
| Workflow Builder | Một Project vượt 2.000 Chunk | Spike vector native của Turso; chỉ chuyển nếu recall Top-4 ≥95% so với quét toàn bộ và nhanh hơn ≥50ms |

## Considered Options

- Turso vector, Postgres + pgvector, Qdrant, Upstash, Pinecone (`docs/workflow-builder-context-v3.md`): chưa cần ở quy mô hiện tại. Turso vector được ưu tiên spike trước vì không thêm hạ tầng (ADR-0005).

## Consequences

- Mỗi instance tự load toàn bộ vector khi khởi động; kiến thức càng lớn thì cold start càng chậm và tốn RAM.
- Roadmap Assistant embed lại mọi Lesson sau mỗi lần deploy trên Render, vì cache embedding nằm trên filesystem tạm. Trong lúc đó, sau 3 giây chờ, nó tìm kiếm bằng full-text thay vì theo nghĩa, và tốn quota embedding của Gemini.
