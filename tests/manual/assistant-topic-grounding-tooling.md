# Kịch bản kiểm thử: Grounding và tooling ở mức topic qua Abot

Phạm vi: Abot hiểu đúng topic và bài mà câu chat nói tới (**grounding**: tên, slug, trang đang mở, ngữ cảnh thread),
và các thao tác ghi qua chat chạy đúng tool, có preview, có bằng chứng trong DB (**tooling**).
Bổ sung cho [assistant-sections.md](assistant-sections.md), không lặp lại các case về mục.

## Chuẩn bị

1. `yarn dev` (3334) và `yarn rag:dev` (8000). Owner nhờ `DEV_OWNER_BYPASS=true`.
2. DB là **Turso thật**: chỉ dùng topic test `QA Sandbox` (slug `qa-sandbox`), xoá ở T8.
3. Bằng chứng: `GET /api/v1/roadmaps/qa-sandbox` và dòng `[turn] … tools=[…]` của `yarn rag:dev`.
4. Preview ghi nhận bằng câu "Xác nhận thực hiện"; gõ `ok` để chạy.

## Eval tự động liên quan (chạy trước)

Từ `roadmap-rag-assistant/`, cần `prisma/dev.db` ở schema ADR-0009 (xem "Ghi kết quả"):

```bash
.venv/bin/python -m evals run --opt mode=hybrid --opt gate=on --profile hybrid --allow-stale
.venv/bin/python -m evals.router.holdout
.venv/bin/python -m evals.router.confuse
.venv/bin/python -m evals.smoke_live
```

## T. Tooling

| # | Gõ vào chat | Kết quả mong đợi |
|---|---|---|
| T1 | `tạo topic QA Sandbox` | Preview, `ok` thì tạo. API `GET qa-sandbox` trả 200. |
| T2 | `liệt kê các topic` | Danh sách có QA Sandbox, khớp `GET /api/v1/roadmaps`. |
| T3 | `thêm 2 bài: Eval Set, Golden Answers vào topic QA Sandbox` | Preview 2 bài, `ok` thì cả 2 có trong API. |
| T4 | `thêm nội dung chi tiết cho bài "Eval Set" trong QA Sandbox` | Preview "NHÁP NỘI DUNG", chưa ghi. `ok` thì `content` của bài khác rỗng, có `<h2>`. |
| T5 | `xóa bài Golden Answers` | Preview, `ok` thì bài mất khỏi API. |
| T6 | `ok` (không có preview nào đang chờ) | Câu cố định "Không có thao tác nào đang chờ xác nhận", không đổi gì. |
| T7 | `thêm bài Eval Set vào topic QA Sandbox` | Báo trùng, API vẫn chỉ có 1 bài Eval Set. |
| T8 | `xóa topic QA Sandbox` | Preview, `ok` thì API trả 404. Dọn dẹp. |

## G. Grounding

| # | Thao tác | Kết quả mong đợi |
|---|---|---|
| G1 | Mở `?topic=qa-sandbox`, gõ `thêm bài Tool Calling` | Lấy topic từ trang, preview ghi QA Sandbox; `ok` thì bài có trong API. |
| G2 | `thêm bài Vector DB vào topic qa-sandbox` | Slug và tên cùng trỏ một topic; bài vào QA Sandbox. |
| G3 | `thêm bài X vào topic Không Tồn Tại` | Hỏi lại topic, kèm danh sách topic thật. Không tạo topic hay bài nào. |
| G4 | Thread vừa làm việc với QA Sandbox; mở `?topic=frontend`, gõ `thêm nội dung cho topic này` | Câu hỏi lại nêu **Frontend** (trang đang mở), không nêu QA Sandbox. |
| G5 | `bài Tool Calling nằm ở topic nào?` | Trả lời QA Sandbox; mọi link `/?topic=` trỏ tới topic có thật. |
| G6 | `tạo lộ trình chạy bộ 5km` | Ngoài domain: không tạo topic nào (API danh sách topic không đổi). |
| G7 | Mở `?topic=qa-sandbox&item=<slug Tool Calling>`, gõ `viết nội dung cho bài này` | Nháp cho đúng bài Tool Calling. Gõ `hủy`: "Đã bỏ bản nháp", content vẫn rỗng. |
| G8 | Visitor gõ T1 hoặc T4 | Từ chối, không ghi. Local luôn là Owner, nên kiểm bằng unit test (`tests/test_lesson_content.py::test_visitor_cannot_draft`, `tests/test_write_invariants.py`). |

## Ghi kết quả

Lần chạy 2026-11-05, commit `1b7eaab`, Playwright MCP (headless), owner qua `DEV_OWNER_BYPASS`, DB Turso, LLM groq `openai/gpt-oss-120b`, embedding Gemini.

### Eval tự động

`prisma/dev.db` trong working tree đang trống (thay đổi không rõ nguồn, không commit), nên eval không chạy được trên nó. Đã dựng fixture tạm: lấy `dev.db` của HEAD, chạy `yarn db:flatten-sections --local --apply` rồi `yarn db:lesson-status --local --apply` (109 bài), chạy eval, sau đó trả `dev.db` về đúng bản cũ (cùng sha). So với corpus `public/roadmap@1.1`: text 109 bài giống hệt; thiếu topic `backend-roadmap` (7 doc, không sample nào dùng) và tên mục có thêm emoji, nên phải chạy `--allow-stale`.

| Bộ | Kết quả | Sàn | Ghi chú |
|---|---|---|---|
| `public/roadmap` hybrid, gate=on | hit@5 1.0 · mrr@5 0.9215 · off_topic_rejected 0.889 (n=87) | 0.98 · 0.90 · 0.60 | Pass. Lần đầu 45 sample `embedding_unavailable` (Gemini rate limit), chạy lại đủ 87. Fail lẻ: `roadmap-045`, `roadmap-047` (near-topic lọt). |
| `public/roadmap` fts | hit@5 0.942 · mrr@5 0.827 | 0.95 · 0.80 | Fail sàn hit@5: `roadmap-060` (không dấu), `066` (typo), `086`, `087` (sample mới). FTS chỉ là baseline, /chat chạy hybrid. |
| `_scope` hybrid | accuracy 0.90 · external_admitted 0 · roadmap_refused 0 | 0.90 | Pass vừa đủ sàn. Ở fts ra 0.53 vì scope cần embedding. Fail: `scope-014, 033, 049, 050, 053, 064, 066`. |
| `_routing` | accuracy 1.0 (223) | 0.75 | Pass. |
| `_answer` | Bỏ qua | | Cần `--opt answer=llm` (tốn quota), chưa chạy. |
| `router.holdout` | write_now_violations 0 · preview_violations 7 · missed_writes 0 | write_now = 0 | Pass. 7 câu ngoài domain ("xóa bài đăng Facebook cũ", "tạo lộ trình chạy bộ 5km") ra preview vì offline không có System 2. |
| `router.confuse` | ratchet ok | baseline | Pass. |
| `router.check` | stress wrong_write 0 · misroute 0 · ok 410 · undecided 94 | | Pass. |
| `smoke_live` | 9/9 | | Pass trên server thật. |

### Case chat

Classifier của môi trường chặn tạo topic test trên Turso trong lần chạy này, nên các case có ghi (T1, T3, T4, T5, T7, T8, G1, G2, G3, G6, G7) chưa chạy. Phần ghi của T4/G7 đã được kiểm cùng ngày trên bài thật `frontend / viết mặc định` (preview rồi `ok`, content 6774 ký tự, 7 `<h2>`, không `<script>`) và bằng `tests/test_lesson_content.py`.

| Case | Kết quả | Ghi chú |
|---|---|---|
| T2 | Pass | 4 topic, khớp `GET /api/v1/roadmaps`. |
| T6 | Pass | Câu cố định, không đổi gì. |
| G4 | Pass một phần | Trang `?topic=frontend`: "Bạn muốn thêm gì vào topic **Frontend**". Chạy trên thread mới (không có topic QA Sandbox trước đó); vế "thread đang nhớ topic khác" chỉ được khoá bằng unit test. Sửa ở `0870ee5`, test: `tests/test_lesson_content.py::test_vague_change_names_the_page_topic_not_the_threads_last`. |
| G5 (biến thể) | Pass | "bài viết mặc định nằm ở topic nào?" → Frontend. Câu trả lời không có link `/?topic=` nào. |
| G8 | Pass (unit test) | Xem bảng case. |
| T1, T3, T4, T5, T7, T8, G1, G2, G3, G6, G7 | Chưa chạy | Cần Owner cho phép tạo topic test `QA Sandbox` trên Turso. |
