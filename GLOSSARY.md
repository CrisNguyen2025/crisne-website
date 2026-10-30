# crisne

Website cá nhân của Cris: portfolio, learning roadmap có trợ lý AI, ghi chú và workflow builder. Glossary chỉ chứa thuật ngữ; quyết định kiến trúc nằm trong `docs/adr/`.

`_Also_` là tên đồng nghĩa hợp lệ, dùng tên nào cũng được; code mới theo tên đang có trong code. `_Avoid_` là tên nên tránh. Xem ADR-0007.

## Roadmap

**Topic**:
Một lộ trình học theo một chủ đề, ví dụ "AI & LLM Architecture", định danh bằng slug.
_Also_: Roadmap
_Avoid_: course, lộ trình con

**Layer**:
Một mảng kiến thức trong Topic, có short tag dạng "02-LLM".
_Avoid_: section, module, domain

**Level**:
Độ khó của một Group: core, intermediate, advanced, hoặc tên tuỳ chỉnh.
_Avoid_: tier, difficulty

**Group**:
Tập Lesson cùng một Level trong một Layer.
_Avoid_: category, cluster

**Lesson**:
Một bài học trong Group, có nội dung rich text.
_Also_: Item
_Avoid_: knowledge node, bài viết

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

**Change**:
Yêu cầu tạo, sửa hoặc xoá một Topic, Layer, Group hoặc Lesson.
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

## Cris AI & Knowledge Triage

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

**Knowledge Triage**:
Hàng đợi các câu trả lời bị 👎 của Roadmap Assistant mà Owner import về, để soạn thành Lesson mới hoặc bỏ qua.
_Avoid_: feedback queue, review queue

**Triage Status**:
Trạng thái một mục Knowledge Triage: pending, drafted, approved, dismissed.
_Avoid_: review state

## Workflow Builder

**Project**:
Không gian làm việc của Owner trong Workflow Builder, chứa Document và Workflow.
_Avoid_: workspace

**Document**:
Tệp Owner tải lên một Project để làm kiến thức cho Workflow.
_Avoid_: file, attachment, KB doc

**Chunk**:
Một đoạn của Document dùng để tìm kiếm theo nghĩa.
_Avoid_: passage, segment

**Workflow**:
Một đồ thị các Node trong Project, có một Draft và các Version.
_Avoid_: flow, pipeline, graph

**Draft**:
Bản đang chỉnh sửa của một Workflow.
_Avoid_: working copy

**Version**:
Bản đã publish của một Workflow; không đổi sau khi publish.
_Avoid_: release, snapshot

**Node**:
Một bước trong Workflow.
_Avoid_: step, block

**Run**:
Một lần chạy Workflow, từ Version hoặc từ Draft, kích hoạt thủ công hoặc qua API.
_Avoid_: execution, job

**Node Execution**:
Kết quả chạy một Node trong một Run.
_Avoid_: step run

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
