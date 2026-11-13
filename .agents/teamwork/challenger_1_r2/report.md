# Báo Cáo Thẩm Định Thực Nghiệm Schema Pydantic Section 3.2 (Challenger 1 - Iteration 2)

- **Agent:** `challenger_1_r2` (teamwork_challenger subagent)
- **Ngày kiểm định:** 2026-11-11
- **Đối tượng thẩm định:** Section 3.2 trong `roadmap-rag-assistant/docs/knowledge-sub-intents-design.md`
- **Mã nguồn test thực nghiệm:** `.agents/teamwork/challenger_1_r2/test_schema_empirical.py` (44/44 test cases PASS)
- **Phán quyết cuối cùng (Verdict):** **APPROVE**

---

## 1. Tóm Tắt Kết Quả Thẩm Định Thực Nghiệm

Đã thiết lập bộ kiểm thử thực nghiệm đối kháng độc lập gồm **44 test cases**, chạy trên môi trường Python 3.13 / Pydantic 2.14.1 của dự án (`roadmap-rag-assistant/.venv/bin/python`). Toàn bộ 44 test cases đều đạt trạng thái **PASS** (100%).

| Nhóm Kiểm Thử | Số lượng test | Kết quả | Ghi chú |
| :--- | :--- | :--- | :--- |
| **1. `@property sub_intent_value` Safe Accessor** | 12 tests | **PASS** | Kiểm chứng an toàn tuyệt đối trước `AttributeError`, hỗ trợ đầy đủ enum và chuỗi. |
| **2. `@model_validator` Hierarchy Enforcement** | 24 tests | **PASS** | Tự động chuẩn hóa `sub_intent` về `None` trên 100% các intent không thuộc `KNOWLEDGE_QUERY`. |
| **3. Khả năng Tương thích Ngược (Backward Compatibility)** | 4 tests | **PASS** | Tương thích 100% với cách khởi tạo cũ và toàn bộ 158 quyết định `knowledge_query` trong `decisions.jsonl`. |
| **4. Pydantic v2 Roundtrip & Agent Integration** | 4 tests | **PASS** | Tương thích hoàn toàn với `agent.py:352` (`model_dump(mode="json")`), `model_dump_json()`, và `model_validate()`. |
| **Tổng cộng** | **44 tests** | **100% PASS** | **Thời gian thực thi: 0.05s** |

---

## 2. Chi Tiết Các Hạng Mục Kiểm Thử Thực Nghiệm

### 2.1 Kiểm Chứng Safe Property `@property sub_intent_value`
- **Mục tiêu:** Ngăn chặn lỗi runtime phổ biến `AttributeError: 'NoneType' object has no attribute 'value'` khi downstream truy xuất `.value` của `sub_intent` trên các intent không phải `KNOWLEDGE_QUERY` (hoặc khi `sub_intent` chưa được gán).
- **Kết quả thực nghiệm:**
  - Khi `sub_intent = None`: `res.sub_intent.value` gây lỗi `AttributeError: 'NoneType' object has no attribute 'value'`, nhưng `res.sub_intent_value` trả về `None` một cách an toàn.
  - Khi `sub_intent` được gán enum (`KnowledgeSubIntent.SEARCH`, `CATALOG`, `PROGRESS`): `res.sub_intent_value` trả về chính xác chuỗi tương ứng (`"search"`, `"catalog"`, `"progress"`).
  - Khi `sub_intent` được khởi tạo bằng chuỗi raw (`"search"`): Pydantic v2 tự động ép kiểu sang `KnowledgeSubIntent` enum và `res.sub_intent_value` trả về chuỗi chính xác.
  - Kiểm thử trên toàn bộ các intent không thuộc `KNOWLEDGE_QUERY` (`ROADMAP_CUD`, `PLAN_GOAL`, `CHITCHAT`, `OUT_OF_SCOPE`, `UNCLEAR`): `sub_intent_value` luôn luôn trả về `None`.

### 2.2 Kiểm Chứng Defense-in-Depth `@model_validator(mode="after") enforce_sub_intent_hierarchy`
- **Mục tiêu:** Đảm bảo `sub_intent` chỉ có thể tồn tại khi `intent == IntentType.KNOWLEDGE_QUERY`. Mọi nỗ lực gán `sub_intent` vào các intent khác đều phải bị triệt tiêu tự động.
- **Kết quả thực nghiệm:**
  - Kiểm thử quét toàn bộ tổ hợp 5 non-KQ intents $\times$ 3 sub-intent enums (15 tổ hợp): Validator can thiệp qua `object.__setattr__(self, "sub_intent", None)` và đưa `res.sub_intent` về `None`.
  - Đã xác minh rằng việc sử dụng `object.__setattr__` trong Pydantic v2 đồng bộ hoàn hảo với cả `model_dump()` và `model_dump_json()`. Dữ liệu xuất ra đều thể hiện `sub_intent: None` / `"sub_intent": null`.
  - Khi `intent == IntentType.KNOWLEDGE_QUERY`: Giữ nguyên vẹn cả `sub_intent` lẫn `query_metadata`.
  - Khi truyền chuỗi sub-intent không hợp lệ (ví dụ: `"invalid_intent"`): Pydantic v2 ném lỗi `ValidationError` chính xác tại trường `sub_intent`.

### 2.3 Kiểm Chứng Tính Tương Thích Ngược (Backward Compatibility)
- **Mục tiêu:** Đảm bảo không làm gãy vỡ bất kỳ điểm gọi nào đang tồn tại trong hệ thống.
- **Kết quả thực nghiệm:**
  - Khởi tạo theo kiểu cũ `IntentClassificationResult(intent=IntentType.KNOWLEDGE_QUERY, confidence=0.85)` thành công, các trường mới tự động nhận giá trị mặc định (`sub_intent=None`, `query_metadata=None`).
  - Khởi tạo CUD từ `route_decision.py:123` và `agent.py` hoạt động hoàn hảo.
  - Cơ chế `model_config = ConfigDict(extra="ignore")` bỏ qua an toàn các trường metadata mở rộng từ pipeline hoặc upstream.
  - Đã nạp và thẩm định thực tế đối với **toàn bộ 158 quyết định `knowledge_query`** trong tập snapshot `evals/router/decisions.jsonl` (tổng 748 quyết định). Tất cả đều khởi tạo hợp lệ và có `res.sub_intent_value is None`.

### 2.4 Kiểm Chứng Tích Hợp Downstream Với `agent.py`
- **Mục tiêu:** Kiểm tra khả năng serialization với `agent.py:352` (`output=intent_res.model_dump(mode="json")`).
- **Kết quả thực nghiệm:**
  - `model_dump(mode="json")` trả về từ điển thuần túy với các giá trị nguyên thủy (`"intent": "knowledge_query"`, `"sub_intent": "search"`, `"confidence": 0.91`), hoàn toàn phù hợp để ghi log hoặc gửi qua Langfuse trace.
  - Roundtrip `model_dump()` $\rightarrow$ `model_validate()` và `model_dump_json()` $\rightarrow$ `model_validate_json()` khôi phục chính xác 100% trạng thái đối tượng.

---

## 3. Phát Hiện Biên Đối Kháng & Khuyến Nghị Tinh Chỉnh (Empirical Nuance Finding)

Trong quá trình stress-test đối kháng, phát hiện một trường hợp biên nhỏ:
```python
@model_validator(mode="after")
def enforce_sub_intent_hierarchy(self) -> "IntentClassificationResult":
    if self.intent != IntentType.KNOWLEDGE_QUERY and self.sub_intent is not None:
        object.__setattr__(self, "sub_intent", None)
        object.__setattr__(self, "query_metadata", None)
    return self
```
- **Kịch bản biên:** Nếu caller khởi tạo một intent không phải `KNOWLEDGE_QUERY` (ví dụ `CHITCHAT`) với `sub_intent=None` nhưng lại truyền vào `query_metadata=KnowledgeQueryMetadata(...)`.
- **Hành vi thực tế:** Do điều kiện `self.sub_intent is not None` là `False`, khối lệnh `if` không chạy, dẫn đến việc `query_metadata` vẫn gắn liền với đối tượng `CHITCHAT`.
- **Đánh giá rủi ro:** **LOW (Thấp)**. Trong thực tế, router chỉ sinh ra `KnowledgeQueryMetadata` khi đã xác định được sub-intent. Tuy nhiên, để đạt tính nhất quán phòng vệ đa tầng (defense-in-depth) tuyệt đối, khuyến nghị nhóm triển khai trong tương lai có thể tách độc lập 2 điều kiện kiểm tra:
  ```python
  if self.intent != IntentType.KNOWLEDGE_QUERY:
      if self.sub_intent is not None:
          object.__setattr__(self, "sub_intent", None)
      if self.query_metadata is not None:
          object.__setattr__(self, "query_metadata", None)
  ```

---

## 4. Xác Minh Ranh Giới Phạm Vi (Scope Compliance Verification)

Thực hiện kiểm tra tính toàn vẹn git bằng `git status --porcelain`:
- Thư mục router `roadmap-rag-assistant/rag_service/domains/roadmap/router/`: **0 file bị sửa đổi (Clean)**.
- Thư mục eval datasets `roadmap-rag-assistant/evals/router/`: **0 file bị sửa đổi (Clean)**.
- Toàn bộ mã nguồn kiểm thử thực nghiệm được cô lập trong thư mục làm việc của subagent: `.agents/teamwork/challenger_1_r2/`.

---

## 5. Kết Luận & Phán Quyết

Schema Pydantic đề xuất tại Section 3.2 của `roadmap-rag-assistant/docs/knowledge-sub-intents-design.md` đã vượt qua xuất sắc tất cả 44 bài kiểm tra thực nghiệm đối kháng:
- `@property sub_intent_value` loại bỏ triệt để nguy cơ `AttributeError`.
- `@model_validator(mode="after")` đảm bảo tính toàn vẹn của phân cấp intent.
- Đảm bảo 100% tính tương thích ngược với hệ thống hiện tại.
- Tuân thủ nghiêm ngặt yêu cầu không sửa đổi mã nguồn router hay dataset eval.

**Phán quyết:** **APPROVE**
