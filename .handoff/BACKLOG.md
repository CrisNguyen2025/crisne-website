# Backlog

Chỉ mục việc đang mở. Mỗi dòng trỏ tới nơi chứa chi tiết, không chép nội dung vào đây. Việc nào xong thì xoá dòng đó; nơi chứa chi tiết cũ thì ghi rõ trong dòng.

## Abot & Knowledge Acquisition

- Knowledge Acquisition Phase 3 (`KnowledgeRelation` / `Related Lessons`, `POST /internal/match-lessons`, Abot truy ngược `Lesson → External Source` cho Owner): code đã triển khai (2026-11-25). Còn bước Owner review dry-run rồi chạy `yarn db:knowledge-relations --apply` lên Turso: `.handoff/PLAN-knowledge-acquisition.md`.
- RSS/Atom nguồn ngoài (`/news`): Tier 1 (platform URL mapping, JSON Feed, dry-run `/api/news/sources/preview`, phân loại lỗi, xoá N+1 cron) đã triển khai (2026-11-25). Còn Tier 2–3 (`allowExternalLinks` + DNS pinning, per-source `fetchIntervalMinutes` & runner dày hơn 1 lần/ngày): `.handoff/RESEARCH-external-rss-config.md` (PROPOSAL).
- Abot đọc được toàn bộ Lesson (`TASK-abot-lesson-chunks-001`, đã lên `main` @ `0b8626f`): còn `deploy_steps` trên host production (`ADMIN_API_KEY`, persistent disk `EMBEDDING_CACHE_PATH`, thứ tự deploy Next.js trước Python) và kiểm case 9 trong `tests/manual/rag-index-sync.md`.
- Knowledge Acquisition Phase 2 (đa `sourceType`, R2 private snapshot, tách job `ingest`/`process`): hoãn tới khi Phase 1 & Phase 3 được dùng ổn định: `.handoff/PLAN-knowledge-acquisition.md`.

## Hạ tầng, Nhánh chưa merge & Test thủ công

- Worktree / nhánh chưa merge `feat/news-security-perf` (`aa6e367`, tách từ `e89aefc`): chờ Owner quyết định cherry-pick phần còn cần hay đóng worktree `.claude/worktrees/news-security-perf` và xoá nhánh.
- Hai nhánh cũ chưa merge vào `main` (`feat/roadmap-assistant-routing-quality`, `origin/feat/rag-layer-picker`): chờ Owner xác nhận giữ tham khảo hay dọn bỏ.
- Kịch bản manual test chưa chạy / cần re-run trên môi trường thật (`tests/manual/README.md`): `tests/manual/owner-memory.md` (M1–M9), `tests/manual/lesson-status.md`, và re-run N1–N10, N14 của `tests/manual/news-inbox.md` trên `/news`.

## Chờ Owner quyết định

- Mobile Android thật, 👍/👎 ở portfolio, Visitor có thấy Lesson Status không, và dọn các giả định cũ sau ADR-0019 (sitemap/robots/JSON-LD của Lesson): `.handoff/specs/TASK-lesson-status-001.md` mục 6, `docs/adr/0019-owner-only-site-no-public-news.md`.
- Chia chương Topic (`TASK-topic-chapters-001`, `DRAFT`): chờ chốt câu hỏi mục 0 và viết ADR: `.handoff/specs/TASK-topic-chapters-001.md`.
- Các mục đang chờ quyết định khác (câu 3 đổi techstack, câu 7 lịch sử chat qua deploy, bật lại `FEEDBACK_ENABLED`): `.handoff/PLAN-second-brain.md`, `docs/abot-next-actions-plan.md`.

## Nội dung

- Lộ trình tổng (second brain + trợ lý cá nhân): `.handoff/PLAN-second-brain.md`.
