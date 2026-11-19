---
status: accepted
---

# URL theo Topic /[topicSlug]/[lessonSlug] và anchor heading theo slug

ADR-0013 tách URL thành hai nhánh: `Topic` ở `/topic/[topicSlug]`, `Lesson` ở `/lessons/[lessonSlug]`. Hai nhánh này không cho thấy `Lesson` thuộc `Topic` nào (ADR-0009). Anchor tới một đoạn trong `Lesson` lại là số thứ tự (`#h-1`, `#h-2`, … do `withHeadingIds` sinh), nên chèn hoặc xoá một heading phía trên làm mọi link đã chia sẻ trỏ sai đoạn. Từ 2026-11-19, Owner chọn một cây URL duy nhất theo `Topic`, có anchor đọc được và ổn định.

## Quyết định

- URL canonical của `Topic` là `/[topicSlug]`. URL canonical của `Lesson` là `/[topicSlug]/[lessonSlug]`. Link tới một đoạn trong `Lesson` là `/[topicSlug]/[lessonSlug]#[headingSlug]`.
- `headingSlug` là id của heading `h2`/`h3` trong nội dung `Lesson`, sinh từ text heading: bỏ dấu tiếng Việt, chữ thường, kebab-case; trùng trong cùng một `Lesson` thì nối `-2`, `-3`, … Fragment này không phải `Section` (ADR-0009). `Section` vẫn là query `?section=` trên trang `Topic`.
- Giữ nguyên từ ADR-0013: `RoadmapItem.slug` duy nhất toàn cục, đổi `title` không tự đổi `slug`, bảng `SlugRedirect` cho `slug` cũ. Trang `Lesson` tìm bài theo `lessonSlug`. Nếu `topicSlug` trên URL không phải `Topic` hiện tại của bài, hoặc `lessonSlug` là `slug` cũ, trả HTTP `308` một bước về URL canonical.
- `Topic.slug` không được trùng segment gốc mà app đang dùng (`api`, `lessons`, `topic`, `notes`, `portfolio`, `login`, `_next`). Danh sách này nằm ở một chỗ trong code. Khi tạo `Topic` có `slug` trùng, hệ thống nối `-topic`.
- Đường dẫn cũ trả HTTP `308` về URL mới: `/topic/[topicSlug]`, `/topic/[topicSlug]/[itemSlug]`, `/lessons/[lessonSlug]`, và query `/?topic=...&item=...`.
- Roadmap Assistant (`roadmap-rag-assistant/`) chưa đổi trong quyết định này. Link `/lessons/<slug>` và `/topic/<slug>` nó sinh ra vẫn mở được nhờ `308`. Việc chuyển Roadmap Assistant sang URL mới làm sau.

## Considered Options

- Giữ ADR-0013 (`/lessons/[lessonSlug]`), chỉ đổi anchor: URL không phản ánh `Topic`. Owner đã loại.
- Giữ tiền tố `/topic/[topicSlug]/[lessonSlug]`: không phải chặn slug trùng route gốc, nhưng Owner chọn URL ở gốc site.

## Consequences

- Chuyển `Lesson` sang `Topic` khác làm đổi URL canonical của bài (ngược với ADR-0013). URL cũ vẫn tới được qua `308` vì bài được tìm theo `lessonSlug`, không cần bảng mới.
- Thêm một route gốc mới trong `app/` thì phải thêm tên đó vào danh sách slug cấm, và kiểm tra không có `Topic` nào đang dùng slug đó.
- Sửa text của một heading làm đổi anchor của heading đó. Các heading khác không bị ảnh hưởng.
- Không đổi schema, không cần migration Turso (ADR-0005).
- ADR-0013 được đánh dấu `superseded by ADR-0014`. Nội dung của ADR-0013 không đổi.
