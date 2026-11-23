# Knowledge Provenance: đưa News Item vào Lesson và xem nguồn trên trang Lesson

Phạm vi: Phase 1 của `.handoff/PLAN-knowledge-acquisition.md` (ADR-0017, ADR-0019), gồm `TASK-knowledge-provenance-001`, `-002`, `-003`. Owner chọn ý của một News Item ở `/news`, lưu vào Lesson mới hoặc có sẵn; mỗi câu kèm marker Provenance; trang Lesson hiện chip nguồn cho Owner.

File liên quan: `components/news/AddToLessonSheet.tsx`, `components/news/NewsReaderPanel.tsx`, `app/api/news/[id]/integrate/route.ts`, `app/api/v1/roadmaps/items/[id]/provenance/route.ts`, `lib/provenance/*`, `lib/roadmap/create-lesson.ts`, `components/roadmap/LessonEditorialReader.tsx`, `components/roadmap/ProvenanceChip.tsx`, `components/roadmap/LessonSources.tsx`, `components/ui/editor/nodes/ProvenanceNode.tsx`, `lib/news/ingest.ts`.

Điều kiện: database đã có bảng `KnowledgeProvenance` và cột `NewsItem.extractedAt` (`yarn db:knowledge-provenance --local --apply` cho `prisma/dev.db`, hoặc `--apply` trên Turso). Có ít nhất một News Item `ready` và một Topic.

## Case

| ID | Bước | Kỳ vọng |
|---|---|---|
| P1 | Ở `/news`, mở một bài `ready`, bấm "Đưa vào Lesson", giữ 2 ý, chọn Topic, "Tạo bài mới", Xem trước, Lưu | Sheet báo "Đã đưa 2 ý vào Lesson.", link "Mở bài" tới `/<topic>/<slug>`; bài mới có Lesson Status `target`; `GET /api/v1/roadmaps/items/<id>/provenance` trả 2 `provenances` |
| P2 | Lặp lại P1 với cùng tiêu đề | Báo "Topic này đã có bài …", không tạo bài thứ hai |
| P3 | "Nối vào bài có sẵn" vào một bài `known`, rồi nối lần hai cùng bài | Lần 1: nội dung cũ giữ nguyên, thêm các câu mới ở cuối, status vẫn `known`. Lần 2: báo "Bài tin này đã được đưa vào bài đó rồi." |
| P4 | Mở bài ở P1 khi đã đăng nhập | Mỗi câu có chip số; bấm chip hiện tên nguồn + link, tiêu đề gốc, đoạn trích, ngày thu thập, ngày trích xuất, người viết; Esc đóng |
| P5 | Sửa bài ở P1 bằng editor (thêm một câu khác), lưu | Chip của các câu cũ còn nguyên; trong editor, câu có nguồn có dấu ◆ |
| P6 | Xoá hẳn một câu có chip bằng editor, lưu | Chip của câu đó mất; mục "Nguồn tham khảo của bài" hiện nguồn đó |
| P7 | Mở bài ở P1 khi chưa đăng nhập (cửa sổ ẩn danh) | Chuyển về `/login` (ADR-0019) |
| P8 | Xem mã nguồn HTML của trang ở P4 | Chỉ có `<span data-provenance-ref="<uuid>">`, không có tên nguồn, URL nguồn hay id News Item ngoài phần chip render phía client |
| P9 | Mở `/news` khi chưa đăng nhập (cửa sổ ẩn danh) | Chuyển về `/login`; không còn trang tin công khai (ADR-0019, thay case cũ "bài `cron` không lên `/news`") |
| P10 | Bài đang `processing` hoặc đã Bỏ qua | Không có nút "Đưa vào Lesson" |

## Ghi kết quả

### Lần chạy 2026-11-23 (chưa commit, nhánh `feat/knowledge-provenance` trên `ce7564a` + working tree)

Môi trường: `next dev` cổng 3335, `DEV_OWNER_BYPASS=true`, `DATABASE_URL` trỏ bản copy của `prisma/dev.db` trong scratchpad đã áp DDL của `scripts/add-knowledge-provenance.ts` (không đụng `prisma/dev.db`), không có RAG service; trình duyệt trong app Claude, khung 1024px. Kiểm dữ liệu bằng `sqlite3` trên bản copy và `GET /api/v1/roadmaps/items/<id>/provenance`.

| ID | Kết quả | Ghi chú |
|---|---|---|
| P1 | Pass | Bài "Bản phát hành bảo mật Next.js tháng 9/2026 sắp ra mắt" → Topic Backend Engineering Roadmap; giữ 2/5 ý, sửa ý 2. DB: `status=target`, 2 marker UUID; ý sửa ghi `ai_assisted`, `excerpt` là ý gốc |
| P2 | Pass (lượt 2) | Cùng bài, cùng Topic Backend, tiêu đề mặc định: báo "Topic này đã có bài …", sheet giữ nguyên; DB vẫn 124 bài |
| P3 | Pass (lượt 2) | Nối 2 ý vào "Read Replicas & Connection Pooling" (`known`, đã đặt sẵn nội dung trong bản copy DB): nội dung cũ giữ nguyên ở đầu, thêm 2 đoạn có marker, status vẫn `known`, không tạo bài mới. Nối lần hai: báo "Bài tin này đã được đưa vào bài đó rồi.", không ghi thêm provenance hay nội dung. Lỗi 3 |
| P4 | Pass sau khi sửa | Lỗi 1. Sau khi sửa: popover đủ 6 trường, `scrollWidth <= innerWidth` |
| P5 | Pass | Lưu bằng editor thật (vô tình tách đôi đoạn 2): cả 2 marker còn nguyên trong `content`; editor hiện dấu ◆ |
| P6 | Pass | PATCH content bỏ đoạn có marker 1: API trả `provenances` = [marker 2], `orphans` = [marker 1]; trang hiện chip "1" và mục "Nguồn tham khảo của bài" |
| P7 | Pass (lượt 3) | Server `DEV_OWNER_BYPASS=false`: mở bài → 307 về `/login?callbackUrl=…`, trình duyệt hiện trang đăng nhập. `GET …/provenance` và `POST /api/news/[id]/integrate` trả 401 khi không đăng nhập, khi có `x-admin-key` sai và khi có `x-internal-key` bất kỳ; không ghi thêm provenance. `/news` vẫn 200 |
| P8 | Pass | HTML trả về (cả RSC payload) không có tên nguồn, URL nguồn, `authorType`; chỉ có key của marker còn trong bài; meta description sạch |
| P9 | Chưa chạy. Kết quả lượt 3 bên cạnh là của case cũ, đã bị thay theo ADR-0019 | Case cũ, Pass (lượt 3): Thêm nguồn Vercel Blog (`https://vercel.com/atom`) qua API, chạy `POST /api/news/cron` thật: 10 bài `cron` mới đều `isPublic=false`, `publicAt=null`. Giữ 1 job, chạy worker thật (`news-ingest-worker`, cổng 8002, trỏ về server copy): bài "Vercel Board đã ra mắt…" thành `ready`, có `extractedAt`, vẫn không public. `/news` không có bài, `/news/<id>` 404. Bật Public trong Reader → bài lên `/news`. Link thêm tay (`origin: manual`) vẫn `isPublic=true` ngay khi tạo |
| P10 | Pass (lượt 2) | Trong bản copy DB, đặt một bài `processing` và một bài `dismissed`: cả hai không có nút "Đưa vào Lesson" (bài processing ở tab Chờ xử lý, bài dismissed ở tab Đã bỏ qua) |

Thêm: `/news` vẫn 200 và vẫn hiện bài public.

Lượt 2 (cùng ngày, cùng môi trường, khung 1280px): chạy P2, P3, P10. Kết quả ghi trực tiếp trong bảng trên (đánh dấu "lượt 2").

Lượt 3 (cùng ngày, cùng bản copy DB): chạy P7 với server `DEV_OWNER_BYPASS=false`, và P9 với cron RSS thật cộng worker thật (gọi LLM thật cho 2 bài; 9 job cron còn lại được đánh `failed` trong bản copy DB để không gọi LLM hàng loạt). Kết quả đánh dấu "lượt 3".

Test tự động liên quan: `tests/route/news-integrate-route.test.ts`, `tests/route/lesson-provenance-route.test.ts`, `tests/unit/provenance-markers.test.ts`, `tests/unit/provenance-node.test.ts`, `tests/unit/lesson-provenance-ui.test.tsx`, `tests/unit/news-add-to-lesson.test.tsx`, `tests/route/news-ingest-route.test.ts`.

## Lỗi tìm thấy

1. Popover nguồn bị cắt và sinh thanh cuộn ngang, vì vùng nội dung Lesson có `overflow`. Đã sửa (chưa commit): `components/roadmap/ProvenanceChip.tsx` portal popover ra `document.body` với vị trí `fixed`. jsdom không tái hiện được lỗi layout; test `tests/unit/lesson-provenance-ui.test.tsx` vẫn khoá nội dung popover.
2. Nhãn "Section" thừa trong sheet vì `SectionField` đã có nhãn "Mục". Đã bỏ (chưa commit).
3. Thông báo lỗi (ví dụ trùng tiêu đề) vẫn treo sau khi Owner đổi sang "Nối vào bài có sẵn", đổi Topic hoặc sang bước Xem trước. Đã sửa (chưa commit) trong `components/news/AddToLessonSheet.tsx`, kiểm lại trên trình duyệt; test: `tests/unit/news-add-to-lesson.test.tsx` › "clears the error once the Owner changes the target or goes to the preview".
