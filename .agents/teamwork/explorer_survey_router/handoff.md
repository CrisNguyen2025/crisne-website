# Handoff Report: Router Architecture & IntentType.KNOWLEDGE_QUERY Survey

**Agent**: `explorer_survey_router` (teamwork_spec_miner)  
**Milestone**: Phase 0: Router Architecture & Current State Survey  
**Date**: 2026-11-10  
**Recipient**: `orchestrator` (`88cff40c-5d96-4718-b370-cc0b520b35d9`) and downstream teammates  

---

## 1. Observation

Direct observations from inspecting the codebase:

1. **Monolithic Intent Schema**:
   - In `roadmap-rag-assistant/rag_service/domains/roadmap/router/schemas.py:16`:
     ```python
     class IntentType(str, Enum):
         ROADMAP_CUD = "roadmap_cud"         # Create or delete a topic or lesson; rename a section
         KNOWLEDGE_QUERY = "knowledge_query" # Ask about existing lessons, concepts, search docs
         PLAN_GOAL = "plan_goal"             # A learning plan, answered from the existing lessons
         CHITCHAT = "chitchat"               # Greetings, thanks, identity questions
         OUT_OF_SCOPE = "out_of_scope"       # Unrelated to roadmaps (weather, finance, general coding...)
         UNCLEAR = "unclear"                 # LLM router could not tell; the user is asked to rephrase
     ```
   - In `schemas.py:94-111`: `IntentClassificationResult` only contains `intent: IntentType`, `confidence: float`, `needs_cud_extraction: bool = False`, and `needs_confirmation: bool = False`. There are no fields for sub-intent or query parameters.

2. **Heuristic Decision Table**:
   - In `roadmap-rag-assistant/rag_service/domains/roadmap/router/policy.py:412-421`, `DECISION_TABLE` routes 5 distinct rules to `IntentType.KNOWLEDGE_QUERY`:
     - Row `search_word` (line 412): `act=SpeechAct.QUESTION`, `needs="search_word"`, confidence 0.90
     - Row `roadmap_question` (line 415): `act=SpeechAct.QUESTION`, `target=Target.ROADMAP`, confidence 0.90
     - Row `known_title_question` (line 416): `act=SpeechAct.QUESTION`, `needs="known_title"`, confidence 0.90
     - Row `how_to_question` (line 418): `act=SpeechAct.QUESTION`, `target=Target.NONE`, `needs="how_to"`, confidence 0.85
     - Row `show_request` (line 420): `target=Target.ROADMAP`, `needs="show_request"`, confidence 0.85

3. **Routing Phases Sequence**:
   - In `roadmap-rag-assistant/docs/routing-phases.md:7-18`: Defines 10 phases $P_0$ through $P_9$:
     `P0 clean`, `P1 act`, `P2 polarity`, `P3 target`, `P4 scope`, `P5 table / LLM router`, `P6 System 2`, `P7 grounding`, `P8 gate`, `P9 reply`.
   - In `route_decision.py:134-142`: Phase 4 (`scope.py`) produces `KNOWLEDGE_QUERY` with confidence 0.85 and method `"scope"` for `ROADMAP` and `DOMAIN_GAP` questions without explicit keyword targets.
   - In `intent_router.py:233-237`: Declarative statements matching known titles in `_vocabulary` produce `KNOWLEDGE_QUERY` with confidence 0.80 and method `"vocabulary"`.

4. **Downstream Execution Bottleneck**:
   - In `roadmap-rag-assistant/rag_service/domains/roadmap/agent.py:436-449`:
     ```python
     if intent_res.intent == IntentType.KNOWLEDGE_QUERY:
         deps = self._source_deps(content)
         ...
         async for ev in answer_from_sources(
             query=content, session_id=session_id, owner=is_owner(), delay=delay,
             llm=self.llm, deps=deps,
         ):
             yield ev
         return
     ```
   - Every query classified as `KNOWLEDGE_QUERY` executes `answer_from_sources`, which runs the heavy Vector RAG pipeline (dense embeddings, live vector search, topic filter, reranker, LLM generation, latency $1.5s - 4.0s$).

5. **Pre-Router Interception Bypasses**:
   - In `agent.py:284`: `handle_listing` intercepts `LIST_TOPICS` when `is_plain_listing(content)` is True.
   - In `agent.py:306`: `handle_lesson_status` intercepts ADR-0010 queries via regex (`asks_review`, `asks_next_learning`, `asks_what_i_know`).
   - If user phrasing varies slightly (e.g., non-plain filler in listing, or unmapped learning progress queries), the pre-router regex misses and the query falls through to `decide_route()`, gets labeled as `KNOWLEDGE_QUERY`, and triggers Vector RAG.

6. **Eval CI Contract**:
   - In `roadmap-rag-assistant/evals/router/check.py:8-13`: Enforces exact snapshot match against `evals/router/decisions.jsonl`.
   - In `evals/router/decisions.jsonl`: Exactly 158 items are snapshotted with `"route": "knowledge_query"`. Any regression or change in route value breaks `python -m evals router-check`.

---

## 2. Logic Chain

1. **Premise 1 (Schema Uniformity)**: From Observation 1, the router outputs only `IntentType.KNOWLEDGE_QUERY` with no sub-intent metadata.
2. **Premise 2 (Heterogeneous Workloads)**: From Observations 2 and 4, `KNOWLEDGE_QUERY` encompasses three distinct query types: (a) concept/lesson content questions, (b) catalog/structural metadata questions, and (c) user learning progress questions (ADR-0010).
3. **Premise 3 (Downstream Execution Inefficiency)**: From Observation 4, `agent.py` unconditionally invokes `answer_from_sources` (Vector RAG) for all `KNOWLEDGE_QUERY` outcomes.
4. **Inference 1**: Catalog queries (which could be answered in $<5\text{ms}$ from in-memory `Catalog`) and user progress queries (which could be answered in $<80\text{ms}$ from SQLite/Turso) incur an unnecessary $1.5\text{s} - 4.0\text{s}$ latency penalty and LLM token costs when routed to Vector RAG.
5. **Premise 4 (Pre-Router Fragility)**: From Observation 5, attempts to bypass this by intercepting queries before the router in `agent.py` violate the 10-phase architecture ($P_0 - P_9$) and fail when phrasing deviates from strict regexes.
6. **Inference 2 (Design Opportunity)**: Decomposing `KNOWLEDGE_QUERY` into structured sub-intents (e.g. `KNOWLEDGE_CONCEPT`, `CATALOG_STRUCTURE`, `LEARNING_PROGRESS`) within the router allows deterministic, zero-cost routing to the appropriate downstream executor.
7. **Constraint Integration**: From Observation 6, because `evals/router/check.py` asserts against 158 snapshotted `"knowledge_query"` decisions, a hierarchical sub-intent design (`intent=KNOWLEDGE_QUERY`, `sub_intent=...`) maintains 100% CI backward compatibility, whereas a top-level enum split requires an intentional snapshot migration via `--accept`.

---

## 3. Caveats

- **Scope Boundary**: This investigation was strictly read-only per task instructions. No router code or eval datasets were modified.
- **Offline vs Live Centroids**: Phase 4 scope embeddings use pre-tuned thresholds (`scope_thresholds.json`). Offline testing relies on mock centroids or catalog strings. Live behavior in staging/production may have slight threshold sensitivity.
- **Visitor vs Owner Permissions**: ADR-0010 learning progress queries are private to the roadmap owner. A sub-intent router for progress must consider whether visitors are informed of owner-only restrictions or given general replies.

---

## 4. Conclusion

The Abot router has a well-structured, 10-phase deterministic routing engine, but `IntentType.KNOWLEDGE_QUERY` is currently an overloaded monolithic container. It creates architectural coupling where fast, in-memory catalog lookups and database-driven user learning progress queries either rely on brittle pre-router regex interception or inappropriately trigger the heavy, expensive Vector RAG pipeline.

A formal sub-intent specification within `KNOWLEDGE_QUERY` (preserving primary intent for CI compatibility while exposing `sub_intent` for downstream execution) is the cleanest, most robust architectural path forward.

---

## 5. Verification Method

To independently verify the observations and findings:

1. **Verify Router Contract Baseline**:
   ```bash
   cd roadmap-rag-assistant
   python -m evals router-check
   ```
   *Expected result*: Exits with code 0, matches all 158 `knowledge_query` decisions in `decisions.jsonl`.

2. **Verify Phase Definitions**:
   Inspect `roadmap-rag-assistant/docs/routing-phases.md` lines 7–19 and `route_decision.py` lines 72–87 (`RouteOutcome.trace()`).

3. **Verify Decision Table Rules for KNOWLEDGE_QUERY**:
   Inspect `roadmap-rag-assistant/rag_service/domains/roadmap/router/policy.py` lines 412–421 (`search_word`, `roadmap_question`, `known_title_question`, `how_to_question`, `show_request`).

4. **Verify Downstream Execution Flow**:
   Inspect `roadmap-rag-assistant/rag_service/domains/roadmap/agent.py` lines 436–450 to confirm direct invocation of `answer_from_sources(..., deps=self._source_deps(content))`.
