# Backlog

Chỉ mục việc đang mở. Mỗi dòng trỏ tới nơi chứa chi tiết, không chép nội dung vào đây. Việc nào xong thì xoá dòng đó; nơi chứa chi tiết cũ thì ghi rõ trong dòng.

## Abot

- Lesson Status Step 6: Abot đọc trạng thái bài (chỉ Owner) và đổi trạng thái qua chat có Preview. Chi tiết: `.handoff/specs/TASK-lesson-status-001.md` Step 6; kịch bản test: `tests/manual/lesson-status.md`.
- Sửa bài qua chat ("chuyển bài X sang mục Y", "đổi tên bài X thành Y"): `docs/abot-next-actions-plan.md` mục 6.
- Siết ratchet router và thêm flow eval router vào map: `.handoff/specs/TASK-router-stress-001.md` (READY).

- Knowledge Acquisition: đưa News Item vào Lesson kèm Provenance (Phase 1), Abot nối Lesson và truy ngược nguồn (Phase 3). Phase 1 đã commit (`e83534e`) và đã chạy migration Turso (2026-11-23), còn test thủ công (`tests/manual/knowledge-provenance.md`); Phase 3 chưa bắt đầu: `.handoff/PLAN-knowledge-acquisition.md`.

## Hạ tầng và deploy

- Bỏ Public News, chuyển hộp News riêng từ `/feed-ingestion` về `/news` (ADR-0019): code xong trên `feat/owner-only-news`, chờ Owner commit: `.handoff/specs/TASK-owner-only-news-001.md`.

- `GET /api/v1/roadmaps/full-export` và `GET /api/v1/roadmaps` chưa tự kiểm quyền, mà middleware cho qua mọi request chỉ cần có header key: ADR-0018 mục Consequences (ADR-0019 giữ nguyên việc này), `.handoff/PLAN-knowledge-acquisition.md` quyết định 12.

- Langfuse legacy API sẽ bị gỡ ngày 2026-11-16, còn gọi ở `lib/ai/langfuse.ts:134` (`api.legacy.scoreV1.delete`): `docs/abot-next-actions-plan.md` mục 8. Lưu ý: code này dùng chung với luồng 👍/👎 của Cris AI, không được đổi behavior của luồng đó.

## Chờ Owner quyết định

- Mobile Android thật, 👍/👎 ở portfolio, gợi ý cập nhật nội dung bài, Visitor có thấy Lesson Status không: `.handoff/specs/TASK-lesson-status-001.md` mục 6.
- Các mục khác đang chờ quyết định: `docs/abot-next-actions-plan.md` mục "Việc đang chờ quyết định".

## Nội dung

- Lộ trình tổng (second brain + trợ lý cá nhân): `.handoff/PLAN-second-brain.md`.

- Pilot topic Next.js, 7 lesson (PROPOSED): `.handoff/specs/PLAN-nextjs-topic-pilot.md`.
