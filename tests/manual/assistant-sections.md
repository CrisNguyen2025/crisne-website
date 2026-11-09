# Kịch bản kiểm thử: Section qua Roadmap Assistant (Abot)

Phạm vi: mọi thao tác liên quan tới **section (mục)** của topic khi đi qua chat, theo ADR-0009.
Mỗi case ghi câu gõ vào chat, kết quả mong đợi, và cách kiểm tra trên trang hoặc API.

## Chuẩn bị

1. Chạy cả hai service: `yarn dev` (cổng 3334) và `yarn rag:dev` (cổng 8000). `.env.local` phải có `RAG_SERVICE_URL`.
2. Đăng nhập bằng tài khoản **owner**, vì chỉ owner được ghi.
3. DB đang trỏ vào **Turso thật**. Mọi case chỉ dùng topic test riêng, xoá topic đó ở bước dọn dẹp.
4. Tạo topic test qua chat: `tạo topic QA Section Test`. Ghi lại slug, các case dưới đây gọi là `<slug>`.
5. Cách kiểm tra nhanh: `GET /api/v1/roadmaps/<slug>`, xem trường `section` của từng bài.

Ký hiệu: **[Chung]** nghĩa là bài có `section = null`.

---

## A. Thêm bài vào section

| # | Gõ vào chat | Kết quả mong đợi |
|---|---|---|
| A1 | `thêm bài Vector DB vào topic QA Section Test mục RAG` | Bài được tạo, `section = "RAG"`. Câu trả lời có cụm "mục **RAG**". |
| A2 | `thêm bài Embeddings vào topic QA Section Test mục rag` | Bài vào **cùng** section `RAG`, giữ đúng cách viết đã có, không sinh section `rag` thứ hai. |
| A3 | `thêm bài Reranking vào topic QA Section Test mục   RAG  ` | Khoảng trắng thừa bị bỏ, bài vẫn vào `RAG`. |
| A4 | `thêm bài Prompt Basics vào topic QA Section Test` | Không nêu mục: bài vào **[Chung]**. Abot **không** tự chọn mục. |
| A5 | `thêm 3 bài: Chunking, Hybrid Search, BM25 vào mục Retrieval của topic QA Section Test` | Cả 3 bài có `section = "Retrieval"`. Câu trả lời ghi "vào mục Retrieval". |
| A6 | `thêm bài Agents vào mục Tools` (không nêu topic, không mở trang topic nào) | Abot hỏi lại topic nào, **chưa tạo gì**. |
| A7 | Mở trang `?topic=<slug>`, gõ `thêm bài Tool Calling mục Tools` | Lấy topic từ trang đang mở, bài vào section `Tools`. |

## B. Ngữ cảnh trang và dán danh sách

| # | Thao tác | Kết quả mong đợi |
|---|---|---|
| B1 | Mở `?topic=<slug>&section=RAG`, gõ `thêm bài Query Rewriting` | Theo prompt, Abot chỉ điền section khi người dùng nêu. Mong đợi: bài vào **[Chung]**. Nếu bài vào `RAG`, ghi lại là hành vi lệch, cần chốt có muốn dùng section đang mở hay không. |
| B2 | Mở `?topic=<slug>`, dán:<br>`thêm:`<br>`- Eval Set`<br>`- Golden Answers` | Nhập 2 bài vào topic đang mở. Code hiện truyền `section: ""`, nên cả 2 bài vào **[Chung]**. |
| B3 | Như B2 nhưng **không** mở topic nào | Abot báo thấy 2 dòng bài và hỏi topic đích, chưa tạo gì. |
| B4 | Dán danh sách 2 dòng mà **không** có dòng `thêm:` ở đầu | Không được coi là lệnh nhập, không tạo bài nào. |

## C. Đổi tên section

| # | Gõ vào chat | Kết quả mong đợi |
|---|---|---|
| C1 | `đổi tên mục RAG thành Retrieval Augmented trong topic QA Section Test` | **Cần xác nhận.** Prompt có ví dụ gọi `rename_section`, nhưng `handle_cud` trả `UPDATE_NOT_SUPPORTED_REPLY` cho mọi lệnh UPDATE ("Abot chưa sửa được topic hay bài học qua chat…"). Ghi lại nhánh nào chạy. Nếu đổi tên được: mọi bài của `RAG` chuyển sang tên mới, câu trả lời có số bài. |
| C2 | (nếu C1 đổi được) `đổi tên mục Retrieval Augmented thành retrieval trong topic QA Section Test` | Trùng tên với section `Retrieval` (khác hoa thường): hai section **gộp làm một**, dùng cách viết `Retrieval`. |
| C3 | `đổi tên mục Không Có trong topic QA Section Test thành X` | Không có section này: báo lỗi, không bài nào bị đổi (API trả 404). |

## D. Xoá bài và trùng tên

| # | Gõ vào chat | Kết quả mong đợi |
|---|---|---|
| D1 | `xóa bài Embeddings` | Hiện preview, kèm dòng `Mục: RAG` nếu có. Gõ `ok` thì xoá. Section `RAG` vẫn còn vì vẫn còn bài. |
| D2 | Xoá hết bài của một section (ví dụ các bài `Tools`) | Section `Tools` tự biến mất khỏi trang, vì không có bảng section riêng. |
| D3 | `thêm bài Vector DB vào topic QA Section Test mục Tools` | Tên bài đã có trong topic (dù khác mục): **không** tạo bài, báo trùng (API 409). |
| D4 | Tạo topic thứ hai, có bài cùng tên `Vector DB`, rồi gõ `xóa bài Vector DB` khi không mở topic nào | Abot liệt kê các ứng viên dạng `- Vector DB (mục RAG)` / `(mục Chung)` và hỏi lại, chưa xoá gì. |
| D5 | Preview xoá đang hiện, gõ một câu khác rồi mới gõ `ok` | Preview cũ bị huỷ, `ok` không xoá gì. |

## E. Từ vựng cũ (layer / group)

| # | Gõ vào chat | Kết quả mong đợi |
|---|---|---|
| E1 | `thêm bài Docker vào layer 01-DB của topic QA Section Test` | Abot trả "Roadmap không còn layer hay group…" kèm ví dụ cú pháp mới, **không tạo gì**. |
| E2 | `thêm group Core vào topic QA Section Test` | Như E1. |
| E3 | `thêm layer dropout vào model Keras` | Không phải lệnh roadmap (không có danh từ roadmap, không có tên topic): **không** trả câu layer/group. |

## F. Đọc và hỏi đáp

| # | Gõ vào chat | Kết quả mong đợi |
|---|---|---|
| F1 | `topic QA Section Test có những mục nào?` | Liệt kê đúng các section hiện có, không bịa section. |
| F2 | `mục Retrieval có những bài gì?` (đang mở topic test) | Đúng các bài của section đó. |
| F3 | Mở chat: lời chào có ví dụ `thêm bài <tên bài> vào topic … mục …` | Ví dụ dùng slug topic và tên mục **có thật**, copy chạy được. |
| F4 | Bấm chip section trong chat (nếu có) | Trang chuyển tới section đó (event `roadmap:select-section`). |

## G. Quyền và triage

| # | Thao tác | Kết quả mong đợi |
|---|---|---|
| G1 | Đăng xuất (visitor), gõ `thêm bài X vào topic QA Section Test mục RAG` | Trả `OWNER_ONLY_MESSAGE`, không ghi gì. |
| G2 | (Đã bỏ — TASK-triage-removal-001) | Đã bỏ cùng feature Knowledge Triage. |
| G3 | (Đã bỏ — TASK-triage-removal-001) | Đã bỏ cùng feature Knowledge Triage. |

## Dọn dẹp

1. `xóa topic QA Section Test`, gõ `ok` khi có preview. Xoá luôn topic phụ của D4.
2. Kiểm tra `GET /api/v1/roadmaps` không còn topic test.

## Ghi kết quả

Lần chạy 2026-11-04, commit `0734cc0` (chưa có bản sửa nào), Playwright MCP, owner qua `DEV_OWNER_BYPASS`, DB Turso, LLM groq `openai/gpt-oss-120b`.
Topic test đã được xoá sau khi chạy.
Vì lỗi 1 bên dưới, các bài nền được tạo qua `POST /api/v1/roadmaps/items`, sau đó mới chạy các case chat.

### Lỗi tìm thấy

1. **Chặn mọi lệnh thêm bài khi nêu tên topic.** `handle_cud` (`domains/roadmap/commands.py`) gán tên topic ("QA Sandbox") vào `target_parent_identifier`, không đổi sang slug. Executor gửi tên đó làm `roadmapSlug`, nên API trả 404. `_topic_known` không chặn được vì khi tra cứu lỗi nó trả True.
2. **Tên topic chứa chữ "Section"** ("QA Section Test") bị cắt: phần "Section Test" bị hiểu là tên mục, ví dụ ra `Mục: Test mục rag`. Đã sửa ở `TASK-abot-bugs-001`, test: `tests/test_entity_extractor.py::test_topic_with_section_in_name_is_not_read_as_section` và `tests/test_sections_chat.py::test_topic_with_section_in_title_extracts_correct_section_and_topic`.
3. **Mục bị hiểu thành topic.** "thêm bài X mục Tools" được hiểu là topic `Tools`, kể cả khi đang mở trang topic (A7).
4. **Abot báo đã xoá nhưng không xoá gì (D5).** Sau `xóa bài Reranking`, người dùng hỏi một câu tra cứu rồi gõ `ok`. Preview đã được huỷ đúng, nhưng `ok` lúc này không còn preview nào để xác nhận nên rơi xuống nhánh `chitchat` (log: `rule=greeting_opener tools=[]`), và LLM bịa ra câu "Đã xóa bài học Reranking". Bài vẫn còn trong DB. Cách sửa: khi gặp `ok`/`hủy` mà không có preview đang chờ, trả một câu cố định.
5. **Đổi tên mục qua chat không làm được (C1).** Lệnh trả `UPDATE_NOT_SUPPORTED_REPLY`, trong khi prompt lại có ví dụ `rename_section`.
6. **Ô nhập chat chỉ có một dòng** (`<input type=text>`): danh sách dán vào bị gộp thành một dòng, nên không nhập được nhiều bài một lần (B2, B3).
7. **Không liệt kê được mục của topic (F1):** "Hệ thống hiện chưa có thông tin chi tiết về các mục".
8. Nhỏ: preview xoá bài không hiện dòng `Mục:`, và vẫn có cảnh báo "xoá toàn bộ dữ liệu con" dù bài không có dữ liệu con. Đã sửa ở `TASK-abot-bugs-001`, test: `tests/test_delete_by_name.py::test_delete_lesson_preview_shows_section_and_no_child_warning` và `tests/test_delete_by_name.py::test_delete_lesson_with_content_shows_content_warning`.

### Bảng kết quả

| Case | Kết quả | Ghi chú |
|---|---|---|
| A1–A4 (qua chat) | Fail | Preview đúng mục (`RAG`, giữ cách viết), nhưng `ok` trả 404 (lỗi 1). Với topic "QA Section Test" thì sai mục (lỗi 2). |
| A2, A3 (qua API) | Pass | `rag` và `  RAG  ` gộp vào `RAG`. |
| A4 | Pass phần preview | Không nêu mục thì không có mục, Abot không tự chọn. |
| A5 | Fail | Preview đúng 3 bài mục `Retrieval`, rồi 404. Với tên topic có "Section" thì bị tách thành nhiều bước. |
| A6 | Pass một phần | Không tạo gì, nhưng báo "Không tìm thấy topic Tools" thay vì hỏi topic. |
| A7 | Fail | Bỏ qua topic đang mở, hiểu `Tools` là topic (lỗi 3). |
| B1 | Pass | Mở `section=RAG`, bài vẫn vào [Chung], đúng prompt. |
| B2, B3 | Không test được | Lỗi 6. |
| B4 | Pass | Không tạo bài. |
| C1, C3 | Fail | Lỗi 5. C2 bị bỏ qua. |
| D1 | Pass | Preview rồi `ok` thì xoá, mục `RAG` vẫn còn. |
| D2 | Pass | Xoá bài cuối của `Tools` thì mục biến mất khỏi `sections`. |
| D3 (qua API) | Pass | Trả 409. Qua chat thì bị lỗi 1 che mất. |
| D4 | Pass | Liệt kê `Vector DB (mục Chung)` / `(mục RAG)` và hỏi lại. |
| D5 | **Fail** | Lỗi 4. Preview được huỷ đúng, nhưng Abot báo sai là đã xoá. |
| E1, E2, E3 | Pass | E3 không trả câu layer/group. |
| F1 | Fail | Lỗi 7. |
| F2 | Pass | Trả đúng Chunking, Hybrid Search. |
| F3, F4 | Chưa chạy | Lịch sử chat còn giữ nên không thấy lời chào. |
| G1 | Chưa chạy | Bypass owner đang bật nên không thử được vai visitor. |
| G2, G3 | Đã bỏ | Feature Knowledge Triage đã được gỡ (TASK-triage-removal-001). |

### Chạy lại sau bản sửa lỗi 1 và 4 (2026-11-05)

Bản sửa nằm ở `handle_cud` và `handle_pending` trong `roadmap-rag-assistant/rag_service/domains/roadmap/commands.py`. Test hồi quy: `roadmap-rag-assistant/tests/test_lesson_topic_slug.py`. Topic test đã được xoá sau khi chạy.

| Case | Kết quả | Ghi chú |
|---|---|---|
| A1 | Pass | Preview ghi `Parent: qa-sandbox`. Bài `Vector DB` vào mục `RAG`. |
| A2 | Pass | `mục rag` lưu thành `RAG`. Câu trả lời vẫn ghi "mục rag" (theo chữ người dùng gõ, không theo tên đã lưu). |
| A5 | Pass | Cả 3 bài vào mục `Retrieval`. |
| Topic không có | Pass | `thêm bài Kafka vào topic Kafka Streams`: liệt kê các topic và hỏi lại, không tạo gì. |
| D3 | Pass | "Đã có sẵn bài học Vector DB, không tạo thêm bản trùng." |
| D5 | Pass | `ok` gõ sau khi preview đã bị huỷ được trả lời "Không có thao tác nào đang chờ xác nhận…". Bài vẫn còn. |

### Chạy lại sau plan mục 1–4 (2026-11-05)

Bản sửa: `domains/roadmap/sections.py` (liệt kê và đổi tên mục), `commands.py` (`names_section`, `pending_section_rename`, nhập danh sách), `sdk/.../ChatComposer.tsx` (textarea). Test: `roadmap-rag-assistant/tests/test_sections_chat.py`. Playwright, DB Turso, topic test đã xoá.

| Case | Kết quả | Ghi chú |
|---|---|---|
| F1 | Pass | "Topic QA Sandbox có 2 mục, và 1 bài chưa vào mục nào (nhóm Chung)" kèm từng mục và số bài. Cũng đúng với "topic này …" khi đang mở trang. |
| C1 | Pass | Preview `Tools → Tooling (1 bài)`, gõ `ok` thì `rename_section` chạy. |
| C3 | Pass | "không có mục Không Có… Các mục hiện có: RAG, Tooling", không có preview. |
| A7 | Pass | Đang mở topic, "thêm bài Function Schema mục Tooling" vào đúng `qa-sandbox` mục `Tooling`. |
| B2 | Pass | Dán `thêm:` + 2 dòng: `import_items_from_text` tạo 2 bài. |
| B3 | Pass | Không mở topic nào: "Tôi thấy 2 dòng bài nhưng chưa biết thêm vào topic nào…". |
| Ô nhập | Pass | Shift+Enter xuống dòng, Enter gửi. |
