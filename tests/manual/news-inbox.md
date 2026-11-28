# Feed Ingestion: hộp chờ xử lý (bố cục A+B) và luồng thêm link

Phạm vi: `/news` (ADR-0019, TASK-owner-only-news-001: inbox về lại `/news`, `/feed-ingestion` redirect sang; trước đó TASK-news-inbox-ui-001 đổi `/news` → `/feed-ingestion`). Gồm danh sách bên trái, panel xử lý bên phải, các tab Chờ xử lý / Để sau / Bỏ qua / Tất cả, và luồng Thêm link → worker → tóm tắt.

File liên quan: `components/news/NewsFeedClient.tsx`, `NewsCard.tsx`, `NewsReaderPanel.tsx`, `NewsDecisionBar.tsx`, `lib/news/queries.ts`, `lib/news/schemas.ts`, `lib/news/paths.ts`.

## Case

| ID | Bước | Kỳ vọng |
|---|---|---|
| N1 | Mở `/news` ở 1280px | Danh sách 520px bên trái, panel bài đầu tiên bên phải, thanh Bỏ qua / Để sau ở đáy panel, không cuộn ngang |
| N2 | Trong panel bấm Để sau | PATCH `{ isSaved: true }`, bài sang tab Để sau, panel tự chuyển sang bài kế |
| N3 | Tab Để sau → Đưa lại Chờ xử lý | PATCH `{ isSaved: false }`, số đếm về như cũ |
| N4 | Mở `/news` ở 375px, chạm một bài | Danh sách ẩn, màn xử lý có "← Danh sách", nút quyết định nằm một hàng |
| N5 | Thêm link `https://www.tiktok.com/@hudesign/video/7709495044721462536?is_from_webapp=1&sender_device=pc` | `/api/ingest` 202; bài hiện đầu danh sách với nhãn Trong hàng đợi → Đang tóm tắt; dải "1 link đang được tóm tắt"; xong thì có tiêu đề, TL;DR, ý chính, tag |
| N6 | Bấm Để sau ngay khi vừa mở bài (trong 3s đầu) | Nút không bị khoá vì auto-read |
| N11 | Mở `/feed-ingestion?view=saved` và `/feed-ingestion/sources` | 308 sang `/news?view=saved` và `/news/sources`, giữ query |
| N12 | Mở `/news`, `/news/sources`, `/news/<slug-bất-kỳ>` khi chưa đăng nhập (cửa sổ ẩn danh) | 307 về `/login?callbackUrl=<đường dẫn>`, không còn trang tin công khai |
| N13 | Reader của một bài `ready` | Không còn nút "Public"/"Đang public", danh sách không còn badge Public; "Đưa vào Lesson" vẫn có |
| N14 | Shortcut PWA (cài lại app trên Android) "Feed Ingestion" và "RSS Sources" | Mở đúng `/news` và `/news/sources` |
| N15 | Thêm link bài ảnh TikTok `https://www.tiktok.com/@trihuynh.dev2026/photo/7712881150922247445`, sau đó chạy lại với "Đọc sâu" (`forceDeep`) | Lần đầu: `extractionMethod` là `description` (caption 1051 ký tự), có tiêu đề, TL;DR, ý chính, tag, không còn lỗi `Unsupported URL`. Đọc sâu: `vision`, nội dung có chữ đọc từ slide ("Ảnh 1: ..."). Không lấy được ảnh thì lỗi có tiền tố `[PHOTO_POST]` (TASK-tiktok-photo-post-001) |
| N16 | Mở một bài đang lỗi (`partial`/`failed`, có dòng lỗi đỏ) trong panel đọc, bấm Thử lại | Nút nằm dưới dòng lỗi, đổi thành "Đang gửi lại" và bị khoá khi đang gửi; `POST /api/news/<id>/reingest` body `{"forceDeep":false}` trả 202; toast "Đã đưa bài vào hàng đợi tóm tắt lại"; bài chuyển sang Trong hàng đợi → Đang tóm tắt. Bài `ready` không có lỗi thì không hiện nút |

## Ghi kết quả

### Lần chạy 2026-11-23 (chưa commit, nhánh `feat/owner-only-news` @ `4a3a8a2` + working tree, TASK-owner-only-news-001)

Môi trường: `yarn dev` cổng 3334, `DEV_OWNER_BYPASS`, `TURSO_DATABASE_URL` để trống, SQLite copy trong scratchpad (đã `prisma db push`, 1 bài `ready` có `isPublic=1` để kiểm UI không còn hiện).

| ID | Kết quả | Ghi chú |
|---|---|---|
| N11 | Pass | `curl`: `/feed-ingestion?view=saved` → 308 `/news?view=saved`; `/feed-ingestion/sources` → 308 `/news/sources`; `/news`, `/news/sources` 200; `/news/<slug>` 404 |
| N12 | Chưa chạy (trình duyệt) | Server dùng `DEV_OWNER_BYPASS`. Đã khoá bằng test: `tests/route/middleware.test.ts` › "redirects signed-out requests for /news pages to /login" |
| N13 | Pass | Danh sách không có badge Public; reader có "Mở nguồn gốc", "Đưa vào Lesson", "Xoá", không có "Public"/"Đang public" |
| N14 | Chưa chạy | Cần Android thật |

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
