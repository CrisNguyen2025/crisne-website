# Manual Test: Global Search / Command Palette (`Cmd+K`)

Kiểm tra tìm kiếm toàn cục (`GlobalSearchPalette` + `GET /api/v1/search`) cho Owner trên desktop và mobile.

## Điều kiện tiên quyết

- Chạy `yarn dev` (port `3334`) với `DEV_OWNER_BYPASS=true` trong `.env.local` (hoặc đăng nhập Google Owner).
- Có sẵn ít nhất 1 `Topic`, 1 `Lesson` có heading `h2`/`h3` và trạng thái `learning`/`target`, và 1 `NewsItem` chưa `dismissed`.

## Danh sách case

| ID | Kịch bản | Kết quả kỳ vọng | Trạng thái |
|---|---|---|---|
| S1 | Nhấn `Cmd+K` (macOS) hoặc `Ctrl+K` trên `/` hoặc `/[topicSlug]/[lessonSlug]` | Palette mở ngay, input tự focus, hiển thị Zero-Query (`Topics` + `Đang theo dõi` ưu tiên `learning`/`target`). | Chưa chạy |
| S2 | Gõ từ khoá tiếng Việt không dấu (ví dụ `"kien truc"`) | Khớp `Topic`, `Lesson` (kể cả nội dung heading/đoạn văn) và `NewsItem`; snippet tô sáng `<mark>` đúng chữ có dấu. | Chưa chạy |
| S3 | Bấm kết quả `Lesson` khớp heading `h2`/`h3` | Điều hướng tới `/[topicSlug]/[lessonSlug]#[anchor]`, cuộn đúng tới heading mục đó. | Chưa chạy |
| S4 | Chuyển tab `News` và bấm một `NewsItem` | Mở `/news?view=all&item=<id>` và chọn/mở sẵn đúng bài tin đó (trên mobile mở drawer đọc luôn). | Chưa chạy |
| S5 | Điều hướng bằng phím `↑` / `↓` / `Enter` / `Esc`, và mở bằng nút `Tìm kiếm` trên mobile | Phím mũi tên cuộn danh sách mượt, `Enter` mở trang, `Esc` đóng; nút `Tìm kiếm` ở `/` và `LectureShell` hoạt động trên mobile. | Chưa chạy |
| S6 | Kiểm tra cách ly `Visitor` và `/portfolio` | Với `Visitor` (chưa đăng nhập hoặc gọi `GET /api/v1/search` trực tiếp): API trả `401`, UI không kích hoạt `Cmd+K`. Trên `/portfolio`: `Cmd+K` không mở palette. | Chưa chạy |

## Kết quả các lần chạy

Chưa chạy trên trình duyệt thật (cần chạy khi bật `yarn dev`).
