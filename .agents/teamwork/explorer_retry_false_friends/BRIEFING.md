# BRIEFING — 2026-11-10T10:17:00Z

## Mission
Analyze challenger findings on false-friend collisions & safe sub_intent access, and formulate concrete fix specifications for knowledge-sub-intents-design.md.

## 🔒 My Identity
- Archetype: explorer
- Roles: explorer, investigator, synthesizer
- Working directory: /Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/explorer_retry_false_friends
- Original parent: 88cff40c-5d96-4718-b370-cc0b520b35d9
- Milestone: Retry False Friends & Safe Sub-intent Access Analysis

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Write report.md and handoff.md in working directory
- Communicate back via send_message when done

## Current Parent
- Conversation ID: 88cff40c-5d96-4718-b370-cc0b520b35d9
- Updated: not yet

## Investigation State
- **Explored paths**:
  - `ORIGINAL_REQUEST.md`
  - `.agents/teamwork/challenger_2/report.md`
  - `.agents/teamwork/challenger_1/report.md`
  - `roadmap-rag-assistant/docs/knowledge-sub-intents-design.md`
  - Codebase: `understanding.py`, `scope.py`, `route_decision.py`, `policy.py`, `lesson_status.py`, `agent.py`
- **Key findings**:
  - Standalone `"tiến độ"` in `_KNOWN_CUE` (`lesson_status.py:160`) triggers false progress queries on external economic/social topics unless gated by P3 Target and P4 Scope.
  - Dual semantic role of `"mấy bài"` in Vietnamese (indefinite quantifier vs counting interrogative): When paired with search verbs (`"tìm"`, `"kiếm"`), it must be routed to `SEARCH` with `is_counting_query=False`.
  - Bẫy thuộc tính `NoneType` (`AttributeError: 'NoneType' object has no attribute 'value'`) in `agent.py:365` and `agent.py:377` threatens to crash SSE streaming generator for 100% of non-KNOWLEDGE_QUERY messages if `.sub_intent.value` is accessed unsafely.
  - Formulated full fix specifications for Schema (Section 3.2), Ambiguity Matrix (Section 3.5), and Downstream Safe Access Guidelines (Section 4.3 Phase 3).
- **Unexplored areas**: None. Investigation complete.

## Key Decisions Made
- Confirmed necessity of defense-in-depth: Schema level (`@property sub_intent_value` + `@model_validator`) and Dispatcher level (hierarchical checking).
- Established multi-phase gating criteria: Sub-intent evaluation requires $P_3 \neq \text{OFF\_TOPIC}$ and $P_4 \in \{\text{ROADMAP}, \text{DOMAIN\_GAP}\}$. If $P_4 = \text{EXTERNAL}$, route directly to `OUT_OF_SCOPE`.

## Artifact Index
- DISPATCH.md — Task dispatch instructions
- BRIEFING.md — Persistent working memory
- progress.md — Heartbeat progress tracker
- report.md — Comprehensive analysis and exact fix specifications
- handoff.md — 5-component handoff report
