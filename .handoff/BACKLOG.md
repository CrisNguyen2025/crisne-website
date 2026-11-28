# Backlog

Chỉ mục việc đang mở. Mỗi dòng trỏ tới nơi chứa chi tiết, không chép nội dung vào đây. Việc nào xong thì xoá dòng đó; nơi chứa chi tiết cũ thì ghi rõ trong dòng.

## Abot & Knowledge Acquisition

- Nút `+ Add Context` góc trái Abot (`Actions` Slash kèm `/quiz` suggest `Topic` + kết nối 1 `Gmail Connector` với Agent + cột `ThreadMessage.contextJson`): code, schema, test tự động UI/route/Python và sync map đã hoàn tất (2026-11-27). Còn bước Owner review dry-run rồi chạy `yarn db:abot-context-connector --apply` lên Turso, thêm `CONNECTOR_ENCRYPTION_KEY` + Redirect URI `/api/v1/connectors/gmail/callback` trên Vercel/GCP, và chạy manual test thật `AC-4` trong `tests/manual/abot-add-context.md`: `.handoff/PLAN-abot-add-context.md`, `docs/adr/0021-abot-add-context-slash-actions-and-gmail-connector.md`.

- Rovo Owner Memory (`ADR-0020`): code, schema, evals và test tự động đã hoàn tất (2026-11-26). Còn bước Owner review dry-run rồi chạy `yarn db:rovo-owner-memory --apply` lên Turso và chạy manual test `M14–M17` trong `tests/manual/owner-memory.md`: `docs/adr/0020-rovo-owner-memory-and-observations.md`.
- Knowledge Acquisition Phase 3 (`KnowledgeRelation` / `Related Lessons`, `POST /internal/match-lessons`, Abot truy ngược `Lesson → External Source` cho Owner): code và schema Turso (`KnowledgeRelation`) đã hoàn tất (xác nhận `yarn db:knowledge-relations` dry-run `Schema already up to date` ngày 2026-11-26): `.handoff/PLAN-knowledge-acquisition.md`.
- RSS/Atom nguồn ngoài (`/news`): Tier 1 (platform URL mapping, JSON Feed, dry-run `/api/news/sources/preview`, phân loại lỗi, xoá N+1 cron) đã triển khai (2026-11-25). Còn Tier 2–3 (`allowExternalLinks` + DNS pinning, per-source `fetchIntervalMinutes` & runner dày hơn 1 lần/ngày): `.handoff/RESEARCH-external-rss-config.md` (PROPOSAL).
- Abot đọc được toàn bộ Lesson (`TASK-abot-lesson-chunks-001`, đã lên `main` @ `0b8626f`): còn `deploy_steps` trên host production (`ADMIN_API_KEY`, persistent disk `EMBEDDING_CACHE_PATH`, thứ tự deploy Next.js trước Python) và kiểm case 9 trong `tests/manual/rag-index-sync.md`.
- Worker `/news` chưa đọc được bài ảnh TikTok (`/photo/`, slideshow): yt-dlp báo `Unsupported URL` nên ra `metadata_only`. Đã commit trên nhánh `fix/tiktok-photo-post` (2026-11-28, chưa merge `main`), còn merge và chạy manual `N15` trong `tests/manual/news-inbox.md`: `.handoff/specs/TASK-tiktok-photo-post-001.md`.
- Knowledge Acquisition Phase 2 (đa `sourceType`, R2 private snapshot, tách job `ingest`/`process`): hoãn tới khi Phase 1 & Phase 3 được dùng ổn định: `.handoff/PLAN-knowledge-acquisition.md`.

## Hạ tầng, Nhánh chưa merge & Test thủ công

- Nhánh chưa merge còn giữ chờ review: `feat/visual-hierarchy` (`fc7bb4b`, worktree `.claude/worktrees/visual-hierarchy`). Hai ref local `[gone]` còn lại (`feat/news-security-perf`, `feat/roadmap-assistant-routing-quality`, đã xoá remote/worktree) chờ Owner chạy `git branch -D` nếu muốn xoá nốt ref local.
- Kịch bản manual test chưa chạy / cần re-run trên môi trường thật (`tests/manual/README.md`): `tests/manual/owner-memory.md` (M1–M17), `tests/manual/lesson-status.md`, và re-run N1–N10, N14 của `tests/manual/news-inbox.md` trên `/news`.
- AgentAdapter & handoff v3 (đã lên `main` @ `e1a7ce2`): còn test thủ công `tests/manual/agent-handoff.md` E4–E6, E8 và `tests/manual/agent-adapter.md` T1–T4 (T5, T6 mới một phần); chưa xác nhận step `yarn agents:sync --check` của CI chạy xanh trên `main`. Plan: `.handoff/PLAN-agent-adapter.md`.

- Theme Apple / Railway / PostHog cho roadmap/news (2026-11-27, chưa commit): còn T6 `/news` chưa test được vì `dev.db` local thiếu cột `NewsItem.slug`. Nếu `PLAN-brand-design-system-unification` Phase 1 bỏ `.roadmap-theme`, phải đổi selector trong `app/styles/{apple,railway,posthog}-theme.css` sang `:root`: `tests/manual/design-theme.md`, `docs/design-system.md` mục "Theme Apple".

## Chờ Owner quyết định

- Thống nhất Brand Concept & Semantic Design Tokens: chờ Phase 0 (wireframe 4 option rồi 2 option, Owner chọn, chốt Q2–Q5) trước khi tách `TASK-*`. Portfolio/Cris AI ngoài phạm vi; sau Phase 1 Portfolio có thể lệch màu vì còn dùng `--color-steel*`, chấp nhận tới khi mở lại phạm vi: `.handoff/PLAN-brand-design-system-unification.md`.
- Mobile Android thật, 👍/👎 ở portfolio, Visitor có thấy Lesson Status không, và dọn các giả định cũ sau ADR-0019 (sitemap/robots/JSON-LD của Lesson): `.handoff/specs/TASK-lesson-status-001.md` mục 6, `docs/adr/0019-owner-only-site-no-public-news.md`.
- Chia chương Topic (`TASK-topic-chapters-001`, `DRAFT`): chờ chốt câu hỏi mục 0 và viết ADR: `.handoff/specs/TASK-topic-chapters-001.md`.
- Các mục đang chờ quyết định khác (câu 3 đổi techstack, câu 7 lịch sử chat qua deploy, bật lại `FEEDBACK_ENABLED`): `.handoff/PLAN-second-brain.md`, `docs/abot-next-actions-plan.md`.

## Nội dung

- Lộ trình tổng (second brain + trợ lý cá nhân): `.handoff/PLAN-second-brain.md`.
