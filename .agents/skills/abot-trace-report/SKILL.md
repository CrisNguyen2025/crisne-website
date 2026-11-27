---
name: abot-trace-report
description: Phân tích và giải phẫu workflow 1 turn của Abot (trợ lý roadmap, service Python `roadmap-rag-assistant/`) từ Langfuse `trace_id` HOẶC chạy dev-trace trực tiếp một câu hỏi ở local; trả report chỉ đọc gồm sơ đồ thực thi, luồng dữ liệu (đi qua đâu, lấy thông tin gì ở đâu, biến đổi/lọc thế nào), đánh giá từng chặng, thời gian từng bước và đề xuất sửa trỏ tới `file:line`. Dùng khi user gõ `/abot-trace-report <trace_id>`, `/abot-trace-report "<câu hỏi>"`, paste trace id 32 ký tự hex (nút "Sao chép trace ID"), gửi `<query> > <trace_id>`, hoặc hỏi vì sao Abot trả lời như vậy, 1 turn đi qua luồng nào, router chọn nhánh nào, dữ liệu nào bị lọc rớt, tool nào chạy sai hay bước nào chậm. Không dùng cho Cris AI (trace `chat`) hay bot khác.
---

# Abot trace report

Cách gọi lệnh:
```bash
# 1. Tra từ Langfuse bằng trace_id (32 ký tự hex):
/abot-trace-report <trace_id>
có thể làm gì khác nữa k > 1cb4f5b08049d199d72de297bb732516

# 2. Dev Mode — giải phẫu trực tiếp 1 câu hỏi trên code local (không cần trace_id):
/abot-trace-report "tóm tắt bài này" --topic ai-architecture --lesson-id <id>
/abot-trace-report "thêm bài RAG Evaluation vào mục Retrieval" --offline
```

Mục tiêu: nhìn nhanh và trực quan 1 turn của Abot đã đi qua những chặng nào, lấy thông tin gì ở đâu, biến đổi hay lọc bỏ dữ liệu ra sao, bước nào là **điểm confused** (rẽ nhầm nhánh pre-route/router, lọc rớt bài ở gate, thiếu ngữ cảnh, gọi sai tool, rơi vào fallback, chậm), và `file:line` nào cần sửa. Đây là việc **chỉ đọc**.

## 1. Thu thập dữ liệu trace (2 chế độ)

### Chế độ A — Có `<trace_id>` 32 ký tự hex (Langfuse)

Chạy từ root repo:

```bash
npx ts-node --compiler-options '{"module":"CommonJS"}' .agents/skills/abot-trace-report/scripts/fetch-trace.ts <trace_id> > <scratchpad>/trace-<trace_id>.json
```

- Script chỉ gọi GET tới Langfuse public API, key lấy từ `.env.local` qua `scripts/lib/langfuse-api.ts`. Không tự mở hay in `.env*`.
- Mặc định tìm trong 30 ngày gần nhất; cũ hơn thêm `--days 90`.
- `found: false`: trace chưa ingest xong (đợi vài giây rồi chạy lại), quá hạn `--days`, hoặc khác `LANGFUSE_BASE_URL`. Báo user và dừng, không đoán nội dung.
- Nếu user chỉ truyền `<trace_id>`, lấy câu hỏi từ `input.message` của root observation.
- **Kiểm tra bot:** nếu `traceName` khác `roadmap-assistant` (ví dụ `chat` của Cris AI), báo user trace này không phải của Abot và dừng.

### Chế độ B — Dev Mode truyền câu hỏi trực tiếp (không có `<trace_id>`)

Khi user muốn kiểm tra workflow của một câu hỏi ngay trên code local mà không có `<trace_id>`, chạy:

```bash
roadmap-rag-assistant/.venv/bin/python .agents/skills/abot-trace-report/scripts/local-trace.py "<câu hỏi>" [--topic <slug>] [--lesson-id <id>] [--section "<tên mục>"] [--actor owner|visitor] [--sqlite] [--offline] > <scratchpad>/trace-local.json
```

- **An toàn & cô lập:** script chạy trên `Thread` tạm trong RAM (`owner:dev-trace-…` hoặc `visitor:dev-trace-…`), chặn ghi `ThreadMessage`/`ThreadState`/`OwnerMemory` ra ngoài, không bao giờ tự confirm `Pending Action` (mọi lệnh CUD chỉ dừng ở thẻ `Preview`), và che PII qua `rag_service.pii.mask_trace_data`.
- **Nguồn dữ liệu:** mặc định đọc theo `RAG_ADAPTER_MODE` trong env (nếu `http` mà Next.js dev server chưa bật, tự fallback sang `sqlite` trên `prisma/dev.db`; ép dùng SQLite bằng `--sqlite`).
- **`--offline`:** khởi tạo agent với `llm_model=None` để giải phẫu tức thì (<1s, không tốn quota LLM) toàn bộ chặng Pre-route, System 1 Router, Retrieval và On-topic Gate. Không truyền `--offline` thì chạy đủ LLM như server thật.
- JSON xuất ra có cùng cấu trúc `observations` với `fetch-trace.ts` (thêm `sseSteps` ghi các event `step` gửi xuống UI), nên dùng chung toàn bộ quy trình phân tích và vẽ sơ đồ bên dưới.

Luôn ghi JSON ra `<scratchpad>` rồi đọc file đó, vì `input`/`output` có thể dài.

## 2. Bản đồ giải phẫu 1 turn của Abot (Code & Data Lineage)

Code nằm trong `roadmap-rag-assistant/rag_service/`. Khi cần đối chiếu thêm chặng BFF/DB xuyên qua Next.js Proxy (`FLOW_ABOT_*`), chạy `yarn intel trace <FLOW_ID>` (skill `cris-code-intel`).

Một turn đi tuần tự qua các chặng sau:

1. **Root `roadmap-assistant` (`AGENT`):**
   - **Input:** `message`, `page_context` (`roadmapSlug`, `roadmapTitle`, `itemId`, `itemTitle`, `section` gửi từ UI qua proxy `/api/roadmap-assistant/[...path]`).
   - **Metadata tổng hợp cả lượt** (`observability.py`, `domains/roadmap/agent.py`):
     - `pre_route`: chỉ xuất hiện khi turn rẽ sớm **trước `intent-router`** (`pending_action`, `entry_guard:sensitive|harmful`, `active_quiz`, `slash_command`, `gmail_connector`, `syntax_guard:unnamed_create|legacy_level`, `section_rename`, `lesson_edit`, `concept_promotion`, `lesson_content`, `status_change`, `memory_command`, `quiz_command`, `bulk_import`, `mixed_intents`). Có `pre_route` thì việc không có span `intent-router` là đúng thiết kế (khi `connector="gmail"`, xem thêm tool `query-gmail`).
     - Tín hiệu router & quyền ghi: `intent`, `sub_intent`, `act`, `target`, `scope`, `write`, `write_plan`, `router_disagreement`, `visitor_write_attempt`, `router_llm_unavailable`, `system2_unavailable`.
     - `dispatch`: nhánh thực thi cuối cùng sau router (`cud`, `catalog`, `lesson_status`, `current_section`, `rag_sources`, `rag_domain_gap`, `out_of_scope`, `route_gate_blocked`, `missing_active_topic`, `help_usage`, `chitchat_llm`, `chitchat_unclear`, `chitchat_greeting`).
     - Tín hiệu RAG & Generation: `queries`, `rewritten`, `reranked`, `retrieved`, `gate_dropped`, `owner_memory_count`, `answer_mode`, `grounding`, `llm_fallback`, `grounding_fallback`, `tools`.

2. **Nạp ngữ cảnh hội thoại — `load-thread-context` (`SPAN`):**
   - **Lấy ở đâu:** `domains/roadmap/agent.py` (`_load_thread_context`, `_sync_page_focus`) gọi song song `history_store.load` (`core/augmentation/history.py`) và `session_store.load` (`state/session_store.py`). Với `Owner`, lịch sử và `ThreadState` nạp từ Turso qua API Next.js (`ADR-0012`); với `Visitor`, chỉ ở RAM. Sau đó đồng bộ `page_context` vào focus của `Thread`.
   - **Output:** `topic_loaded`, `history_turns` (số tin nhắn gần nhất trong cửa sổ `HISTORY_TURNS`), `active_topic_slug`, `active_lesson_id`, `active_section`, `pending_kind` (thẻ `Preview` đang chờ `ok` trong 7 slot RAM, TTL `600s`), `active_quiz` (TTL `1200s`).

3. **Định tuyến 2 tầng — `intent-router` (`SPAN`):**
   - **Xử lý:** chuẩn hóa tiếng Việt & teencode (`router/vietnamese.py`) → System 1 chạy dải `P0`..`P8` (`router/route_decision.py`, `router/understanding.py`, bảng luật `router/policy.py`, phân loại `Scope` ở `router/scope.py`, cổng ghi `router/write_gate.py`) → với ứng viên ghi, gọi System 2 (`verdict`) và đối chiếu danh mục thật (`grounding`).
   - **Metadata:** `method` (`heuristic`, `vocabulary`, `llm`, `default`, `rate_limited*`, `llm_error*`), `act`, `target`, `rules`, `write`, `write_plan`, `verdict`, `grounding`, `phases` (`P0`..`P8` + `decided_by`), `recent_turns`, `active_topic_slug`, `active_lesson_id`. Test đối chiếu: `roadmap-rag-assistant/tests/test_router_policy.py`.

4. **Nạp bộ nhớ cá nhân — `load-owner-memory` (`SPAN`, chỉ `Owner`):**
   - **Lấy ở đâu:** `core/memory/store.py` (`owner_memory_store.list_active`, cache RAM `60s` trước `/api/v1/memories` trên Turso theo `ADR-0020`; tắt hoàn toàn nếu `OwnerPreference.memoryEnabled == False` hoặc Actor là `Visitor`).
   - **Xử lý:** lọc `status="active"` theo `scope` (`global` + `active_topic_slug`), xếp hạng theo `KIND_PRIORITY` + độ khớp từ khóa câu hỏi + decay `30` ngày, cắt theo trần `15` mục / `1500` ký tự.
   - **Output:** `count`, `explicit_count` (`source="explicit"`), `observed_count` (`source="observed"`), `scope`.

5. **Truy xuất, Lọc tài liệu & Nguồn ngoài — `retrieve-live-knowledge` (`RETRIEVER`) & `load-provenance` (`SPAN`):**
   - **`retrieve-live-knowledge`** (`core/orchestration/sources.py`, `domains/roadmap/retrieval/engine.py`):
     - **Nguồn dữ liệu:** in-memory Hybrid Index (BM25 FTS + Gemini `3072d` vector theo `ADR-0004`, `ADR-0006`). Khi có `page_context` và câu hỏi mang tính trực chỉ ("bài này", "trang này"…), `search_with_page_context` ghim tài liệu đang xem (`is_current_page=True`).
     - **Biến đổi & lọc** (đọc trong `metadata`):
       - `queries` & `rewritten`: `core/retrieval/transform.py` (`plan_queries` giải đại từ từ lịch sử; tự tắt với câu trực chỉ trang đang mở để không kéo nhầm bài cũ).
       - `reranked`: `core/retrieval/rerank.py` (chạy khi `rag_rerank=True` và khoảng cách điểm top-2 dưới ngưỡng).
       - `before_gate` & `dropped_by_gate`: danh sách tiêu đề tìm thấy nhưng bị `domains/roadmap/retrieval/relevance.py` (`filter_on_topic`) loại. **Luôn kiểm tra trường này đầu tiên khi kho có bài mà Abot báo không tìm thấy.**
     - **Output:** danh sách bài giữ lại sau gate kèm `rank`, `score`, `type`, `title`, `topic`, `section`.
   - **`load-provenance`** (`SPAN`, chỉ `Owner` khi kết quả có Lesson):
     - **Lấy ở đâu:** `core/provenance.py` (`LessonProvenanceStore`) gọi `/api/v1/roadmaps/provenance-by-lessons` để ghép chuỗi `Lesson → NewsItem` (`ADR-0017`, tách biệt khỏi index dùng chung).
     - **Output:** `matched_items`, `provenance_entries`.

6. **Tool, CUD Preview & Concept Promotion (`TOOL`, `SPAN`, `GENERATION`):**
   - Mọi `tool_start`/`tool_end` tạo một observation `TOOL` đặt theo tên tool (`observability.py`). `WARNING` `"stream ended before tool_end"` nghĩa là luồng bị ngắt giữa chừng.
   - Thao tác ghi (`Change`) của `Owner` luôn tạo thẻ `Preview` (`Pending Action` trong RAM, không ghi thẳng DB trong lượt đề xuất): `domains/roadmap/commands.py`, `sections.py`, `lesson_edit.py`, `lesson_content.py`, `lesson_status.py`, `memory_commands.py`.
   - Khi `Scope.DOMAIN_GAP` không tìm thấy bài (hoặc `Owner` yêu cầu đưa khái niệm vào bài học): chạy `concept-promotion-proposal` (`SPAN`, gợi ý đích + `relates` qua `linking_advisor.py`) và nếu sinh nháp nội dung thì chạy `lesson-draft-generation` (`GENERATION`, `lesson_content.py`, mặc định `include_owner_memory=False` theo `ADR-0020`).

7. **Sinh câu trả lời & Hậu kiểm — `synthesize-answer` / `chitchat-answer` / `<mode>-answer` (`GENERATION`):**
   - **Code:** `core/generation/pipeline.py`, cấu hình miền ở `domains/roadmap/profile.py` và `prompts.py`.
   - **Pipeline S1 → S5:** S1 `select_documents` + đảo thứ tự chữ U `reorder_documents` + ghép `<system>`, `<owner_memory>`, `<conversation_history>`, `<context>`, `<user_query>` → S2 stream LLM → S3 lọc link ngoài danh mục + `CiteChannel` tách `[[id]]` & `<sources>` → S4 `PiiStreamFilter` + `ClaimStreamFilter` (cắt câu tự nhận "đã tạo/đã xóa") + `guardrails.check` → S5 phát SSE + `record_last_turn`.
   - **Metadata (`metadata.sections` & `metadata.grounding`):** `history_turns`, `documents` (ID bài thực sự đưa vào prompt), `dropped_documents` (bị cắt do điểm tương đối hoặc ngân sách), `owner_memory_ids`, `provenance_lessons`, `citations`, `invalid_citations`, `removed_links`, `dropped_claims`, `grounding`.
   - **Câu trả lời cố định / từ dữ liệu** (`catalog`, `lesson_status`, `help_usage`, `out_of_scope`, `route_gate_blocked`, `no_match`): không có span `GENERATION`; kiểm tra `dispatch` hoặc `pre_route` trên root để trỏ thẳng tới hàm trong `agent.py`, `agent_actions.py`, `commands.py` hoặc `router/grounding.py`.

8. **Hậu xử lý sau lượt trả lời:**
   - `record_turn` lưu tin nhắn vào `history_store`.
   - Trên server FastAPI (`api/routes.py:_maybe_schedule_memory_extraction`), lượt hỏi đáp của `Owner` có tín hiệu bộ nhớ sẽ chạy nền span `owner-memory-extract` (`core/memory/extractor.py`, debounce `1.5s`, lưu ở `status="pending"` chờ duyệt).

### Các mốc Config để đối chiếu (mở file xác nhận lại dòng trước khi ghi vào report)
- Ngưỡng confidence cho lệnh ghi do LLM chọn: `CUD_MIN_CONFIDENCE` trong `domains/roadmap/router/policy.py`
- Ngưỡng confidence coi là đoán mò ở chitchat: `UNCLEAR_CONFIDENCE` trong `domains/roadmap/agent.py`
- Cửa sổ lịch sử dùng cho query rewrite / router: `HISTORY_TURNS` trong `core/retrieval/transform.py`; cắt ký tự mỗi tin nhắn trong prompt: `history_max_chars` trong `core/generation/profile.py`
- Trần nạp `Owner Memory`: `DEFAULT_MAX_ITEMS`, `DEFAULT_MAX_CHARS` trong `core/memory/store.py`
- Số kết quả tra cứu mặc định: `limit=4` trong `domains/roadmap/agent.py` (` RERANK_POOL` trong `core/retrieval/rerank.py` khi bật rerank)
- Timeout LLM chat: `timeout=25.0` trong `domains/roadmap/agent.py`; timeout nháp bài học: `DRAFT_TIMEOUT` trong `domains/roadmap/lesson_content.py`; timeout HTTP adapter / memory API: `10.0` trong `adapters/http_adapter.py` và `core/memory/store.py`
- Độ dài tối đa của `message`: `MAX_MESSAGE_CHARS` trong `core/guards.py` / `api/schemas.py`
- Loại observation chuẩn: chỉ gồm `AGENT`, `SPAN`, `TOOL`, `RETRIEVER`, `GENERATION`. Cột Loại ghi đúng `type` trong trace.
- **Actor:** `sessionId` bắt đầu bằng `owner:` là `Owner`; khác `owner:` là `Visitor`.

## 3. Tìm vấn đề

Đặt câu hỏi cho từng chặng, chỉ kết luận từ dữ liệu trong trace và code đã đọc:
- **Pre-route & Router:** Turn có bị bắt nhầm ở `pre_route` không? Nếu qua `intent-router`, `act`/`target`/`intent`/`sub_intent`/`scope` có khớp câu hỏi không? Có cờ `router_disagreement` hay `system2_unavailable` không?
- **Data Lineage (Ngữ cảnh & Truy xuất):**
  - `load-thread-context` có nạp đúng `active_topic_slug` / `active_lesson_id` và `history_turns` mong đợi không?
  - `plan_queries` có viết lại (`rewritten`) làm méo nghĩa câu hỏi không?
  - `dropped_by_gate` trong `retrieve-live-knowledge` có vô tình loại mất bài đúng chủ đề không? Hoặc `select_documents` có cắt mất bài ở `dropped_documents` không?
  - Với `Owner`, `load-owner-memory` hoặc `load-provenance` có bị thiếu hay lỗi `WARNING` không?
- **Generation & Guardrails:** Câu trả lời có khớp dữ liệu `<context>` không? Có `invalid_citations`, `removed_links`, `dropped_claims`, `llm_fallback` hay `grounding_fallback` không?
- **Actor Isolation:** Nếu Actor là `Visitor`, có lộ dữ liệu riêng của `Owner` (`Lesson Status`, `Owner Memory`, `Provenance`) hoặc gợi ý lệnh ghi gây hiểu nhầm UX không?
- **Hiệu năng & Span trống:** Có `level` `WARNING`/`ERROR` hoặc bước chậm bất thường không? Lấy `totalLatencyMs` của root trừ tổng `latencyMs` của các bước con mức `depth == 1`: nếu khoảng trống không có span chiếm trên 50% tổng thời gian (và không phải do `typing_delay` stream từ từ), đề xuất bọc `start_step` quanh đoạn code chạy trong khoảng đó kèm `file:line`.

Trước khi đề xuất sửa, bắt buộc mở file code của bước bị nghi để xác nhận dòng và logic thật (`gitnexus_query`/`gitnexus_context` nếu có, hoặc grep/read). Không đoán tên hàm, bảng hay số dòng.

## 4. Report

Trả report thẳng trong chat, không tạo file markdown phụ. Viết tiếng Việt, giữ nguyên thuật ngữ tiếng Anh của `GLOSSARY.md` và code.

### Sơ đồ luồng thực thi (Mục 1)

- Nếu môi trường có tool `show_widget` (skill `generative-ui`): vẽ một SVG flowchart nhỏ phản ánh đúng các bước thực sự chạy của trace (câu hỏi → `load-thread-context` → `pre_route` hoặc `intent-router` → bước dữ liệu/tool/retrieval → bước trả lời), tô màu theo trạng thái (`c-gray` bình thường, `c-amber` cảnh báo/nghi vấn, `c-red` lỗi/đi lệch đã có bằng chứng; nhánh kỳ vọng vẽ nét đứt khi đi lệch).
- Nếu không có `show_widget`: vẽ một sơ đồ `flowchart LR` hoặc `flowchart TD` bằng fence ```` ```mermaid ```` ngay tại Mục 1 với cùng nội dung trên (nhãn node có ký tự đặc biệt phải đặt trong dấu ngoặc kép `"..."`).

### Sơ đồ chi tiết bằng Gemini CLI (bất đồng bộ, khi máy có `gemini`)

Nếu `command -v gemini` có sẵn, ngay sau Bước 1 hãy chạy nền sơ đồ HTML chi tiết (waterfall thời gian + dải P0–P8 + Data Lineage):

```bash
node .agents/skills/abot-trace-report/scripts/draw-with-gemini.mjs <scratchpad>/trace-<id>.json <scratchpad>/trace-<id>-diagram.html
```

- Không chờ lệnh nền xong mới trả report; cuối report ghi một dòng báo sơ đồ HTML đang vẽ nếu đang chạy nền.
- Không có lệnh `gemini` thì bỏ qua bước này (không cần báo lỗi).

### Cột "Config", "Kỳ vọng" và "Tỷ lệ"

- **Config / Ngưỡng:** đọc giá trị thật từ code trong lần chạy này kèm `file:line`. Không có config tương ứng thì ghi `—`.
- **Kỳ vọng:** lấy từ ý câu hỏi của user, rule trong `router/policy.py`, hoặc test trong `roadmap-rag-assistant/tests/`. Không xác định được thì ghi `"không xác định"` và để `⚠️`.
- **Tỷ lệ:** `latencyMs` của bước / `totalLatencyMs` của root, làm tròn 10%, thanh 10 ô (`█` và `░`, ví dụ `██░░░░░░░░ 20%`). Bước con nằm trong bước cha nên tổng các dòng có thể vượt 100%.

### Khung report

Report gồm 7 phần theo đúng thứ tự sau:

````markdown
# Abot trace · <8 ký tự đầu traceId hoặc "local-dev">

> **Kết luận:** <✅ Trace ổn / ⚠️ Có điểm cần kiểm tra / ❌ Có lỗi> — <một câu nêu luồng chính đã đi và vấn đề nếu có>

| | |
|---|---|
| **Câu hỏi** | <câu user> |
| **Actor** | <Owner / Visitor> · <`page_context` nếu có, hoặc `không có page_context`> |
| **Môi trường** | <environment> · <startTime> |
| **Nhánh thực thi** | <`pre_route: ...` hoặc `intent -> dispatch`> |
| **Tổng thời gian** | <totalLatencyMs> ms |
| **Feedback / Nguồn** | <[Mở trong Langfuse](<traceUrl>) + 👍/👎 nếu có, hoặc `Local dev-trace (RAM isolated)`> |

## 1. Sơ đồ
<widget SVG hoặc fence mermaid phản ánh đúng các bước của lượt này>

## 2. Luồng dữ liệu & Đánh giá theo chặng

**Luồng dữ liệu (Data Lineage)**
| Chặng | Lấy thông tin gì & ở đâu | Xử lý / Biến đổi / Lọc | Kết quả chuyển tiếp | Code (`file:line`) |
|---|---|---|---|---|
| Ngữ cảnh | <`page_context`, Turso `ThreadState`/`ThreadMessage` hay RAM> | <đồng bộ focus, nạp cửa sổ lịch sử> | <`history_turns`, `active_topic_slug`, `pending_kind`> | `...` |
| Định tuyến | <tin nhắn chuẩn hóa + lịch sử gần> | <`pre_route` hoặc P0–P8 `decided_by` + System 2 `verdict`> | <`intent`, `sub_intent`, `scope`, `write`, `dispatch`> | `...` |
| Tri thức / Tool | <`OwnerMemory`, Hybrid Index, `Provenance` API, hoặc Adapter> | <query rewrite, rerank, `filter_on_topic` gate, tool args> | <giữ `N` bài, loại `[...]` ở gate, `M` memory, `K` provenance> | `...` |
| Trả lời & Guard | <prompt `<system>` + `<owner_memory>` + `<context>`> | <`reorder_documents`, stream filter, `guardrails.check`> | <`answer_mode`, `citations`, `dropped_documents`, `grounding`> | `...` |

*(Bỏ dòng nào lượt chạy thực tế không đi qua; mỗi ô ngắn gọn dựa trên metadata/output thật của trace.)*

**Đánh giá Kỳ vọng vs Thực tế**
| Chặng | Kỳ vọng | Thực tế | Kết quả | Nhận xét |
|---|---|---|:---:|---|
| Router / Pre-route | <`act`, `target`, nhánh kỳ vọng + nguồn> | <`pre_route` hoặc `act`, `target`, `decided_by`> | <✅/❌/⚠️> | <đúng hay lệch rule nào> |
| Retrieval / Tool | <bài/tool đáng lẽ lấy hoặc gọi> | <số bài sau gate, `dropped_by_gate`, tên tool> | <✅/❌/⚠️> | <đủ ngữ cảnh, rớt ở gate, hay lỗi> |
| Reply & Guard | Trả lời đúng trọng tâm, đúng Actor | <`answer_mode`, tóm tắt ngắn, `grounding`> | <✅/❌/⚠️> | <chuẩn, fallback, hay dính lỗi guard> |

**Thực tế so với config**
| Thông số | Thực tế (trace) | Config (code) | Kết quả |
|---|---|---|:---:|
| <tên thông số> | <giá trị + field> | <giá trị> · `file:line` | <✅ / ⚠️ / ❌> |

*(Bỏ bảng config nếu trace không có thông số nào đối chiếu được.)*

## 3. Thời gian
| # | Bước | Loại | Ms | Ngưỡng (code) | Tỷ lệ | Kết quả |
|---|---|---|---:|---|---|:---:|
| 1 | `roadmap-assistant` | AGENT | <ms> | — | `██████████ 100%` | ✅ |
| 2 | └ `load-thread-context` | SPAN | <ms> | — | <thanh 10 ô + %> | <✅/❌/⚠️> |
| 3 | └ <tên bước> | <type> | <ms> | <timeout + `file:line`, hoặc —> | <thanh 10 ô + %> | <✅/❌/⚠️> |

## 4. Câu trả lời
<1–2 câu tóm tắt nội dung trả lời thực tế; trích ngắn nếu cần>

## 5. Vấn đề và đề xuất
| # | Mức | Vấn đề | Bằng chứng (trace) | Vị trí sửa | Vì sao |
|:---:|:---:|---|---|---|---|
| V1 | bug / risk / nit | <vấn đề> | <bước + field> | `file:line` đã đọc | <lý do ngắn> |

*(Không có vấn đề thì ghi `"Không có"`.)*

## 6. Bước tiếp
**Bối cảnh:** trace `<8 ký tự id hoặc local>` · "<câu hỏi>" · <quan sát chính trong một câu>

| # | Loại | Việc cần làm | Vị trí | Xong khi | Cho |
|:---:|---|---|---|---|:---:|
| T1 | Kiểm tra / Sửa / Tracing / Test | <động từ + đối tượng> | `file:line` | <điều kiện kiểm chứng được> | V1 |

## 7. Hành động tiếp theo
<một lời nhắc ngắn gọn chốt hành động để user chỉ cần gõ yes / no hoặc không làm gì>
````

**Quy tắc cho mục 6:**
- Mỗi ô tối đa khoảng 12 từ; tối đa 4 task theo thứ tự thực hiện (`Kiểm tra` trước `Sửa`).
- Mỗi `bug`/`risk` ở mục 5 phải có ít nhất một task `Sửa` tương ứng; mục 5 là `"Không có"` thì mục 6 chỉ ghi `"Không cần làm gì"`.
- Cột **Xong khi** phải kiểm chứng được bằng test hoặc field trong trace mới.

**Quy tắc cho mục 7 (chốt hành động `yes` / `no` / `do nothing`):**
- **Khi mục 6 có task (`T1`…):** viết **1–2 câu trực diện** nêu gói task đề xuất làm ngay (gồm mã `T1`… và file chính sẽ chạm), kết thúc bằng lựa chọn đóng:
  > Ví dụ: *"Bạn có muốn thực hiện ngay **T1–T2** (song song hóa `load-owner-memory` với bước retrieve tại `agent.py` và đồng bộ `adapter_mode` trong `local-trace.py`) không? Trả lời **yes** để triển khai ngay, **no** (hoặc bỏ qua) nếu giữ nguyên."*
- **Khi mục 5 là `"Không có"`:** chỉ ghi một câu khẳng định không cần hành động để user không phải trả lời thêm:
  > *"Trace đang vận hành đúng thiết kế — không có thay đổi nào cần thực hiện (bạn không cần phản hồi thêm)."*

## Giới hạn

- Không ghi gì vào Langfuse (score, queue, dataset) và không ghi bẩn vào Turso/SQLite khi chạy `local-trace.py`.
- Không tự sửa code ứng dụng trong lúc chạy skill này; chỉ sửa khi user yêu cầu riêng.
- Không đưa API key, secret, email hay số điện thoại vào report.
