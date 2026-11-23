---
status: accepted
---

# News Ingest Worker là service Python riêng, chỉ xử lý từng News Item

Từ commit `dc98a0e`, việc trích xuất và tóm tắt News Item chạy trong service Python riêng `news-ingest-worker/`, tách khỏi Roadmap Assistant (ADR-0001). Pipeline đi từ rẻ tới đắt: mô tả và phụ đề, rồi Whisper, rồi Vision trên keyframe; cuối cùng tóm tắt thành JSON có cấu trúc, không dùng agent hay tool. Worker tự nhận job qua `/api/news/jobs/claim` và trả kết quả qua `/api/news/jobs/[id]/complete` của Next.js bằng admin key, không truy cập thẳng database. Ghi lại ngày 2026-11-23, khi Knowledge Acquisition bắt đầu nối News Item vào Lesson, nên cần rõ ranh giới LLM giữa hai service.

## Quyết định

- Worker chỉ xử lý **một** News Item mỗi lần: trích xuất nội dung, tóm tắt, sinh takeaways và tags. Worker không đọc Topic hay Lesson, và không gợi ý gì dựa trên chúng.
- Mọi suy luận đối chiếu với kho Lesson thuộc Roadmap Assistant: gợi ý Topic hoặc Section đích, phát hiện trùng lặp, quan hệ giữa các Lesson, viết lại nội dung bài. Chỉ Roadmap Assistant có index của kho (ADR-0006).
- Worker và Roadmap Assistant không gọi nhau. Next.js là nơi nối hai bên.

## Considered Options

- Gộp vào Roadmap Assistant: job nặng (tải media, ffmpeg, Whisper) sẽ chiếm tài nguyên của service phục vụ chat realtime, và hai thứ không cần release cùng lúc.
- Để worker gợi ý Topic/Section: worker phải tải toàn bộ kho Lesson hoặc có index riêng, tức là lặp lại việc Roadmap Assistant đã làm.

## Consequences

- Có ba nơi deploy (Next.js, Roadmap Assistant, worker), mỗi nơi một bộ ENV (`docs/DEPLOY_ENV.md`).
- Đổi schema của job (ví dụ thêm loại job) phải deploy Next.js trước worker, để worker cũ không nhận nhầm job nó không hiểu.
