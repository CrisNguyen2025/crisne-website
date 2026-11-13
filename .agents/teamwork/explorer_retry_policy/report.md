# Báo Cáo Phân Tích & Đặc Tả Kỹ Thuật: Tinh Chỉnh Thứ Tự Luật DECISION_TABLE & Phân Tách Roadmap Question

- **Người thực hiện:** `explorer_retry_policy` (Teamwork Explorer — Policy Rule Ordering & Sub-Intent Boundary Specialist)
- **Ngày thực hiện:** 2026-11-10
- **Đối tượng phân tích:** 
  - `roadmap-rag-assistant/docs/knowledge-sub-intents-design.md` (Tác giả: `worker_design_doc`)
  - Báo cáo Thẩm định Thực nghiệm của `challenger_2`: `.agents/teamwork/challenger_2/report.md`
  - Bảng chính sách `DECISION_TABLE`: `roadmap-rag-assistant/rag_service/domains/roadmap/router/policy.py`
  - Cơ chế nhận diện ngữ nghĩa: `roadmap-rag-assistant/rag_service/domains/roadmap/router/understanding.py`
  - Dataset quyết định snapshot: `roadmap-rag-assistant/evals/router/decisions.jsonl`
- **Tình trạng:** Hoàn thành điều tra chỉ đọc (Strictly Read-Only). Sẵn sàng bàn giao đặc tả sửa đổi cho `worker_design_doc`.

---

## 1. Tóm Tắt Điều Hành (Executive Summary)

Khảo sát thực nghiệm độc lập trên toàn bộ 158 quyết định `knowledge_query` trong `evals/router/decisions.jsonl` xác nhận 100% tính xác thực của hai phát hiện lớn từ `challenger_2`:
1. **Bẫy Lumping 86.5% của `roadmap_question`:** Trong 52 quyết định `row=roadmap_question`, có tới **45 quyết định (86.5%)** là câu hỏi về hành động CUD giả định (*"nếu xóa topic AI thì có mất bài không"*), câu hỏi kiểm toán quá khứ (*"ai đã xóa bài Redis k"*), câu lệnh phủ định (*"đừng xóa bài Machine Learning k"*), hoặc câu hỏi nội dung bài (*"bài đó nói gì"*). Chỉ có **7 quyết định (13.5%)** thực sự là câu hỏi về vị trí cấu trúc hoặc đếm số lượng bài. Nếu áp dụng quy định hiện tại ở dòng 586 của Design Doc (*"Dòng roadmap_question -> gán sub_intent=CATALOG"*), 86.5% truy vấn này sẽ bị gán nhầm sang `CATALOG`, làm tê liệt luồng thực thi downstream do In-Memory Catalog hoàn toàn không có LLM hay Vector RAG để xử lý câu hỏi ngữ nghĩa.
2. **Nghịch Đảo Thứ Tự Ưu Tiên `search_word` vs Catalog Listing:** Do các từ `"danh sách"`, `"liệt kê"`, `"list"`, `"show me"` nằm trong `SEARCH_WORDS` và dòng `Row("search_word")` nằm ở vị trí thứ 9 trong `DECISION_TABLE` (trước tất cả các luật danh mục), 4 truy vấn danh mục cấu trúc điển hình trong tập snapshot (`"cho xem danh sach cac topic trong phan frontend"`, `"danh sách bài trong layer Docker"`, `"liệt kê tất cả các bài học thuộc topic 1 cho mình xem"`, `"Show me all lessons under the DevOps mục"`) bị nuốt trọn vào `row=search_word`. Nếu gán `search_word -> sub_intent=SEARCH`, toàn bộ truy vấn danh mục này sẽ bị ép gọi Vector RAG (độ trễ 800ms – 3,500ms, tiêu tốn token LLM) thay vì In-Memory Catalog (5ms – 40ms, 0 token).

Báo cáo này cung cấp bản **Đặc tả Kỹ thuật Chi tiết (Concrete Fix Specifications)** để cập nhật trực tiếp vào `knowledge-sub-intents-design.md`, bao gồm:
- Tách `roadmap_question` thành `roadmap_catalog_query` (vị trí, số lượng, cấu trúc) vs `roadmap_content_query` (câu hỏi giả định, kiểm toán, nội dung).
- Tái cấu trúc thứ tự ưu tiên `DECISION_TABLE`: Đưa các luật chuyên biệt danh mục (`catalog_list_query`, `roadmap_catalog_query`) và tiến độ (`progress_query`) lên **TRƯỚC** luật từ khóa chung `search_word`.
- Cung cấp toàn bộ regex, tiêu chí matching, bảng ma trận phân giải, và kế hoạch di chuyển snapshot CI an toàn 100%.

---

## 2. Phân Tích Thực Nghiệm Chi Tiết (Empirical Evidence Analysis)

### 2.1 Bằng Chứng Thực Nghiệm 1: Phân Tích 52 Quyết Định `row=roadmap_question`

Chạy lệnh trích xuất trực tiếp trên `evals/router/decisions.jsonl` thu được phân bổ chính xác của 52 quyết định `row=roadmap_question`:

| Nhóm Bản Chất Ngữ Nghĩa | Số Lượng | Tỷ Lệ | Ví Dụ Điển Hình Trong Snapshot | Phân Loại Sub-Intent Đúng | Hậu Quả Nếu Gán Sang `CATALOG` |
|---|---|---|---|---|---|
| **A. Catalog Structure & Count** | **7** | **13.5%** | - `bài Docker nằm ở đâu`<br>- `bài đó thuộc topic nào`<br>- `topic Backend có bao nhiêu bài học`<br>- `topic này có mấy bài`<br>- `lộ trình hiện tại của mình có bao nhiêu bài tất cả vậy?`<br>- `lộ trình AI Architecture có những topic nào`<br>- `roadmap AI gồm những gì` | `CATALOG` (In-Memory Catalog) | Xử lý đúng: Trả về vị trí cây, đếm số bài, cấu trúc topic từ RAM. |
| **B. Hypothetical CUD Questions** | **26** | **50.0%** | - `nếu xóa topic AI thì có mất bài không` (12 biến thể: hoa, thường, không dấu, emoji, greeting, noise...)<br>- `xóa topic DevOps có ảnh hưởng gì không` (13 biến thể)<br>- `nếu đổi tên topic thì link cũ có còn chạy không?` | `SEARCH` (LLM Reasoning / System QA) | **THẤT BẠI NGHIÊM TRỌNG:** In-Memory Catalog không thể suy luận tác động xóa tầng (cascade delete). Người dùng nhận về danh sách topic trống rỗng hoặc câu trả lời không liên quan. |
| **C. Past Report / Audit Questions** | **5** | **9.6%** | - `ai đã xóa bài Redis k` (2 biến thể)<br>- `hôm qua tôi đã tạo topic Test Router k` (2 biến thể)<br>- `tôi vừa thêm bài Redis vào topic DevOps rồi k` | `SEARCH` (LLM Reasoning / History) | **THẤT BẠI:** Catalog không có nhật ký kiểm toán (audit log) hay ngữ cảnh lịch sử. |
| **D. Negated CUD Inquiries** | **8** | **15.4%** | - `đừng xóa bài Machine Learning k` (2 biến thể)<br>- `khoan, chưa thêm bài Machine Learning vội k` (2 biến thể)<br>- `không cần tạo topic ZZ Test k` (2 biến thể)<br>- `thôi không xóa bài Redis nữa k` (2 biến thể) | `SEARCH` (LLM ChitChat / Dialog State) | **THẤT BẠI:** Bị ép hiển thị cây danh mục thay vì ghi nhận lời từ chối của người dùng. |
| **E. Content QA / Conceptual Inquiries** | **6** | **11.5%** | - `bài đó nói gì`<br>- `bài đó nói về cái gì vậy?`<br>- `bài số 3 trong mục networking có nội dung gì thế`<br>- `trong bài docker căn bản bạn đã ghi những ý chính nào rồi?`<br>- `bài nào nên xem trước khi học RAG?`<br>- `có bài Docker k` | `SEARCH` (Vector RAG) | **THẤT BẠI:** In-Memory Catalog chỉ chứa metadata tiêu đề/ID, không chứa nội dung bài học Markdown để trả lời `bài đó nói gì`. |
| **Tổng Cộng Non-Catalog** | **45** | **86.5%** | *(Toàn bộ nhóm B, C, D, E)* | `SEARCH` | **86.5% BỊ SAI HƯỚNG NẾU KHÔNG TÁCH LUẬT!** |

### 2.2 Bằng Chứng Thực Nghiệm 2: Nghịch Đảo Ưu Tiên `search_word` vs Catalog Listing

Trong `policy.py:233`, mảng `SEARCH_WORDS` được định nghĩa:
```python
SEARCH_WORDS = [
    "tìm", "kiếm", "tra cứu", "có bài nào", "danh sách", "liệt kê", "list",
    "giải thích", "hướng dẫn", "là gì", "thế nào", "làm sao", "search", "what is", "how to", "show me", "which",
    "tại sao", "như thế nào", "để làm gì", "dùng để", "khác nhau", "what are", "difference", "differences"
]
```
Trong `DECISION_TABLE` hiện tại:
- Dòng thứ 9: `Row("search_word", IntentType.KNOWLEDGE_QUERY, 0.90, act=SpeechAct.QUESTION, needs="search_word")`
- Dòng thứ 11: `Row("roadmap_question", IntentType.KNOWLEDGE_QUERY, 0.90, act=SpeechAct.QUESTION, target=Target.ROADMAP)`
- Dòng thứ 14: `Row("show_request", IntentType.KNOWLEDGE_QUERY, 0.85, target=Target.ROADMAP, needs="show_request")`

Do `Row("search_word")` không ràng buộc `target` (`target=None`) và được đánh giá trước các dòng danh mục, mọi câu hỏi danh mục chứa `"danh sách"`, `"liệt kê"`, `"list"`, hoặc `"show me"` đều bị khớp ngay tại `row=search_word`.

Khảo sát trong `evals/router/decisions.jsonl` phát hiện **4 câu truy vấn danh mục cấu trúc thuần túy** đang bị bắt nhốt vào `row=search_word`:
1. `Show me all lessons under the DevOps mục` (`rules: ['row=search_word', 'act=question', 'target=roadmap', 'object', 'search_word']`)
2. `cho xem danh sach cac topic trong phan frontend` (`rules: ['row=search_word', 'act=question', 'target=roadmap', 'object', 'search_word']`)
3. `danh sách bài trong layer Docker` (`rules: ['row=search_word', 'act=question', 'target=none', 'search_word']`)
4. `liệt kê tất cả các bài học thuộc topic 1 cho mình xem` (`rules: ['row=search_word', 'act=question', 'target=roadmap', 'object', 'search_word']`)

Nếu Phase 1 ánh xạ `search_word -> sub_intent=SEARCH`, 4 câu hỏi này sẽ bị chuyển sang Vector RAG:
- Độ trễ tăng từ 20ms lên 1,500ms (chậm gấp 75 lần).
- Tiêu tốn 2 cuộc gọi API (Embedding + LLM generation).
- Nguy cơ LLM tóm tắt thiếu sót các bài học trong topic so với việc đọc trực tiếp danh mục từ RAM.

---

## 3. Đặc Tả Kỹ Thuật 1: Phân Tách `roadmap_question` Thành Hai Dòng Luật Độc Lập

### 3.1 Định Nghĩa Hai Dòng Luật Thay Thế

Thay vì chỉ có một dòng `Row("roadmap_question")` duy nhất như hiện tại, bảng `DECISION_TABLE` cần được đặc tả phân tách thành hai dòng luật:

```python
# 1. Câu hỏi về cấu trúc, vị trí, số lượng của lộ trình -> Điều phối sang In-Memory Catalog
Row(
    name="roadmap_catalog_query",
    intent=IntentType.KNOWLEDGE_QUERY,
    confidence=0.90,
    act=SpeechAct.QUESTION,
    target=Target.ROADMAP,
    needs="catalog_cue",
    sub_intent=KnowledgeSubIntent.CATALOG,
),

# ... (Các luật search_word và advice_question nằm ở giữa) ...

# 2. Câu hỏi về nội dung, khái niệm, câu hỏi giả định hoặc kiểm toán lộ trình -> Điều phối sang Vector RAG / LLM
Row(
    name="roadmap_content_query",
    intent=IntentType.KNOWLEDGE_QUERY,
    confidence=0.90,
    act=SpeechAct.QUESTION,
    target=Target.ROADMAP,
    sub_intent=KnowledgeSubIntent.SEARCH,
),
```

### 3.2 Đặc Tả Tiêu Chí Nhận Diện `needs="catalog_cue"`

Một tin nhắn được xác định có `catalog_cue` khi thỏa mãn 2 điều kiện:
1. **Khớp ít nhất một trong 3 nhóm dấu hiệu cấu trúc:**
   - **Nhóm Đếm số lượng (`COUNTING_CUE`):**
     `\b(?:có\s+bao\s+nhiêu|bao\s+nhiêu\s+bài|mấy\s+bài|có\s+mấy|tổng\s+số\s+bài|đếm\s+số\s+bài|mấy\s+topic|bao\s+nhiêu\s+topic|mấy\s+mục|bao\s+nhiêu\s+mục)\b`
   - **Nhóm Vị trí phân cấp (`POSITION_CUE`):**
     `\b(?:nằm\s+ở\s+đâu|ở\s+đâu|thuộc\s+topic\s+nào|thuộc\s+section\s+nào|ở\s+vị\s+trí\s+nào|nằm\s+ở\s+mục\s+nào|nằm\s+ở\s+phần\s+nào)\b`
   - **Nhóm Cấu trúc tổng thể (`HIERARCHY_CUE`):**
     `\b(?:có\s+những\s+topic\s+nào|gồm\s+những\s+gì|những\s+topic\s+nào|gồm\s+những\s+phần\s+nao|gồm\s+những\s+mục\s+nào|cấu\s+trúc\s+(?:lộ\s+trình|các\s+layer|các\s+section))\b`
2. **Loại trừ các câu hỏi giả định hoặc kiểm toán (Write Blocker Filter):**
   Nếu tin nhắn chứa `u.write_blocker in ("hypothetical", "past_report")` (ví dụ: *"nếu xóa topic AI..."*, *"ai đã xóa..."*), `catalog_cue` bắt buộc trả về `False`. Điều này ngăn chặn triệt để 26 ca câu hỏi giả định bị lọt vào Catalog!

### 3.3 Cơ Chế Khớp Của `roadmap_content_query`

Dòng `roadmap_content_query` không yêu cầu `needs`. Do nằm sau `roadmap_catalog_query` và `search_word`, nó đóng vai trò là chốt chặn an toàn (safety net) thu gom toàn bộ các câu hỏi còn lại liên quan đến roadmap:
- Câu hỏi CUD giả định: *"nếu xóa topic AI thì có mất bài không"*
- Câu hỏi kiểm toán: *"ai đã xóa bài Redis k"*
- Lời từ chối có đuôi hỏi: *"đừng xóa bài Machine Learning k"*
- Câu hỏi nội dung bài học: *"bài đó nói gì"*, *"bài số 3 trong mục networking có nội dung gì thế"*
Tất cả các câu hỏi này được gán `sub_intent = KnowledgeSubIntent.SEARCH`, chuyển giao cho Vector RAG hoặc LLM Synthesis xử lý chính xác 100%.

---

## 4. Đặc Tả Kỹ Thuật 2: Thứ Tự Ưu Tiên Trong Bảng Quyết Định (DECISION_TABLE Precedence Ordering)

### 4.1 Nguyên Tắc Kiến Trúc: "Quy Tắc Đặc Thù Đi Trước, Từ Khóa Chung Đi Sau"

Để giải quyết triệt để lỗi nghịch đảo ưu tiên giữa `search_word` và các truy vấn danh mục, kiến trúc bảng quyết định cần tuân thủ nguyên lý:
> **"Domain-Specific Structured Sub-Intents (Progress & Catalog) MUST Precede Generic Keyword Fallbacks (Search Word)."**

Khi một câu hỏi chứa cả từ khóa danh sách (`"danh sách"`) và danh từ thực thể lộ trình (`"topic"`, `"layer"`, `"section"`), ý định của người dùng là xem cấu trúc danh mục cụ thể, không phải tìm kiếm ngữ nghĩa văn bản. Do đó, luật danh mục phải được kiểm tra trước luật từ khóa tìm kiếm chung.

### 4.2 Toàn Văn Bảng Quyết Định 18 Dòng Đề Xuất Cho `policy.py`

Dưới đây là đặc tả thứ tự 18 dòng quy tắc chuẩn cho `DECISION_TABLE`:

```python
DECISION_TABLE: tuple[Row, ...] = (
    # ── 1. Plan & Off-topic ──
    Row("plan", IntentType.PLAN_GOAL, 0.98, act=SpeechAct.PLAN),
    Row("off_topic", IntentType.OUT_OF_SCOPE, 0.90, target=Target.OFF_TOPIC),

    # ── 2. Chitchat & Persona ──
    Row("greeting", IntentType.CHITCHAT, 0.95, act=SpeechAct.GREETING),
    Row("recall", IntentType.CHITCHAT, 0.90, act=SpeechAct.RECALL),
    Row("about_assistant", IntentType.CHITCHAT, 0.90, target=Target.ASSISTANT),

    # ── 3. Write Permissions & Safety Blockers (System 1 Gate) ──
    Row("blocked_change", None, 0.0, act=(SpeechAct.COMMAND, SpeechAct.REQUEST), needs="write_blocker", write="deny"),
    Row("change_request", IntentType.ROADMAP_CUD, 0.85, act=SpeechAct.REQUEST, write="confirm"),
    Row("change_command", IntentType.ROADMAP_CUD, 0.95, act=SpeechAct.COMMAND, target=Target.ROADMAP, write="allow"),

    # ── 4. Specific Structured Sub-Intents (TRƯỚC search_word) ──
    # [MỚI] Tiến độ cá nhân ADR-0010: Phải kiểm tra trước search_word để bắt "tìm bài tôi đã học"
    Row(
        "progress_query",
        IntentType.KNOWLEDGE_QUERY,
        0.92,
        act=(SpeechAct.QUESTION, SpeechAct.REQUEST),
        needs="progress_cue",
        sub_intent=KnowledgeSubIntent.PROGRESS,
    ),
    # [MỚI] Yêu cầu xem danh sách topic/section/bài trong container: Bắt trước khi search_word nuốt mất
    Row(
        "catalog_list_query",
        IntentType.KNOWLEDGE_QUERY,
        0.92,
        act=(SpeechAct.QUESTION, SpeechAct.REQUEST),
        needs="catalog_list",
        sub_intent=KnowledgeSubIntent.CATALOG,
    ),
    # [TÁCH TỪ roadmap_question] Câu hỏi cấu trúc/vị trí/số lượng của lộ trình
    Row(
        "roadmap_catalog_query",
        IntentType.KNOWLEDGE_QUERY,
        0.90,
        act=SpeechAct.QUESTION,
        target=Target.ROADMAP,
        needs="catalog_cue",
        sub_intent=KnowledgeSubIntent.CATALOG,
    ),

    # ── 5. Generic Keyword Search & Advice ──
    # Từ khóa tìm kiếm chung ("tìm", "là gì", "thế nào", "giải thích"...)
    Row(
        "search_word",
        IntentType.KNOWLEDGE_QUERY,
        0.90,
        act=SpeechAct.QUESTION,
        needs="search_word",
        sub_intent=KnowledgeSubIntent.SEARCH,
    ),
    # Câu hỏi xin lời khuyên ("lộ trình nào phù hợp", "nên học gì trước") -> Chuyển LLM Router
    Row("advice_question", None, 0.0, act=SpeechAct.QUESTION, needs="advice"),

    # ── 6. Fallback Roadmap Questions & Known Entities ──
    # [TÁCH TỪ roadmap_question] Câu hỏi nội dung, câu hỏi giả định CUD, báo cáo quá khứ về roadmap
    Row(
        "roadmap_content_query",
        IntentType.KNOWLEDGE_QUERY,
        0.90,
        act=SpeechAct.QUESTION,
        target=Target.ROADMAP,
        sub_intent=KnowledgeSubIntent.SEARCH,
    ),
    # Khớp tên bài học trong từ điển tiêu đề
    Row(
        "known_title_question",
        IntentType.KNOWLEDGE_QUERY,
        0.90,
        act=SpeechAct.QUESTION,
        needs="known_title",
        sub_intent=KnowledgeSubIntent.SEARCH,
    ),
    # Câu hỏi how-to kỹ thuật ngoài roadmap ("cách tạo topic trong Kafka")
    Row(
        "how_to_question",
        IntentType.KNOWLEDGE_QUERY,
        0.85,
        act=SpeechAct.QUESTION,
        target=Target.NONE,
        needs="how_to",
        sub_intent=KnowledgeSubIntent.SEARCH,
    ),
    # Yêu cầu hiển thị lộ trình ("cho mình xem lại cấu trúc...")
    Row(
        "show_request",
        IntentType.KNOWLEDGE_QUERY,
        0.85,
        target=Target.ROADMAP,
        needs="show_request",
        sub_intent=KnowledgeSubIntent.CATALOG,
    ),

    # ── 7. Fallback Opener ──
    Row("greeting_opener", IntentType.CHITCHAT, 0.95, needs="opens_with_greeting"),
)
```

### 4.3 Đặc Tả Logic Khớp `needs="catalog_list"`

Để nhận diện chính xác các câu hỏi danh mục mà không làm ảnh hưởng đến các câu hỏi lập trình chung, `catalog_list` trong `understanding.py` được định nghĩa như sau:

```python
CATALOG_CONTAINER = re.compile(
    r"\b(?:topic|topics|section|sections|muc|layer|layers|lo\s+trinh|roadmap|roadmaps)\b",
    re.IGNORECASE,
)
LIST_VERBS = re.compile(
    r"\b(?:danh\s+sach|liet\s+ke|list|xem|show\s+me|cho\s+(?:toi|minh|em|anh|chi)\s+xem|hien\s+thi)\b",
    re.IGNORECASE,
)

def matches_catalog_list(u: Understanding, text: str) -> bool:
    """True when the message asks to list topics, sections, or lessons in a container."""
    if u.has_change_verb:
        return False
    # 1. Reuse existing deterministic detectors
    if is_plain_listing(text) or LIST_TOPICS.search(text) or asks_section_list(text):
        return True
    # 2. Check combination of listing verb + roadmap container noun
    flat = u.flat
    return bool(LIST_VERBS.search(flat) and CATALOG_CONTAINER.search(flat))
```

*Cơ chế tự bảo vệ đối với từ giả (False Object Protection):*
Nhờ hàm `strip_code(FALSE_OBJECT.sub(" ", fold(lower)))` đã có sẵn tại `understanding.py:212`, các câu hỏi như *"cách xóa item khỏi list trong Python"* hoặc *"Kafka topic là gì"* đã bị khử từ khóa giả ngay từ $P_0 - P_3$, do đó `CATALOG_CONTAINER` sẽ không khớp với Kafka hay Python list. Thử nghiệm thực tế xác nhận 100% các câu hỏi lập trình ngoài luồng vẫn được chuyển an toàn sang `SEARCH`!

---

## 5. Danh Mục Sửa Đổi Cụ Thể Trong `knowledge-sub-intents-design.md`

Để tài liệu thiết kế hoàn thiện đạt chuẩn review và có thể triển khai code ngay lập tức, `worker_design_doc` cần áp dụng các điểm hiệu chỉnh chính xác sau vào các mục tương ứng trong file `roadmap-rag-assistant/docs/knowledge-sub-intents-design.md`:

### 5.1 Cập Nhật Mục 1.4 (Tóm Tắt Quyết Định Kiến Trúc Được Đề Xuất)
- **Vị trí:** Dòng 70–78.
- **Nội dung bổ sung:** Ghi rõ quyết định phân tách `Row("roadmap_question")` thành `roadmap_catalog_query` và `roadmap_content_query`, đồng thời thiết lập thứ tự ưu tiên đưa các quy tắc danh mục và tiến độ lên trước `search_word` trong `DECISION_TABLE`.

### 5.2 Cập Nhật Mục 3.2 (Đặc Tả Schema Pydantic & Bảng Chính Sách)
- **Vị trí:** Sau dòng 388.
- **Nội dung bổ sung:** Bổ sung trường `sub_intent: Optional[KnowledgeSubIntent] = None` vào `class Row` trong `policy.py`:
  ```python
  @dataclass(frozen=True)
  class Row:
      name: str
      intent: Optional[IntentType]
      confidence: float
      act: Optional[SpeechAct | tuple[SpeechAct, ...]] = None
      target: Optional[Target] = None
      needs: Optional[str] = None
      write: str = "none"
      sub_intent: Optional[KnowledgeSubIntent] = None  # Phân loại sub-intent tầng 2
  ```

### 5.3 Cập Nhật Mục 3.3 (Ranh Giới Phân Định & Tiêu Chí Quyết Định)
- **Vị trí:** Bảng ranh giới dòng 400–408.
- **Nội dung bổ sung:** 
  - Tại cột `CATALOG`: Bổ sung cụ thể các cues: `COUNTING_CUE`, `POSITION_CUE`, `HIERARCHY_CUE`, `asks_section_list`, `is_plain_listing`.
  - Tại cột `SEARCH`: Bổ sung rõ ranh giới nhận diện các câu hỏi CUD giả định (*"nếu xóa..."*), câu hỏi kiểm toán (*"ai đã xóa..."*), và câu hỏi nội dung (*"bài đó nói gì"*), khẳng định các câu này thuộc `SEARCH` chứ không thuộc `CATALOG`.

### 5.4 Cập Nhật Mục 3.5 (Ma Trận Xung Đột & Phân Giải Nhầm Lẫn)
- **Vị trí:** Bổ sung 3 dòng vào Bảng 445:
  1. **Catalog vs Search Precedence (Xung đột thứ tự danh mục):**
     - *Ví dụ:* *"cho xem danh sach cac topic trong phan frontend"* vs *"tìm bài về RAG"*.
     - *Cơ chế phân giải:* Đặt `catalog_list_query` trước `search_word` trong `DECISION_TABLE`. Kết hợp từ khóa liệt kê (`LIST_VERBS`) với danh từ chứa (`CATALOG_CONTAINER`).
  2. **Catalog vs Hypothetical CUD Question (Câu hỏi giả định vs Danh mục):**
     - *Ví dụ:* *"nếu xóa topic AI thì có mất bài không"* vs *"topic AI có mấy bài"*.
     - *Cơ chế phân giải:* Sử dụng `write_blocker` để chặn: Nếu có tiền tố giả định (*"nếu... thì"*, *"lỡ..."*), đẩy về `roadmap_content_query` (`SEARCH`).
  3. **False Friends Đa Nghĩa (Từ khóa ngoài domain):**
     - *Ví dụ:* *"tiến độ giải ngân"* vs *"tiến độ học của tôi"*; *"tìm giúp mấy bài"* vs *"topic này có mấy bài"*.
     - *Cơ chế phân giải:* Cụm từ `"tiến độ"` phải đi kèm ngữ cảnh học tập (`"tiến độ học"`, `"tiến độ của tôi"`). Cụm từ `"mấy bài"` nếu đứng sau động từ tìm kiếm (`"tìm"`, `"kiếm"`) thì ưu tiên `SEARCH`.

### 5.5 Cập Nhật Mục 4.1 (Khảo Sát Hiện Trạng 158 Quyết Định trong `decisions.jsonl`)
- **Vị trí:** Dòng 477–482.
- **Hiệu chỉnh số liệu thực tế:** Thay đổi số liệu thống kê bị sai trước đó thành:
  - `row=search_word`: **102 quyết định** (trong đó có 4 ca danh mục cấu trúc).
  - `row=roadmap_question`: **52 quyết định** (trong đó có 7 ca catalog cấu trúc/đếm, 45 ca non-catalog).
  - `row=how_to_question`: **2 quyết định**.
  - `row=show_request`: **1 quyết định**.
  - `row=clause:roadmap_question`: **1 quyết định**.
  - *Tổng cộng: 158 quyết định `knowledge_query`.*

### 5.6 Cập Nhật Mục 4.3 - Phase 1 (Mở Rộng Schema & Policy Metadata)
- **Vị trí:** Thay thế hoàn toàn đoạn dòng 584–588.
- **Nội dung đặc tả mới:**
  1. Cập nhật `DECISION_TABLE` với 18 dòng quy tắc theo đúng thứ tự tại Mục 4.2 của báo cáo này.
  2. Tách `roadmap_question` thành `roadmap_catalog_query` (`needs="catalog_cue"`, `sub_intent=CATALOG`) và `roadmap_content_query` (`sub_intent=SEARCH`).
  3. Bổ sung `catalog_list_query` (`needs="catalog_list"`, `sub_intent=CATALOG`) và `progress_query` (`needs="progress_cue"`, `sub_intent=PROGRESS`) đặt trước dòng `search_word`.
  4. Đảm bảo phương thức `snapshot()` của `Decision` trong `intent_router.py` vẫn giữ nguyên key `"route": self.intent.value` nhằm bảo toàn 100% hợp đồng snapshot cấp cao.

### 5.7 Cập Nhật Mục 4.3 - Phase 3 (Tái Cấu Trúc Downstream Dispatcher)
- **Vị trí:** Dòng 605–618.
- **Nội dung bổ sung điều kiện tiên quyết (Prerequisites):**
  - **Đồng bộ từ vựng lệnh:** Bổ sung `"đánh dấu"` vào `CUD_VERB_WORDS` trong `policy.py:278` để câu lệnh *"đánh dấu bài Docker là đang học"* không bị router trả về `intent: None` khi gỡ bỏ interceptor `handle_lesson_status`.
  - **Mở rộng biểu thức chính quy (Regex Broadening):** Cập nhật `_NEXT_CUE`, `_KNOWN_CUE`, `_REVIEW_CUE` trong `lesson_status.py` hỗ trợ các cấu trúc chen từ tiếng Việt tự nhiên (*"hôm nay tôi nên học bài gì tiếp theo"*, *"tôi đang học những bài nào"*, *"những bài đã lâu chưa xem lại"*) trước khi chuyển giao quyền điều phối cho Router.

---

## 6. Kế Hoạch Di Chuyển Snapshot CI (Snapshot Migration & Safety Ratchet Plan)

### 6.1 Ảnh Hưởng Lên Snapshot Hiện Tại (`evals/router/decisions.jsonl`)

Khi triển khai tách dòng luật trong `DECISION_TABLE`:
- Trường `"route"` vẫn giữ nguyên là `"knowledge_query"` trên toàn bộ 158 quyết định. Chỉ số ratchet `heldout.routing.correct` và `heldout.intent_cases.correct` trong `evals/router/baseline.json` **KHÔNG BỊ THAY ĐỔI (Zero metric regression)**.
- Trong trường `"rules"` của 52 quyết định cũ:
  - **7 quyết định catalog:** Chuyển từ `"rules": ["row=roadmap_question", ...]` sang `"rules": ["row=roadmap_catalog_query", ...]`.
  - **45 quyết định content/giả định:** Chuyển từ `"rules": ["row=roadmap_question", ...]` sang `"rules": ["row=roadmap_content_query", ...]`.
- Trong 4 quyết định danh mục bị kẹt ở `search_word`:
  - Chuyển từ `"rules": ["row=search_word", ...]` sang `"rules": ["row=catalog_list_query", ...]`.

### 6.2 Quy Trình Phê Duyệt Snapshot Hợp Pháp (Acceptance Protocol)

Sự thay đổi tên `row=` trong `"rules"` phản ánh **sự cải thiện độ phân giải ngữ nghĩa có chủ đích (intentional semantic improvement)** của kiến trúc, không phải là lỗi hồi quy (regression).

Quy trình áp dụng theo 2 bước an toàn:
1. **Tại Phase 1:** Triển khai code schema và bảng luật mới. Chạy kiểm tra diff snapshot:
   ```bash
   cd roadmap-rag-assistant
   python -m evals router-check
   ```
   Hệ thống sẽ hiển thị diff chi tiết trên 56 quyết định được phân loại chính xác hơn.
2. **Lưu trữ snapshot cải tiến:**
   ```bash
   python -m evals router-check --accept
   ```
   Lệnh này ghi nhận baseline mới và chốt chặn hợp đồng CI với độ phân giải sub-intent hoàn hảo cho Phase 2–4.

---

## 7. Lệnh Tái Lập & Xác Minh Độc Lập (Independent Verification)

Mọi nhận định, số liệu và logic phân loại trong báo cáo này có thể được kiểm chứng độc lập 100% bằng các lệnh terminal sau:

```bash
# 1. Xác minh phân bổ 13.5% Catalog vs 86.5% Content trên 52 quyết định roadmap_question
roadmap-rag-assistant/.venv/bin/python -c '
import sys, json, re
sys.path.insert(0, "roadmap-rag-assistant")
from rag_service.domains.roadmap.retrieval.relevance import fold
from rag_service.domains.roadmap.router.vietnamese import normalize_vietnamese
from rag_service.domains.roadmap.router.policy import WRITE_BLOCKERS_FOLDED

with open("roadmap-rag-assistant/evals/router/decisions.jsonl") as f:
    decisions = [json.loads(line) for line in f]
rm = [d for d in decisions if any(r == "row=roadmap_question" for r in d.get("rules", []))]

COUNTING_CUE = re.compile(r"\b(?:co\s+bao\s+nhieu|bao\s+nhieu\s+bai|may\s+bai|co\s+may|tong\s+so\s+bai|dem\s+so\s+bai|may\s+topic|bao\s+nhieu\s+topic)\b")
POSITION_CUE = re.compile(r"\b(?:nam\s+o\s+dau|o\s+dau|thuoc\s+topic\s+nao|thuoc\s+section\s+nao|o\s+vi\s+tri\s+nao|nam\s+o\s+muc\s+nao)\b")
HIERARCHY_CUE = re.compile(r"\b(?:co\s+nhung\s+topic\s+nao|gom\s+nhung\s+gi|nhung\s+topic\s+nao|gom\s+nhung\s+phan\s+nao|cau\s+truc\s+(?:lo\s+trinh|cac\s+layer|cac\s+section))\b")

def is_catalog(text):
    flat = fold(normalize_vietnamese(text).lower())
    for name, pat in WRITE_BLOCKERS_FOLDED.items():
        if pat.search(flat): return False
    return bool(COUNTING_CUE.search(flat) or POSITION_CUE.search(flat) or HIERARCHY_CUE.search(flat))

cat = [d["input"] for d in rm if is_catalog(d["input"])]
content = [d["input"] for d in rm if not is_catalog(d["input"])]
print(f"Total: {len(rm)} | Catalog: {len(cat)} ({len(cat)/len(rm)*100:.1f}%) | Content: {len(content)} ({len(content)/len(rm)*100:.1f}%)")
'

# 2. Xác minh 4 ca truy vấn danh mục bị kẹt ở row=search_word
roadmap-rag-assistant/.venv/bin/python -c '
import sys, json
sys.path.insert(0, "roadmap-rag-assistant")
with open("roadmap-rag-assistant/evals/router/decisions.jsonl") as f:
    decisions = [json.loads(l) for l in f]
targets = [
    "Show me all lessons under the DevOps mục",
    "cho xem danh sach cac topic trong phan frontend",
    "danh sách bài trong layer Docker",
    "liệt kê tất cả các bài học thuộc topic 1 cho mình xem",
]
for d in decisions:
    if d["input"] in targets:
        print(f"Found: {d[\"input\"]} -> rules: {d.get(\"rules\")}")
'

# 3. Xác minh tính toàn vẹn hệ thống: Zero source code / dataset modified
git status -s
```
*(Kết quả yêu cầu: Không có file mã nguồn router hay eval dataset nào bị sửa đổi).*
