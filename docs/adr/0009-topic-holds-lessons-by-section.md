---
status: accepted
---

# Topic chứa Lesson trực tiếp, Section thay cho Layer và Group

ADR-0008 bỏ Level và đặt tên Group, nhưng vẫn giữ bốn cấp Topic → Layer → Group → Lesson. Mỗi Lesson phải có đủ Layer (với short tag), rồi Group, trước khi được lưu. Hệ quả: Topic mới không nhận được bài cho đến khi có Layer; Roadmap Assistant phải hỏi lại "layer nào?" rồi "nhóm nào?"; `KnowledgeTriage` phải mang theo ba trường đích (`layerId`, `layerTag`, `groupTitle`); và có một lớp từ vựng riêng cho Layer và shortTag trong router. Mục tiêu hiện tại là một kho kiến thức cá nhân, lưu trữ trước, tìm kiếm sâu sau. Bốn cấp là nhiều hơn mục tiêu đó cần.

## Quyết định

- Lesson thuộc thẳng một Topic. Không còn Layer và Group.
- Lesson có một trường `section` tuỳ chọn, là chuỗi tự do. Lesson không có section thuộc nhóm chung của Topic.
- So khớp section theo `normalizeTitle()` (không phân biệt hoa thường và khoảng trắng). Khi lưu, dùng lại đúng cách viết của section đã có.
- Thứ tự section là thứ tự của Lesson đầu tiên trong section. Không có bảng section riêng; nếu sau này cần mô tả hay thứ tự riêng thì tách bảng khi đó.
- Tên Lesson là duy nhất trong một Topic.
- `shortCode` của Topic bị bỏ; slug là định danh.
- `KnowledgeTriage` lưu đích bằng `section` (và `roadmapSlug`).
- Đổi tên một section là một thao tác trên mọi Lesson của section đó.

## Consequences

- Bảng `RoadmapLayer` và `RoadmapGroup` bị bỏ. Migration gộp dữ liệu hiện có: Lesson lấy section là tên Layer, hoặc "Layer · Group" khi Layer có nhiều Group. Script `scripts/flatten-to-sections.ts` chạy thử mặc định và chỉ ghi khi có `--apply`. Turso production do Owner xác nhận sau khi xem dry-run.
- Thay thế `scripts/drop-group-level.ts` (migration của ADR-0008, chưa chạy trên Turso).
- Next.js bỏ các route layer và group, và `lib/roadmap/groups.ts`. Roadmap Assistant bỏ `adapters/groups.py`, các tool layer và group, và luật chọn Layer hay Group.
- Từ "layer" và "group" vẫn có thể xuất hiện trong lịch sử git và trong ADR-0008.
- ADR-0008 được đánh dấu `superseded by ADR-0009`. Nội dung của ADR-0008 không đổi.
