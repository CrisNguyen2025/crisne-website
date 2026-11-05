# Plan: các việc tiếp theo cho Abot và Roadmap

Ngày lập: 2026-11-05. Dựa trên lần chạy `tests/manual/assistant-sections.md` (2026-11-04) và các bản sửa đã lên `main` tới commit `ea3a2be`.

Quy ước chung cho mọi mục:
- Sửa code Python trong `roadmap-rag-assistant/rag_service`. Mỗi lỗi có một test hồi quy trong `roadmap-rag-assistant/tests/`, test phải fail trên code cũ.
- Sau khi sửa: chạy toàn bộ suite (`.venv/bin/python -m pytest tests -q`). Hai test đang fail sẵn (`test_evals_answer_target`, `test_write_invariants`) không được tệ hơn; `wrong_branch` của router không vượt 107.
- Chạy lại case liên quan trong `tests/manual/assistant-sections.md` bằng Playwright, ghi kết quả vào kịch bản.
- Viết hoặc sửa thì luôn có preview và chờ `ok`, giống create/delete hiện tại.

Thứ tự đề xuất: 1 → 2 → 3 → 4 làm trước (backend hoặc API đã có sẵn, chủ yếu là nối lại). 5 → 9 làm sau.

---

## 1. Đổi tên mục qua chat (lỗi 5, case C1–C3)

**Hiện tại:** "đổi tên mục RAG thành Retrieval trong topic X" trả `UPDATE_NOT_SUPPORTED_REPLY`. API `PATCH /api/v1/roadmaps/[slug]/sections`, adapter `update_section()` và tool `rename_section` đều có sẵn. Chỗ chặn là `handle_cud` (`domains/roadmap/commands.py`): nó từ chối mọi `ActionType.UPDATE`, và schema không có cấp `section`.

**Cách làm:** thêm một handler riêng chạy trước `handle_cud`, giống `handle_bulk_import`, thay vì nhồi thêm cấp `SECTION` vào extractor LLM.
1. Viết `RENAME_SECTION` regex trong `router/policy.py`, khớp trên chữ đã bỏ dấu: `(đổi|sửa) tên mục <from> thành <to> [trong|của topic <topic>]`.
2. Topic lấy theo thứ tự: tên nêu trong câu (`resolve_topic`), rồi topic đang mở (`page_context.roadmapSlug`), rồi `active_topic_slug`. Không xác định được thì hỏi lại bằng `_ask_topic_choice`.
3. Kiểm tra mục `<from>` có trong `get_topic(slug)["sections"]` không (so bằng `normalizeTitle`). Không có thì liệt kê các mục hiện có và dừng, không preview.
4. Hiện preview "Đổi tên mục `RAG` → `Retrieval` (3 bài)". Nếu `<to>` trùng một mục đã có, ghi rõ "sẽ gộp vào mục `Retrieval`".
5. Khi nhận `ok`, gọi `update_section()` dưới `write_granted`, kèm `ChangeSet` để thẻ "Xem lại" hiện đúng.
6. Lưu preview vào `pending_confirmation`, nên `handle_pending` cần chạy được loại hành động mới này. Cách gọn nhất là thêm `EntityLevel.SECTION` chỉ cho executor (extractor không sinh ra cấp này), cùng nhánh `UPDATE` cho section trong `execution/executor.py`.

**Test:** đổi tên thành công; gộp vào mục đã có; mục không tồn tại; không nêu topic và không mở trang nào; visitor bị chặn; preview cũ bị huỷ khi có câu khác xen vào.

**Rủi ro:** thấp, vì handler chỉ khớp một mẫu câu hẹp. Cần chạy lại stress router để chắc "đổi tên bài …" vẫn trả `UPDATE_NOT_SUPPORTED_REPLY` như cũ.

## 2. "mục X" bị hiểu thành topic (lỗi 3, case A6–A7)

**Hiện tại:** "thêm bài Function Schema mục Tools" khi đang mở `?topic=qa-sandbox`: extractor đặt `target_parent_identifier = "Tools"`, `resolve_topic("Tools")` trả `not_found`, nên Abot hỏi "topic Tools nào".

**Cách làm** (trong `handle_cud`, nhánh tạo bài):
1. Khi `resolve_topic(parent)` trả `not_found` và câu có "mục <parent>" (chữ ngay sau "mục" hoặc "section" trùng với parent), coi đó là tên mục: đặt `entity.section = parent` nếu `section` đang trống, bỏ parent đi.
2. Lấy topic lại theo thứ tự đã có: tên topic nêu trong câu, rồi trang đang mở, rồi session. Chỉ hỏi lại khi vẫn không có topic nào.
3. Cách khác (nếu thấy cần): sửa prompt của extractor (`prompts.py` mục 4) để "mục X" không bao giờ được dùng làm `target_parent_identifier`. Cách 1 vẫn nên giữ làm lưới an toàn, vì LLM không ổn định.

**Test:** mở trang topic rồi gõ "thêm bài X mục Tools" thì bài vào đúng topic và mục `Tools`; không mở trang nào thì hỏi topic, và câu hỏi không gọi "Tools" là topic; "thêm bài X vào topic Tools" mà topic Tools có thật thì giữ nguyên hành vi cũ.

**Rủi ro:** trung bình, vì đụng vào extractor. Nếu sửa prompt thì phải chạy lại `evals/router`.

## 3. Liệt kê mục của topic (lỗi 7, case F1)

**Hiện tại:** "topic QA Sandbox có những mục nào?" đi qua tra cứu RAG và trả "chưa có thông tin chi tiết về các mục". Trong khi `GET /api/v1/roadmaps/[slug]` đã trả sẵn `sections`.

**Cách làm:** thêm `handle_section_listing` ngay sau `handle_listing` trong `agent.py`.
1. Viết regex `LIST_SECTIONS`: "(topic X) có (những|các) mục nào/gì", "các mục của topic X", "liệt kê mục".
2. Topic lấy theo thứ tự: tên nêu trong câu, rồi trang đang mở.
3. Trả lời bằng văn bản cố định, mỗi dòng một mục kèm số bài, ví dụ "RAG (3 bài)", "Chung (1 bài)", theo thứ tự hiển thị trên trang. Topic chưa có bài thì nói rõ.
4. Không qua LLM, nên không bịa được mục.

**Test:** có mục; chỉ có bài [Chung]; topic trống; không rõ topic nào thì hỏi lại; "mục RAG có những bài gì" vẫn đi tra cứu như cũ (case F2 đang đạt).

**Rủi ro:** thấp.

## 4. Ô nhập chat nhiều dòng (lỗi 6, case B2–B3)

**Hiện tại:** `ChatComposer` dùng `<input type="text">`, nên danh sách dán vào bị gộp thành một dòng. Tính năng `handle_bulk_import` (nhập nhiều bài một lần) không dùng được từ UI.

**Cách làm** (trong `roadmap-rag-assistant/sdk/typescript/src/react`):
1. `components/ChatComposer.tsx`: đổi sang `<textarea rows={1}>`, tự tăng chiều cao tới khoảng 6 dòng rồi cuộn; giữ `maxLength`.
2. `RoadmapChatbotWidget.tsx`: đổi `inputRef` và `handleKeyDown` sang `HTMLTextAreaElement`. Enter thì gửi, Shift+Enter thì xuống dòng, đang gõ IME thì bỏ qua như hiện tại.
3. Hiển thị tin nhắn người dùng có giữ dấu xuống dòng (`whitespace-pre-wrap`), để thấy được danh sách đã dán.
4. Kiểm tra bản mobile: bàn phím, `keyboardBox` và chiều cao composer.

**Test:** Playwright chạy B2 (dán danh sách khi đang mở topic thì cả hai bài được tạo) và B3 (không mở topic thì hỏi lại); Enter vẫn gửi; Shift+Enter xuống dòng.

**Rủi ro:** thấp, chỉ thay đổi UI.

---

## 5. Tên topic có chữ "Section" bị cắt sai (lỗi 2)

**Hiện tại:** "thêm bài X vào topic QA Section Test mục RAG" bị hiểu thành topic "QA Section" và mục "Test mục rag".

**Cách làm:** sau khi trích xuất, nếu `topic_named_in_message` tìm thấy một topic có thật mà tên dài hơn parent đã trích, dùng topic đó, rồi tính lại `section` là phần sau chữ "mục" nằm **sau** tên topic. Test với topic có các chữ "Section", "Mục", "Topic" trong tên.

## 6. Sửa bài qua chat

Bắt đầu với "chuyển bài X sang mục Y" và "đổi tên bài X thành Y". Dùng chung cách của mục 1: handler theo mẫu câu, `resolve_lesson` để lấy id, preview rồi chờ `ok`, sau đó gọi `update_item()` có sẵn. Sửa nội dung bài vẫn để làm trên trang. (Cập nhật 2026-11-05: Owner chọn để Abot viết nháp nội dung cho một bài có sẵn, xem trước rồi "ok" mới nối vào cuối bài: `rag_service/domains/roadmap/lesson_content.py`.)

## 7. Ghi memory vào trace

Trong `core/generation/pipeline.py`, ghi khối `<conversation_history>` đã đưa vào prompt (hoặc danh sách các lượt) làm metadata của bước generation, cắt ngắn ở khoảng 4 KB. Khi đó nút ID copy ra là đối chiếu được cả lịch sử chat. Cần cân nhắc vì dữ liệu người dùng gõ vào sẽ được lưu lên Langfuse cloud.

## 8. Langfuse deprecation

`GET /api/public/traces/{id}` đã trả 410 và sẽ bị gỡ vào 2026-11-16. Code của project không gọi endpoint này, nhưng triage có gọi `api.legacy.scoreV1.delete` (`lib/` → `listDownvotedTraces` và các hàm liên quan). Cần kiểm tra lời gọi này có nằm trong đợt gỡ bỏ không, nếu có thì chuyển sang API score mới. Liên quan tới việc bật lại 👍/👎 (`FEEDBACK_ENABLED`).

## 9. Hai test đang fail sẵn

- `test_evals_answer_target`: cần `prisma/dev.db` có dữ liệu. File hiện bị sửa (co từ 1,2 MB còn 274 KB) và chưa commit. Khôi phục bằng `git checkout prisma/dev.db` nếu bản đang có trên đĩa là ngoài ý muốn.
- `test_write_invariants`: `wrong_branch` đang là 107 so với mốc 103. Xem 4 câu nào mới đi sai nhánh, rồi sửa router hoặc cập nhật mốc trong `evals/router/confuse_baseline.json` nếu thay đổi đó là chủ ý.

---

## Việc đang chờ quyết định

- Nút 👍/👎 của Abot đang ẩn (`FEEDBACK_ENABLED = false`) cho tới khi có rule biến một vote thành việc trong Triage. Chat trên trang portfolio (`FloatingChat*`) vẫn còn nút vote.
