# Abot Router Architecture & IntentType.KNOWLEDGE_QUERY Survey Report

**Author**: `explorer_survey_router` (Specification Miner)  
**Date**: 2026-11-10  
**Repository**: `crisne-website` / `roadmap-rag-assistant`  
**Working Directory**: `.agents/teamwork/explorer_survey_router/`  
**Reference Files**:
- `roadmap-rag-assistant/docs/routing-phases.md`
- `roadmap-rag-assistant/rag_service/domains/roadmap/router/schemas.py`
- `roadmap-rag-assistant/rag_service/domains/roadmap/router/policy.py`
- `roadmap-rag-assistant/rag_service/domains/roadmap/router/intent_router.py`
- `roadmap-rag-assistant/rag_service/domains/roadmap/router/route_decision.py`
- `roadmap-rag-assistant/rag_service/domains/roadmap/router/scope.py`
- `roadmap-rag-assistant/rag_service/domains/roadmap/router/understanding.py`
- `roadmap-rag-assistant/rag_service/domains/roadmap/agent.py`
- `roadmap-rag-assistant/rag_service/domains/roadmap/lesson_status.py`
- `docs/adr/0010-lesson-status-known-learning-target.md`
- `roadmap-rag-assistant/evals/router/` (`check.py`, `baseline.json`, `decisions.jsonl`, `confuse.py`, `holdout.py`)

---

## 1. Executive Summary

The Abot intent routing architecture is a **two-system, multi-phase deterministic pipeline with an LLM fallback**. Every user message passes through a strict 10-phase sequence ($P_0$ through $P_9$).

`IntentType.KNOWLEDGE_QUERY` represents a critical architectural bottleneck:
1. **Monolithic Intent Classification**: In `schemas.py`, `IntentType.KNOWLEDGE_QUERY` is defined as `"knowledge_query"` ("Ask about existing lessons, concepts, search docs"). `IntentClassificationResult` only outputs a flat `(intent, confidence, needs_cud_extraction, needs_confirmation)`. It contains **no sub-intent**, **no metadata**, and **no structural parameter extraction** for knowledge queries.
2. **Coalesced Heterogeneous Workloads**: Under the current router definition, three fundamentally distinct workloads coalesce into `KNOWLEDGE_QUERY`:
   - **Semantic / Concept Retrieval (Vector RAG)**: Search lesson content and concepts using dense embeddings, BM25/vector retrieval, Cohere/cross-encoder reranking, and full LLM response generation ($1.5s - 4.0s$ latency, high compute).
   - **In-Memory Catalog Queries**: Structural roadmap questions (e.g., `"topic AI có mấy bài"`, `"Show me all lessons under the DevOps mục"`, `"cho mình xem lại toàn bộ cấu trúc các layer"`). While plain listing is intercepted pre-router by regex (`is_plain_listing`), non-plain queries route to `KNOWLEDGE_QUERY` and invoke the entire Vector RAG engine rather than reading the existing zero-latency in-memory `Catalog`.
   - **User Learning Progress Queries (ADR-0010)**: Progress questions regarding `known`, `learning`, and `target` statuses (e.g., `"tôi đang biết gì về AI"`, `"nên học gì tiếp"`, `"bài nào cần ôn lại"`). While certain fixed phrasing is currently intercepted pre-router via regex in `lesson_status.py`, conversational variations fall through to the router, get tagged as `KNOWLEDGE_QUERY`, and hit Vector RAG, which cannot answer user-state database questions.
3. **Rigid CI Evaluation Ratchet**: `evals/router/check.py` maintains an exact snapshot of router decisions in `decisions.jsonl` (158 test items currently map to `route: "knowledge_query"`). Any change in output schema or routing logic must preserve backward compatibility or be phased through explicit snapshot acceptance.

---

## 2. The 10 Routing Phases ($P_0$ to $P_9$)

According to `roadmap-rag-assistant/docs/routing-phases.md` and implemented across `rag_service/domains/roadmap/router/`, every message proceeds through the following sequential phases:

| Phase | Phase Name | Core Question | Output Domain | Invariant Rule | Primary Implementation Files |
|---|---|---|---|---|---|
| **$P_0$** | **clean** | Which text do we read? | Cleaned text clause, `focus` | Drop fillers, greetings, and labels; never drop a word carrying semantic meaning. | `focus.py`, `understanding.py` (`strip_noise`), `instruction_part` |
| **$P_1$** | **act** | What is the user doing? | `SpeechAct`: plan, recall, greeting, request, question, command, statement | A change verb without a roadmap object is not a command. Questions need no trailing `?`. | `understanding.py`, `policy.py` |
| **$P_2$** | **polarity** | Do they want the change to happen? | `Polarity`: affirm, decline, hypothetical, report, none | Only `affirm` may write; anything unclear or blocked is not `affirm`. | `polarity.py`, `policy.py` (`WRITE_BLOCKERS`) |
| **$P_3$** | **target** | What is it about (keywords)? | `Target`: off_topic, assistant, roadmap, none | A roadmap noun counts only when not in code and no place phrase puts it in another system. | `object_sense.py`, `understanding.py` |
| **$P_4$** | **scope** | Is a question or statement in the field? | `Scope`: ROADMAP, DOMAIN_GAP, EXTERNAL, NONE | Never call EXTERNAL without evidence (embeddings or catalog match). | `scope.py`, `route_decision.py` |
| **$P_5$** | **table / LLM router** | What does act $\times$ target do? | `(intent, write)` permission | First matching row of `DECISION_TABLE` decides; LLM router reads only undecided rows. | `policy.py`, `intent_router.py` |
| **$P_6$** | **System 2** | Does a 2nd reading agree it is a change? | `(act, target_system, action)` | If System 2 disagrees on polarity or action, write is denied/rerouted. | `verifier.py`, `write_policy.py` |
| **$P_7$** | **grounding** | Does the object exist in roadmap? | `Grounding`: grounded, ungrounded, unverifiable | Update and delete actions must name an object that exists in catalog. | `target_grounding.py` |
| **$P_8$** | **gate** | Run now, preview, or block? | `(mode, reason)`: run, preview, reroute, blocked | Action verb must be in affirmed part; delete is always previewed. | `write_gate.py`, `write_policy.py` |
| **$P_9$** | **reply** | What is said back? | Generated stream / deterministic reply | Each block or denial reason has an exact deterministic template. | `grounding.py`, `commands.py`, `agent.py` |

### Detailed Mechanics of Key Phases

#### Phase 0: Clean (`focus.py`, `understanding.strip_noise`)
- Strips leading greetings (`GREETING_PREFIX`, `LEADING_FILLER`: `"Hi"`, `"ê bạn ơi"`, `"pls"`).
- Strips instructional labels (`LABEL`: `"Việc cần làm:"`, `"Câu hỏi:"`).
- Strips trailing particles, gratitude, and emoji (`TRAILING_FILLER`: `"nhé"`, `"nha"`, `"ạ"`, `"thanks"`, emoji ranges).
- Extracts `focus` using `focus_of(text)` (stripping question framing like `"cho mình hỏi về ..."`, `"bạn có biết thông tin về ..."`).

#### Phase 1: Act (`understanding.py`)
- Analyzed on normalized lower-case and folded text.
- Resolves to `SpeechAct` enum (`PLAN`, `RECALL`, `GREETING`, `REQUEST`, `QUESTION`, `COMMAND`, `STATEMENT`).
- Detects questions without question marks:
  - Mid-sentence question words: `"gì"`, `"nào"` (`MID_QUESTION_WORD`) unless preceded by negation (`NOT_A_QUESTION_BEFORE`).
  - Framing cues: `ASK_FRAME` (`"cho mình hỏi"`, `"muốn hỏi"`, `"so sánh"`, `"A hay B hơn"`).
  - Terminal markers: `QUESTION_MARKERS` (`"ở đâu"`, `"bao nhiêu"`, `"khi nào"`, `"gì thế"`).
  - `ADVICE` questions (`"lộ trình nào phù hợp"`, `"nên học FE hay BE"`) flag `u.advice = True`.

#### Phase 2: Polarity (`polarity.py`)
- Evaluated clause-by-clause (split at punctuation, `"thì"`, `"nhưng"`, `"mà"`).
- Classifies into `affirm`, `decline`, `hypothetical`, `report`, `none`.
- Vietnamese negators (`không`, `chẳng`, `chả`, `đừng`, `chưa`, `khỏi`, `chớ`, `cấm`, `khoan`, `đâu`) and "drop the plan" frames (`bỏ/hủy/dẹp/hoãn + ý định/kế hoạch`).
- Conditionals (`"nếu ... thì ..."`) are classified as `hypothetical`, which acts as a `write_blocker`.

#### Phase 3: Target Disambiguation (`object_sense.py`)
- Distinguishes roadmap entities (`topic`, `layer`, `bài`, `nhóm`, `mục`, `item`) from technical terms and external systems.
- Strips code spans and identifiers (e.g. `strip_code`).
- `FALSE_OBJECT` regex excludes false positives: `"mục tiêu"`, `"mạng nơ-ron"`, `"bài toán"`, `"Kafka topic"`, `"layer normalization"`, `"list item"`.
- Disambiguates via place prepositions (`trong`, `trên`, `ở`, `vào`, `sang`, `khỏi`, `in`, `on`, `into`): if placed in an external system (`names_another_place`), `has_object` becomes `False`.
- Resolves known places via `Catalog.has_place` (e.g., `"layer trong fe"`).

#### Phase 4: Scope Classification (`scope.py`)
- Triggered when keywords leave `target == Target.NONE`.
- Matches focus against catalog entries via `_names_catalog_entry` or `catalog.mentioned_in(text)`:
  - If catalog hit $\rightarrow$ `Scope.ROADMAP`.
  - If no catalog hit, computes cosine similarity against roadmap centroids (`centroids.signals(query_vec).nearest`):
    - `nearest >= roadmap_min` ($0.71$) $\rightarrow$ `Scope.ROADMAP`
    - `nearest >= gap_min + band` ($0.63 + 0.01$) $\rightarrow$ `Scope.DOMAIN_GAP`
    - `nearest <= gap_min - band` ($0.63 - 0.01$) $\rightarrow$ `Scope.EXTERNAL`
    - Otherwise $\rightarrow$ `Scope.NONE`
- Routing decision in `route_decision.py`:
  - `EXTERNAL` questions/statements $\rightarrow$ `IntentType.OUT_OF_SCOPE` (confidence $0.90$, method `"scope"`).
  - `ROADMAP` or `DOMAIN_GAP` questions/statements $\rightarrow$ `IntentType.KNOWLEDGE_QUERY` (confidence $0.85$, method `"scope"`).

---

## 3. Current Implementation of `IntentType.KNOWLEDGE_QUERY`

### 3.1 Schema Definition (`schemas.py`)

In `schemas.py`:
```python
class IntentType(str, Enum):
    ROADMAP_CUD = "roadmap_cud"         # Create or delete a topic or lesson; rename a section
    KNOWLEDGE_QUERY = "knowledge_query" # Ask about existing lessons, concepts, search docs
    PLAN_GOAL = "plan_goal"             # A learning plan, answered from the existing lessons
    CHITCHAT = "chitchat"               # Greetings, thanks, identity questions
    OUT_OF_SCOPE = "out_of_scope"       # Unrelated to roadmaps (weather, finance, general coding...)
    UNCLEAR = "unclear"                 # LLM router could not tell; the user is asked to rephrase

class IntentClassificationResult(BaseModel):
    intent: IntentType = Field(..., description="Primary intent of the user message.")
    confidence: float = Field(..., description="Confidence score between 0.0 and 1.0.")
    needs_cud_extraction: bool = Field(False, description="True if the message requires extracting StructuredRoadmapAction.")
    needs_confirmation: bool = Field(False, description="True if the change is asked politely or on a condition and must be confirmed before it runs.")
```

**Key Schema Observations**:
- No sub-intent field exists.
- No query metadata or target entity fields exist for queries (unlike `StructuredRoadmapAction` for CUD).
- Every query routed to `KNOWLEDGE_QUERY` yields an identical Pydantic structure with `needs_cud_extraction=False` and `needs_confirmation=False`.

### 3.2 Heuristic Routing Table (`policy.py` §3)

In `policy.py`, `DECISION_TABLE` defines 15 sequential rules. Five specific rows classify directly into `IntentType.KNOWLEDGE_QUERY`:

```python
# Row 9: Explicit search words ("tìm", "giải thích", "là gì", "thế nào", "how to")
Row("search_word", IntentType.KNOWLEDGE_QUERY, 0.90, act=SpeechAct.QUESTION, needs="search_word"),

# Row 11: Question naming a roadmap object without search words ("topic AI có mấy bài")
Row("roadmap_question", IntentType.KNOWLEDGE_QUERY, 0.90, act=SpeechAct.QUESTION, target=Target.ROADMAP),

# Row 12: Question matching a known lesson/topic title in vocabulary
Row("known_title_question", IntentType.KNOWLEDGE_QUERY, 0.90, act=SpeechAct.QUESTION, needs="known_title"),

# Row 13: How-to questions without roadmap objects ("cách tạo topic trong Kafka", "mạng nơ-ron dùng thế nào")
Row("how_to_question", IntentType.KNOWLEDGE_QUERY, 0.85, act=SpeechAct.QUESTION, target=Target.NONE, needs="how_to"),

# Row 14: Requests to view roadmap content ("cho mình xem lại toàn bộ cấu trúc các layer")
Row("show_request", IntentType.KNOWLEDGE_QUERY, 0.85, target=Target.ROADMAP, needs="show_request"),
```

In addition:
- `Row("advice_question", None, 0.0, act=SpeechAct.QUESTION, needs="advice")`: Leaves `intent=None` to delegate recommendation questions (`"lộ trình nào phù hợp"`) to the LLM router.
- `Row("blocked_change", None, 0.0, act=(SpeechAct.COMMAND, SpeechAct.REQUEST), needs="write_blocker", write="deny")`: Blocks writing while leaving intent classification to the LLM router.

### 3.3 Scope-Driven and Vocabulary-Driven Classification

Beyond the heuristic table, two other deterministic mechanisms produce `KNOWLEDGE_QUERY`:
1. **Scope Router (`route_decision.py` lines 140–142)**:
   ```python
   if decision.intent is None and search_act(decision.understanding.act.value, scope.scope):
       found = IntentClassificationResult(intent=IntentType.KNOWLEDGE_QUERY, confidence=0.85, needs_cud_extraction=False)
       return RouteOutcome(found, "scope", decision, WriteGate(WRITE_NONE), scope=scope)
   ```
   If a question names no keyword target but `scope.scope` is `ROADMAP` or `DOMAIN_GAP`, it routes as `KNOWLEDGE_QUERY` with `method="scope"`.
2. **Vocabulary Router (`intent_router.py` lines 233–236)**:
   ```python
   if self.names_known_lesson(text):
       return IntentClassificationResult(
           intent=IntentType.KNOWLEDGE_QUERY, confidence=0.8, needs_cud_extraction=False
       ), "vocabulary"
   ```
   If a declarative statement shares content words with roadmap titles (e.g., `"LLM chấm điểm câu trả lời của chính nó"`), it routes as `KNOWLEDGE_QUERY` with `method="vocabulary"`.

### 3.4 LLM Router Fallback (`intent_router.py`)

If all heuristics and vocabulary checks fail, `aroute` invokes the LLM router using `build_router_prompt(text, history)`:
```
Phân loại ý định của người dùng trong hệ thống quản lý Roadmap:
- ROADMAP_CUD: người dùng RA LỆNH tạo, thêm, sửa, xóa, chuyển một topic/layer/group/item cụ thể
- KNOWLEDGE_QUERY: hỏi về kiến thức, tìm kiếm bài học, tra cứu roadmap hiện có
- PLAN_GOAL: muốn lập kế hoạch hoặc sinh lộ trình trọn gói
- CHITCHAT: chào hỏi, cảm ơn, hỏi trợ lý/dự án làm được gì, cách dùng
- OUT_OF_SCOPE: không liên quan đến roadmap/topic/layer/bài học...
Phân biệt theo CHỦ ĐỀ được hỏi:
  - chủ đề thuộc lĩnh vực của roadmap (AI, LLM, RAG, MLOps…), kể cả khi roadmap chưa có bài → KNOWLEDGE_QUERY
  - chủ đề thuộc lĩnh vực khác → OUT_OF_SCOPE
Quy tắc:
- Một tên công nghệ, khái niệm hay bài học đứng một mình ("Kafka", "RAG") là KNOWLEDGE_QUERY.
```

If LLM invocation fails or times out:
- Circuit breaker open: returns `CHITCHAT` ($0.5$, `method="rate_limited"`).
- Provider error: returns `CHITCHAT` ($0.5$, `method="llm_error"`).
- Default: returns `CHITCHAT` ($0.5$, `method="default"`).

### 3.5 System 2 Reroute to `KNOWLEDGE_QUERY` (`route_decision.py` lines 181–187)

When System 1 heuristics tentatively classify a message as a write candidate (`ROADMAP_CUD`), System 2 (`verify_write` in `verifier.py`) inspects the request. If System 2 or `plan_write` determines that the user is not requesting a write (e.g., hypothetical question or question misread as command), `plan.outcome == REROUTE` triggers:
```python
rerouted = IntentClassificationResult(
    intent=plan.intent or IntentType.KNOWLEDGE_QUERY,
    confidence=verdict.confidence if verdict else 0.5,
    needs_cud_extraction=False,
)
return RouteOutcome(rerouted, f"{method}+reroute", decision, WriteGate(WRITE_NONE), plan, verdict, grounding, scope=scope)
```

---

## 4. Downstream Execution and Boundary Analysis

### 4.1 Downstream Execution in `agent.py`

When the router outputs `intent == IntentType.KNOWLEDGE_QUERY`, `agent.py` executes:
```python
# rag_service/domains/roadmap/agent.py:436
if intent_res.intent == IntentType.KNOWLEDGE_QUERY:
    deps = self._source_deps(content)
    if outcome.scope is not None and outcome.scope.scope == Scope.DOMAIN_GAP:
        focus_topic = focus_written(content) or outcome.scope.focus
        deps = dataclasses.replace(
            deps, no_match_reply=_unless_empty(lambda owner: domain_gap_reply(focus_topic, owner))
        )
    async for ev in answer_from_sources(
        query=content, session_id=session_id, owner=is_owner(), delay=delay,
        llm=self.llm, deps=deps,
    ):
        yield ev
    return
```

`answer_from_sources` executes the full **Vector RAG pipeline**:
1. Query decomposition / rewrite (`_plan_queries`)
2. Embedding query vector calculation
3. Live knowledge hybrid retrieval (`rag_engine.search_live_knowledge(query, limit=4)`)
4. Topic filtering (`filter_on_topic`)
5. Reranking (`_rerank` via Cohere or local cross-encoder)
6. Context formatting (`format_knowledge_context`)
7. LLM streaming generation (`generation_pipeline`)

### 4.2 The Architectural Tension: Three Colliding Workloads

| Dimension | Branch A: Vector RAG (Lesson Content & Concepts) | Branch B: In-Memory Catalog (Roadmap Metadata & Structure) | Branch C: User Learning Progress (ADR-0010: known/learning/target) |
|---|---|---|---|
| **Typical Queries** | `"RAG là gì"`, `"cơ chế chunking"`, `"so sánh FAISS vs pgvector"` | `"topic AI có mấy bài"`, `"DevOps có những bài nào"`, `"cấu trúc roadmap"` | `"tôi đang biết gì về AI"`, `"nên học gì tiếp"`, `"bài nào cần ôn lại"` |
| **Current Handling** | Routed to `KNOWLEDGE_QUERY` $\rightarrow$ `answer_from_sources` | If plain $\rightarrow$ intercepted pre-router by `handle_listing`. If non-plain $\rightarrow$ falls to `KNOWLEDGE_QUERY` $\rightarrow$ Vector RAG | If exact regex $\rightarrow$ intercepted pre-router by `handle_lesson_status`. If varied $\rightarrow$ falls to `KNOWLEDGE_QUERY` $\rightarrow$ Vector RAG |
| **Data Source** | ChromaDB / Vector Store + Fulltext Index | In-memory `Catalog` / SQLite DB | User state in relational DB (`RoadmapItem.status`, `statusUpdatedAt`) |
| **Latency** | $1500\text{ms} - 4000\text{ms}$ | $< 5\text{ms}$ (instant) | $20\text{ms} - 80\text{ms}$ (SQL query) |
| **Compute / Resource** | Embeddings + Reranker + LLM generation token cost | Zero LLM, zero embedding cost | Zero LLM, simple SQL query / sorting |
| **Risk of Current Bundling** | Expected path | Vector RAG fails to count or hallucinate structure; high latency waste | Vector RAG cannot retrieve user's personal progress; generates generic/wrong advice |

### 4.3 Pre-Router Interception Analysis

The codebase currently attempts to bypass the router's lack of granularity by placing hardcoded heuristic handlers **ahead of the router** in `agent.py`:
- `handle_listing` (line 284): Intercepts `LIST_TOPICS` when `is_plain_listing(content)` is True.
- `handle_sections` (line 290): Intercepts section listing/renaming.
- `handle_lesson_content` (line 298): Intercepts drafted content previews.
- `handle_lesson_status` (line 306): Intercepts lesson status queries ((a) what I know, (b) next learning, (c) review) and commands ((d) status change).

**Defects of the Pre-Router Interception Approach**:
1. **Fragile Regexes**: Pre-router checks rely on brittle string matches (e.g. `_REVIEW_CUE`, `_NEXT_CUE`, `_KNOWN_CUE`). Any variation (e.g., `"cho tôi xem tiến độ học tập các bài Docker"`) fails the regex and falls through to the router.
2. **Phase Order Inversion**: Bypassing the router violates the invariant in `docs/routing-phases.md` that "every message goes through the same phases, in order." Evals tracking router phases cannot observe or evaluate messages intercepted prior to $P_0$.
3. **Mismatched Fallback**: When an intercepted query slightly changes phrasing, it falls into `KNOWLEDGE_QUERY` and triggers expensive Vector RAG retrieval, leading to "no match" replies or hallucinations.

---

## 5. Specification Discovery & Edge Cases

### Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|---|---|---|---|---|---|---|
| 1 | Router Schema | `IntentType.KNOWLEDGE_QUERY` | Intent enum variant for knowledge queries | User message string | `IntentType.KNOWLEDGE_QUERY` | Unhandled inputs fall to `UNCLEAR` or `CHITCHAT` | `schemas.py:16` |
| 2 | Router Schema | `IntentClassificationResult` | Contract returned by intent classification | User message | Pydantic object with `intent`, `confidence`, `needs_cud_extraction`, `needs_confirmation` | Default fallback `CHITCHAT` ($0.5$) | `schemas.py:94` |
| 3 | Policy Table | Row `search_word` | Heuristic route for questions with explicit search keywords | `act=QUESTION`, `has_search_word=True` | `(KNOWLEDGE_QUERY, 0.90, write="none")` | Falls to subsequent rows if not matching | `policy.py:412` |
| 4 | Policy Table | Row `roadmap_question` | Heuristic route for questions naming roadmap objects | `act=QUESTION`, `target=ROADMAP` | `(KNOWLEDGE_QUERY, 0.90, write="none")` | Falls to subsequent rows if target is NONE | `policy.py:415` |
| 5 | Policy Table | Row `known_title_question`| Heuristic route for questions containing known lesson titles | `act=QUESTION`, shares words with `_vocabulary` | `(KNOWLEDGE_QUERY, 0.90, write="none")` | Falls to subsequent rows | `policy.py:416` |
| 6 | Policy Table | Row `how_to_question` | Heuristic route for how-to questions about technical topics | `act=QUESTION`, `target=NONE`, `how_to=True` | `(KNOWLEDGE_QUERY, 0.85, write="none")` | Usage questions about assistant route to `about_assistant` | `policy.py:418` |
| 7 | Policy Table | Row `show_request` | Heuristic route for viewing roadmap content without change verbs | `target=ROADMAP`, `show_request=True` | `(KNOWLEDGE_QUERY, 0.85, write="none")` | If change verb present, routes to CUD | `policy.py:420` |
| 8 | Policy Table | Row `advice_question` | Undecided heuristic route for recommendation questions | `act=QUESTION`, `advice=True` | `intent=None, confidence=0.0` (delegates to LLM) | Sent to LLM router | `policy.py:414` |
| 9 | Policy Table | Row `blocked_change` | Denies writing for changes with blockers, leaves intent open | `act in (COMMAND, REQUEST)`, `needs="write_blocker"` | `intent=None, write="deny"` (gate blocks write) | Gate enforces `BLOCKED_CHANGE` | `policy.py:405` |
| 10 | Scope Routing | P4 Scope Search Route | Routes open questions in roadmap field to search | `decision.intent is None`, `scope in (ROADMAP, DOMAIN_GAP)`, `act in (question, statement)` | `(KNOWLEDGE_QUERY, 0.85, method="scope")` | `EXTERNAL` routes to `OUT_OF_SCOPE` | `route_decision.py:140` |
| 11 | Vocab Routing | Declarative Title Match | Routes declarative statements matching known titles | Statement sharing content words with roadmap catalog | `(KNOWLEDGE_QUERY, 0.80, method="vocabulary")` | Falls to LLM router if no title match | `intent_router.py:233` |
| 12 | System 2 | Write Candidate Reroute | Reroutes misclassified CUD candidate back to query | S1 CUD candidate, but S2 verdict determines not a change | `(plan.intent or KNOWLEDGE_QUERY, confidence, method="{method}+reroute")` | If confirmed as write, stays CUD | `route_decision.py:182` |
| 13 | Multi-Clause | Mixed Intent Splitting | Splits combined queries across clause boundaries | Message with multiple clauses (e.g., search + CUD) | `mixed_intent_steps` list of clauses | Single clause proceeds normally | `intent_router.py:182` |
| 14 | Pre-Router | Plain Topic Listing | Intercepts plain topic listing requests before router | `is_plain_listing(content) == True` | Calls `list_topics` tool directly | Falls through to router if non-plain | `agent.py:284`, `commands.py:236` |
| 15 | Pre-Router | Lesson Status Handler | Intercepts ADR-0010 review/next/known queries pre-router | Cues: `asks_review`, `asks_next_learning`, `asks_what_i_know` | Formatted markdown status list | Falls through to router if regex misses | `agent.py:306`, `lesson_status.py` |
| 16 | Eval CI | Contract Snapshot Check | Verifies router decisions against committed snapshot | Message batch from `stress.jsonl`, `holdout.jsonl` | Regression exit code 1 or pass | Regression on any of 158 `knowledge_query` cases fails CI | `evals/router/check.py` |

### Edge Cases

| # | Feature | Input Example | Observed Behavior | Technical Explanation |
|---|---|---|---|---|
| 1 | Structural count query | `"topic AI có mấy bài"` | Matches Row `roadmap_question` $\rightarrow$ `KNOWLEDGE_QUERY` | `act=question`, `target=roadmap` (due to `"topic"`). Routes to Vector RAG downstream instead of querying in-memory topic count. |
| 2 | Listing with conversational filler | `"có những lộ trình nào trên website vậy"` | `is_plain_listing` is False $\rightarrow$ Routes to `KNOWLEDGE_QUERY` | Regex `is_plain_listing` rejects non-plain filler; router classifies via Row `roadmap_question` or `search_word`, triggering Vector RAG. |
| 3 | ADR-0010 progress query variation | `"cho tôi biết các bài tôi đã hoàn thành trong topic Docker"` | `asks_what_i_know` is False $\rightarrow$ Routes to `KNOWLEDGE_QUERY` | `_KNOWN_CUE` does not match `"các bài tôi đã hoàn thành"`; falls to router $\rightarrow$ `KNOWLEDGE_QUERY` $\rightarrow$ Vector RAG fails to retrieve user progress. |
| 4 | Hypothetical question with CUD verb | `"nếu xóa topic AI thì có mất bài không"` | Matches Row `roadmap_question` $\rightarrow$ `KNOWLEDGE_QUERY`, `blocker=hypothetical` | Polarity recognizes `hypothetical` (P2), preventing write; question about impact routes to `KNOWLEDGE_QUERY`. |
| 5 | Advice / recommendation question | `"lộ trình nào phù hợp cho người mới bắt đầu"` | Matches Row `advice_question` $\rightarrow$ `intent=None` $\rightarrow$ LLM Router | `u.advice=True` skips heuristic rows; LLM router prompt instructs domain guidance. |
| 6 | Single tech keyword | `"Kafka"` / `"RAG"` | Not matched by heuristics $\rightarrow$ LLM Router $\rightarrow$ `KNOWLEDGE_QUERY` | Prompt rule explicitly dictates: "Một tên công nghệ, khái niệm hay bài học đứng một mình ('Kafka', 'RAG') là KNOWLEDGE_QUERY". |
| 7 | Technical how-to without roadmap object | `"cách tạo topic trong Kafka"` | Matches Row `how_to_question` $\rightarrow$ `KNOWLEDGE_QUERY` | `FALSE_OBJECT` strips `"Kafka topic"`, leaving `target=NONE`; `how_to=True` routes to `KNOWLEDGE_QUERY` instead of CUD. |
| 8 | Multiple queries in one message | `"tìm bài về RAG rồi tạo topic Agents"` | `has_mixed_intents` is True $\rightarrow$ `mixed_intent_steps` | Returns `["tìm bài về RAG", "tạo topic Agents"]`; agent prompts user to ask one request at a time. |
| 9 | Code snippet with CUD verb | `db.items.remove("item-1")` | `strip_code` removes verb $\rightarrow$ `has_change_verb=False` | Code is ignored for write commands; treated as statement/question. |
| 10 | Domain gap concept | `"LoRA là gì"` (when not in roadmap) | Classified as `Scope.DOMAIN_GAP` $\rightarrow$ `KNOWLEDGE_QUERY` | Downstream `agent.py:442` replaces `no_match_reply` with `domain_gap_reply` ("chưa có bài học về LoRA"). |

---

## 6. Technical Assessment & Recommendations for Sub-Intent Design

### 6.1 Why Sub-Intent Decomposition is Necessary
1. **Downstream Execution Decoupling**: Vector RAG, In-Memory Catalog, and User Learning Progress have completely different operational characteristics:
   - **Vector RAG**: Requires dense vector search, reranking, and generation LLM ($1.5s - 4.0s$).
   - **Catalog**: Pure deterministic in-memory lookup ($< 5ms$, zero model cost).
   - **User Learning Progress**: SQL query on user-state database ($20ms - 80ms$, zero model cost).
2. **Elimination of Fragile Pre-Router Interceptions**: Moving catalog and learning progress recognition into the formal 10-phase router architecture eliminates brittle pre-router regexes in `agent.py` and restores phase integrity ($P_0 - P_9$).
3. **Accuracy and Hallucination Prevention**: Routing catalog count/structure questions or user progress questions to Vector RAG frequently yields hallucinations or "not found" responses because the retriever searches lesson text chunks rather than relational metadata or user records.

### 6.2 Proposed Sub-Intent Architecture Candidates
Under `IntentType.KNOWLEDGE_QUERY`, three sub-intents are natural candidates:
1. `KNOWLEDGE_CONCEPT` / `KNOWLEDGE_RAG`: Semantic queries on lesson content, concept explanations, and doc searches.
2. `CATALOG_STRUCTURE` / `KNOWLEDGE_CATALOG`: In-memory metadata queries (listing topics, section structures, counting lessons, finding where a lesson lives).
3. `LEARNING_PROGRESS` / `USER_PROGRESS`: ADR-0010 queries on user state (`known`, `learning`, `target`, review recommendations).

### 6.3 Evaluation CI Impact Considerations
- `evals/router/check.py` validates 158 cases in `decisions.jsonl` matching `route: "knowledge_query"`.
- If `KNOWLEDGE_QUERY` is split or augmented:
  - **Option 1 (Hierarchical sub_intent field)**: Keep primary `intent: IntentType.KNOWLEDGE_QUERY`, add `sub_intent: Optional[KnowledgeSubIntent] = None`. This preserves 100% backward compatibility with `check.py` and `decisions.jsonl` while enabling downstream routing in `agent.py`.
  - **Option 2 (Enum expansion)**: Split `IntentType.KNOWLEDGE_QUERY` into distinct top-level enums (`KNOWLEDGE_RAG`, `CATALOG_QUERY`, `LEARNING_PROGRESS`). This requires migrating and accepting all 158 baseline snapshots in `decisions.jsonl` via `python -m evals router-check --accept`.

---
*Report compiled by explorer_survey_router.*
