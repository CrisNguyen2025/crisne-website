# Task Assignment: Abot Python & ADR-0009 Layer/Group Migration Audit (M3)

## Objectives
Perform a thorough, read-only audit of the Python Abot service (`roadmap-rag-assistant/`) and related repository files regarding ADR-0009 and dead tools:
1. Examine `docs/adr/ADR-0009-*.md` and related docs to understand the migration from Layer & Group to Topic -> Section -> Item.
2. Verify the 14 old tools vs 11 current tools:
   - Identify the 14 original tools and the 11 currently active tools.
   - What were the 3 removed/deprecated tools?
   - Are there lingering implementations, registrations, schemas, unit tests, or references to the old tools?
3. Audit all files in `roadmap-rag-assistant/` (and any frontend files interacting with Abot) for obsolete references to `Layer` and `Group`:
   - Schemas / models (`schemas/`, `models/`, Pydantic definitions)
   - Agent prompts / system messages
   - Routers, tools, evaluations (`evals/`), tests (`tests/`)
   - Documentation or comments
4. Strictly read-only: DO NOT edit or remove any files.

## Output Requirements
- Deliver findings to `.agents/teamwork/teamwork_explorer_abot/handoff.md`.
- Include detailed comparison table of tools (14 vs 11) with status.
- Include table of all remaining Layer/Group references (`file:line`, context, severity).
- Notify orchestrator (7dabfc33-21ba-4c83-9da9-779408f893c0) via `send_message`.


## 2026-11-10T09:29:40Z
[Message] sender=7dabfc33-21ba-4c83-9da9-779408f893c0 priority=MESSAGE_PRIORITY_HIGH
Task: Audit the Python Abot service (`roadmap-rag-assistant/`) and related files regarding ADR-0009 (migration from Layer & Group to Topic -> Section -> Item) and tool evolution:
1. Verify 14 old tools vs 11 current tools:
   - Identify which 14 tools were defined/used originally.
   - Identify the 11 active tools in the current router/agent architecture.
   - Detail the 3 removed/deprecated tools: what were they, why were they removed, are there still lingering tool definitions, schema models, prompts, router branches, mock data, or tests referencing them?
2. Audit all references to `Layer` and `Group` in `roadmap-rag-assistant/` and related frontend/shared code:
   - Find all occurrences of "Layer", "Group", "layer_id", "group_id", "layer", "group" in schemas, prompts, agents, routers, tools, evals, and tests.
   - Distinguish valid uses (if any) from obsolete leftovers that violate ADR-0009.
3. Check if any prompts or schemas still instruct the LLM to think in terms of layers or groups instead of topics, sections, and items.
4. Strictly read-only: DO NOT edit or remove any files.

Deliver findings to /Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/teamwork_explorer_abot/handoff.md.
When completed, notify parent (7dabfc33-21ba-4c83-9da9-779408f893c0) via send_message.
