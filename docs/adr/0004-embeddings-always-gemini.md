---
status: accepted
---

# Embeddings luôn dùng Gemini, tách khỏi provider chat

Provider chat có thể đổi giữa Gemini và Groq qua ENV, nhưng embeddings luôn dùng Gemini. Vector của Portfolio Knowledge được tính sẵn và commit vào repo, CI kiểm tra index còn khớp; ngưỡng phân loại Scope của Roadmap Assistant cũng được tinh chỉnh trên embeddings này. Đổi model embeddings đồng nghĩa với phải index lại toàn bộ và tinh chỉnh lại ngưỡng, nên không đổi theo provider chat.

## Consequences

- `GEMINI_API_KEY` luôn bắt buộc ở cả Vercel và Render, kể cả khi chat chạy bằng Groq.
