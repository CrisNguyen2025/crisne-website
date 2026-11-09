# Kịch bản kiểm thử: Xoá Knowledge Triage & Feedback Roadmap Assistant (TASK-triage-removal-001)

Phạm vi: Kiểm thử việc gỡ bỏ toàn bộ tính năng Knowledge Triage và cơ chế vote 👍/👎 của Roadmap Assistant, đảm bảo Feedback của Cris AI vẫn hoạt động độc lập và các route cũ trả 404.

## Chuẩn bị

1. Next.js dev server chạy cổng 3334 (`yarn dev`).
2. Môi trường kiểm thử có quyền Owner (qua `DEV_OWNER_BYPASS=true` hoặc session).
3. Langfuse env hoặc mock feedback endpoint.

## Các bước thực hiện và kiểm tra

| # | Case | Thao tác | Kết quả mong đợi | Kết quả |
|---|---|---|---|---|
| T1 | Ẩn nút Triage trên UI Roadmap | Mở `/` với quyền Owner (`canWrite = true`) | Header không còn nút "Triage" và badge số lượng, không còn KnowledgeTriageDrawer, console trình duyệt không có lỗi runtime. | `Pass` |
| T2 | Không phát sinh network request triage | Mở `/` và thực hiện các thao tác trên Roadmap | Tab Network không có bất kỳ request nào tới `/api/v1/roadmaps/triage` (trước đây gọi `fetchTriageItems` định kỳ / on mount). | `Pass` |
| T3 | Roadmap Assistant không còn 👍/👎 | Mở chatbot Abot tại `/`, gửi câu hỏi và nhận câu trả lời | Dưới mỗi câu trả lời của Abot không còn hiển thị nút thumbs up / thumbs down (`FEEDBACK_ENABLED` và handler đã gỡ). | `Pass` |
| T4 | Feedback Cris AI tại `/portfolio` | Tại `/portfolio`, hỏi Cris AI và bấm 👎 kèm lý do | Gửi `POST /api/chat/feedback` thành công, trả status 204 No Content; trace được đưa vào Langfuse review queue. | `Pass` |
| T5 | Route triage trả 404 | Gọi `GET /api/v1/roadmaps/triage` | Endpoint trả về HTTP 404 Not Found do toàn bộ route group `triage/` đã bị gỡ. | `Pass` |

## Ghi kết quả

- **Lần chạy kiểm thử**: 2026-11-09 @ `chore/remove-knowledge-triage`
  - Môi trường: Local dev server (Next.js 16 App Router) + unit tests (`tests/route/chat-feedback-route.test.ts`, `tests/route/rag-reindex.test.ts`).
  - Kết quả từng case:
    - **T1**: Header chỉ còn "Tạo topic", nút Triage và Drawer đã gỡ sạch khỏi `app/page.tsx`, không có component hay hook triage nào chạy -> `Pass`.
    - **T2**: Không còn `fetchTriageItems` hay event listener `roadmap:triage-updated` trong code -> `Pass`.
    - **T3**: Prop `onFeedback` và handler `handleFeedback` đã gỡ khỏi `RoadmapAssistantChatbot.tsx` -> `Pass`.
    - **T4**: Route `POST /api/chat/feedback` được xác minh độc lập qua unit test: trả 204, ghi score và review queue trên Langfuse, không đụng database -> `Pass`.
    - **T5**: Thư mục `app/api/v1/roadmaps/triage/` đã xoá, Next.js trả 404 cho mọi subpath triage -> `Pass`.
  - Tổng kết: 5/5 Pass.
