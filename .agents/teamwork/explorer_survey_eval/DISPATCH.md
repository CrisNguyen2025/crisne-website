# Dispatch Task: Eval CI & Dataset Impact Survey

## Objective
Investigate the router evaluation suite in `roadmap-rag-assistant/evals/router/`, assess how `IntentType.KNOWLEDGE_QUERY` test cases are structured, evaluate accuracy baselines, and analyze the impact of sub-intent division on CI.

## Reference Paths
- Original Request: `/Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/ORIGINAL_REQUEST.md`
- Scope document: `/Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/orchestrator/PROJECT.md`
- Files to investigate:
  - `roadmap-rag-assistant/evals/router/` (datasets, runners, eval scripts, metrics)
  - CI test configurations or pytest commands for router eval

## Instructions
1. Read `ORIGINAL_REQUEST.md`.
2. Inspect `evals/router/`:
   - Enumerate test cases, datasets, categories.
   - Which test cases currently evaluate `KNOWLEDGE_QUERY`?
   - How does the evaluation harness work (metrics, accuracy, confusion matrix)?
   - What would break or require migration if `KNOWLEDGE_QUERY` is split or refined with sub-intents?
   - What test cases would need to be added or modified?
   - What regression risks exist?
3. Strict constraint: Do NOT modify any source code or eval datasets. Investigation only.
4. Write your detailed analysis to `report.md` and provide a concise `handoff.md` in your working directory.
5. Notify orchestrator via `send_message`.


## 2026-11-10T09:30:40Z
[Message] sender=88cff40c-5d96-4718-b370-cc0b520b35d9
You are explorer_survey_eval, a teamwork_explorer subagent.
Your working directory is: /Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/explorer_survey_eval/
Original user request path: /Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/ORIGINAL_REQUEST.md
Your task dispatch instructions are located at: /Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/explorer_survey_eval/DISPATCH.md

You MUST read /Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/ORIGINAL_REQUEST.md before starting work.
You MUST NOT modify or create any source code files or eval datasets. Strictly read-only investigation.
Investigate:
- roadmap-rag-assistant/evals/router/ (all files, test cases, evaluation dataset, eval scripts, runner, thresholds)
- How IntentType.KNOWLEDGE_QUERY is currently tested in evals/router/
- Identify which test cases are affected if KNOWLEDGE_QUERY is divided into sub-intents
- What new test cases are needed, what regression risks exist, and how CI can validate changes safely

Write your complete analysis to report.md in your working directory and write handoff.md with key findings.
Communicate back to orchestrator via send_message when done.


## 2026-11-10T09:42:37Z
[Message] sender=88cff40c-5d96-4718-b370-cc0b520b35d9
**Context**: Eval CI & Dataset Impact Survey (Phase 0)
**Content**: Heartbeat check. Router and Downstream survey explorers have delivered their reports. How is your progress on the evals/router survey, report.md, and handoff.md?
**Action**: Please provide a brief status update or deliver your report and handoff when ready.
