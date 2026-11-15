# Backlog

Chỉ mục việc đang mở. Mỗi dòng trỏ tới nơi chứa chi tiết, không chép nội dung vào đây. Việc nào xong thì xoá dòng đó; nơi chứa chi tiết cũ thì ghi rõ trong dòng.

## Abot

- Lesson Status Step 6: Abot đọc trạng thái bài (chỉ Owner) và đổi trạng thái qua chat có Preview. Chi tiết: `.handoff/specs/TASK-lesson-status-001.md` Step 6; kịch bản test: `tests/manual/lesson-status.md`.
- Sửa bài qua chat ("chuyển bài X sang mục Y", "đổi tên bài X thành Y"): `docs/abot-next-actions-plan.md` mục 6.
- Ghi memory (`<conversation_history>`) vào trace: `docs/abot-next-actions-plan.md` mục 7.
- Siết ratchet router và thêm flow eval router vào map: `.handoff/specs/TASK-router-stress-001.md` (READY).

## Hạ tầng và deploy

- Langfuse legacy API sẽ bị gỡ ngày 2026-11-16, còn gọi ở `lib/ai/langfuse.ts:134` (`api.legacy.scoreV1.delete`): `docs/abot-next-actions-plan.md` mục 8. Lưu ý: code này dùng chung với luồng 👍/👎 của Cris AI, không được đổi behavior của luồng đó.

## Chờ Owner quyết định

- Mobile Android thật, 👍/👎 ở portfolio, gợi ý cập nhật nội dung bài, Visitor có thấy Lesson Status không: `.handoff/specs/TASK-lesson-status-001.md` mục 6.
- Các mục khác đang chờ quyết định: `docs/abot-next-actions-plan.md` mục "Việc đang chờ quyết định".

## Nội dung

- Pilot topic Next.js, 7 lesson (PROPOSED): `.handoff/specs/PLAN-nextjs-topic-pilot.md`.
