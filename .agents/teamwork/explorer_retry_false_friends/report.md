# Báo Cáo Phân Tích & Đặc Tả Kỹ Thuật: Khử Va Chạm Từ Giả (False Friends) & Chuẩn Hóa Mẫu Truy Cập An Toàn Cho Sub-Intent

- **Người thực hiện:** `explorer_retry_false_friends` (Teamwork Explorer — Investigator & Synthesizer)
- **Ngày thực hiện:** 2026-11-10
- **Nhiệm vụ:** Phân tích các phát hiện thực nghiệm của `challenger_2` (về va chạm từ giả: `"tiến độ"`, `"mấy bài"`) và `challenger_1` (về bẫy truy cập `sub_intent.value` trên đối tượng `None`), từ đó đề xuất đặc tả kỹ thuật chi tiết để bổ sung vào tài liệu thiết kế kiến trúc `roadmap-rag-assistant/docs/knowledge-sub-intents-design.md`.
- **Tài liệu và mã nguồn tham chiếu:**
  - Báo cáo phản biện của `challenger_2`: `.agents/teamwork/challenger_2/report.md`
  - Báo cáo phản biện của `challenger_1`: `.agents/teamwork/challenger_1/report.md`
  - Tài liệu thiết kế hiện tại: `roadmap-rag-assistant/docs/knowledge-sub-intents-design.md`
  - Đường ống router 10 pha: `roadmap-rag-assistant/docs/routing-phases.md`
  - Mã nguồn Router:
    - `rag_service/domains/roadmap/router/understanding.py` (P1 Act, P3 Target)
    - `rag_service/domains/roadmap/router/scope.py` (P4 Scope)
    - `rag_service/domains/roadmap/router/route_decision.py` (Scope router & write gate)
    - `rag_service/domains/roadmap/router/policy.py` (P5 Decision Table & CUD verbs)
    - `rag_service/domains/roadmap/router/schemas.py` (Pydantic contracts)
    - `rag_service/domains/roadmap/lesson_status.py` (ADR-0010 recognition & cues)
    - `rag_service/domains/roadmap/agent.py` (Downstream execution, SSE streaming & tracing)

---

## 1. Tóm Tắt Điều Hành & Phát Hiện Trọng Yếu (Executive Summary)

Sau khi đối chiếu sâu sắc giữa kết quả thử nghiệm thực nghiệm đối kháng của hai Challenger và cấu trúc mã nguồn hiện tại của Abot, `explorer_retry_false_friends` xác nhận:

1. **Hiện Tượng Va Chạm Từ Giả (False Friends Collisions) Là Có Thật & Gây Lỗi Nghiêm Trọng:**
   - **Va chạm `"tiến độ"` ngoài domain:** Trong `lesson_status.py:160`, cụm `tien\s+do` đứng một mình trong regex `_KNOWN_CUE`. Bất kỳ câu hỏi kinh tế, xã hội hoặc dự án đời sống nào (ví dụ: *"tiến độ giải ngân vốn đầu tư công"*) đều bị bắt nhầm thành câu hỏi tiến độ bài học. Khi chuyển sang kiến trúc sub-intent, nếu không có cơ chế chặn tầng $P_3$ (Target) và $P_4$ (Scope), câu hỏi ngoại lai này sẽ bị gán nhãn `KNOWLEDGE_QUERY/PROGRESS`, khiến Abot tự động in ra danh sách bài học của Owner thay vì trả về `OUT_OF_SCOPE`!
   - **Va chạm đa nghĩa từ `"mấy bài"` trong tiếng Việt:** Cụm từ `"mấy bài"` vừa có thể là từ để hỏi số lượng (interrogative quantifier $\rightarrow$ `CATALOG`), vừa có thể là danh từ chỉ lượng không xác định ("vài bài", "một số bài" trong câu yêu cầu tìm kiếm $\rightarrow$ `SEARCH`). Việc nhận diện thô dựa vào cụm từ mà không phân tích động từ hành động ($P_1$) khiến câu hỏi *"tìm giúp mấy bài về authentication"* bị ép sang nhánh `CATALOG` đếm bài, làm tê liệt khả năng tìm kiếm nội dung qua Vector RAG.
   - **Va chạm câu hỏi định hướng đời sống:** Cụm *"học gì tiếp theo sau khi tốt nghiệp cấp 3"* bị `_NEXT_CUE` nhận diện nhầm là truy vấn bài học tiếp theo của roadmap.
2. **Bẫy Thuộc Tính `NoneType` (`AttributeError`) Trong Luồng Downstream Gây Sập SSE:**
   - Trường `sub_intent: Optional[KnowledgeSubIntent] = None` có giá trị `None` cho toàn bộ các intent khác (`CHITCHAT`, `ROADMAP_CUD`, `PLAN_GOAL`, `OUT_OF_SCOPE`...).
   - Trong `agent.py:365` (`step_event`) và `agent.py:377` (`trace.flags`), mã nguồn hiện gọi trực tiếp `intent=intent_res.intent.value`. Nếu một kỹ sư downstream gọi tương tự `intent_res.sub_intent.value`, hệ thống sẽ ném `AttributeError: 'NoneType' object has no attribute 'value'`, làm đứt gãy tức thì generator SSE streaming và sập cuộc hội thoại của người dùng!
   - Ngoài ra, việc thiếu ràng buộc trạng thái chéo có thể dẫn đến hiện tượng ghép nối lỏng lẻo (`CHITCHAT` mang `sub_intent="search"`), gây nguy cơ điều hướng sai nếu downstream không kiểm tra theo thứ bậc (hierarchical guarding).

Để khắc phục triệt để các rủi ro trên, báo cáo này đưa ra **2 nhóm đặc tả kỹ thuật chi tiết** để cập nhật trực tiếp vào `roadmap-rag-assistant/docs/knowledge-sub-intents-design.md`.

---

## 2. Phân Tích Cơ Chế Gốc Rễ Của Các Va Chạm & Bẫy Kỹ Thuật

### 2.1 Va Chạm Từ Giả 1: `"tiến độ"` (External Progress vs Learning Progress)

#### Cơ Chế Phát Sinh Lỗi Trong Code Hiện Tại
- Tại `rag_service/domains/roadmap/lesson_status.py:160`:
  ```python
  _KNOWN_CUE = re.compile(
      r"\b(?:dang\s+biet\s+gi|da\s+biet\s+gi|da\s+nam\s+gi|da\s+nam\s+nhung\s+gi|nam\s+nhung\s+gi|biet\s+nhung\s+gi|da\s+hoc\s+nhung\s+gi|da\s+hoc\s+gi|tien\s+do\s+hoc|tien\s+do)\b"
  )
  ```
- Biểu thức chính quy này chứa token `tien\s+do` đứng độc lập.
- Khi người dùng gửi câu hỏi:
  > *"Tiến độ giải ngân vốn đầu tư công hiện nay thế nào?"*
  1. Hàm `asks_what_i_know()` tại `lesson_status.py:181` kiểm tra `_KNOWN_CUE.search(flat)` $\rightarrow$ Trả về `True`.
  2. Ở kiến trúc hiện tại, hàm `handle_lesson_status` được gọi trước router tại `agent.py:306`. Nếu người dùng là Owner, Abot sẽ lọc các bài học `known` và in ra câu trả lời: *"🧠 Tiến độ học tập về topic ...: Đã nắm: Chưa có bài nào."* hoàn toàn vô nghĩa và lệch lạc!
  3. Ở kiến trúc đề xuất (Phase 1 hoặc Phase 3), nếu router bắt `sub_intent=PROGRESS` qua từ khóa `"tiến độ"` mà không kiểm tra đối tượng roadmap, câu hỏi kinh tế này sẽ bị gán nhãn `KNOWLEDGE_QUERY / PROGRESS` thay vì bị chặn lại ở $P_4$ là `OUT_OF_SCOPE`!

#### Cơ Chế Đa Pha $P_0 - P_4$ Cần Áp Dụng Để Phân Giải
Trong đường ống 10 pha chuẩn (`routing-phases.md`):
- **P0 (Clean & Focus):** Tách từ khóa trọng tâm `focus = "giải ngân vốn đầu tư công"`.
- **P1 (SpeechAct):** Nhận diện hành vi `question`.
- **P3 (Target Disambiguation):** Kiểm tra `has_object = _has_any(ENTITY_PATTERNS, ...)`. Cụm từ trên hoàn toàn không chứa thực thể roadmap nào $\rightarrow$ `Target.NONE`.
- **P4 (Scope Gate):** Gọi `scope = await scope_fn(content)`. Khi so sánh vector nhúng với centroid lộ trình, khoảng cách ngữ nghĩa nằm dưới ngưỡng `gap_min - band` $\rightarrow$ `Scope.EXTERNAL`.
- **Nguyên tắc phân giải đa pha:** 
  > **Bất biến kiến trúc:** Một câu hỏi chỉ được phép kích hoạt `KNOWLEDGE_QUERY` (và kéo theo `sub_intent`) khi và chỉ khi:
  > 1. $P_3$ Target không phải là `Target.OFF_TOPIC`.
  > 2. $P_4$ Scope thuộc `Scope.ROADMAP` hoặc `Scope.DOMAIN_GAP`.
  > Nếu $P_4$ Scope là `Scope.EXTERNAL`, tin nhắn **bắt buộc phải định tuyến về `IntentType.OUT_OF_SCOPE`** tại `route_decision.py:136`, tuyệt đối không cho phép bất kỳ sub-intent nào của tri thức được kích hoạt!
  > Đồng thời, ở tầng từ vựng, từ `"tiến độ"` phải được ghép chặt với ngữ cảnh học tập (`"tiến độ học"`, `"tiến độ của tôi"`, `"tiến độ roadmap"`).

---

### 2.2 Va Chạm Từ Giả 2: `"mấy bài"` (Indefinite Search vs Counting Query)

#### Cơ Chế Phát Sinh Lỗi Trong Tiếng Việt
Trong ngữ pháp tiếng Việt:
1. **Chức năng Hỏi Số Lượng (Interrogative Quantifier):**
   - *"Topic AI có mấy bài?"* $\rightarrow$ Câu hỏi định lượng cấu trúc cây.
   - Trọng tâm câu: Tìm số lượng thực thể bài học trong danh mục $\rightarrow$ `CATALOG_QUERY` (`is_counting_query=True`).
2. **Chức năng Đại Từ Chỉ Lượng Không Xác Định (Indefinite Quantifier Phrase = "vài bài / một số bài"):**
   - *"Tìm giúp mấy bài về authentication"*
   - *"Cho mình xin mấy bài hay về Docker"*
   - *"Tìm mấy bài giải thích cơ chế chunking"*
   - Ở đây, `"mấy bài"` mang nghĩa "a few lessons / some lessons", tương đương với "các bài viết".
   - Hành động chính của người dùng là **TÌM KIẾM NỘI DUNG** (`"tìm"`, `"kiếm"`, `"cho xin"`, `"tra cứu"`), đối tượng nội dung là khái niệm kỹ thuật ("authentication", "Docker", "chunking").

#### Hậu Quả Kỹ Thuật Khi Phân Loại Sai
- Nếu bộ nhận diện sub-intent chỉ quét thô cụm từ `mấy bài` (hoặc `COUNTING_CUE` trong `sections.py`) để gán `sub_intent = KnowledgeSubIntent.CATALOG`:
  1. Truy vấn *"tìm giúp mấy bài về authentication"* bị gửi vào hàm `handle_sections` hoặc `commands.py:handle_listing`.
  2. Hệ thống in-memory catalog chỉ biết đếm tổng số bài trong topic, không thể tìm kiếm ngữ nghĩa theo nội dung "authentication".
  3. Kết quả: Abot trả về danh sách toàn bộ các bài trong topic hoặc báo lỗi "Không tìm thấy section...", hoàn toàn đánh mất nội dung giải thích mà người dùng yêu cầu!

#### Tiêu Chí Phân Giải Đa Pha ($P_0 / P_1$)
- **Kiểm tra động từ hành động ($P_1$):**
  - Nếu câu chứa động từ tìm kiếm thuộc `SEARCH_WORDS` (`"tìm"`, `"kiếm"`, `"tra cứu"`, `"search"`, `"cho xin"`, `"cần đọc"`) đứng trước cụm `"mấy bài"`, thì `"mấy bài"` đóng vai trò bổ ngữ danh từ cho hành động tìm kiếm $\rightarrow$ Bắt buộc phân loại là `KNOWLEDGE_SEARCH` (`sub_intent = KnowledgeSubIntent.SEARCH`). Thuộc tính `is_counting_query` trong metadata phải được gán là `False`.
  - Chỉ khi câu hỏi mang cấu trúc nghi vấn đếm: có từ `"có mấy bài"`, `"bao nhiêu bài"`, hoặc kết thúc bằng câu hỏi đuôi `"mấy bài?"` mà **KHÔNG** chứa động từ tìm kiếm nội dung $\rightarrow$ Mới phân loại là `CATALOG_QUERY` (`sub_intent = KnowledgeSubIntent.CATALOG`) và gán `is_counting_query = True`.

---

### 2.3 Va Chạm Từ Giả 3: `"học gì tiếp"` (Career/Life Advice vs Roadmap Progress)

- Câu hỏi: *"Học gì tiếp theo sau khi tốt nghiệp cấp 3?"* hoặc *"Học gì tiếp để kiếm được việc làm năm 2026?"*.
- Đây là câu hỏi tư vấn hướng nghiệp/đời sống.
- Tiêu chí đa pha phân giải:
  - $P_3$ Target: Câu hỏi không nhắc đến bài học, topic hay ngữ cảnh trang hiện tại (`Target.NONE` hoặc `Target.OFF_TOPIC`).
  - $P_4$ Scope: Phạm vi giáo dục phổ thông/hướng nghiệp ngoài đời sống rơi vào `Scope.EXTERNAL`.
  - Kết quả đúng: Phải bị chặn thành `IntentType.OUT_OF_SCOPE` (hoặc chuyển sang `PLAN_GOAL` nếu là tư vấn lộ trình học lập trình mở), không bao giờ được kích hoạt `KNOWLEDGE_QUERY/PROGRESS`.

---

### 2.4 Bẫy Thuộc Tính `NoneType` (`AttributeError`) Trong Luồng Downstream

#### Cơ Chế Phát Sinh Lỗi Tại `agent.py`
Mã nguồn hiện tại trong `rag_service/domains/roadmap/agent.py`:
- Dòng 365:
  ```python
  yield step_event(
      "route",
      "routing",
      "done",
      intent=intent_res.intent.value,
      confidence=round(intent_res.confidence, 2),
      ...
  )
  ```
- Dòng 377:
  ```python
  if (trace := current_trace()) is not None:
      trace.flags["intent"] = intent_res.intent.value
  ```
- Đối với `intent`, giá trị luôn là một thành viên của `IntentType` enum, do đó `.value` luôn an toàn.
- Tuy nhiên, `sub_intent` là `Optional[KnowledgeSubIntent] = None`.
  - Khi tin nhắn là `CHITCHAT` (ví dụ: *"Chào bạn"*): `intent_res.intent = IntentType.CHITCHAT`, `intent_res.sub_intent = None`.
  - Khi tin nhắn là `ROADMAP_CUD` (ví dụ: *"Xóa topic này"*): `intent_res.sub_intent = None`.
  - Khi tin nhắn là `OUT_OF_SCOPE` (ví dụ: *"Thời tiết hôm nay thế nào"*): `intent_res.sub_intent = None`.
- Nếu lập trình viên downstream thêm trường `sub_intent` vào sự kiện streaming hoặc tracing theo cách:
  ```python
  sub_intent=intent_res.sub_intent.value  # ❌ NGUY HIỂM: Ném AttributeError!
  ```
  Thì ngay khi `intent_res.sub_intent is None`, Python sẽ ném ngoại lệ:
  `AttributeError: 'NoneType' object has no attribute 'value'`.
- Vì `agent.py:chat()` là một hàm `async generator` (phục vụ Server-Sent Events - SSE), việc ném ngoại lệ chưa được xử lý tại đây sẽ **ngay lập tức hủy bỏ kết nối stream**, khiến giao diện người dùng hiển thị lỗi "Lỗi kết nối máy chủ" và làm sập 100% các cuộc hội thoại không phải `KNOWLEDGE_QUERY`!

#### Rủi Ro Ghép Nối Trạng Thái Không Nhất Quán (Inconsistent State Coupling)
- Nếu một LLM router hoặc mock test trả về JSON:
  `{"intent": "chitchat", "confidence": 0.9, "sub_intent": "search"}`
- Nếu mã nguồn downstream kiểm tra phẳng không theo thứ bậc:
  ```python
  # ❌ SAI: Kiểm tra phẳng sub_intent mà không bảo vệ bằng intent cha
  if intent_res.sub_intent == KnowledgeSubIntent.SEARCH:
      # Thực thi Vector RAG!
  ```
  Thì câu chào hỏi `chitchat` sẽ bị kéo vào bộ máy Vector RAG nặng nề, gây lãng phí tài nguyên và phản hồi sai nghiệp vụ.

---

## 3. Đặc Tả Kỹ Thuật Đề Xuất Cập Nhật Vào `knowledge-sub-intents-design.md`

Dưới đây là các phần nội dung kỹ thuật hoàn chỉnh, chuẩn xác, sẵn sàng để tích hợp vào tài liệu thiết kế.

### 3.1 Mở Rộng Schema Pydantic Với Safe Accessor & Model Validator (Mục 3.2)

Cần cập nhật Mục 3.2 của tài liệu thiết kế để bổ sung:
1. Thuộc tính tiện ích `@property sub_intent_value` trả về `Optional[str]`.
2. Validator `@model_validator(mode="after")` tự động làm sạch trạng thái không nhất quán giữa `intent` và `sub_intent`.

#### Đặc Tả Code Cần Bổ Sung:
```python
class IntentClassificationResult(BaseModel):
    """Result contract of the Intent Router."""
    model_config = ConfigDict(extra="ignore")

    intent: IntentType = Field(
        ...,
        description="Primary intent of the user message."
    )
    confidence: float = Field(
        ...,
        description="Confidence score between 0.0 and 1.0."
    )
    sub_intent: Optional[KnowledgeSubIntent] = Field(
        None,
        description=(
            "Granular sub-intent when intent == IntentType.KNOWLEDGE_QUERY. "
            "Dictates downstream execution: SEARCH (Vector RAG), CATALOG (RAM metadata), or PROGRESS (ADR-0010)."
        )
    )
    query_metadata: Optional[KnowledgeQueryMetadata] = Field(
        None,
        description="Optional structured parameters extracted during classification."
    )
    needs_cud_extraction: bool = Field(
        False,
        description="True if the message requires extracting StructuredRoadmapAction."
    )
    needs_confirmation: bool = Field(
        False,
        description="True if the change is asked politely or on a condition and must be confirmed before it runs."
    )

    @property
    def sub_intent_value(self) -> Optional[str]:
        """Safe accessor returning string value of sub_intent or None if not set.
        
        Prevents AttributeError: 'NoneType' object has no attribute 'value'
        when sub_intent is None across non-KNOWLEDGE_QUERY intents.
        """
        return self.sub_intent.value if self.sub_intent is not None else None

    @model_validator(mode="after")
    def enforce_sub_intent_hierarchy(self) -> "IntentClassificationResult":
        """Defense-in-depth: Ensure sub_intent only exists when intent == KNOWLEDGE_QUERY.
        
        If intent is CHITCHAT, ROADMAP_CUD, PLAN_GOAL, or OUT_OF_SCOPE, sub_intent is
        automatically normalized to None, preventing inconsistent state coupling.
        """
        if self.intent != IntentType.KNOWLEDGE_QUERY and self.sub_intent is not None:
            object.__setattr__(self, "sub_intent", None)
            object.__setattr__(self, "query_metadata", None)
        return self
```

---

### 3.2 Mở Rộng Ma Trận Nhập Nhằng & Tiêu Chí Phân Giải Đa Pha (Mục 3.5)

Cần thay thế bảng ma trận hiện tại ở Mục 3.5 bằng **Bảng Ma Trận Phân Giải Nhập Nhằng Mở Rộng (Extended Ambiguity Disambiguation Matrix)** với đầy đủ các mục va chạm từ giả và quy trình phân giải đa pha:

#### Bảng Ma Trận Phân Giải Nhập Nhằng Mở Rộng

| Cặp Xung Đột & Va Chạm Từ Giả | Ví Dụ Mơ Hồ / Tranh Chấp | Phân Loại Cấp 1 & Sub-Intent Đúng | Nguyên Nhân Gốc Rễ Xung Đột | Tiêu Chí Phân Giải Đa Pha ($P_0 - P_4$) & Biện Pháp Phòng Ngừa |
| :--- | :--- | :--- | :--- | :--- |
| **False Friend 1: Tiến độ ngoài domain vs Tiến độ học tập** | - *"Tiến độ giải ngân vốn đầu tư công hiện nay thế nào"*<br>- *"Tiến độ học tập của tôi trong roadmap AI đến đâu rồi"* | - Câu 1: `OUT_OF_SCOPE` (`sub_intent=None`)<br>- Câu 2: `KNOWLEDGE_QUERY` (`sub_intent=PROGRESS`) | Cùng chứa danh từ đa nghĩa `"tiến độ"`. Câu 1 thuộc lĩnh vực kinh tế vĩ mô; Câu 2 thuộc quản lý bài học cá nhân. | **Chốt chặn đa pha $P_3$ Target & $P_4$ Scope:**<br>1. Tại $P_3$: Câu 1 không có thực thể roadmap (`Target.NONE`).<br>2. Tại $P_4$: Khoảng cách vector của câu 1 với roadmap centroid $< gap\_min$ $\rightarrow$ Gán `Scope.EXTERNAL`.<br>3. **Luật cưỡng chế:** Khi `Scope == EXTERNAL`, router chuyển thẳng sang `IntentType.OUT_OF_SCOPE`, triệt tiêu hoàn toàn khả năng rơi vào sub-intent.<br>4. Đồng thời, tinh chỉnh regex: Không để `"tiến độ"` đứng đơn độc, bắt buộc phải là cụm từ ghép (`"tiến độ học"`, `"tiến độ của tôi"`). |
| **False Friend 2: "Mấy bài" tìm kiếm vs "Mấy bài" đếm mục lục** | - *"Tìm giúp mấy bài về authentication và JWT"*<br>- *"Topic AI Engineering có mấy bài học tất cả"* | - Câu 1: `KNOWLEDGE_QUERY` (`sub_intent=SEARCH`, `is_counting=False`)<br>- Câu 2: `KNOWLEDGE_QUERY` (`sub_intent=CATALOG`, `is_counting=True`) | Cụm từ `"mấy bài"` trong tiếng Việt có 2 chức năng: (1) Đại từ chỉ lượng không xác định ("vài bài"), (2) Đại từ nghi vấn hỏi số lượng. | **Phân giải qua SpeechAct ($P_1$) & Động từ tìm kiếm:**<br>1. Nếu câu chứa động từ tìm kiếm thuộc `SEARCH_WORDS` (`"tìm"`, `"kiếm"`, `"tra cứu"`, `"cho xin"`) đi kèm `"mấy bài"` $\rightarrow$ Ưu tiên tuyệt đối `SEARCH` (Vector RAG). Cờ `is_counting_query = False`.<br>2. Chỉ gán `CATALOG` khi câu có cấu trúc nghi vấn đếm thuần túy (`"có mấy"`, `"bao nhiêu"`) mà **KHÔNG** có động từ tra cứu nội dung. |
| **False Friend 3: Định hướng học đời sống vs Tiến độ bài học tiếp theo** | - *"Học gì tiếp theo sau khi tốt nghiệp cấp 3"*<br>- *"Hôm nay tôi nên học bài gì tiếp theo trong roadmap"* | - Câu 1: `OUT_OF_SCOPE` (`sub_intent=None`)<br>- Câu 2: `KNOWLEDGE_QUERY` (`sub_intent=PROGRESS`) | Cùng khớp cụm từ `"học gì tiếp theo"`. Câu 1 hỏi tư vấn cuộc sống/hướng nghiệp; Câu 2 hỏi gợi ý bài học ADR-0010. | **Kiểm tra ngữ cảnh đối tượng ($P_3$ Target):**<br>1. Câu 1 hướng ra môi trường giáo dục ngoài (`Target.OFF_TOPIC` hoặc `Scope.EXTERNAL`) $\rightarrow$ Bị chặn thành `OUT_OF_SCOPE`.<br>2. `sub_intent=PROGRESS` chỉ được kích hoạt khi câu hỏi liên quan đến lộ trình kỹ thuật hiện hành và người dùng có thẩm quyền Owner (`is_owner() == True`). |
| **False Friend 4: Lệnh đổi trạng thái vs Truy vấn trạng thái** | - *"Đánh dấu bài Docker Compose là đang học"*<br>- *"Bài Docker Compose tôi đã nắm chưa"* | - Câu 1: `ROADMAP_CUD` (`sub_intent=None`, `write="confirm"`)<br>- Câu 2: `KNOWLEDGE_QUERY` (`sub_intent=PROGRESS`) | Cùng nhắc đến tên bài học và trạng thái học tập (`"đang học"`, `"đã nắm"`). | **Phân định qua SpeechAct ($P_1$) & Động từ đột biến:**<br>1. Câu 1 chứa động từ hành động (`"đánh dấu"`, `"chuyển"`, `SpeechAct.COMMAND`) $\rightarrow$ Chuyển sang `ROADMAP_CUD` và bật thẻ Preview xác nhận 2 bước.<br>2. Bất biến kiến trúc: Toàn bộ các nhánh con của `KNOWLEDGE_QUERY` là **THUẦN ĐỌC (Read-Only)**, không bao giờ thực hiện ghi dữ liệu. |
| **False Friend 5: Tin nhắn kết hợp đa ý định (Multi-Intent)** | - *"Giải thích RAG là gì và cho tôi xem danh sách topic"*<br>- *"Topic AI có mấy bài và giải thích bài đầu tiên"* | - Cả 2 câu: `KNOWLEDGE_QUERY` (`sub_intent=SEARCH`) | Kết hợp giữa nhu cầu đào sâu khái niệm (Search) và xem cấu trúc (Catalog) trong cùng một lượt thoại. | **Nguyên tắc ưu tiên tài nguyên & Trải nghiệm (Failure Mode Prevention):**<br>1. Nếu ép về `CATALOG`, mô hình sẽ chỉ trả về danh sách in-memory và bỏ rơi hoàn toàn phần giải thích chuyên sâu (gây ức chế cho người dùng).<br>2. **Quy tắc giải quyết:** Khi câu hỏi kết hợp Search + Catalog, router ưu tiên gán `sub_intent=SEARCH` (Vector RAG). Bộ RAG có đủ ngữ cảnh tài liệu để vừa giải thích khái niệm vừa bao quát thông tin bài học. |
| **Catalog vs Search (Vị trí vs Nguyên lý)** | - *"Bài Semantic Caching nằm ở đâu"*<br>- *"Semantic Caching hoạt động thế nào"* | - Câu 1: `KNOWLEDGE_QUERY` (`sub_intent=CATALOG`)<br>- Câu 2: `KNOWLEDGE_QUERY` (`sub_intent=SEARCH`) | Cùng nhắc đến tên một bài học cụ thể trong cây lộ trình. | **Phân tích mục tiêu câu hỏi ($P_0$ Focus):**<br>- Cụm từ vị trí (`"ở đâu"`, `"nằm ở"`, `"thuộc phần nào"`) $\rightarrow$ `CATALOG`.<br>- Cụm từ nguyên lý (`"thế nào"`, `"là gì"`, `"cơ chế"`, `"hoạt động"`) $\rightarrow$ `SEARCH`. |
| **Search vs Progress Context** | - *"Tôi đang học RAG, hãy giải thích chunking"*<br>- *"Tôi đang học những bài nào trong topic RAG"* | - Câu 1: `KNOWLEDGE_QUERY` (`sub_intent=SEARCH`)<br>- Câu 2: `KNOWLEDGE_QUERY` (`sub_intent=PROGRESS`) | Cùng xuất hiện cụm từ *"đang học"* và tên chủ đề *"RAG"*. | **Bóc tách mệnh đề chính ($P_0$ Main Clause):**<br>- Ở câu 1, *"tôi đang học RAG"* là mệnh đề phụ giới thiệu ngữ cảnh, trọng tâm hỏi là *"giải thích chunking"* $\rightarrow$ `SEARCH`.<br>- Ở câu 2, câu hỏi trực tiếp nhắm vào danh sách bài ở trạng thái `learning` $\rightarrow$ `PROGRESS`. |
| **Catalog vs Plan Goal** | - *"Xem danh sách bài trong roadmap Backend"*<br>- *"Lập lộ trình học Backend từ đầu"* | - Câu 1: `KNOWLEDGE_QUERY` (`sub_intent=CATALOG`)<br>- Câu 2: `PLAN_GOAL` (`sub_intent=None`) | Đều nhắc đến lộ trình Backend. | **Phân biệt qua SpeechAct ($P_1$):**<br>- Xem danh mục có sẵn $\rightarrow$ `CATALOG`.<br>- Yêu cầu tư vấn, thiết lập kế hoạch học tập cá nhân hóa $\rightarrow$ `PLAN_GOAL`. |
| **Catalog vs Out of Scope (Trùng danh từ)** | - *"Cách tạo topic trong Kafka"* | - `KNOWLEDGE_QUERY` (`sub_intent=SEARCH`, `target=Target.NONE`) | Chứa từ *"topic"* (danh từ trùng lặp với khái niệm cây roadmap). | **Khử từ giả ($P_3$ `FALSE_OBJECT`):**<br>Cụm *"Kafka topic"* bị loại bỏ khỏi danh từ roadmap, nhận diện là câu hỏi how-to kỹ thuật chung $\rightarrow$ `SEARCH` (Vector RAG). |

---

### 3.3 Hướng Dẫn Mẫu Truy Cập An Toàn Cho Downstream (Mục 4.3 Phase 3)

Cần bổ sung một mục con chi tiết tại Mục 4.3 Phase 3 của tài liệu thiết kế mang tên: **"Quy Chuẩn Lập Trình An Toàn Cho Downstream Dispatcher (Downstream Safe Access Guidelines)"**.

#### Quy Tắc 1: Sử Dụng Thuộc Tính An Toàn `sub_intent_value` Cho Sự Kiện & Tracing
Trong `agent.py`, tuyệt đối không truy cập trực tiếp `intent_res.sub_intent.value`. Bắt buộc dùng `intent_res.sub_intent_value` hoặc cú pháp bảo vệ `None`:

```python
# ✅ ĐÚNG: Sử dụng safe property hoặc toán tử 3 ngôi
yield step_event(
    "route",
    "routing",
    "done",
    intent=intent_res.intent.value,
    sub_intent=intent_res.sub_intent_value,  # An toàn 100%, trả về None nếu sub_intent is None
    confidence=round(intent_res.confidence, 2),
    method=method,
    act=understood.act.value,
    target=understood.target.value,
    rule=decision.row,
    write=route_gate.mode,
)

if (trace := current_trace()) is not None:
    trace.flags["intent"] = intent_res.intent.value
    # Gắn flag tracing an toàn
    if intent_res.sub_intent is not None:
        trace.flags["sub_intent"] = intent_res.sub_intent.value
```

#### Quy Tắc 2: Cấu Trúc Điều Hướng Phân Cấp Bắt Buộc (Strict Hierarchical Guarding)
Tầng downstream bắt buộc phải kiểm tra điều kiện intent cấp 1 trước, sau đó mới rẽ nhánh theo sub-intent cấp 2. Tuyệt đối không kiểm tra phẳng sub-intent:

```python
# ❌ NGUY HIỂM: Kiểm tra phẳng có thể gây điều hướng sai nếu state bị lệch
if intent_res.sub_intent == KnowledgeSubIntent.CATALOG:
    ...

# ✅ ĐÚNG: Cấu trúc phân cấp chuẩn hóa
if intent_res.intent == IntentType.KNOWLEDGE_QUERY:
    # Nhánh 2: In-Memory Catalog Lookup
    if intent_res.sub_intent == KnowledgeSubIntent.CATALOG:
        async for ev in self.handle_catalog_dispatch(...):
            yield ev
        return

    # Nhánh 3: Tiến độ học tập người dùng (ADR-0010)
    elif intent_res.sub_intent == KnowledgeSubIntent.PROGRESS:
        if not is_owner():
            yield step_event("error", "auth", "denied", message=OWNER_ONLY_MESSAGE)
            yield _stream_text(OWNER_ONLY_MESSAGE)
            return
        async for ev in self.handle_lesson_status(...):
            yield ev
        return

    # Nhánh 1 & Fallback mặc định: Vector RAG Search
    # Xử lý cả KnowledgeSubIntent.SEARCH lẫn trường hợp sub_intent is None
    else:
        deps = self._source_deps(content)
        async for ev in answer_from_sources(
            query=content, session_id=session_id, owner=is_owner(), delay=delay,
            llm=self.llm, deps=deps,
        ):
            yield ev
        return
```

#### Quy Tắc 3: Nguyên Tắc Fallback An Toàn (Graceful Degradation to Vector RAG)
Nếu vì bất kỳ lý do gì (mô hình LLM không xác định được sub-intent, confidence thấp, hoặc phiên bản router cũ chưa gán nhãn), khi `intent == IntentType.KNOWLEDGE_QUERY` mà `sub_intent is None`:
- Hệ thống **luôn luôn fallback về Vector RAG (`KnowledgeSubIntent.SEARCH`)**.
- Điều này bảo đảm tính tương thích hoàn hảo: hệ thống sẽ hoạt động chính xác như hành vi trước khi có sub-intent, không làm mất bất kỳ câu trả lời nào của người dùng.

---

## 4. Bảng Kế Hoạch Tích Hợp Chi Tiết Vào Tài Liệu Thiết Kế

| Vị Trí Trong `knowledge-sub-intents-design.md` | Hiện Trạng Trong File | Thay Đổi Đề Xuất Cụ Thể | Rủi Ro Triển Khai Nếu Bỏ Qua |
|---|---|---|---|
| **Mục 3.2 (Schema Pydantic)** | `IntentClassificationResult` chỉ có các trường cơ bản, không có helper property hay validator. | Thêm `@property sub_intent_value` và `@model_validator(mode="after") enforce_sub_intent_hierarchy`. | Gây lỗi `AttributeError` làm sập SSE stream trong `agent.py`; tiềm ẩn lỗi coupling trạng thái. |
| **Mục 3.5 (Ambiguity Matrix)** | Chỉ có 5 cặp xung đột sơ sài, thiếu hoàn toàn các ca va chạm từ giả (`"tiến độ"`, `"mấy bài"`). | Thay thế bằng bảng 9 cặp phân giải chi tiết, bổ sung tiêu chí đa pha $P_3$ Target và $P_4$ Scope. | Router bắt nhầm câu hỏi kinh tế thành tiến độ học tập; câu hỏi tìm kiếm tài liệu bị ép sang đếm bài. |
| **Mục 4.3 Phase 1 (Schema & Policy)** | Mô tả sơ lược việc gán sub-intent vào `DECISION_TABLE`. | Bổ sung lưu ý: Không gán cứng `Row("roadmap_question")` sang Catalog; phải tách thành 2 dòng luật riêng biệt (`needs="catalog_cue"`). | 86.5% câu hỏi trong `roadmap_question` bị phân loại nhầm sang Catalog in-memory. |
| **Mục 4.3 Phase 3 (Downstream)** | Đoạn mã mẫu điều phối chưa có safe accessor và xử lý `sub_intent is None`. | Bổ sung trọn vẹn mục "Quy Chuẩn Lập Trình An Toàn Cho Downstream Dispatcher" với 3 quy tắc vàng. | Kỹ sư triển khai mắc bẫy `NoneType` khi viết code refactor `agent.py`. |

---

## 5. Kết Luận

Những phát hiện thực nghiệm của `challenger_1` và `challenger_2` là vô cùng giá trị và chuẩn xác. Việc bổ sung các đặc tả kỹ thuật trên vào `knowledge-sub-intents-design.md` sẽ biến tài liệu từ một bản phác thảo ý tưởng thành một **đặc tả kiến trúc hoàn chỉnh, chặt chẽ và an toàn tuyệt đối** trước khi bước vào giai đoạn lập trình.
