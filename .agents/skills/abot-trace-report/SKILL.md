---
name: abot-trace-report
description: Phân tích một Langfuse trace của Abot (trợ lý roadmap, service Python `roadmap-rag-assistant/`) và trả report chỉ đọc gồm kết luận, đánh giá từng chặng (router, tool, câu trả lời), thời gian từng bước, và đề xuất sửa trỏ tới file:line trong repo. Dùng khi user gõ `/abot-trace-report <trace_id>`, paste trace id 32 ký tự hex (nút "Sao chép trace ID" dưới câu trả lời của Abot), hoặc gửi dạng `<query> > <trace_id>`; cũng dùng khi user hỏi vì sao Abot trả lời như vậy, router chọn nhánh nào, tool nào chạy sai, hay bước nào chậm, dù không nói chữ "trace" hay "Langfuse". Không dùng cho Cris AI (trace `chat`) hay các bot khác.
---

# Abot trace report

Cách gọi lệnh:
```bash
/abot-trace-report <trace_id>
# hoặc:
/abot-trace-report 1cb4f5b08049d199d72de297bb732516
# hoặc dạng kèm câu hỏi:
có thể làm gì khác nữa k > 1cb4f5b08049d199d72de297bb732516
```

Nếu user chỉ truyền `<trace_id>`, câu hỏi sẽ tự động được lấy từ input của root trace (`message`).

Mục tiêu: user nhìn nhanh và trực quan Abot đã đi theo luồng logic nào, rẽ vào đâu, bước nào là **điểm confused** (hiểu nhầm intent, gọi sai tool, rơi vào fallback, chậm), và file nào cần sửa. Đây là việc chỉ đọc.

## 1. Tải trace

Chạy từ root repo:

```bash
npx ts-node --compiler-options '{"module":"CommonJS"}' .agents/skills/abot-trace-report/scripts/fetch-trace.ts <trace_id> > <scratchpad>/trace-<trace_id>.json
```

- Script chỉ gọi GET tới Langfuse public API, key lấy từ `.env.local` qua `scripts/lib/langfuse-api.ts`. Không tự mở hay in `.env*`.
- Mặc định tìm trong 30 ngày gần nhất. Trace cũ hơn: thêm `--days 90`.
- `found: false`: trace chưa ingest xong (đợi vài giây rồi chạy lại), quá hạn `--days`, hoặc thuộc project/region khác với `LANGFUSE_BASE_URL`. Báo user và dừng, không đoán nội dung.
- Ghi JSON ra scratchpad rồi đọc file đó, vì input/output có thể dài.

Output có `traceName`, `environment`, `startTime`, `totalLatencyMs`, `sessionId`, `traceUrl`, `scores` (👍/👎 tên `user-feedback`) và `observations` theo thứ tự thời gian. Mỗi observation có `depth` (độ sâu trong cây), `name`, `type`, `level`, `latencyMs`, `model`, `usage`, `cost`, `metadata`, `input`, `output`.

**Kiểm tra bot:** nếu `traceName` không phải `roadmap-assistant` (ví dụ `chat` của Cris AI, `workflow-run`), báo user trace này không phải của Abot và dừng. Skill này chỉ map code của Abot.

## 2. Đọc trace Abot

Code nằm trong `roadmap-rag-assistant/rag_service/`.

- **Root `roadmap-assistant` (AGENT):** metadata có tín hiệu cả lượt: `intent`, `act`, `target`, `write`, `tools`. Input có `message` và `page_context`. Tracing: `observability.py`.
- **`intent-router`:** metadata `phases.P0_focus` … `phases.P8_gate`, `phases.decided_by`, `rules`, `method` (`heuristic` hay model). Đây là chỗ hay sai nhất: so câu user với `act`/`target`/route để xem router có hiểu đúng không. Code: `domains/roadmap/router/` (`policy.py`, `route_decision.py`, `grounding.py`), gọi từ `domains/roadmap/agent.py`. Test: `roadmap-rag-assistant/tests/test_router_policy.py`.
- **Tool (`TOOL`):** mỗi `tool_start` của agent thành một observation đặt theo tên tool (`observability.py`), gồm cả tool ghi (`create_*`, `update_*`, `delete_*`, `generate_*`) lẫn tool tra cứu. Input là args, output là kết quả. `WARNING` "stream ended before tool_end" là tool bị cắt giữa chừng. Code: `domains/roadmap/agent_actions.py`, `commands.py`.
- **Retrieval (`RETRIEVER`) `retrieve-live-knowledge`:** input `query`, `limit`; metadata `adapter_mode`, `scoring`. Code: `core/orchestration/sources.py`.
- **Generation (`GENERATION`) `synthesize-answer` (mode rag) / `chitchat-answer` (mode chitchat), mode khác là `<mode>-answer`:** `model`, `usage`, `timeToFirstTokenMs`. Code: `core/generation/pipeline.py`, tên bước ở `core/generation/profile.py` (`trace_names`), prompt ở `domains/roadmap/prompts.py`.
- Loại observation Abot tạo ra chỉ có `AGENT`, `SPAN`, `TOOL`, `RETRIEVER`, `GENERATION`. Cột Loại trong report ghi đúng giá trị `type` của trace, không tự đặt loại mới.
- **Câu trả lời cố định** (help, xác nhận) không có generation: tìm text đó trong `domains/roadmap/` (`agent.py`, `commands.py`, `agent_actions.py`).
- **Help reply** lấy ví dụ từ hai nguồn: index RAG (`router/grounding.py`) và adapter API (`agent_actions.py`). Lỗi của cả hai chỉ được `print`, không vào trace. Vì vậy "Roadmap chưa có bài nào" có thể là dữ liệu rỗng thật hoặc là lỗi lấy dữ liệu; ghi rõ là trace không phân biệt được hai trường hợp này.
- **Config để so sánh** (đường dẫn tính từ `rag_service/`; mở lại để xác nhận giá trị trước khi dùng, vì code có thể đã đổi):
  - Confidence của từng row router: `domains/roadmap/router/policy.py` (`Row(...)`, ví dụ `plan` 0.98, `about_assistant` 0.90)
  - Ngưỡng confidence cho thay đổi chỉ do LLM router chọn: `CUD_MIN_CONFIDENCE` trong `domains/roadmap/router/policy.py`
  - Số kết quả tra cứu: `limit=4` trong `domains/roadmap/agent.py` (`search=lambda query, limit=4`)
  - Timeout gọi LLM: `timeout=25.0` trong `domains/roadmap/agent.py`
  - Timeout HTTP của adapter: `timeout=10.0` trong `adapters/http_adapter.py`
  - Độ dài tối đa của message: `max_length=2000` trong `api/schemas.py`; history mỗi message: `history_max_chars` trong `core/generation/profile.py`
  - Không có ngưỡng latency cho từng bước trong code: cột Ngưỡng của bảng Thời gian ghi `—`, không tự đặt.
- **Role:** mặc định là Owner, vì hiện Abot chỉ dùng cá nhân, chưa public. `sessionId` dạng `owner:...` xác nhận điều đó. Chỉ khi `sessionId` không bắt đầu bằng `owner:` mới coi là Visitor. Visitor gửi lệnh ghi thì bị chặn ở `agent.py` (`not is_owner() and route_gate.mode != WRITE_NONE`, cờ `visitor_write_attempt`). Một số câu trả lời cố định không nhận cờ `owner` (ví dụ `_help_reply()`), nên Visitor vẫn có thể thấy lệnh ghi.

## 3. Tìm vấn đề

Đặt câu hỏi cho từng bước, chỉ kết luận từ dữ liệu trong trace và code đã đọc:
- Router có hiểu đúng ý câu hỏi không (`act`, `target`, route)?
- Có lấy đúng dữ liệu không (tool result, grounding)?
- Câu trả lời có khớp câu hỏi không, có lặp lại câu cố định khi user hỏi việc khác không?
- Có `level` `WARNING`/`ERROR`, bước chậm bất thường (so với các bước khác trong cùng trace) không?
- User đã 👎 chưa (`scores`)?
- **Role khớp câu trả lời không?** Chỉ kiểm tra khi Role là Visitor (Owner thì bỏ qua). Câu trả lời có lệnh ghi (Thêm, Sửa, Xóa…) cho Visitor thì ghi nhận là vấn đề UX, mức `risk` hoặc `nit`, trỏ tới hàm tạo câu trả lời đó. Lệnh ghi vẫn bị chặn khi chạy, nên đây không phải lỗi phân quyền, trừ khi trace cho thấy Visitor ghi được thật.
- **Có khoảng thời gian không có span không?** Lấy `totalLatencyMs` của root trừ tổng `latencyMs` của các bước con trực tiếp. Nếu phần còn lại trên 50% tổng thời gian, luôn có một đề xuất instrumentation (bọc `start_step` quanh đoạn code chạy trong khoảng đó), trỏ tới `file:line` đã đọc.

Hành động kiểm tra dữ liệu chỉ được trỏ tới thứ có thật trong code đã đọc (hàm adapter, endpoint, script trong repo). Không đoán tên bảng, endpoint hay lệnh. Không tìm được thì ghi "cần kiểm tra".

Trước khi đề xuất sửa, mở code của bước bị nghi và trace từ entry tới logic (repo yêu cầu vậy). Dùng `gitnexus_query`/`gitnexus_context` nếu có, không thì grep. Đề xuất phải trỏ được tới `file:line` đã đọc. Chưa đọc được code thì ghi "cần kiểm tra" thay vì đoán.

## 4. Report

Trả report thẳng trong chat, không cần ghi ra file. Viết tiếng Việt, giữ thuật ngữ tiếng Anh.

### Sơ đồ luồng thực thi

Mục 1 "Sơ đồ" luôn có một sơ đồ mặc định do Claude vẽ. Vẽ bằng skill `generative-ui`: gọi `show_widget` với một SVG flowchart nhỏ. Sơ đồ phản ánh đúng trace, không phải khung mẫu:
- Các node theo thứ tự thực tế: câu hỏi → `intent-router` (route, `decided_by`, `act`/`target`) → bước thực sự chạy (tên tool, `retrieve-live-knowledge`, `synthesize-answer`/`chitchat-answer`, hoặc help/fixed reply) → câu trả lời. Tối đa 5 node, mỗi node có tên bước và subtitle ngắn (ví dụ thời gian).
- Màu theo trạng thái: `c-gray` cho bước bình thường, `c-amber` cho `WARNING` hoặc vấn đề chưa chắc, `c-red` cho `ERROR` hoặc chỗ sai đã có bằng chứng. Có màu thì có legend một dòng.
- Chỉ vẽ nhánh "kỳ vọng" (nét đứt) khi có bằng chứng router hay tool đi lệch. Trace ổn thì không vẽ điểm confused nào.
- `title` dạng `abot_trace_<8 ký tự id>_pipeline`.

Chỉ khi không có tool vẽ (chạy trong terminal hoặc dưới dạng subagent) mới bỏ mục 1. Khi đó bỏ cả tiêu đề mục, không để lại dòng ghi chú hay placeholder.

### Sơ đồ chi tiết bằng Gemini (bất đồng bộ)

Ngay sau khi tải trace (bước 1), trước khi viết report, khởi động Gemini CLI vẽ sơ đồ chi tiết (waterfall thời gian + dải phase P0–P8 của router) bằng Bash với `run_in_background: true`:

```bash
node .agents/skills/abot-trace-report/scripts/draw-with-gemini.mjs <scratchpad>/trace-<trace_id>.json <scratchpad>/trace-<trace_id>-diagram.html
```

- Không chờ: viết và trả report như bình thường. Cuối report thêm một dòng "Sơ đồ chi tiết đang được Gemini vẽ, sẽ gửi link khi xong."
- Script đưa trace cho Gemini qua stdin (đã bỏ input/output của các bước) và nhận HTML qua stdout. Gemini không được dùng tool đọc/ghi file hay shell. Script tự kiểm tra HTML (đủ tài liệu, không `<script>`, không URL ngoài) rồi mới ghi file.
- Khi được báo lệnh nền xong:
  - Exit 0: gửi link file HTML (đường dẫn đầy đủ trong scratchpad) bằng `SendUserFile` với `display: "render"`, kèm một câu nói đây là sơ đồ do Gemini vẽ.
  - Exit khác 0: báo lỗi trong output của script (thiếu `gemini`, chưa đăng nhập, timeout, HTML bị từ chối). Không thử lại tự động, không tự vẽ thay.
- Không có lệnh `gemini` (`command -v gemini` rỗng) thì bỏ bước này và nói ngắn gọn trong report.

### Cột "Config" và "Ngưỡng"

Giá trị config phải đọc từ code trong lần chạy này (danh sách ở mục 2 chỉ là chỗ bắt đầu tìm), ghi kèm `file:line`. Không có config tương ứng thì ghi `—`, không tự đặt ngưỡng "hợp lý". Lệch config là bằng chứng mạnh: nếu một thông số ❌ thì đưa vào mục 5.

### Cột "Kỳ vọng"

Kỳ vọng phải có nguồn, nếu không thì thành đoán. Lấy từ: ý câu user (kèm nhận xét user viết trước `>`), row/rule tương ứng trong `router/policy.py`, hoặc test trong `test_router_policy.py`. Ghi nguồn ngắn trong cột Nhận xét. Không xác định được thì ghi "không xác định" và để Trạng thái là ⚠️, không tự chọn ✅.

### Cột "Tỷ lệ"

Tỷ lệ = `latencyMs` của bước / `totalLatencyMs` của root, làm tròn tới 10%. Thanh gồm 10 ô (`█` cho mỗi 10%, `░` cho phần còn lại), ví dụ `█░░░░░░░░░ 9%`. Bước con nằm trong bước cha, nên tổng các dòng có thể vượt 100%: đó là bình thường, không phải lỗi. Không có `latencyMs` thì ghi `—`.

### Khung report

Report có 6 phần, theo đúng thứ tự này. Mỗi phần bắt đầu bằng `##` và không đổi tên.

````markdown
# Abot trace · <trace_id rút gọn 8 ký tự>

> **Kết luận:** <✅ Trace ổn / ⚠️ Có điểm cần kiểm tra / ❌ Có lỗi> — <một câu nêu vấn đề chính, hoặc "không có vấn đề">

| | |
|---|---|
| **Câu hỏi** | <câu user> |
| **Role** | Owner <ghi Visitor chỉ khi sessionId không bắt đầu bằng owner:> |
| **Môi trường** | <environment> · <startTime> |
| **Tổng thời gian** | <totalLatencyMs> ms |
| **Feedback** | <👍 / 👎 + lý do / chưa có> |
| **Trace** | [Mở trong Langfuse](<traceUrl>) |

## 1. Sơ đồ
<sơ đồ show_widget>

## 2. Đánh giá theo chặng
| Chặng | Kỳ vọng | Thực tế | Kết quả | Nhận xét |
|---|---|---|:---:|---|
| Router | `act`, `target`, rule (nguồn: …) | `act`, `target`, `decided_by` | <✅/❌/⚠️> | <đúng hay nhầm rule nào> |
| Action / Tool | <tool, retrieval hoặc help đáng lẽ chạy> | <tool thật, `retrieve-live-knowledge`, help, fixed reply> | <✅/❌/⚠️> | <hoàn tất, warning, hay bị cắt> |
| Reply | Trả lời đúng trọng tâm | <tóm tắt câu trả lời> | <✅/❌/⚠️> | <lặp câu cố định, bịa, hay đúng> |

Bỏ dòng nào trace không có bước tương ứng.

**Thực tế so với config**
| Thông số | Thực tế (trace) | Config (code) | Kết quả |
|---|---|---|:---:|
| <tên thông số> | <giá trị + field trong trace> | <giá trị> · `file:line` | <✅ trong khoảng / ⚠️ sát ngưỡng / ❌ vượt ngưỡng> |

Chỉ đưa thông số mà trace có giá trị và code có config tương ứng (confidence, số kết quả, timeout, độ dài). Không có cặp nào thì bỏ bảng này.

## 3. Thời gian
| # | Bước | Loại | Ms | Ngưỡng (code) | Tỷ lệ | Kết quả |
|---|---|---|---:|---|---|:---:|
| 1 | `roadmap-assistant` | AGENT | <ms> | — | `██████████ 100%` | ✅ |
| 2 | └ `intent-router` | SPAN | <ms> | — | <thanh 10 ô + %> | <✅/❌/⚠️> |
| 3 | └ <tên bước> | <type> | <ms> | <timeout + `file:line`, hoặc —> | <thanh 10 ô + %> | <✅/❌/⚠️> |

Cột Ngưỡng chỉ ghi timeout có thật trong code cho bước đó (ví dụ generation: timeout LLM). Bước dùng quá 80% timeout thì Kết quả là ⚠️, chạm timeout thì ❌.

Một dòng cho mỗi observation, thụt `└` theo `depth`. Tổng các dòng con có thể vượt 100% vì bước con nằm trong bước cha, đó là bình thường.

## 4. Câu trả lời
<1–2 câu tóm tắt; trích ngắn nếu cần>

## 5. Vấn đề và đề xuất
| # | Mức | Vấn đề | Bằng chứng (trace) | Vị trí sửa | Vì sao |
|:---:|:---:|---|---|---|---|
| V1 | bug / risk / nit | <vấn đề> | <tên bước + field> | `file:line` đã đọc | <lý do ngắn> |

Không có vấn đề thì ghi "Không có" trong bảng này.

## 6. Bước tiếp
**Bối cảnh:** trace `<id 8 ký tự>` · "<câu hỏi>" · <điều quan sát chính, một câu>

| # | Loại | Việc cần làm | Vị trí | Xong khi | Cho |
|:---:|---|---|---|---|:---:|
| T1 | Kiểm tra / Sửa / Tracing / Test | <động từ + đối tượng> | `file:line` | <kết quả kiểm chứng được> | V1 |
````

**Quy tắc cho mục 6:**
- Mỗi ô ngắn, tối đa khoảng 12 từ. Chi tiết lý do đã ở mục 5, không lặp lại.
- Dòng **Bối cảnh** ghi trace id, câu hỏi và điều quan sát chính, để người hoặc agent khác chỉ đọc mục 6 vẫn biết đang làm cho trace nào.
- Đánh số `T1`, `T2`… theo thứ tự nên làm; task Kiểm tra đứng trước task Sửa. Phụ thuộc thì ghi ngắn trong cột Việc cần làm ("sau T1").
- **Mục 6 phải khớp mục 5:** mỗi `bug`/`risk` có ít nhất một task Sửa. Không viết "nếu dữ liệu rỗng thì bỏ qua" khi mục 5 còn `bug`/`risk`.
- **Xong khi** phải kiểm chứng được (span hay field có trong trace mới, test pass), không viết "hoạt động tốt".
- Vị trí và tên phải có thật trong code đã đọc; tên mới (span, metadata key) ghi kèm "(đề xuất)".
- Tối đa 4 task. Mục 5 là "Không có" thì mục 6 chỉ ghi "Không cần làm gì".

## Giới hạn

- Không ghi gì vào Langfuse (score, queue, dataset). Golden set đi qua review queue và `python -m evals sync-dataset` (ADR-0003): chỉ gợi ý, user tự làm.
- Không sửa code trong skill này. Muốn sửa thì user yêu cầu riêng.
- Không đưa key, email hay số điện thoại từ trace vào report.
