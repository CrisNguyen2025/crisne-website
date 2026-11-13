# Task Assignment: Technical Verification via Repository Tools (M5)

## Objectives
Execute and record the exact outputs of the verification commands to confirm baseline health and validate dead-code/orphan findings:
1. Run repository TypeScript check:
   `yarn tsc --noEmit -p .`
2. Run repository linter:
   `yarn lint`
3. Run schema consistency checks:
   `yarn test:schema-sql --check`
4. Run knowledge index check:
   `yarn check:knowledge-index`
5. Run frontend test suite:
   `yarn test` (or `yarn vitest run`)
6. Run Python backend test suite:
   `cd roadmap-rag-assistant && .venv/bin/python -m pytest -q`
7. Verify broken benchmark test collection:
   `cd roadmap-rag-assistant && .venv/bin/pytest tests/benchmark_eval.py`
8. Verify clean git working tree for tracked files (read-only compliance):
   `git status --short`
9. Deliver full terminal outputs and status verdicts to `.agents/teamwork/worker_verification/handoff.md`.

## Mandatory Constraints
- Read `/Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/ORIGINAL_REQUEST.md` before starting work.
- MANDATORY INTEGRITY WARNING:
  DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
- Strictly read-only on project source code: do not edit or delete any project files.
- Deliver self-contained report to `.agents/teamwork/worker_verification/handoff.md` and message the orchestrator when done.


## 2026-11-10T09:52:03Z
You are worker_verification.
Your working directory is /Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/worker_verification/
Your parent orchestrator conversation ID is 7dabfc33-21ba-4c83-9da9-779408f893c0

Read these files before starting:
- /Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/ORIGINAL_REQUEST.md
- /Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/worker_verification/DISPATCH.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Safety rules:
- Strictly read-only on project source code, tests, docs, and schemas: do not edit or delete any files.
- NEVER run git clean -fd or git reset --hard.

TASKS:
Execute and capture the exact outputs and exit codes of the repository verification tools:
1. Run `yarn tsc --noEmit -p .`
2. Run `yarn lint`
3. Run `yarn test:schema-sql --check`
4. Run `yarn check:knowledge-index`
5. Run `yarn test`
6. Run `cd roadmap-rag-assistant && .venv/bin/python -m pytest -q`
7. Run `cd roadmap-rag-assistant && .venv/bin/pytest tests/benchmark_eval.py` to verify the collection error on EntityLevel.LAYER
8. Run `git status --short` to verify read-only compliance (0 modifications to tracked files).
9. Write your complete handoff report to /Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/worker_verification/handoff.md following the Handoff Protocol.
10. Notify parent (7dabfc33-21ba-4c83-9da9-779408f893c0) via send_message when done.
