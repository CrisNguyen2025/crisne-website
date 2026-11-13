# Handoff Report: Integration of Fix Specifications into Architecture Design Document

- **Agent:** `worker_update_design_doc` (Teamwork Implementer, QA, Specialist)
- **Conversation ID:** `36c3f0cd-fae4-4919-ad30-02f034a04091`
- **Parent Conversation ID:** `88cff40c-5d96-4718-b370-cc0b520b35d9`
- **Target File:** `/Users/tienanhnguyen/Desktop/src_example/crisne-website/roadmap-rag-assistant/docs/knowledge-sub-intents-design.md`
- **Date:** 2026-11-10

---

## 1. Observation

1. **Source Reports & Targets:**
   - Evaluated 3 input explorer reports:
     - Policy Explorer: `/Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/explorer_retry_policy/report.md`
     - Regex/CUD Explorer: `/Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/explorer_retry_regex_cud/report.md`
     - False Friends Explorer: `/Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/explorer_retry_false_friends/report.md`
   - Target Architecture Design Doc:
     `/Users/tienanhnguyen/Desktop/src_example/crisne-website/roadmap-rag-assistant/docs/knowledge-sub-intents-design.md`

2. **Empirical Codebase Observations:**
   - `evals/router/decisions.jsonl` contains 158 `knowledge_query` decisions:
     - 102 `row=search_word` decisions.
     - 52 `row=roadmap_question` decisions.
     - 2 `row=how_to_question` decisions.
     - 1 `row=show_request` decisions.
     - 1 `row=clause:roadmap_question` decisions.
   - Of the 52 `roadmap_question` decisions, exactly 45 (86.5%) are non-catalog queries (26 hypothetical CUD questions like `"nếu xóa topic AI thì có mất bài không"`, 5 past audit questions like `"ai đã xóa bài Redis k"`, 8 negated commands like `"đừng xóa bài Machine Learning k"`, and 6 content queries like `"bài đó nói gì"`). Exactly 7 (13.5%) are structural catalog/counting queries.
   - 4 structural catalog queries are trapped in `row=search_word`:
     - `"Show me all lessons under the DevOps mục"`
     - `"cho xem danh sach cac topic trong phan frontend"`
     - `"danh sách bài trong layer Docker"`
     - `"liệt kê tất cả các bài học thuộc topic 1 cho mình xem"`
   - `lesson_status.py:151-161` regexes (`_NEXT_CUE`, `_KNOWN_CUE`, `_REVIEW_CUE`) miss noun insertion ("học bài gì tiếp"), inverted phrasing, and question tag "chưa", while bare `"tiến độ"` matches external economics questions like `"tiến độ giải ngân vốn đầu tư công"`.
   - `policy.py:278` lacks `"đánh dấu"`, and `policy.py:306` lacks `"danh dau"` in `ACTION_VERBS["update"]`, which would trigger `write_gate.py:95` to return `WRITE_DENY (action_not_asked)`.
   - `agent.py:365` accesses `intent=intent_res.intent.value`. Calling `intent_res.sub_intent.value` when `sub_intent is None` raises `AttributeError: 'NoneType' object has no attribute 'value'`, crashing SSE stream.

3. **Tool Execution Results:**
   - `yarn tsc --noEmit -p .`: exited with code 0 (no TypeScript errors).
   - `cd roadmap-rag-assistant && .venv/bin/python -m evals router-check`: exited with code 0 (0 diffs, metrics: heldout.intent_cases.correct=64, heldout.routing.correct=223, stress.ok=410).
   - `cd roadmap-rag-assistant && .venv/bin/python -m evals validate`: exited with code 0 (413 samples in 4 datasets, 117 documents in 1 corpora).
   - `cd roadmap-rag-assistant && .venv/bin/python -m pytest -q`: 1001 passed in 21.33s.
   - `git status -s`: Only untracked `.agents/teamwork/` and `roadmap-rag-assistant/docs/knowledge-sub-intents-design.md` present. 0 source code or eval datasets modified.

---

## 2. Logic Chain

1. **Step 1 (Scope Constraints & Integrity):**
   - In accordance with `ORIGINAL_REQUEST.md` and `DISPATCH.md`, router source code (`schemas.py`, `policy.py`, `intent_router.py`) and eval datasets (`evals/router/`) must remain strictly read-only.
   - The architectural synthesis must be delivered entirely within `roadmap-rag-assistant/docs/knowledge-sub-intents-design.md`.

2. **Step 2 (Resolving the 86.5% Lumping Trap & Precedence Inversion):**
   - Observation 2 revealed that 86.5% of `roadmap_question` decisions in the snapshot are non-catalog. Directing them to In-Memory Catalog would result in catastrophic downstream failures.
   - Observation 2 also revealed that generic `search_word` at row 9 swallows catalog listings before catalog rules can evaluate.
   - Logic: By specifying the split into `Row("roadmap_catalog_query")` (for counting/position/hierarchy with write_blocker filter) vs `Row("roadmap_content_query")` (for hypothetical/audit/content questions), and restructuring `DECISION_TABLE` into an 18-row precedence order where structured sub-intents sit at rows 9–11 before `search_word` at row 12, both failure modes are cleanly resolved.

3. **Step 3 (Schema Robustness & Exception Prevention):**
   - Observation 2 showed that `sub_intent` is `None` for all non-knowledge intents (`CHITCHAT`, `ROADMAP_CUD`, `PLAN_GOAL`, `OUT_OF_SCOPE`).
   - Logic: Adding `@property sub_intent_value` to `IntentClassificationResult` returns `Optional[str]`, preventing `AttributeError: 'NoneType' object has no attribute 'value'` in `agent.py` SSE step events. Adding `@model_validator(mode="after") enforce_sub_intent_hierarchy` normalizes `sub_intent` to `None` if `intent != KNOWLEDGE_QUERY`, preventing inconsistent state coupling.

4. **Step 4 (Regex & CUD Action Synchronization):**
   - Observation 2 showed that Vietnamese natural language inserts nouns and uses inverted phrasing ("học bài gì tiếp", "sau bài Docker Compose thì nên học bài nào").
   - Logic: Specifying `_NEXT_CUE_ENHANCED`, `_KNOWN_CUE_ENHANCED`, `_REVIEW_CUE_ENHANCED` and adding question tag `"chưa"` ensures full coverage.
   - Synchronously adding `"đánh dấu"` to `CUD_VERB_WORDS`, `ACTION_VERBS["update"]`, and `STATUS_PREPOSITION_EXCLUSIONS` in `object_sense.py` prevents `WRITE_DENY` and ensures smooth migration in Phase 3.

5. **Step 5 (Multi-Phase Disambiguation):**
   - False friends like non-domain `"tiến độ"` and quantifier `"mấy bài"` require multi-phase coordination ($P_0 - P_4$).
   - Logic: Expanding Section 3.5 into an extended ambiguity matrix of 9 conflict pairs with $P_3$ Target, $P_4$ Scope, and SpeechAct disambiguation rules provides complete guidance for both router engineers and prompt designers.

6. **Step 6 (Downstream Safe Access & Rollout Roadmap):**
   - Logic: Documenting the 3 Golden Rules (Safe Accessor, Strict Hierarchical Guarding, Safe Fallback to Vector RAG) in Section 4.3 guarantees safe downstream execution.
   - Documenting the 4-phase rollout with the 2-step CI acceptance protocol (`evals router-check` and `evals router-check --accept`) ensures zero metric regression and smooth transition.

---

## 3. Caveats

- **No Caveats:** All 7 items from `DISPATCH.md` were meticulously incorporated into `roadmap-rag-assistant/docs/knowledge-sub-intents-design.md`.
- No source code or eval datasets were modified, preserving 100% CI compliance.

---

## 4. Conclusion

The Architecture Design Document at `roadmap-rag-assistant/docs/knowledge-sub-intents-design.md` has been successfully updated, fully synthesizing all findings and specifications from the 3 retry explorers:
1. Documented the 86.5% non-catalog lumping trap for `roadmap_question` and specified its split into `roadmap_catalog_query` vs `roadmap_content_query`.
2. Detailed the 18-row `DECISION_TABLE` precedence order placing structured sub-intent rules before generic `search_word`.
3. Added `@property sub_intent_value` and `@model_validator(mode="after")` to `IntentClassificationResult`, and `sub_intent` to `Row`.
4. Detailed enhanced progress regexes (`_NEXT_CUE_ENHANCED`, `_KNOWN_CUE_ENHANCED`, `_REVIEW_CUE_ENHANCED`), `"chưa"` question tag, and `"đánh dấu"` CUD additions across `policy.py` and `object_sense.py`.
5. Expanded the Ambiguity Matrix with 9 conflict pairs, including non-domain `"tiến độ"`, quantifier `"mấy bài"`, life advice vs progress, and mixed multi-intent queries.
6. Established the 3 Golden Safe Downstream Accessor Rules preventing `AttributeError`.
7. Verified that repository CI remains 100% clean and passing.

---

## 5. Verification Method

To independently verify the implementation:

1. **Verify Repository CI Cleanliness:**
   ```bash
   yarn tsc --noEmit -p .
   cd roadmap-rag-assistant
   .venv/bin/python -m evals router-check
   .venv/bin/python -m evals validate
   .venv/bin/python -m pytest tests/test_router_policy.py tests/test_intent_router_safety.py -q
   ```
   *Expected:* All pass with exit code 0.

2. **Verify Analytical Correctness of Specifications:**
   Run scripts 6, 7, and 8 from Section 5.1 of `roadmap-rag-assistant/docs/knowledge-sub-intents-design.md`:
   - Script 6 verifies the 13.5% Catalog vs 86.5% Content split on the 52 `roadmap_question` decisions.
   - Script 7 verifies the 4 catalog queries trapped in `row=search_word`.
   - Script 8 verifies that enhanced regexes pass 100% of tricky Vietnamese phrasing and reject non-domain queries.

3. **Verify Git Cleanliness:**
   ```bash
   git status -s
   ```
   *Expected:* 0 source code or eval dataset files modified.
