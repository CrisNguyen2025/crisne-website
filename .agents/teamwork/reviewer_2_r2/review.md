# Architectural Review & Adversarial Challenge Report (Iteration 2)

- **Reviewer:** `reviewer_2_r2` (Roles: reviewer, critic)
- **Target Document:** `/Users/tienanhnguyen/Desktop/src_example/crisne-website/roadmap-rag-assistant/docs/knowledge-sub-intents-design.md`
- **Reference Inputs:**
  - `ORIGINAL_REQUEST.md`
  - `worker_update_design_doc/handoff.md`
  - Explorer reports (`explorer_retry_policy`, `explorer_retry_regex_cud`, `explorer_retry_false_friends`)
- **Date:** 2026-11-10
- **Final Verdict:** **APPROVE**

---

## 1. Executive Summary & Verdict

### Verdict: **APPROVE**

The updated Architecture Design Document (`roadmap-rag-assistant/docs/knowledge-sub-intents-design.md`) represents an exceptional, empirically grounded, and rigorously verified architectural specification. It successfully resolves all architectural ambiguities, eliminates critical failure modes identified in previous iterations, and provides concrete, drop-in-ready code designs for:
1. The **18-row `DECISION_TABLE`** with strict precedence placing domain-specific structured sub-intents (`progress_query`, `catalog_list_query`, `roadmap_catalog_query`) at rows 9–11, strictly ahead of generic `search_word` at row 12.
2. The clean empirical split of `roadmap_question` based on the 86.5% non-catalog lumping discovery (13.5% Catalog vs 86.5% Content/Hypothetical/Audit/Negation).
3. The Pydantic schema v2 definitions with `@property sub_intent_value` and `@model_validator(mode="after") enforce_sub_intent_hierarchy`.
4. The **3 Golden Rules for Safe Downstream Access**, completely eliminating the risk of `AttributeError: 'NoneType' object has no attribute 'value'` during SSE streaming and telemetry tracing.
5. Enhanced progress regexes (`_NEXT_CUE_ENHANCED`, `_KNOWN_CUE_ENHANCED`, `_REVIEW_CUE_ENHANCED`), sentence-final `"chưa"` question tag, and synchronous `"đánh dấu"` CUD updates across `policy.py` and `object_sense.py`.
6. An Extended Ambiguity Matrix covering 9 subtle conflict pairs and multi-phase ($P_0 - P_4$) disambiguation rules.
7. A complete 4-phase rollout plan with 24 specified test cases and zero metric regression on CI.

---

## 2. Integrity Verification & Scope Compliance

As an adversarial reviewer and integrity gatekeeper, the codebase was inspected for any violations:

| Check Category | Verification Method | Result | Status |
| :--- | :--- | :--- | :--- |
| **Strict Zero Code Edits** | `git status -s`, `git diff --stat`, `git diff --staged --stat` | No tracked router files (`schemas.py`, `policy.py`, `intent_router.py`, `route_decision.py`) or eval datasets modified. Only docs and teamwork metadata present. | **PASS** |
| **Zero Eval Dataset Edits** | `git status -s evals/router/` | 0 modifications to `decisions.jsonl`, `baseline.json`, `confuse_baseline.json`, `samples.jsonl`. | **PASS** |
| **No Hardcoded Test Results** | Inspection of test files & doc scripts | All assertions run dynamically against live dataset files (`decisions.jsonl`). | **PASS** |
| **No Dummy / Facade Specs** | Line-by-line inspection of Python code blocks | Full Pydantic v2 classes, compiled regexes, helper functions, and downstream generator loops provided. | **PASS** |
| **Independent Verification** | Direct CLI reproduction of CI & test scripts | All 4 CI commands + 3 empirical verification scripts executed directly. | **PASS** |

### Independent CI Execution Results:
1. `yarn tsc --noEmit -p .`: Exited code 0 (Workspace TypeScript clean).
2. `python -m evals router-check`: Exited code 0 (`heldout.intent_cases.correct=64`, `heldout.routing.correct=223`, `stress.ok=410`, `misroute=0`).
3. `python -m evals.router.holdout`: Exited code 0 (`write_now_violations=0`, `missed_writes=0`).
4. `python -m evals validate`: Exited code 0 (`413 samples in 4 datasets, 117 documents in 1 corpora`).
5. `pytest -q`: **1001 passed in 19.88s** (including 96 router safety and policy tests).

---

## 3. Deep Architectural Quality Assessment

### 3.1 The 18-Row `DECISION_TABLE` Precedence Order
The design document establishes a clear architectural invariant:
> *"Domain-Specific Structured Sub-Intents (Progress & Catalog) MUST Precede Generic Keyword Fallbacks (Search Word)."*

**Precedence Analysis:**
- **Rows 1–2 (Plan & Off-topic):** High-level intent classification (`plan`, `off_topic`).
- **Rows 3–5 (Chitchat & Persona):** Greetings and identity inquiries.
- **Rows 6–8 (Write Permissions & Safety Blockers):** `blocked_change` (write="deny"), `change_request` (write="confirm"), and `change_command` (write="allow").
- **Rows 9–11 (Structured Sub-Intents):**
  - Row 9: `progress_query` (`needs="progress_cue"`, `sub_intent=PROGRESS`)
  - Row 10: `catalog_list_query` (`needs="catalog_list"`, `sub_intent=CATALOG`)
  - Row 11: `roadmap_catalog_query` (`target=Target.ROADMAP`, `needs="catalog_cue"`, `sub_intent=CATALOG`)
- **Row 12 (Generic Keyword Search):** `search_word` (`needs="search_word"`, `sub_intent=SEARCH`).
- **Row 13 (Advice Question):** `advice_question` (relays to LLM router).
- **Rows 14–17 (Semantic Fallback Net):**
  - Row 14: `roadmap_content_query` (`target=Target.ROADMAP`, `sub_intent=SEARCH`)
  - Row 15: `known_title_question` (`needs="known_title"`, `sub_intent=SEARCH`)
  - Row 16: `how_to_question` (`target=Target.NONE`, `needs="how_to"`, `sub_intent=SEARCH`)
  - Row 17: `show_request` (`target=Target.ROADMAP`, `sub_intent=CATALOG`)
- **Row 18 (Opener Fallback):** `greeting_opener`.

**Empirical Verification:**
In the baseline router, 4 catalog queries were trapped in `row=search_word`:
1. `"Show me all lessons under the DevOps mục"`
2. `"cho xem danh sach cac topic trong phan frontend"`
3. `"danh sách bài trong layer Docker"`
4. `"liệt kê tất cả các bài học thuộc topic 1 cho mình xem"`
Because `"danh sách"`, `"liệt kê"`, `"list"`, and `"show me"` belong to `SEARCH_WORDS`, having `search_word` at row 9 in the old table intercepted them before any catalog rule could trigger, forcing them into Vector RAG (800ms–3500ms latency, high token usage). By elevating `catalog_list_query` to row 10 and placing `search_word` at row 12, these queries are routed to In-Memory Catalog (5ms–40ms, 0 tokens).

### 3.2 Resolution of the 86.5% `roadmap_question` Lumping Trap
The design document documents an empirical discovery from `decisions.jsonl`:
- Exactly 52 decisions match `row=roadmap_question`.
- Of these, exactly 7 (13.5%) are structural catalog queries.
- Exactly 45 (86.5%) are content queries, hypothetical CUD questions (*"nếu xóa topic AI thì có mất bài không"*), past audit questions (*"ai đã xóa bài Redis k"*), negated commands (*"đừng xóa bài Machine Learning k"*), or concept QA (*"bài đó nói gì"*).

**Technical Evaluation:**
If `roadmap_question` had been assigned wholesale to `sub_intent=CATALOG`, 86.5% of queries would have routed to In-Memory Catalog, which completely lacks LLM generation, vector embeddings, and audit trails.
The design splits this into:
- `roadmap_catalog_query` at row 11: requires `needs="catalog_cue"`, which checks for counting/position/hierarchy cues AND explicitly filters out `u.write_blocker in ("hypothetical", "past_report")`.
- `roadmap_content_query` at row 14: acts as the safe fallback net, assigning `sub_intent=KnowledgeSubIntent.SEARCH`, ensuring full LLM/RAG semantic processing.
Independent execution of Verification Script 6 confirmed:
`Total: 52 | Catalog: 7 (13.5%) | Content: 45 (86.5%) — PASSED.`

### 3.3 Schema Robustness & Downstream Safe Access
The design specifies:
```python
@property
def sub_intent_value(self) -> Optional[str]:
    return self.sub_intent.value if self.sub_intent is not None else None

@model_validator(mode="after")
def enforce_sub_intent_hierarchy(self) -> "IntentClassificationResult":
    if self.intent != IntentType.KNOWLEDGE_QUERY and self.sub_intent is not None:
        object.__setattr__(self, "sub_intent", None)
        object.__setattr__(self, "query_metadata", None)
    return self
```
**Safety Analysis:**
- In `agent.py:365`, the streaming dispatcher formats `step_event` with `intent=intent_res.intent.value`. Without `@property sub_intent_value`, writing `sub_intent=intent_res.sub_intent.value` would raise `AttributeError: 'NoneType' object has no attribute 'value'` whenever intent is `CHITCHAT`, `ROADMAP_CUD`, `PLAN_GOAL`, or `OUT_OF_SCOPE`.
- Golden Rule 1 ensures that event streaming and Langfuse tracing access `sub_intent_value` safely.
- Golden Rule 2 enforces strict top-level intent gating (`intent == KNOWLEDGE_QUERY`) before examining `sub_intent`.
- Golden Rule 3 establishes safe fallback to Vector RAG (`KnowledgeSubIntent.SEARCH`) whenever `sub_intent is None` under `KNOWLEDGE_QUERY`.

### 3.4 Progress Regexes & CUD Mutation Synchronization
- Vietnamese syntax frequently inserts nouns between verbs and particles ("học bài gì tiếp", "sau bài Docker Compose thì nên học bài nào"). The enhanced regexes (`_NEXT_CUE_ENHANCED`, `_KNOWN_CUE_ENHANCED`, `_REVIEW_CUE_ENHANCED`) pass 100% of tricky Vietnamese phrasing while correctly rejecting non-domain economic queries ("tiến độ giải ngân vốn đầu tư công"). Independent execution of Verification Script 8 confirmed this.
- Adding sentence-final `"chưa"` to `understanding.py` ensures that status verification questions like *"Bài Docker đã nắm chưa"* are recognized as `act=SpeechAct.QUESTION`.
- Adding `"đánh dấu"`, `"đặt"`, `"mark"`, `"set"` to `CUD_VERB_WORDS` and `ACTION_VERBS["update"]` in `policy.py` prevents `write_gate.py:95` from triggering `WRITE_DENY (action_not_asked)`.
- Adding `STATUS_PREPOSITION_EXCLUSIONS` in `object_sense.py` prevents phrases like *"chuyển bài X sang đã nắm"* from being misidentified as external locations.

---

## 4. Adversarial Challenges & Stress-Testing

As an adversarial critic, the following potential failure modes and boundary conditions were stress-tested:

### Challenge 1: Accidental Command Masking under `catalog_list_query`
- **Challenged Assumption:** Could destructive commands containing listing words (e.g., *"xem danh sách các topic để xóa"*) be prematurely caught by `catalog_list_query` at row 10?
- **Analysis:**
  1. In `DECISION_TABLE`, rows 6–8 (`blocked_change`, `change_request`, `change_command`) evaluate **before** row 10.
  2. In `matches_catalog_list(u, text)` (Section 3.3, line 567):
     ```python
     if u.has_change_verb:
         return False
     ```
  3. If a change verb is present, `matches_catalog_list` immediately returns `False`.
- **Verdict:** Robust defense-in-depth. Risk is **LOW**.

### Challenge 2: Multi-Intent Queries Combining Concept QA and Catalog Listing
- **Challenged Assumption:** How does the router behave when the user asks: *"Giải thích RAG là gì và cho tôi xem danh sách topic"*?
- **Analysis:**
  If routed to `CATALOG`, the system outputs only topic titles, completely omitting the explanation of RAG, which breaks user expectations.
  Section 3.5 (False Friend 5) explicitly establishes the priority rule:
  *When a query combines Search + Catalog, the router prioritizes `sub_intent=SEARCH` (Vector RAG).* Vector RAG has sufficient context to answer both or address the primary conceptual question.
- **Verdict:** Addressed cleanly. Risk is **LOW**.

### Challenge 3: Unauthenticated / Visitor Access to Learning Progress
- **Challenged Assumption:** What happens if a visitor (not Owner) asks: *"tiến độ học tập của tôi đến đâu rồi"*?
- **Analysis:**
  Section 2.2.3 and Golden Rule 2 enforce strict fail-closed authorization:
  ```python
  elif intent_res.sub_intent == KnowledgeSubIntent.PROGRESS:
      if not is_owner():
          yield step_event("error", "auth", "denied", message=OWNER_ONLY_MESSAGE)
          yield _stream_text(OWNER_ONLY_MESSAGE)
          return
  ```
  The visitor is cleanly denied access without touching the Turso database, preventing information leakage.
- **Verdict:** Fully compliant with ADR-0010. Risk is **LOW**.

### Challenge 4: Heuristic Exhaustion & LLM Router Fallback Sub-Intent Resolution
- **Challenged Assumption:** What happens if an obscure query fails all heuristic rows and drops into the LLM Router (`intent_router.py:aroute`)?
- **Analysis:**
  Golden Rule 3 establishes that if `intent == KNOWLEDGE_QUERY` but `sub_intent is None`, downstream dispatching defaults safely to Vector RAG (`KnowledgeSubIntent.SEARCH`).
  *Constructive Recommendation for Phase 2:* The prompt for LLM Router (`_ROUTER_SYSTEM_PROMPT`) should be updated during Phase 2 to instruct the LLM to output `sub_intent` ("search", "catalog", "progress") in its JSON response, avoiding unnecessary fallback to Vector RAG for non-heuristic catalog questions.
- **Verdict:** Safe degradation guaranteed. Recommendation logged.

### Challenge 5: Snapshot Maintenance During CI Ratchet Transitions
- **Challenged Assumption:** Will the introduction of `roadmap_catalog_query` and `catalog_list_query` cause unexpected CI pipeline breakage?
- **Analysis:**
  Section 4.1 establishes that top-level `"route"` remains `"knowledge_query"` across all 158 decisions. The ratchet thresholds (`heldout.routing.correct = 223`, `heldout.intent_cases.correct = 64`) remain unchanged. The diff in `rules` (`row=roadmap_question` -> `row=roadmap_catalog_query` / `row=roadmap_content_query`) is intentional and will be cleanly incorporated via `python -m evals router-check --accept` in Phase 1.
- **Verdict:** Fully planned and verified. Risk is **LOW**.

---

## 5. Review Findings & Action Items

### Findings:
- **No Critical Findings.** Zero integrity violations, zero regressions.
- **No Major Findings.** All requirements R1, R2, R3, R4 and dispatch focus items are completely satisfied.
- **Minor / Implementation Note (For Phase 2/3):**
  When updating `_ROUTER_SYSTEM_PROMPT` in `intent_router.py` during Phase 2, include instructions for `sub_intent` JSON generation so that LLM Router fallback can classify sub-intents with high precision alongside the heuristic table.

---

## 6. Conclusion

The Architecture Design Document at `roadmap-rag-assistant/docs/knowledge-sub-intents-design.md` is **approved without reservation**. It provides an exhaustive, empirically verified foundation that solves the real-world latency, resource, and privacy challenges of Abot's Knowledge Query routing while preserving complete backwards compatibility with the existing test suite and evaluation ratchets.
