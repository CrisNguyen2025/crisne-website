# Task Assignment: Git Synchronization (M1)

## Objectives
1. Check the current git status, branch, and remote configuration.
2. Check if the local branch is tracking `main` or if there are updates on remote `main`.
3. Pull the latest changes from `main` if any exist (do NOT overwrite local untracked work unexpectedly, follow safety rules: NEVER run `git clean -fd` or `git reset --hard`).
4. Output git status, latest commit hash (`git rev-parse HEAD`), commit message, and whether branch is up-to-date with `main`.
5. Write your findings and handoff report to `.agents/teamwork/worker_git_sync/handoff.md`.

## Mandatory Rules & Constraints
- Read `/Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/ORIGINAL_REQUEST.md` before starting work.
- DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
- Strictly read-only on project source code: do not edit or delete any project files.
- Deliver self-contained report to `.agents/teamwork/worker_git_sync/handoff.md` and message the orchestrator when done.

## 2026-11-10T09:26:53Z
You are worker_git_sync.
Your working directory is /Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/worker_git_sync/
Your parent orchestrator is 7dabfc33-21ba-4c83-9da9-779408f893c0

Read /Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/ORIGINAL_REQUEST.md and /Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/worker_git_sync/DISPATCH.md before starting work.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Safety rules:
- NEVER run git clean -fd or git reset --hard without checking git log and verifying commits exist.
- NEVER delete untracked files or folders blindly.
- Do NOT edit or delete source code or docs.

Tasks:
1. Run git status, git branch, git remote -v.
2. Check remote updates from `main` (e.g. `git fetch origin` if remote exists, or check status vs origin/main).
3. If there are new commits on `main` and working tree allows, pull changes.
4. Report current branch, HEAD commit hash (`git rev-parse HEAD`), commit message, and sync status with `origin/main`.
5. Write your complete handoff report to /Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/worker_git_sync/handoff.md following the Handoff Protocol.
6. When finished, send a message to parent (7dabfc33-21ba-4c83-9da9-779408f893c0).
