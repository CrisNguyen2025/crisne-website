# Báo Cáo Thẩm Định Thực Nghiệm Đối Kháng (Empirical Adversarial Challenge Report)
## Đánh Giá Schema Pydantic, Typing, Tính Tương Thích Ngược & Tuân Thủ Ranh Giới
**Người thực hiện:** challenger_1 (teamwork_challenger — Critic & Specialist)  
**Ngày thực hiện:** 2026-11-10T10:07:00Z  
**Mục tiêu kiểm tra:** `roadmap-rag-assistant/docs/knowledge-sub-intents-design.md` (Mục 3.2, 4.1, 4.2, 4.3)  
**Phán quyết chính thức (Verdict):** **APPROVE** (Đồng ý thông qua kèm các biện pháp bảo vệ triển khai bắt buộc)

---

## 1. Tóm Tắt Đánh Giá Đối Kháng (Challenge Summary)

- **Đánh giá rủi ro tổng thể (Overall Risk Assessment):** **LOW (Rủi ro Thấp)**
- **Môi trường thực thi thực nghiệm:** Python `3.13.13`, Pydantic `2.14.1`, Pytest `9.1.1` trên macOS.
- **Kết quả kiểm thử thực nghiệm:** Đã trực tiếp xây dựng và chạy bộ kiểm thử thực nghiệm đối kháng 23 ca tại `.agents/teamwork/challenger_1/test_schemas_empirical.py`. **23/23 ca PASS (100%)**.
- **Kiểm tra tính toàn vẹn mã nguồn (Integrity Check):**
  - Số file bị sửa đổi trong `rag_service/domains/roadmap/router/`: **0 file**.
  - Số file bị sửa đổi trong `evals/router/`: **0 file**.
  - Toàn bộ test suite gốc của repo: `1001 passed in 21.17s` (`python -m pytest -q`).
  - Hợp đồng router CI hiện tại: `python -m evals router-check` $\rightarrow$ `0 regression, 158/158 snapshot decisions match 100%`.
  - Bộ dữ liệu eval: `python -m evals validate` $\rightarrow$ `OK: 413 samples in 4 datasets, 117 documents in 1 corpora`.

---

## 2. Chi Tiết Các Thách Thức Đối Kháng (Adversarial Challenges & Attack Scenarios)

### Challenge 1 (Medium): Bẫy Truy Cập Thuộc Tính Trên Đối Tượng None (`NoneType Attribute Access Trap`)
- **Giả định bị thách thức:** Các luồng xử lý downstream trong `agent.py` hoặc hệ thống logging/tracing có thể truy cập `intent_res.sub_intent.value` tương tự như `intent_res.intent.value`.
- **Kịch bản tấn công (Attack Scenario):**
  Trong `agent.py:365`, mã nguồn hiện tại đang gọi trực tiếp:
  ```python
  intent=intent_res.intent.value,
  ```
  Điều này hoạt động vì `intent` luôn là một instance của `IntentType` (bắt buộc). Tuy nhiên, trường `sub_intent: Optional[KnowledgeSubIntent] = None` có giá trị mặc định là `None` cho toàn bộ các intent khác (`CHITCHAT`, `ROADMAP_CUD`, `OUT_OF_SCOPE`...) hoặc khi chưa phân loại được sub-intent.
  Nếu một kỹ sư downstream viết:
  ```python
  sub_intent=intent_res.sub_intent.value
  ```
  Khi tin nhắn thuộc bất kỳ intent nào khác `KNOWLEDGE_QUERY` (hoặc khi `sub_intent is None`), mã nguồn sẽ **lập tức ném ngoại lệ `AttributeError: 'NoneType' object has no attribute 'value'`** và làm sập toàn bộ luồng xử lý `chat()` của agent!
- **Hậu quả & Phạm vi ảnh hưởng (Blast Radius):** Gây sập runtime SSE streaming trong `agent.py:chat()`, ảnh hưởng 100% các tin nhắn không phải `KNOWLEDGE_QUERY`.
- **Biện pháp phòng ngừa (Mitigation):**
  Trong Phase 3 khi refactor `agent.py`, bắt buộc áp dụng cú pháp an toàn:
  ```python
  sub_intent=intent_res.sub_intent.value if intent_res.sub_intent else None
  ```
  Hoặc cung cấp một property tiện ích trên `IntentClassificationResult`:
  ```python
  @property
  def sub_intent_value(self) -> Optional[str]:
      return self.sub_intent.value if self.sub_intent else None
  ```

---

### Challenge 2 (Low): Tính Nhất Quán Trạng Thái Giữa Intent Cấp 1 & Sub-Intent Cấp 2 (`Inconsistent Intent State Coupling`)
- **Giả định bị thách thức:** Schema Pydantic tự động bảo đảm `sub_intent` chỉ tồn tại khi `intent == IntentType.KNOWLEDGE_QUERY`.
- **Kịch bản tấn công (Attack Scenario):**
  Một mô hình LLM router hoặc một caller bất cẩn trả về đối tượng JSON:
  ```json
  {"intent": "chitchat", "confidence": 0.9, "sub_intent": "search"}
  ```
  Do schema `IntentClassificationResult` không khai báo `@model_validator(mode="after")` ràng buộc ngữ nghĩa chéo, Pydantic v2 cho phép đối tượng này được khởi tạo thành công mà không có lỗi `ValidationError`.
  Nếu tầng downstream kiểm tra lỏng lẻo dạng:
  ```python
  if intent_res.sub_intent == KnowledgeSubIntent.SEARCH:
      # Xử lý Vector RAG
  ```
  thay vì lồng dưới `if intent_res.intent == IntentType.KNOWLEDGE_QUERY:`, câu chào hỏi `chitchat` sẽ bị điều hướng nhầm vào bộ máy Vector RAG!
- **Hậu quả & Phạm vi ảnh hưởng (Blast Radius):** Có thể gây điều hướng sai luồng downstream nếu lập trình viên không tuân thủ cấu trúc phân cấp.
- **Biện pháp phòng ngừa (Mitigation):**
  Tài liệu thiết kế (§4.3 Phase 3) đã đặc tả đúng cấu trúc lồng nhau:
  ```python
  if intent_res.intent == IntentType.KNOWLEDGE_QUERY:
      if intent_res.sub_intent == KnowledgeSubIntent.CATALOG: ...
  ```
  Khuyến nghị trong Phase 1: Thêm một model validator nhẹ hoặc tự động reset `sub_intent = None` nếu `intent != IntentType.KNOWLEDGE_QUERY` để bảo đảm tính phòng thủ sâu (defense-in-depth).

---

### Challenge 3 (Low): Độ Rộng Kiểm Soát Điểm Tin Cậy (`Unconstrained Confidence Bounds`)
- **Giả định bị thách thức:** Giá trị `confidence` luôn nằm trong đoạn $[0.0, 1.0]$ như tài liệu mô tả.
- **Kịch bản tấn công (Attack Scenario):**
  Trường `confidence: float = Field(..., description="Confidence score between 0.0 and 1.0.")` không có cờ `ge=0.0, le=1.0`. Thực nghiệm cho thấy giá trị `1.5` hoặc `-0.5` đều được khởi tạo thành công.
- **Hậu quả & Phạm vi ảnh hưởng (Blast Radius):** Rất thấp. Đây là hành vi kế thừa 100% từ schema cũ của repo (`schemas.py:99`). Không gây lỗi runtime, nhưng có thể gây sai lệch hiển thị nếu điểm tin cậy vượt ngoài khoảng chuẩn.
- **Biện pháp phòng ngừa (Mitigation):** Duy trì như hiện tại để bảo toàn tương thích ngược, hoặc bổ sung `ge=0.0, le=1.0` khi nâng cấp nếu toàn bộ router nội bộ đã chuẩn hóa output.

---

### Challenge 4 (Informational): Đối Chiếu `KnowledgeQueryMetadata` vs `KnowledgeSubIntentMetadata` & `sub_intent_confidence`
- **Giả định bị thách thức (từ Dispatch Orchestrator):** Dispatch đề cập đến `KnowledgeSubIntentMetadata` và `sub_intent_confidence`.
- **Thực tế kiểm tra:**
  1. Trong tài liệu thiết kế (§3.2), class được đặt tên là `KnowledgeQueryMetadata`. Cấu trúc bao gồm: `target_topic_slug`, `target_section`, `is_counting_query`, `progress_status_filter`.
  2. Trường `sub_intent_confidence` không xuất hiện trong tài liệu thiết kế. Tài liệu sử dụng trường `confidence: float` chung duy nhất của quyết định định tuyến.
  3. **Thực nghiệm biến thể:** Bộ test thực nghiệm đã tạo class `VariantIntentClassificationResult` có `sub_intent_confidence: Optional[float] = None` và kiểm thử:
     - Nếu có `sub_intent_confidence`: Hoàn toàn tương thích ngược, mặc định `None`.
     - Tuy nhiên, việc giữ nguyên 1 trường `confidence` duy nhất như tài liệu là quyết định đúng đắn theo nguyên lý YAGNI (Bảng chính sách $P_5$ quyết định intent và sub-intent cùng lúc theo từng dòng luật).

---

## 3. Bảng Kết Quả Kiểm Thử Thực Nghiệm Đối Kháng (Stress Test Results)

Bộ kiểm thử được viết và thực thi trực tiếp tại:  
`.agents/teamwork/challenger_1/test_schemas_empirical.py`  
Lệnh chạy: `roadmap-rag-assistant/.venv/bin/python -m pytest ../.agents/teamwork/challenger_1/test_schemas_empirical.py -v`

| STT | Kịch Bản Kiểm Thử Thực Nghiệm (Scenario) | Kết Quả Mong Đợi (Expected) | Kết Quả Thực Tế (Actual) | Trạng Thái (Verdict) |
|---|---|---|---|---|
| 1 | Khởi tạo caller cũ không truyền `sub_intent` (pattern `route_decision.py:141`) | Khởi tạo thành công, `sub_intent=None`, `query_metadata=None` | Khởi tạo hợp lệ, default chính xác | **PASS** |
| 2 | Khởi tạo caller CUD cũ (`needs_cud_extraction=True`) | Khởi tạo thành công, giữ nguyên các cờ CUD | Khởi tạo hợp lệ, các cờ không đổi | **PASS** |
| 3 | Khôi phục từ dictionary cũ qua `model_validate({"intent": "knowledge_query", "confidence": 0.85})` | Deserialization thành công | Hợp lệ, trường mới nhận default | **PASS** |
| 4 | Truy cập và đối chiếu các thuộc tính kế thừa (`.intent`, `.confidence`, `.needs_cud_extraction`) | Giữ nguyên 100% type và giá trị so với baseline cũ | Đồng nhất 100% với baseline | **PASS** |
| 5 | Kiểm tra giá trị mặc định của toàn bộ các trường mở rộng | `sub_intent=None`, `query_metadata=None`, cờ False | Khớp hoàn toàn đặc tả | **PASS** |
| 6 | Truyền tường minh `sub_intent=None` vs không truyền | Đồng nhất về dữ liệu và `model_dump()` | Giống nhau tuyệt đối | **PASS** |
| 7 | Giá trị mặc định và None handling của `KnowledgeQueryMetadata` | `target_topic_slug=None`, `is_counting_query=False` | Khớp hoàn toàn đặc tả | **PASS** |
| 8 | Bẫy truy cập `.sub_intent.value` khi `sub_intent is None` | Ném `AttributeError` (Cảnh báo bẫy downstream) | Đã bắt đúng ngoại lệ, xác nhận bẫy | **PASS** |
| 9 | Thiếu trường bắt buộc (`intent` hoặc `confidence`) | Ném `pydantic.ValidationError` | Bắt đúng `ValidationError` cho cả 2 trường | **PASS** |
| 10 | Giá trị `intent` không hợp lệ (`"invalid_intent"`) | Ném `pydantic.ValidationError` | Bắt đúng `ValidationError` | **PASS** |
| 11 | Giá trị `sub_intent` không hợp lệ (`"vector_rag"`) | Ném `pydantic.ValidationError` | Bắt đúng `ValidationError` | **PASS** |
| 12 | Tự động ép kiểu chuỗi sang Enum (`"knowledge_query"` $\rightarrow$ Enum, `"catalog"` $\rightarrow$ Enum) | Tự động convert thành enum member | Ép kiểu thành công sang `Enum` chuẩn | **PASS** |
| 13 | Kiểm tra giới hạn điểm `confidence` khi truyền giá trị ngoài khoảng (1.5, -0.5) | Phát hiện unconstrained bound (kế thừa từ code cũ) | Ghi nhận hành vi kế thừa | **PASS** |
| 14 | Khởi tạo trạng thái không nhất quán (`CHITCHAT` + `sub_intent="search"`) | Cho phép khởi tạo nếu không có validator | Ghi nhận cần guard ở dispatcher | **PASS** |
| 15 | Unpacking dictionary tiêu chuẩn `IntentClassificationResult(**dict)` | Khởi tạo hợp lệ | Khởi tạo thành công | **PASS** |
| 16 | Unpacking dictionary có lồng raw dict cho `query_metadata` | Tự động ép kiểu nested dict thành `KnowledgeQueryMetadata` | Ép kiểu nested model hoàn hảo | **PASS** |
| 17 | Unpacking dictionary chứa các trường rác/thừa (`extra="ignore"`) | Bỏ qua trường thừa, không gây crash | Bỏ qua hoàn toàn, an toàn IPC | **PASS** |
| 18 | Xuất dữ liệu qua `model_dump()` và `model_dump(mode="json")` (dùng ở `agent.py:352`) | JSON serializable, enum chuyển thành raw string | Xuất JSON chuẩn xác 100% | **PASS** |
| 19 | Xuất dữ liệu với cờ `exclude_none=True` | Loại bỏ các trường `sub_intent`, `query_metadata` khi là None | Loại bỏ sạch sẽ, rút gọn payload | **PASS** |
| 20 | Chu trình tuần hoàn Round-trip: `model -> model_dump_json() -> model_validate_json()` | Khôi phục chính xác 100% đối tượng ban đầu | Khôi phục trùng khớp hoàn toàn | **PASS** |
| 21 | Mô phỏng bộ điều phối downstream `agent.py` cho cả 3 nhánh và fallback `None` | Điều hướng chính xác theo sub_intent, fallback về RAG khi None | 5/5 nhánh điều hướng chuẩn xác | **PASS** |
| 22 | Mô phỏng hợp đồng snapshot `evals/router/decisions.jsonl` | `sub_intent` không rò rỉ vào `snapshot()`, 0 diff snapshot | 0 diff so với hợp đồng snapshot | **PASS** |
| 23 | Thử nghiệm biến thể có `sub_intent_confidence` (theo giả thuyết orchestrator) | Tương thích ngược, default None khi không truyền | Tương thích ngược hoàn toàn | **PASS** |

---

## 4. Xác Minh Toàn Vẹn Không Sửa Đổi Mã Nguồn (Strict Zero-Modification Check)

Đã thực thi kiểm tra lệnh git độc lập:
1. `git status --porcelain roadmap-rag-assistant/rag_service/domains/roadmap/router/`: **Rỗng (0 file bị chạm)**.
2. `git status --porcelain roadmap-rag-assistant/evals/router/`: **Rỗng (0 file bị chạm)**.
3. `git status --porcelain roadmap-rag-assistant/`: Chỉ có tài liệu thiết kế mới `roadmap-rag-assistant/docs/knowledge-sub-intents-design.md`.
4. Không có bất kỳ thay đổi nào vi phạm quy tắc an toàn.

---

## 5. Kết Luận & Phán Quyết (Conclusion & Official Verdict)

- **Phán quyết chính thức:** **APPROVE (ĐỒNG Ý THÔNG QUA)**
- **Căn cứ luận chứng kỹ thuật:**
  1. Thiết kế phân cấp (Hierarchical Sub-Intent) giữ `IntentType.KNOWLEDGE_QUERY` ở cấp 1 và bổ sung `sub_intent: Optional[KnowledgeSubIntent] = None` ở cấp 2 là giải pháp kỹ thuật tối ưu nhất, giải quyết triệt để vấn đề xung đột downstream mà không làm vỡ dù chỉ 1 quyết định kiểm thử CI hiện tại.
  2. Toàn bộ 23 ca thử nghiệm thực nghiệm đối kháng về tương thích ngược, None handling, dict unpacking, và Pydantic v2 serialization đều đạt 100% tỷ lệ thành công.
  3. Các rủi ro tiềm ẩn (bẫy `AttributeError` khi gọi `.value` trên None, ghép nối intent không nhất quán) đã được làm rõ nguyên nhân gốc rễ và có biện pháp khắc phục cụ thể cho các giai đoạn lập trình tiếp theo.
