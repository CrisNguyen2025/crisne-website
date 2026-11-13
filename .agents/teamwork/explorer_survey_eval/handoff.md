# Handoff Report: Eval CI & Dataset Impact Survey

**Agent**: `explorer_survey_eval` (teamwork_explorer)  
**Milestone**: Phase 0: Survey  
**Working Directory**: `/Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/explorer_survey_eval/`  
**Full Report**: `report.md`  
**Recipient**: `orchestrator` (`88cff40c-5d96-4718-b370-cc0b520b35d9`)  

---

## 1. Observation

Direct observations from inspecting the codebase and test assets:

1. **Test Suite Inventory & Execution Contract**:
   - In `roadmap-rag-assistant/evals/router/check.py:8-13` and `157-180`:
     Enforces a dual-gating mechanism:
     - Ratchet against `baseline.json`: fails if `stress.wrong_write`, `stress.dropped`, or `stress.misroute` increases, or if `heldout.routing.correct` or `heldout.intent_cases.correct` decreases.
     - Snapshot comparison against `decisions.jsonl`: compares current router outputs against committed decisions. If ANY decision differs (`changed`), is added, or removed without `--accept`, `check.py` prints the diff and returns `1`.
   - In `roadmap-rag-assistant/tests/test_router_policy.py:213-217`:
     ```python
     def test_router_contract_is_in_sync(capsys):
         """Routing changes need review: run `python -m evals router-check`, read the diff, then `--accept`."""
         from evals.router.check import main

         assert main([]) == 0, capsys.readouterr().out[-3000:]
     ```
     `python -m pytest -q` automatically runs `router-check`, tying Pytest CI directly to `decisions.jsonl`.
   - In `.github/workflows/ci.yml:34-48`: CI runs sequentially:
     `python -m pytest -q` $\rightarrow$ `python -m evals validate` $\rightarrow$ `python -m evals router-check` $\rightarrow$ `python -m evals.router.holdout` $\rightarrow$ `python -m evals.router.confuse`.

2. **Quantification of `KNOWLEDGE_QUERY` Test Cases Across All Datasets**:
   - `evals/router/decisions.jsonl` (748 total decisions):
     Exactly **158 decisions** have `"route": "knowledge_query"` (21.1% of all decisions).
   - `evals/datasets/_routing/samples.jsonl` (228 total, 223 active):
     Exactly **52 active samples** have `expected.route = ["knowledge_query"]`.
     - 37 samples (71.2%) are Vector RAG lesson content/concept QA (e.g., `routing-009` *"token JWT là gì"*, `routing-024` *"tìm bài học về Docker"*).
     - 14 samples (26.9%) are In-Memory Catalog structural/listing queries (e.g., `routing-056` *"liệt kê tất cả các bài học thuộc topic 1"*, `routing-059` *"cho xem danh sach cac topic trong phan frontend"*, `routing-152` *"topic này có mấy bài"*, `routing-154` *"bài Docker nằm ở đâu"*).
     - 1 sample (1.9%) is learning prerequisite (`routing-188` *"bài nào nên xem trước khi học RAG?"*).
   - `tests/data/intent_eval_cases.json` (64 total cases):
     Exactly **15 cases** have `expected = "knowledge_query"` (14 Vector RAG, 1 Catalog: line 200 *"danh sách bài trong layer Docker"*).
   - `evals/router/stress.jsonl` (504 total generated cases):
     Exactly **83 cases** involve `knowledge_query` (56 cases in `family = "search"`, 27 cases in two-clause combinations). 100% of these are Vector RAG search queries.
   - `evals/router/stress_confuse.jsonl` (84 base messages x 6 noise variants = 498 measured in `confuse_baseline.json`):
     Exactly **46 base cases** specify `want` containing `'K'` (`knowledge_query`).
   - `evals/router/holdout.jsonl` (60 cases): 0 cases labeled for knowledge queries (focused exclusively on write safety).

3. **Current Special Bridge in Eval Harness**:
   - In `evals/router/check.py:102` & `111`:
     ```python
     hit = d["route"] == heldout_want(s) or (heldout_want(s) == "knowledge_query" and d["route"] == "list_topics")
     ```
     The eval harness already contains a special compatibility alias treating `d["route"] == "list_topics"` as a valid hit for `knowledge_query` expectations.

4. **Complete Absence of ADR-0010 Learning Progress Queries in `evals/router/`**:
   - In `stress.jsonl`, `stress_confuse.jsonl`, `holdout.jsonl`, `samples.jsonl`, and `intent_eval_cases.json`:
     There are **0 test cases** testing queries for ADR-0010 user learning progress (`known`, `learning`, `target`, review timestamps like *"bài nào cần ôn lại"*, *"nên học gì tiếp"*, *"tôi đang biết gì về X"*).
   - Currently, user learning progress queries are only tested in isolation in `tests/test_lesson_status_e2e.py` and `tests/test_lesson_status_pure.py` via procedural regex interceptors in `agent.py:306`.

5. **`confuse.py` Mapping Contract**:
   - In `evals/router/confuse.py:81-82`:
     ```python
     return {"knowledge_query": "K", "roadmap_cud": "C", "plan_goal": "P", "chitchat": "T",
             "out_of_scope": "O", "unclear": "U"}.get(intent, intent)
     ```
     `branch()` explicitly maps `"knowledge_query"` to `"K"`. If a sub-intent name (e.g. `knowledge_search` or `catalog_query`) is output as the top-level intent, `branch()` returns the unmapped raw string, causing `wrong_branch` failures that exceed the ratchet limit (`wrong_branch <= 103` in `confuse_baseline.json`).

---

## 2. Logic Chain

1. **Premise (Obs 1 & 2)**: The router test harness (`check.py`) enforces strict snapshot matching on 748 decisions, including 158 snapshotted `"knowledge_query"` decisions. Furthermore, `test_router_policy.py` runs this check inside Pytest.
2. **Premise (Obs 2 & 5)**: In existing test datasets, 52 active samples in `samples.jsonl`, 15 in `intent_eval_cases.json`, 83 in `stress.jsonl`, and 46 in `stress_confuse.jsonl` explicitly assert `"knowledge_query"` or `'K'`.
3. **Deduction (Impact of Top-level Enum Split)**: If `IntentType.KNOWLEDGE_QUERY` is split or replaced by separate top-level enum members (e.g. `KNOWLEDGE_SEARCH`, `KNOWLEDGE_CATALOG`, `LEARNING_PROGRESS`):
   - All 158 decisions in `decisions.jsonl` will fail the snapshot diff.
   - `baseline.json` ratchets will fail (heldout correct dropped from 223 to 171).
   - `confuse_baseline.json` ratchet will fail (`wrong_branch` exceeding 103).
   - Pytest will fail across multiple test files.
   - Any CI build on any branch will turn red.
4. **Deduction (Benefit of Hierarchical Sub-Intents)**: If `IntentType.KNOWLEDGE_QUERY` is preserved as the primary intent and extended with `sub_intent: Optional[KnowledgeSubIntent] = None`:
   - 100% of existing snapshot decisions and baseline ratchets remain valid.
   - CI builds remain completely green.
   - Downstream `agent.py` can immediately inspect `intent_res.sub_intent` to route between Vector RAG, In-memory Catalog, and ADR-0010 SQLite queries.
5. **Deduction (Obs 4 - Test Coverage Gap)**: Because `evals/router/` currently contains 0 test cases for ADR-0010 progress queries, dividing sub-intents requires simultaneously expanding the evaluation dataset with at least 20 new test cases covering review queries, next learning queries, what-I-know queries, and status change commands.

---

## 3. Caveats

- **Scope Constraint**: Investigation was strictly read-only. No source files, eval datasets, or test configurations were modified.
- **Offline vs Live LLM Router**: In offline CI mode, P5 LLM router and P6 System 2 verifier are bypassed; decisions are determined solely by heuristics (`policy.py`), scope centroids, and grounding. All statistics reported above reflect the deterministic offline baseline.
- **Downstream Interceptor Interaction**: `is_plain_listing` in `commands.py` currently intercepts listing requests before the router. If catalog sub-intents are formalized in the router, the relationship between `is_plain_listing` in `agent.py` and the router must be cleanly phased.

---

## 4. Conclusion

1. **Blast Radius Assessment**:
   - A flat enum split of `KNOWLEDGE_QUERY` has a **HIGH** blast radius, breaking 158 snapshot decisions, 52 routing samples, 15 intent cases, 83 stress cases, 46 confuse cases, and CI gating.
   - A hierarchical sub-intent design (`intent=KNOWLEDGE_QUERY`, `sub_intent=...`) has **ZERO** blast radius on existing CI while fully enabling downstream execution optimization.
2. **Evaluation Gap**:
   - `evals/router/` has zero coverage for ADR-0010 user learning progress queries. New test cases must be added to `samples.jsonl` and `stress_confuse.jsonl`.
3. **Recommended Path**:
   - Adopt the hierarchical sub-intent architecture.
   - Expand eval datasets with Catalog and Progress test cases.
   - Follow a 3-phase rollout roadmap ensuring CI stability at every step.

---

## 5. Verification Method

To independently verify the numbers and observations:

1. **Verify Baseline Metrics and Ratchet**:
   ```bash
   cd roadmap-rag-assistant
   python -m evals router-check
   ```
   *Expected result*: Exits 0, prints metrics matching `baseline.json` (intent_cases: 64, routing: 223, wrong_write: 0, dropped: 0, misroute: 0).

2. **Verify Count of 158 `knowledge_query` Decisions**:
   ```bash
   python3 -c "import json; from pathlib import Path; p = Path('evals/router/decisions.jsonl'); lines = [json.loads(l) for l in p.read_text().splitlines() if l.strip()]; print(sum(1 for l in lines if l.get('route') == 'knowledge_query'))"
   ```
   *Expected output*: `158`.

3. **Verify Count of 52 Active Routing Samples**:
   ```bash
   python3 -c "import json; from pathlib import Path; p = Path('evals/datasets/_routing/samples.jsonl'); lines = [json.loads(l) for l in p.read_text().splitlines() if l.strip()]; print(sum(1 for l in lines if l.get('metadata', {}).get('status') == 'active' and l.get('expected', {}).get('route') == ['knowledge_query']))"
   ```
   *Expected output*: `52`.

4. **Verify Count of 15 Intent Eval Cases**:
   ```bash
   python3 -c "import json; from pathlib import Path; p = Path('tests/data/intent_eval_cases.json'); cases = json.loads(p.read_text()); print(sum(1 for c in cases if c.get('expected') == 'knowledge_query'))"
   ```
   *Expected output*: `15`.

5. **Verify Absence of ADR-0010 in `evals/router/`**:
   Inspect `evals/router/stress.jsonl` and `evals/datasets/_routing/samples.jsonl` for queries matching `asks_review` (*"ôn lại"*), `asks_next_learning` (*"học tiếp"*), or status changes (*"đánh dấu bài"*).
