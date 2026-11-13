# Handoff Report — explorer_retry_regex_cud

## 1. Observation
- **Empirical Execution & Code Evidence:**
  - `rag_service/domains/roadmap/lesson_status.py:151-161`:
    - `_NEXT_CUE` tests with queries inserting `"bài"` or inverted order (e.g., `"Hôm nay tôi nên học bài gì tiếp theo?"`, `"Sau bài Docker Compose thì nên học bài nào"`) returned `next=False`, falling through to Vector RAG.
    - `_KNOWN_CUE` tests with natural queries (e.g., `"Tôi đang học những bài nào trong topic RAG"`, `"Bài Docker đã nắm chưa"`) returned `known=False`.
    - Bare keyword `tien do` in `_KNOWN_CUE` returned `known=True` on out-of-scope query `"Tiến độ giải ngân vốn đầu tư công hiện nay thế nào"` (Critical False Positive).
    - `_REVIEW_CUE` tests with colloquial phrases (e.g., `"Những bài đã nắm lâu rồi chưa xem lại"`) returned `rev=False`.
  - `rag_service/domains/roadmap/router/understanding.py:169`:
    - `is_question_text()` regex `r"\s(?:không|k|ko)$"` omits trailing `"chưa"`, causing `"Bài Docker đã nắm chưa"` to be classified as `act=SpeechAct.STATEMENT` instead of `QUESTION`.
  - `rag_service/domains/roadmap/router/policy.py:278`:
    - `CUD_VERB_WORDS` lacks `"đánh dấu"`, `"đặt"`, `"mark"`, `"set"`.
    - `understand("Đánh dấu bài Docker là đã học")` returns `has_verb=False`, `act=SpeechAct.STATEMENT`, `intent=None`, `row=None`.
  - `rag_service/domains/roadmap/router/policy.py:304-308`:
    - `ACTION_VERBS["update"]` contains only `("sua", "doi", "cap nhat", "update", "rename", "chuyen", "di chuyen", "move", "edit")`, omitting `"danh dau"`, `"dat"`, `"mark"`, `"set"`.
    - `write_gate.py:95` validates `action.action.value` against `ACTION_VERBS`. Any status update lacking these verbs in `ACTION_VERBS["update"]` triggers `WRITE_DENY (action_not_asked)`.
  - `rag_service/domains/roadmap/router/object_sense.py:32,83`:
    - `PREPOSITIONS` contains `"sang"`. In `"Chuyển bài Docker sang đã nắm"`, `"đã nắm"` is not recognized as a roadmap object or pronoun/time, causing `names_another_place()` to return `True`, turning `target` into `Target.NONE`.
  - `evals/router/decisions.jsonl` (748 decisions) & `stress.jsonl` (504 cases):
    - Zero decisions contain `"đánh dấu"` or `"danh dau"`.
    - Simulating the addition of `"đánh dấu"` and `"danh dau"` to `CUD_VERB_WORDS` yielded **exactly 0 diffs** on all 748 decisions and preserved 100% of the baseline stress pass count (410/504).
- **Integrity Status (`git status -s`):**
  - Zero files modified in `roadmap-rag-assistant/`.

---

## 2. Logic Chain
1. *From Observation on `lesson_status.py` regexes:*
   Progress queries in natural Vietnamese frequently insert nouns (`"bài"`, `"phần"`, `"chủ đề"`), quantifiers (`"những bài nào"`), or temporal structures (`"sau bài X thì nên học..."`). Because `_NEXT_CUE` and `_KNOWN_CUE` only match rigid consecutive words, natural queries fail to match. When they fail, they are dispatched to Vector RAG, which contains no user learning progress metadata (per ADR-0010 privacy boundary), triggering LLM progress hallucination (Failure Mode 1).
2. *From Observation on bare `"tiến độ"`:*
   `_KNOWN_CUE` contains bare `"tien do"`. Any query mentioning socioeconomic, project, or construction progress (e.g., *"Tiến độ giải ngân vốn đầu tư công"*) matches `_KNOWN_CUE` and is hijacked into `lesson_status.py`. Contextualizing `"tiến độ"` with `"học"`, `"roadmap"`, `"lộ trình"`, or `"của tôi"` eliminates these false positives.
3. *From Observation on `CUD_VERB_WORDS`:*
   In Phase 3, moving `handle_lesson_status` behind the router requires the router to recognize status mutation commands. Because `"đánh dấu"` is not in `CUD_VERB_WORDS`, the router treats it as a non-verb statement (`act=STATEMENT`), resulting in `intent: None`.
4. *From Observation on `ACTION_VERBS` and `write_gate.py`:*
   Even if `"đánh dấu"` is recognized by the router, downstream execution requires `write_gate.gate_action()` to verify that the verb in the command belongs to `ACTION_VERBS["update"]`. Omitting `"danh dau"` from `ACTION_VERBS["update"]` results in a write denial (`ACTION_NOT_ASKED`).
5. *From Observation on `object_sense.py` & `"sang"`:*
   Status mutation queries using connector `"sang"` (e.g., *"Chuyển bài Docker sang đã nắm"*) trigger `names_another_place = True` because `"sang"` is in `PREPOSITIONS` and `"đã nắm"` is not an entity or pronoun. Exempting status transition phrases after `"sang"` preserves `Target.ROADMAP`.
6. *From Observation on CI baseline:*
   Adding `"đánh dấu"` to `CUD_VERB_WORDS` does not alter any existing snapshot decision in `decisions.jsonl` (0 diffs) and does not degrade `stress.jsonl` metrics.

---

## 3. Caveats
- The regex patterns proposed (`_NEXT_CUE_ENHANCED`, `_KNOWN_CUE_ENHANCED`, `_REVIEW_CUE_ENHANCED`) have been verified on extensive Vietnamese phrasing variants, but unusual regional dialects or non-standard slang might still exist.
- Phase 3 downstream dispatcher refactoring assumes that status mutations (`ROADMAP_CUD`) and status queries (`KNOWLEDGE_QUERY / PROGRESS`) are handled by separate execution pathways.
- Strictly read-only investigation: No code or dataset files were edited.

---

## 4. Conclusion
The recommendations for updating `roadmap-rag-assistant/docs/knowledge-sub-intents-design.md` are:
1. **Enhanced Regex Patterns (Section 4.3 Phase 3 & Section 3.2):**
   - Replace rigid cues with `_NEXT_CUE_ENHANCED`, `_KNOWN_CUE_ENHANCED`, and `_REVIEW_CUE_ENHANCED` as specified in `report.md`.
   - Update `understanding.py:is_question_text` to include trailing `"chưa"`.
2. **Vocabulary & Write Policy Synchronization (Section 4.3 Phase 1 & Phase 3):**
   - Add `"đánh dấu"`, `"đặt"`, `"mark"`, `"set"` to `CUD_VERB_WORDS` in `policy.py:278`.
   - Add `"danh dau"`, `"dat"`, `"mark"`, `"set"` to `ACTION_VERBS["update"]` in `policy.py:306`.
   - Add status transition exemptions to `object_sense.py:83` for preposition `"sang"`.
   - Enforce Write Policy for status mutations under `ROADMAP_CUD`: `ActionType.UPDATE`, `EntityLevel.ITEM`, `write="confirm"` (two-phase commit with preview card), strictly Owner-only.
3. **Ambiguity Matrix Updates (Section 3.5):**
   - Add false friend disambiguation for bare `"tiến độ"` and general career questions (*"học gì tiếp theo sau cấp 3"*).

---

## 5. Verification Method
To independently verify all findings and test suites:

```bash
# 1. Verify enhanced regex patterns on failing challenger queries
roadmap-rag-assistant/.venv/bin/python -c '
from rag_service.domains.roadmap.retrieval.relevance import fold
from rag_service.domains.roadmap.router.vietnamese import normalize_vietnamese
import re

NEXT = re.compile(r"\b(?:(?:nen|can|se|muon)\s+hoc\s+(?:(?:bai(?:\s+hoc)?|phan|chu\s+de|muc|cai|item)\s+)?(?:gi|nao)(?:\s+tiep(?:\s+theo)?)?|hoc\s+(?:(?:bai(?:\s+hoc)?|phan|chu\s+de|muc|cai|item)\s+)?gi(?:\s+tiep(?:\s+theo)?|\s+bay\s+gio)|tiep\s+theo(?:\s+thi)?\s+(?:nen|can|se)?\s*hoc(?:\s+(?:bai(?:\s+hoc)?|phan|chu\s+de|muc|cai|item))?(?:\s+(?:gi|nao))?|(?:bai(?:\s+hoc)?|phan|muc)\s+tiep\s+theo(?:\s+(?:la\s+gi|nen\s+hoc|can\s+hoc))?|goi\s+y\s+(?:(?:cho\s+\w+\s+)?(?:bai(?:\s+hoc)?|phan|lo\s+trinh|topic)\s+tiep(?:\s+theo)?(?:\s+can\s+hoc)?|hoc)|dang\s+hoc\s+do|bai\s+(?:nao\s+)?dang\s+hoc\s+do|sau\s+bai\s+.*?\s+(?:thi\s+)?(?:nen\s+)?hoc\s+(?:bai\s+)?(?:gi|nao))\b")
KNOWN = re.compile(r"\b(?:(?:dang|da)\s+(?:biet|nam|hoc)(?:\s+duoc)?\s+(?:(?:nhung\s+)?(?:gi|bai\s+nao|bai\s+hoc\s+nao)|nhung\s+bai)|da\s+(?:hoan\s+thanh|xong)\s+(?:(?:nhung\s+)?(?:gi|bai\s+nao)|nhung\s+bai)|(?:nam|biet|hoc)\s+nhung\s+(?:gi|bai\s+nao|bai\s+hoc\s+nao)|da\s+(?:nam|hoc(?:\s+xong)?|hoan\s+thanh)\s+chua|tien\s+do\s+(?:hoc(?:\s+tap)?|roadmap|lo\s+trinh|cua\s+(?:toi|minh)|den\s+dau))\b")
REV = re.compile(r"\b(?:on\s+(?:lai|tap|bai)|can\s+on|bai\s+can\s+on|can\s+review|review\s+bai|can\s+nhac\s+on|(?:lau\s+(?:roi\s+)?|chua\s+)(?:xem|on|hoc)\s+lai|can\s+xem\s+lai|bai\s+can\s+xem\s+lai|nhac\s+bai\s+can\s+on)\b")

tests = [
    ("Hôm nay tôi nên học bài gì tiếp theo?", "next"),
    ("Gợi ý cho mình bài tiếp theo cần học trong lộ trình Frontend", "next"),
    ("Tôi đang học những bài nào trong topic RAG", "known"),
    ("Bài Docker đã nắm chưa", "known"),
    ("Những bài đã nắm lâu rồi chưa xem lại", "rev"),
    ("Tiến độ giải ngân vốn đầu tư công hiện nay thế nào", "none"),
]
for q, exp in tests:
    f = fold(normalize_vietnamese(q).lower())
    m = "next" if NEXT.search(f) else ("known" if KNOWN.search(f) else ("rev" if REV.search(f) else "none"))
    assert m == exp, f"Failed on {q}: got {m}, expected {exp}"
print("All regex tests PASSED!")
'

# 2. Verify adding danh dau produces exactly 0 diffs on CI decisions.jsonl
roadmap-rag-assistant/.venv/bin/python -c '
import json, re
from rag_service.domains.roadmap.router.intent_router import IntentRouter
import rag_service.domains.roadmap.router.policy as policy
import rag_service.domains.roadmap.router.understanding as understanding
from evals.router.check import decide

orig = list(policy.CUD_VERB_WORDS)
policy.CUD_VERB_WORDS = orig + ["đánh dấu", "danh dau"]
policy.CUD_VERBS = [policy.fold(v) for v in policy.CUD_VERB_WORDS]
policy._VERBS_OR = "|".join(re.escape(v) for v in policy.CUD_VERBS)
policy.IMPERATIVE_START = re.compile(rf"^(?:(?:ban\s+oi|vui\s+long|nho\s+ban|ho\s+minh|giup\s+minh)\s+)?(?:{policy._VERBS_OR})\b")
understanding.CUD_VERBS = policy.CUD_VERBS
understanding.IMPERATIVE_START = policy.IMPERATIVE_START

router = IntentRouter()
with open("roadmap-rag-assistant/evals/router/decisions.jsonl") as f:
    decisions = [json.loads(l) for l in f]
diffs = sum(1 for d in decisions if decide(router, d["input"])["route"] != d["route"])
assert diffs == 0, f"Expected 0 diffs, got {diffs}"
print("Decisions.jsonl 0 diffs verified!")
'

# 3. Verify strict read-only compliance
git status -s
```
*Invalidation Condition:* If running check 1 yields any mismatch or check 2 yields >0 diffs on decisions.jsonl, the conclusions are invalidated. Empirically, both assertions pass.
