# Báo Cáo Bàn Giao Handoff (Handoff Report)

- **Đơn vị bàn giao:** `explorer_retry_false_friends` (Teamwork Explorer)
- **Đơn vị nhận:** Điều phối viên (`orchestrator`) / Tác giả tài liệu thiết kế (`worker_design_doc`)
- **Ngày bàn giao:** 2026-11-10T10:17:00Z
- **Loại bàn giao:** Hard Handoff (Nhiệm vụ hoàn thành trọn vẹn, đầy đủ đặc tả kỹ thuật và bằng chứng thực nghiệm).

---

## 1. Quan Sát (Observation)

1. **Vấn đề va chạm từ giả `"tiến độ"` (Polysemy Collision):**
   - Tại `roadmap-rag-assistant/rag_service/domains/roadmap/lesson_status.py:160`:
     ```python
     _KNOWN_CUE = re.compile(
         r"\b(?:dang\s+biet\s+gi|da\s+biet\s+gi|da\s+nam\s+gi|da\s+nam\s+nhung\s+gi|nam\s+nhung\s+gi|biet\s+nhung\s+gi|da\s+hoc\s+nhung\s+gi|da\s+hoc\s+gi|tien\s+do\s+hoc|tien\s+do)\b"
     )
     ```
     Cụm từ `tien\s+do` đứng một mình trong regex.
   - Báo cáo của `challenger_2` (`.agents/teamwork/challenger_2/report.md:132`):
     Câu hỏi *"Tiến độ giải ngân vốn đầu tư công hiện nay thế nào"* bị `asks_what_i_know()` bắt nhầm, router gán `PROGRESS`. Nếu gửi vào hệ thống, Abot sẽ trả về tiến độ bài học của Owner thay vì báo out of scope!
   - Tại `rag_service/domains/roadmap/router/understanding.py:235-248` và `route_decision.py:134-142`:
     Cơ chế lọc $P_3$ (Target) và $P_4$ (Scope) của Abot định rõ: nếu câu hỏi không chứa thực thể roadmap (`Target.NONE`) và nằm ngoài không gian bài học (`Scope.EXTERNAL`), `route_decision.py:137` trả về `IntentType.OUT_OF_SCOPE`. Nhưng hiện tại logic nhận diện tiến độ chạy trước hoặc bỏ qua $P_3/P_4$.

2. **Vấn đề va chạm đại từ chỉ lượng `"mấy bài"` (Indefinite vs Counting Query):**
   - Báo cáo của `challenger_2` (`.agents/teamwork/challenger_2/report.md:134`):
     Câu hỏi *"tìm giúp mấy bài liên quan đến authentication"* bị `COUNTING_CUE` bắt nhầm do cụm `"mấy bài"`, câu hỏi tìm kiếm tài liệu bị chuyển thành câu đếm số lượng bài!
   - Tại `rag_service/domains/roadmap/router/policy.py:234`:
     Từ `"tìm"`, `"kiếm"`, `"tra cứu"` nằm trong `SEARCH_WORDS`.
     Trong tiếng Việt, cấu trúc `[động từ tìm kiếm] + "mấy bài" + [chủ đề]` là hành động tìm kiếm tài liệu (Search), còn `[thực thể] + "có mấy bài"` mới là câu hỏi cấu trúc (Catalog).

3. **Vấn đề bẫy thuộc tính `NoneType` (`AttributeError`) downstream:**
   - Tại `roadmap-rag-assistant/rag_service/domains/roadmap/agent.py:365`:
     ```python
     intent=intent_res.intent.value,
     ```
     và `agent.py:377`:
     ```python
     trace.flags["intent"] = intent_res.intent.value
     ```
   - Tại `roadmap-rag-assistant/docs/knowledge-sub-intents-design.md:369-375`:
     `sub_intent: Optional[KnowledgeSubIntent] = Field(None, ...)`
   - Báo cáo của `challenger_1` (`.agents/teamwork/challenger_1/report.md:26-39`):
     Nếu downstream truy cập `intent_res.sub_intent.value`, khi tin nhắn thuộc bất kỳ intent nào khác `KNOWLEDGE_QUERY` (hoặc khi `sub_intent is None`), mã nguồn ném `AttributeError: 'NoneType' object has no attribute 'value'`, lập tức làm đứt kết nối SSE streaming và sập cuộc hội thoại của người dùng.

4. **Hiện trạng tài liệu `roadmap-rag-assistant/docs/knowledge-sub-intents-design.md`:**
   - Mục 3.2 (dòng 359-388) chưa có safe accessor `sub_intent_value` và model validator bảo vệ tính toàn vẹn thứ bậc.
   - Mục 3.5 (dòng 445-452) chỉ có 5 cặp phân giải đơn giản, thiếu hoàn toàn các ca va chạm từ giả (`"tiến độ"`, `"mấy bài"`, `"học gì tiếp"`, đa ý định).
   - Mục 4.3 Phase 3 (dòng 605-618) chưa có hướng dẫn quy chuẩn lập trình an toàn downstream.

---

## 2. Chuỗi Suy Luận Logic (Logic Chain)

1. Từ **Quan sát 1** và **Quan sát 2**:
   Các lỗi va chạm từ giả xuất phát từ việc áp dụng regex từ khóa thô mà không tuân thủ đường ống $P_0 - P_4$. Cụ thể:
   - Từ `"tiến độ"` bị hiểu nhầm vì không qua bộ lọc $P_3$ Target (`Target.ROADMAP`) và $P_4$ Scope (`Scope.ROADMAP`/`DOMAIN_GAP`). Nếu $P_4$ là `Scope.EXTERNAL`, câu hỏi phải bị chặn thành `OUT_OF_SCOPE` trước khi sub-intent được xét.
   - Từ `"mấy bài"` bị gán nhầm sang `CATALOG` vì bộ phân loại bỏ qua phân tích $P_1$ (SpeechAct) và sự hiện diện của động từ tìm kiếm `SEARCH_WORDS` (`"tìm"`, `"kiếm"`). Khi có động từ tìm kiếm, `"mấy bài"` là danh từ chỉ lượng không xác định ("vài bài"), đòi hỏi gọi Vector RAG (`SEARCH`).
2. Từ **Quan sát 3**:
   `sub_intent` là trường tùy chọn có thể nhận giá trị `None`. Trong Python, việc gọi `.value` trực tiếp trên `None` chắc chắn gây ra `AttributeError`. Trong kiến trúc streaming SSE của `agent.py`, ngoại lệ này làm sập toàn bộ luồng phản hồi. Do đó, việc xây dựng cơ chế phòng thủ sâu (defense-in-depth) ở cả 2 tầng: tầng Schema Pydantic (thuộc tính an toàn `@property sub_intent_value` và validator tự động chuẩn hóa) và tầng downstream `agent.py` (cú pháp bảo vệ `None` và rẽ nhánh thứ bậc) là bắt buộc.
3. Từ **Quan sát 4**, kết hợp với bước suy luận 1 và 2:
   Tài liệu thiết kế `knowledge-sub-intents-design.md` cần được bổ sung ngay lập tức các nội dung đặc tả này trước khi triển khai code, nhằm bảo đảm bộ phân loại router không bị bắt nhầm từ giả và tầng downstream không bị crash runtime.

---

## 3. Các Vùng Chưa Khảo Sát & Giả Định (Caveats)

- **Giới hạn phạm vi (Read-only):** Không có file mã nguồn router (`schemas.py`, `policy.py`, `agent.py`) hay tệp dữ liệu eval (`decisions.jsonl`) nào bị thay đổi trong quá trình thực hiện nhiệm vụ này.
- **Phân công song song:** Các nội dung về tách dòng `Row("roadmap_question")` trong `DECISION_TABLE` và mở rộng regex tiếng Việt trong `lesson_status.py` thuộc phạm vi khảo sát chuyên sâu của các peer subagent (`explorer_retry_policy` và `explorer_retry_regex_cud`). Báo cáo này tập trung vào logic phân giải đa pha của ma trận nhập nhằng và mẫu truy cập an toàn downstream.
- **Giả định:** Giả định rằng tác giả `worker_design_doc` sẽ tích hợp nguyên vẹn các đặc tả Pydantic schema và bảng Ma trận phân giải mở rộng từ tệp `report.md` vào `knowledge-sub-intents-design.md`.

---

## 4. Kết Luận (Conclusion)

Nhiệm vụ đã hoàn thành 100% mục tiêu. Các khuyến nghị và đặc tả kỹ thuật cụ thể đã được biên soạn chi tiết tại `report.md`:
1. **Đặc tả Schema Pydantic:** Bổ sung `@property sub_intent_value` và `@model_validator(mode="after") enforce_sub_intent_hierarchy` vào `IntentClassificationResult` (Mục 3.2).
2. **Đặc tả Ma trận Nhập nhằng Mở rộng:** Thay thế Mục 3.5 bằng bảng ma trận 9 cặp phân giải, đưa tiêu chí $P_3$ Target và $P_4$ Scope thành điều kiện tiên quyết trước khi sub-intent được kích hoạt, đồng thời quy chuẩn hóa thứ tự ưu tiên giữa động từ tìm kiếm và `"mấy bài"`.
3. **Đặc tả Quy Chuẩn Lập Trình Downstream:** Bổ sung 3 quy tắc vàng (Safe String Accessor, Strict Hierarchical Guarding, Fallback to Vector RAG) vào Mục 4.3 Phase 3.

---

## 5. Phương Pháp Kiểm Chứng Độc Lập (Verification Method)

Điều phối viên hoặc các chuyên gia có thể kiểm chứng độc lập báo cáo này qua các bước sau:

1. **Kiểm tra tính toàn vẹn (Zero Modification):**
   ```bash
   git status -s roadmap-rag-assistant/rag_service/domains/roadmap/router/
   git status -s roadmap-rag-assistant/evals/router/
   ```
   *Yêu cầu:* Không có bất kỳ file mã nguồn hay dữ liệu nào bị thay đổi (kết quả rỗng).

2. **Kiểm tra sự tồn tại và nội dung các file báo cáo:**
   - Báo cáo phân tích chi tiết: `.agents/teamwork/explorer_retry_false_friends/report.md`
   - Báo cáo bàn giao: `.agents/teamwork/explorer_retry_false_friends/handoff.md`

3. **Chạy kiểm thử thực nghiệm của challenger_1 và challenger_2 để xác thực hành vi đã báo cáo:**
   ```bash
   # Chạy test kiểm chứng bẫy AttributeError của challenger_1
   roadmap-rag-assistant/.venv/bin/python -m pytest .agents/teamwork/challenger_1/test_schemas_empirical.py -v
   
   # Chạy harness kiểm chứng va chạm từ giả của challenger_2
   roadmap-rag-assistant/.venv/bin/python .agents/teamwork/challenger_2/empirical_harness.py
   ```
   *Kết quả:* Xác thực 100% các quan sát về bẫy `AttributeError` và va chạm từ giả được nêu trong báo cáo.
