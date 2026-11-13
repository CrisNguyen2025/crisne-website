# BRIEFING — 2026-11-10T10:20:00Z

## Mission
Analyze challenger_2's empirical finding on the 86.5% roadmap_question lumping risk and search_word precedence inversion in DECISION_TABLE, and formulate concrete fix specifications for roadmap-rag-assistant/docs/knowledge-sub-intents-design.md.

## 🔒 My Identity
- Archetype: teamwork_explorer
- Roles: Policy Rule Ordering & Sub-Intent Boundary Specification Specialist
- Working directory: /Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/explorer_retry_policy
- Original parent: 88cff40c-5d96-4718-b370-cc0b520b35d9
- Milestone: Knowledge Sub-Intent Policy & Disambiguation Fix Specification

## 🔒 Key Constraints
- Read-only investigation — do NOT modify router code or eval datasets
- Write reports in own working directory (/Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/explorer_retry_policy/)
- Communicate back to caller via send_message

## Current Parent
- Conversation ID: 88cff40c-5d96-4718-b370-cc0b520b35d9
- Updated: 2026-11-10T10:20:00Z

## Investigation State
- **Explored paths**:
  - `.agents/teamwork/ORIGINAL_REQUEST.md`
  - `.agents/teamwork/explorer_retry_policy/DISPATCH.md`
  - `.agents/teamwork/challenger_2/report.md`
  - `.agents/teamwork/challenger_2/handoff.md`
  - `.agents/teamwork/challenger_2/empirical_harness.py`
  - `roadmap-rag-assistant/docs/knowledge-sub-intents-design.md`
  - `roadmap-rag-assistant/rag_service/domains/roadmap/router/policy.py`
  - `roadmap-rag-assistant/rag_service/domains/roadmap/router/intent_router.py`
  - `roadmap-rag-assistant/rag_service/domains/roadmap/router/understanding.py`
  - `roadmap-rag-assistant/rag_service/domains/roadmap/sections.py`
  - `roadmap-rag-assistant/rag_service/domains/roadmap/agent.py`
  - `roadmap-rag-assistant/evals/router/check.py`
  - `roadmap-rag-assistant/evals/router/decisions.jsonl`
- **Key findings**:
  1. In `evals/router/decisions.jsonl`, exactly 52 decisions match `row=roadmap_question`. Of these, 45 (86.5%) are non-catalog questions (hypothetical CUD questions, audit questions, negated actions, content questions) and only 7 (13.5%) are structural/counting questions.
  2. In `policy.py`, `SEARCH_WORDS` includes `"danh sách"`, `"liệt kê"`, `"list"`, `"show me"`. `Row("search_word")` appears before `Row("roadmap_question")` and `Row("show_request")` and has `target=None`.
  3. In `evals/router/decisions.jsonl`, 4 catalog listing queries (`Show me all lessons under the DevOps mục`, `cho xem danh sach cac topic trong phan frontend`, `danh sách bài trong layer Docker`, `liệt kê tất cả các bài học thuộc topic 1 cho mình xem`) hit `row=search_word`.
  4. Mapping `Row("search_word")` to `sub_intent=SEARCH` creates a precedence inversion that routes catalog queries to Vector RAG.
  5. Splitting `roadmap_question` into `roadmap_catalog_query` vs `roadmap_content_query` requires precise cues, preserving snapshot compatibility where needed.
- **Unexplored areas**: None. All requested specifications formulated and verified.

## Key Decisions Made
- Formulated the exact 18-row `DECISION_TABLE` architecture, placing `progress_query`, `catalog_list_query`, and `roadmap_catalog_query` before `search_word`.
- Specified the split of `roadmap_question` into `roadmap_catalog_query` (`needs="catalog_cue"`, `sub_intent=CATALOG`) vs `roadmap_content_query` (`sub_intent=SEARCH`).
- Formulated exact regexes for counting, position, hierarchy, and listing cues with write blocker suppression.
- Authored `report.md` and `handoff.md` with complete implementation diff guidelines for `worker_design_doc`.

## Artifact Index
- `.agents/teamwork/explorer_retry_policy/DISPATCH.md` — Task dispatch instructions
- `.agents/teamwork/explorer_retry_policy/BRIEFING.md` — Working memory and context
- `.agents/teamwork/explorer_retry_policy/progress.md` — Liveness and task progress tracking
- `.agents/teamwork/explorer_retry_policy/report.md` — Comprehensive technical analysis and fix specifications
- `.agents/teamwork/explorer_retry_policy/handoff.md` — 5-component self-contained handoff report
