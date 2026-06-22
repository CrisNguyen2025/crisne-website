---
name: review-context-before-scan
description: Use code-review-graph before broad repository scanning for reviews, architecture analysis, change impact, dependency tracing, and multi-file refactor planning.
---

# Review Context Before Scanning

## Goal

Reduce noisy repository scanning by using graph-backed context from `code-review-graph` before broad manual inspection.

## Mandatory Workflow

Before broad or manual repository scanning, use graph-backed context. Broad scanning includes repository-wide `rg`, wide file listings, broad semantic search, or opening many files only to discover how the repository works.

1. Identify the repository root.
   - Pass `repo_root` explicitly to graph tools when the current MCP server directory is not the repository being analysed.
2. Build or refresh the graph when needed.
   - Call `build_or_update_graph_tool`.
   - Use `full_rebuild=true` when no graph exists or after a major repository change.
3. Get minimal context.
   - Call `get_minimal_context_tool` with a short `task` string.
4. Pick the graph tool that matches the task.
   - Code review or changed code: `detect_changes_tool` and/or `get_review_context_tool`.
   - Architecture overview: `get_architecture_overview_tool` and/or `list_communities_tool`.
   - Change impact or blast radius: `get_impact_radius_tool` or `detect_changes_tool`.
   - Dependency tracing or flows: `get_flow_tool`, `get_affected_flows_tool`, or `query_graph_tool`.
5. Use the returned context to narrow scope.
   - Identify the smallest useful set of files, functions, symbols, or modules to inspect.
6. Only then scan or read files.
   - Prefer the specific files and symbols suggested by the graph.

## Triggers

Apply this workflow for:

- Code review or PR review.
- Architecture overview or "how does this work?" analysis.
- Change impact analysis or blast-radius review.
- Dependency tracing or coupling analysis.
- Refactor planning spanning multiple files.
- Broad repository exploration.

## Allowed Exception

Skip graph calls only for a tiny, clearly isolated single-file change that cannot affect other modules. If uncertain, use graph context.

## Tool Availability

If `code-review-graph` tools are unavailable, say so briefly and proceed with the narrowest reasonable manual inspection. Do not claim graph context was loaded.

## Output Expectations

After graph calls, state the likely affected directories, files, modules, or flows and name the specific files or functions to inspect next.
