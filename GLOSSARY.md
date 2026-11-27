# crisne

Website cá nhân của Cris: portfolio, learning roadmap có trợ lý AI, ghi chú và workflow builder. Glossary chỉ chứa thuật ngữ; quyết định kiến trúc nằm trong `docs/adr/`.

`_Also_` là tên đồng nghĩa hợp lệ, dùng tên nào cũng được; code mới theo tên đang có trong code. `_Avoid_` là tên nên tránh. Xem ADR-0007.

## Roadmap

**Topic**:
Một lộ trình học theo một chủ đề, ví dụ "AI & LLM Architecture", định danh bằng slug.
_Also_: Roadmap
_Avoid_: course, lộ trình con

**Section**:
Mục tuỳ chọn của một Topic, gom các Lesson cùng mảng; là chuỗi tự do, so khớp không phân biệt hoa thường. Lesson không có Section nằm ở mục chung của Topic.
_Also_: mục
_Avoid_: layer, group, category, module, domain, level

**Lesson**:
Một bài học thuộc một Topic, có Section tuỳ chọn và nội dung rich text.
_Also_: Item
_Avoid_: knowledge node, bài viết

**Lesson Status**:
Owner đang ở đâu với một Lesson: **target** (muốn học), **learning** (đang học) hoặc **known** (đã nắm). Nói về tiến trình của Owner, không nói về độ khó của bài.
_Also_: trạng thái bài; mục tiêu, đang học, đã nắm
_Avoid_: level, progress, mastery

## Roadmap Assistant

**Roadmap Assistant**:
Chatbot trên các trang Topic, trả lời từ nội dung các Topic và cho Owner thay đổi chúng bằng lời.
_Avoid_: RAG bot, roadmap chatbot

**Actor**:
Vai trò của người gửi tin nhắn tới Roadmap Assistant: Owner hoặc Visitor.
_Avoid_: role (thuật ngữ của API Docs), user type

**Owner**:
Người có quyền ghi dữ liệu trên site: đăng nhập bằng email được cho phép, hoặc gọi máy bằng admin key.
_Avoid_: admin, author

**Visitor**:
Mọi người dùng không phải Owner; chỉ được đọc và hỏi.
_Avoid_: guest, anonymous, user

**Thread**:
Một cuộc hội thoại với Roadmap Assistant, luôn thuộc về đúng một Actor.
_Avoid_: session, conversation

**Owner Memory**:
Mục ghi nhớ ngắn và bền vững về Owner xuyên qua nhiều Thread (nền tảng, techstack, mục tiêu, quy ước trả lời hoặc ghi chú học tập), gồm phần Owner chia sẻ trực tiếp (`explicit`) và phần Abot quan sát (`suggested` / `observed`), chỉ Owner thấy và dùng.
_Avoid_: user profile, global context, long-term prompt

**Owner Observation**:
Quan sát dài hạn được Roadmap Assistant tự rút ra từ hội thoại hoặc tổng hợp định kỳ từ hoạt động học tập của Owner; luôn có nguồn gốc minh bạch và quyền tắt/sửa/từ chối tức thì.
_Also_: Abot quan sát
_Avoid_: user profile, behavior analytics, Provenance

**Owner Activity Event**:
Sự kiện hoạt động thưa của Owner (như kết quả Quiz hoặc phản hồi từ chối/sửa quan sát) lưu append-only để làm nguyên liệu tổng hợp Owner Observation, không bao giờ nạp thô vào prompt.
_Avoid_: audit log, raw log, Trace

**Owner Preference**:
Thiết lập kiểm soát bộ nhớ của riêng Owner (bật/tắt dùng bộ nhớ trong chat, bật/tắt tự động quan sát, mốc tổng hợp gần nhất).
_Avoid_: user settings, feature flag (khi nói về công tắc bộ nhớ Owner)

**Thread Summary**:
Bản tóm tắt phần hội thoại cũ của một Thread khi số lượt vượt quá cửa sổ tin nhắn gần nhất.
_Avoid_: chat recap, memory summary

**Change**:
Yêu cầu tạo, sửa hoặc xoá một Topic, Section hoặc Lesson.
_Also_: CUD
_Avoid_: write, mutation

**Preview**:
Thẻ mô tả một Change đang chờ Owner xác nhận hoặc huỷ.
_Avoid_: confirm card, pending card

**Pending Action**:
Change đã được Preview nhưng chưa được xác nhận hay huỷ.
_Avoid_: queued action

**Scope**:
Phạm vi của một tin nhắn: thuộc các Topic, thuộc lĩnh vực nhưng chưa có Lesson (Domain Gap), hay ở ngoài (External).
_Avoid_: topic (khi nói về phạm vi)

**Domain Gap**:
Câu hỏi thuộc lĩnh vực của các Topic nhưng chưa có Lesson nào trả lời.
_Avoid_: no-context, missing lesson

**Out of Scope**:
Tin nhắn không liên quan tới các Topic; Roadmap Assistant từ chối trả lời.
_Also_: off-topic
_Avoid_: external question

**Plan**:
Dàn ý một Topic mới mà Roadmap Assistant đề xuất, chưa ghi vào dữ liệu.
_Avoid_: outline, template

**Goal**:
Lệnh của Owner để Roadmap Assistant tạo trọn một Topic từ một mục tiêu học.
_Avoid_: auto-generate

**Connector**:
Kết nối một tài khoản ngoài của Owner (như hộp thư Gmail) với Roadmap Assistant để trợ lý truy xuất ngữ cảnh theo yêu cầu trong từng lượt hỏi mà không nạp vào kho Lesson.
_Avoid_: plugin, external sync, mailbox sync

## News

**News Source**:
Một nguồn tin Owner khai báo để hệ thống tự thu thập bài mới theo lịch, ví dụ blog hoặc trang release của một thư viện.
_Also_: nguồn tin
_Avoid_: subscription, channel

**News Item**:
Một bài hoặc link được thu thập từ News Source, do Owner chia sẻ hoặc nhập tay, kèm bản tóm tắt và các ý chính.
_Also_: tin
_Avoid_: article, bookmark, acquired item

**Provenance**:
Nguồn gốc của một câu trong Lesson: câu đó lấy từ News Item nào, đoạn trích làm căn cứ và thời điểm thu thập. Chỉ Owner thấy.
_Also_: nguồn gốc
_Avoid_: citation (thuật ngữ trích dẫn của Roadmap Assistant), knowledge statement, source

## Cris AI & Feedback

**Cris AI**:
Chatbot trên trang portfolio, trả lời về Cris từ Portfolio Knowledge.
_Avoid_: floating bot, site chatbot

**Portfolio Knowledge**:
Tập nội dung về Cris (bio, kinh nghiệm, dự án, kỹ năng, dịch vụ, FAQ, liên hệ) mà Cris AI dùng để trả lời.
_Avoid_: knowledge base (khi không nói rõ của chatbot nào)

**Trace**:
Bản ghi một lượt trả lời của chatbot trên Langfuse.
_Avoid_: log, run (khi nói về chatbot)

**Feedback**:
Đánh giá 👍/👎 của người dùng cho một câu trả lời, gắn vào Trace.
_Avoid_: rating, vote, score

**Golden Set**:
Tập câu hỏi kèm đáp án chuẩn dùng để đánh giá chất lượng trả lời.
_Avoid_: test set, benchmark

## Notes & API Docs

**Note**:
Một ghi chú hoặc link Owner lưu lại, gắn với một Tag.
_Avoid_: bookmark, post

**Tag**:
Nhãn phân loại Note.
_Avoid_: label, category

**Favorite**:
Tag mà một người dùng đánh dấu yêu thích.
_Avoid_: bookmark, star

**API Endpoint**:
Một API được ghi trong trang API Docs, thuộc một Feature.
_Avoid_: route, API

**Feature**:
Nhóm API Endpoint theo chức năng sản phẩm.
_Avoid_: module

**Role**:
Vai trò người dùng của hệ thống được mô tả trong API Docs, có quyền truy cập riêng trên từng API Endpoint.
_Avoid_: Actor (thuật ngữ của Roadmap Assistant)
