# Kịch bản kiểm thử: Public News cho Visitor (`/picks`)

Phạm vi: Owner bật/tắt **Public** cho từng bài News trong `NewsReaderPanel`; Visitor chưa đăng nhập đọc bài ở `/picks` và `/picks/[id]`, chỉ đọc. Mọi route khác vẫn chỉ Owner vào được.

## Chuẩn bị

1. DB local: `prisma/dev.db` đã có cột `isPublic`, `publicAt` (`yarn db:news-public --local --apply`).
2. Owner: chạy config `dev-local` trong `.claude/launch.json` (`DEV_OWNER_BYPASS` từ `.env.local`).
3. Visitor: chạy config `dev-local-visitor` (`DEV_OWNER_BYPASS=false`, vẫn dùng `prisma/dev.db`). Không có cookie phiên nên mọi request là Visitor ẩn danh.
4. Kiểm tra dữ liệu bằng `GET /api/news?view=all` (Owner) hoặc `sqlite3 prisma/dev.db`.

---

## A. Owner bật / tắt Public

| # | Thao tác | Kết quả mong đợi |
|---|---|---|
| A1 | Mở bài `ready` trong `/news`, bấm **Public** | Toast "Đã public bài cho Visitor", nút đổi thành "Đang public" (xanh), card có badge "Public", API trả `isPublic: true` và `publicAt` khác null |
| A2 | Bấm **Đang public** | Toast "Đã gỡ bài khỏi trang public", `isPublic: false`, `publicAt: null` |
| A0 | Thêm link mới (dán, share hoặc RSS) | Bài mới có `isPublic: true` ngay khi tạo; chỉ hiện ở `/picks` khi đã `ready` |
| A3 | Bài chưa `ready` hoặc đã bỏ qua | Nút Public bị vô hiệu; gọi thẳng `PATCH {isPublic:true}` trả 400 |

## B. Visitor đọc

| # | Thao tác | Kết quả mong đợi |
|---|---|---|
| B1 | `GET /picks` | 200, liệt kê bài public: domain · ngày, tiêu đề, TL;DR |
| B2 | `GET /picks/<id>` của bài public | 200: TL;DR, Ý chính có highlight keyword, nút "Đọc bài gốc trên <domain>", nhãn "Tóm tắt tự động bằng AI"; không có nút hành động, không có ghi chú/tag |
| B3 | `GET /picks/<id-không-tồn-tại>` | 404 |
| B4 | `GET /picksx`, `/news`, `/news/sources`, `/` | 307 sang `/login` |
| B5 | `GET /api/news`, `/api/news/<id>` | 401 |
| B6 | HTML của B2 | Không chứa `personalNote`, `isSaved`, `readState`; có `noindex` |
| B7 | Mở `/picks` trong trình duyệt | Không hiện nút Abot; console không có request 4xx |
| B8 | Gỡ public bài đang mở, reload | `/picks/<id>` trả 404, `/picks` hiện "Chưa có bài nào được chia sẻ." |

---

## Ghi kết quả

### Lần chạy 1: 2026-11-23

- Commit: chưa commit, trên `4ea8846`
- Môi trường: local, `prisma/dev.db`, Next dev (Turbopack); A chạy với `dev-local`, B chạy với `dev-local-visitor`
- LLM: không dùng

| Case | Kết quả | Ghi chú |
|---|---|---|
| A1 | Pass | Bài "Next.js 16.4…": toast, nút "Đang public", badge Public; API `publicAt` = thời điểm bấm |
| A2 | Pass | Gỡ qua `PATCH {isPublic:false}`: `publicAt` về null |
| A3 | Pass | Test tự động: `tests/route/news-item-patch-route.test.ts` (queued/dismissed trả 400) |
| B1 | Pass | 200 |
| B2 | Pass | Đủ nội dung, đúng highlight |
| B3 | Pass | 404 |
| B4 | Pass | Cả 4 path trả 307 sang `/login?callbackUrl=…` |
| B5 | Pass | 401 |
| B6 | Pass | 0 lần xuất hiện các field riêng; có `noindex` |
| B7 | Pass | Lần đầu còn nút Abot và 1 request 401; đã ẩn Abot trên `/picks` trong `components/site-chatbot.tsx`, reload lại không còn lỗi |
| B8 | Pass | Gỡ bằng `sqlite3` khi server ở chế độ Visitor: detail 404, list hiện trạng thái trống |

Lỗi tìm thấy: không có lỗi còn mở.

A0 (mặc định Public cho bài mới) thêm sau lần chạy 1: `Chưa chạy` thủ công; có test tự động `tests/route/news-ingest-route.test.ts` (manual, cron, share đều `isPublic: true`).
