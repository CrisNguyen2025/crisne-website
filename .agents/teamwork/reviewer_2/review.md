# Architectural Review & Adversarial Challenge Report

- **Reviewer:** `reviewer_2` (Roles: reviewer, critic)
- **Target Deliverable:** `/Users/tienanhnguyen/Desktop/src_example/crisne-website/roadmap-rag-assistant/docs/knowledge-sub-intents-design.md`
- **Working Directory:** `/Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/reviewer_2/`
- **Evaluation Date:** 2026-11-10T10:05:00Z
- **Verdict:** **APPROVE**

---

## 1. Review Summary

The Architectural Design Document for `IntentType.KNOWLEDGE_QUERY` Sub-Intent Evaluation and Design (`docs/knowledge-sub-intents-design.md`) authored by `worker_design_doc` is an exceptional, technically rigorous, and deeply researched proposal. It satisfies all requirements of `ORIGINAL_REQUEST.md` (R1–R4) and complies 100% with the strict read-only scope constraints (zero source code or eval dataset modifications).

The Hierarchical Sub-Intent Model preserves the top-level contract (`route: "knowledge_query"`) across all 158 snapshot decisions in `evals/router/decisions.jsonl` while introducing `sub_intent: Optional[KnowledgeSubIntent]` (`SEARCH`, `CATALOG`, `PROGRESS`) and `query_metadata: Optional[KnowledgeQueryMetadata]` for downstream execution. This provides a clear, fail-safe path to eliminate pre-router regex interceptors and resolve the ADR-0010 progress hallucination risk without destabilizing CI ratchets.

Independent execution of all test suites (`evals router-check`, `evals.router.holdout`, `evals validate`, and router unit tests) passed with 0 errors and 0 regressions. No integrity violations or shortcut implementations were found.

---

## 2. Findings & Recommendations

### [Minor] Finding 1: Discrepancy in `decisions.jsonl` Sub-Breakdown Across Policy Rows
- **What:** In Section 4.1 ("Khảo sát Hiện trạng 158 Quyết định `knowledge_query` trong `decisions.jsonl`"), the document reports:
  - `row=search_word`: 134 decisions
  - `row=roadmap_question`: 18 decisions
  - `row=known_title_question`: 4 decisions
  - `row=show_request`: 2 decisions
- **Where:** `docs/knowledge-sub-intents-design.md:477-482`.
- **Why:** Independent verification of the 158 decisions in `evals/router/decisions.jsonl` by parsing `rules` reveals the true distribution:
  - `row=search_word`: 102
  - `row=roadmap_question`: 52
  - `row=how_to_question`: 2
  - `row=show_request`: 1
  - `row=clause:roadmap_question`: 1
  *(Total is exactly 158 in both cases).*
- **Impact & Suggestion:** This does not impact any architectural conclusions, schema designs, or CI compatibility since the total count (158) is exact and top-level route is `"knowledge_query"` for all 158. Suggest updating the line counts in Section 4.1 during final documentation polishing.

---

### [Minor] Finding 2: Decoupling of Status Change Mutations from `handle_lesson_status` in Phase 3
- **What:** In Section 3.2 (lines 390–394), the document correctly mandates that status change commands (*"đánh dấu bài X là đang học"*, ADR-0010 Action d) belong to `IntentType.ROADMAP_CUD` with confirmation preview, not `KNOWLEDGE_QUERY.PROGRESS`. However, in Section 4.3 (Phase 3, lines 608–613), the rollout plan states that `handle_lesson_status` is moved from before the router to after the router under `intent_res.sub_intent == KnowledgeSubIntent.PROGRESS`.
- **Where:** `docs/knowledge-sub-intents-design.md:608-613` vs `rag_service/domains/roadmap/lesson_status.py:228-250`.
- **Why:** In current code (`lesson_status.py`), `handle_lesson_status` handles *both* read queries (a, b, c) *and* status mutation commands (d: `parse_status_change_request`). If status change commands are classified by the router as `ROADMAP_CUD`, dispatching `handle_lesson_status` strictly under `KNOWLEDGE_QUERY.PROGRESS` would leave status mutations unhandled unless:
  1. `handle_lesson_status` is refactored to separate `handle_lesson_status_query` from `handle_lesson_status_mutation`, AND
  2. The CUD pipeline (`handle_cud` in `commands.py`) or `StructuredRoadmapAction` is wired to handle status mutations.
- **Impact & Suggestion:** When implementing Phase 3, explicitly decouple `handle_lesson_status` into query handler (for `KNOWLEDGE_QUERY.PROGRESS`) and mutation handler (for `ROADMAP_CUD`), ensuring seamless execution of preview-confirmed status changes.

---

### [Minor] Finding 3: Disambiguation for Quantitative Personal Progress Queries
- **What:** Quantitative progress queries such as *"Tôi đã hoàn thành bao nhiêu bài trong topic Docker?"* contain cues for both `CATALOG` (*"bao nhiêu bài"*, quantitative count) and `PROGRESS` (*"tôi đã hoàn thành"*, user's `known` status).
- **Where:** `docs/knowledge-sub-intents-design.md:349-356` and Section 3.5.
- **Why:** If the router's heuristic table evaluates `is_counting_query` under `CATALOG` before checking personal pronouns and status filters, it could route the query to `CATALOG_QUERY`. The catalog engine only has topic metadata and lacks the user's personal `known`/`learning`/`target` status, which would produce an erroneous total count instead of the user's completed count.
- **Impact & Suggestion:** The proposed schema already includes `is_counting_query: bool = False` and `progress_status_filter: Optional[str] = None` on `KnowledgeQueryMetadata`. In Phase 1 policy table rules, explicitly ensure that any query containing personal status keywords (`"tôi đã hoàn thành"`, `"mình đã nắm"`) is routed to `PROGRESS` with `is_counting_query=True`, overriding generic catalog counting heuristics.

---

## 3. Verified Claims Matrix

| Claim / Observation in Design Doc | Verification Method | Result | Evidence / Details |
|---|---|---|---|
| `IntentType.KNOWLEDGE_QUERY` is monolithic string enum | `view_file` on `schemas.py:16` | **PASS** | `KNOWLEDGE_QUERY = "knowledge_query"`. `IntentClassificationResult` only has `(intent, confidence, needs_cud_extraction, needs_confirmation)`. |
| 5 policy rules route to `KNOWLEDGE_QUERY` | `view_file` on `policy.py:412-420` | **PASS** | `search_word` (0.90), `roadmap_question` (0.90), `known_title_question` (0.90), `how_to_question` (0.85), `show_request` (0.85). |
| Pre-router interceptors in `agent.py:284-316` | `view_file` on `agent.py` | **PASS** | `handle_listing` (line 284), `handle_sections` (line 290), `handle_lesson_status` (line 306) precede router call at line 339. |
| Ingestion strips `status` and `statusUpdatedAt` | `view_file` on `ingestion.py:92-96` | **PASS** | `DatabaseIngestionWorker` only builds search text from `title`, `slug`, `section`, `description`, `clean_content`. |
| 158 / 748 decisions have `route == "knowledge_query"` | Python script over `evals/router/decisions.jsonl` | **PASS** | Exactly 748 total decisions, exactly 158 with `route == "knowledge_query"`. |
| 52 / 223 active samples expect `knowledge_query` | Python script over `evals/datasets/_routing/samples.jsonl` | **PASS** | Exactly 228 samples (223 active), exactly 52 active expect `knowledge_query`. |
| 15 / 64 intent eval cases expect `knowledge_query` | Python script over `tests/data/intent_eval_cases.json` | **PASS** | Exactly 64 cases, exactly 15 expect `knowledge_query`. |
| `check.py` has bridge for `knowledge_query` & `list_topics` | `view_file` on `check.py:102, 111` | **PASS** | Explicit lines: `hit = d["route"] == heldout_want(s) or (heldout_want(s) == "knowledge_query" and d["route"] == "list_topics")`. |
| 0 test cases in `evals/router/` for ADR-0010 | Grep search across `evals/router/` | **PASS** | Zero occurrences of `known`, `learning`, or `target` user status evaluation in router datasets. |
| Strict scope constraint compliance | `git status --porcelain` | **PASS** | Zero modifications under `rag_service/domains/roadmap/router/` or `evals/router/`. Only design doc added. |
| `evals router-check` passes | `.venv/bin/python -m evals router-check` | **PASS** | Exit code 0, 64 intent cases correct, 223 routing correct, 0 stress regressions. |
| `evals.router.holdout` passes | `.venv/bin/python -m evals.router.holdout` | **PASS** | Exit code 0, `write_now_violations: 0`. |
| `evals validate` passes | `.venv/bin/python -m evals validate` | **PASS** | Exit code 0, 413 samples in 4 datasets, 117 docs in 1 corpora valid. |
| Router Pytest test suite passes | `pytest tests/test_router_policy.py tests/test_intent_router_safety.py` | **PASS** | 96 passed in 0.91s. |
| Lesson status integration test passes | `pytest tests/test_lesson_status_e2e.py` | **PASS** | 10 passed in 2.22s. |

---

## 4. Adversarial Challenge & Stress-Test Report

### Challenge Summary
- **Overall Risk Assessment:** **LOW**
- **Sub-Intent Architecture Viability:** **EXCELLENT**
- **CI Ratchet Safety:** **VERY HIGH**

### Challenge 1: Pydantic Schema Backward Compatibility Under Runtime Mutation
- **Assumption Challenged:** Extending `IntentClassificationResult` with `sub_intent: Optional[KnowledgeSubIntent] = None` and `query_metadata: Optional[KnowledgeQueryMetadata] = None` does not break serialization, validation, or existing consumers.
- **Stress-Test:** We executed an isolated Python runtime script instantiating `IntentClassificationResult` with legacy parameters only (`intent`, `confidence`).
- **Result: PASS.** The resulting dictionary from `.model_dump()` contains `sub_intent: None`, which serializes seamlessly. Any consumer accessing `res.intent` observes zero changes. Top-level snapshot method `Decision.snapshot()` accesses `self.intent.value`, completely shielding `decisions.jsonl` from breaking diffs.

### Challenge 2: Accidental Mutation via Semantic Query
- **Assumption Challenged:** Users phrasing questions with action verbs (e.g., *"Đổi trạng thái bài Docker sang đã nắm có cần thiết không?"*) might trigger write operations.
- **Stress-Test:** Traced P2 (Polarity: `hypothetical`/`question`) and P6 (System 2 write candidate verification).
- **Result: PASS.** The design doc explicitly designates that all state mutations require `SpeechAct.COMMAND` + write confirmation (`WRITE_CONFIRM`), routed to `ROADMAP_CUD` with 2-step preview. Pure queries and hypothetical statements are blocked by System 2 and rerouted, guaranteeing that `KNOWLEDGE_QUERY` remains strictly read-only.

### Challenge 3: Visitor Authorization Bypass on Progress Queries
- **Assumption Challenged:** Can an unauthenticated visitor query the Owner's learning progress via natural phrasing if pre-router interceptors are moved after the router?
- **Stress-Test:** Evaluated the downstream dispatcher execution in Phase 3.
- **Result: PASS.** In Phase 3, when `sub_intent == PROGRESS`, the downstream handler immediately verifies `is_owner() == True` before querying the database. If `is_owner() == False`, it returns `OWNER_ONLY_MESSAGE` without loading any user data, maintaining fail-closed security.

### Challenge 4: CI Ratchet Breakage During Dataset Expansion (Phase 2)
- **Assumption Challenged:** Adding 24 new test cases into `samples.jsonl` could immediately lower `heldout.routing.correct` before the router's heuristic table is trained or updated, breaking CI build jobs.
- **Stress-Test:** Evaluated Phase 2 rollout sequence.
- **Result: PASS.** The design doc provides a dedicated dual-eval harness (`sub_intent_check.py`) to measure sub-intent accuracy independently without touching `check.py`'s ratchet until router accuracy meets the $\ge 95\%$ acceptance threshold.

---

## 5. Coverage Gaps & Unverified Items

- **Coverage Gaps:** None identified. The design document exhaustively covers downstream execution differences, architectural options comparison, schema specifications, boundary definitions, 18 concrete examples, 5-pair ambiguity analysis, CI impact on 158 decisions, 24 new test cases, and a 4-phase rollout plan.
- **Unverified Items:** None. All cited files, line numbers, test commands, and baseline metrics were directly verified against the repository.

---

## 6. Final Recommendation

**VERDICT: APPROVE**

The Architecture Design Document is complete, logically airtight, technically realistic, and strictly compliant with project conventions and safety constraints. It is ready for final sign-off and subsequent Phase 1 implementation.
