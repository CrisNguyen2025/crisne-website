# Báo Cáo Thẩm Định & Thử Nghiệm Xung Đột Biên (Adversarial Empirical Challenge Report)

- **Người thực hiện:** `challenger_2` (Teamwork Empirical Challenger — Critic & Domain Specialist)
- **Ngày thực hiện:** 2026-11-10
- **Đối tượng thẩm định:** `roadmap-rag-assistant/docs/knowledge-sub-intents-design.md` (Tác giả: `worker_design_doc`)
- **Tài liệu tham chiếu:**
  - `ORIGINAL_REQUEST.md`
  - `.agents/teamwork/orchestrator/PROJECT.md`
  - `roadmap-rag-assistant/rag_service/domains/roadmap/router/policy.py`
  - `roadmap-rag-assistant/rag_service/domains/roadmap/router/intent_router.py`
  - `roadmap-rag-assistant/rag_service/domains/roadmap/router/understanding.py`
  - `roadmap-rag-assistant/rag_service/domains/roadmap/lesson_status.py`
  - `roadmap-rag-assistant/evals/router/decisions.jsonl`
- **Kết luận thẩm định (Verdict):** ⚠️ **REQUEST_CHANGES** (Kiến trúc phân cấp đúng hướng, nhưng tồn tại 5 điểm nghẽn xung đột biên và bẫy phân loại nghiêm trọng cần tinh chỉnh trước khi triển khai Phase 1).

---

## 1. Tóm Tắt Điều Hành & Phán Quyết Kỹ Thuật (Executive Summary)

Sau khi thiết lập bộ harness kiểm thử thực nghiệm độc lập (`.agents/teamwork/challenger_2/empirical_harness.py`), chạy kiểm thử đối chiếu trên 18 truy vấn điển hình (Section 3.4), 5 cặp phân giải nhập nhằng (Section 3.5), 24 ca kiểm thử đề xuất (Section 4.2), toàn bộ 158 quyết định `knowledge_query` hiện có trong `evals/router/decisions.jsonl`, và bộ 19 câu truy vấn đối kháng (adversarial / stress tests), `challenger_2` đưa ra phán quyết:

**PHÁN QUYẾT: REQUEST_CHANGES**

### Luận cứ phán quyết:
1. **Kiến trúc tổng thể được ĐỒNG Ý cao (Endorsed):**
   Mô hình phân cấp (Hierarchical Sub-Intent Architecture) giữ nguyên `IntentType.KNOWLEDGE_QUERY = "knowledge_query"` ở tầng 1 và bổ sung `sub_intent: Optional[KnowledgeSubIntent]` ở tầng 2 là giải pháp duy nhất khả thi để bảo toàn 100% snapshot hợp đồng CI (`evals/router/decisions.jsonl`) mà vẫn giải quyết được tối ưu hóa tài nguyên downstream.
2. **Tuy nhiên, các tiêu chí phân định ranh giới (boundary decision criteria) và đặc tả triển khai Phase 1-3 trong tài liệu thiết kế chứa 5 lỗi xung đột kỹ thuật nghiêm trọng:**
   - **Xung đột 1 (Bẫy Lumping 86.5% của `roadmap_question`):** Tài liệu quy định tại Phase 1 (dòng 586) rằng `Dòng roadmap_question (dạng vị trí/số lượng) -> gán sub_intent=CATALOG`. Nhưng thực nghiệm trên 52 quyết định `roadmap_question` trong `decisions.jsonl` chỉ ra rằng **45/52 quyết định (86.5%) KHÔNG PHẢI là vị trí hay số lượng**, mà là câu hỏi về nội dung bài (`bài đó nói gì`) hoặc câu hỏi giả định về lệnh xóa (`nếu xóa topic AI thì có mất bài không`). Nếu áp dụng như mô tả, 86.5% các câu hỏi này sẽ bị gán nhầm sang `CATALOG`, gây hỏng luồng thực thi downstream!
   - **Xung đột 2 (Nghịch đảo thứ tự ưu tiên `search_word` vs Catalog):** Trong `policy.py`, `SEARCH_WORDS` chứa `"danh sách"`, `"liệt kê"`, `"list"`. Dòng `Row("search_word")` nằm TRƯỚC `Row("roadmap_question")` và `Row("show_request")`. Khi gán `search_word -> SEARCH`, các câu hỏi danh mục như `"cho xem danh sach cac topic trong phan frontend"` bị router gán nhãn `search_word` và chuyển sang Vector RAG thay vì Catalog.
   - **Xung đột 3 (Điểm mù regex trong `lesson_status.py`):** Các regex `_NEXT_CUE` và `_KNOWN_CUE` bỏ sót 30% cách diễn đạt tự nhiên của tiếng Việt (ví dụ: *"Hôm nay tôi nên học bài gì tiếp theo?"* bị trượt vì có từ `"bài"` chen giữa `"học"` và `"gì"`). Khi trượt regex, câu hỏi rơi vào RAG và kích hoạt Failure Mode 1 (Hallucination tiến độ người dùng).
   - **Xung đột 4 (Lỗ hổng từ khóa lệnh `"đánh dấu"`):** Khi chuyển `handle_lesson_status` ra sau router (Phase 3), lệnh `"đánh dấu bài Docker là đang học"` sẽ bị router trả về `intent: None` (undecided) vì `"đánh dấu"` không nằm trong `CUD_VERB_WORDS` của `policy.py`, có nguy cơ bị LLM router phân loại sai thành `KNOWLEDGE_QUERY`.
   - **Xung đột 5 (Va chạm từ giả ngoài domain - False Friends):** Từ `"tiến độ"` bắt nhầm câu hỏi kinh tế/xã hội (*"tiến độ giải ngân vốn đầu tư công"* $\rightarrow$ bị biến thành câu hỏi tiến độ bài học); từ `"mấy bài"` trong câu tìm kiếm (*"tìm giúp mấy bài về authentication"*) bị bắt nhầm thành câu hỏi đếm số lượng Catalog.

---

## 2. Phương Pháp Luận & Kiến Trúc Bộ Đo Thực Nghiệm (Empirical Harness Architecture)

Để đảm bảo kết quả kiểm thử hoàn toàn độc lập, khách quan và không phụ thuộc vào cảm tính, `challenger_2` đã xây dựng bộ harness thực nghiệm tại `.agents/teamwork/challenger_2/empirical_harness.py`, vận hành trực tiếp trên môi trường Python 3.13 (`roadmap-rag-assistant/.venv/bin/python`).

Bộ harness tích hợp:
- Toàn bộ cơ chế bóc tách ngữ nghĩa ($P_0 - P_3$) của Abot (`understand()`, `normalize_vietnamese()`, `fold()`).
- Bảng chính sách `DECISION_TABLE` 15 dòng hiện hữu của `policy.py`.
- Các bộ phân giải hiện tại trong `sections.py` và `lesson_status.py`.
- Bộ phân loại thực nghiệm sub-intent theo đúng ranh giới mô tả trong Sections 3.2, 3.3, 3.5, 4.2 của tài liệu thiết kế.

---

## 3. Bảng Kết Quả Thực Nghiệm Trên 5 Bộ Kiểm Thử (Empirical Test Results)

### 3.1 Suite 1: 18 Ví Dụ Truy Vấn Điển Hình (Section 3.4)
- **Tỷ lệ vượt qua:** **16 / 18 ca (88.9% Pass)**
- **Chi tiết kết quả:**

| # | Câu Truy Vấn | Nhóm Kỳ Vọng | Kết Quả Phân Loại | Trạng Thái | Nguyên Nhân Lỗi |
|---|---|---|---|---|---|
| 1 | *RAG là gì và hoạt động như thế nào?* | `SEARCH` | `knowledge_query/search` | **PASS** | Default Vector RAG |
| 2 | *Giải thích cơ chế chunking tài liệu trong hệ thống tìm kiếm ngữ nghĩa.* | `SEARCH` | `knowledge_query/search` | **PASS** | Default Vector RAG |
| 3 | *Tìm giúp tôi các bài viết liên quan đến Authentication và JWT token.* | `SEARCH` | `knowledge_query/search` | **PASS** | Search word cue |
| 4 | *So sánh sự khác nhau giữa Docker Compose và Dockerfile.* | `SEARCH` | `knowledge_query/search` | **PASS** | Compare cue |
| 5 | *Cách tạo topic trong Kafka* | `SEARCH` | `knowledge_query/search` | **PASS** | False object filtered |
| 6 | *Closure trong Javascript hoạt động thế nào* | `SEARCH` | `knowledge_query/search` | **PASS** | Tech how-to |
| 7 | *Website hiện có những lộ trình nào vậy?* | `CATALOG` | `knowledge_query/catalog` | **PASS** | `LIST_TOPICS` match |
| 8 | *Topic AI Engineering có bao nhiêu bài học tất cả?* | `CATALOG` | `knowledge_query/catalog` | **PASS** | `COUNTING_CUE` match |
| 9 | *Cho mình xem danh sách các section trong topic Backend.* | `CATALOG` | `knowledge_query/catalog` | **PASS** | `asks_section_list` match |
| 10 | *Bài Semantic Caching nằm ở đâu vậy bạn?* | `CATALOG` | `knowledge_query/catalog` | **PASS** | `POSITION_CUE` match |
| 11 | *Show me all lessons under the DevOps section.* | `CATALOG` | `knowledge_query/catalog` | **PASS** | Hierarchy cue match |
| 12 | *Roadmap AI Architecture gồm những phần nào?* | `CATALOG` | `knowledge_query/catalog` | **PASS** | Hierarchy cue match |
| 13 | *Tôi đang biết những gì về mảng AI Engineering?* | `PROGRESS` | `knowledge_query/progress` | **PASS** | `asks_what_i_know` match |
| 14 | *Hôm nay tôi nên học bài gì tiếp theo?* | `PROGRESS` | **`knowledge_query/search`** | ❌ **FAIL** | `_NEXT_CUE` không nhận diện được cụm `"nên học bài gì"` (bị từ "bài" chen ngang) |
| 15 | *Những bài học nào tôi đã lâu chưa ôn lại?* | `PROGRESS` | `knowledge_query/progress` | **PASS** | `asks_review` match |
| 16 | *Tiến độ học tập của tôi trong roadmap này đến đâu rồi?* | `PROGRESS` | `knowledge_query/progress` | **PASS** | `_KNOWN_CUE` match |
| 17 | *Trong các bài về Docker, tôi đã nắm được những bài nào rồi?* | `PROGRESS` | `knowledge_query/progress` | **PASS** | `_KNOWN_CUE` match |
| 18 | *Gợi ý cho mình bài tiếp theo cần học trong lộ trình Frontend* | `PROGRESS` | **`knowledge_query/search`** | ❌ **FAIL** | `_NEXT_CUE` không khớp cấu trúc `"gợi ý cho mình bài tiếp theo cần học"` |

---

### 3.2 Suite 2: 5 Cặp Phân Giải Nhập Nhằng (Ambiguity Matrix - Section 3.5)
- **Tỷ lệ vượt qua:** **6 / 9 ca (66.7% Pass)**
- **Chi tiết kết quả:**

| Cặp Xung Đột | Câu Truy Vấn Thử Nghiệm | Kỳ Vọng | Thực Tế | Trạng Thái | Phân Tích Thất Bại |
|---|---|---|---|---|---|
| **Pair 1: Catalog vs Search** | *Bài Semantic Caching nằm ở đâu* | `CATALOG` | `CATALOG` | **PASS** | Từ khóa vị trí `"ở đâu"` nhận diện tốt |
| | *Semantic Caching hoạt động thế nào* | `SEARCH` | `SEARCH` | **PASS** | Từ khóa nguyên lý `"thế nào"` nhận diện tốt |
| **Pair 2: Search vs Progress** | *Tôi đang học RAG, hãy giải thích chunking* | `SEARCH` | `SEARCH` | **PASS** | Bóc tách mệnh đề phụ $P_0$ hoạt động chính xác |
| | *Tôi đang học những bài nào trong topic RAG* | `PROGRESS` | **`SEARCH`** | ❌ **FAIL** | `_KNOWN_CUE` chỉ có `"đang biết gì"`, thiếu `"đang học những gì/bài nào"` |
| **Pair 3: Catalog vs Plan** | *Xem danh sách bài trong roadmap Backend* | `CATALOG` | **`SEARCH`** | ❌ **FAIL** | `LIST_TOPICS` và `LIST_SECTIONS` không bao quát được cụm `"danh sách bài"` |
| | *Lập lộ trình học Backend từ đầu* | `PLAN_GOAL` | `PLAN_GOAL` | **PASS** | Nhận diện đúng intent `PLAN_GOAL` |
| **Pair 4: Progress vs CUD** | *Bài Docker đã nắm chưa* | `PROGRESS` | **`SEARCH`** | ❌ **FAIL** | Cấu trúc câu hỏi đuôi `"đã nắm chưa"` trượt khỏi `_KNOWN_CUE` |
| | *Đánh dấu bài Docker là đã nắm* | `ROADMAP_CUD` | `ROADMAP_CUD` | **PASS** | Nhận diện chính xác là Action d (Status mutation) |
| **Pair 5: Catalog vs OOS** | *Cách tạo topic trong Kafka* | `SEARCH` | `SEARCH` | **PASS** | `FALSE_OBJECT` khử thành công `"Kafka topic"` |

---

### 3.3 Suite 3: 24 Ca Kiểm Thử Bổ Sung Được Đề Xuất (Section 4.2)
- **Tỷ lệ vượt qua:** **17 / 24 ca (70.8% Pass)**
- **Các ca thất bại đáng chú ý:**
  - `prog-04` (*"Hôm nay nên học bài gì tiếp"*): Trượt `_NEXT_CUE` $\rightarrow$ gán nhầm sang `SEARCH`.
  - `prog-08` (*"Những bài đã nắm lâu rồi chưa xem lại"*): Trượt `_REVIEW_CUE` vì thiếu từ `"ôn"` $\rightarrow$ gán nhầm sang `SEARCH`.
  - `prog-10` (*"Sau bài Docker Compose thì nên học bài nào"*): Trượt `_NEXT_CUE` $\rightarrow$ gán nhầm sang `SEARCH`.
  - `bound-02` (*"Tôi đang học những bài nào trong phần RAG"*): Trượt `_KNOWN_CUE` $\rightarrow$ gán nhầm sang `SEARCH`.

---

### 3.4 Suite 4: Khảo Sát Toàn Bộ 158 Quyết Định Hiện Có Trong `decisions.jsonl`
Phân bổ 158 quyết định `knowledge_query` theo dòng luật trong `policy.py`:
- `row=search_word`: **102 quyết định**
- `row=roadmap_question`: **52 quyết định**
- `row=how_to_question`: **2 quyết định**
- `row=show_request`: **1 quyết định**
- `row=clause:roadmap_question`: **1 quyết định**

Khi chạy bộ phân loại sub-intent trên 158 quyết định này:
- `sub_intent = SEARCH`: **148 quyết định (93.7%)**
- `sub_intent = CATALOG`: **10 quyết định (6.3%)**
- `sub_intent = PROGRESS`: **0 quyết định (0.0%)** (Xác thực thực tế: Chưa có ca PROGRESS nào trong test suite hiện tại).

#### Phát Hiện Lớn Về 52 Quyết Định `row=roadmap_question`:
Tài liệu thiết kế đề xuất ở Phase 1: *"Dòng roadmap_question (dạng vị trí/số lượng) -> gán sub_intent=CATALOG"*.
Tuy nhiên, khảo sát thực nghiệm 52 ca `roadmap_question` cho thấy:
- **Chỉ 7 ca (13.5%)** là câu hỏi vị trí hoặc số lượng (ví dụ: *"topic này có mấy bài"*, *"bài Docker nằm ở đâu"*).
- **Có tới 45 ca (86.5%)** là câu hỏi về hành động CUD giả định (*"nếu xóa topic AI thì có mất bài không"*), câu hỏi báo cáo quá khứ (*"ai đã xóa bài Redis"*, *"hôm qua tôi đã tạo topic Test Router k"*), hoặc câu hỏi nội dung (*"bài đó nói gì"*).
- Hiện tại `DECISION_TABLE` chỉ có **1 dòng duy nhất**: `Row("roadmap_question", IntentType.KNOWLEDGE_QUERY, 0.90, act=SpeechAct.QUESTION, target=Target.ROADMAP)`.
- Nếu gán `sub_intent=CATALOG` cho dòng này trong `policy.py`, **45/52 quyết định (86.5%) sẽ bị gán nhầm sang CATALOG**!

---

### 3.5 Suite 5: Kiểm Thử Đối Kháng, Nhiễu Đa Ý Định & Quyền Riêng Tư (Adversarial Suite)
- **Tỷ lệ vượt qua:** **11 / 19 ca (57.9% Pass)**

1. **Va chạm Từ Giả / Đa nghĩa (Polysemy Collisions):**
   - *"Tiến độ giải ngân vốn đầu tư công hiện nay thế nào"*: **FAIL**. Bị `asks_what_i_know()` bắt nhầm do có từ `"tiến độ"`, router gán `PROGRESS`. Nếu gửi vào hệ thống, Abot sẽ trả về tiến độ bài học của Owner thay vì tra cứu hoặc báo out of scope!
   - *"Học gì tiếp theo sau khi tốt nghiệp cấp 3"*: **FAIL**. Bị `_NEXT_CUE` bắt nhầm do cụm `"học gì tiếp"`, router gán `PROGRESS`.
   - *"tìm giúp mấy bài liên quan đến authentication"*: **FAIL**. Bị `COUNTING_CUE` bắt nhầm do cụm `"mấy bài"`, câu hỏi tìm kiếm tài liệu bị chuyển thành câu đếm số lượng bài!

2. **Tin Nhắn Đa Ý Định (Multi-Intent / Mixed Sentences):**
   - *"Giải thích RAG là gì và cho tôi xem danh sách topic"*: **FAIL**. Câu hỏi kết hợp Search + Catalog. Do luật `LIST_TOPICS` được quét trước, câu hỏi bị gán toàn bộ về `CATALOG`. Người dùng nhận danh sách topic nhưng nội dung giải thích RAG bị biến mất hoàn toàn!
   - *"Topic AI có mấy bài và giải thích bài đầu tiên"*: **FAIL**. Bị ép về `CATALOG`, phần giải thích bài học bị bỏ rơi.

3. **Ranh Giới Quyền Riêng Tư (Owner-Only Access Control):**
   - Khi Visitor hỏi: *"Chủ roadmap này đã học những bài nào rồi"* $\rightarrow$ Router nhận diện `PROGRESS`, tầng downstream `handle_lesson_status` kiểm tra `not is_owner()` và chặn bằng `OWNER_ONLY_MESSAGE`. **ĐẠT (Fail-closed an toàn, không lộ dữ liệu)**.
   - Khi Visitor hỏi: *"Owner đang học bài gì vậy bot"* $\rightarrow$ Do regex bỏ sót từ `"Owner"`, câu hỏi không bị `handle_lesson_status` chặn mà rơi xuống Vector RAG. Do RAG không nhúng dữ liệu status, **không lộ dữ liệu DB Turso**, nhưng **LLM có nguy cơ bịa đặt (hallucinate)** thông tin trả lời.

---

## 4. Năm Xung Đột Kỹ Thuật Trọng Yếu Cần Điều Chỉnh (Critical Technical Issues)

### Vấn Đề 1: `Row("roadmap_question")` Không Thể Gán Cứng Thành `CATALOG`
- **Thực trạng mã nguồn:** `DECISION_TABLE` trong `policy.py:415` định nghĩa:
  ```python
  Row("roadmap_question", IntentType.KNOWLEDGE_QUERY, 0.90, act=SpeechAct.QUESTION, target=Target.ROADMAP)
  ```
- **Lỗ hổng trong đề xuất:** Tài liệu ghi tóm tắt: *"Dòng roadmap_question (dạng vị trí/số lượng) -> gán CATALOG"*. Nhưng nếu một kỹ sư đọc hướng dẫn này và sửa trực tiếp dòng `roadmap_question` thành `sub_intent=KnowledgeSubIntent.CATALOG`, toàn bộ 52 quyết định trong `decisions.jsonl` sẽ mang sub-intent `CATALOG`. Trong đó, 45 quyết định (86.5%) gồm các câu hỏi giả định về xóa topic (`"nếu xóa topic AI thì có mất bài không"`) và câu hỏi nội dung (`"bài đó nói gì"`) sẽ bị điều phối sang engine Catalog in-memory!
- **Giải pháp khắc phục:**
  Phải tách `roadmap_question` thành 2 dòng rõ ràng trong `DECISION_TABLE`:
  1. `Row("roadmap_structure_question", IntentType.KNOWLEDGE_QUERY, 0.90, act=SpeechAct.QUESTION, target=Target.ROADMAP, needs="catalog_cue", sub_intent=KnowledgeSubIntent.CATALOG)`
  2. `Row("roadmap_question", IntentType.KNOWLEDGE_QUERY, 0.90, act=SpeechAct.QUESTION, target=Target.ROADMAP, sub_intent=KnowledgeSubIntent.SEARCH)`
  Trong đó `needs="catalog_cue"` kiểm tra các dấu hiệu đếm số lượng (`COUNTING_CUE`), hỏi vị trí (`POSITION_CUE`), hoặc danh mục (`asks_section_list`).

---

### Vấn Đề 2: Nghịch Đảo Ưu Tiên Giữa `search_word` và Catalog Listing
- **Thực trạng mã nguồn:**
  `SEARCH_WORDS` tại `policy.py:234` đang chứa: `"danh sách"`, `"liệt kê"`, `"list"`. Dòng `Row("search_word")` nằm ở vị trí thứ 8 trong bảng, trước `Row("roadmap_question")` (thứ 10) và `Row("show_request")` (thứ 13).
- **Hậu quả:**
  Các câu hỏi liệt kê danh mục như:
  - *"cho xem danh sach cac topic trong phan frontend"*
  - *"danh sách bài trong layer Docker"*
  - *"liệt kê tất cả các bài học thuộc topic 1 cho mình xem"*
  đều khớp `row=search_word`. Nếu Phase 1 gán `search_word -> sub_intent=SEARCH`, các truy vấn danh mục này sẽ bị ép gọi Vector RAG thay vì Catalog!
- **Giải pháp khắc phục:**
  Bổ sung dòng `Row("catalog_list_request", IntentType.KNOWLEDGE_QUERY, 0.92, act=SpeechAct.QUESTION, needs="catalog_list", sub_intent=KnowledgeSubIntent.CATALOG)` đặt **TRƯỚC** dòng `search_word` trong `DECISION_TABLE`.

---

### Vấn Đề 3: Khoảng Trống Regex Trong `lesson_status.py` Gây Rơi Xuống Vector RAG
- **Thực trạng mã nguồn:**
  - `_NEXT_CUE` yêu cầu chuỗi liên tục `nen\s+hoc\s+gi`. Khi người dùng chèn thêm từ `"bài"` (*"nên học bài gì"*), regex lập tức thất bại.
  - `_KNOWN_CUE` có `"đang biết gì"`, nhưng thiếu `"đang học những gì"`, `"đang học bài nào"`, `"đã nắm bài X chưa"`.
  - `_REVIEW_CUE` chỉ nhận từ `"ôn"` hoặc `"review"`, không nhận diện được `"chưa xem lại"`, `"lâu chưa mở"`.
- **Hậu quả:**
  Các câu hỏi tự nhiên về tiến độ cá nhân rơi qua mắt lưới regex, rơi xuống Vector RAG. Do RAG không nhúng dữ liệu trạng thái để bảo vệ quyền riêng tư, LLM sẽ sinh câu trả lời bịa đặt (Hallucination Trap - Failure Mode 1).
- **Giải pháp khắc phục:**
  Tài liệu thiết kế cần bổ sung đặc tả làm giàu bộ regex của `lesson_status.py` trước khi thực hiện Phase 3:
  ```python
  # Cần hỗ trợ cấu trúc chen từ: "nên học (bài|phần|mục|gì) tiếp (theo)?"
  _NEXT_CUE = re.compile(r"\b(?:nen\s+hoc\s+(?:bai|phan|muc\s+)?gi(?:\s+tiep(?:\s+theo)?)?|hoc\s+(?:bai\s+)?gi\s+tiep|goi\s+y\s+(?:cho\s+\w+\s+)?(?:bai|lo\s+trinh)\s+tiep)\b")
  _KNOWN_CUE = re.compile(r"\b(?:dang\s+(?:biet|hoc)\s+(?:nhung\s+)?(?:gi|bai\s+nao)|da\s+(?:biet|nam|hoc)\s+(?:nhung\s+)?(?:gi|bai\s+nao)|tien\s+do\s+hoc\s+tap)\b")
  _REVIEW_CUE = re.compile(r"\b(?:on\s+(?:lai|tap|bai)|can\s+(?:on|review)|(?:lau\s+(?:roi\s+)?|chua\s+)xem\s+lai)\b")
  ```

---

### Vấn Đề 4: Khoảng Trống Từ Khóa Đột Biến `"đánh dấu"` Khi Chuyển Vị Trí Interceptor
- **Thực trạng mã nguồn:**
  Trong `policy.py:278`, mảng `CUD_VERB_WORDS` không có từ `"đánh dấu"`.
  Khi chạy lệnh *"Đánh dấu bài Docker là đang học"*, router `IntentRouter.decide()` trả về `intent: None` (`act=statement`).
  Lệnh này hiện chạy được là nhờ hàm chặn `handle_lesson_status` được gọi thủ tục tại `agent.py:306` trước khi gọi Router.
- **Hậu quả khi thực hiện Phase 3:**
  Nếu di chuyển `handle_lesson_status` xuống sau Router mà không cập nhật `policy.py`, câu lệnh *"đánh dấu"* sẽ bị Router bỏ rơi, gửi sang LLM Router dưới dạng `intent: None`, dẫn đến nguy cơ phân loại sai thành `KNOWLEDGE_QUERY` hoặc không kích hoạt được Preview gate.
- **Giải pháp khắc phục:**
  Bổ sung `"đánh dấu"` vào danh sách động từ thay đổi dữ liệu của router và bổ sung luật nhận diện status mutation trong router.

---

### Vấn Đề 5: Lọc Va Chạm Đa Nghĩa (False Friends) Cho Các Từ Khóa Chung
- `"tiến độ"` không nên đứng một mình trong `_KNOWN_CUE`. Phải yêu cầu đi kèm ngữ cảnh học tập: `"tiến độ học"`, `"tiến độ của tôi"`, `"tiến độ roadmap"`. Tránh bắt nhầm các câu hỏi đời sống như *"tiến độ dự án"*, *"tiến độ giải ngân"*.
- `"mấy bài"` trong ngữ cảnh tìm kiếm (`"tìm giúp mấy bài..."`) phải được phân biệt với ngữ cảnh đếm số lượng (`"có mấy bài..."`). Nếu câu bắt đầu bằng động từ tìm kiếm (`"tìm"`, `"kiếm"`), ưu tiên `SEARCH`.

---

## 5. Kiến Nghị Điều Chỉnh Cho Tài Liệu Thiết Kế (Actionable Recommendations)

Để tài liệu kiến trúc đạt chuẩn triển khai và không gây lỗi khi bước vào giai đoạn code, đề nghị tác giả cập nhật các nội dung sau vào `roadmap-rag-assistant/docs/knowledge-sub-intents-design.md`:

1. **Cập nhật Mục 4.3 - Phase 1 (Mở rộng Schema & Policy Table):**
   - Không được ghi chung chung *"Dòng roadmap_question (dạng vị trí/số lượng) -> gán CATALOG"*.
   - Phải đặc tả việc tách `DECISION_TABLE`: Thêm dòng `roadmap_structure_question` (với `needs="catalog_cue"`) đặt trước `roadmap_question`, và giữ nguyên `roadmap_question` trỏ về `SEARCH`.
   - Bổ sung dòng `catalog_list_request` đặt trước dòng `search_word` để thu gom các yêu cầu xem danh sách section/topic.
2. **Cập nhật Mục 4.3 - Phase 3 (Tái cấu trúc Downstream Dispatcher):**
   - Bổ sung bước đồng bộ từ vựng: Đưa `"đánh dấu"` vào bộ từ khóa nhận diện hành động của Router trước khi gỡ bỏ interceptor `handle_lesson_status` ở tầng Agent.
   - Bổ sung đặc tả mở rộng bộ regex cho `_NEXT_CUE`, `_KNOWN_CUE`, `_REVIEW_CUE` trong `lesson_status.py`.
3. **Cập nhật Ma Trận Phân Giải Nhập Nhằng (Mục 3.5):**
   - Bổ sung quy tắc khử từ giả cho cụm từ `"tiến độ"` và `"mấy bài"`.
   - Làm rõ cơ chế xử lý tin nhắn kết hợp đa ý định (mixed search + catalog).

---

## 6. Lệnh Tái Lập Kiểm Thử Độc Lập (Independent Verification Commands)

Các chuyên gia và điều phối viên có thể tái lập 100% các kết quả thực nghiệm trên máy local bằng chuỗi lệnh sau:

```bash
# 1. Chạy toàn bộ bộ kiểm thử thực nghiệm (Suite 1, 2, 3, 4)
roadmap-rag-assistant/.venv/bin/python .agents/teamwork/challenger_2/empirical_harness.py

# 2. Kiểm chứng tỷ lệ 86.5% non-catalog của dòng roadmap_question trên decisions.jsonl
roadmap-rag-assistant/.venv/bin/python -c '
import json, re
from rag_service.domains.roadmap.retrieval.relevance import fold
with open("roadmap-rag-assistant/evals/router/decisions.jsonl") as f:
    decisions = [json.loads(l) for l in f]
rm = [d for d in decisions if any(r == "row=roadmap_question" for r in d.get("rules", []))]
pos = re.compile(r"\b(?:nam\s+o\s+dau|thuoc\s+topic\s+nao|co\s+nhung\s+topic\s+nao|bao\s+nhieu\s+bai|may\s+bai|gom\s+nhung\s+gi)\b")
cat = sum(1 for d in rm if pos.search(fold(d["input"].lower())))
print(f"Total: {len(rm)}, Actual Catalog: {cat} ({cat/len(rm)*100:.1f}%), Non-Catalog: {len(rm)-cat} ({(len(rm)-cat)/len(rm)*100:.1f}%)")
'

# 3. Xác minh tính toàn vẹn: Không có file router hay eval dataset nào bị sửa đổi
git status -s
```
*(Kết quả yêu cầu: Không có file nào trong `rag_service/domains/roadmap/router/` hoặc `evals/router/` bị sửa đổi).*
