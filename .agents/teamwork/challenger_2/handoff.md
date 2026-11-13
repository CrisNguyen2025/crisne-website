# Handoff Report — challenger_2 (Empirical Adversarial Challenge)

## 1. Observation
- **Target document analyzed:** `roadmap-rag-assistant/docs/knowledge-sub-intents-design.md` (Sections 3.2, 3.3, 3.4, 3.5, 4.2, 4.3).
- **Existing Router Codebase:**
  - `rag_service/domains/roadmap/router/policy.py:234`: `SEARCH_WORDS` contains `"danh sách"`, `"liệt kê"`, `"list"`.
  - `rag_service/domains/roadmap/router/policy.py:412-420`: `Row("search_word")` is evaluated before `Row("roadmap_question")` and `Row("show_request")`.
  - `rag_service/domains/roadmap/router/policy.py:278`: `CUD_VERB_WORDS` lacks `"đánh dấu"`.
  - `rag_service/domains/roadmap/lesson_status.py:151-161`:
    - `_NEXT_CUE = re.compile(r"\b(?:hoc\s+gi\s+tiep|nen\s+hoc\s+gi|hoc\s+tiep|...)\b")`
    - `_KNOWN_CUE = re.compile(r"\b(?:dang\s+biet\s+gi|da\s+biet\s+gi|...|tien\s+do)\b")`
    - `_REVIEW_CUE = re.compile(r"\b(?:on\s+lai|can\s+on|...)\b")`
- **Empirical Execution Results (`empirical_harness.py`):**
  - Suite 1 (18 typical queries): 16/18 passed (88.9%). Failed on:
    - `"Hôm nay tôi nên học bài gì tiếp theo?"` -> fell back to `SEARCH` because `"bài"` is inserted between `"học"` and `"gì"`.
    - `"Gợi ý cho mình bài tiếp theo cần học trong lộ trình Frontend"` -> fell back to `SEARCH`.
  - Suite 2 (5 ambiguity pairs): 6/9 passed (66.7%). Failed on:
    - `"Tôi đang học những bài nào trong topic RAG"` -> fell back to `SEARCH` because `_KNOWN_CUE` lacks `"đang học những bài nào"`.
    - `"Xem danh sách bài trong roadmap Backend"` -> fell back to `SEARCH`.
    - `"Bài Docker đã nắm chưa"` -> fell back to `SEARCH`.
  - Suite 3 (24 proposed eval cases): 17/24 passed (70.8%).
  - Suite 4 (158 decisions in `evals/router/decisions.jsonl`):
    - Total `row=roadmap_question` decisions: 52.
    - Exactly 7 decisions (13.5%) are position/quantity/listing: `'bài Docker nằm ở đâu'`, `'topic Backend có bao nhiêu bài học'`, `'topic này có mấy bài'`, etc.
    - 45 decisions (86.5%) are hypothetical CUD questions (`'nếu xóa topic AI thì có mất bài không'`), past reports (`'ai đã xóa bài Redis k'`), or content questions (`'bài đó nói gì'`).
  - Suite 5 (Adversarial):
    - `"Tiến độ giải ngân vốn đầu tư công hiện nay thế nào"` -> misclassified as `PROGRESS` due to bare `"tiến độ"`.
    - `"tìm giúp mấy bài liên quan đến authentication"` -> misclassified as `CATALOG` due to `"mấy bài"`.
- **Integrity Status (`git status -s`):**
  - Only untracked `.agents/teamwork/` and `roadmap-rag-assistant/docs/knowledge-sub-intents-design.md`.
  - Zero files modified in `rag_service/domains/roadmap/router/` or `evals/router/`.

---

## 2. Logic Chain
1. *From Observation on `roadmap_question`:*
   The design doc states in Section 4.3 Phase 1: `"Dòng roadmap_question (dạng vị trí/số lượng), show_request -> gán sub_intent=KnowledgeSubIntent.CATALOG"`.
   In `policy.py`, there is currently only ONE `Row("roadmap_question", ...)` without position/quantity filtering.
   If an engineer applies `sub_intent=KnowledgeSubIntent.CATALOG` to `Row("roadmap_question")`, all 52 decisions in `decisions.jsonl` will receive `CATALOG`.
   Since 86.5% of those 52 decisions are hypothetical CUD questions or content inquiries (`bài đó nói gì`), dispatching them to the In-Memory Catalog engine will cause downstream failure (returning topic lists/counts instead of answering the query).
2. *From Observation on `SEARCH_WORDS` and `Row("search_word")`:*
   Because `"danh sách"` and `"liệt kê"` are in `SEARCH_WORDS`, and `Row("search_word")` is matched before `Row("roadmap_question")` and `Row("show_request")`, queries asking for topic/section listings (e.g. `"cho xem danh sach cac topic trong phan frontend"`) match `row=search_word`.
   If `search_word` is mapped to `SEARCH`, these listing queries are dispatched to Vector RAG instead of Catalog.
3. *From Observation on `lesson_status.py` Regexes:*
   Progress queries with natural word order variations (e.g. inserting `"bài"` in `"nên học bài gì"`, or asking `"đang học những bài nào"`) fail to trigger `_NEXT_CUE` and `_KNOWN_CUE`.
   When they fail, they fall through to default Vector RAG, which contains no user status data, triggering LLM progress hallucination (Failure Mode 1 in Section 2.4).
4. *From Observation on `CUD_VERB_WORDS`:*
   `policy.py` does not contain `"đánh dấu"`. When `handle_lesson_status` is moved behind the router in Phase 3, commands like `"đánh dấu bài Docker là đang học"` will be returned as `intent: None` (undecided) by the router, risking misclassification by LLM fallback.

---

## 3. Caveats
- The test harness tested deterministic heuristic rules ($P_0 - P_5$). LLM Router fallback was not invoked because the project constraints prohibit external API token expenditure during offline verification.
- The evaluation focused on Vietnamese linguistic variations and English queries present in the dataset. Unusual dialects or non-standard slang were not exhaustively tested.
- No source code or eval datasets were modified, per strict scope instructions.

---

## 4. Conclusion
**VERDICT: REQUEST_CHANGES**

The Hierarchical Sub-Intent Architecture (`IntentType.KNOWLEDGE_QUERY` at level 1, `KnowledgeSubIntent` at level 2) is verified to be conceptually robust and CI-compatible (0 snapshot diffs on `decisions.jsonl` when `route` is preserved).
However, the design document requires technical revisions before proceeding with Phase 1:
1. **Section 4.3 (Phase 1):** Explicitly require splitting `Row("roadmap_question")` into a structural catalog row (`needs="catalog_cue"`) and a default search row, rather than assuming a single row can be mapped to `CATALOG`.
2. **Section 4.3 (Phase 1):** Add a catalog listing row before `Row("search_word")` to prevent listing queries from being captured by `SEARCH_WORDS`.
3. **Section 4.3 (Phase 3):** Add `"đánh dấu"` to `CUD_VERB_WORDS` in `policy.py` and specify regex broadening for `lesson_status.py` before removing pre-router interceptors.
4. **Section 3.5:** Update the ambiguity matrix with disambiguation rules for false friends (`"tiến độ"`, `"mấy bài"`).

---

## 5. Verification Method
To independently verify all findings and test suites:

```bash
# 1. Run empirical test harness (Suite 1, 2, 3, 4, 5)
roadmap-rag-assistant/.venv/bin/python .agents/teamwork/challenger_2/empirical_harness.py

# 2. Verify 86.5% non-catalog breakdown of roadmap_question in decisions.jsonl
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

# 3. Verify zero files in router code or eval datasets were modified
git status -s
```

*Invalidation condition:* If running `empirical_harness.py` produces 100% pass on Suite 1, 2, 3, or if `roadmap_question` in `decisions.jsonl` contains >50% catalog queries, the conclusion would be invalidated. Empirically, both conditions hold true.
