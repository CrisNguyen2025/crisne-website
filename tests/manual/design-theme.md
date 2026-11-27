# Kịch bản kiểm thử: Theme Figma (Mặc định) & Brand Options (roadmap và news)

Phạm vi: nút "Tùy chọn" (…) đổi theme của vùng `.roadmap-theme`. Code: `hooks/use-design.ts`, `components/design-menu.tsx`, `app/styles/roadmap-theme.css` (Figma mặc định), `app/styles/{perplexity,cursor,anthropic,linear,letters,stripe,discord,apple,railway,posthog}-theme.css`, header của `PublicationHome`, `LectureShell`, `NewsFeedClient`. Quy ước: `docs/design-system.md` mục "Theme roadmap và news".

## Chuẩn bị

1. `preview_start dev-local` (cổng 3334, SQLite `dev.db`, Owner bypass).
2. Kiểm style bằng `getComputedStyle` trong console của trình duyệt, không chỉ nhìn ảnh.

## Case

| # | Thao tác | Kỳ vọng |
|---|---|---|
| T1 | Trang chủ `/`, bấm … rồi chọn "Theme: Apple" | `<html data-design="apple">`, localStorage `design=apple`; nền `.roadmap-theme` trắng, chữ `#1d1d1f`, `--primary` `#0066cc`, font `-apple-system…`, nút `<Button>` bo `9999px` |
| T2 | Tải lại hẳn trang lesson | Vẫn ở Apple. Có 2 nút … (header mobile và sidebar desktop) |
| T3 | `.editorial-prose` ở Apple | Body 17px, line-height 1.47, letter-spacing -0.374px; h2 weight 600, font SF Pro Display |
| T4 | Site ở dark (`localStorage.theme=dark`) và đang Apple | `html.dark` vẫn có, nhưng `.roadmap-theme` nền trắng, `color-scheme: light` |
| T5 | Chọn "Theme: Default" ở menu sidebar | Bỏ `data-design`, quay lại token cũ (dark: nền `#161513`); prose 16px/28px, h2 500 |
| T6 | `/news` ở Apple | Nút … nằm cuối header, token Apple áp lên trang |
| T7 | Chọn "Theme: Railway" khi site đang light | Nền `#13111c`, chữ trắng, sidebar `#08070c`, `color-scheme: dark`; prose 18px/27px; heading IBM Plex Serif 500 (font được tải); nút icon bo 4.8px |
| T8 | Chọn "Theme: PostHog", site light rồi dark | Light: nền `#eeefe9`, chữ `#111111`, `--editorial-accent #b33a00`. Dark: nền `#14100a`, chữ `#fdfaf5`, accent `#cd8407`. Prose 15px/500/1.5; h2 24px/700/-0.6px; h3 19.29px/600 |

## Lần chạy 2026-11-27

- Commit: chưa commit, trên `2b3e3cd`. Môi trường: `dev-local`, browser pane của Claude desktop. Không dùng LLM.

| # | Kết quả | Ghi chú |
|---|---|---|
| T1 | Pass | Đo: bg `rgb(255,255,255)`, `--primary #06c`, radius `9999px` |
| T2 | Pass | |
| T3 | Pass | DB local không có Lesson nào có nội dung, nên đo trên phần tử `.editorial-prose` chèn tạm qua JS |
| T4 | Pass | |
| T5 | Pass | |
| T6 | Không test được | `/news` lỗi 500 ở local: `dev.db` thiếu cột `NewsItem.slug` (schema đang sửa trong working tree), không liên quan theme |

T7, T8 chạy cùng ngày, cùng môi trường: Pass. Phần prose đo trên phần tử chèn tạm qua JS. T8 dark bật bằng cách đổi class `dark` trên `<html>` qua JS.

### Hạn chế đã biết

- Theme áp sau khi hydrate, nên lần tải đầu có thể nháy Default một nhịp (theme light/dark cũng đang vậy).
- Chỉ `<Button>` (`data-slot="button"`) được bo pill. `<button>`/`<Link>` tự viết class (ví dụ "Tạo topic", "News") vẫn bo `rounded-lg`.
- `/share` không có nút …: chỉ đổi theo khi vào từ trang khác trong cùng phiên.
