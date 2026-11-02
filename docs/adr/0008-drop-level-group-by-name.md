---
status: superseded by ADR-0009
---

# Bỏ Level, Group là nhóm Lesson có tên

Trước đây mỗi Group gắn với một Level (core, intermediate, advanced hoặc tên tuỳ chỉnh), và Lesson được xếp vào Group theo Level. Các commit `b999713` và `538dd0c` đã bỏ việc tự gán Level mặc định, nhưng Level vẫn là trục chính: modal, API và Roadmap Assistant đều hỏi "core, intermediate hay advanced?", còn tên Group chỉ là nhãn hiển thị của Level. Thực tế Owner muốn chia Lesson theo nhóm tuỳ ý ("Fundamentals", "Production", "Case study"), không phải theo độ khó, nên Level bị bỏ hẳn và Group được xác định bằng tên.

## Quyết định

- Group là nhóm Lesson có tên trong một Layer. Tên Group là duy nhất trong Layer (so khớp sau khi chuẩn hoá, và `@@unique([layerId, title])` ở DB).
- Tạo Lesson phải chỉ ra Group bằng `groupId`, hoặc bằng `groupTitle` (Group chưa có thì được tạo).
- Không chỉ ra Group nào: Layer có đúng một Group thì dùng Group đó, vì không còn lựa chọn nào khác nên đây không phải default ngầm. Layer chưa có Group hoặc có từ hai Group trở lên thì hỏi lại, kèm danh sách Group đang có.
- `KnowledgeTriage` lưu Group đích bằng `groupTitle`, vì Group có thể chưa tồn tại khi bản nháp được soạn.

## Consequences

- Cột `RoadmapGroup.level` và `KnowledgeTriage.level` bị drop. Script `scripts/drop-group-level.ts` chuẩn hoá title cũ (bỏ emoji đầu, ví dụ "🟢 Core" thành "Core"), gộp Group trùng tên trong cùng Layer rồi mới drop cột. Production Turso do Owner tự chạy sau khi xem dry-run.
- Next.js (`lib/roadmap/groups.ts`) và Roadmap Assistant (`adapters/groups.py`) áp dụng cùng một luật chọn Group, giữ đồng bộ bằng fixture chung `tests/data/group_cases.json`.
- Roadmap Assistant hỏi lại bằng `pending_group_choice` thay cho `pending_level_choice`; các từ "cơ bản", "nâng cao" không còn được hiểu là Level.
- Chữ "level" vẫn được dùng với nghĩa khác và không bị ảnh hưởng: mức log của Langfuse và loại entity (topic, layer, group, item) trong change review.
