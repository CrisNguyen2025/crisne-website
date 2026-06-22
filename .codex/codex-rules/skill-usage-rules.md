# Skill Usage Rules

## Scope

Apply these rules across all Codex projects and repositories.

## Required Skill Before Code Scanning

Before broad or manual code scanning, always use the `$review-context-before-scan` skill.

This applies before:

- Code review or PR review.
- Architecture overview or "how does this work?" analysis.
- Change impact or blast radius analysis.
- Dependency tracing or coupling analysis.
- Refactor planning across multiple files.
- Repo-wide search, broad globbing, semantic search, or opening many files to discover structure.

## Required Workflow

When the task requires broad repository understanding:

1. Invoke `$review-context-before-scan`.
2. Follow that skill's graph-first workflow.
3. Use graph results to identify likely affected areas.
4. Read only the smallest useful set of specific files or symbols next.
5. Avoid broad scanning until graph-backed context has narrowed the scope.

## Allowed Exception

You may skip `$review-context-before-scan` only when the task is a tiny, clearly isolated single-file edit and there is high confidence it cannot affect other modules.

If there is any uncertainty, use `$review-context-before-scan`.

## Tool Availability

If the skill is available but `code-review-graph` tools are not available in the current session, state that briefly and continue with the narrowest reasonable manual inspection.

Do not claim graph context was loaded if the graph tools were unavailable.

## Output Expectation

After applying `$review-context-before-scan`, briefly state:

- Which graph-backed context was requested.
- The likely affected areas.
- The specific files or functions planned for manual reading next.
