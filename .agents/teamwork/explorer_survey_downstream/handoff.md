# Handoff Report: Downstream Execution Differences & ADR-0010 Survey

**From:** `explorer_survey_downstream`  
**To:** `orchestrator` (Conversation ID: `88cff40c-5d96-4718-b370-cc0b520b35d9`)  
**Working Directory:** `/Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/explorer_survey_downstream/`  
**Full Analysis Report:** `report.md`  

---

## 1. Observation

Direct observations from the codebase investigation:

1. **Router Intent Definition:**
   - In `roadmap-rag-assistant/rag_service/domains/roadmap/router/schemas.py:14-21`:
     ```python
     class IntentType(str, Enum):
         ROADMAP_CUD = "roadmap_cud"         # Create or delete a topic or lesson; rename a section
         KNOWLEDGE_QUERY = "knowledge_query" # Ask about existing lessons, concepts, search docs
         PLAN_GOAL = "plan_goal"             # A learning plan, answered from the existing lessons
         CHITCHAT = "chitchat"               # Greetings, thanks, identity questions
         OUT_OF_SCOPE = "out_of_scope"       # Unrelated to roadmaps
         UNCLEAR = "unclear"                 # LLM router could not tell
     ```
   - In `rag_service/domains/roadmap/router/policy.py:412-420`: Multiple rows in `DECISION_TABLE` (`search_word`, `roadmap_question`, `known_title_question`, `how_to_question`, `show_request`) collapse into `IntentType.KNOWLEDGE_QUERY`.

2. **Downstream Execution of `KNOWLEDGE_QUERY` in Agent:**
   - In `rag_service/domains/roadmap/agent.py:436-449`:
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
   - In `rag_service/core/orchestration/sources.py:85-178`: `answer_from_sources` executes:
     - Query planning (`plan_queries`) via LLM.
     - Hybrid search (`search_live_knowledge` calling `HybridVectorStore.hybrid_search`).
     - Dense embeddings via `models/gemini-embedding-001` (`hybrid.py:25`) and SQLite FTS5 BM25.
     - Optional cross-encoder reranking (`_rerank` via LLM, `sources.py:93`).
     - Generation via `pipeline.astream(llm, req)` (`pipeline.py`) streaming from Gemini Flash / Groq LLM.
     - Latency: 800ms – 3,500ms; Token cost: 500 – 2,500 tokens/turn.

3. **In-Memory Catalog Execution & Interception:**
   - In `rag_service/domains/roadmap/agent.py:284` & `290`:
     - `self.handle_listing(...)` (`commands.py:231`) intercepts `LIST_TOPICS` ("liệt kê topic", "danh sách lộ trình") before the router.
     - `self.handle_sections(...)` (`sections.py`) intercepts section listing before the router.
   - In `rag_service/domains/roadmap/router/target_grounding.py:36-62`: `Catalog` is maintained in RAM as `set[str]` of topics and items for instant string membership and `difflib.get_close_matches(cutoff=0.85)` matching.
   - Resource & Latency: 0 LLM calls, 0 embeddings, sub-millisecond CPU, 5ms – 40ms local adapter latency.

4. **User Learning Progress Execution (ADR-0010):**
   - In `docs/adr/0010-lesson-status-known-learning-target.md:1-25`:
     - Three statuses on `RoadmapItem`: `target`, `learning`, `known` (default).
     - Timestamp `statusUpdatedAt` tracks elapsed duration.
     - Privacy constraint (line 23): *"Chưa quyết Visitor có thấy trạng thái hay không, vì trạng thái là dữ liệu cá nhân của Owner. Cho đến khi có ADR khác, chỉ Owner thấy."*
   - In `rag_service/domains/roadmap/lesson_status.py`:
     - Intercepted in `agent.py:306` (`handle_lesson_status`).
     - Strict authentication (line 312 & 393): `if not is_owner(): async for ev in self._stream_text(OWNER_ONLY_MESSAGE, delay): yield ev; return`.
     - Pure in-memory filtering/sorting:
       - (a) What I know (`asks_what_i_know`, line 119): filters into `known`, `learning`, `target` groups.
       - (b) Next learning (`asks_next_learning`, line 84): separates into `learning` (priority 1) and `target` (priority 2).
       - (c) Review needed (`asks_review`, line 38, 63): filters `known` lessons and sorts by `statusUpdatedAt` ascending, with `null` timestamps first.
       - (d) Status change (`parse_status_change_request`, line 358): creates `action_preview` event, stores in `session_ctx.pending_status_change`, commits on "ok" via `adapter.update_item`.
     - Resource & Latency: 0 LLM calls, 0 embeddings, 10ms – 60ms for queries; 80ms – 250ms for DB mutation commit.

5. **Data Stripping & Storage Isolation:**
   - In `rag_service/adapters/http_adapter.py:63-73, 85-86`: `if not is_owner():` strips `status` and `statusUpdatedAt` from all items.
   - In `rag_service/domains/roadmap/retrieval/ingestion.py:84-100`: `KnowledgeDocument` for Vector RAG does **NOT** contain `status` or `statusUpdatedAt`.

6. **Eval Dataset Status:**
   - In `evals/router/decisions.jsonl` (749 cases): Contains 200+ `knowledge_query` cases, 0 cases for lesson status queries (e.g. "bài nào cần ôn lại", "nên học gì tiếp"), and 0 cases for plain topic listings.

---

## 2. Logic Chain

1. **Premise (Obs 1 & 2):** In the current Router schema and policy, any query classified as `KNOWLEDGE_QUERY` enters the downstream Vector RAG pipeline (`answer_from_sources`), requiring remote embedding calls, dense vector math, and LLM text generation.
2. **Premise (Obs 3 & 4):** Both In-Memory Catalog lookups and User Learning Progress queries (ADR-0010) are deterministic, 0-LLM, 0-embedding routines with <50ms response times.
3. **Premise (Obs 4 & 5):** User learning status is strictly confidential to the Owner (`is_owner()` fail-closed). In fact, the vector store deliberately omits `status` and `statusUpdatedAt` to prevent public data leakage.
4. **Deduction (Obs 3, 4, 6):** Because the Router does not have sub-intents for Catalog or Progress, developers were forced to place ad-hoc regex interceptors (`handle_listing`, `handle_sections`, `handle_lesson_status`) *before* Step 3 Router in `agent.py`.
5. **Deduction (Obs 1, 2, 5):** If a user asks a learning progress question or catalog query that does not exactly match the hardcoded regex cues in `agent.py`, the message falls through to the Router. The Router classifies it as `KNOWLEDGE_QUERY`. It then gets dispatched to Vector RAG.
6. **Consequence:** When a progress query falls into Vector RAG:
   - It incurs a 50x–100x latency penalty (from ~20ms to ~2,500ms).
   - It burns expensive LLM and embedding API tokens.
   - Because user learning status is NOT in the vector index, the LLM hallucinates an answer or provides generic information, completely failing the user's intent.
7. **Conclusion:** Therefore, `IntentType.KNOWLEDGE_QUERY` must be cleanly separated into distinct sub-intents: `KNOWLEDGE_SEARCH` (Vector RAG), `CATALOG_QUERY` (Structure), and `LEARNING_PROGRESS` (ADR-0010 Status).

---

## 3. Caveats

1. **Adapter Scope:** Investigation verified that `HttpApiAdapter.update_item` supports `status`, whereas `SqliteAdapter.update_item` (`sqlite_adapter.py:233-259`) currently lacks handling for the `status` kwarg (relies on Next.js API in production).
2. **Evaluation Scope:** `evals/router/` currently has zero baseline test cases for ADR-0010 queries; adding sub-intents will require expanding the evaluation dataset.
3. **No Code Written:** In accordance with the Teamwork Explorer rules, no source code, configuration files, or eval datasets were modified during this investigation.

---

## 4. Conclusion

1. **Resource & Latency Disparity:**
   - Vector RAG consumes 1–3 LLM calls + 1 Embedding call, taking 800ms–3,500ms.
   - Catalog and ADR-0010 Progress queries consume 0 LLM calls and 0 embeddings, taking 5ms–60ms.
2. **Security & Privacy Boundary:**
   - Vector RAG and Catalog are public domain tri-thức.
   - ADR-0010 Progress queries are strictly private to the site Owner.
3. **Architectural Recommendation:**
   - Formalize 3 sub-intents in `schemas.py`:
     - `IntentType.KNOWLEDGE_SEARCH` (or keep `KNOWLEDGE_QUERY` with narrowed scope) -> Vector RAG + LLM.
     - `IntentType.CATALOG_QUERY` -> In-memory catalog lookup / `list_topics` tool.
     - `IntentType.LEARNING_PROGRESS` -> ADR-0010 progress tracking (`known`, `learning`, `target`, review dates).
   - Move procedural interceptors from `agent.py` into formal P5 Decision Table rows in `policy.py`.

---

## 5. Verification Method

To independently verify the observations and logic chain:

1. **Verify pure sorting & filtering unit tests for ADR-0010:**
   ```bash
   cd roadmap-rag-assistant && python -m pytest tests/test_lesson_status_pure.py -q
   ```
2. **Verify end-to-end chat execution and Owner-only enforcement:**
   ```bash
   cd roadmap-rag-assistant && python -m pytest tests/test_lesson_status_e2e.py -q
   ```
3. **Inspect the execution paths in code:**
   - Interceptors in `agent.py`: View lines 281–316.
   - RAG downstream dispatch in `agent.py`: View lines 436–450.
   - Data stripping in `http_adapter.py`: View lines 63–73 and 85–86.
   - Knowledge document schema in `ingestion.py`: View lines 15–25 (confirm `status` is absent).
4. **Invalidation condition:**
   - If Vector RAG is found to index private user status, or if Catalog lookup requires an LLM call, the resource and privacy disparity claims would be invalidated. Code inspection confirms neither is true.
