## Forensic Audit Report

**Work Product**: `/Users/tienanhnguyen/Desktop/src_example/crisne-website/roadmap-rag-assistant/docs/knowledge-sub-intents-design.md`
**Profile**: General Project
**Integrity Mode**: Development (from `ORIGINAL_REQUEST.md`)
**Verdict**: CLEAN

---

### Executive Summary

An exhaustive forensic integrity audit of the repository state and the updated Architecture Design Document (`roadmap-rag-assistant/docs/knowledge-sub-intents-design.md`) was conducted for Iteration 2.

All forensic verification checks passed with zero integrity violations:
1. **Strict Scope Compliance**: ZERO modifications were made to router source code (`schemas.py`, `policy.py`, `intent_router.py`) or eval datasets (`evals/router/`). `git diff` against `HEAD` for these targets is completely empty.
2. **Deliverable Completeness & Authenticity**: The deliverable document exists at the designated path, spans 989 lines (~80 KB), and completely satisfies all requirements R1–R4 from `ORIGINAL_REQUEST.md`. It contains authentic, syntactically verified Pydantic v2 schemas, an 18-row `DECISION_TABLE`, 24 specified test cases, and empirical data points. No dummy facades or placeholder strings (`TODO`, `FIXME`, `TBD`) exist.
3. **Behavioral Integrity**: All project test suites and CI checks executed cleanly with 100% pass rates (`pytest`: 1001/1001 passed; `evals router-check`: 0 misroutes, heldout 223/223, intent cases 64/64; `evals validate`: OK; `yarn tsc`: 0 errors).
4. **Empirical Claim Verification**: All empirical findings presented in Section 5.1 of the design document (86.5% non-catalog lumping in `roadmap_question`, 4 catalog queries trapped in `search_word`, enhanced regex edge cases) were independently executed and verified.

---

### Phase Results

- **Check 1: Router Source & Dataset Modification Guard (Scope Invariant)**: **PASS**
  - Target files `schemas.py`, `policy.py`, `intent_router.py`, and directory `evals/router/` have 0 modifications against HEAD.
- **Check 2: Deliverable File Existence & Placement**: **PASS**
  - File exists at `roadmap-rag-assistant/docs/knowledge-sub-intents-design.md` (989 lines, 80,593 bytes).
- **Check 3: Hardcoded Output & Facade Detection**: **PASS**
  - No dummy implementations, constant-only functions, or fabricated test outputs detected.
  - Python snippets in the document are syntactically sound and verified via Python AST and runtime Pydantic v2 execution.
- **Check 4: Pre-Populated Artifact & Cleanliness Detection**: **PASS**
  - No fake logs or pre-populated verification artifacts. All git untracked files are limited strictly to agent metadata directories in `.agents/teamwork/` and the deliverable document.
- **Check 5: Test Suite Execution (`pytest`)**: **PASS**
  - Executed `.venv/bin/python -m pytest -q` in `roadmap-rag-assistant`: **1001 passed in 20.03s** (exit code 0).
- **Check 6: Router CI Contract Execution (`evals router-check`)**: **PASS**
  - Executed `.venv/bin/python -m evals router-check`: **heldout.routing.correct = 223**, **heldout.intent_cases.correct = 64**, **stress.misroute = 0**, **stress.dropped = 0** (exit code 0).
- **Check 7: Eval Corpus Validation (`evals validate`)**: **PASS**
  - Executed `.venv/bin/python -m evals validate`: **OK: 413 samples in 4 datasets, 117 documents in 1 corpora** (exit code 0).
- **Check 8: Workspace TypeScript Check (`yarn tsc`)**: **PASS**
  - Executed `yarn tsc --noEmit -p .`: Clean exit code 0, 0 type errors.
- **Check 9: Empirical Validation of Design Claims (Section 5.1)**: **PASS**
  - Verified 52 `roadmap_question` decisions: exactly 7 catalog (13.5%) vs 45 content/CUD hypothetical/audit (86.5%).
  - Verified 4 catalog queries trapped in `search_word`.
  - Verified enhanced regexes against tricky Vietnamese phrasing (100% accuracy).

---

### Evidence

#### 1. Git Status & Diff Evidence

##### `git status --porcelain`
```
 M prisma/dev.db
?? .agents/teamwork/
?? roadmap-rag-assistant/docs/knowledge-sub-intents-design.md
```

##### `git diff HEAD roadmap-rag-assistant/`
```
(empty - 0 bytes changed in tracked files)
```

##### `git status --porcelain roadmap-rag-assistant/rag_service/domains/roadmap/router/ roadmap-rag-assistant/evals/router/`
```
(empty - 0 modifications)
```

#### 2. Test Execution Raw Outputs

##### Pytest in `roadmap-rag-assistant`
```
Command: cd roadmap-rag-assistant && .venv/bin/python -m pytest -q
Exit Code: 0
Output:
........................................................................ [  7%]
........................................................................ [ 14%]
........................................................................ [ 21%]
........................................................................ [ 28%]
........................................................................ [ 35%]
........................................................................ [ 43%]
........................................................................ [ 50%]
........................................................................ [ 57%]
........................................................................ [ 64%]
........................................................................ [ 71%]
........................................................................ [ 79%]
........................................................................ [ 86%]
........................................................................ [ 93%]
.................................................................        [100%]
1001 passed in 20.03s
```

##### Router Check in `roadmap-rag-assistant`
```
Command: cd roadmap-rag-assistant && .venv/bin/python -m evals router-check
Exit Code: 0
Output:
── metrics ──
  heldout.intent_cases.correct     64
  heldout.routing.correct          223
  stress.dropped                   0
  stress.misroute                  0
  stress.ok                        410
  stress.undecided                 94
  stress.wrong_write               0
── stress by family / noise (~) ──
```

##### Evals Validate
```
Command: cd roadmap-rag-assistant && .venv/bin/python -m evals validate
Exit Code: 0
Output:
OK: 413 samples in 4 datasets, 117 documents in 1 corpora
```

##### TypeScript Check
```
Command: yarn tsc --noEmit -p .
Exit Code: 0
Output: (clean exit with 0 errors)
```

#### 3. Empirical Verification of Design Document Claims

##### Verification 1: Lumping Trap Analysis on `roadmap_question` (52 decisions)
```
Command:
cd roadmap-rag-assistant && .venv/bin/python -c '
import sys, json, re
from rag_service.domains.roadmap.retrieval.relevance import fold
from rag_service.domains.roadmap.router.vietnamese import normalize_vietnamese
from rag_service.domains.roadmap.router.policy import WRITE_BLOCKERS_FOLDED

with open("evals/router/decisions.jsonl") as f:
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
assert len(rm) == 52 and len(cat) == 7 and len(content) == 45
print("Verification 1 PASSED: 86.5% non-catalog lumping trap confirmed!")
'

Output:
Total: 52 | Catalog: 7 (13.5%) | Content: 45 (86.5%)
Verification 1 PASSED: 86.5% non-catalog lumping trap confirmed!
```

##### Verification 2: 4 Catalog Queries Trapped in `search_word`
```
Command:
cd roadmap-rag-assistant && .venv/bin/python -c '
import json
with open("evals/router/decisions.jsonl") as f:
    decisions = [json.loads(l) for l in f]
targets = [
    "Show me all lessons under the DevOps mục",
    "cho xem danh sach cac topic trong phan frontend",
    "danh sách bài trong layer Docker",
    "liệt kê tất cả các bài học thuộc topic 1 cho mình xem",
]
found = [d for d in decisions if d["input"] in targets]
assert len(found) == 4
for d in found:
    assert any(r == "row=search_word" for r in d.get("rules", []))
print("Verification 2 PASSED: 4 catalog queries trapped in search_word confirmed!")
'

Output:
Verification 2 PASSED: 4 catalog queries trapped in search_word confirmed!
```

##### Verification 3: Enhanced Regexes & Safe Accessors
```
Command:
cd roadmap-rag-assistant && .venv/bin/python -c '
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
print("Verification 3 PASSED: Enhanced regexes pass 100% of tricky Vietnamese phrasing!")
'

Output:
Verification 3 PASSED: Enhanced regexes pass 100% of tricky Vietnamese phrasing!
```
