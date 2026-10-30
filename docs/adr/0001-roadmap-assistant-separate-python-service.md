---
status: accepted
---

# Roadmap Assistant là service Python riêng

Roadmap Assistant chạy trong một service FastAPI riêng (`roadmap-rag-assistant/`), deploy tách khỏi Next.js, và đọc/ghi các Topic qua REST API `/api/v1/roadmaps/*` của Next.js thay vì truy cập thẳng database (2026-10-12, commit `de58f42`). Lý do: hệ sinh thái AI của Python (LangChain, router tiếng Việt), bộ eval và test chạy offline bằng pytest với job CI riêng (router contract, write safety, stress ratchet), và có thể release Roadmap Assistant độc lập với site.

## Considered Options

- **Viết ngay trong Next.js bằng TypeScript, như Cris AI**: bị loại. Cris AI chỉ trả lời từ Portfolio Knowledge nhỏ, còn Roadmap Assistant cần router nhiều tầng, Change có Preview và bộ eval lớn.

## Consequences

- Có hai nơi deploy và hai bộ ENV phải khớp nhau (xem `docs/DEPLOY_ENV.md`).
- Mọi Change của Roadmap Assistant đi qua cùng API và cùng kiểm tra quyền với UI.
- Tách service không giúp stream dài hơn: mọi request vẫn đi qua proxy Vercel, bị giới hạn 60 giây.
- LangGraph có trong dependency nhưng không được dùng; không phải lý do của quyết định này.
