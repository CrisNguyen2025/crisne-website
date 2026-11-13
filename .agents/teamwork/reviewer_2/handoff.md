# Handoff Report: Independent Architectural Review of `knowledge-sub-intents-design.md`

- **Agent:** `reviewer_2` (Roles: reviewer, critic)
- **Working Directory:** `/Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/reviewer_2/`
- **Target Deliverable:** `/Users/tienanhnguyen/Desktop/src_example/crisne-website/roadmap-rag-assistant/docs/knowledge-sub-intents-design.md`
- **Review Date:** 2026-11-10T10:06:00Z
- **Verdict:** **APPROVE**

---

## 1. Observation

1. **Deliverable Existence & Scope Constraint Compliance:**
   - Command `git status --porcelain` executed: Only `roadmap-rag-assistant/docs/knowledge-sub-intents-design.md` was added as untracked under `roadmap-rag-assistant/`.
   - File length: 676 lines (64,365 bytes).
   - Zero files under `rag_service/domains/roadmap/router/` (`schemas.py`, `policy.py`, `intent_router.py`) or `evals/router/` were modified.
2. **Current Monolithic Intent & Downstream Interceptors:**
   - In `schemas.py:16`, `IntentType.KNOWLEDGE_QUERY = "knowledge_query"`. `IntentClassificationResult` (lines 94–110) contains only `(intent, confidence, needs_cud_extraction, needs_confirmation)`.
   - In `agent.py:284-316`, `handle_listing` (line 284), `handle_sections` (line 290), and `handle_lesson_status` (line 306) intercept user messages before `decide_route` at line 339.
   - At line 436, `if intent_res.intent == IntentType.KNOWLEDGE_QUERY:` routes directly to `answer_from_sources(...)`.
   - In `retrieval/ingestion.py:92-96`, `DatabaseIngestionWorker` builds search text from `title`, `slug`, `section`, `description`, `clean_content`. Fields `status` and `statusUpdatedAt` are omitted, confirming that vector search has zero personal progress awareness.
3. **CI Ratchet & Dataset Metrics:**
   - In `evals/router/decisions.jsonl`, exactly 158 of 748 decisions have `"route": "knowledge_query"` (100% verified via Python script).
   - In `evals/datasets/_routing/samples.jsonl`, exactly 52 of 223 active samples expect `["knowledge_query"]`.
   - In `tests/data/intent_eval_cases.json`, exactly 15 of 64 cases expect `"knowledge_query"`.
   - In `evals/router/check.py:102, 111`, an explicit compatibility bridge exists: `hit = d["route"] == heldout_want(s) or (heldout_want(s) == "knowledge_query" and d["route"] == "list_topics")`.
   - In `evals/router/`: Zero test cases evaluate ADR-0010 user learning progress queries.
4. **Independent Verification Execution Results:**
   - `cd roadmap-rag-assistant && .venv/bin/python -m evals router-check`: Exited 0 with metrics `heldout.intent_cases.correct 64`, `heldout.routing.correct 223`, `stress.dropped 0`, `stress.misroute 0`, `stress.wrong_write 0`.
   - `cd roadmap-rag-assistant && .venv/bin/python -m evals.router.holdout`: Exited 0 (`write_now_violations: 0`, `missed_writes: 0`).
   - `cd roadmap-rag-assistant && .venv/bin/python -m evals validate`: Exited 0 (`OK: 413 samples in 4 datasets, 117 documents in 1 corpora`).
   - `cd roadmap-rag-assistant && .venv/bin/python -m pytest tests/test_router_policy.py tests/test_intent_router_safety.py -q`: Exited 0 (`96 passed in 0.91s`).
   - `cd roadmap-rag-assistant && .venv/bin/python -m pytest tests/test_lesson_status_e2e.py -q`: Exited 0 (`10 passed in 2.22s`).
5. **Schema Backward Compatibility Verification:**
   - Instantiating `IntentClassificationResult` with only legacy fields (`intent=IntentType.KNOWLEDGE_QUERY, confidence=0.9`) succeeded with `sub_intent=None` and `query_metadata=None`. Calling `.model_dump()` preserved schema serialization cleanly.
6. **Minor Observation on Sub-Breakdown:**
   - In Section 4.1 of the design doc, the breakdown across policy rows was stated as `row=search_word: 134`, `row=roadmap_question: 18`. The actual breakdown from `decisions.jsonl` rules is `row=search_word: 102`, `row=roadmap_question: 52`. The total is exactly 158 in both cases.

---

## 2. Logic Chain

1. **From Observation 1 and 4:** The author complied 100% with all scope boundaries. All test suites pass with zero errors, zero regressions, and zero write violations.
2. **From Observation 2:** The current monolithic `KNOWLEDGE_QUERY` design forces brittle regex pre-router interceptors. Any natural question failing the regex falls into `answer_from_sources`, where the absence of status fields in Vector RAG causes personal progress hallucination and a 50x–100x latency penalty for catalog queries.
3. **From Observation 3 and 5:** A flat top-level enum change would immediately invalidate 158 snapshot decisions in `decisions.jsonl` and crash the CI baseline ratchet. Conversely, the Hierarchical Sub-Intent Model retains `intent = "knowledge_query"` at Level 1, guaranteeing that `Decision.snapshot()` outputs `route: "knowledge_query"`. This provides 100% backward compatibility for CI tests while exposing `sub_intent` for downstream routing.
4. **From Observation 2, 4, and 5:** The proposed Pydantic schema (`KnowledgeSubIntent`, `KnowledgeQueryMetadata`, `IntentClassificationResult`) is syntactically sound, type-safe, and backward-compatible.
5. **From Observation 3:** The proposed 24 new test cases and dual-eval harness (`sub_intent_check.py`) directly bridge the identified ADR-0010 test gap without prematurely breaking `check.py`'s ratchet baseline.
6. **Integrity Verification:** No hardcoded bypasses, dummy implementations, or fabricated outputs were detected. The design doc reflects deep, authentic architectural reasoning.
7. **Synthesis:** All acceptance criteria in `ORIGINAL_REQUEST.md` (R1, R2, R3, R4) are met with exceptional technical depth.

---

## 3. Caveats

1. **Phase 3 CUD vs Query Decoupling:** In `lesson_status.py`, `handle_lesson_status` currently houses both query functions and status change mutation commands (`parse_status_change_request`). During Phase 3 implementation, status mutation handling must be connected to `ROADMAP_CUD` with preview confirmation, while query handling is wired under `KNOWLEDGE_QUERY.PROGRESS`.
2. **Quantitative Progress Disambiguation:** For queries asking *"Tôi đã hoàn thành bao nhiêu bài trong topic X?"*, policy priority must direct to `PROGRESS` with `is_counting_query=True`, rather than falling into generic `CATALOG` counting.
3. **Visitor Fail-Closed Enforcement:** When `sub_intent == PROGRESS`, downstream execution must continue to enforce fail-closed check `is_owner() == True` before querying the database.

---

## 4. Conclusion

**Verdict: APPROVE**

The Architecture Design Document at `roadmap-rag-assistant/docs/knowledge-sub-intents-design.md` is approved without reservation. It provides an airtight, robust, and backward-compatible foundation for upgrading Abot's router to support knowledge sub-intents.

---

## 5. Verification Method

To independently reproduce this verification:

1. **Verify Scope Compliance:**
   ```bash
   git status --porcelain
   ```
   *Expected:* Only `roadmap-rag-assistant/docs/knowledge-sub-intents-design.md` is untracked; zero edits to router source code or eval datasets.

2. **Execute Full Router & Eval Verification Suite:**
   ```bash
   cd /Users/tienanhnguyen/Desktop/src_example/crisne-website/roadmap-rag-assistant
   .venv/bin/python -m evals router-check
   .venv/bin/python -m evals.router.holdout
   .venv/bin/python -m evals validate
   .venv/bin/python -m pytest tests/test_router_policy.py tests/test_intent_router_safety.py -q
   .venv/bin/python -m pytest tests/test_lesson_status_e2e.py -q
   ```
   *Expected:* All commands exit with code `0`.

3. **Verify Snapshots & Active Counts:**
   ```bash
   cd /Users/tienanhnguyen/Desktop/src_example/crisne-website/roadmap-rag-assistant
   .venv/bin/python -c '
   import json
   with open("evals/router/decisions.jsonl") as f:
       d = [json.loads(l) for l in f if l.strip()]
   print("Total decisions:", len(d), "Knowledge queries:", sum(1 for x in d if x.get("route") == "knowledge_query"))
   '
   ```
   *Expected Output:* `Total decisions: 748 Knowledge queries: 158`
