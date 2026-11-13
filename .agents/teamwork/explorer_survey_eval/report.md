# Báo Cáo Khảo Sát & Đánh Giá Tác Động Eval CI Khi Phân Chia Sub-Intent cho `IntentType.KNOWLEDGE_QUERY`

**Tác giả**: `explorer_survey_eval` (Teamwork Explorer)  
**Nhiệm vụ**: Điều tra toàn diện bộ test suite `evals/router/`, phân tích hiện trạng kiểm thử `IntentType.KNOWLEDGE_QUERY`, đánh giá tác động lên CI/CD, nhận diện nguy cơ hồi quy (regression) và đề xuất lộ trình kiểm thử an toàn khi phân chia sub-intent.  
**Ngày thực hiện**: 2026-11-10  
**Thư mục làm việc**: `/Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/explorer_survey_eval/`  
**Nguyên tắc**: Khảo sát ĐỘC LẬP, CHỈ ĐỌC (Read-Only), tuyệt đối không sửa đổi mã nguồn router hay dataset eval.

---

## 1. Tóm Tắt Điều Hành (Executive Summary)

1. **Hiện trạng Bộ Test Router (`evals/router/`)**:
   Hệ thống kiểm thử router của Abot được thiết kế cực kỳ chặt chẽ theo cơ chế **Chốt chặn kép (Two-tier Gating)**:
   - **Ratchet Metrics**: Cấm suy giảm độ chính xác trên các bộ test chuẩn (`baseline.json` và `confuse_baseline.json`).
   - **Decision Snapshot Contract**: Bắt buộc khớp 100% từng quyết định phân loại trong file snapshot `decisions.jsonl` (gồm **748 quyết định** đã commit). Bất kỳ sự thay đổi giá trị route nào mà chưa qua lệnh duyệt `--accept` đều khiến CI thất bại ngay lập tức (`exit code 1`).
   - **Tích hợp CI**: Lệnh `python -m pytest -q` trong `.github/workflows/ci.yml` tự động gọi `test_router_policy.py::test_router_contract_is_in_sync`, vốn thực thi trực tiếp `evals.router.check.main([]) == 0`.

2. **Hiện trạng Kiểm Thử `IntentType.KNOWLEDGE_QUERY`**:
   - Trong `decisions.jsonl`: Có đúng **158 / 748 quyết định** đang gán route `"knowledge_query"`.
   - Trong `evals/datasets/_routing/samples.jsonl`: Có **52 / 223 mẫu active** mong đợi `["knowledge_query"]`.
   - Trong `tests/data/intent_eval_cases.json`: Có **15 / 64 ca kiểm thử** mong đợi `"knowledge_query"`.
   - Trong `evals/router/stress.jsonl`: Có **83 / 504 ca** chứa mệnh đề `knowledge_query` (56 ca thuộc family `search`, 27 ca 2 mệnh đề).
   - Trong `evals/router/stress_confuse.jsonl`: Có **46 / 84 ca gốc** (khi nhân 6 biến thể nhiễu tạo thành 276 lượt chạy) có nhãn mong muốn chứa `'K'` (`knowledge_query`).
   - **Khoảng Trống Chí Mạng (The Critical Missing Dimension)**: Toàn bộ bộ test `evals/router/` hiện tại có **0 ca kiểm thử** nào dành cho truy vấn tiến độ học tập người dùng theo ADR-0010 (`known`, `learning`, `target`, thời gian ôn tập). Các ca này hiện chỉ được kiểm thử tách rời ở tầng agent e2e (`tests/test_lesson_status_e2e.py`) qua cơ chế chặn thô bằng regex trước router.

3. **Phân Loại Tác Động Khi Chia Sub-Intent**:
   Các ca kiểm thử `knowledge_query` hiện tại thực chất đang trộn lẫn 2 nhóm nghiệp vụ hoàn toàn khác nhau:
   - **Nhóm 1 (Vector RAG Search / Concept QA)**: 37/52 mẫu trong `samples.jsonl`, 14/15 ca trong `intent_eval_cases.json`, 100% ca trong `stress.jsonl`.
   - **Nhóm 2 (In-Memory Catalog / Roadmap Structure)**: 14/52 mẫu trong `samples.jsonl` (ví dụ: *"cho xem danh sach cac topic trong phan frontend"*, *"Show me all lessons under the DevOps mục"*, *"topic này có mấy bài"*), 1/15 ca trong `intent_eval_cases.json`.
   - **Nhóm 3 (ADR-0010 User Learning Progress)**: 1 mẫu liên quan gián tiếp (`routing-067`) và 0 mẫu chuyên biệt.

4. **Khuyến Nghị Thiết Kế Kiến Trúc & An Toàn CI**:
   - **Khuyến nghị áp dụng Phương án Phân Cấp (Hierarchical Sub-Intent)**: Giữ nguyên `IntentType.KNOWLEDGE_QUERY` làm intent cha ở tầng giao diện và router snapshot, bổ sung trường `sub_intent: Optional[KnowledgeSubIntent]` (hoặc `sub_type`) trong schema Pydantic `IntentClassificationResult`.
   - **Lợi ích vượt trội**: Đạt được mục tiêu tối ưu luồng thực thi downstream (chuyển Catalog sang in-memory, chuyển Progress sang Turso/SQLite, chuyển Search sang Vector RAG) mà **KHÔNG làm vỡ 158 quyết định snapshot trong `decisions.jsonl`** và không làm đỏ CI của các PR hiện tại.

---

## 2. Khảo Sát Toàn Diện Bộ Test Suite `evals/router/`

### 2.1. Cấu Trúc Thư Mục và Danh Mục Tệp Tin
Thư mục `roadmap-rag-assistant/evals/router/` chứa toàn bộ hợp đồng phân loại intent, write gate và các bộ đo lường stress/noise:

| Tên Tệp | Vai Trò / Trách Nhiệm | Cơ Chế Đánh Giá |
|---|---|---|
| `check.py` | Runner kiểm tra hợp đồng intent router (`python -m evals router-check`) | Chạy stress set + held-out sets, so sánh ratchet baseline và diff snapshot decisions |
| `baseline.json` | Ngưỡng chặn ratchet tối thiểu mà router không được phép tụt lùi | Bắt buộc: `wrong_write=0`, `dropped=0`, `misroute=0`, `routing.correct >= 223`, `intent_cases.correct >= 64` |
| `decisions.jsonl` | Snapshot đóng băng toàn bộ quyết định của router cho từng câu truy vấn | 748 dòng JSONL; bắt buộc khớp 100% từng trường (`route`, `row`, `write`, `rules`) |
| `generate_stress.py` | Script sinh dữ liệu stress có xác định (deterministic seed=7) | Sinh 504 câu từ 11 families bắt chéo với 12 loại nhiễu (noise) |
| `stress.jsonl` | Tập test stress 504 câu kiểm tra khả năng bóc tách mệnh đề và chống ghi nhầm | Đánh giá 4 outcome: `ok`, `undecided`, `misroute`, `wrong_write`, `dropped` |
| `confuse.py` | Runner kiểm tra các câu hỏi dễ gây nhầm lẫn (`evals.router.confuse`) | Chạy 84 câu gốc x 6 biến thể nhiễu (498 kết quả đo lường), kiểm tra gán lỗi theo Phase ($P_1 - P_8$) |
| `confuse_baseline.json` | Ngưỡng chặn ratchet cho confuse test | Giới hạn: `write_now_violation=0`, `missed_write <= 3`, `wrong_branch <= 103`, `preview_violation <= 35` |
| `stress_confuse.jsonl` | Dữ liệu kiểm thử nhầm lẫn ngữ nghĩa (semantic confusion) | 84 câu gốc phân theo 22 categories (từ ngữ đa nghĩa, mệnh đề CUD trong câu hỏi kỹ thuật, phủ định...) |
| `holdout.py` | Runner kiểm tra an toàn ghi dữ liệu (`evals.router.holdout`) | Chạy pipeline quyết định đến tầng write gate, đảm bảo câu đọc không bao giờ ghi trực tiếp |
| `holdout.jsonl` | Tập dữ liệu 60 câu kiểm tra write safety | Phân bổ nhãn write mong muốn: `no` (47), `any` (7), `now` (6) |
| `phases.py` | Runner kiểm tra độ chính xác từng chặng ban đầu ($P_1, P_2, P_3$) | Đánh giá độc lập nhãn `P1_act`, `P2_polarity`, `P3_target` |
| `budget.py` | Quản lý hạn mức gọi LLM và tính hợp lệ khi test live model (`--llm`) | Giới hạn số lượt gọi model, cảnh báo/đánh dấu INVALID nếu tỷ lệ lỗi > 10% |
| `messy.jsonl` | Tập test gồm các câu chứa nhiều loại nhiễu cùng lúc | Dùng để đo lường định tính, không chặn baseline cứng |
| `act_holdout.jsonl` | 23 câu held-out kiểm tra SpeechAct ($P_1$) | Kiểm tra nhận diện `question`, `command`, `statement` |
| `target_holdout.jsonl`| 30 câu held-out kiểm tra Target ($P_3$) | Phân biệt danh từ roadmap thật vs danh từ trong hệ thống khác |
| `polarity_holdout.jsonl`| 24 câu held-out kiểm tra Polarity ($P_2$) | Kiểm tra các mẫu phủ định yếu, câu hỏi giả định |
| `context_holdout.jsonl`| 12 câu held-out kiểm tra ngữ cảnh hội thoại | Kiểm tra tham chiếu *"topic vừa tạo"*, *"nội dung mơ hồ"* |
| `noise_target_holdout.jsonl`| 60 câu kiểm tra nhiễu trên target roadmap | Đánh giá độ bền vững khi thiếu dấu hoặc sai chính tả |

### 2.2. Các Bộ Dữ Liệu Tham Chiếu Bên Ngoài Thư Mục Router
Ngoài thư mục `evals/router/`, runner `check.py` còn nạp trực tiếp 2 nguồn dữ liệu quan trọng:
1. `evals/datasets/_routing/samples.jsonl`: 228 mẫu (223 mẫu `active`), là tập held-out thực tế thu thập từ người dùng, đánh giá độ chính xác tổng quát của Intent Router.
2. `tests/data/intent_eval_cases.json`: 64 ca kiểm thử vàng (golden intent test cases) dùng chung cho cả pytest và router-check.

### 2.3. Cơ Chế Hoạt Động Của Harness và Đảm Bảo Gating trong CI
Quy trình thực thi trong `evals/router/check.py`:
```python
def decide(router, text: str) -> dict:
    if is_sensitive_request(text, instruction=instruction_part(text)):
        return {"route": "refuse"}
    if is_plain_listing(text):
        return {"route": "list_topics"}
    if router.has_mixed_intents(text):
        return {"route": "mixed"}
    return router.decide(text).snapshot()
```

Đặc biệt lưu ý logic tính điểm held-out (lines 102 & 111 trong `check.py`):
```python
hit = d["route"] == heldout_want(s) or (heldout_want(s) == "knowledge_query" and d["route"] == "list_topics")
```
> **Phát hiện quan trọng**: Mã nguồn hiện tại đã phải cài cắm một ngoại lệ tương thích: Nếu nhãn mong đợi là `knowledge_query` nhưng router đi vào nhánh `list_topics`, hệ thống vẫn tính là `hit` (đúng). Điều này chứng minh rằng sự bất cập của việc gộp Catalog vào `knowledge_query` đã tồn tại từ trước và phải dùng bridge tạm trong code eval!

### 2.4. Quy Trình Chạy CI Tuyệt Đối Trong `.github/workflows/ci.yml`
Trong job `rag-service` của GitHub Actions, 5 bước sau chạy tuần tự trên Python 3.13:
```yaml
- name: Tests (incl. write invariants and the stress ratchet)
  run: python -m pytest -q

- name: Eval datasets and corpus are valid
  run: python -m evals validate

- name: Router contract (stress, held-out, decisions)
  run: python -m evals router-check

- name: Write safety, held-out set
  run: python -m evals.router.holdout

- name: Stress set, offline
  run: python -m evals.router.confuse
```
Nếu bất kỳ bước nào trong 5 bước trên trả về mã lỗi khác 0, CI sẽ lập tức dừng và báo đỏ.

---

## 3. Khảo Sát Hiện Trạng Kiểm Thử `IntentType.KNOWLEDGE_QUERY`

### 3.1. Phân Tích Thống Kê Trong `decisions.jsonl` (748 Decisions)
Trong 748 quyết định đã đóng băng:
- `chitchat`: 167 quyết định (22.3%)
- `roadmap_cud`: 165 quyết định (22.1%)
- **`knowledge_query`**: **158 quyết định (21.1%)**
- `undecided`: 118 quyết định (15.8%)
- `mixed`: 57 quyết định (7.6%)
- `out_of_scope`: 49 quyết định (6.5%)
- `plan_goal`: 21 quyết định (2.8%)
- `refuse`: 13 quyết định (1.7%)

Trong 158 quyết định `knowledge_query`, các quy tắc quyết định (`rules` / `row` từ `policy.py`) bao gồm:
- `row=search_word`: 134 quyết định (các từ khóa tìm kiếm: "tìm bài", "là gì", "thế nào", "có bài nào...")
- `row=roadmap_question`: 18 quyết định (câu hỏi về roadmap hoặc câu hỏi giả định/lịch sử không có từ khóa tìm kiếm rõ rệt)
- `row=known_title_question`: 4 quyết định (trùng tiêu đề bài học trong catalog)
- `row=show_request`: 2 quyết định ("cho xem danh sách...")

### 3.2. Bóc Tách 52 Mẫu `knowledge_query` Active Trong `_routing/samples.jsonl`
Phân tích ngữ nghĩa chi tiết của 52 mẫu active:

#### Nhóm A: Vector RAG Search / Khái Niệm / Hỏi Đáp Bài Học (37 mẫu - 71.2%)
Bản chất: Cần nhúng vector, tìm kiếm nội dung văn bản chi tiết trong bài học, tổng hợp qua LLM:
- Câu hỏi khái niệm: `routing-009` (*"token JWT là gì"*), `routing-011` (*"prompt injection là gì"*), `routing-012` (*"biến môi trường là gì"*), `routing-054` (*"closure trong javascript hoạt động thế nào"*), `routing-057` (*"What are the main differences between interface and type in TypeScript?"*), `routing-060` (*"sql injection la gi va phong tranh ntn"*), `routing-063` (*"giai thich giup e khai niem dependency injection"*), `routing-123` (*"RAG LÀ GÌ"*), `routing-182` (*"mục đích của chunking là gì"*), `routing-209` (*"can you explain what hybrid search is?"*)...
- Tìm kiếm bài học theo chủ đề: `routing-010` (*"tìm bài học về API key"*), `routing-024` (*"tìm bài học về Docker"*), `routing-034` (*"tìm bài về React và Vue"*), `routing-066` (*"tìm giúp mấy bài liên quan đến authentication và authorization"*), `routing-121` (*"TÌM BÀI VỀ KAFKA"*), `routing-135` (*"tìm bài về SQL injection"*)...
- Câu hỏi kỹ thuật có từ khóa CUD (False Friend): `routing-176` (*"cách tạo topic trong Kafka"*), `routing-177` (*"cách xóa item khỏi list trong Python"*), `routing-181` (*"layer normalization khác batch normalization thế nào"*), `routing-183` (*"group by trong SQL dùng thế nào"*)...

#### Nhóm B: In-Memory Catalog / Cấu Trúc Lộ Trình / Tra Cứu Mục Lục (14 mẫu - 26.9%)
Bản chất: Người dùng hỏi về danh mục, số lượng bài, vị trí bài, cây thư mục topic/section. Không cần vector search văn bản bài học, chỉ cần tra cứu RAM hoặc SQLite metadata:
1. `routing-056`: *"liệt kê tất cả các bài học thuộc topic 1 cho mình xem"*
2. `routing-058`: *"tim bai ve websocket xem no nam o dau"* (hỏi vị trí trong topic nào)
3. `routing-059`: *"cho xem danh sach cac topic trong phan frontend"* (danh sách topic)
4. `routing-061`: *"Show me all lessons under the DevOps mục"* (danh sách bài theo section)
5. `routing-062`: *"lộ trình hiện tại của mình có bao nhiêu bài tất cả vậy?"* (đếm tổng số bài)
6. `routing-064`: *"bài số 3 trong mục networking có nội dung gì thế"* (truy vấn theo số thứ tự mục lục)
7. `routing-065`: *"Which topics in my current roadmap cover asynchronous concepts?"* (quét danh sách topic)
8. `routing-067`: *"cho mình xem lại toàn bộ cấu trúc các topic của roadmap đang học"* (cấu trúc cây roadmap)
9. `routing-152`: *"topic này có mấy bài"* (đếm số bài của topic hiện tại)
10. `routing-153`: *"topic Backend có bao nhiêu bài học"* (đếm số bài của topic cụ thể)
11. `routing-154`: *"bài Docker nằm ở đâu"* (tìm topic/section chứa bài)
12. `routing-155`: *"roadmap AI gồm những gì"* (liệt kê thành phần roadmap)
13. `routing-199`: *"lộ trình AI Architecture có những topic nào"* (liệt kê topic của roadmap)
14. `routing-212`: *"bài đó thuộc topic nào"* (tra cứu quan hệ cha-con)

#### Nhóm C: Thứ Tự Học Tập / Tiền Đề / Tiến Trình (1 mẫu - 1.9%)
- `routing-188`: *"bài nào nên xem trước khi học RAG?"* (hỏi về prerequisite / thứ tự học tập).

### 3.3. Bóc Tách 15 Ca `knowledge_query` Trong `tests/data/intent_eval_cases.json`
- **14 ca thuộc Vector RAG Search**:
  - Khái niệm: *"token JWT là gì"*, *"prompt injection là gì"*, *"biến môi trường là gì"*, *"file .env dùng để làm gì"*, *"cách lưu token in localStorage"*, *"hybrid search là gì"*, *"hướng dẫn chunking"*, *"bài đó nói gì"*.
  - Tìm kiếm bài học: *"tìm bài học về API key"*, *"tìm bài học về Docker"*, *"có bài Docker k"*, *"tìm bài về React và Vue"*, *"tìm bài về vector database"*, *"có bài nào nói về reranking không"*.
- **1 ca thuộc In-Memory Catalog**:
  - *"danh sách bài trong layer Docker"* (dòng 200).

### 3.4. Bóc Tách 83 Ca Trong `evals/router/stress.jsonl`
- 56 ca thuộc `family = "search"`, sinh từ 4 mẫu template:
  - `"tìm bài về {n}"`
  - `"có bài nào về {n} không"`
  - `"giải thích {n} là gì"`
  - `"{n} hoạt động thế nào"`
  x 14 biến thể nhiễu (clean, no_diacritics, upper, question_mark, trailing_k, filler_prefix, filler_suffix, emoji, label_prefix, english_mix, newline_greeting...).
- 27 ca kết hợp 2 mệnh đề có chứa `knowledge_query` (ví dụ: `"{base}, rồi tìm bài về Docker"`).
- **Nhận xét**: 100% ca kiểm thử trong `stress.jsonl` hiện tại đều là **Vector RAG Search**. Hoàn toàn chưa có template nào cho Catalog hay Learning Progress trong script `generate_stress.py`.

### 3.5. Bóc Tách 46 Ca Trong `evals/router/stress_confuse.jsonl`
46 ca kiểm thử có nhãn mong muốn chứa `'K'` (`knowledge_query`):
- Các ca Catalog lẫn trong câu hỏi thực tế:
  - `[real-question] want=K`: *"bài Semantic Caching nằm ở topic nào"*
  - `[hypothetical] want=K|D|U`: *"giả sử mình xóa topic 2 thì roadmap còn bao nhiêu bài"*
- Các ca câu hỏi kỹ thuật có động từ CUD (False Friend): 9 ca (`cud-verb-in-tech-question`).
- Các ca đối tượng kỹ thuật ngoài roadmap (`entity-other-sense`): 3 ca.
- Các ca mã nguồn trong câu hỏi (`code-in-message`): 4 ca.

### 3.6. Khoảng Trống Kiểm Thử: Sự Vắng Mặt Tuyệt Đối Của ADR-0010
Kiểm tra chéo toàn bộ các tệp dataset trong `evals/router/`:
- `stress.jsonl`: 0 ca về trạng thái học tập.
- `stress_confuse.jsonl`: 0 ca về trạng thái học tập (chỉ có 1 câu nhiễu: *"tôi đang học RAG, giải thích chunking"*).
- `holdout.jsonl`: 0 ca.
- `_routing/samples.jsonl`: 0 ca hỏi trực tiếp về `known`, `learning`, `target`.
- `intent_eval_cases.json`: 0 ca.

> **Kết luận khảo sát hiện trạng**: `evals/router/` hiện chỉ bảo vệ tốt nhánh **Vector RAG Search** và bảo vệ một phần nhánh **Catalog Listing**. Nhánh **ADR-0010 Learning Progress** hoàn toàn là "vùng trắng" (untested) trong router evals!

---

## 4. Đánh Giá Tác Động Khi Phân Chia Sub-Intent Trên Eval CI

### 4.1. Đề Xuất 3 Nhánh Nghiệp Vụ (Sub-Intents)
Dựa trên phân tích thực tế mã nguồn downstream và router:
1. **`KNOWLEDGE_SEARCH`** (hoặc `search`): Tra cứu nội dung bài học, giải thích khái niệm, QA kỹ thuật qua Hybrid Vector RAG + Reranking + LLM Synthesis.
2. **`KNOWLEDGE_CATALOG`** (hoặc `catalog`): Tra cứu mục lục, danh sách topic/section, kiểm tra tồn tại của bài học, đếm số lượng bài, cấu trúc thứ tự qua In-Memory Catalog / SQLite adapter.
3. **`LEARNING_PROGRESS`** (hoặc `progress`): Tra cứu và quản lý tiến độ học tập cá nhân của Owner theo ADR-0010 (`known`, `learning`, `target`, ngày cập nhật ôn tập).

### 4.2. So Sánh 2 Hướng Tiếp Cận Kiến Trúc & Blast Radius Lên CI

#### Hướng Tiếp Cận A: Phân Cấp Sub-Intent (Hierarchical Schema - KHUYẾN NGHỊ CAO)
- **Thiết kế**: Giữ nguyên `IntentType.KNOWLEDGE_QUERY`. Mở rộng schema kết quả:
  ```python
  class KnowledgeSubIntent(str, Enum):
      SEARCH = "search"      # Vector RAG
      CATALOG = "catalog"    # In-memory Roadmap Catalog
      PROGRESS = "progress"  # ADR-0010 User Progress State

  class IntentClassificationResult(BaseModel):
      intent: IntentType
      confidence: float
      sub_intent: Optional[KnowledgeSubIntent] = None
      needs_cud_extraction: bool = False
      needs_confirmation: bool = False
  ```
- **Tác động lên CI**: **ZERO BREAKAGE (Không làm vỡ CI)**.
  - `evals/router/check.py`: Tiếp tục kiểm tra `d["route"] == "knowledge_query"`. Cả 158 quyết định snapshot trong `decisions.jsonl` giữ nguyên 100%.
  - `evals/router/baseline.json`: Không bị vi phạm ratchet.
  - `evals/router/confuse.py`: Hàm `branch()` vẫn map `"knowledge_query"` thành `"K"`.
  - Các bài test Pytest hiện có (`test_router_policy.py`, `test_intent_router_safety.py`, `test_router_regressions.py`...): Tiếp tục pass 100%.
  - Tầng agent downstream (`agent.py`): Đọc trường `intent_res.sub_intent` để rẽ nhánh thực thi tối ưu.

#### Hướng Tiếp Cận B: Tách Rời Enum Ở Tầng Cao (Flat Enum Division - BREAKING CHANGE)
- **Thiết kế**: Xóa hoặc thay thế `IntentType.KNOWLEDGE_QUERY` bằng 3 enum riêng biệt: `KNOWLEDGE_SEARCH`, `KNOWLEDGE_CATALOG`, `LEARNING_PROGRESS`.
- **Tác động lên CI**: **CRITICAL BREAKAGE (Vỡ toàn diện CI)**.
  - **158 / 748 quyết định** trong `decisions.jsonl` lập tức báo lỗi diff:
    ```
    ── decisions changed (158) ──
    'tìm bài về Docker'
        {'route': 'knowledge_query', ...}
     -> {'route': 'knowledge_search', ...}
    ```
    Lệnh `python -m evals router-check` trả về exit code 1.
  - **`baseline.json` bị kích hoạt ratchet failure**:
    `heldout.routing.correct` giảm từ 223 xuống 171 (mất 52 ca do mismatch enum).
    `heldout.intent_cases.correct` giảm từ 64 xuống 49 (mất 15 ca).
  - **`confuse.py` bị vỡ mapping**:
    Hàm `branch()` trong `confuse.py:75-83`:
    ```python
    return {"knowledge_query": "K", "roadmap_cud": "C", ...}.get(intent, intent)
    ```
    Nếu intent trả về `"knowledge_search"`, nó không map thành `"K"` mà trả về nguyên chuỗi `"knowledge_search"`, khiến điều kiện `b not in row["want"].split("|")` kích hoạt lỗi `wrong_branch` hàng loạt trên 46 ca gốc x 6 biến thể nhiễu (vượt trần ratchet `wrong_branch <= 103` trong `confuse_baseline.json`).
  - **Hàng loạt test suite Pytest thất bại**:
    - `test_router_policy.py::test_router_contract_is_in_sync` FAIL.
    - `test_intent_router_safety.py::test_implicit_questions_are_never_changes` FAIL (*"topic này có mấy bài"*, *"bài Docker nằm ở đâu"* đang assert cứng `IntentType.KNOWLEDGE_QUERY`).
    - `test_router_regressions.py::test_unaccented_and_move_requests_route_correctly` FAIL (*"cho xem danh sach cac topic..."* đang assert cứng `IntentType.KNOWLEDGE_QUERY`).
    - `test_guardrails.py`, `test_suggestion_routing.py`, `test_scope.py`... FAIL.

### 4.3. Bảng Ma Trận Tác Động Lên Toàn Bộ Test Cases Hiện Tại

| Bộ Test / Tệp Dữ Liệu | Số Ca Bị Ảnh Hưởng | Hướng A (Hierarchical) | Hướng B (Flat Enum) | Chi Tiết Xử Lý Cần Thiết Nếu Đi Theo Hướng B |
|---|---|---|---|---|
| `evals/router/decisions.jsonl` | 158 / 748 | **0** (Pass) | **158** (Fail) | Phải chạy `python -m evals router-check --accept` để ghi đè toàn bộ 158 snapshot |
| `evals/datasets/_routing/samples.jsonl` | 52 / 223 | **0** (Pass) | **52** (Fail) | Phải migrate nhãn: 37 ca sang `knowledge_search`, 14 ca sang `knowledge_catalog`, 1 ca sang `learning_progress` |
| `tests/data/intent_eval_cases.json` | 15 / 64 | **0** (Pass) | **15** (Fail) | Phải migrate nhãn: 14 ca sang `knowledge_search`, 1 ca sang `knowledge_catalog` |
| `evals/router/stress.jsonl` | 83 / 504 | **0** (Pass) | **83** (Fail) | Phải sửa `generate_stress.py` (biến `KQ = "knowledge_search"`), sinh lại và commit `stress.jsonl` |
| `evals/router/stress_confuse.jsonl` | 46 / 84 | **0** (Pass) | **46** (Fail) | Phải cập nhật `confuse.py::branch()` hỗ trợ alias hoặc sửa nhãn `'K'` thành `'KS'/'KC'` |
| `evals/router/baseline.json` | 2 metrics | **0** (Pass) | **2** (Fail) | Bị ratchet chặn nếu không update đồng bộ `samples.jsonl` và `intent_eval_cases.json` |
| `evals/router/confuse_baseline.json`| 1 metric | **0** (Pass) | **1** (Fail) | Vượt ngưỡng `wrong_branch` nếu chưa sửa hàm `branch()` trong `confuse.py` |
| `tests/test_router_policy.py` | Line 213 & 147 | **0** (Pass) | **2** (Fail) | Contract test fail + fixture mock test fail |
| `tests/test_intent_router_safety.py` | 4 ca | **0** (Pass) | **4** (Fail) | Assert cứng `IMPLICIT_QUESTIONS` và `TRICKY_SHAPES` bị fail |
| `tests/test_router_regressions.py` | 3 ca | **0** (Pass) | **3** (Fail) | Assert cứng `UNACCENTED` bị fail |
| `tests/test_scope.py` | 2 ca | **0** (Pass) | **2** (Fail) | Assert cứng `Scope` routing ra `KNOWLEDGE_QUERY` |

---

## 5. Kế Hoạch Bổ Sung Test Cases & Mở Rộng Độ Bao Phủ

Để hệ thống kiểm thử thực sự phản ánh và bảo vệ được 3 nhánh nghiệp vụ mới, cần bổ sung các ca kiểm thử sau:

### 5.1. Ca Kiểm Thử Cần Bổ Sung Cho Nhánh `CATALOG`
Hiện tại các câu hỏi cấu trúc bị xếp lẫn vào `search_word` hoặc `roadmap_question`. Cần bổ sung các ca kiểm thử đặc thù:
1. **Truy vấn danh sách/mục lục trực diện**:
   - *"danh sách toàn bộ topic"*
   - *"cho xem các bài trong topic AI Engineering"*
   - *"topic Backend gồm những section nào"*
   - *"liệt kê các lesson thuộc phần RAG"*
2. **Truy vấn vị trí / quan hệ cha-con (Hierarchical Navigation)**:
   - *"bài Semantic Caching nằm ở đâu"*
   - *"bài Redis thuộc topic nào vậy"*
   - *"mục Vector Database nằm trong topic nào"*
3. **Truy vấn định lượng (Counts / Totals)**:
   - *"roadmap này có tổng cộng bao nhiêu bài"*
   - *"topic Machine Learning có mấy bài học"*
   - *"mỗi topic có trung bình bao nhiêu lesson"*

### 5.2. Ca Kiểm Thử Cần Bổ Sung Cho Nhánh `LEARNING_PROGRESS` (ADR-0010)
Cần xóa bỏ khoảng trắng kiểm thử bằng cách thêm tối thiểu 20 ca kiểm thử vào `_routing/samples.jsonl` và `intent_eval_cases.json`:
1. **Truy vấn bài cần ôn tập (Review Needed - Query c)**:
   - *"bài nào cần ôn lại"*
   - *"những bài đã nắm lâu rồi chưa xem lại"*
   - *"cho tôi danh sách bài cần ôn trong topic AI"*
2. **Truy vấn bài học tiếp theo (Next Learning - Query b)**:
   - *"nên học gì tiếp"*
   - *"bài nào đang học dở"*
   - *"gợi ý bài tiếp theo trong roadmap"*
   - *"sau bài Docker thì học bài nào"*
3. **Truy vấn tổng quan kiến thức cá nhân (What I Know - Query a)**:
   - *"tôi đang biết gì về RAG"*
   - *"tôi đã nắm được những bài nào rồi"*
   - *"tiến độ học tập của tôi đến đâu rồi"*
   - *"tôi đã hoàn thành bao nhiêu % roadmap"*
4. **Lệnh cập nhật trạng thái (Status Change Command - Action d)**:
   - *"đánh dấu bài Kafka là đã nắm"*
   - *"chuyển bài Docker sang đang học"*
   - *"đặt trạng thái bài RAG thành mục tiêu"*
   - (Lưu ý: Nhánh này phải kích hoạt preview xác nhận, không chạy ghi trực tiếp).

### 5.3. Ca Kiểm Thử Phân Định Ranh Giới (Disambiguation / Boundary Cases)
Các cặp câu dễ gây nhầm lẫn cần đưa vào `stress_confuse.jsonl`:
- **Cặp 1 (Catalog vs Search)**:
  - *"bài Semantic Caching nằm ở đâu"* $\rightarrow$ **CATALOG** (hỏi vị trí cây thư mục).
  - *"Semantic Caching hoạt động thế nào"* $\rightarrow$ **SEARCH** (hỏi nội dung kiến thức).
- **Cặp 2 (Search vs Progress Context)**:
  - *"tôi đang học RAG, giải thích chunking"* $\rightarrow$ **SEARCH** (mặc dù có từ *"đang học"*, trọng tâm là giải thích chunking).
  - *"tôi đang học những bài nào trong topic RAG"* $\rightarrow$ **PROGRESS** (hỏi danh sách bài trạng thái `learning`).
- **Cặp 3 (Catalog vs CUD Command)**:
  - *"xem trước roadmap cho backend"* $\rightarrow$ **PLAN_GOAL** (lập kế hoạch).
  - *"xem danh sách bài trong roadmap backend"* $\rightarrow$ **CATALOG** (tra cứu danh mục).
  - *"tạo lộ trình backend"* $\rightarrow$ **ROADMAP_CUD** (tạo mới entity).

---

## 6. Phân Tích Rủi Ro Hồi Quy (Regression Risks) & Biện Pháp Phòng Ngừa

### Rủi Ro 1: "Snapshot Lock-out" Khi Chạy CI
- **Cơ chế rủi ro**: Runner `evals/router/check.py` thực hiện so sánh cứng:
  ```python
  changed = [(t, old_decisions[t], d) for t, d in decisions.items() if t in old_decisions and old_decisions[t] != d]
  if changed or added or removed:
      print("Decisions differ from decisions.jsonl: review the diff above, then rerun with --accept")
      return 1
  ```
  Nếu sửa đổi router khiến một câu đổi nhãn từ `knowledge_query` sang tên khác mà không chạy `--accept`, toàn bộ pull request trên CI sẽ bị chặn đứng ngay ở lệnh `python -m pytest -q` (vì `test_router_policy.py` gọi `check.main([]) == 0`).
- **Biện pháp phòng ngừa**:
  - Triển khai theo **Hướng A (Hierarchical Sub-intent)**: Không thay đổi trường `route` ở snapshot cấp 1, chỉ bổ sung metadata hoặc thêm trường `sub_intent` trong snapshot nội bộ.
  - Hoặc nếu đi theo Hướng B: Lập quy trình migrate 1-shot có review diff cẩn trọng bằng lệnh `.venv/bin/python -m evals router-check --accept`.

### Rủi Ro 2: Nhầm Lẫn Giữa Mệnh Lệnh Đổi Trạng Thái và Câu Hỏi Kiến Thức
- **Cơ chế rủi ro**: Các câu như *"đánh dấu bài Docker đã học"* nếu bị router nhận diện nhầm thành `KNOWLEDGE_SEARCH` sẽ kích hoạt Vector RAG và trả lời lộn xộn. Ngược lại, nếu câu hỏi *"Docker là gì"* bị nhận diện nhầm thành lệnh đổi trạng thái, nó sẽ kích hoạt card preview xác nhận ghi vào cơ sở dữ liệu.
- **Biện pháp phòng ngừa**:
  - Áp dụng nguyên tắc chốt chặn của ADR-0010: Tách bạch rõ SpeechAct ($P_1$).
  - Chỉ khi có động từ chuyển đổi trạng thái tường minh (`đánh dấu`, `chuyển`, `đặt`, `mark`) đi kèm trạng thái hợp lệ (`known`, `learning`, `target`) mới được xếp vào lệnh thay đổi tiến độ.

### Rủi Ro 3: Vi Phạm Quyền Riêng Tư (Privacy Boundary Leakage)
- **Cơ chế rủi ro**: Dữ liệu tiến độ học tập (`status`, `statusUpdatedAt`) là dữ liệu cá nhân của Owner. Vector RAG và Catalog là dữ liệu công khai (Public). Nếu router điều hướng sai một câu hỏi của Visitor vào nhánh `LEARNING_PROGRESS` mà không kiểm tra quyền, hoặc ngược lại làm rò rỉ trạng thái vào Vector RAG index.
- **Biện pháp phòng ngừa**:
  - Duy trì kiểm tra `is_owner()` fail-closed ở downstream.
  - Đảm bảo pipeline Ingestion của Vector RAG tuyệt đối không đánh chỉ mục (index) các trường `status` của bài học.

---

## 7. Lộ Trình Triển Khai Kiểm Thử An Toàn (Phased Validation Roadmap)

Để đảm bảo quá trình tiến hóa hệ thống diễn ra an toàn, không gián đoạn CI của repository, khuyến nghị lộ trình 3 giai đoạn:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Giai đoạn 1: Mở rộng Schema Phi Phá Vỡ (Non-breaking Extension)            │
│ - Giữ IntentType.KNOWLEDGE_QUERY                                            │
│ - Bổ sung KnowledgeSubIntent: SEARCH, CATALOG, PROGRESS                     │
│ - CI giữ nguyên 100% xanh, không đổi decisions.jsonl                        │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Giai đoạn 2: Bổ sung Dataset & Dual-Eval Harness                           │
│ - Bổ sung 20+ test cases cho Catalog & Progress vào _routing/samples.jsonl │
│ - Cập nhật generate_stress.py sinh thêm catalog queries                     │
│ - Bổ sung runner kiểm tra độ chính xác sub-intent độc lập                  │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Giai đoạn 3: Tối Ưu Downstream & Đồng Bộ Toàn Diện                         │
│ - Nối sub_intent vào agent.py (bỏ interceptor regex thô)                   │
│ - Rà soát diff decisions.jsonl bằng `python -m evals router-check`          │
│ - Duyệt và chốt snapshot mới bằng `python -m evals router-check --accept`  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Chi Tiết Từng Giai Đoạn:

#### Giai Đoạn 1: Mở Rộng Schema Phi Phá Vỡ (Tuần 1)
- **Mục tiêu**: Chuẩn bị nền tảng typing mà không tác động tiêu cực đến CI hiện có.
- **Công việc**:
  1. Thêm `KnowledgeSubIntent` trong `rag_service/domains/roadmap/router/schemas.py`.
  2. Thêm trường tùy chọn `sub_intent: Optional[KnowledgeSubIntent] = None` vào `IntentClassificationResult`.
  3. Cập nhật `policy.py`: Các row thuộc `KNOWLEDGE_QUERY` được gán thêm metadata `sub_intent`:
     - `search_word`, `known_title_question`, `how_to_question` $\rightarrow$ `sub_intent=KnowledgeSubIntent.SEARCH`.
     - `show_request`, `roadmap_question` (dạng vị trí/số lượng) $\rightarrow$ `sub_intent=KnowledgeSubIntent.CATALOG`.
  4. Chạy xác thực CI: `yarn verify-ci` hoặc `python -m pytest -q` + `python -m evals router-check` đảm bảo exit code 0.

#### Giai Đoạn 2: Xây Dựng Dataset Kiểm Thử Chuyên Biệt (Tuần 2)
- **Mục tiêu**: Thiết lập baseline đo lường cho các nhánh mới.
- **Công việc**:
  1. Bổ sung nhãn `sub_intent` trong `metadata` của các mẫu trong `evals/datasets/_routing/samples.jsonl`.
  2. Bổ sung 20 mẫu thực tế cho ADR-0010 Learning Progress vào dataset.
  3. Mở rộng `generate_stress.py`: Thêm family `catalog_query` (ví dụ: `"topic {t} có mấy bài"`, `"danh sách bài trong topic {t}"`).
  4. Viết script đánh giá phụ `evals/router/sub_intent_check.py` để đo độ chính xác phân loại sub-intent độc lập mà không can thiệp vào `check.py`.

#### Giai Đoạn 3: Hoàn Thiện Downstream & Cập Nhật Hợp Đồng (Tuần 3)
- **Mục tiêu**: Tối ưu hóa luồng thực thi trong `agent.py` và đóng băng hợp đồng mới.
- **Công việc**:
  1. Trong `agent.py`: Thay thế việc kiểm tra regex thô (`handle_listing`, `handle_sections`, `handle_lesson_status`) bằng việc đọc trực tiếp `intent_res.sub_intent`.
  2. Chạy full suite kiểm thử:
     ```bash
     cd roadmap-rag-assistant
     python -m pytest tests/ -q
     python -m evals router-check
     python -m evals.router.holdout
     python -m evals.router.confuse
     ```
  3. Đánh giá diff trên `decisions.jsonl`. Sau khi nhóm kiến trúc thẩm định toàn bộ các thay đổi, thực hiện cập nhật snapshot bằng:
     ```bash
     python -m evals router-check --accept
     ```
  4. Commit snapshot và baseline mới vào git repository.

---

## 8. Kết Luận

1. **Khảo sát đã chứng minh**: Bộ kiểm thử `evals/router/` có kỷ luật cực cao về tính toàn vẹn (ratchet gating và decision snapshot). Bất kỳ phương án chia sub-intent nào thay đổi đột ngột top-level enum sẽ kích hoạt chuỗi vỡ test trên diện rộng (158 decision snapshot, 52 routing samples, 15 intent cases, 83 stress samples, 46 confuse samples, và hàng chục unit tests trong Pytest).
2. **Giải pháp kiến trúc tối ưu nhất**: Phân chia sub-intent theo mô hình phân cấp (**Hierarchical Sub-Intent** trên Pydantic schema). Phương án này bảo toàn 100% hợp đồng CI hiện tại, đồng thời cung cấp đầy đủ thông tin phân luồng cho `agent.py` để tách biệt chi phí tài nguyên giữa Vector RAG, In-memory Catalog và SQLite Progress Tracking.
3. Toàn bộ khảo sát tuân thủ nghiêm ngặt nguyên tắc Read-Only, không có bất kỳ file mã nguồn hay dataset nào bị thay đổi.
