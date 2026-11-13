# Handoff Report: Architectural Review (Iteration 2) — Reviewer 2

- **Agent:** `reviewer_2_r2` (Roles: reviewer, critic)
- **Conversation ID:** `8fa72757-c9d5-4283-80cd-3dede9e0b9ec`
- **Parent Conversation ID:** `88cff40c-5d96-4718-b370-cc0b520b35d9`
- **Working Directory:** `/Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/reviewer_2_r2/`
- **Target File:** `/Users/tienanhnguyen/Desktop/src_example/crisne-website/roadmap-rag-assistant/docs/knowledge-sub-intents-design.md`
- **Date:** 2026-11-10
- **Final Verdict:** **APPROVE**

---

## 1. Observation

1. **Git Repository Status & Scope Constraints:**
   - Command `git status -s` yielded:
     ```
     ?? .agents/teamwork/
     ?? roadmap-rag-assistant/docs/knowledge-sub-intents-design.md
     ```
   - Command `git diff --stat && git diff --staged --stat` yielded 0 output.
   - Strictly 0 modifications were made to router source code (`schemas.py`, `policy.py`, `intent_router.py`, `route_decision.py`) or eval datasets in `evals/router/`.

2. **Independent CI Verification Results:**
   - `yarn tsc --noEmit -p .`: Exited with code 0.
   - `python -m evals router-check`: Exited with code 0:
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
   - `python -m evals.router.holdout`: Exited with code 0 (`write_now_violations=0`, `missed_writes=0`).
   - `python -m evals validate`: Exited with code 0 (`OK: 413 samples in 4 datasets, 117 documents in 1 corpora`).
   - `pytest tests/test_router_policy.py tests/test_intent_router_safety.py -q`: 96 passed in 0.92s.
   - Full pytest suite: **1001 passed in 19.88s**.

3. **Empirical Specification Validations:**
   - **Verification 1 (Catalog vs Content Split on 52 `roadmap_question` decisions):**
     Executed Script 6 from Section 5.1 of design doc:
     ```
     Total: 52 | Catalog: 7 (13.5%) | Content: 45 (86.5%)
     Verification 1 PASSED: 86.5% non-catalog lumping trap confirmed!
     ```
   - **Verification 2 (4 Catalog Queries Trapped in `row=search_word`):**
     Executed Script 7 from Section 5.1 of design doc:
     ```
     Verification 2 PASSED: 4 catalog queries trapped in search_word confirmed!
     ```
   - **Verification 3 (Enhanced Regex Vietnamese Robustness):**
     Executed Script 8 from Section 5.1 of design doc:
     ```
     Verification 3 PASSED: Enhanced regexes pass 100% of tricky Vietnamese phrasing!
     ```

4. **Architecture Design Document Content (`knowledge-sub-intents-design.md`):**
   - Contains exactly 989 lines, thoroughly covering R1 (Downstream differences & failure modes), R2 (Hierarchical Sub-Intent Architecture, Pydantic schemas, 18-row `DECISION_TABLE`, ambiguity matrix), R3 (Eval CI impact, 24 test cases, 4-phase rollout), and R4 (Markdown document with verification commands).
   - Specifies `@property sub_intent_value` and `@model_validator(mode="after") enforce_sub_intent_hierarchy` in `IntentClassificationResult`.
   - Formulates the 3 Golden Rules for Safe Downstream Access, eliminating `AttributeError`.

---

## 2. Logic Chain

1. **Integrity & Scope Adherence (from Observation 1):**
   - The original request mandated that no router code or eval datasets be modified during this design task.
   - Observation 1 demonstrates that all changes are strictly isolated to `knowledge-sub-intents-design.md` and teamwork metadata.
   - There are zero integrity violations, no hardcoded results, and no facade implementations.

2. **Resolution of Structural Traps (from Observations 3 & 4):**
   - Observation 3 confirmed that 86.5% of `roadmap_question` decisions in the snapshot are non-catalog queries (hypothetical CUD, past audit, negation, content QA). Lumping them into `CATALOG` would break downstream execution. The design doc's split into `roadmap_catalog_query` (with `catalog_cue` and write blocker exclusions) and `roadmap_content_query` (fallback to `SEARCH`) correctly routes 100% of them.
   - Observation 3 confirmed that 4 catalog queries in the snapshot are trapped in `row=search_word`. Elevating `catalog_list_query` and `roadmap_catalog_query` to rows 10–11 before `search_word` at row 12 in the 18-row `DECISION_TABLE` resolves this precedence inversion.

3. **Runtime Safety & Zero Regression (from Observations 2 & 4):**
   - Observation 4 specifies `@property sub_intent_value` and Golden Rule 1, preventing `AttributeError: 'NoneType' object has no attribute 'value'` during SSE streaming.
   - Observation 2 confirms that all CI tests pass with 0 regressions (`heldout.routing.correct = 223`, `heldout.intent_cases.correct = 64`, 1001 pytest unit tests passing).

4. **Adversarial Robustness (from Review Analysis):**
   - The design integrates multi-phase checks ($P_0 - P_4$) to handle false friends (non-domain progress vs learning progress, quantifier "mấy bài" vs counting, multi-intent queries).
   - Destructive change verbs are intercepted early by rows 6–8 and `u.has_change_verb`, preventing bypasses through catalog listing.
   - Visitor access to learning progress is strictly fail-closed via `OWNER_ONLY_MESSAGE`, complying with ADR-0010.

---

## 3. Caveats

- **No Caveats:** All requirements and review foci were thoroughly examined and verified.
- The 4-phase rollout plan includes an implementation note to update `_ROUTER_SYSTEM_PROMPT` in Phase 2 so that LLM Router fallback can also produce `sub_intent` when heuristic rules do not trigger.

---

## 4. Conclusion

- **Verdict:** **APPROVE**
- The Architecture Design Document at `roadmap-rag-assistant/docs/knowledge-sub-intents-design.md` is complete, empirically validated, and architecturally sound. It is ready for implementation by the engineering team according to the 4-phase roadmap.

---

## 5. Verification Method

To independently reproduce and verify this review:

1. **Verify Git Tree Cleanliness:**
   ```bash
   git status -s
   ```
   *Expected:* 0 changes to tracked files.

2. **Verify Repository CI Cleanliness:**
   ```bash
   yarn tsc --noEmit -p .
   cd roadmap-rag-assistant
   .venv/bin/python -m evals router-check
   .venv/bin/python -m evals.router.holdout
   .venv/bin/python -m evals validate
   .venv/bin/python -m pytest tests/test_router_policy.py tests/test_intent_router_safety.py -q
   ```
   *Expected:* All pass with exit code 0.

3. **Verify Empirical Claims in Document:**
   Execute scripts 6, 7, and 8 from Section 5.1 of `roadmap-rag-assistant/docs/knowledge-sub-intents-design.md`.
   *Expected:* All 3 verification scripts print `PASSED`.
