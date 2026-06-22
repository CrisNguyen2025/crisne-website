# Multi-Agent Implementation Rules

## Scope

Apply these rules across Codex projects when the user wants a builder/reviewer workflow for implementation tasks.

## Activation

Use the multi-agent implementation workflow only when the user explicitly asks for it.

Trigger phrases include:

- "Use multi-agent workflow"
- "Use BRVF"
- "Spawn agents"
- "Spawn one agent per point"
- "Have a builder and reviewer"
- "Have another agent verify"
- "Use Agent A and Agent B"
- "Run a verifier agent"
- "Have a second agent review"

Do not use multi-agent workflow by default.

If the user does not explicitly ask for multi-agent workflow, work normally with one agent.

## Codex Orchestration Behavior

When multi-agent workflow is explicitly requested and subagents are available, Codex handles orchestration across agents.

This includes:

- Spawning new subagents.
- Assigning each subagent a focused task.
- Routing follow-up instructions.
- Waiting for requested results.
- Closing agent threads when they are no longer needed.
- Consolidating all requested results into one response.

When many agents are running, wait until all requested results are available before returning the consolidated answer, unless the user explicitly asks for partial results or progress updates.

Do not claim that subagents were spawned if they were not available or not used.

## Memory Frame

Use **BRVF** when multi-agent workflow is activated.

`BRVF` means:

- `B`: Brief the task
- `R`: Review the plan
- `V`: Verify output
- `F`: Fix findings

Use **one-agent-per-point** when the user asks for multiple independent review angles or investigation questions. Assign each agent a distinct, non-overlapping focus.

## Agent Roles

### Agent A: Builder

- Understands the task.
- Creates a compact task brief.
- Discusses approach, risks, edge cases, and assumptions with Agent B before coding.
- Implements after the approach is reviewed.
- Fixes valid review findings.

### Agent B: Reviewer

- Reviews Agent A's task brief before implementation.
- Challenges assumptions, edge cases, architecture, security, test coverage, and rule compliance.
- Waits while Agent A implements.
- Reviews changed files after implementation.
- Outputs blocking issues first.
- Does not implement unless explicitly asked.

## Workflow

Use the workflow that matches the user's request:

- For implementation with reviewer verification, use **BRVF**.
- For parallel review or investigation across independent concerns, use **one-agent-per-point**.
- For mixed tasks, keep the main agent responsible for integration and use subagents for bounded sidecar reviews.

### 1. Brief

Agent A creates a compact task brief:

- Goal
- User-visible behavior
- Likely affected areas
- Applicable rules
- Assumptions
- Risks and edge cases
- Verification plan

### 2. Review

Agent B reviews the brief before implementation and responds with:

- Concerns
- Required adjustments
- Clarifying questions, only if needed
- Approved direction: yes or no

### 3. Verify

After Agent A implements, Agent B reviews the output using:

- Requirement summary
- Changed file list
- Diffs or specific changed files
- Relevant rules
- Tests or checks run

Agent B should report:

- Blocking issues
- Non-blocking issues
- Missing tests or verification gaps
- Rule violations
- Final recommendation: accept, fix first, or needs clarification

### 4. Fix

Agent A fixes valid findings and runs appropriate verification.

If fixes are meaningful, Agent B may do one final focused pass.

## Context Discipline

Avoid passing duplicate long context between agents.

Use:

- Compact requirement summaries
- Changed file lists
- Diffs
- Rule references
- Specific questions

Do not pass:

- Repeated full prompts
- Large duplicated documents
- Unnecessary full-file content

## Output Expectation

When BRVF is used, the final response should briefly include:

- What was implemented
- What Agent B reviewed
- Blocking issues found and fixed
- Remaining risks or test gaps

Keep this summary concise.

## Parallel Review Pattern

Use this pattern when the user asks to review multiple independent points in parallel.

Example user prompt:

```text
I would like to review the following points on the current PR (this branch vs main). Spawn one agent per point, wait for all of them, and summarize the result for each point.
1. Security issue
2. Code quality
3. Bugs
4. Race
5. Test flakiness
6. Maintainability of the code
```

Expected behavior:

- Spawn one subagent for each listed point when subagents are available.
- Give each subagent only its assigned review focus plus compact shared context.
- Avoid duplicating large prompts or full documents across agents.
- Continue any non-overlapping local work while subagents run when useful.
- Wait for all requested subagent results.
- Return a consolidated summary grouped by review point.

Final output for this pattern should include:

- Review point name.
- Subagent result summary.
- Blocking findings.
- Non-blocking findings.
- Files or areas inspected.
- Remaining uncertainty or test gaps.
