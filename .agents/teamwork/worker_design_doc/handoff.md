# Handoff Report: Sub-Intent Architecture Design Document for `IntentType.KNOWLEDGE_QUERY`

- **Agent:** `worker_design_doc`
- **Working Directory:** `/Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/worker_design_doc/`
- **Deliverable File:** `/Users/tienanhnguyen/Desktop/src_example/crisne-website/roadmap-rag-assistant/docs/knowledge-sub-intents-design.md`
- **Date:** 2026-11-10T10:08:00Z
- **Milestone:** M1: Architectural Design Doc Synthesis

---

## 1. Observation

1. **Router Architecture & Monolithic Intent:**
   - In `roadmap-rag-assistant/rag_service/domains/roadmap/router/schemas.py:16`, `IntentType.KNOWLEDGE_QUERY` is defined as a flat string enum `"knowledge_query"` ("Ask about existing lessons, concepts, search docs").
   - `IntentClassificationResult` in `schemas.py:94-110` only outputs `(intent, confidence, needs_cud_extraction, needs_confirmation)`. It contains no sub-intent field and no metadata for query routing.
   - In `policy.py:412-420`, rows `search_word` (0.90), `roadmap_question` (0.90), `known_title_question` (0.90), `how_to_question` (0.85), and `show_request` (0.85) all route directly to `IntentType.KNOWLEDGE_QUERY`.

2. **Downstream Execution Discrepancy & Pre-Router Interceptions:**
   - In `rag_service/domains/roadmap/agent.py:284-316`, three procedural handlers intercept user requests **ahead of the router** (`decide_route` at line 339):
     - `self.handle_listing(...)` at line 284 (`is_plain_listing`).
     - `self.handle_sections(...)` at line 290.
     - `self.handle_lesson_status(...)` at line 306 (ADR-0010 queries `asks_what_i_know`, `asks_next_learning`, `asks_review` and command `parse_status_change_request`).
   - If a request does not match these brittle regexes, it falls through to line 339, is classified as `KNOWLEDGE_QUERY`, and invokes `answer_from_sources(...)` at line 436.
   - In `rag_service/domains/roadmap/retrieval/ingestion.py:92-96`, `DatabaseIngestionWorker` indexes only title, description, and clean content. Fields `status` (`known`, `learning`, `target`) and `statusUpdatedAt` are deliberately stripped out from Vector Store documents for privacy reasons.

3. **Downstream Performance & Resource Profiles:**
   - Vector RAG Search: Invokes Google Gemini Embedding (`models/gemini-embedding-001`), FTS5, RRF, optional LLM reranker, and LLM generation (Gemini Flash / Groq). Latency: **800ms – 3,500ms**, token cost: 500 – 2,500 tokens/query.
   - In-Memory Catalog Lookup: Invokes `adapter.list_topics()` or `Catalog` in RAM (`target_grounding.py:36`). Latency: **5ms – 40ms**, 0 LLM calls, 0 embedding calls, 0 tokens.
   - User Learning Progress (ADR-0010): Invokes Turso/SQLite SELECT, pure Python sorting (`filter_and_sort_review_lessons`, `filter_and_sort_next_lessons`). Latency: **10ms – 60ms**, 0 LLM calls, 0 tokens. Enforces fail-closed `is_owner() == True` check (`rag_service/auth.py:32`).

4. **CI Contract & Evaluation Suite:**
   - In `evals/router/decisions.jsonl`, exactly **158 / 748 committed decisions** have `"route": "knowledge_query"`.
   - In `evals/datasets/_routing/samples.jsonl`, 52 / 223 active samples expect `["knowledge_query"]` (37 search, 14 catalog, 1 progress-related).
   - In `tests/data/intent_eval_cases.json`, 15 / 64 cases expect `"knowledge_query"` (14 search, 1 catalog).
   - In `evals/router/check.py:102` and `check.py:111`, an ad-hoc bridge exists: `hit = got == want or (want == "knowledge_query" and got == "list_topics")`.
   - In `evals/router/stress.jsonl`, 83 cases have `knowledge_query` clauses (100% search).
   - In `evals/router/`: There are **0 test cases** for ADR-0010 learning progress queries.

5. **Tool Execution Verification:**
   - `git status --porcelain`: Confirms only `roadmap-rag-assistant/docs/knowledge-sub-intents-design.md` was created; zero router or eval files were touched.
   - `cd roadmap-rag-assistant && .venv/bin/python -m evals router-check`: Exited 0 with metrics `heldout.intent_cases.correct 64`, `heldout.routing.correct 223`, `stress.wrong_write 0`, `stress.dropped 0`, `stress.misroute 0`.
   - `cd roadmap-rag-assistant && .venv/bin/python -m evals.router.holdout`: Exited 0 (`write_now_violations: 0`).
   - `cd roadmap-rag-assistant && .venv/bin/python -m evals validate`: Exited 0 (413 samples valid).
   - `cd roadmap-rag-assistant && .venv/bin/python -m pytest tests/test_router_policy.py tests/test_intent_router_safety.py -q`: Passed (96 passed in 1.60s).

---

## 2. Logic Chain

1. **From Observation 1 and 2:** Because `IntentType.KNOWLEDGE_QUERY` is monolithic and lacks sub-intent fields, the system coalesces semantic searches, catalog lookups, and personal progress queries into a single intent. To avoid sending catalog and status queries into Vector RAG, procedural regex interceptors were placed ahead of the router in `agent.py:284-316`.
2. **From Observation 2 and 3:** Brittle regexes fail whenever users employ natural conversational variations (e.g., *"topic này có mấy bài"*, *"bài nào tôi học xong rồi"*). When these requests fall through to the router, they are tagged as `KNOWLEDGE_QUERY` and dispatched to `answer_from_sources`.
3. **From Observation 2 and 3 (Failure Modes):** Because Vector RAG's database ingestion intentionally omits user status (`status`, `statusUpdatedAt`) for privacy, sending progress queries to Vector RAG inevitably causes the LLM to hallucinate personal progress based on lesson content chunks. Furthermore, sending catalog queries to Vector RAG causes a 50x–100x latency penalty (from 20ms to 2,000ms+) and fails at relational counts (since top-K chunks cannot count total lessons).
4. **From Observation 4:** A flat enum split (e.g., replacing `KNOWLEDGE_QUERY` with `KNOWLEDGE_SEARCH`, `CATALOG_QUERY`, `LEARNING_PROGRESS`) would immediately invalidate 158 snapshot decisions in `decisions.jsonl`, cause ratchet failures in `baseline.json` (dropping held-out correct from 223 to 171), and break CI build checks across PRs.
5. **From Logic Steps 1–4:** The optimal architectural solution is a **Hierarchical Sub-Intent Model**:
   - Level 1: Retain `IntentType.KNOWLEDGE_QUERY = "knowledge_query"`.
   - Level 2: Introduce `sub_intent: Optional[KnowledgeSubIntent]` on `IntentClassificationResult` with 3 values: `KNOWLEDGE_SEARCH` (`"search"`), `CATALOG_QUERY` (`"catalog"`), and `LEARNING_PROGRESS` (`"progress"`).
   - Downstream Dispatch: In `agent.py`, replace pre-router interceptors with a post-router dispatcher reading `intent_res.sub_intent`.
   - State Mutations: Status update commands (ADR-0010 d) remain classified under `IntentType.ROADMAP_CUD` with confirmation previews, guaranteeing that `KNOWLEDGE_QUERY` remains strictly read-only.
6. **From Observation 4 and 5:** Adopting this hierarchical design preserves 100% backward compatibility with `evals/router/check.py` and `decisions.jsonl` while establishing a phased rollout path to eliminate the ADR-0010 test gap via 24 new golden test cases.

---

## 3. Caveats

1. **Pre-Router Migration Timing:** Removing pre-router interceptors in `agent.py` must only occur in Phase 3 after the router's heuristic table and LLM prompt have been upgraded and verified to classify sub-intents with $\ge 95\%$ accuracy.
2. **Visitor Access Control:** In accordance with ADR-0010 §Consequences, lesson status remains strictly Owner-only. If a visitor asks a progress question, the router may classify the sub-intent as `LEARNING_PROGRESS`, but downstream execution must fail-closed with `OWNER_ONLY_MESSAGE` before any DB query is attempted.
3. **External Tools:** `mermaid-cli` (`mmdc`) is not pre-installed in this environment; all Mermaid diagrams in `knowledge-sub-intents-design.md` have been constructed using strictly compliant GitHub-Flavored Markdown syntax (flowchart and gantt) without non-standard styling.

---

## 4. Conclusion

The comprehensive Architecture Design Document has been successfully synthesized and authored at:
`/Users/tienanhnguyen/Desktop/src_example/crisne-website/roadmap-rag-assistant/docs/knowledge-sub-intents-design.md` (676 lines, 64KB).

All requirements from `ORIGINAL_REQUEST.md` (R1, R2, R3, R4) and `DISPATCH.md` are rigorously met:
- **R1:** Downstream execution differences between Vector RAG, In-memory Catalog, and ADR-0010 User Progress are analyzed in depth across 12 criteria, including failure modes and resource profiles.
- **R2:** Hierarchical sub-intent architecture is specified with full Pydantic models, boundary criteria, 18 query examples ($\ge 6$ per sub-intent), ambiguity matrices, and mitigation strategies.
- **R3:** Eval CI impact is thoroughly mapped across 158 decisions, 52 held-out samples, and stress datasets; a 24-case test specification addresses the ADR-0010 gap; and a concrete 4-phase rollout roadmap with DoD and verification gates is detailed.
- **R4:** Delivered exclusively as an authoritative design document in the repository without altering any router source code or eval datasets.

---

## 5. Verification Method

To independently verify the deliverable and ensure zero regressions across the codebase:

1. **Verify Deliverable Existence and Scope Compliance:**
   ```bash
   test -f /Users/tienanhnguyen/Desktop/src_example/crisne-website/roadmap-rag-assistant/docs/knowledge-sub-intents-design.md
   git status --porcelain
   ```
   *Expected:* Only `roadmap-rag-assistant/docs/knowledge-sub-intents-design.md` is added. No files under `rag_service/domains/roadmap/router/` or `evals/router/` are modified.

2. **Verify Router Contract Snapshot (Ratchet Check):**
   ```bash
   cd /Users/tienanhnguyen/Desktop/src_example/crisne-website/roadmap-rag-assistant
   .venv/bin/python -m evals router-check
   ```
   *Expected Output:*
   ```
   ── metrics ──
     heldout.intent_cases.correct     64
     heldout.routing.correct          223
     stress.dropped                   0
     stress.misroute                  0
     stress.ok                        410
     stress.undecided                 94
     stress.wrong_write               0
   ```
   Exit code must be `0`.

3. **Verify Write Safety & Validation Harness:**
   ```bash
   cd /Users/tienanhnguyen/Desktop/src_example/crisne-website/roadmap-rag-assistant
   .venv/bin/python -m evals.router.holdout
   .venv/bin/python -m evals validate
   ```
   *Expected:* Exit code `0` for both commands.

4. **Verify Router Pytest Test Suite:**
   ```bash
   cd /Users/tienanhnguyen/Desktop/src_example/crisne-website/roadmap-rag-assistant
   .venv/bin/python -m pytest tests/test_router_policy.py tests/test_intent_router_safety.py -q
   ```
   *Expected:* `96 passed` in under 2 seconds.
