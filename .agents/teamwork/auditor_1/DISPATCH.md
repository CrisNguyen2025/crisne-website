# Dispatch Task: Forensic Integrity Audit (Auditor 1)

## Objective
Perform independent forensic integrity verification of the entire development iteration for the Abot Sub-Intent Design task.

## Scope Constraints & Verification Targets
- Target Deliverable: `/Users/tienanhnguyen/Desktop/src_example/crisne-website/roadmap-rag-assistant/docs/knowledge-sub-intents-design.md`
- Integrity Requirement: Zero modifications to router source code (`schemas.py`, `policy.py`, `intent_router.py`) or eval datasets (`evals/router/`).
- Anti-Cheating & Authenticity Checks:
  1. Static analysis: Check git status and diff across the repository.
  2. Authenticity: Verify that the Design Document contains genuine, original engineering analysis and architecture, not hardcoded/dummy placeholders or generated slop.
  3. Execution validation: Verify that the codebase remains completely intact and passing all CI checks without bypasses.

## Verification Commands to Execute
- `git status --porcelain`
- `git diff --stat`
- `cd roadmap-rag-assistant && python -m evals router-check`
- `cd roadmap-rag-assistant && python -m pytest tests/test_router_policy.py -q`
- `cd roadmap-rag-assistant && python -m evals validate`

## Instructions
1. Run all forensic checks above.
2. Produce a comprehensive evidence report in `audit_report.md`.
3. Provide a structured 5-component `handoff.md`.
4. Output your binary verdict: **CLEAN** or **INTEGRITY VIOLATION / CHEATING DETECTED**.
5. Communicate back to orchestrator via `send_message`.

## 2026-11-10T10:00:44Z
You are auditor_1, a teamwork_auditor subagent.
Your working directory is: /Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/auditor_1/
Original user request path: /Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/ORIGINAL_REQUEST.md
Your task dispatch instructions are located at: /Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/auditor_1/DISPATCH.md

You MUST read /Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/ORIGINAL_REQUEST.md before starting work.
Perform independent forensic integrity verification of the entire development iteration for the Abot Sub-Intent Design task.

Verify:
1. Deliverable file: /Users/tienanhnguyen/Desktop/src_example/crisne-website/roadmap-rag-assistant/docs/knowledge-sub-intents-design.md
2. Strict integrity: Zero modifications to router source code (schemas.py, policy.py, intent_router.py) or eval datasets (evals/router/).
3. Anti-cheating & authenticity checks (no dummy/facade implementations, no hardcoded strings).
4. Run commands: git status, git diff, evals router-check, pytest, evals validate.
5. Provide audit_report.md and handoff.md. Output explicit verdict: CLEAN or INTEGRITY VIOLATION.
Send message back to orchestrator when done.
