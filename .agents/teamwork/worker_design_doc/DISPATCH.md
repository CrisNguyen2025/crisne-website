# Dispatch Task: Compile Comprehensive Sub-Intent Architecture Design Document

## Objective
Synthesize all findings from the 3 survey reports (Router Architecture, Downstream Differences, Eval CI Impact) into a production-ready, authoritative Markdown Design Document in the repository at:
`roadmap-rag-assistant/docs/knowledge-sub-intents-design.md`

## Input Reports
- Original Request: `/Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/ORIGINAL_REQUEST.md`
- Scope Document: `/Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/orchestrator/PROJECT.md`
- Survey Report 1 (Router): `/Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/explorer_survey_router/report.md`
- Survey Report 2 (Downstream): `/Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/explorer_survey_downstream/report.md`
- Survey Report 3 (Eval CI): `/Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/explorer_survey_eval/report.md`

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Constraints
- Strictly read-only on router source code (`schemas.py`, `policy.py`, `intent_router.py`) and eval dataset (`evals/router/`).
- Do NOT edit any existing Python router source code or eval JSON/JSONL datasets.
- The ONLY output file to create in the repository is the Design Document at:
  `/Users/tienanhnguyen/Desktop/src_example/crisne-website/roadmap-rag-assistant/docs/knowledge-sub-intents-design.md`
- In your working directory (`/Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/worker_design_doc/`), write `progress.md` and `handoff.md`.

## Required Content in Design Document
1. Executive Summary & Problem Statement
2. Downstream Execution Analysis & Comparative Evaluation (R1):
   - Detailed analysis of Vector RAG, In-memory Catalog, and ADR-0010 User Learning Progress.
   - Comparative matrix: Compute/resources, Latency, Required context, Side effects.
   - Analysis of failure modes when falling through to Vector RAG.
3. Sub-intent Architecture & Design Proposal (R2):
   - Architectural options evaluated (flat split vs retain vs hierarchical).
   - Full Pydantic schemas and typing definitions.
   - Boundaries, decision criteria, and >= 5 typical query examples per sub-intent.
   - Ambiguity & confusion risk analysis with mitigation strategies.
4. Eval CI Impact Analysis & Phased Implementation Roadmap (R3):
   - Impact on `evals/router/` (158 decisions, samples.jsonl, intent_eval_cases, stress, confuse).
   - Plan to address 0-coverage gap for ADR-0010.
   - New test cases specification (>= 20 cases).
   - Phased implementation roadmap (Phases 1-4).
5. Verification Commands & Integrity Statement.


## 2026-11-10T09:52:19Z
[Message] sender=88cff40c-5d96-4718-b370-cc0b520b35d9 priority=MESSAGE_PRIORITY_HIGH
Task: Compile Comprehensive Sub-Intent Architecture Design Document at roadmap-rag-assistant/docs/knowledge-sub-intents-design.md
Strictly read-only on router source code and eval datasets.
Synthesize findings from the 3 survey reports (router, downstream, eval).
Cover R1, R2, R3, R4 in Vietnamese with code snippets/schemas in Python/Pydantic, comparison matrices, ambiguity matrices, eval CI impact details, and concrete 4-phase rollout roadmap.
Document progress in progress.md, write handoff.md, message orchestrator via send_message when done.
