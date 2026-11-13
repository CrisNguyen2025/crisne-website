# Dispatch Task: Integrate Fix Specifications into Architecture Design Document

## Objective
Update the Architecture Design Document at `/Users/tienanhnguyen/Desktop/src_example/crisne-website/roadmap-rag-assistant/docs/knowledge-sub-intents-design.md` with the comprehensive fix specifications developed by the 3 retry explorers:
1. `explorer_retry_policy` (Policy precedence reordering and `roadmap_question` split).
2. `explorer_retry_regex_cud` (Progress regex word-order enhancements and `"đánh dấu"` CUD verb additions).
3. `explorer_retry_false_friends` (Multi-phase false-friends gating, quantifier disambiguation, and safe downstream access).

## Input Handoff Reports
- Policy Explorer: `/Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/explorer_retry_policy/report.md`
- Regex/CUD Explorer: `/Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/explorer_retry_regex_cud/report.md`
- False Friends Explorer: `/Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/explorer_retry_false_friends/report.md`
- Current Design Doc: `/Users/tienanhnguyen/Desktop/src_example/crisne-website/roadmap-rag-assistant/docs/knowledge-sub-intents-design.md`
- Original Request: `/Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/ORIGINAL_REQUEST.md`

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Constraints
- Strictly read-only on router source code (`schemas.py`, `policy.py`, `intent_router.py`) and eval dataset (`evals/router/`).
- Do NOT edit any existing Python router source code or eval JSON/JSONL datasets.
- The ONLY output file to update in the repository is:
  `/Users/tienanhnguyen/Desktop/src_example/crisne-website/roadmap-rag-assistant/docs/knowledge-sub-intents-design.md`
- In your working directory (`/Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/worker_update_design_doc/`), write `progress.md` and `handoff.md`.

## Key Updates Required in Design Document
1. **Section 1.4 & Section 3.2**: Add the 86.5% non-catalog lumping trap analysis for `roadmap_question`. Detail the split into `Row("roadmap_catalog_query")` vs `Row("roadmap_content_query")`.
2. **Section 3.3 (DECISION_TABLE Specification)**: Detail the 18-row precedence order where structured sub-intent rules (`progress_query`, `catalog_list_query`, `roadmap_catalog_query`) sit at rows 9–11, strictly BEFORE generic `search_word` at row 12.
3. **Section 3.2 (Schema & Accessors)**: Add `@property sub_intent_value` and `@model_validator` to `IntentClassificationResult`.
4. **Section 3.4 (Lexicon & Regexes)**: Add enhanced regexes for progress (`_NEXT_CUE_ENHANCED`, `_KNOWN_CUE_ENHANCED`, `_REVIEW_CUE_ENHANCED`) supporting flexible word order, and specify adding `"đánh dấu"` to `CUD_VERB_WORDS`, `ACTION_VERBS["update"]`, and `object_sense.py`.
5. **Section 3.5 (Ambiguity Matrix)**: Expand with the false-friend entries (non-roadmap `"tiến độ"` rejected by $P_3/P_4$, `"mấy bài"` quantifier disambiguation, and mixed search+catalog queries).
6. **Section 4.3 (Downstream Guidelines)**: Document the 3 golden safe accessor rules preventing `AttributeError: 'NoneType' object has no attribute 'value'`.
7. **Verification**: Execute `evals router-check`, `evals validate`, and pytest to verify that repository CI remains 100% green and unchanged.


## 2026-11-10T10:21:12Z
You are worker_update_design_doc, a teamwork_worker subagent.
Your working directory is: /Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/worker_update_design_doc/
Original user request path: /Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/ORIGINAL_REQUEST.md
Your task dispatch instructions are located at: /Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/worker_update_design_doc/DISPATCH.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

You MUST read /Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/ORIGINAL_REQUEST.md before starting work.
Update the Architecture Design Document at:
/Users/tienanhnguyen/Desktop/src_example/crisne-website/roadmap-rag-assistant/docs/knowledge-sub-intents-design.md
incorporating all the fix specifications from:
- /Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/explorer_retry_policy/report.md
- /Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/explorer_retry_regex_cud/report.md
- /Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/explorer_retry_false_friends/report.md

Ensure all 7 key update items from DISPATCH.md are meticulously integrated:
1. 86.5% non-catalog lumping trap & roadmap_question split into roadmap_catalog_query vs roadmap_content_query.
2. 18-row DECISION_TABLE precedence with catalog rules before generic search_word.
3. @property sub_intent_value & @model_validator in IntentClassificationResult schema.
4. Enhanced progress regexes (_NEXT_CUE_ENHANCED, _KNOWN_CUE_ENHANCED, _REVIEW_CUE_ENHANCED) & "đánh dấu" in CUD_VERB_WORDS, ACTION_VERBS["update"], and object_sense.py.
5. Expanded Ambiguity Matrix with false-friend entries (non-domain "tiến độ", "mấy bài" quantifier, mixed queries).
6. 3 golden safe downstream accessor rules preventing AttributeError.
7. Verification that repository CI remains 100% clean and passing.

Write progress.md and handoff.md in your working directory.
Communicate back via send_message when done.
