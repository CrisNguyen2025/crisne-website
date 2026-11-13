# Architectural Review Report: Knowledge Sub-Intent Architecture Design Document (Iteration 2)

- **Reviewer:** `reviewer_1_r2` (Teamwork Reviewer & Adversarial Critic)
- **Target Document:** `/Users/tienanhnguyen/Desktop/src_example/crisne-website/roadmap-rag-assistant/docs/knowledge-sub-intents-design.md`
- **Evaluation Date:** 2026-11-10
- **Mode:** Development / Integrity Audit
- **Final Verdict:** **APPROVE**

---

## 1. Executive Summary & Verdict

### Verdict: **APPROVE**

The Architecture Design Document at `roadmap-rag-assistant/docs/knowledge-sub-intents-design.md` (988 lines, 80.6 KB) represents an exemplary, empirically validated architectural specification. It completely addresses all four foundational requirements (R1, R2, R3, R4) from `ORIGINAL_REQUEST.md` and meticulously incorporates all 7 fix specifications requested from the retry explorers (`explorer_retry_policy`, `explorer_retry_regex_cud`, and `explorer_retry_false_friends`).

### Integrity & Scope Compliance
- **Zero Source Edits:** Exactly 0 modifications to router source code (`schemas.py`, `policy.py`, `intent_router.py`, `route_decision.py`).
- **Zero Eval Dataset Edits:** Exactly 0 modifications to `evals/router/` or benchmark datasets.
- **Git Cleanliness:** `git status -s` confirms only `.agents/teamwork/` metadata and the designated design doc exist.
- **Integrity Audit:** PASS. No hardcoded results, dummy facades, or shortcuts. All analytical figures (158 decisions, 52 roadmap questions, 7/45 catalog/content split, 4 trapped search_word queries) were independently reproduced against `evals/router/decisions.jsonl`.

---

## 2. Requirement Verification Matrix (R1 – R4)

| Req ID | Requirement Description | Verification Method | Status | Findings / Assessment |
| :--- | :--- | :--- | :---: | :--- |
| **R1** | **Phân tích hiện trạng & Downstream execution differences**<br>So sánh Vector RAG, In-memory Catalog, và Learning Progress (ADR-0010) về tài nguyên, độ trễ, ngữ cảnh, side effects. | Direct code analysis against Section 2.1–2.4 | **PASS** | Section 2.1 details the 5 routing mechanisms into `KNOWLEDGE_QUERY`. Section 2.2 dissects the 3 downstream branches down to file and line (`sources.py:68`, `commands.py`, `lesson_status.py`). Section 2.3 provides a 13-row comparison matrix (compute, 800-3500ms vs 5-40ms vs 10-60ms latency, 0 vs 2.5k tokens, Public vs Owner-only auth). Section 2.4 details 5 specific failure modes including hallucination, latency waste, counting failure, and the 86.5% lumping trap. |
| **R2** | **Thiết kế & đề xuất phương án sub-intent**<br>Candidate sub-intents, Pydantic schemas, ranh giới phân định, ví dụ câu hỏi, rủi ro phân mảnh/nhầm lẫn và biện pháp giảm thiểu. | Direct inspection of Section 3.1–3.5 | **PASS** | Section 3.1 rigorously justifies Option 3 (Hierarchical Sub-Intent) over Option 1 (monolith) and Option 2 (flat enum). Section 3.2 specifies Pydantic v2 schemas (`KnowledgeSubIntent`, `KnowledgeQueryMetadata`, `IntentClassificationResult` with `@property sub_intent_value` and `@model_validator`). Explicitly demarcates ADR-0010 mutation actions to `ROADMAP_CUD` with `write="confirm"`. Section 3.3 provides the 18-row `DECISION_TABLE`. Section 3.4 provides 21 realistic examples and enhanced regexes. Section 3.5 provides a 9-row extended ambiguity matrix. |
| **R3** | **Đánh giá tác động eval CI & Lộ trình triển khai**<br>Tác động lên `evals/router/`, regression risk, test cases bổ sung ($\ge 24$ cases), lộ trình 4 giai đoạn an toàn. | Verification of Section 4.1–4.3 and execution of eval tools | **PASS** | Section 4.1 analyzes two-tier gating (ratchets and 748-decision snapshot), proving zero ratchet metric regression (`heldout.routing.correct`=223, `heldout.intent_cases.correct`=64). Details snapshot migration for 52 roadmap questions and 4 trapped search_word queries. Section 4.2 details 24 new test cases across Catalog (8), Progress (10), and Boundary (6). Section 4.3 defines a 4-phase rollout with Gantt chart, clear DoD, and the 3 Golden Rules for downstream safe access. |
| **R4** | **Tài liệu bàn giao & Ranh giới phạm vi**<br>Markdown document in repository, zero edits to router source code or eval datasets. | `git status -s`, `git diff HEAD`, inspection of file path | **PASS** | File created at `/Users/tienanhnguyen/Desktop/src_example/crisne-website/roadmap-rag-assistant/docs/knowledge-sub-intents-design.md`. 0 lines of code or datasets modified outside documentation. |

---

## 3. Verification of 7 Fix Items (Challenger 2 / Retry Explorers)

| Fix Item | Focus Area | Required Specification | Document Section & Verified Content | Status |
| :---: | :--- | :--- | :--- | :---: |
| **1** | **86.5% Non-Catalog Lumping Trap** | Document the 86.5% non-catalog lumping trap for `roadmap_question` and specify its split into `roadmap_catalog_query` vs `roadmap_content_query`. | **Sections 1.2, 1.4, 2.4, 3.3, 4.1, 5.1 (Script 6)**<br>Empirically proved that out of 52 `roadmap_question` decisions, exactly 45 (86.5%) are hypothetical CUD questions, past audits, or content questions, and only 7 (13.5%) are structural catalog queries. Successfully split into `Row("roadmap_catalog_query")` (`sub_intent=CATALOG`) and `Row("roadmap_content_query")` (`sub_intent=SEARCH`). | **PASS** |
| **2** | **18-Row Precedence Ordering** | Detail the 18-row `DECISION_TABLE` precedence order placing structured sub-intent rules before generic `search_word`. | **Sections 1.2, 1.4, 3.3, 5.1 (Script 7)**<br>Formulated the core architectural principle: *"Domain-Specific Structured Sub-Intents MUST Precede Generic Keyword Fallbacks"*. Placed `progress_query` (row 9), `catalog_list_query` (row 10), and `roadmap_catalog_query` (row 11) strictly before `search_word` (row 12). Resolves the 4 trapped catalog queries verified in Script 7. | **PASS** |
| **3** | **Schema Robustness & Accessors** | Add `@property sub_intent_value` and `@model_validator` to `IntentClassificationResult`, and `sub_intent` to `Row`. | **Section 3.2 (lines 360–427)**<br>Added `@property sub_intent_value` returning `Optional[str]` to eliminate `AttributeError`. Added `@model_validator(mode="after") enforce_sub_intent_hierarchy` which normalizes `sub_intent` and `query_metadata` to `None` if `intent != KNOWLEDGE_QUERY`. Added `sub_intent: Optional[KnowledgeSubIntent] = None` to `Row`. | **PASS** |
| **4** | **Enhanced Regexes & CUD Verbs** | Add enhanced progress regexes supporting flexible word order, and specify adding `"đánh dấu"` to `CUD_VERB_WORDS`, `ACTION_VERBS["update"]`, and `object_sense.py`. | **Section 3.4 (lines 620–680), Section 5.1 (Script 8)**<br>Detailed `_NEXT_CUE_ENHANCED`, `_KNOWN_CUE_ENHANCED`, `_REVIEW_CUE_ENHANCED`. Added question tag `"chưa"` to `understanding.py`. Synchronously added `"đánh dấu"`, `"đặt"`, `"mark"`, `"set"` to `CUD_VERB_WORDS` and `ACTION_VERBS["update"]`, and added `STATUS_PREPOSITION_EXCLUSIONS` to `object_sense.py` to prevent `WRITE_DENY`. | **PASS** |
| **5** | **Expanded Ambiguity Matrix** | Expand with false-friend entries (non-domain `"tiến độ"` rejected by $P_3/P_4$, `"mấy bài"` quantifier disambiguation, mixed queries). | **Section 3.5 (lines 682–697)**<br>Created a comprehensive 9-row ambiguity matrix detailing root cause and multi-phase resolution ($P_0$ focus/clause extraction, $P_1$ speech act, $P_3$ target, $P_4$ scope) for non-domain progress, quantifier vs question "mấy bài", life advice vs lesson progress, state mutation vs progress, and mixed multi-intent queries. | **PASS** |
| **6** | **Downstream Safe Access Guidelines** | Document the 3 golden safe accessor rules preventing `AttributeError: 'NoneType' object has no attribute 'value'`. | **Section 4.3 (Phase 3, lines 825–881)**<br>Documented 3 Golden Rules with concrete code examples:<br>1. *Safe Accessor Rule:* Always use `sub_intent_value` for SSE step events and telemetry.<br>2. *Strict Hierarchical Guarding:* Never check `sub_intent` without first confirming `intent == KNOWLEDGE_QUERY`.<br>3. *Safe Fallback Rule:* Always degrade gracefully to Vector RAG (`KnowledgeSubIntent.SEARCH`) if `sub_intent is None`. | **PASS** |
| **7** | **Repository CI & Test Verification** | Verify that repository CI remains 100% clean and passing. | **Independent Test Execution**<br>- `python -m evals router-check`: PASS (0 diffs, metrics: heldout.intent_cases.correct=64, heldout.routing.correct=223, stress.ok=410)<br>- `python -m evals validate`: PASS (413 samples, 117 docs)<br>- `python -m pytest tests/test_router_policy.py tests/test_intent_router_safety.py -q`: PASS (96 passed in 0.91s)<br>- `yarn tsc --noEmit -p .`: PASS (0 errors)<br>- Embedded scripts 6, 7, 8 in Section 5.1: ALL PASS. | **PASS** |

---

## 4. Adversarial Challenge & Stress-Testing

As adversarial critic, we stress-tested the proposed architectural design against potential failure modes and boundary edge cases:

### Challenge 1: Multi-Phase Gating vs Adversarial Lexicon Injection
- **Scenario:** A hostile input embeds progress cues within an external topic: *"Tiến độ giải ngân vốn đầu tư công đã nắm chưa"*.
- **Stress-Test:** If routing depended solely on regex matching, `_KNOWN_CUE_ENHANCED` would trigger on `"tiến độ ... đã nắm chưa"`.
- **Finding:** The design doc explicitly specifies in Section 3.5 that $P_3$ Target determines `Target.NONE` and $P_4$ Scope assigns `Scope.EXTERNAL`. When `Scope == EXTERNAL`, the router pipeline unconditionally routes to `IntentType.OUT_OF_SCOPE` before $P_5$ heuristic rows evaluate.
- **Verdict:** ROBUST. Multi-phase gating successfully defends against false positives.

### Challenge 2: Accidental Mutation via Read Intent
- **Scenario:** A user phrasing a mutation as a knowledge question: *"Tôi muốn đổi trạng thái bài Docker sang đã nắm thì làm thế nào?"* vs *"Đánh dấu bài Docker là đã nắm"*.
- **Stress-Test:** Could mutation commands slip into `KNOWLEDGE_QUERY.PROGRESS` and bypass the two-step preview safety gate?
- **Finding:** Section 3.2 and Section 3.5 establish an invariant: `KNOWLEDGE_QUERY` is pure read-only. `SpeechAct.COMMAND` with mutation action verbs (`"đánh dấu"`, `"chuyển"`) is routed to `IntentType.ROADMAP_CUD` with `write="confirm"`. Questions asking "how-to" without explicit command are routed to `KNOWLEDGE_QUERY.SEARCH` or how-to QA.
- **Verdict:** ROBUST. Data integrity is strictly preserved.

### Challenge 3: Streaming Event Crash on Null Sub-Intent
- **Scenario:** A chitchat message (`intent = IntentType.CHITCHAT`) emits a step event in `agent.py:365`. If code attempts `sub_intent = intent_res.sub_intent.value`, Python raises `AttributeError: 'NoneType' object has no attribute 'value'`, crashing the SSE stream.
- **Stress-Test:** Can `sub_intent` ever be `None`? Yes, for all non-knowledge intents!
- **Finding:** Section 3.2 specifies `@property sub_intent_value` which returns `None` safely. Section 4.3 Golden Rule 1 strictly mandates using `intent_res.sub_intent_value` for all SSE events and Langfuse traces.
- **Verdict:** ROBUST. Defensive accessor completely eliminates SSE stream crashes.

### Challenge 4: Zero-Downtime Rollout and Test Ratchet Safety
- **Scenario:** When updating `DECISION_TABLE`, does modifying the row name from `roadmap_question` to `roadmap_catalog_query` break CI?
- **Stress-Test:** `check.py` checks `heldout.routing.correct` and `heldout.intent_cases.correct`.
- **Finding:** In `baseline.json`, ratchets track `route: "knowledge_query"`, which remains completely unchanged across all 158 decisions. Section 4.1 documents the 2-step migration protocol (`python -m evals router-check` followed by `--accept`) to update the snapshot's internal `rules` metadata without metric regression.
- **Verdict:** ROBUST. Clear phased transition prevents build breakages.

---

## 5. Review Conclusion

The updated design document `roadmap-rag-assistant/docs/knowledge-sub-intents-design.md` represents thorough, production-ready systems engineering. It resolves all architectural ambiguities, eliminates downstream latency and hallucination traps, respects ADR-0010 security boundaries, and provides an actionable blueprint for implementation without modifying a single line of router code prematurely.

**Recommendation:** **APPROVE** without reservations. Proceed to Orchestrator handoff.
