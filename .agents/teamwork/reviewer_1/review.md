# Independent Architectural & Adversarial Review Report

- **Reviewer:** `reviewer_1` (teamwork_reviewer / critic)
- **Target Deliverable:** `/Users/tienanhnguyen/Desktop/src_example/crisne-website/roadmap-rag-assistant/docs/knowledge-sub-intents-design.md`
- **Working Directory:** `/Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/reviewer_1/`
- **Date:** 2026-11-10T10:15:00Z
- **Verdict:** **APPROVE**

---

## 1. Executive Summary & Review Verdict

**Verdict:** **APPROVE**

The Architecture Design Document at `roadmap-rag-assistant/docs/knowledge-sub-intents-design.md` authored by `worker_design_doc` is an exemplary, rigorous, and factually grounded architectural proposal. It completely fulfills all requirements (R1, R2, R3, R4) and satisfies all Acceptance Criteria set forth in `ORIGINAL_REQUEST.md` and `PROJECT.md`.

### Integrity Audit
- **Hardcoded test outputs / facades:** None detected. Zero code modified.
- **Shortcuts / Task bypass:** None. All technical analyses are grounded in verified codebase facts.
- **Scope constraint adherence:** Verified 100%. `git status` and `git diff` confirm strictly zero edits to router source code (`schemas.py`, `policy.py`, `intent_router.py`) or eval datasets (`evals/router/`).
- **Independent reproduction of tests:** Both `evals router-check` and `pytest` pass with 100% success and exit code 0.

---

## 2. Requirements & Acceptance Criteria Verification Matrix

| Requirement / Acceptance Criterion | Target Specification | Document Section | Evaluation | Status |
| :--- | :--- | :--- | :--- | :--- |
| **R1. Downstream Execution Differences** | Clarify differences between Vector RAG, In-memory Catalog, and ADR-0010 Progress (compute, latency, context, side effects, failure modes). | Section 2 (pp. 81–251) | Rigorous 12-criteria comparison table (Table 2.3) and detailed 4-point failure mode breakdown (RAG hallucination trap, latency waste, counting failure, pipeline bypass). | **PASS** |
| **R2. Sub-Intent Proposal & Schemas** | Candidate sub-intents, Pydantic schemas, boundaries, $\ge 5$ query examples per branch, ambiguity matrix & mitigations. | Section 3 (pp. 252–465) | Hierarchical Sub-Intent Model (`SEARCH`, `CATALOG`, `PROGRESS`), complete Pydantic v2 schemas (`KnowledgeSubIntent`, `KnowledgeQueryMetadata`, extended `IntentClassificationResult`), 18 query examples (6 each), ambiguity matrix, and CUD separation. | **PASS** |
| **R3. Eval CI Impact & Phased Roadmap** | Map impact on `evals/router/`, affected tests, new tests needed, regression risk, phased rollout roadmap. | Section 4 (pp. 466–639) | Exact impact mapped across 158 decisions, 52 held-out samples, 15 intent cases; 24 new test cases specified; 4-phase rollout roadmap with Gantt chart, risks, and DoD. | **PASS** |
| **R4. Deliverable Format & Location** | Committed Markdown Design Document / proposed ADR in repo. | `roadmap-rag-assistant/docs/knowledge-sub-intents-design.md` | Well-structured, fully documented in Vietnamese (terms in English) matching `AGENTS.md` conventions (676 lines, 64KB). | **PASS** |
| **Scope Constraint** | Zero modification to router source code or eval datasets. | Whole repository | Verified via `git status` and `git diff roadmap-rag-assistant/`. Clean working tree for router and evals. | **PASS** |

---

## 3. Verified Claims & Independent Reproduction

Every factual assertion in the design document was independently reproduced and verified against the live workspace:

| Claim in Design Doc | Live Verification Method | Observed Result | Status |
| :--- | :--- | :--- | :--- |
| `IntentType.KNOWLEDGE_QUERY` defined in `schemas.py:16` as flat string enum | `view_file schemas.py:14-21` | Confirmed: `KNOWLEDGE_QUERY = "knowledge_query"` | **PASS** |
| Pre-router interceptors in `agent.py:284-316` bypass router | `view_file agent.py:280-345` | Confirmed: `handle_listing` (284), `handle_sections` (290), `handle_lesson_status` (306) precede `decide_route` (339) | **PASS** |
| Ingestion strips `status` and `statusUpdatedAt` from vector search text | `view_file ingestion.py:91-96` | Confirmed: text contains only title, slug, section, desc, clean_content | **PASS** |
| Exactly 158 / 748 decisions in `decisions.jsonl` are `knowledge_query` | Python inspection script on `evals/router/decisions.jsonl` | Total valid lines: 748, `route == "knowledge_query"`: exactly 158 | **PASS** |
| Exactly 52 / 223 active samples in `samples.jsonl` expect `knowledge_query` | Python inspection script on `samples.jsonl` | Total active: 223, `expected.route == ["knowledge_query"]`: exactly 52 | **PASS** |
| Exactly 15 / 64 intent eval cases expect `knowledge_query` | Python inspection script on `tests/data/intent_eval_cases.json` | Total cases: 64, `expected == "knowledge_query"`: exactly 15 | **PASS** |
| Ad-hoc bridge in `evals/router/check.py:102, 111` | `view_file check.py:102, 111` | Confirmed: `hit = ... or (want == "knowledge_query" and got == "list_topics")` | **PASS** |
| `python -m evals router-check` passes with zero regression | `.venv/bin/python -m evals router-check` | Exited 0: `heldout.routing.correct 223`, `intent_cases.correct 64`, `stress.dropped 0` | **PASS** |
| Pytest router policy & safety passes | `.venv/bin/python -m pytest tests/test_router_policy.py tests/test_intent_router_safety.py -q` | Exited 0: 96 passed in 0.87s | **PASS** |
| Typecheck passes workspace-wide | `yarn tsc --noEmit -p .` | Exited 0: clean typecheck | **PASS** |

---

## 4. Adversarial Critique & Stress-Testing

**Overall Risk Assessment:** **LOW** (The architectural design is robust; the risks identified below are implementation-phase edge cases and operational considerations).

### Challenge 1 [Low/Constructive]: Safe Fallback When `sub_intent` is `None`
- **Assumption Challenged:** Phase 3 implementation guideline (line 614) proposes: *"Nếu `sub_intent` là `None`, tự động chọn `SEARCH` (Vector RAG) để duy trì trải nghiệm như hệ thống cũ."*
- **Attack Scenario:** If an Owner asks an informal progress question (e.g., *"bài nào tôi học xong rồi"* or *"tiến độ của mình sao rồi"*), but the router model fails to assign `sub_intent=PROGRESS` (leaving it `None`), defaulting to `SEARCH` will immediately send the query to Vector RAG, triggering the Personal Progress Hallucination Trap that this design doc specifically seeks to eliminate.
- **Blast Radius:** Owner receives a hallucinated answer about their personal learning progress.
- **Recommended Mitigation:** In Phase 3, do not fall back to `SEARCH` if the query contains strong personal pronoun markers (`"tôi"`, `"mình"`, `"của tôi"`) combined with progress lexicon (`"học xong"`, `"đã nắm"`, `"ôn lại"`). Instead, route to a disambiguation prompt or default to `PROGRESS` with owner-validation.

### Challenge 2 [Low/Constructive]: Handling Visitor Probing for Owner Status
- **Assumption Challenged:** Line 460 mentions: *"Nếu câu hỏi mơ hồ giữa tiến độ và nội dung bài học: Tự động fallback an toàn sang `KNOWLEDGE_SEARCH` công khai."*
- **Attack Scenario:** A visitor asks: *"Chủ sở hữu đã học xong bài RAG chưa?"*
- **Blast Radius:** If classified as `SEARCH`, Vector RAG will search for "chủ sở hữu đã học xong bài RAG" in lesson content. Although DB status won't be leaked (since status is not in the vector store), the LLM might hallucinate a speculative response about whether the owner completed it.
- **Recommended Mitigation:** Enforce a strict privacy filter: If `is_owner() == False` and the query explicitly inquires about lesson status or owner progress, immediately return `OWNER_ONLY_MESSAGE` without falling through to Vector RAG.

### Challenge 3 [Low/Constructive]: Multi-Intent & Compound Knowledge Queries
- **Assumption Challenged:** The design doc models `sub_intent: Optional[KnowledgeSubIntent]` as a single scalar enum.
- **Attack Scenario:** User submits a compound query combining two sub-intents: *"Topic AI có mấy bài và giải thích RAG là gì?"* (Catalog + Search).
- **Blast Radius:** Router can only select one `sub_intent`, potentially dropping the catalog answer or the conceptual explanation.
- **Recommended Mitigation:** In Phase 3, the dispatcher in `agent.py` should leverage `mixed_intent_steps` to prompt the user to split compound sub-intent queries, or execute sequentially.

### Challenge 4 [Low/Constructive]: Retirement of Legacy Ad-Hoc Bridge in CI
- **Observation:** `evals/router/check.py:102, 111` currently hardcodes:
  `hit = got == want or (want == "knowledge_query" and got == "list_topics")`
- **Blast Radius:** Retaining this ad-hoc bridge during Phase 4 could mask false classifications where a query is mistakenly routed to `list_topics`.
- **Recommended Mitigation:** In Phase 4, cleanly deprecate and remove this hardcoded bridge once `sub_intent_check.py` and the updated snapshots are active.

---

## 5. Review Findings Summary

No Critical or Major defects were found. The findings below are constructive suggestions for Phase 1–4 implementation teams:

### [Minor / Enhancement] Finding 1: Explicit Disambiguation Gate for `sub_intent is None`
- **Where:** `roadmap-rag-assistant/docs/knowledge-sub-intents-design.md:614`
- **What:** Defaulting `sub_intent is None` directly to Vector RAG `SEARCH` could re-open the hallucination trap for ambiguous queries.
- **Suggestion:** Add an explicit note in Section 4.3 (Phase 3) that queries containing personal progress indicators should not default to `SEARCH` without safety heuristics.

### [Minor / Enhancement] Finding 2: Serialization Safety in Pydantic Schema
- **Where:** `roadmap-rag-assistant/docs/knowledge-sub-intents-design.md:369-379`
- **What:** Adding `sub_intent: Optional[KnowledgeSubIntent] = None` and `query_metadata: Optional[KnowledgeQueryMetadata] = None` could emit `null` fields in JSON serialization if not using `exclude_none=True`.
- **Suggestion:** Note in Phase 1 implementation to use `model_dump(exclude_none=True)` in tracing / snapshot logging if backward compatibility with legacy consumers requires omission of empty keys.

---

## 6. Conclusion

The deliverable `roadmap-rag-assistant/docs/knowledge-sub-intents-design.md` represents an outstanding, production-ready architectural design. It solves a deep architectural tension in Abot, protects the 748-decision CI ratchet, respects all scope constraints, and provides a clear, actionable 4-phase rollout plan.

**Final Verdict:** **APPROVE**
