# Plan: Second brain + trợ lý cá nhân

**Mục tiêu cuối:** một kho tri thức về những topic Owner đang theo dõi ngoài thực tế, cộng với Abot là trợ lý riêng: trả lời trên kho, gợi ý ôn tập, và nhắc cập nhật khi một công nghệ ra version mới hoặc Owner đổi techstack.

## Vai trò và cách chạy

| Vai trò | Ai | Làm gì |
|---|---|---|
| Planner / Coordinator / Reviewer | Claude | Viết `.handoff/specs/TASK-*.md`, tạo nhánh và baseline, verify độc lập (chạy lại gate), đề xuất commit |
| Executor | Antigravity, chạy thẳng trên repo, ở nhánh của spec | Làm theo `.agents/skills/agent-handoff/references/executor.md`: lock, boundary, gate, tối đa 3 lần thử, escalation, ghi `result.json`. Không commit |
| Owner | Bạn | Chốt quyết định domain, commit (HITL), chạy những lệnh ghi lên production |

**Vòng của một task** (chi tiết: `.agents/skills/agent-handoff/references/architect.md`):
1. Claude viết spec, tạo nhánh của spec, chạy `baseline.sh`, bật watcher.
2. Owner mở Antigravity ở repo, đúng nhánh, gõ `/executor`. Dự phòng: dán prompt Claude in ra.
3. Antigravity ghi `result.json`; watcher báo Claude, Claude verify và report. Phiên Claude đã đóng thì Owner gõ "verify <task_id>".
4. Owner commit. Claude đề xuất task tiếp theo trong hàng đợi.

## Giai đoạn và hàng đợi task

### Giai đoạn 0: nền chắc (đã hoàn tất và hợp nhất lên `main`)
> Cập nhật `2026-11-26`: toàn bộ nền tảng Giai đoạn 0, 0.5 và Giai đoạn 1 dưới đây đã hoàn tất và được kế thừa trực tiếp trong `.handoff/PLAN-abot-scale.md` (`TASK-abot-scale-001..003`). Bảng bên dưới giữ lại để đối chiếu lịch sử thiết kế `2026-11-05`.

| Task | Branch | Trạng thái | Chạy song song được với |
|---|---|---|---|
| `TASK-lesson-status-002`: Abot đọc / đổi Lesson Status, chặn Visitor, rà rò rỉ | `feat/lesson-status-abot` | DONE (đã hợp nhất `main`) | rag-sync-001 |
| `TASK-rag-sync-001`: `/health` có trạng thái index, test sync end-to-end, không reindex khi chỉ đổi status | `feat/rag-sync-hardening` | DONE (đã hợp nhất `main`) | lesson-status-002 |
| `TASK-abot-bugs-001`: lỗi 9 (dòng "Chưa có topic nào được chọn" hiện sai), lỗi 2 (tên topic chứa "Section"), lỗi 8 (preview xoá bài) | `fix/abot-bugs` | DONE (đã hợp nhất `main`) | — |
| Claude tự kiểm: cache embedding trên Railway có bền qua các lần deploy không | — | DONE (`2026-11-05`) | — |
| `TASK-rag-sync-002`: index FTS ngay, embedding chạy nền sau (index không còn trống sau mỗi lần deploy) | `feat/rag-index-fts-first` | DONE (đã hợp nhất `main`) | — |

### Giai đoạn 0.5: nạp nội dung vào kho (lịch sử `2026-11-05`)
- Thời điểm `2026-11-05`, kho trên Turso mới có 4 topic và 1 bài; nay đã được nạp corpus thực tế và mở rộng qua `NewsItem -> Lesson` và concept promotion từ chat.
- `TASK-seed-import-001` (`feat/seed-import`): đã hoàn tất import 109 bài seed trạng thái `target` vào `ai-architecture`.
- Song song: Owner liệt kê những topic đang theo dõi thật ngoài đời, rồi dán vào Abot để nhập hàng loạt (bulk import đã có, có Preview).

### Giai đoạn 1: trợ lý ôn tập
- Phần lõi ("cần ôn", "học gì tiếp") nằm trong `TASK-lesson-status-002`.
- Tiếp theo: bản tóm tắt định kỳ ("tuần này nên ôn…"). Cần chốt kênh hiện (xem câu hỏi 4).

### Giai đoạn 2: theo dõi thay đổi công nghệ → chuyển sang `.handoff/PLAN-knowledge-acquisition.md` (2026-11-23)
- Đã chốt và có ADR (ADR-0016, ADR-0017, ADR-0018). Chi tiết và lộ trình nằm trong plan đó; phần dưới chỉ giữ làm lịch sử.
- Ý cũ: mỗi topic gắn nguồn theo dõi, job phát hiện version mới, tạo gợi ý trong Triage. Đã đổi: Triage bị bỏ (ADR-0011); News Source vẫn toàn cục, không gắn với Topic; Owner đưa News Item vào Lesson ở `/feed-ingestion`; viết lại nội dung bài bằng LLM đi qua Abot Preview → `ok` (Phase 3 của plan mới).

### Giai đoạn 3: theo techstack của Owner (cần ADR)
- Đọc dependency trong các repo của Owner và map sang topic. Khi nâng version hoặc thêm công nghệ mới thì gợi ý bài `target` hoặc bài cần ôn.

## Quyết định Owner cần chốt (buổi `/grill-with-docs`, trước giai đoạn 2)
1. ~~Bao lâu thì coi một bài là cũ: theo thời gian, hay chỉ khi có version mới?~~ Đã chốt 2026-11-23: khi có version mới.
2. ~~Abot có được tìm trên web, hay chỉ đọc nguồn đã khai báo cho từng topic?~~ Đã chốt 2026-11-23: chỉ đọc nguồn đã khai báo, không tìm web.
3. "Đổi techstack" là thế giới ra version mới, repo của Owner đổi dependency, hay cả hai? (Còn mở, tách khỏi plan Knowledge Acquisition.)
4. ~~Gợi ý hiện ở đâu: Triage, chat của Abot, hay bản tóm tắt định kỳ?~~ Đã chốt 2026-11-23: gợi ý từ nguồn tin ở `/news` (trước đây `/feed-ingestion`), gợi ý ôn tập/khái niệm trong chat Abot.
5. ~~Kho tri thức có còn công khai cho Visitor không, hay chỉ trạng thái và gợi ý là riêng tư (như ADR-0010)?~~ Đã chốt 2026-11-23 (ADR-0018 → ADR-0019): chỉ dành riêng cho `Owner`, bỏ hoàn toàn Public News.
6. ~~Có nhập bài seed vào Turso không?~~ Đã chốt 2026-11-05: nhập, trạng thái `target`.
7. ~~Lịch sử chat của Abot có cần giữ qua các lần deploy không?~~ Đã chốt theo ADR-0012 + ADR-0015 + `TASK-abot-scale-003` Q2 Option (A): `Thread`, `ThreadMessage` (schema tối giản) và `OwnerMemory` của `Owner` lưu ở Turso qua API Next.js; `Pending Action` và `Thread` `Visitor` chỉ giữ trong RAM.

## Nhật ký & Lịch sử `2026-11-05`
> Mục `Kết quả gần nhất`, `Đợt A–D` dưới đây là log lưu trữ tại thời điểm `2026-11-05`; toàn bộ đầu việc Giai đoạn 0–1 và các bước mở rộng năng lực Abot tiếp theo được theo dõi tại `.handoff/PLAN-abot-scale.md` và `.handoff/PLAN-knowledge-acquisition.md`.

### Kết quả gần nhất (2026-11-05)
- **lesson-status-002**: Antigravity báo `COMPLETED` (lần 1, chưa commit). **Claude review: cần sửa 3 việc**, đã giao lại (lần thử 2). (1) bỏ nhánh schema Layer/Group cũ đã thêm vào `sqlite_adapter.py` chỉ để test pass trên `dev.db` cũ; (2) bỏ `status` khỏi tool LLM `update_item`, vì luồng CUD chung có thể ghi ngay mà không qua Preview; (3) hoàn tác thay đổi ngoài phạm vi. Những phần khác đạt: (a)/(b)/(c), Preview ok/hủy, chặn Visitor ở cả handler và adapter, pytest 982/982.
- **rag-sync-001**: Antigravity báo `COMPLETED` (commit `2349db2`, `02faf69`). **Claude review: ĐẠT, chờ Owner duyệt merge.** Code khớp spec, mọi file nằm trong boundary. PATCH chỉ có 4 trường (title, description, section, status), nên bỏ reindex khi chỉ đổi `status` là đúng. `/health` chỉ trả số liệu. Chạy lại: vitest 22/22 (test mới cùng test reindex cũ), pytest các test sync và health 18/18, toàn bộ pytest 967 pass / 3 fail. Cả 3 fail đều do môi trường, không phải lỗi của branch: `test_evals_answer_target` và `test_stress_set_offline…` fail cả trên `main`; `test_held_out_messages…` fail vì worktree dùng `prisma/dev.db` bản đã commit có schema cũ ("no such column: i.roadmapId"), còn branch không đụng `prisma/` hay adapter. Việc riêng nên làm sau: các test Python không nên phụ thuộc `prisma/dev.db`.
- **seed-import-001, lần 2** (commit `c61b15c`, `570fbfc`): **Claude review: ĐẠT, chờ Owner duyệt merge rồi tự chạy `--apply`.** Ngày giờ giờ lưu số mili giây, kèm kiểm tra trong script và unit test. Claude chạy lại: vitest 7/7, tsc sạch, eslint file mới sạch, dry-run Turso: 109 bài, 0 bỏ qua.
- **seed-import-001, lần 1** (commit `ebc990a`): cần sửa 1 việc, đã giao lại. Script ghi ngày dạng chuỗi ISO, trong khi Prisma lưu số mili giây. Prisma vẫn đọc được, nhưng trộn hai dạng thì `ORDER BY` / so sánh ngày bị sai. Những phần khác đạt: transaction, backup, bỏ qua bài trùng, test 16/16, dry-run Turso ra 109 bài trong 15 section.
- **Cache embedding trên Railway**: `data/embedding_cache.json` không nằm trong git, cũng không nằm trong image, và Railway không có volume. Mỗi lần deploy, cache trống và **mọi** bài phải embed lại (0,67 giây một bài). Hơn nữa `index_documents` chỉ thay index sau khi đã embed xong, nên sau deploy Abot không có index trong khoảng N × 0,67 giây. Với 1 bài thì không đáng kể, nhưng 1.000 bài là khoảng 11 phút → `TASK-rag-sync-002`.
- **Nội dung kho**: 4 topic, 1 bài (xem giai đoạn 0.5).

## Kế hoạch tiếp theo (cập nhật 2026-11-05, sau vòng review đầu)

Đường găng để tới mục tiêu: **kho có nội dung** → **Abot gợi ý ôn tập** → **chốt quyết định giai đoạn 2** → **theo dõi thay đổi công nghệ**.

**Đợt A: khép giai đoạn 0 và 0.5** (đang chạy, chờ Owner)
1. Owner duyệt merge `feat/rag-sync-hardening` và `feat/seed-import` (đều đã đạt review).
2. Owner chạy `yarn db:import-seed --apply` trên `main` → kho có 109 bài `target`.
3. Claude review lesson-status-002 lần 2 → Owner duyệt merge.
4. Owner thử: mở `?topic=ai-architecture`, hỏi Abot "nên học gì tiếp", đánh dấu 2–3 bài sang `learning` / `known`. Đây là lần đầu kho tri thức và trợ lý chạy cùng nhau.

**Đợt B: dọn nợ kỹ thuật lộ ra khi review** (Antigravity, song song)
| Task | Phụ thuộc | Nội dung |
|---|---|---|
| `TASK-test-isolation-001` | lesson-status-002 merge (cùng đụng `conftest.py`) | Test Python không còn phụ thuộc `prisma/dev.db`: dùng DB fixture tạm theo schema hiện tại. Sau task này, 3 test "fail do môi trường" phải pass ở mọi worktree. |
| `TASK-rag-sync-002` | rag-sync-001 merge | Index FTS ngay, embedding chạy nền sau. Sau mỗi lần deploy, index không còn trống. |
| `TASK-abot-bugs-001` | lesson-status-002 merge | Lỗi 9 (dòng "Chưa có topic nào được chọn" hiện sai), lỗi 2 (tên topic chứa "Section"), lỗi 8 (preview xoá bài) |

**Đợt C: chốt giai đoạn 2** (xong 2026-11-23)
- Đã chốt các câu 1, 2, 4, 5; câu 3 và 7 còn mở. Kết quả: ADR-0016, ADR-0017, ADR-0018, nhóm thuật ngữ News trong GLOSSARY, và `.handoff/PLAN-knowledge-acquisition.md` (thay cho `TASK-change-watch-001` dự kiến trước đây).

**Đợt D: giai đoạn 1 mở rộng + giai đoạn 2** (Antigravity, sau đợt C)
- `TASK-review-digest-001`: tóm tắt ôn tập định kỳ, hiện trong chat Abot (câu 4).
- Knowledge Acquisition: tách `TASK-*.md` theo Phase 1 và Phase 3 của `.handoff/PLAN-knowledge-acquisition.md`.

## Nhật ký
- 2026-11-05: lần thử Step 6 bằng Claude Haiku (`ngtienanh/lesson-status-step6-haiku-ref`, `ce07b23`) bị loại: 6/8 test fail, handler không bao giờ chạy. Giữ branch chỉ để tham khảo.
