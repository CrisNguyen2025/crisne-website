# Dispatch Task: Router Architecture & Current State Survey

## Objective
Survey and extract the authoritative state of Abot's router architecture, focusing on `IntentType.KNOWLEDGE_QUERY`, schemas, routing policy, routing phases, and decision boundaries.

## Reference Paths
- Original Request: `/Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/ORIGINAL_REQUEST.md`
- Scope document: `/Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/orchestrator/PROJECT.md`
- Files to investigate:
  - `roadmap-rag-assistant/docs/routing-phases.md`
  - `roadmap-rag-assistant/rag_service/domains/roadmap/router/schemas.py`
  - `roadmap-rag-assistant/rag_service/domains/roadmap/router/policy.py`
  - `roadmap-rag-assistant/rag_service/domains/roadmap/router/intent_router.py`

## Instructions
1. Read `ORIGINAL_REQUEST.md`.
2. Inspect the router files above. Identify:
   - How `IntentType.KNOWLEDGE_QUERY` is currently defined and routed.
   - What metadata or parameters are extracted.
   - What routing phases exist according to `routing-phases.md`.
   - What constraints, heuristics, and prompt strategies are in `policy.py` and `intent_router.py`.
3. Strict constraint: Do NOT modify any source code or eval datasets. Investigation only.
4. Write your detailed analysis to `report.md` and provide a concise `handoff.md` in your working directory.
5. Notify orchestrator via `send_message`.


## 2026-11-10T09:30:23Z
Sender: 88cff40c-5d96-4718-b370-cc0b520b35d9
Priority: MESSAGE_PRIORITY_HIGH
Content:
You are explorer_survey_router, a teamwork_spec_miner subagent.
Your working directory is: /Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/explorer_survey_router/
Original user request path: /Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/ORIGINAL_REQUEST.md
Your task dispatch instructions are located at: /Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/explorer_survey_router/DISPATCH.md

You MUST read /Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/ORIGINAL_REQUEST.md before starting work.
You MUST NOT modify or create any source code files or eval datasets. Strictly read-only investigation.
Investigate:
- roadmap-rag-assistant/docs/routing-phases.md
- roadmap-rag-assistant/rag_service/domains/roadmap/router/schemas.py
- roadmap-rag-assistant/rag_service/domains/roadmap/router/policy.py
- roadmap-rag-assistant/rag_service/domains/roadmap/router/intent_router.py

Extract all details on how IntentType.KNOWLEDGE_QUERY is currently implemented, how routing phases are defined, what policies/heuristics apply, and where the boundaries are.
Write your complete analysis to report.md in your working directory and write handoff.md with key findings.
Communicate back to orchestrator via send_message when done.
