# Docs index

Khi có mâu thuẫn, thứ tự ưu tiên là: **Core → Runbook → Working**. Một ADR `accepted` thắng mọi plan hay context cũ.

## Core: nguồn sự thật

| File                                                                   | Nội dung                                           |
| ---------------------------------------------------------------------- | -------------------------------------------------- |
| [`../GLOSSARY.md`](../GLOSSARY.md)                                     | Thuật ngữ domain (chỉ thuật ngữ)                   |
| [`adr/`](adr/)                                                         | Quyết định kiến trúc                               |
| [`code-intel/CRIS_WORKSPACE_MAP.md`](code-intel/CRIS_WORKSPACE_MAP.md) | Bản đồ kiến trúc & luồng xử lý logic của workspace |
| [`DEPLOY_ENV.md`](DEPLOY_ENV.md)                                       | ENV của Vercel và Render                           |
| [`PROJECT_STRUCTURE.md`](PROJECT_STRUCTURE.md)                         | Cấu trúc thư mục                                   |

Core docs được ghi trong buổi `/grill-with-docs` hoặc khi Owner yêu cầu (xem section "Core docs" trong `CLAUDE.md` / `AGENTS.md`).

### ADR

| #                                                             | Quyết định                                                   | Status                 |
| ------------------------------------------------------------- | ------------------------------------------------------------ | ---------------------- |
| [0001](adr/0001-roadmap-assistant-separate-python-service.md) | Roadmap Assistant là service Python riêng                    | accepted               |
| [0002](adr/0002-roadmap-assistant-access-via-proxy.md)        | Chỉ nhận request qua proxy Next.js, quyền ghi theo Actor     | accepted               |
| [0003](adr/0003-langfuse-owns-feedback.md)                    | Langfuse là nơi duy nhất giữ Feedback và Golden Set          | superseded by ADR-0011 |
| [0004](adr/0004-embeddings-always-gemini.md)                  | Embeddings luôn dùng Gemini                                  | accepted               |
| [0005](adr/0005-turso-for-production-database.md)             | Turso cho database production                                | accepted               |
| [0006](adr/0006-in-memory-vector-search.md)                   | Tìm kiếm vector trong bộ nhớ                                 | accepted               |
| [0007](adr/0007-glossary-accepts-synonyms.md)                 | Glossary chấp nhận tên đồng nghĩa qua `_Also_`               | accepted               |
| [0008](adr/0008-drop-level-group-by-name.md)                  | Bỏ Level, Group là nhóm Lesson có tên                        | superseded by ADR-0009 |
| [0009](adr/0009-topic-holds-lessons-by-section.md)            | Topic chứa Lesson trực tiếp, Section thay cho Layer và Group | accepted               |
| [0010](adr/0010-lesson-status-known-learning-target.md)       | Lesson có trạng thái: target, learning, known                | accepted               |
| [0011](adr/0011-drop-knowledge-triage.md)                     | Bỏ Knowledge Triage, Langfuse vẫn giữ Feedback và Golden Set | accepted               |

## Runbook: cách setup / vận hành

- [`TURSO_SETUP.md`](TURSO_SETUP.md)
- [`R2_SETUP.md`](R2_SETUP.md)
- [`NOTION_FAVORITES_SETUP.md`](NOTION_FAVORITES_SETUP.md)
- [`NGINX_CACHE_STRATEGY.md`](NGINX_CACHE_STRATEGY.md)
- [`DYNAMIC_IMPORTS_GUIDE.md`](DYNAMIC_IMPORTS_GUIDE.md)

## Working: plan, context, fix log

Có thể đã cũ. Chỉ đọc khi cần lịch sử; quyết định còn hiệu lực sẽ được chuyển dần thành ADR.

- Backlog: [`RAG_PRODUCTION_READINESS.md`](RAG_PRODUCTION_READINESS.md)

## Archive: đã xong, chỉ giữ làm lịch sử

[`archive/`](archive/):

- Roadmap Assistant: `abot-ux-plan.md`, `abot-followup-plan.md`
- Workflow Builder: `workflow-builder-plan.md`, `workflow-builder-handoff.md`, `workflow-builder-context.md`, `workflow-builder-context-v2.md`, `workflow-builder-design.md`, `workflow-builder-context-v3.md`
- Fix log: `CACHE_BUSTING_FIX.md`, `FAVORITES_*.md`, `IMPLEMENTATION_SUMMARY.md`
- Checklist deploy auth giai đoạn 0: `Misc-context.md` (ENV đã chuyển sang [`DEPLOY_ENV.md`](DEPLOY_ENV.md))
