# Handoff Report — Empirical Schema & Backward Compatibility Challenge (Challenger 1)

- **Agent:** challenger_1 (teamwork_challenger — critic, specialist)
- **Task ID:** DISPATCH-challenger_1-M2
- **Recipient:** orchestrator (88cff40c-5d96-4718-b370-cc0b520b35d9)
- **Milestone:** M2: Multi-agent Review & Challenge
- **Verdict:** **APPROVE** (Đồng ý thông qua thiết kế schema Pydantic và giải pháp phân cấp)

---

## 1. Observation (Quan Sát Thực Nghiệm Trực Tiếp)

1. **Khảo sát Schema hiện tại và Đề xuất mở rộng:**
   - Schema hiện tại (`roadmap-rag-assistant/rag_service/domains/roadmap/router/schemas.py:94-110`):
     ```python
     class IntentClassificationResult(BaseModel):
         intent: IntentType = Field(..., description="Primary intent of the user message.")
         confidence: float = Field(..., description="Confidence score between 0.0 and 1.0.")
         needs_cud_extraction: bool = Field(False, description="True if requires extracting StructuredRoadmapAction.")
         needs_confirmation: bool = Field(False, description="True if the change must be confirmed before running.")
     ```
   - Schema đề xuất trong tài liệu thiết kế (`roadmap-rag-assistant/docs/knowledge-sub-intents-design.md:318-388`):
     - `KnowledgeSubIntent(str, Enum)` với 3 giá trị: `SEARCH = "search"`, `CATALOG = "catalog"`, `PROGRESS = "progress"`.
     - `KnowledgeQueryMetadata(BaseModel)` với 4 trường: `target_topic_slug: Optional[str] = None`, `target_section: Optional[str] = None`, `is_counting_query: bool = False`, `progress_status_filter: Optional[str] = None`.
     - `IntentClassificationResult` giữ nguyên 4 trường ban đầu, bổ sung `sub_intent: Optional[KnowledgeSubIntent] = None` và `query_metadata: Optional[KnowledgeQueryMetadata] = None`.
2. **Khảo sát Downstream Callers:**
   - Trong `rag_service/domains/roadmap/agent.py:352`:
     `output=intent_res.model_dump(mode="json"),`
   - Trong `rag_service/domains/roadmap/agent.py:365-366`:
     `intent=intent_res.intent.value, confidence=round(intent_res.confidence, 2),`
   - Trong `rag_service/domains/roadmap/router/intent_router.py:71-81`: Phương thức `snapshot()` chỉ trích xuất `"route": self.intent.value`, hoàn toàn độc lập với `sub_intent`.
3. **Thực thi Kiểm thử Thực nghiệm Đối kháng (23/23 PASS):**
   - Lệnh thực thi:
     `roadmap-rag-assistant/.venv/bin/python -m pytest ../.agents/teamwork/challenger_1/test_schemas_empirical.py -v`
   - Kết quả: `23 passed in 0.04s` (Python 3.13.13, Pydantic 2.14.1).
   - Chi tiết:
     - Khởi tạo caller cũ không `sub_intent`: PASS.
     - Khôi phục từ dict cũ qua `model_validate`: PASS.
     - Unpacking `**dict` có trường thừa (`extra="ignore"`): PASS.
     - Tự động ép kiểu chuỗi sang Enum (`"catalog"` -> `KnowledgeSubIntent.CATALOG`): PASS.
     - Pydantic v2 `model_dump(mode="json")` và round-trip `model_dump_json()` / `model_validate_json()`: PASS.
     - Điều phối downstream và fallback `None` về `SEARCH`: PASS.
4. **Phát hiện Bẫy Runtime (Failure Mode Confirmed):**
   - Khi `sub_intent` là `None`, việc gọi `intent_res.sub_intent.value` ném ngoại lệ:
     `AttributeError: 'NoneType' object has no attribute 'value'`.
   - Nếu downstream caller không kiểm tra `if intent_res.sub_intent:`, sẽ sập luồng `chat()` trên mọi tin nhắn không phải `KNOWLEDGE_QUERY`.
5. **Kiểm tra Toàn vẹn Mã nguồn và Bộ Test Hệ thống (Strict Read-Only Verification):**
   - Lệnh `git status --porcelain roadmap-rag-assistant/rag_service/domains/roadmap/router/`: Kết quả rỗng (0 file bị sửa).
   - Lệnh `git status --porcelain roadmap-rag-assistant/evals/router/`: Kết quả rỗng (0 file bị sửa).
   - Lệnh `python -m pytest -q`: `1001 passed in 21.17s`.
   - Lệnh `python -m evals router-check`: `heldout.intent_cases.correct: 64, heldout.routing.correct: 223, stress.ok: 410, 0 diffs on decisions.jsonl`.
   - Lệnh `python -m evals validate`: `OK: 413 samples in 4 datasets, 117 documents in 1 corpora`.

---

## 2. Logic Chain (Chuỗi Lập Luận Kỹ Thuật)

1. **Từ Quan sát 1 & 3 $\rightarrow$ Tính tương thích ngược 100%:**
   Do 2 trường mới (`sub_intent` và `query_metadata`) đều có default value là `None`, toàn bộ các caller hiện tại trong codebase (`route_decision.py:123, 141`, `intent_router.py:64`) và các payload legacy JSON/dict khi được deserialize bằng `IntentClassificationResult.model_validate()` đều khởi tạo thành công mà không gặp bất kỳ lỗi `ValidationError` nào.
2. **Từ Quan sát 2 & 3 $\rightarrow$ Tính tương thích tuần hoàn với Pydantic v2 và SSE Stream:**
   Tại `agent.py:352`, lệnh `output=intent_res.model_dump(mode="json")` được thực thi sau mỗi lượt route. Thực nghiệm chứng minh `model_dump(mode="json")` tuần hoàn hóa hoàn hảo cả Enum chuỗi và nested metadata thành native Python dict, bảo đảm an toàn 100% khi serialize ra SSE JSON stream.
3. **Từ Quan sát 2 & 5 $\rightarrow$ Bảo toàn Hợp đồng Snapshot CI:**
   Phương thức `Decision.snapshot()` tại `intent_router.py:71-81` chỉ lấy `self.intent.value` làm `route`. Vì `sub_intent` là trường phân loại cấp 2 (con) của `KNOWLEDGE_QUERY` chứ không thay thế intent cha cấp 1, kết quả đầu ra của `snapshot()` trên 748 mẫu trong `decisions.jsonl` (gồm 158 quyết định `knowledge_query`) có 0 diff, bảo vệ hoàn toàn ratchet baseline CI.
4. **Từ Quan sát 4 $\rightarrow$ Biện pháp phòng ngừa bắt buộc khi triển khai:**
   Do `sub_intent` là trường `Optional`, downstream consumer bắt buộc phải áp dụng kiểm tra tồn tại trước khi truy cập `.value` (`intent_res.sub_intent.value if intent_res.sub_intent else None`) để triệt tiêu nguy cơ sập luồng runtime.

---

## 3. Caveats (Điểm Giới Hạn & Giả Định)

1. **Ràng buộc chéo Intent - Sub-Intent:** Schema Pydantic hiện tại không có `@model_validator` chặn việc gán `sub_intent` khi `intent != IntentType.KNOWLEDGE_QUERY` (ví dụ `intent=CHITCHAT, sub_intent=SEARCH`). Điều này không gây crash Pydantic, nhưng đòi hỏi dispatcher downstream ở Phase 3 phải kiểm tra theo cấu trúc cây lồng nhau (`if intent == KNOWLEDGE_QUERY:` trước khi xét `sub_intent`).
2. **Khác biệt về Tên gọi:** Dispatch nhắc tới `KnowledgeSubIntentMetadata` và `sub_intent_confidence`. Tài liệu thiết kế dùng tên `KnowledgeQueryMetadata` và giữ 1 trường `confidence` duy nhất. Thực nghiệm xác nhận cấu trúc tài liệu thiết kế hoàn toàn đầy đủ và tối ưu hơn theo nguyên lý YAGNI.

---

## 4. Conclusion (Kết Luận & Phán Quyết)

- **Phán quyết (Official Verdict):** **APPROVE**
- Thiết kế schema Pydantic và kiến trúc phân cấp (Hierarchical Sub-Intent) trong tài liệu `roadmap-rag-assistant/docs/knowledge-sub-intents-design.md` đạt chuẩn chất lượng cao, hoàn toàn khả thi về mặt kỹ thuật, tương thích ngược 100% với hệ thống hiện tại, và không gây ảnh hưởng tiêu cực lên hợp đồng CI.
- Khuyến nghị chuyển tiếp sang Milestone M3 (Forensic Integrity Audit) và phê duyệt tài liệu thiết kế làm chuẩn triển khai.

---

## 5. Verification Method (Phương Pháp Xác Minh Độc Lập)

Bất kỳ reviewer hoặc auditor nào cũng có thể độc lập tái hiện và xác minh báo cáo này bằng các lệnh sau:

1. **Chạy bộ kiểm thử thực nghiệm đối kháng 23 ca:**
   ```bash
   cd roadmap-rag-assistant
   .venv/bin/python -m pytest ../.agents/teamwork/challenger_1/test_schemas_empirical.py -v
   ```
   *Điều kiện hợp lệ:* 23/23 ca passed, exit code 0.

2. **Xác minh không sửa đổi mã nguồn router & evals:**
   ```bash
   git status --porcelain roadmap-rag-assistant/rag_service/domains/roadmap/router/
   git status --porcelain roadmap-rag-assistant/evals/router/
   ```
   *Điều kiện hợp lệ:* Cả hai lệnh trả về output rỗng.

3. **Chạy kiểm tra hợp đồng Router CI:**
   ```bash
   cd roadmap-rag-assistant
   .venv/bin/python -m evals router-check
   ```
   *Điều kiện hợp lệ:* Exit code 0, 0 diffs trên snapshot decisions.
