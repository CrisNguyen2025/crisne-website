# Bản đồ quyết định → metric cho evals Abot

Ngày: 2026-11-17 · Phạm vi: `roadmap-rag-assistant/evals/` · Trạng thái: DRAFT, chờ Owner chốt các ô "cần chốt".

Nguyên tắc: mỗi metric phải trả lời cho ít nhất một quyết định đang mở. Metric không gắn quyết định nào thì chưa thêm.
Muốn thêm metric mới: thêm hàng quyết định trước, rồi mới thêm metric.

## 1. Quyết định đang mở

| # | Quyết định | Hiện tại | Metric cần | Đã có? | Sample cần | Đủ chưa | Ngưỡng chốt |
|---|---|---|---|---|---|---|---|
| D1 | Bật `rag_rerank` ở production | `False` (`rag_service/config.py:43`) | `retrieval.mrr@5` có/không rerank; latency p95 và cost mỗi turn | mrr: có (0.9046 → 0.9565, 17/11). Latency/cost: evals **không đo**, chỉ Langfuse có | `public/roadmap` n=87 | mrr: đủ. Latency/cost: thiếu số | cần chốt: p95 được tăng tối đa bao nhiêu ms |
| D2 | Giữ `rag_query_transform` | `True`, comment ghi 2/115 câu kích hoạt (2026-10-25) | rewrite gain: hit@5 trên câu có history, transform on/off; tỷ lệ kích hoạt | **Không**: `Target.retrieve()` chỉ nhận `text`, không nhận history | câu nhiều lượt có đại từ ("bài đó") | `public/roadmap` có 0 câu history, `_answer` có 8 | cần chốt: gain tối thiểu để giữ một lần gọi LLM |
| D3 | Bật `rag_semantic_grounding` | `False` (`config.py:49`) | `judge.faithfulness_mean` on/off; latency thêm | faithfulness: có (4.52). Latency: không | câu dễ bịa (context thiếu một phần) | `_answer` n=36, chưa có nhóm câu dễ bịa | cần chốt: faithfulness phải tăng bao nhiêu |
| D4 | Đổi `llm_model` / `llm_model_router` / model judge | Gemini Flash; judge `qwen/qwen3.8-27b` trên Groq | `pass^3` trên `_routing` và `_answer`; profile `judge`; `human_agreement`, `judge_false_pass` | Metric: có hết (commit `1b5465e`). Số pass^3: **chưa chạy lần nào** | label người: 22 | label ít, `facts` chỉ 7 sample | profile `judge` hiện có (`_answer/meta.json`) + cần chốt: pass^3 tối thiểu |
| D5 | Siết ratchet router | `TASK-router-stress-001` (READY) | `route.accuracy`, router-check baseline | Có (261/261) | `_routing` n=266 | Đủ | Đã có trong task spec |
| D6 | Gate trước merge (prompt/code đổi) | CI: `hit@5 ≥ 0.95`, `mrr@5 ≥ 0.8`, route; judge chạy tay | như cột trái | Có | như trên | Đủ cho retrieval/router; judge không chạy trong CI | Đã chốt |

## 2. Metric đang có nhưng chưa phục vụ quyết định nào

| Metric | Vì sao chưa đọc được | Xử lý |
|---|---|---|
| `judge.context_recall` | chỉ tính ở sample có cả `facts` và `contexts`; `facts` mới có 7 → chưa có số | để yên, sẽ có số khi làm G1 |
| `retrieval.recall@5` | n=5, đang 1.0 (bão hoà) | để yên; tăng sample `required` khi có câu nhiều section thật |
| `retrieval.off_topic_rejected` | 0.889, không có ngưỡng, không gắn quyết định | ghi nhận; gắn vào quyết định chỉnh gate on-topic nếu Owner mở |
| `answer.cite_rate` (đề xuất) | chỉ phục vụ quyết định đổi K / `MAX_SOURCES`, chưa ai mở | **hoãn** |

## 3. Khoảng trống dataset, theo thứ tự ưu tiên

| # | Khoảng trống | Phục vụ | Việc làm |
|---|---|---|---|
| G1 | `_answer` chỉ 7 sample có `facts` | D3, D4, làm `context_recall` có số | thêm sample có `facts` + `contexts`, ưu tiên câu nội dung bài (hiện 7 câu đều về trí nhớ) |
| G2 | 22 label người | D4 (tin được judge hay không) | thêm label cho sample mới của G1 |
| G3 | Chưa có số pass^3 | D4 | chạy `--repeat 3 --opt cache=off` một lần làm baseline (tốn ×3 token) |
| G4 | Retrieval không có câu nhiều lượt | D2 | cần đổi `Target.retrieve()` để nhận history → đổi contract kit, phải lập plan riêng |
| G5 | Latency/cost không có trong evals | D1, D2, D3 | lấy từ Langfuse (ADR-0003: Langfuse giữ dữ liệu online), không dựng lại trong evals |

## 4. Kế hoạch và trạng thái (chốt 2026-11-17)

| # | Quyết định của Owner | Việc đã làm | Trạng thái |
|---|---|---|---|
| G1 | Chỉ thêm `facts` cho sample chưa có `judge_label` (label cũ được chấm khi chưa có facts, sửa vào sẽ lệch calibration) | `answer-029`–`036`: thêm `facts` (active). `answer-037`–`046`: 10 sample mới về nội dung bài, có `contexts` + `facts`, `status: needs_review` (runner bỏ qua). Mọi fact là đoạn nguyên văn trong text section của corpus, để `context_recall` đo đúng | Xong. Chờ Owner duyệt 037–046 rồi đổi sang `active` |
| G2 | Owner tự label | Không làm. Cần label: 029–046 (18 sample, chưa có `judge_label`) | Chờ Owner |
| G3 | Chỉ chạy `_answer` | `evals run --only _answer --opt answer=llm --opt judge=llm --opt cache=off --repeat 3 --profile judge` | Xem mục 5 |
| G4 | Hoãn, không đổi contract `Target.retrieve()` | D2 đọc tỷ lệ flag `rewritten` trên trace thật ở Langfuse | Hoãn |
| G5 | Lấy latency/cost từ Langfuse | Không đổi code evals | Không làm trong evals |

Hệ quả cần biết của G1: `answer` scorer so `facts` bằng substring, nên `answer.accuracy` của 029–036 có thể giảm khi câu trả lời diễn đạt khác. `answer` không có ngưỡng; profile `judge` (`facts_pass ≥ 0.8`) chấm facts theo nghĩa nên mới là số cần đọc.

## 5. Baseline G3

Đang chạy, cập nhật sau khi xong.

## 6. Cần Owner chốt

1. D1: p95 latency được tăng tối đa bao nhiêu khi bật rerank.
2. D2: rewrite gain tối thiểu để giữ `rag_query_transform`, hoặc có cần đo D2 không (2/115 câu kích hoạt, chi phí có thể đã nhỏ).
3. D3: faithfulness phải tăng bao nhiêu thì đáng một lần gọi LLM và việc giữ câu trả lời lại.
4. D4: pass^3 tối thiểu, và có định đổi model trong thời gian gần không (không thì G2, G3 chưa gấp).
5. Thứ tự: làm G1 trước (đề xuất), hay quyết định nào trước.
