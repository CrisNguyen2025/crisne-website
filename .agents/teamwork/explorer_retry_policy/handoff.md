# Handoff Report — explorer_retry_policy (Policy Rule Ordering & Roadmap Question Splitting Specification)

## 1. Observation

- **Target Documents & Code Analyzed:**
  - `roadmap-rag-assistant/docs/knowledge-sub-intents-design.md`: Lines 470–482 (statistics), Line 586 (Phase 1 mapping), Lines 605–618 (Phase 3 downstream).
  - `.agents/teamwork/challenger_2/report.md`: Section 4, Issues 1 & 2.
  - `roadmap-rag-assistant/rag_service/domains/roadmap/router/policy.py`: Lines 233–237 (`SEARCH_WORDS`), Lines 396–422 (`DECISION_TABLE`), Lines 361–375 (`WRITE_BLOCKER_PATTERNS`).
  - `roadmap-rag-assistant/rag_service/domains/roadmap/router/understanding.py`: Lines 212–214 (`has_search`, `has_object`), Lines 250–265 (`SpeechAct.QUESTION`).
  - `roadmap-rag-assistant/evals/router/decisions.jsonl`: 158 decisions with `route == "knowledge_query"`.

- **Empirical Execution Observations:**
  1. *Observation 1 (52 Decisions of `row=roadmap_question`):*
     Running query breakdown on `evals/router/decisions.jsonl` with `roadmap-rag-assistant/.venv/bin/python`:
     - Exactly **7 decisions (13.5%)** are structural position or count queries:
       `'bài Docker nằm ở đâu'`, `'bài đó thuộc topic nào'`, `'topic Backend có bao nhiêu bài học'`, `'topic này có mấy bài'`, `'lộ trình hiện tại của mình có bao nhiêu bài tất cả vậy?'`, `'lộ trình AI Architecture có những topic nào'`, `'roadmap AI gồm những gì'`.
     - Exactly **45 decisions (86.5%)** are non-catalog questions:
       - 26 hypothetical CUD questions: `'nếu xóa topic AI thì có mất bài không'` (12 variants with emojis, noise, greetings, casing), `'xóa topic DevOps có ảnh hưởng gì không'` (13 variants), `'nếu đổi tên topic thì link cũ có còn chạy không?'`.
       - 5 audit/history questions: `'ai đã xóa bài Redis k'` (2 variants), `'hôm qua tôi đã tạo topic Test Router k'` (2 variants), `'tôi vừa thêm bài Redis vào topic DevOps rồi k'`.
       - 8 negated CUD inquiries: `'đừng xóa bài Machine Learning k'`, `'khoan, chưa thêm bài Machine Learning vội k'`, `'không cần tạo topic ZZ Test k'`, `'thôi không xóa bài Redis nữa k'`.
       - 6 content QA / advice questions: `'bài đó nói gì'`, `'bài đó nói về cái gì vậy?'`, `'bài số 3 trong mục networking có nội dung gì thế'`, `'trong bài docker căn bản bạn đã ghi những ý chính nào rồi?'`, `'bài nào nên xem trước khi học RAG?'`, `'có bài Docker k'`.
  2. *Observation 2 (`SEARCH_WORDS` and Precedence Inversion):*
     - `SEARCH_WORDS` at `policy.py:233` contains `"danh sách"`, `"liệt kê"`, `"list"`, `"show me"`.
     - In `DECISION_TABLE:396-422`, `Row("search_word")` is at row 9, prior to `Row("roadmap_question")` (row 11) and `Row("show_request")` (row 14).
     - In `decisions.jsonl`, 4 structural catalog listing queries are classified under `rules: ['row=search_word', ...]`:
       - `'Show me all lessons under the DevOps mục'`
       - `'cho xem danh sach cac topic trong phan frontend'`
       - `'danh sách bài trong layer Docker'`
       - `'liệt kê tất cả các bài học thuộc topic 1 cho mình xem'`
  3. *Observation 3 (Design Doc Erroneous Statistics):*
     - `knowledge-sub-intents-design.md:477-482` states: `row=search_word: 134`, `row=roadmap_question: 18`.
     - Actual counts in `decisions.jsonl`: `row=search_word: 102`, `row=roadmap_question: 52`, `row=how_to_question: 2`, `row=show_request: 1`, `row=clause:roadmap_question: 1` (Total 158).
  4. *Observation 4 (Integrity State):*
     `git status -s` shows zero modifications in `rag_service/domains/roadmap/router/` or `evals/router/`.

---

## 2. Logic Chain

1. *From Observation 1 to Need for Splitting `roadmap_question`:*
   The current design doc at Line 586 instructs: `"Dòng roadmap_question (dạng vị trí/số lượng) -> gán sub_intent=KnowledgeSubIntent.CATALOG"`.
   In `policy.py:415`, `DECISION_TABLE` contains only a single rule:
   `Row("roadmap_question", IntentType.KNOWLEDGE_QUERY, 0.90, act=SpeechAct.QUESTION, target=Target.ROADMAP)`
   If this row is assigned `sub_intent=CATALOG`, all 52 decisions in `decisions.jsonl` will receive `sub_intent=CATALOG`.
   Because 45 of those decisions (86.5%) are hypothetical CUD questions, audit inquiries, or content QA, routing them to the In-Memory Catalog engine (which has 0 LLM tokens, 0 vector embeddings, and only renders RAM structures) will result in downstream execution failure or empty responses.
   Therefore, `roadmap_question` must be split into two discrete rules:
   - `roadmap_catalog_query` (`needs="catalog_cue"`, `sub_intent=CATALOG`) for the 7 position/count decisions (13.5%).
   - `roadmap_content_query` (fallback without `catalog_cue`, `sub_intent=SEARCH`) for the 45 non-catalog decisions (86.5%).

2. *From Observation 2 to Need for Precedence Reordering:*
   Catalog listing queries contain listing keywords (`"danh sách"`, `"liệt kê"`, `"list"`, `"show me"`) as well as container objects (`"topic"`, `"layer"`, `"section"`).
   Because `SEARCH_WORDS` includes these listing words and `Row("search_word")` is positioned before any catalog row and lacks a `target` constraint (`target=None`), `Row("search_word")` matches first.
   If `Row("search_word")` is assigned `sub_intent=SEARCH`, these catalog listing queries are forced into Vector RAG (800ms–3,500ms latency, 2 API calls) instead of In-Memory Catalog (5ms–40ms latency, 0 API calls).
   By applying the architectural principle **"Domain-Specific Structured Rules Precede Generic Keyword Rules"**, placing `catalog_list_query` and `roadmap_catalog_query` before `search_word` ensures that catalog listing requests are properly routed to `CATALOG`.

3. *From Observations 1, 2, and 3 to Concrete Fix Specifications:*
   Updating `knowledge-sub-intents-design.md` with explicit 18-row `DECISION_TABLE` specifications, corrected snapshot statistics, regex definitions (`POSITION_CUE`, `COUNTING_CUE`, `HIERARCHY_CUE`, `CATALOG_CONTAINER`, `LIST_VERBS`), and write blocker filters resolves all 5 edge conflicts identified by `challenger_2`.

---

## 3. Caveats

- **Read-Only Investigation:** No code or eval dataset files were modified in `rag_service/domains/roadmap/router/` or `evals/router/`.
- **Heuristic Focus:** Analysis concentrated on deterministic rules ($P_0 - P_5$). LLM router fallback queries were not executed over external APIs to avoid token expenditure.
- **CI Ratchet Acceptance:** Changing row names in `DECISION_TABLE` will alter the `"rules"` field in snapshot output (`row=roadmap_catalog_query` for 7 decisions, `row=roadmap_content_query` for 45 decisions). This requires running `python -m evals router-check --accept` during Phase 1/2 rollout, which is an intended semantic enhancement rather than a regression.

---

## 4. Conclusion

The empirical findings of `challenger_2` regarding the 86.5% non-catalog lumping trap and `search_word` precedence inversion are fully validated.
To remediate these issues, `roadmap-rag-assistant/docs/knowledge-sub-intents-design.md` must be updated with two core technical specifications:

1. **Split `roadmap_question` into:**
   - `Row("roadmap_catalog_query", IntentType.KNOWLEDGE_QUERY, 0.90, act=SpeechAct.QUESTION, target=Target.ROADMAP, needs="catalog_cue", sub_intent=KnowledgeSubIntent.CATALOG)`
   - `Row("roadmap_content_query", IntentType.KNOWLEDGE_QUERY, 0.90, act=SpeechAct.QUESTION, target=Target.ROADMAP, sub_intent=KnowledgeSubIntent.SEARCH)`
   Where `catalog_cue` matches `COUNTING_CUE`, `POSITION_CUE`, or `HIERARCHY_CUE`, and strictly filters out write blockers (`hypothetical`, `past_report`).
2. **Specify `DECISION_TABLE` Precedence Order:**
   Place specific structured sub-intent rules (`progress_query`, `catalog_list_query`, `roadmap_catalog_query`) at rows 9–11, strictly **BEFORE** generic `search_word` at row 12.
3. Detailed specifications, regexes, and exact text amendments for Sections 1.4, 3.2, 3.3, 3.5, 4.1, 4.3 (Phase 1 & Phase 3) are compiled in `.agents/teamwork/explorer_retry_policy/report.md`.

---

## 5. Verification Method

To independently verify all findings and classification benchmarks:

```bash
# 1. Verify 13.5% Catalog vs 86.5% Content split on the 52 roadmap_question decisions
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

# 2. Verify 4 catalog listing queries trapped in row=search_word
roadmap-rag-assistant/.venv/bin/python -c '
import sys, json
sys.path.insert(0, "roadmap-rag-assistant")
with open("roadmap-rag-assistant/evals/router/decisions.jsonl") as f:
    decisions = [json.loads(line) for line in f]
targets = [
    "Show me all lessons under the DevOps mục",
    "cho xem danh sach cac topic trong phan frontend",
    "danh sách bài trong layer Docker",
    "liệt kê tất cả các bài học thuộc topic 1 cho mình xem",
]
for d in decisions:
    if d["input"] in targets:
        print(f"Trapped query: {d[\"input\"]} -> rules: {d.get(\"rules\")}")
'

# 3. Verify clean git status (zero source or eval modifications)
git status -s
```

*Invalidation conditions:*
- If `decisions.jsonl` contains >20% structural/counting questions under `row=roadmap_question`, the 86.5% lumping premise is invalidated.
- If the 4 listing queries are NOT found under `row=search_word`, the precedence inversion premise is invalidated.
Empirically, both premises are verified 100%.
