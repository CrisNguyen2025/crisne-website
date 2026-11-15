# Plan: Second brain + trợ lý cá nhân

**Mục tiêu cuối:** một kho tri thức về những topic Owner đang theo dõi ngoài thực tế, cộng với Abot là trợ lý riêng: trả lời trên kho, gợi ý ôn tập, và nhắc cập nhật khi một công nghệ ra version mới hoặc Owner đổi techstack.

## Vai trò và cách chạy với Orca

| Vai trò | Ai | Làm gì |
|---|---|---|
| Planner / Coordinator / Reviewer | Claude | Viết `.handoff/specs/TASK-*.md`, tạo workspace trong Orca, giao việc, review branch, chạy lại verification gate, quyết định merge |
| Executor | Antigravity (trong Orca) | Làm theo spec và SOP `.agents/skills/agent-handoff/SKILL.md`: lock file, boundary, verification gate, tối đa 3 lần thử, escalation, commit, `status: COMPLETED` |
| Owner | Bạn | Chốt quyết định domain, duyệt merge, chạy những lệnh ghi lên production |

**Vòng của một task:**
1. Claude viết spec ở `main` → tạo workspace Orca (`orca worktree create --branch <branch trong spec>`) → copy spec vào workspace → `orca agent launch --agent antigravity`.
2. Antigravity làm xong → `status: COMPLETED` (hoặc `ESCALATED` kèm `.handoff/runs/escalations/ESC-*.md`).
3. Owner nhắn Claude "review <task>" → Claude đọc diff, đối chiếu spec / ADR / boundary, chạy lại gate. Cần sửa thì Claude ghi "Review notes" vào spec và giao lại cho Antigravity. Đạt thì merge vào `main` khi Owner đồng ý.
4. Merge xong thì xoá workspace, lên task tiếp theo trong hàng đợi.

> Claude desktop không nhận được báo cáo tự động từ worker Orca (cần chạy trong một terminal của Orca). Vì vậy bước 3 đi qua Owner. Muốn tự động hoàn toàn thì chạy Claude Code (`claude`) trong một terminal của Orca để làm coordinator.

## Giai đoạn và hàng đợi task

### Giai đoạn 0: nền chắc (đang chạy)
| Task | Branch | Trạng thái | Chạy song song được với |
|---|---|---|---|
| `TASK-lesson-status-002`: Abot đọc / đổi Lesson Status, chặn Visitor, rà rò rỉ | `feat/lesson-status-abot` | READY | rag-sync-001 |
| `TASK-rag-sync-001`: `/health` có trạng thái index, test sync end-to-end, không reindex khi chỉ đổi status | `feat/rag-sync-hardening` | READY | lesson-status-002 |
| `TASK-abot-bugs-001`: lỗi 9 (dòng "Chưa có topic nào được chọn" hiện sai), lỗi 2 (tên topic chứa "Section"), lỗi 8 (preview xoá bài) | `fix/abot-bugs` | Chưa viết spec, chờ lesson-status-002 merge (cùng đụng `commands.py`) | — |
| Claude tự kiểm: cache embedding trên Railway có bền qua các lần deploy không | — | Xong 2026-11-05, xem "Kết quả gần nhất" | — |
| `TASK-rag-sync-002`: index FTS ngay, embedding chạy nền sau (index không còn trống sau mỗi lần deploy) | `feat/rag-index-fts-first` | Chưa viết spec, chờ rag-sync-001 merge (cùng sửa `retrieval/**`) | — |

### Giai đoạn 0.5: nạp nội dung vào kho (đòn bẩy lớn nhất cho mục tiêu)
- Kho trên Turso hiện chỉ có **4 topic và 1 bài**. Công cụ đã có nhưng gần như chưa có tri thức, nên Abot chưa có gì để gợi ý.
- `TASK-seed-import-001` (`feat/seed-import`, đang chạy, Antigravity): nhập khoảng 110 bài trong `lib/roadmap/data.ts` vào topic `ai-architecture` với trạng thái `target` (Owner chốt ngày 2026-11-05). Script mặc định dry-run, bỏ qua bài trùng tiêu đề, backup và ghi trong một transaction. **Owner tự chạy `yarn db:import-seed --apply`** sau khi Claude review xong và đã xem output dry-run trên Turso. Chạy song song được với lesson-status-002 và rag-sync-001 (không đụng file của nhau).
- Song song: Owner liệt kê những topic đang theo dõi thật ngoài đời, rồi dán vào Abot để nhập hàng loạt (bulk import đã có, có Preview).

### Giai đoạn 1: trợ lý ôn tập
- Phần lõi ("cần ôn", "học gì tiếp") nằm trong `TASK-lesson-status-002`.
- Tiếp theo: bản tóm tắt định kỳ ("tuần này nên ôn…"). Cần chốt kênh hiện (xem câu hỏi 4).

### Giai đoạn 2: theo dõi thay đổi công nghệ (cần buổi `/grill-with-docs` + ADR trước)
- Mỗi topic gắn nguồn theo dõi (GitHub Releases, changelog).
- Job theo lịch phát hiện version mới, LLM so với nội dung bài, tạo gợi ý trong Triage. Owner duyệt → Abot soạn bản cập nhật → Preview → `ok`.

### Giai đoạn 3: theo techstack của Owner (cần ADR)
- Đọc dependency trong các repo của Owner và map sang topic. Khi nâng version hoặc thêm công nghệ mới thì gợi ý bài `target` hoặc bài cần ôn.

## Quyết định Owner cần chốt (buổi `/grill-with-docs`, trước giai đoạn 2)
1. Bao lâu thì coi một bài là cũ: theo thời gian, hay chỉ khi có version mới?
2. Abot có được tìm trên web, hay chỉ đọc nguồn đã khai báo cho từng topic?
3. "Đổi techstack" là thế giới ra version mới, repo của Owner đổi dependency, hay cả hai?
4. Gợi ý hiện ở đâu: Triage, chat của Abot, hay bản tóm tắt định kỳ?
5. Kho tri thức có còn công khai cho Visitor không, hay chỉ trạng thái và gợi ý là riêng tư (như ADR-0010)?
6. ~~Có nhập bài seed vào Turso không?~~ Đã chốt 2026-11-05: nhập, trạng thái `target`.
7. Lịch sử chat của Abot có cần giữ qua các lần deploy không? Hiện lưu trong RAM, trừ khi đặt `RAG_HISTORY_DB`, mà trên Railway file cũng mất khi deploy.

## Kết quả gần nhất (2026-11-05)
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

**Đợt C: chốt giai đoạn 2** (Owner + Claude, làm **ngay bây giờ** được, không phụ thuộc đợt A và B)
- Buổi `/grill-with-docs`: trả lời các câu hỏi 1, 2, 3, 4, 5, 7 ở trên → GLOSSARY (thuật ngữ mới, ví dụ "nguồn theo dõi", "gợi ý cập nhật") và ADR-0011.
- Kết quả: spec `TASK-change-watch-001` (khai báo nguồn theo dõi cho từng topic, job theo lịch phát hiện version mới, tạo gợi ý trong Triage).

**Đợt D: giai đoạn 1 mở rộng + giai đoạn 2** (Antigravity, sau đợt C)
- `TASK-review-digest-001`: tóm tắt ôn tập định kỳ, kênh hiện theo câu 4.
- `TASK-change-watch-001` → `-002`: phát hiện thay đổi → gợi ý trong Triage → Owner duyệt → Abot soạn bản cập nhật bài có Preview.

## Nhật ký
- 2026-11-05: lần thử Step 6 bằng Claude Haiku (`ngtienanh/lesson-status-step6-haiku-ref`, `ce07b23`) bị loại: 6/8 test fail, handler không bao giờ chạy. Giữ branch chỉ để tham khảo.
