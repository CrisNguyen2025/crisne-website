# Feed Ingestion: hộp chờ xử lý (bố cục A+B) và luồng thêm link

Phạm vi: `/feed-ingestion` sau TASK-news-inbox-ui-001 (đổi URL từ `/news` → `/feed-ingestion`). Gồm danh sách bên trái, panel xử lý bên phải, các tab Chờ xử lý / Để sau / Bỏ qua / Tất cả, và luồng Thêm link → worker → tóm tắt.

File liên quan: `components/news/NewsFeedClient.tsx`, `NewsCard.tsx`, `NewsReaderPanel.tsx`, `NewsDecisionBar.tsx`, `lib/news/queries.ts`, `lib/news/schemas.ts`, `lib/news/paths.ts`.

## Case

| ID | Bước | Kỳ vọng |
|---|---|---|
| N1 | Mở `/feed-ingestion` ở 1280px | Danh sách 520px bên trái, panel bài đầu tiên bên phải, thanh Bỏ qua / Để sau ở đáy panel, không cuộn ngang |
| N2 | Trong panel bấm Để sau | PATCH `{ isSaved: true }`, bài sang tab Để sau, panel tự chuyển sang bài kế |
| N3 | Tab Để sau → Đưa lại Chờ xử lý | PATCH `{ isSaved: false }`, số đếm về như cũ |
| N4 | Mở `/feed-ingestion` ở 375px, chạm một bài | Danh sách ẩn, màn xử lý có "← Danh sách", nút quyết định nằm một hàng |
| N5 | Thêm link `https://www.tiktok.com/@hudesign/video/7709495044721462536?is_from_webapp=1&sender_device=pc` | `/api/ingest` 202; bài hiện đầu danh sách với nhãn Trong hàng đợi → Đang tóm tắt; dải "1 link đang được tóm tắt"; xong thì có tiêu đề, TL;DR, ý chính, tag |
| N6 | Bấm Để sau ngay khi vừa mở bài (trong 3s đầu) | Nút không bị khoá vì auto-read |

## Ghi kết quả

### Lần chạy 2026-11-22 (chưa commit, nhánh `feat/news-ingest-phase-1` @ `a968b26` + working tree)

Môi trường: `yarn dev` cổng 3334, `DEV_OWNER_BYPASS`, worker `news_worker` cổng 8001, trình duyệt trong app Claude.

| ID | Kết quả | Ghi chú |
|---|---|---|
| N1 | Pass | Đo bằng JS: `scrollWidth <= innerWidth`, panel hiện bài đầu |
| N2 | Pass | Bài Grab sang Để sau (Chờ xử lý 3 → 2, Để sau 0 → 1), panel sang OpenMausBot |
| N3 | Pass | Số đếm về Chờ xử lý 3, Để sau 0 |
| N4 | Pass | Nút cao 36px (một hàng), không cuộn ngang |
| N5 | Pass | Ingest 202 sau 7,5s; worker `whisper`, `ready` sau khoảng 15s; tiêu đề "Mẹo thiết kế tinh tế: Tạo phân cấp thông tin và tăng độ tương phản chữ", 6 ý chính, 5 tag; dải đang tóm tắt tự tắt |
| N6 | Pass sau khi sửa | Lỗi 1 |

## Lỗi tìm thấy

1. Bấm Để sau trong 3s đầu bị bỏ qua vì PATCH auto-read khoá nút. Đã sửa: cập nhật đọc chạy nền (`isBackground`) trong `NewsFeedClient.tsx#applyItemUpdate`, chưa commit.
2. Tab chạy nền của trình duyệt không hydrate trang cho tới khi được đưa ra trước. Do trình duyệt hoãn, không phải lỗi code.

### Lần chạy 2026-11-22, lượt 2 (sau review của Dev, chưa commit)

Thay đổi: 3 tab Tất cả / Chờ xử lý / Đã xử lý, chỉ còn nút Bỏ qua, bỏ nút nhanh trên dòng, bấm cả dòng, Tag và Ghi chú sang cột phải, sửa mất data khi chuyển tab. Case N2, N3, N6 ở lượt 1 đã bị thay bằng N7–N10.

| ID | Bước | Kết quả | Ghi chú |
|---|---|---|---|
| N7 | Bấm vào giữa đoạn TL;DR của một dòng | Pass | `elementFromPoint` trúng nút phủ cả dòng, panel mở đúng bài |
| N8 | Chuyển tab liên tục 7 lần (cách nhau 150ms), dừng ở Đã xử lý | Pass | Danh sách chỉ còn bài của Đã xử lý, URL `?view=done` |
| N9 | Panel ở 1440 / 1280 / 375px | Pass | Cột phải 240px ở 1440 và 1280 (cột nội dung 408px ở 1280); ở 375 Tag và Ghi chú xuống dưới; không cuộn ngang |
| N10 | Thanh quyết định và dòng danh sách | Pass | Thanh chỉ có Bỏ qua; mỗi dòng có đúng 1 nút (nút phủ cả dòng) |

Lỗi 3: chuyển tab đôi khi hiện danh sách của tab cũ. Nguyên nhân: polling, refresh sau mỗi thao tác và effect đổi tab cùng `setData` với bộ lọc lúc bắt đầu, response chậm (Turso khoảng 2s) đè tab mới. Đã sửa trong `NewsFeedClient.tsx#loadFeed`, chưa commit; test: `tests/unit/news-feed-ui.test.tsx` › "keeps the new tab's list when a slow refresh of the old tab resolves later" (fail khi bỏ đoạn chặn).
