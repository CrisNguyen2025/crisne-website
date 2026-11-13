# Handoff Report: Audit of Abot Python Service regarding ADR-0009 and Tool Evolution

- **Agent**: `teamwork_explorer_abot`
- **Working Directory**: `/Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/teamwork_explorer_abot/`
- **Recipient**: `orchestrator` (`7dabfc33-21ba-4c83-9da9-779408f893c0`)
- **Date**: 2026-11-10T09:41:00Z
- **Status**: Complete (Hard Handoff)

---

## 1. Observation

### 1.1 Tool Evolution: 14 Old Tools vs 11 Current Active Tools

1. **Documented 14 Tools in README.md**:
   In `roadmap-rag-assistant/README.md` (lines 16 & 97–115):
   ```markdown
   16: CUD Tools (14 tools for Topic/Layer/Group/Item)
   ...
   97: ## Available Tools (14)
   99: | Category | Tool | Description |
   100: |----------|------|-------------|
   101: | Topic | `create_topic` | Tạo 1 topic mới |
   102: | Topic | `create_topics_batch` | Tạo nhiều topic cùng lúc |
   103: | Topic | `list_topics` | Liệt kê tất cả topic |
   104: | Topic | `delete_topic` | Xóa topic theo slug |
   105: | Layer | `create_layer` | Tạo layer trong topic |
   106: | Layer | `update_layer` | Cập nhật layer |
   107: | Layer | `delete_layer` | Xóa layer |
   108: | Group | `create_group` | Tạo group trong layer |
   109: | Group | `update_group` | Đổi tên group |
   110: | Group | `delete_group` | Xóa group |
   111: | Item | `create_item` | Tạo 1 item |
   112: | Item | `create_items_batch` | Tạo nhiều item cùng lúc |
   113: | Item | `update_item` | Cập nhật/di chuyển item |
   114: | Item | `delete_item` | Xóa item |
   ```

2. **Current 11 Active Tools in Codebase**:
   In `roadmap-rag-assistant/rag_service/tools/__init__.py` (lines 31–45):
   ```python
   ALL_TOOLS = [
       # Topics
       create_topic,
       create_topics_batch,
       list_topics,
       delete_topic,
       # Lessons and sections
       create_item,
       create_items_batch,
       import_items_from_text,
       update_item,
       update_item_content,
       rename_section,
       delete_item,
   ]
   ```
   Total: exactly **11 tools** registered in `ALL_TOOLS`.

3. **Tool Evolution History (Two Distinct Deprecation Phases)**:
   - **Phase A — Deprecation of 3 Mini-RAG Template Tools** (Commit `4b222163` & `17123806`):
     - Deleted file: `roadmap-rag-assistant/rag_service/tools/rag_tools.py`
     - The 3 removed tools were:
       1. `search_roadmap_templates` (Searched Mini-RAG template knowledge base)
       2. `generate_roadmap_from_template` (Constructed entire Topic + Layers + Groups + Items from template)
       3. `preview_roadmap_plan` (Generated plan preview tree for `/plan` mode)
     - Reason for removal: Commit message `4b222163`: *"Remove /plan, /goal and the blueprint templates; learning questions are answered from existing lessons."* System moved away from pre-fabricated blueprint templates to real existing roadmap lessons.
     - Lingering references to these 3 tools:
       - `roadmap-rag-assistant/tests/test_auth.py:118`: `assert "generate_roadmap_from_template" not in body`
       - `roadmap-rag-assistant/tests/test_sse.py:41`: `assert "preview_roadmap_plan" not in body`
       - `components/roadmap/RoadmapAssistantChatbot.tsx:90`: `toolName.startsWith("generate_")`
       - `rag_service/domains/roadmap/router/intent_router.py:92`: Prompt still says `- PLAN_GOAL: muốn lập kế hoạch hoặc sinh lộ trình trọn gói`
   - **Phase B — ADR-0009 Removal of Layer and Group Tools** (Commit `d3fc4369`):
     - Removed files: `rag_service/tools/layer_tools.py` (4 tools: `create_layer`, `create_layers_batch`, `update_layer`, `delete_layer`), `rag_service/tools/group_tools.py` (3 tools: `create_group`, `update_group`, `delete_group`), and `rag_service/tools/layer_resolver.py`.
     - Added/retained tools in `rag_service/tools/item_tools.py`:
       1. `rename_section` (Added in commit `d3fc4369` for section renames under ADR-0009)
       2. `update_item_content` (Added in commit `0870ee53` to append rich content to lessons)
       3. `import_items_from_text` (Retained for bulk importing lessons from bulleted text)

---

### 1.2 Comparison Table: 14 Old vs 11 Current Tools

| # | Tool Name | Original Category | Status in Current Code | Present in Current `ALL_TOOLS`? | Rationale / Current Equivalent |
|---|-----------|-------------------|------------------------|---------------------------------|--------------------------------|
| 1 | `create_topic` | Topic | **Active** | Yes | Creates 1 topic (`title`, `description`) |
| 2 | `create_topics_batch` | Topic | **Active** | Yes | Batch creates topics |
| 3 | `list_topics` | Topic | **Active** | Yes | Lists all topics |
| 4 | `delete_topic` | Topic | **Active** | Yes | Deletes topic by slug |
| 5 | `create_layer` | Layer | **Removed** | No | Removed by ADR-0009 (No more Layer level) |
| 6 | `update_layer` | Layer | **Removed** | No | Removed by ADR-0009 |
| 7 | `delete_layer` | Layer | **Removed** | No | Removed by ADR-0009 |
| 8 | `create_group` | Group | **Removed** | No | Removed by ADR-0009 (No more Group level) |
| 9 | `update_group` | Group | **Removed** | No | Removed by ADR-0009 |
| 10 | `delete_group` | Group | **Removed** | No | Removed by ADR-0009 |
| 11 | `create_item` | Item | **Active** | Yes | Creates 1 lesson in a topic, optional `section` |
| 12 | `create_items_batch` | Item | **Active** | Yes | Batch creates lessons in a topic/section |
| 13 | `update_item` | Item | **Active** | Yes | Updates title/description/section of a lesson |
| 14 | `delete_item` | Item | **Active** | Yes | Deletes lesson by ID |
| *New* | `rename_section` | Section | **Active** | Yes | Added by ADR-0009 (`item_tools.py`) |
| *New* | `update_item_content` | Item | **Active** | Yes | Added in commit `0870ee53` (`item_tools.py`) |
| *Retained* | `import_items_from_text` | Item | **Active** | Yes | Added in commit `3455eb3` (`item_tools.py`) |
| *Old Template 1* | `search_roadmap_templates` | Mini-RAG | **Removed** | No | Removed in commit `4b222163` (No templates) |
| *Old Template 2* | `generate_roadmap_from_template` | Mini-RAG | **Removed** | No | Removed in commit `4b222163` (No templates) |
| *Old Template 3* | `preview_roadmap_plan` | Mini-RAG | **Removed** | No | Removed in commit `4b222163` (No templates) |

---

### 1.3 Audit of Layer and Group References Across Codebase

#### A. Critical ADR-0009 Violations in LLM Prompts & Schemas (High Severity)
These files instruct the LLM to think, classify, or verify in terms of `layer` and `group`:

1. **`rag_service/domains/roadmap/router/verifier.py` (System 2 Write Verifier)**:
   - **Line 99**: `build_verify_prompt`:
     ```python
     "Bạn kiểm tra một tin nhắn gửi tới trợ lý quản lý Roadmap học tập (topic → layer → group → bài học).\n"
     ```
     *Direct violation*: explicitly defines the mental model as 4 levels `topic → layer → group → bài học`.
   - **Line 100–101**:
     ```python
     "Chỉ được coi là thay đổi Roadmap khi người dùng THẬT SỰ yêu cầu ngay bây giờ thay đổi một topic/layer/group/bài học CỦA ROADMAP NÀY.\n\n"
     ```
   - **Line 47**: `WriteVerdict.entity_level`:
     ```python
     entity_level: Optional[EntityLevel] = Field(default=None, description="topic / layer / group / item")
     ```
   - **Lines 51–53**: `WriteVerdict.container_name`:
     ```python
     container_name: Optional[str] = Field(
         default=None, description="Layer/topic sẽ chứa entity MỚI khi tạo (ví dụ '03-RAG', 'layer 1')"
     )
     ```
   - **Line 81**: `VERIFY_EXAMPLES`:
     ```python
     ("thêm bài Kafka Streams vào layer 03-RAG", "ROADMAP_CUD, command, roadmap, create item, container=03-RAG"),
     ```
   - **Lines 114–115**:
     ```python
     "('tạo ABC topic' → 'ABC'; 'tạo 2 layer mock 1 và 2' → 'mock 1', 'mock 2'); target_parent_identifier là layer/topic chứa (shortTag như '03-RAG' nếu có)"
     ```
   - **Lines 26, 30, 37**: Enum comments/docstrings referencing `layer` and `groups`.

2. **`rag_service/domains/roadmap/router/intent_router.py` (LLM Intent Router)**:
   - **Line 90**: `build_router_prompt`:
     ```python
     "- ROADMAP_CUD: người dùng RA LỆNH tạo, thêm, sửa, xóa, chuyển một topic/layer/group/item cụ thể\n"
     ```
   - **Line 94**: `build_router_prompt`:
     ```python
     "- OUT_OF_SCOPE: không liên quan đến roadmap/topic/layer/bài học (thời tiết, tài chính, giải trí, lập trình chung...)\n"
     ```
   - **Line 8**: Module docstring: `- KNOWLEDGE_QUERY: Real Hybrid RAG Engine (search existing topics/layers/items/lessons)`

3. **`rag_service/domains/roadmap/profile.py` (Generation Profile for RAG & Chitchat)**:
   - **Line 66**: `PROFILE.rules_rag`:
     ```python
     "Gọi tên lộ trình, layer và bài học đúng nguyên văn như trong dữ liệu (lộ trình tên `fe` thì viết `fe`), "
     ```
   - **Line 73**: `PROFILE.rules_chitchat`:
     ```python
     "Chỉ trả lời về lộ trình học tập, topic, layer, nhóm và bài học. "
     ```
   - **Line 81**: `PROFILE.rules_chitchat`:
     ```python
     "Hãy trả lời ngắn gọn, lịch sự, thân thiện và gợi ý các tính năng tạo Topic/Layer/Item nếu phù hợp."
     ```

4. **`rag_service/domains/roadmap/prompts.py` (Agent System Prompt)**:
   - **Line 64**:
     ```python
     "KHÔNG dùng cho tên topic/layer/item thông thường."
     ```

5. **`rag_service/api/schemas.py`**:
   - **Line 27**: `ChatRequest.context`:
     ```python
     description="Page context from the web client: roadmapSlug, layerId, itemId",
     ```
     *(Should be `roadmapSlug`, `section`, `itemId`)*.

6. **`roadmap-rag-assistant/sdk/typescript/src/types.ts`**:
   - **Line 49**: `ChangeEntry.level`:
     ```typescript
     level: 'topic' | 'layer' | 'group' | 'item' | (string & {});
     ```

---

#### B. Broken Tests & Obsolete Test Fixtures (High/Medium Severity)

1. **`roadmap-rag-assistant/tests/benchmark_eval.py` (Broken Test File)**:
   - **Lines 135, 143, 151, 159, 290**: `expected_level=EntityLevel.LAYER`
   - **Lines 169, 177**: `expected_level=EntityLevel.GROUP`
   - **Lines 131–181**: Entire test benchmark sections for Layer Creation and Group Creation.
   - **Direct Test Failure Verification**:
     Running `.venv/bin/pytest tests/benchmark_eval.py` produces:
     ```text
     ___________________ ERROR collecting tests/benchmark_eval.py ___________________
     tests/benchmark_eval.py:135: in <module>
         expected_level=EntityLevel.LAYER,
                        ^^^^^^^^^^^^^^^^^
     E   AttributeError: type object 'EntityLevel' has no attribute 'LAYER'
     ```
     *(Note: This file was hidden from standard test runs because pytest discovers `test_*.py`, not `benchmark_*.py`)*.

2. **`roadmap-rag-assistant/tests/data/group_cases.json` (Dead Fixture)**:
   - Leftover JSON fixture from ADR-0008 (`"pick_group and pickGroup equal to these rows"`). Unreferenced by any active code or test in the repo.

3. **`roadmap-rag-assistant/tests/data/intent_eval_blind_cases.json` (Obsolete Test Dataset)**:
   - Lines 4, 6, 12, 13, 15, 16, 19, 24, 27, 30: Contains 10 obsolete test cases with `layer` and `group` (e.g., `"đổi tên layer 2 thành..."`, `"Can you add a new group called 'Testing & CI/CD'..."`, `"Show me all lessons under the DevOps group"`).

4. **`roadmap-rag-assistant/tests/data/intent_eval_cases.json` (Obsolete Test Dataset)**:
   - Lines 131, 171, 199: Contains test cases expecting CUD for layers (`"tạo 2 layer mock 1 và 2 trong be topic"`, `"thêm layer Testing vào topic QA"`, `"danh sách bài trong layer Docker"`).

5. **`roadmap-rag-assistant/evals/router/generate_stress.py` (Obsolete Generator)**:
   - Lines 25, 29–33, 44: Generates synthetic test strings with `LAYERS = ["Backend", "General", "DevOps", "AI Agent"]`, `"thêm bài {n} vào layer {l}"`, `"nhờ bạn tạo layer {l} được không"`.

---

#### C. Documentation & Internal Comments (Low Severity)

1. **`roadmap-rag-assistant/README.md`**:
   - Lines 16, 105–110, 151: Old 14-tool table and mentions of `Topic/Layer/Group/Item`.
2. **`roadmap-rag-assistant/rag_service/api/server.py`**:
   - Line 59: `description="Mini RAG service for CUD operations on Topic/Layer/Group/Item via natural language"`
3. **`roadmap-rag-assistant/rag_service/state/session_store.py`**:
   - Line 3: docstring `(active topic, active layer, pending confirmations)`
4. **`roadmap-rag-assistant/rag_service/nlp_cleaner.py`**:
   - Line 174: `# ── LAYER EXTRACTOR ──` and lines 180–186 docstring examples.
5. **`components/roadmap/RoadmapAssistantChatbot.tsx`**:
   - Line 59: `* Allows users to CUD topics, layers, groups, items and generate documents`
6. **`roadmap-rag-assistant/docs/routing-phases.md`**:
   - Lines 41, 45, 72, 81: Historical references in documentation.

---

#### D. Valid, Preserved Uses of "Layer" and "Group" (MUST KEEP)

The following occurrences are fully intentional and should NOT be removed:

1. **Deprecation Guardrails & User Guidance (ADR-0009 Interceptor)**:
   - `rag_service/domains/roadmap/router/grounding.py` (lines 167–194):
     `LEGACY_LEVEL` regex matches messages asking to create/delete/update layers or groups.
     `legacy_level_reply` returns:
     *"Roadmap không còn layer hay group. Mỗi topic chứa trực tiếp các bài học, và bài học được chia theo mục. Mình chưa làm gì cả. Bạn gửi lại theo cú pháp mới, ví dụ..."*
   - `rag_service/domains/roadmap/agent.py` (lines 274–280): Guardrail phase 0e intercepts legacy requests before routing.
   - `tests/test_guardrails.py` (lines 210–228) and `tests/test_fallback_agent.py` (lines 47–58): Tests verifying that layer/group commands write nothing and return the interceptor message.
2. **Technical Domain Concepts (Computer Science & AI Terms)**:
   - Machine Learning concepts: "layer normalization", "hidden layer", "dense layer", "attention layer", "dropout layer", "convolutional layer", "Agent Layer".
   - Networking & Systems: "OSI layer", "data layer", "Kafka consumer group".
   - Disambiguation in `rag_service/domains/roadmap/router/policy.py` (lines 86–87) strips these technical terms so they are not mistaken for roadmap structure.
   - `evals/router/noise_target_holdout.jsonl` & `target_holdout.jsonl`: Negative test samples to ensure "layer mới trong Photoshop" and "group các layer trong Figma" are correctly routed as off-topic.
3. **Migrated Section Titles**:
   - `evals/corpus/public/roadmap/documents.jsonl`: Contains `"section": "03. Tầng RAG + Agent Layer · Core"` (represents the flattened section name created by ADR-0009 migration script `scripts/flatten-to-sections.ts`).
4. **UI Icons & CSS**:
   - Lucide React icon: `<Layers />` used for topic/roadmap icons in `prisma/schema.prisma:23`, `app/page.tsx`, and `components/roadmap/MasterPanel.tsx`.
   - CSS `@layer` directives in `app/styles/spacing.css`, `globals.css`, `typography.css`.
   - Google Analytics `dataLayer` in `app/layout.tsx` and `components/analytics/gtm.tsx`.

---

## 2. Logic Chain

1. **Verification of Tool Evolution**:
   - *Premise*: `README.md` documented 14 CUD tools (4 Topic, 3 Layer, 3 Group, 4 Item), while `rag_service/tools/__init__.py` exposes 11 active tools.
   - *Evidence*: Git log of `rag_service/tools/` reveals two major refactoring commits:
     - In commit `4b222163` / `17123806`, 3 template-generation tools in `rag_tools.py` (`search_roadmap_templates`, `generate_roadmap_from_template`, `preview_roadmap_plan`) were deprecated and deleted because the roadmap shifted from pre-made templates to answering from existing lessons.
     - In commit `d3fc4369`, ADR-0009 was implemented: `layer_tools.py` (4 tools) and `group_tools.py` (3 tools) were deleted, while `rename_section` and `update_item_content` were introduced, and `import_items_from_text` was retained.
   - *Inference*: The 11 tools currently in `ALL_TOOLS` represent the modernized, flattened architecture (4 Topic tools + 7 Lesson/Section tools).

2. **Assessment of ADR-0009 Prompt Inconsistencies**:
   - *Premise*: ADR-0009 explicitly decided that Lesson belongs directly to Topic, Section replaces Layer and Group, and all Layer/Group vocabulary must be removed from the assistant.
   - *Evidence*: `verifier.py` (lines 99–101, 47, 51–53) instructs the System 2 LLM that roadmaps have 4 levels `(topic → layer → group → bài học)` and accepts `container=layer`. `intent_router.py` (lines 90, 94) instructs the LLM router that `ROADMAP_CUD` includes `layer` and `group`. `profile.py` (lines 66, 73, 81) instructs the generator and chitchat model to mention `layer` and `nhóm` and suggest creating `Topic/Layer/Item`.
   - *Inference*: While the low-level adapters and tools were migrated in `d3fc4369`, the LLM-facing prompts (System 2 verifier, LLM router, and domain profile) were never updated to reflect ADR-0009. This causes the LLMs to hallucinate or expect legacy layers and groups.

3. **Assessment of Broken Tests**:
   - *Premise*: `schemas.py` defines `EntityLevel` with only `TOPIC` and `ITEM`.
   - *Evidence*: `tests/benchmark_eval.py` imports `EntityLevel` and directly asserts `expected_level=EntityLevel.LAYER` and `expected_level=EntityLevel.GROUP`. Running pytest directly on `benchmark_eval.py` causes an immediate `AttributeError`.
   - *Inference*: `benchmark_eval.py` is an unmaintained, orphaned benchmark suite from before ADR-0009 that escaped CI detection because its filename does not start with `test_`.

---

## 3. Caveats

1. **No Code Edits**: In strict accordance with the read-only mandate, no files were modified. The findings documented here serve as an actionable blueprint for subsequent execution tasks.
2. **External Model Quota**: All evaluations and tests performed locally were executed using deterministic offline fixtures (`mock_adapter`, offline heuristics, regex parsers). Live LLM calls were not invoked.
3. **Scope Distinction**: All references to "layer" in machine learning contexts (e.g. "layer normalization", "dropout layer") or graphics software (e.g. "Photoshop layer") were verified as legitimate disambiguation rules and must not be blindly removed.

---

## 4. Conclusion

The audit identifies:
1. **Tool Count Verified**: 14 original documented CUD tools vs 11 active tools in `ALL_TOOLS`. The 3 deprecated Mini-RAG template tools (`search_roadmap_templates`, `generate_roadmap_from_template`, `preview_roadmap_plan`) were removed in commits `4b222163` / `17123806`. The 6 Layer/Group tools were removed in ADR-0009 commit `d3fc4369`, replaced by `rename_section`, `update_item_content`, and `import_items_from_text`.
2. **Prompts Violating ADR-0009**: System 2 Write Verifier (`verifier.py`), LLM Intent Router (`intent_router.py`), Domain Profile (`profile.py`), and `README.md` contain active instructions prompting the LLM to think in `Topic → Layer → Group → Lesson`.
3. **Broken Suite**: `tests/benchmark_eval.py` crashes on collection with `AttributeError: type object 'EntityLevel' has no attribute 'LAYER'`.
4. **Valid Guardrail Preserved**: `legacy_level_reply` in `grounding.py` and `agent.py` is an intentional, working deprecation interceptor that correctly protects the system against legacy commands.

---

## 5. Verification Method

To independently verify all findings in this report, execute the following commands in `roadmap-rag-assistant/`:

1. **Verify Active 11 Tools in `rag_service/tools/__init__.py`**:
   ```bash
   python3 -c "from rag_service.tools import ALL_TOOLS; print(len(ALL_TOOLS), [t.name for t in ALL_TOOLS])"
   ```
   *Expected output*: `11 ['create_topic', 'create_topics_batch', 'list_topics', 'delete_topic', 'create_item', 'create_items_batch', 'import_items_from_text', 'update_item', 'update_item_content', 'rename_section', 'delete_item']`

2. **Verify Benchmark Test Failure**:
   ```bash
   cd roadmap-rag-assistant && .venv/bin/pytest tests/benchmark_eval.py
   ```
   *Expected output*: Collection error `AttributeError: type object 'EntityLevel' has no attribute 'LAYER'` at line 135.

3. **Verify Standard Test Suite Passing (1001 tests)**:
   ```bash
   cd roadmap-rag-assistant && .venv/bin/pytest -q
   ```
   *Expected output*: `1001 passed`.

4. **Verify Prompt Violations via Inspection**:
   - Inspect `roadmap-rag-assistant/rag_service/domains/roadmap/router/verifier.py:99-101`
   - Inspect `roadmap-rag-assistant/rag_service/domains/roadmap/router/intent_router.py:89-94`
   - Inspect `roadmap-rag-assistant/rag_service/domains/roadmap/profile.py:66-81`
