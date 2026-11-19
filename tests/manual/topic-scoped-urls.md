# URL theo Topic `/[topicSlug]/[lessonSlug]#[headingSlug]` (ADR-0014)

Plan: [.handoff/PLAN-topic-scoped-urls.md](../../.handoff/PLAN-topic-scoped-urls.md)

## Kịch bản

| # | Bước | Kỳ vọng |
|---|---|---|
| U1 | Mở `/ai-architecture` | 200, canonical `https://crisne.blog/ai-architecture`, không còn link `/lessons/` hay `/topic/` |
| U2 | Mở `/ai-architecture/knowledge-base` | 200, canonical đúng URL, `data-roadmap-context` có `roadmapSlug=ai-architecture` |
| U3 | Mục lục trang Lesson | Anchor là slug từ text heading (`#vai-tro-cua-knowledge-base-trong-he-thong-ai`), bấm thì cuộn tới heading và URL đổi hash |
| U4 | `/lessons/knowledge-base`, `/topic/ai-architecture`, `/topic/ai-architecture?section=RAG`, `/topic/ai-architecture/knowledge-base`, `/?topic=ai-architecture&item=knowledge-base` | 308 một bước về URL mới, giữ `?section=` |
| U5 | `/backend-roadmap/knowledge-base` (topic sai) | 308 về `/ai-architecture/knowledge-base` |
| U6 | `/ai-architecture/sai-slug`, `/khong-co-topic` | 404 |
| U7 | `/notes`, `/portfolio`, `/llms.txt`, `/og-image.png`, `/sitemap.xml`, `/robots.txt` | Vẫn mở được (route tĩnh và file `public/` thắng `app/[topicSlug]`) |
| U8 | `/sitemap.xml` | Liệt kê `/[topic]` và `/[topic]/[lesson]` |
| U9 | Trang chủ | Link topic và "Mới cập nhật" trỏ URL mới |

## Ghi kết quả

### Lần chạy 1: 2026-11-19

- Commit: working tree chưa commit, trên `5baadeb`
- Môi trường: `yarn dev` (3334), `DEV_OWNER_BYPASS`, DB theo `.env.local`
- Cách chạy: `curl` lấy status và redirect, browser pane của Claude Code cho U1–U3 và U9

| Case | Kết quả |
|---|---|
| U1 | Pass |
| U2 | Pass |
| U3 | Pass |
| U4 | Pass |
| U5 | Pass |
| U6 | Pass |
| U7 | Pass |
| U8 | Pass |
| U9 | Pass |

Chưa test: chuyển Lesson sang Topic khác qua UI (chỉ có unit test `tests/unit/slug-and-section-combobox.test.tsx`), và link Abot sinh ra (Abot chưa đổi, dựa vào 308 của U4).
