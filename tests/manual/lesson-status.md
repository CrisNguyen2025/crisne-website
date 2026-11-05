# Kịch bản kiểm thử: Lesson Status qua Roadmap Assistant (Abot)

Phạm vi: Thao tác đọc và thay đổi **Lesson Status** (`known` - Đã nắm, `learning` - Đang học, `target` - Mục tiêu) qua Abot chat, theo ADR-0010 (Step 6).
Chỉ Owner mới có quyền xem tiến độ và đổi trạng thái bài học. Visitor tuyệt đối không thấy thông tin trạng thái.

## Chuẩn bị

1. Chạy cả hai service: `yarn dev` (cổng 3334) và `yarn rag:dev` (cổng 8000).
2. Đăng nhập bằng tài khoản **Owner** (hoặc dùng `DEV_OWNER_BYPASS=true` trong `.env.local`).
3. Sử dụng topic test riêng: `QA Sandbox` (hoặc tạo mới qua chat/API rồi dọn dẹp sau khi chạy).
4. Kiểm tra API xác nhận: `GET /api/v1/roadmaps/<slug>` có trường `status` và `statusUpdatedAt` đối với Owner, nhưng không có đối với Visitor.

---

## A. Đọc trạng thái bài học (Owner)

| # | Thao tác / Câu gõ | Kết quả mong đợi |
|---|---|---|
| A1 | `tôi đang biết gì về QA Sandbox` | Abot liệt kê tiến độ học tập: danh sách bài **Đã nắm**, **Đang học**, **Mục tiêu** trong topic. |
| A2 | `nên học gì tiếp` (hoặc `gợi ý học tiếp`) | Abot ưu tiên hiển thị các bài **Đang học** trước, sau đó đến các bài **Mục tiêu**. |
| A3 | `bài nào cần ôn lại` | Abot hiển thị các bài **Đã nắm**, ưu tiên bài có `statusUpdatedAt` null xếp đầu, sau đó sắp xếp theo thời gian tăng dần (bài lâu chưa cập nhật lên trước). |

---

## B. Quyền riêng tư (Visitor)

| # | Thao tác / Câu gõ | Kết quả mong đợi |
|---|---|---|
| B1 | Visitor gõ: `bài nào cần ôn lại` | Abot chặn và trả về thông báo quyền: "🔒 Chỉ owner mới thực hiện được thao tác...". Không lộ thông tin bài học hay trạng thái. |
| B2 | Visitor gõ: `nên học gì tiếp` | Abot chặn và trả về thông báo chỉ Owner. |
| B3 | Visitor gõ: `tôi đang biết gì về QA Sandbox` | Abot chặn và trả lời thông báo chỉ Owner. |
| B4 | Visitor gõ: `đánh dấu bài X là đang học` | Abot chặn và trả lời thông báo chỉ Owner. Không gọi API PATCH. |

---

## C. Đổi trạng thái có Preview (Owner)

| # | Thao tác / Câu gõ | Kết quả mong đợi |
|---|---|---|
| C1 | `đánh dấu bài Prompt Engineering là đang học` | Hiện thẻ Preview xác nhận (Tên bài, Topic, Trạng thái cũ -> Trạng thái mới: Đang học). Gõ `ok` -> Abot cập nhật thành công và hiển thị dấu tích ✅. |
| C2 | `chuyển bài Vector Search sang đã nắm` -> Sau đó gõ `hủy` | Hiện Preview xác nhận. Sau khi gõ `hủy`, Abot báo đã hủy thao tác và không gọi API cập nhật. |
| C3 | Đổi bài đang ở trạng thái `known` sang `đã nắm` | Abot nhận biết trạng thái không đổi và thông báo bài đã ở trạng thái này rồi, không tạo preview. |
| C4 | `tôi đang học RAG, giải thích chunking` | Abot giải thích kiến thức về chunking. **Không** kích hoạt lệnh đổi trạng thái, **không** tạo thẻ Preview. |

---

## Kết quả kiểm thử

| Lần chạy | Ngày | Commit | Môi trường | Kết quả | Ghi chú |
|---|---|---|---|---|---|
| 1 | 2026-11-05 | [Chưa chạy] | Local (Turso QA Sandbox) | Chưa chạy | Chờ chạy trên môi trường thực tế |
