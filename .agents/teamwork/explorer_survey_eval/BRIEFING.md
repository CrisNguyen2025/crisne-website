# BRIEFING — 2026-11-10T09:50:00Z

## Mission
Investigate Abot router evals suite (evals/router/), KNOWLEDGE_QUERY test cases, regression risks, and CI impact of sub-intent division.

## 🔒 My Identity
- Archetype: teamwork_explorer
- Roles: explorer, survey_eval
- Working directory: /Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/explorer_survey_eval
- Original parent: 88cff40c-5d96-4718-b370-cc0b520b35d9
- Milestone: Phase 0: Survey

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Strictly read-only on router source code and eval datasets
- Write all findings and reports ONLY to working directory (.agents/teamwork/explorer_survey_eval/)
- Follow 5-component handoff report protocol

## Current Parent
- Conversation ID: 88cff40c-5d96-4718-b370-cc0b520b35d9
- Updated: 2026-11-10T09:42:37Z

## Investigation State
- **Explored paths**: `evals/router/` (all files: `check.py`, `baseline.json`, `decisions.jsonl`, `confuse.py`, `confuse_baseline.json`, `stress_confuse.jsonl`, `stress.jsonl`, `generate_stress.py`, `holdout.py`, `holdout.jsonl`, phase holdouts), `evals/datasets/_routing/samples.jsonl`, `tests/data/intent_eval_cases.json`, `.github/workflows/ci.yml`, `tests/test_router_policy.py`, `tests/test_intent_router_safety.py`, `tests/test_router_regressions.py`, peer reports from `explorer_survey_router` and `explorer_survey_downstream`.
- **Key findings**:
  1. `evals/router/check.py` enforces a dual gate: ratchet metrics + 748 exact decision snapshots in `decisions.jsonl`.
  2. Exactly 158 decisions in `decisions.jsonl`, 52 samples in `_routing/samples.jsonl`, 15 cases in `intent_eval_cases.json`, 83 in `stress.jsonl`, and 46 in `stress_confuse.jsonl` are bound to `knowledge_query`.
  3. A top-level enum split would cause massive CI failure (158 decision snapshot mismatches, ratchet failure, Pytest failure).
  4. A hierarchical sub-intent schema (`intent=KNOWLEDGE_QUERY`, `sub_intent=...`) maintains 100% CI backward compatibility.
  5. There are currently ZERO test cases for ADR-0010 user learning progress in `evals/router/`.
- **Unexplored areas**: None within the survey scope. Survey is complete.

## Key Decisions Made
- Advocated strongly for Hierarchical Sub-Intent Architecture (`KnowledgeSubIntent`) to avoid breaking CI ratchets and snapshots.
- Formulated a 3-phase safe implementation roadmap for eval CI and test coverage expansion.

## Artifact Index
- `DISPATCH.md` — Task dispatch instructions and incoming messages
- `BRIEFING.md` — Persistent situational awareness memory
- `progress.md` — Liveness heartbeat and milestone tracking (Status: COMPLETED)
- `report.md` — Comprehensive analysis report (detailed survey, statistics, impact matrix, roadmap)
- `handoff.md` — Formal 5-component handoff report
