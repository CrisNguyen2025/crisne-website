# Test thủ công (Playwright MCP)

Thư mục này lưu các kịch bản test thủ công **cùng kết quả đã chạy**. Agent ở thread khác cứ đọc kết quả ở đây là đủ, không cần đoán hay chạy lại.

## Quy tắc cho agent

1. **Đọc trước khi test.** Trước khi test một tính năng, tìm kịch bản của nó ở đây và đọc phần "Ghi kết quả".
2. **Chỉ chạy lại khi cần.** Chỉ chạy lại một case khi:
   - case đó đang `Fail` hoặc `Chưa chạy`, hoặc
   - code liên quan đã đổi sau commit của lần chạy (`git log <commit>..HEAD -- <file>`), hoặc
   - user yêu cầu.

   Case `Pass` mà code liên quan chưa đổi thì coi như vẫn đúng.
3. **Ghi lại sau mỗi lần chạy.** Thêm một khối "Lần chạy" mới (ngày, commit, môi trường, LLM), cập nhật bảng kết quả và danh sách lỗi. Không xoá lần chạy cũ, chỉ ghi chú là đã được thay thế.
4. **Lỗi đã sửa thì ghi rõ.** Ghi commit sửa và tên unit test khoá lỗi, ví dụ `Đã sửa ở abc123, test: tests/test_x.py::test_y`.
5. **Kết luận phải có bằng chứng.** Câu trả lời của Abot có thể sai, ví dụ D5: Abot báo "đã xoá" nhưng không xoá gì. Mọi kết luận về dữ liệu phải kiểm tra bằng API (`GET /api/v1/roadmaps/<slug>`) hoặc log `[turn]` của RAG service (có `tools=[...]`).

## Trạng thái case

| Trạng thái | Nghĩa |
|---|---|
| `Pass` | Đúng kỳ vọng, đã kiểm tra dữ liệu. |
| `Fail` | Sai, có lỗi đánh số trong "Lỗi tìm thấy". |
| `Không test được` | Bị chặn bởi giới hạn môi trường hoặc UI, ghi rõ lý do. |
| `Chưa chạy` | Chưa thực hiện. |

## Kịch bản

| File | Phạm vi | Lần chạy gần nhất | Kết quả |
|---|---|---|---|
| [assistant-sections.md](assistant-sections.md) | Section (mục) qua Abot, ADR-0009 | 2026-11-04 @ `0734cc0` | 7 lỗi, xem file |
| [assistant-topic-grounding-tooling.md](assistant-topic-grounding-tooling.md) | Grounding và tooling ở mức topic, kèm eval tự động | 2026-11-05 @ `1b7eaab` | Eval pass; case chat pass; 1 lỗi nhỏ (lỗi 9) |
| [rag-index-sync.md](rag-index-sync.md) | Đồng bộ dữ liệu roadmap ↔ index RAG, kiểm tra /health, thêm/xoá bài và Lesson Status | 2026-11-05 | Chưa chạy |
| [seed-import.md](seed-import.md) | Nhập bài seed vào topic AI Architecture (`target`) | 2026-11-05 (local & Turso dry-run) | Local pass; dry-run Turso pass; chờ Owner apply |
| [lesson-status.md](lesson-status.md) | Đọc và đổi Lesson Status (ADR-0010, Step 6) | Chưa chạy | Kịch bản mới |
| [dead-code-cleanup.md](dead-code-cleanup.md) | Dọn dẹp dead code, chip chat, sitemap, topic resolution, và xóa route thừa (TASK-dead-code-cleanup-001) | 2026-11-06 @ `a2828a5` | 5/5 Pass |
| [abot-stream-snippets.md](abot-stream-snippets.md) | Stream thẻ gợi ý (snippet) & cuộn bám đáy êm ái (TASK-abot-stream-snippets-001) | 2026-11-06 | 6/6 Pass |
| [triage-removal.md](triage-removal.md) | Xoá Knowledge Triage & Feedback Roadmap Assistant (TASK-triage-removal-001) | 2026-11-09 | 5/5 Pass |
| [agent-handoff.md](agent-handoff.md) | Handoff v3 Claude ↔ Antigravity: baseline, check-boundary, wait-result, result.json | 2026-11-09 @ `5a75dce` | S1–S7, E1, E2, E3, E7 Pass; E4–E6, E8 chưa chạy |
| [agent-adapter.md](agent-adapter.md) | AgentAdapter: MCP, skill, subagent, hook giữa Claude Code và Antigravity | 2026-11-09 @ `e1a7ce2` | T7, T8, T9 Pass; T5, T6 một phần; T1–T4 chưa chạy |
| [abot-context-panel.md](abot-context-panel.md) | Mục Context trong menu ⋮ của Abot, concept hội thoại như Claude Code (TASK-abot-context-panel-001) | 2026-11-14 (lần 2) | C1–C7 Pass; C8 chỉ có test tự động |

## Cách chạy (đã kiểm chứng)

- **Server:** `yarn dev` (3334) và `yarn rag:dev` (8000). Owner nhờ `DEV_OWNER_BYPASS=true` trong `.env.local` (chỉ có tác dụng với `next dev`), không cần đăng nhập Google.
- **DB:** đang là **Turso thật**. Chỉ dùng topic test riêng và xoá chúng sau khi chạy. Tên topic test **không** được chứa chữ "Section" hay "mục", vì Abot hiểu nhầm (lỗi 2 của assistant-sections). Nên dùng `QA Sandbox`.
- **Chat:** bấm nút "Mở Abot". Ô nhập có placeholder `Hỏi Abot…` và chỉ có một dòng, nên không gửi được nội dung nhiều dòng.
- **Preview:** câu xác nhận hiện là "Xác nhận thực hiện" (helper cũ còn dò "Đang chờ bạn xác nhận").
- **Chờ trả lời:** dùng [helpers/abot-send.js](helpers/abot-send.js), helper này đợi đến khi chữ trên trang ngừng thay đổi. Đừng chờ `response.finished()` của `/chat/stream`, vì nó không bao giờ kết thúc và làm Playwright treo.
- **Thêm bài nền nhanh:** gọi thẳng API, không qua chat:
  `curl -X POST localhost:3334/api/v1/roadmaps/items -H 'Content-Type: application/json' -d '{"roadmapSlug":"qa-sandbox","title":"X","section":"RAG"}'`
- **Log định tuyến:** output của `yarn rag:dev`, các dòng `[turn] … intent=… rule=… tools=[…]`.

## Quan hệ với test tự động

Mỗi lỗi tìm được ở đây khi sửa phải kèm một test tự động:
- logic Python thì dùng pytest trong `roadmap-rag-assistant/tests`,
- API hoặc lib Next.js thì dùng vitest,
- lỗi chỉ thấy trên UI thì dùng `tests/e2e`.

Ghi tên test đó vào kịch bản.
