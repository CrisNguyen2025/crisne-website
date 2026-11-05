# Test thủ công (Playwright MCP)

Thư mục này lưu các kịch bản test thủ công **cùng kết quả đã chạy**. Agent ở thread khác cứ đọc kết quả ở đây là đủ, không cần đoán hay chạy lại.

## Quy tắc cho agent

1. **Đọc trước khi test.** Trước khi test một tính năng, tìm kịch bản của nó ở đây và đọc phần "Ghi kết quả".
2. **Chỉ chạy lại khi cần.** Chỉ chạy lại một case khi:
   - case đó đang `Fail` hoặc `Chưa chạy`, hoặc
   - code liên quan đã đổi sau commit của lần chạy (`git log <commit>..HEAD -- <file>`), hoặc
   - user yêu cầu.

   Case `Pass` mà code liên quan chưa đổi thì coi như vẫn đúng.
3. **Ghi lại sau mỗi lần chạy.** Thêm một khối "Lần chạy" mới (ngày, commit, môi trường, LLM), cập nhật bảng kết quả và danh sách lỗi. Không xoá lần chạy cũ, chỉ ghi chú là đã được thay thế.
4. **Lỗi đã sửa thì ghi rõ.** Ghi commit sửa và tên unit test khoá lỗi, ví dụ `Đã sửa ở abc123, test: tests/test_x.py::test_y`.
5. **Kết luận phải có bằng chứng.** Câu trả lời của Abot có thể sai, ví dụ D5: Abot báo "đã xoá" nhưng không xoá gì. Mọi kết luận về dữ liệu phải kiểm tra bằng API (`GET /api/v1/roadmaps/<slug>`) hoặc log `[turn]` của RAG service (có `tools=[...]`).

## Trạng thái case

| Trạng thái | Nghĩa |
|---|---|
| `Pass` | Đúng kỳ vọng, đã kiểm tra dữ liệu. |
| `Fail` | Sai, có lỗi đánh số trong "Lỗi tìm thấy". |
| `Không test được` | Bị chặn bởi giới hạn môi trường hoặc UI, ghi rõ lý do. |
| `Chưa chạy` | Chưa thực hiện. |

## Kịch bản

| File | Phạm vi | Lần chạy gần nhất | Kết quả |
|---|---|---|---|
| [assistant-sections.md](assistant-sections.md) | Section (mục) qua Abot, ADR-0009 | 2026-11-04 @ `0734cc0` | 7 lỗi, xem file |
| [assistant-topic-grounding-tooling.md](assistant-topic-grounding-tooling.md) | Grounding và tooling ở mức topic, kèm eval tự động | 2026-11-05 @ `1b7eaab` | Eval pass; case chat pass; 1 lỗi nhỏ (lỗi 9) |

## Cách chạy (đã kiểm chứng)

- **Server:** `yarn dev` (3334) và `yarn rag:dev` (8000). Owner nhờ `DEV_OWNER_BYPASS=true` trong `.env.local` (chỉ có tác dụng với `next dev`), không cần đăng nhập Google.
- **DB:** đang là **Turso thật**. Chỉ dùng topic test riêng và xoá chúng sau khi chạy. Tên topic test **không** được chứa chữ "Section" hay "mục", vì Abot hiểu nhầm (lỗi 2 của assistant-sections). Nên dùng `QA Sandbox`.
- **Chat:** bấm nút "Mở Abot". Ô nhập có placeholder `Hỏi Abot…` và chỉ có một dòng, nên không gửi được nội dung nhiều dòng.
- **Preview:** câu xác nhận hiện là "Xác nhận thực hiện" (helper cũ còn dò "Đang chờ bạn xác nhận").
- **Chờ trả lời:** dùng [helpers/abot-send.js](helpers/abot-send.js), helper này đợi đến khi chữ trên trang ngừng thay đổi. Đừng chờ `response.finished()` của `/chat/stream`, vì nó không bao giờ kết thúc và làm Playwright treo.
- **Thêm bài nền nhanh:** gọi thẳng API, không qua chat:
  `curl -X POST localhost:3334/api/v1/roadmaps/items -H 'Content-Type: application/json' -d '{"roadmapSlug":"qa-sandbox","title":"X","section":"RAG"}'`
- **Log định tuyến:** output của `yarn rag:dev`, các dòng `[turn] … intent=… rule=… tools=[…]`.

## Quan hệ với test tự động

Mỗi lỗi tìm được ở đây khi sửa phải kèm một test tự động:
- logic Python thì dùng pytest trong `roadmap-rag-assistant/tests`,
- API hoặc lib Next.js thì dùng vitest,
- lỗi chỉ thấy trên UI thì dùng `tests/e2e`.

Ghi tên test đó vào kịch bản.
