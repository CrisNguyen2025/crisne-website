---
status: accepted
---

# Roadmap Assistant chỉ nhận request qua proxy Next.js, quyền ghi theo Actor

Trước đây service Python public và ghi dữ liệu bằng admin key cho bất kỳ ai gọi tới, nên Visitor có thể xoá Topic (lỗi confused deputy). Từ 2026-10-15 (commit `9acdc78`), trình duyệt chỉ gọi proxy `/api/roadmap-assistant/*`; proxy xác định Actor, giới hạn tần suất với Visitor, gắn prefix Actor vào Thread và chuyển tiếp kèm internal key. Service Python từ chối mọi request thiếu key (trừ `/health`), và chỉ chạy Change khi Actor là Owner. Chọn cách này thay vì để Python tự xác thực người dùng, vì Next.js đã nắm phiên đăng nhập.

## Consequences

- Thiếu `RAG_INTERNAL_KEY` hoặc `INTERNAL_API_KEY` thì Roadmap Assistant ngừng hoạt động (fail-closed), không rơi về chế độ mở.
- Thread của Visitor không bao giờ chạm tới Pending Action của Owner.
- Không được gọi service Python trực tiếp từ trình duyệt, kể cả khi thêm tính năng mới.
