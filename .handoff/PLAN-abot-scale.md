# PLAN: Tối ưu Abot Instructions, Mở rộng Auto-Capture Hai Tầng & Hợp nhất An toàn Ghi

- **Trạng thái:** `COMPLETED` — Toàn bộ 3 Batch (`001`, `002`, `003`) đều đã qua full verification gate trên `main` @ `1dfcd0b` (chờ Dev `git commit` phần vá cuối Batch B + toàn bộ Batch C + tài liệu `.handoff/`).
- **Ngày lập:** 2026-11-25 · **Cập nhật:** 2026-11-26 (Batch A, Batch B & Batch C đều `COMPLETED`, chờ Dev `git commit`)
- **Mốc codebase đối chiếu:** `main` @ `1dfcd0b` (`feat(abot): upgrade header actions and sidebar mode with abot-scale updates`; xuất phát từ `476eef3`)
- **Phạm vi liên quan:** `roadmap-assistant-abot`, `roadmap-learning`, `auth-security`, `knowledge-acquisition` (chỉ phần giao tiếp `linking_advisor` / `KnowledgeRelation`, không mở rộng worker)
- **Tài liệu liên hệ:** [`GLOSSARY.md`](../GLOSSARY.md), [`docs/README.md`](../docs/README.md), [`.handoff/PLAN-second-brain.md`](./PLAN-second-brain.md), [`.handoff/PLAN-knowledge-acquisition.md`](./PLAN-knowledge-acquisition.md), [`TASK-abot-scale-001.md`](./specs/TASK-abot-scale-001.md), [`TASK-abot-scale-002.md`](./specs/TASK-abot-scale-002.md), [`TASK-abot-scale-003.md`](./specs/TASK-abot-scale-003.md)

---

## 1. Kiến trúc 3 Batch & Lý do Tách Hai Tầng Tri thức

### 1.1. Tách biệt ranh giới `Owner Memory` vs `Lesson` (`RoadmapItem`)

| Chiều so sánh | `Owner Memory` (Tầng 1 — Ngữ cảnh cá nhân) | `Lesson` / `RoadmapItem` (Tầng 2 — Tri thức miền) |
|---|---|---|
| **Bản chất & ADR** | Sự thật ngắn, bền vững về **chính `Owner`** (`profile`, `techstack`, `goal`, `preference`, `learning_note`), tối đa 300 ký tự (`ADR-0015`). | Kiến thức chuẩn của một `Topic` / `Section` dưới dạng rich-text Lexical (`ADR-0009`, `ADR-0010`). |
| **Lưu trữ & Index** | Bảng `OwnerMemory` trên Turso, nạp qua `/api/v1/memories` vào block `<owner_memory>`. **Không bao giờ** nạp vào `HybridRagEngine` (`ADR-0006`, `ADR-0015`). | Bảng `RoadmapItem` trên Turso, đồng bộ qua `/api/v1/roadmaps/full-export` vào `HybridRagEngine` (BM25 + Gemini 768d in-memory, `ADR-0004`, `ADR-0006`). |
| **Cách ly `Actor`** | Tuyệt đối chỉ dành cho `Owner` (`ADR-0002`, `ADR-0015`); `Visitor` không đọc, không kích hoạt extractor, không nhận `<owner_memory>`. | Index dùng chung theo `ADR-0006` (site hiện Owner-only theo `ADR-0019`, vẫn giữ cách ly `Visitor` làm lớp phòng thủ thứ hai); nội dung `Lesson` không chứa dữ liệu cá nhân từ `<owner_memory>` hay `Provenance` (`ADR-0017`). |
| **Kiểm soát ghi (HITL)** | Gợi ý tự động luôn vào `status = "pending"`; lệnh chat đi qua `Preview -> ok` (`PENDING_TTL_SECONDS = 600.0`). | Tạo/sửa/bổ sung nội dung từ `Domain Gap`, `Quiz`, hoặc chat đều qua `Preview -> ok` + `write_granted`, sau đó gọi `notifyRoadmapChanged()`. |
| **Vấn đề nếu gộp sai** | Nhồi khái niệm kỹ thuật dài vào `OwnerMemory` làm phình `<owner_memory>` (trần 15 mục / 1.500 ký tự), vỡ xếp hạng tĩnh và không thể tìm kiếm ngữ nghĩa hay chia chương/trạng thái ôn tập. | Đưa sở thích/nền tảng riêng tư của `Owner` vào `Lesson` làm rò dữ liệu cá nhân sang index dùng chung (`ADR-0006`, `ADR-0017`) và phá cấu trúc giáo trình `Topic` -> `Section` -> `Lesson`. |

### 1.2. Thứ tự thực thi 3 Batch (Tuần tự: `001 -> 002 -> 003`, Không chồng chéo)

```text
Batch A (COMPLETED @ 1dfcd0b)           Batch B (COMPLETED, +3 fix chờ commit)    Batch C (COMPLETED, chờ commit)
TASK-abot-scale-001                     TASK-abot-scale-002                         TASK-abot-scale-003
──────────────────────────────          ───────────────────────────────────         ───────────────────────────────────
• Tối ưu <system> & gating              • Tier 1: extractor/store/memories API      • Hợp nhất Pending Action & /chat/confirm
• Bỏ gọi lặp format_owner_memory        • Tier 1 UI: OwnerMemorySheet               • Chuẩn hóa action_preview & ChangeReviewCard
• Căn chỉnh context_usage.py            • Tier 2: linking_advisor + Domain Gap      • WebMCP write safety (canWrite + write_gate)
• Chuyển chat/context -> 25s timeout    • Tier 2: Quiz gaps + Executor/Reindex      • Evals (_routing, _answer, holdout) + Docs/Intel
```

1. **Batch A — [`TASK-abot-scale-001.md`](./specs/TASK-abot-scale-001.md) (`COMPLETED` trên `main` @ `1dfcd0b`)**:
   - Thu gọn `<system>` (`PROMPT_SUGGESTION_FORMAT` chiếm ~24% empty RAG / ~43.5% empty chitchat prompt; `<owner_memory>` lặp ở 3 nơi; quy tắc `Provenance` luôn bị tiêm cả khi là `Visitor` hay không có nguồn), bỏ gọi `format_owner_memory` lần 2 trong `pipeline.py`, căn chỉnh `context_usage.py` (`DOCUMENT_BUDGET_CHARS`, `history_cap`, `memory_cap`), và đưa `chat/context` vào `SYNC_TIMEOUT_PATHS` trên proxy Next.js.
2. **Batch B — [`TASK-abot-scale-002.md`](./specs/TASK-abot-scale-002.md) (`COMPLETED` — `1dfcd0b` + 3 file vá chờ `git commit`)**:
   - Nâng cấp Tier 1 (`extractor.py` vượt giới hạn 49 chuỗi `_SIGNAL_CUES`, chống trùng paraphrase, quản lý trần `MAX_PENDING_MEMORIES`, xếp hạng theo query + `lastUsedAt`, bỏ invalidate cache khi ghi `pending`, hoàn thiện `OwnerMemorySheet.tsx` + adaptive polling badge).
   - Nối Tier 2 (tổng quát hóa `linking_advisor.py`, nối `Scope.DOMAIN_GAP`, lỗ hổng `QuizCommands`, và lệnh thăng cấp khái niệm trong chat sang `LessonContentCommands` / `ActionExecutor` qua `Preview -> ok`, đồng bộ reindex HTTP/SQLite và `ROADMAP_WRITE_TOOL_RE`).
3. **Batch C — [`TASK-abot-scale-003.md`](./specs/TASK-abot-scale-003.md) (`COMPLETED`, chờ `git commit`)**:
   - Hợp nhất các slot `Pending Action` trong `session_store.py` + `POST /chat/confirm` / `/chat/cancel`, thay heuristic text của `ConfirmActions` bằng metadata `action_preview`, phát `change_review` cho content draft & memory, bịt lỗ hổng ghi trực tiếp của WebMCP (`RoadmapWebMcpRegistrar`, `use-roadmap-webmcp.ts`, `webmcp_planner.py`), bổ sung coverage trong `evals/`, và đồng bộ `cris-workspace-map.json` + tài liệu kiến trúc.

---

## 2. Hiện trạng Working Tree (Baseline `HEAD 476eef3`)

1. **Các thay đổi trước đó đã lên `main` (`e16f1a7` & `476eef3`)**:
   - Tập 30 file stress/proxy/health/load từ mốc `a5b7b73` đã được commit ở `e16f1a7` (`fix(stress): add proxy header timeout, health sync telemetry, and harden load harnesses`).
   - 10 file tài liệu & runtime pins từng dirty ở `e16f1a7` (`AGENTS.md`, `.handoff/BACKLOG.md`, 5 file `.handoff/PLAN-*.md`, `.nvmrc`, `news-ingest-worker/.python-version`, `roadmap-rag-assistant/.python-version`) đã được commit ở `476eef3` (`docs(agents): pin runtime versions, add session exit checklist, refresh plan status`).
2. **Trạng thái working tree tại mốc `476eef3`**:
   - Sạch hoàn toàn về mã nguồn trước khi triển khai Batch A; working tree chỉ còn bộ tài liệu kế hoạch/spec (`.handoff/PLAN-abot-scale.md`, `.handoff/specs/TASK-abot-scale-001..003.md`) cùng các file thuộc phạm vi `allowed_to_modify` của Batch A (`TASK-abot-scale-001`). Vì vậy `TASK-abot-scale-001..003` đều giữ `continues_dirty: []`.
3. **Quy ước chạy `baseline.sh` trước khi giao `002` và `003`**:
   - Sau khi Batch A hoàn tất và được commit (cùng 3 spec/plan nếu cần), chạy `bash .agents/skills/agent-handoff/scripts/baseline.sh TASK-abot-scale-002` trên working tree sạch trước khi giao Executor cho Batch B, và lặp lại tương tự cho `TASK-abot-scale-003` để `check-boundary.sh` và `yarn doctor --since HEAD --check` đo đúng diff của từng batch.

---

## 3. Quyết định Đã Chốt của Owner (2026-11-26)

Owner đã duyệt **Option (A)** cho toàn bộ các câu hỏi mở của `TASK-abot-scale-002` (Q1–Q7) và `TASK-abot-scale-003` (Q1–Q4) ngày 2026-11-26; `TASK-abot-scale-001` không có câu hỏi mở. Hai spec `002` và `003` giữ `deploy_steps: []` (không cần migration Turso) và chuyển sang `READY` theo thứ tự tuần tự `001 -> 002 -> 003`:

| Nguồn | # | Vấn đề | Quyết định đã chốt (2026-11-26) | Tác động triển khai |
|---|---|---|---|---|
| `002` | Q1 | Chính sách khi chạm trần `MAX_PENDING_MEMORIES = 10` (`extractor.py`, `quiz_commands.py`) | **Option (A)** | Giữ trần 10, cảnh báo trên UI và ưu tiên đẩy lỗ hổng khái niệm sang `Preview` tạo/bổ sung `Lesson`. |
| `002` | Q2 | Giữ 5 giá trị `OWNER_MEMORY_KINDS` hay thêm `concept`? | **Option (A)** | Giữ 5 loại cố định (`ADR-0015`); khái niệm miền đưa sang `Lesson` (`RoadmapItem`). |
| `002` | Q3 | Có tạo `KnowledgeProvenance` cho `Lesson` sinh từ chat không? | **Option (A)** | Giữ `KnowledgeProvenance` riêng cho `News Item` (`ADR-0017`). |
| `002` | Q4 | Giới hạn 300 ký tự của `Owner Memory` & chống trùng ngữ nghĩa | **Option (A)** | Giữ trần 300 ký tự (`ADR-0015`), chống trùng bằng chuẩn hóa token/Jaccard + `replacesMemoryId`. |
| `002` | Q5 | Mặc định `Lesson Status` và tự gợi ý `KnowledgeRelation` (`relates`) khi đưa khái niệm từ chat vào `Lesson` | **Option (A)** | Mặc định `status = "target"` (giống News integration) + gợi ý `relates` trong `Preview`. |
| `002` | Q6 | Cơ chế nút "Đưa vào `Lesson`" trong `OwnerMemorySheet.tsx` | **Option (A)** | Gọi API `/api/v1/roadmaps` + `POST /api/v1/roadmaps/items` trực tiếp qua `client.ts` và chuyển memory sang `archived`. |
| `002` | Q7 | Chạy `_maybe_schedule_memory_extraction` cho `POST /chat` (sync) hay chỉ `POST /chat/stream`? | **Option (A)** | Dùng chung helper fail-open cho cả `/chat/stream` và `/chat` khi `is_owner()`. |
| `003` | Q1 | UX an toàn ghi cho WebMCP (`/webmcp` & `document.modelContext`) | **Option (A)** | Chỉ đăng ký WebMCP khi `canWrite === true`, giữ `/chat/plan` read-only hoặc ép mọi thao tác ghi qua `Preview` / xác nhận UI + `is_owner()`. |
| `003` | Q2 | Khôi phục metadata (`traceId`, `sources`, `citations`, `changes`) cho `Thread` của `Owner` từ Turso | **Option (A)** | Giữ schema `ThreadMessage` tối giản (`ADR-0012`), không migration Turso. |
| `003` | Q3 | Nút Feedback 👍/👎 của Abot (`onFeedback` trong `RoadmapAssistantChatbot.tsx`) | **Option (A)** | Giữ tắt theo `ADR-0011` / `671c3af`, giữ nút copy `traceId` cho `Owner` và dọn ghi chú `FEEDBACK_ENABLED = false` cũ (không chạm Cris AI). |
| `003` | Q4 | Phạm vi hợp nhất `POST /chat/confirm` & `/chat/cancel` và `ChangeReviewCard` | **Option (A)** | Hợp nhất đủ 6+ loại `Pending Action` trên `/chat/confirm`/`/chat/cancel` + `action_preview` có cấu trúc + phát `change_review` cho content draft & memory. |

---

## 4. Ma trận Đồng bộ & Xung đột (`cris-how-to-sync`)

Kết quả đối chiếu sơ bộ từ `yarn intel how-to-sync "Scale Abot instructions and auto-save concepts as long-term memory"` (và kiểm tra thủ công theo `cris-how-to-sync`): **🟡 CẢI THIỆN (CONDITIONAL)** — không vi phạm bất biến nào nếu giữ đúng ranh giới `Owner Memory` vs `Lesson`.

| Hạng mục đồng bộ | Trạng thái | Chi tiết & Yêu cầu tuân thủ |
|---|---|---|
| **ADRs & Invariants** | Tuân thủ có điều kiện | Giữ ranh giới Python FastAPI (`ADR-0001`), proxy + `Actor` isolation (`ADR-0002`, `ADR-0019`), Gemini 768d + in-memory vector store (`ADR-0004`, `ADR-0006`), `Owner` Thread/Memory in Turso + RAM-only `Pending Action` (`ADR-0012`, `ADR-0015`), `Provenance` tách khỏi index (`ADR-0017`), và quy tắc không dùng từ domain trong `rag_service/core/**` (`test_core_never_names_a_business_domain`). |
| **Glossary & Semantics** | Cần tuân thủ chặt | Dùng đúng `Owner Memory`, `Lesson` (`RoadmapItem`), `Topic`, `Section`, `Preview`, `Pending Action`, `Domain Gap`, `Provenance`. Tránh các từ `_Avoid_`: `long-term prompt`, `user profile`, `global context`, `knowledge node`, `bài viết`, `confirm card`, `queued action`. Sửa `"Topic/Item"` trong `profile.py` L99 sang `"Topic/bài học"`. |
| **Dual-Service Sync** | Bắt buộc (`001`, `002`, `003`) | Đồng bộ contract proxy `app/api/roadmap-assistant/[...path]/route.ts` (`SYNC_TIMEOUT_PATHS` cho `chat/context`), `/api/v1/memories/**`, `schemas.py` (`IndexHealthInfo`, `ActionConfirmResponse`), `action_preview`, `ROADMAP_WRITE_TOOL_RE`, và SDK `roadmap-chat-sdk`. |
| **RAG & Cache Sync** | Bắt buộc (`002`) | Thao tác `Owner Memory` chỉ xóa RAM cache của `OwnerMemoryStore` (và bỏ invalidate khi ghi `pending`); mọi tạo/sửa `Lesson` từ chat phải kích hoạt `notifyRoadmapChanged()` (HTTP) hoặc `sync_live_database()` (SQLite). |
| **Database & Migration** | Không cần (`Option A` đã chốt) | Owner đã chốt Option `(A)` cho `002` Q2/Q3/Q4 và `003` Q2, nên không sửa `prisma/schema.prisma` và giữ `deploy_steps: []` (không cần migration Turso). |
| **Evals & Ratchet Sync** | Bắt buộc (`003`) | Bổ sung case vào `evals/datasets/_routing/samples.jsonl`, `_answer/samples.jsonl`, `evals/router/holdout.jsonl`. Giữ `write_now_violation == 0` trên `holdout` và `confuse`; không sửa `stress_confuse.jsonl` hay nâng chuẩn `confuse_baseline.json` / `baseline.json` để che regression (`TASK-router-stress-001`). |
| **Code Intel & Core Docs** | Bắt buộc (`003`) | Cập nhật `.agents/skills/cris-code-intel/data/cris-workspace-map.json`, `docs/code-intel/CRIS_WORKSPACE_MAP.md` (đưa đủ ADR-0012..0019, bỏ cấu trúc Layer/Group cũ), `.agents/skills/cris-how-to-sync/references/ARCHITECTURAL_INVARIANTS.md`, comment lỗi thời ở `app/api/roadmap-assistant/[...path]/route.ts` L11, và `docs/abot-next-actions-plan.md` (`commit 476eef3` đã cập nhật nền chung; kiểm tra lại `PLAN-second-brain.md` nếu còn mục đã xong). Kiểm tra cuối bằng `yarn intel status` và `yarn doctor --since HEAD --check`. |
