# Docs index

Khi có mâu thuẫn, thứ tự ưu tiên là: **Core → Runbook → Working**. Một ADR `accepted` thắng mọi plan hay context cũ.

## Core: nguồn sự thật

| File | Nội dung |
|---|---|
| [`../GLOSSARY.md`](../GLOSSARY.md) | Thuật ngữ domain (chỉ thuật ngữ) |
| [`adr/`](adr/) | Quyết định kiến trúc |
| [`DEPLOY_ENV.md`](DEPLOY_ENV.md) | ENV của Vercel và Render |
| [`PROJECT_STRUCTURE.md`](PROJECT_STRUCTURE.md) | Cấu trúc thư mục |

Core docs được ghi trong buổi `/grill-with-docs` hoặc khi Owner yêu cầu (xem section "Core docs" trong `CLAUDE.md` / `AGENTS.md`).

### ADR

| # | Quyết định | Status |
|---|---|---|
| [0001](adr/0001-roadmap-assistant-separate-python-service.md) | Roadmap Assistant là service Python riêng | accepted |
| [0002](adr/0002-roadmap-assistant-access-via-proxy.md) | Chỉ nhận request qua proxy Next.js, quyền ghi theo Actor | accepted |
| [0003](adr/0003-langfuse-owns-feedback.md) | Langfuse là nơi duy nhất giữ Feedback và Golden Set | accepted |
| [0004](adr/0004-embeddings-always-gemini.md) | Embeddings luôn dùng Gemini | accepted |
| [0005](adr/0005-turso-for-production-database.md) | Turso cho database production | accepted |
| [0006](adr/0006-in-memory-vector-search.md) | Tìm kiếm vector trong bộ nhớ | accepted |
| [0007](adr/0007-glossary-accepts-synonyms.md) | Glossary chấp nhận tên đồng nghĩa qua `_Also_` | accepted |
| [0008](adr/0008-drop-level-group-by-name.md) | Bỏ Level, Group là nhóm Lesson có tên | superseded by ADR-0009 |
| [0009](adr/0009-topic-holds-lessons-by-section.md) | Topic chứa Lesson trực tiếp, Section thay cho Layer và Group | accepted |

## Runbook: cách setup / vận hành

- [`TURSO_SETUP.md`](TURSO_SETUP.md)
- [`R2_SETUP.md`](R2_SETUP.md)
- [`NOTION_FAVORITES_SETUP.md`](NOTION_FAVORITES_SETUP.md)
- [`NGINX_CACHE_STRATEGY.md`](NGINX_CACHE_STRATEGY.md)
- [`DYNAMIC_IMPORTS_GUIDE.md`](DYNAMIC_IMPORTS_GUIDE.md)

## Working: plan, context, fix log

Có thể đã cũ. Chỉ đọc khi cần lịch sử; quyết định còn hiệu lực sẽ được chuyển dần thành ADR.

- Backlog: [`RAG_PRODUCTION_READINESS.md`](RAG_PRODUCTION_READINESS.md)
- Workflow Builder: [`workflow-builder-design.md`](workflow-builder-design.md) (code tham chiếu), [`workflow-builder-context-v3.md`](workflow-builder-context-v3.md) (ADR-0006 tham chiếu)
- Backup: `backup*.md`, `backup6.json`

## Archive: đã xong, chỉ giữ làm lịch sử

[`archive/`](archive/):

- Roadmap Assistant: `abot-ux-plan.md`, `abot-followup-plan.md`
- Workflow Builder: `workflow-builder-plan.md`, `workflow-builder-handoff.md`, `workflow-builder-context.md`, `workflow-builder-context-v2.md`
- Fix log: `CACHE_BUSTING_FIX.md`, `FAVORITES_*.md`, `IMPLEMENTATION_SUMMARY.md`
- Checklist deploy auth giai đoạn 0: `Misc-context.md` (ENV đã chuyển sang [`DEPLOY_ENV.md`](DEPLOY_ENV.md))
