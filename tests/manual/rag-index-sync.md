# Kịch bản kiểm thử: Đồng bộ Roadmap ↔ Index RAG & Trạng thái /health

Phạm vi: Kiểm tra cơ chế đồng bộ dữ liệu roadmap giữa Next.js và RAG service của Abot:
- Xem thông tin `index` trong endpoint `/health`
- Thêm bài mới và kiểm tra Abot tìm thấy ngay
- Xoá bài và kiểm tra Abot cập nhật ngay
- Đổi trạng thái Lesson Status (ADR-0010) không gây reindex vô cớ

## Chuẩn bị

1. Chạy cả hai service: `yarn dev` (cổng 3334) và `yarn rag:dev` (cổng 8000). `.env.local` phải có `RAG_SERVICE_URL=http://localhost:8000`.
2. Đăng nhập bằng tài khoản **owner** (`DEV_OWNER_BYPASS=true` trong `.env.local`).
3. DB đang trỏ vào **Turso thật**. Chỉ thao tác trên topic test `QA Sandbox` (`slug: qa-sandbox`), xoá các bài thử nghiệm sau khi hoàn tất.
4. Công cụ kiểm tra nhanh: `curl -s http://localhost:8000/health | jq .index`.

---

## Các ca kiểm tra

| # | Thao tác | Kết quả mong đợi | Cách kiểm tra | Trạng thái |
|---|---|---|---|---|
| 1 | Gọi GET `/health` của RAG service | Trả về 200 OK. Khối `index` có đầy đủ: `synced: true`, `current: true`, `documents: <int>`, `age_seconds: <float>`, `last_error: null`. | `curl -s http://localhost:8000/health \| jq .index` | Chưa chạy |
| 2 | Thêm bài mới "Hybrid Search Basics" vào topic `QA Sandbox` qua UI. Mở Abot hỏi ngay: "Trong topic QA Sandbox có bài gì về Hybrid Search không?" | Abot trả lời ngay về bài "Hybrid Search Basics", trích dẫn đúng đường dẫn. Không cần chờ quá TTL 30s vì `notifyRoadmapChanged` đã trigger reindex. | Xem câu trả lời của Abot và log `[HybridRagEngine] Successfully indexed...` | Chưa chạy |
| 3 | Xoá bài "Hybrid Search Basics" vừa tạo khỏi topic `QA Sandbox`. Mở Abot hỏi: "Trong topic QA Sandbox còn bài Hybrid Search Basics không?" | Abot trả lời bài không còn trong hệ thống, không khẳng định bài vẫn tồn tại. | Xem câu trả lời của Abot | Chưa chạy |
| 4 | Đổi trạng thái bài học (Lesson Status: target / learning / known) trên một bài bất kỳ. Ngay sau đó gọi `/health`. | `age_seconds` trong khối `index` tiếp tục tăng đều, KHÔNG bị reset về 0 (vì PATCH chỉ đổi status thì không gọi `notifyRoadmapChanged()`). | So sánh `age_seconds` trước và sau khi PATCH status | Chưa chạy |

---

## Ghi nhận lần chạy

### Lần chạy: 2026-11-05
- **Commit**: `feat/rag-sync-hardening`
- **Môi trường**: Local dev / Next.js 3334 + FastAPI 8000
- **Kết quả tổng thể**: Chưa chạy (được tạo và khóa bằng unit tests `test_health_index.py`, `test_index_sync_e2e.py`, `roadmap-item-patch-reindex.test.ts`).
