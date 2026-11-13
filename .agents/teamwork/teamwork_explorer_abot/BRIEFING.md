# BRIEFING — 2026-11-10T09:40:00Z

## Mission
Audit Python Abot service (`roadmap-rag-assistant/`) and related files regarding ADR-0009 (migration from Layer & Group to Topic -> Section -> Item) and tool evolution (14 old tools vs 11 current tools).

## 🔒 My Identity
- Archetype: explorer
- Roles: abot-auditor, layer-group-migration-auditor
- Working directory: /Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/teamwork_explorer_abot/
- Original parent: 7dabfc33-21ba-4c83-9da9-779408f893c0
- Milestone: M3 (Layer/Group migration audit & 14 vs 11 tool evolution verification)

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Strictly read-only: DO NOT edit or remove any files in the codebase
- All outputs go to /Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/teamwork_explorer_abot/

## Current Parent
- Conversation ID: 7dabfc33-21ba-4c83-9da9-779408f893c0
- Updated: not yet

## Investigation State
- **Explored paths**:
  - `roadmap-rag-assistant/rag_service/tools/__init__.py`, `item_tools.py`, `topic_tools.py`, `topic_resolver.py`
  - Git history of tools (`rag_tools.py`, `layer_tools.py`, `group_tools.py`, `layer_resolver.py`)
  - `rag_service/domains/roadmap/router/` (`verifier.py`, `intent_router.py`, `entity_extractor.py`, `schemas.py`, `policy.py`, `understanding.py`, `object_sense.py`, `grounding.py`, `write_policy.py`, `target_grounding.py`)
  - `rag_service/domains/roadmap/profile.py`, `prompts.py`, `agent.py`, `execution/executor.py`, `execution/changes.py`
  - `rag_service/api/schemas.py`, `api/server.py`, `state/session_store.py`, `nlp_cleaner.py`
  - `tests/` (`benchmark_eval.py`, `test_fallback_agent.py`, `test_guardrails.py`, `test_auth.py`, `test_sse.py`, `test_change_review.py`, `test_intent_eval.py`, `data/group_cases.json`, `data/intent_eval_cases.json`, `data/intent_eval_blind_cases.json`)
  - `evals/` (`router/generate_stress.py`, `target.py`, `corpus/public/roadmap/documents.jsonl`, `router/noise_target_holdout.jsonl`)
  - Frontend integration: `components/roadmap/RoadmapAssistantChatbot.tsx`, `logic/roadmap/roadmapAssistantService.ts`, `sdk/typescript/src/types.ts`, `prisma/schema.prisma`
- **Key findings**:
  1. Tool Evolution:
     - The "14 old tools" refers to the CUD tools table in `README.md` (4 Topic, 3 Layer, 3 Group, 4 Item = 14 tools).
     - ADR-0009 eliminated all 6 Layer and Group tools (`create_layer`, `update_layer`, `delete_layer`, `create_group`, `update_group`, `delete_group`).
     - Simultaneously, 3 Mini-RAG / template tools (`search_roadmap_templates`, `generate_roadmap_from_template`, `preview_roadmap_plan`) were deprecated and removed from `rag_tools.py` in commits 4b22216 / 1712380 when `/plan` and `/goal` blueprint generation was replaced by answering from existing lessons.
     - New active tools added/promoted: `rename_section`, `update_item_content`, `import_items_from_text`.
     - Active tools now: exactly 11 tools in `ALL_TOOLS` (4 Topic + 7 Lesson/Section).
  2. Lingering references to removed tools:
     - `test_auth.py:118` tests `"generate_roadmap_from_template" not in body`
     - `test_sse.py:41` tests `"preview_roadmap_plan" not in body`
     - `RoadmapAssistantChatbot.tsx:90` event dispatcher checks `toolName.startsWith("generate_")`
     - `intent_router.py:92` prompt says `PLAN_GOAL: muốn lập kế hoạch hoặc sinh lộ trình trọn gói`
  3. Obsolete Layer/Group Prompt Violations:
     - System 2 Verifier (`verifier.py`): Lines 47, 52-53, 81, 99-101, 114-115 explicitly prompt the LLM to think in `(topic → layer → group → bài học)` and extract `container=03-RAG` (layer/topic).
     - LLM Router (`intent_router.py`): Lines 90, 94 tell LLM that `ROADMAP_CUD` is for `topic/layer/group/item` and `OUT_OF_SCOPE` is unrelated to `roadmap/topic/layer/bài học`.
     - Domain Profile (`profile.py`): Line 66 tells RAG model to `Gọi tên lộ trình, layer và bài học`, lines 73 & 81 tell chitchat model to answer about `topic, layer, nhóm và bài học` and suggest `tạo Topic/Layer/Item`.
     - `prompts.py`: Line 64 mentions `tên topic/layer/item`.
  4. Broken Tests & Fixtures:
     - `tests/benchmark_eval.py` fails collection (`EntityLevel.LAYER` doesn't exist).
     - `tests/data/group_cases.json` is a dead fixture from ADR-0008.
     - `tests/data/intent_eval_blind_cases.json` and `intent_eval_cases.json` have 13 test cases asserting CUD/query on layers and groups.
     - `evals/router/generate_stress.py` still generates layer CUD synthetic messages.
  5. Valid Uses:
     - `legacy_level_reply` in `grounding.py` / `agent.py` acts as a guardrail / deprecation interceptor to inform users that layers/groups are gone and suggest topic/section syntax.
     - Technical domain concepts: "Agent Layer", "deep learning layer", "dropout layer", "layer normalization", "dataLayer" (GTM).
     - UI icons: `<Layers />` from `lucide-react`.
- **Unexplored areas**: None. Complete audit of Python backend, evals, tests, and frontend integration completed.

## Key Decisions Made
- Differentiate clearly between the 3 template tools removed in commit 4b22216 and the 6 Layer/Group tools removed in ADR-0009 commit d3fc436.
- Catalog all Layer/Group references into 4 distinct categories: Active LLM Prompt Violations, Broken/Obsolete Tests & Fixtures, Documentation/Comments, and Valid Preserved Usages (Guardrails & Technical concepts).

## Artifact Index
- DISPATCH.md — Task assignment and incoming messages
- BRIEFING.md — Persistent working memory
- progress.md — Liveness heartbeat and status
- handoff.md — [Next] Final comprehensive 5-component handoff report
