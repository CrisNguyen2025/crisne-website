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
| 1 | Gọi GET `/health` của RAG service | Trả về 200 OK. Khối `index` có đầy đủ: `synced: true`, `current: true`, `documents: <int>`, `age_seconds: <float>`, `last_error: null`, `vectors_pending: <int>`. | `curl -s http://localhost:8000/health \| jq .index` | Chưa chạy |
| 2 | Thêm bài mới "Hybrid Search Basics" vào topic `QA Sandbox` qua UI. Mở Abot hỏi ngay: "Trong topic QA Sandbox có bài gì về Hybrid Search không?" | Abot trả lời ngay về bài "Hybrid Search Basics", trích dẫn đúng đường dẫn. Không cần chờ quá TTL 30s vì `notifyRoadmapChanged` đã trigger reindex. | Xem câu trả lời của Abot và log `[HybridRagEngine] Successfully indexed...` | Chưa chạy |
| 3 | Xoá bài "Hybrid Search Basics" vừa tạo khỏi topic `QA Sandbox`. Mở Abot hỏi: "Trong topic QA Sandbox còn bài Hybrid Search Basics không?" | Abot trả lời bài không còn trong hệ thống, không khẳng định bài vẫn tồn tại. | Xem câu trả lời của Abot | Chưa chạy |
| 4 | Đổi trạng thái bài học (Lesson Status: target / learning / known) trên một bài bất kỳ. Ngay sau đó gọi `/health`. | `age_seconds` trong khối `index` tiếp tục tăng đều, KHÔNG bị reset về 0 (vì PATCH chỉ đổi status thì không gọi `notifyRoadmapChanged()`). | So sánh `age_seconds` trước và sau khi PATCH status | Chưa chạy |
| 6 | Trong `QA Sandbox`, tạo bài dài có 3 heading `h2`, dữ kiện riêng (ví dụ "ef_search mặc định bằng 40") chỉ nằm ở heading cuối, sau hơn 2.000 ký tự. Hỏi Abot đúng dữ kiện đó. | Abot trả lời được dữ kiện, có trích dẫn. Bấm nguồn thì mở bài ở đúng đoạn (`/qa-sandbox/<slug>#<heading>`). `/health` có `chunks` > 0. | Chat với Abot; `curl -s http://localhost:8000/health \| jq .index.chunks` | Chưa chạy |
| 7 | Đưa một ý từ News vào cuối một bài có sẵn (`/news` → Thêm vào bài). Hỏi Abot về ý vừa thêm. | Abot trả lời được ý mới, trích dẫn tới bài đó (đoạn chứa ý nếu bài có heading). | Chat với Abot | Chưa chạy |
| 8 | Để yên không ghi gì, chat 2 câu cách nhau hơn 30 giây. Sau đó gọi `/health`. | `version_checks_skipped` tăng, `last_sync_ms` không đổi: TTL chỉ hỏi version, không kéo lại `full-export`. | `curl -s http://localhost:8000/health \| jq .index` | Chưa chạy |
| 9 | Gọi `curl -s -o /dev/null -w '%{http_code}' -H 'x-admin-key: sai' http://localhost:3334/api/v1/roadmaps/full-export` | `401`. Với `ADMIN_API_KEY` đúng thì `200` và mỗi bài có `chunks`. | curl | Chưa chạy |
| 5 | Khởi động lại RAG service với cache trống (`rm -f roadmap-rag-assistant/data/embedding_cache.json`). Gọi GET `/health` ngay, rồi hỏi Abot một câu có từ khoá trong tên bài, sau đó theo dõi đến khi `vectors_pending` về 0. | Ngay sau khi khởi động, `/health` trả về `documents` > 0 và `vectors_pending` > 0. Abot trả lời được ngay dựa trên FTS (không bị treo hay timeout). `vectors_pending` giảm dần về 0 khi tiến trình embed nền hoàn tất. | `curl -s http://localhost:8000/health \| jq .index`; chat với Abot qua UI | Chưa chạy |

---

## Ghi nhận lần chạy

### Lần chạy: 2026-11-24, lần 2 (case 7 sau khi sửa lỗi 1)
- **Commit**: chưa commit, nhánh `feat/abot-lesson-chunks` trên `fd46546`. Môi trường như lần 1.
- **Case 7: Pass.** Tạo lại bài thử, nối câu "Cost per Successful Task" từ News. Hỏi "Khi đánh giá chi phí LLM nên tính theo chỉ số nào ngoài giá token?": route `knowledge_query` (`method=scope`), trả lời đúng, nguồn `/qa-sandbox/qa-chunk-vector-db#tinh-chinh-pgvector`.
- **Đối chứng ngoài lề vẫn bị chặn:** "Kết quả trận Real Madrid tối qua?", "Cách nấu phở bò ngon?" (`out_of_scope`, `method=scope`); "Thời tiết Hà Nội", "Giá vàng", "Lịch chiếu phim Avatar" (`out_of_scope`, `method=heuristic`).
- **Lỗi 1 của lần 1: đã sửa** ở `retrieval/scope_centroid.py#DomainCentroids.from_store` (`nearest` tính cả vector đoạn, centroid vẫn chỉ topic và bài). Test: `tests/test_lesson_chunks.py::test_a_question_near_a_later_section_is_near_the_roadmap`. Đo offline bằng Gemini thật (13 vector): câu case 7 nearest 0,6106 (EXTERNAL) → 0,7525 (ROADMAP); 4 câu ngoài lề giữ nguyên (0,58–0,61, EXTERNAL).
- **Dọn dẹp:** xoá `qa-sandbox` → 200, `GET` → 404, `/health` về `documents: 7, chunks: 0`.

### Lần chạy: 2026-11-24 (case 6–9, TASK-abot-lesson-chunks-001)
- **Commit**: chưa commit, nhánh `feat/abot-lesson-chunks` trên `fd46546`
- **Môi trường**: Local, Next.js 3334 (`DEV_OWNER_BYPASS=true`) + FastAPI 8000, DB Turso thật, embedding Gemini thật, LLM `openai/gpt-oss-120b`. Topic thử `QA Sandbox` tạo và xoá trong lần chạy.
- **Kết quả**:

| # | Kết quả | Bằng chứng |
|---|---|---|
| 6 | Pass | Bài 4.083 ký tự, 3 `h2`. Sau khi tạo, `/health`: `documents` 7→18, `chunks` 9 (reindex tự chạy, không chờ TTL). Hỏi "ef_search của HNSW mặc định bằng bao nhiêu?": trả lời "40", `sources[0].href` = `/qa-sandbox/qa-chunk-vector-db#tinh-chinh-pgvector`. Trang bài có đúng 3 id heading; mở link trong trình duyệt nhảy tới "Tinh chỉnh pgvector". Bước `retrieve` lúc đầu hiện link không kèm anchor → sửa `agent.py` (`href_of=lesson_href`), chạy lại thì có `#tinh-chinh-pgvector`. Tiện thể sửa `/health` lọc mất 3 trường mới (`api/schemas.py#IndexHealthInfo`), test: `tests/test_health_index.py::test_health_endpoint_includes_index_status`. |
| 7 | Fail (lỗi 1) | `POST /api/news/<id>/integrate` `append_to_lesson` nối câu "Cost per Successful Task" vào cuối bài; full-export cho thấy câu nằm trong đoạn `tinh-chinh-pgvector`. Hỏi "Bài QA Chunk Vector DB nói gì về Cost per Successful Task?": trả lời đúng, nguồn có `#anchor`. Nhưng câu tự nhiên "Khi đánh giá chi phí LLM nên tính theo chỉ số nào ngoài giá token?" bị router trả `out_of_scope` (`method=scope`) trước khi kịp tìm. |
| 8 | Pass | Chờ 33 giây rồi chat: `version_checks_skipped` 0→1, `last_sync_ms` giữ nguyên 1051.0, `age_seconds` về 4.36. |
| 9 | Không test được | Với `DEV_OWNER_BYPASS=true` thì `next dev` cho mọi request quyền Owner, nên cả khi không có key vẫn trả 200. Đã khoá bằng `tests/unit/roadmap-export-access.test.ts`; cần kiểm lại trên production sau deploy. |

- **Lỗi tìm thấy**:
  1. Cổng scope của router chỉ nhìn topic và bài (centroid, `corpus_vocabulary` lấy `content_text` cắt ở 1.500 ký tự). Tri thức nằm sâu trong bài (thường là ý nối thêm từ News) không giúp câu hỏi qua được cổng. Task này cố ý giữ router nguyên trạng (spec mục 2). Hướng sửa cần chạy lại eval scope/router: đưa từ vựng của đoạn vào on-topic gate. Chưa sửa.
- **Dọn dẹp**: `DELETE /api/v1/roadmaps/qa-sandbox` → 200, `GET` → 404, `/health` về `documents: 7, chunks: 0`. Provenance của bài thử bị xoá theo (cascade).

### Lần chạy: 2026-11-05
- **Commit**: `feat/rag-sync-hardening`
- **Môi trường**: Local dev / Next.js 3334 + FastAPI 8000
- **Kết quả tổng thể**: Chưa chạy (được tạo và khóa bằng unit tests `test_health_index.py`, `test_index_sync_e2e.py`, `roadmap-item-patch-reindex.test.ts`).
