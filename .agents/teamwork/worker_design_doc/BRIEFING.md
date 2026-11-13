# BRIEFING — 2026-11-10T10:06:00Z

## Mission
Soạn thảo tài liệu Thiết kế Kiến trúc Toàn diện (Comprehensive Architecture Design Document) cho việc phân chia sub-intent của IntentType.KNOWLEDGE_QUERY trong trợ lý Abot tại `roadmap-rag-assistant/docs/knowledge-sub-intents-design.md`, tổng hợp từ 3 báo cáo khảo sát (Router, Downstream, Eval CI) đáp ứng các yêu cầu R1, R2, R3, R4 mà không sửa đổi mã nguồn router hay dataset eval.

## 🔒 My Identity
- Archetype: teamwork_worker
- Roles: implementer, qa, specialist
- Working directory: /Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/worker_design_doc
- Original parent: 88cff40c-5d96-4718-b370-cc0b520b35d9
- Milestone: M1: Architectural Design Doc Synthesis

## 🔒 Key Constraints
- Strictly read-only on router source code (`schemas.py`, `policy.py`, `intent_router.py`) and eval dataset (`evals/router/`).
- Do NOT edit code in `roadmap-rag-assistant/rag_service/domains/roadmap/router/` or eval files.
- Sole repo artifact to create is: `/Users/tienanhnguyen/Desktop/src_example/crisne-website/roadmap-rag-assistant/docs/knowledge-sub-intents-design.md`.
- Working directory artifacts: `progress.md` and `handoff.md`.
- Genuine implementation with authentic analysis, schemas, matrices, and roadmap. Zero shortcuts or hardcoded facades.

## Current Parent
- Conversation ID: 88cff40c-5d96-4718-b370-cc0b520b35d9
- Updated: 2026-11-10T10:06:00Z

## Task Summary
- **What to build**: Comprehensive, authoritative Architecture Design Document `roadmap-rag-assistant/docs/knowledge-sub-intents-design.md` covering R1 (Downstream Differences), R2 (Sub-intent Design & Boundaries), R3 (Eval CI Impact & 4-Phase Roadmap), and R4 (Document Deliverable).
- **Success criteria**: Full coverage of R1–R4 in Vietnamese, Python/Pydantic schemas, comparison matrices, ambiguity matrices, eval CI impact details, 4-phase rollout plan, >= 20 new test cases spec, verification commands, and integrity statement.
- **Interface contracts**: `/Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/orchestrator/PROJECT.md`
- **Code layout**: Markdown document in `roadmap-rag-assistant/docs/`

## Key Decisions Made
- Selected Hierarchical Sub-Intent Architecture (Option 3): Retain `IntentType.KNOWLEDGE_QUERY = "knowledge_query"` as level-1 intent and add `sub_intent: Optional[KnowledgeSubIntent]` to `IntentClassificationResult`. This guarantees 100% backward compatibility with `decisions.jsonl` (158 snapshot decisions) and `check.py` while providing clear execution routing downstream in `agent.py`.
- Sub-intents defined: `KNOWLEDGE_SEARCH` (`"search"` for Vector RAG), `CATALOG_QUERY` (`"catalog"` for In-memory Catalog), and `LEARNING_PROGRESS` (`"progress"` for ADR-0010 user state).
- State mutation commands (ADR-0010 d) are classified as `ROADMAP_CUD` with action preview, strictly separating read queries from write mutations.
- Provided 4-phase rollout roadmap with concrete verification gates and zero CI breakage.

## Artifact Index
- `/Users/tienanhnguyen/Desktop/src_example/crisne-website/roadmap-rag-assistant/docs/knowledge-sub-intents-design.md` — Authoritative Design Document (676 lines, 64KB)
- `/Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/worker_design_doc/progress.md` — Liveness & progress tracker
- `/Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/worker_design_doc/handoff.md` — 5-component handoff report

## Change Tracker
- **Files modified**: `roadmap-rag-assistant/docs/knowledge-sub-intents-design.md` (new document created).
- **Build status**: `router-check` passed (exit 0, 0 diffs), `holdout` passed, `validate` passed, `pytest` 96 passed in 1.60s.
- **Pending issues**: None. Ready for multi-agent review.

## Quality Status
- **Build/test result**: All checks passed. Zero regressions.
- **Lint status**: Markdown syntax standard.
- **Tests added/modified**: 24 new test case specifications detailed in document (8 catalog, 10 progress, 6 boundary), 0 test code files edited.

## Loaded Skills
- Followed `design-doc-mermaid` standards (Mermaid embedded in markdown) and `cris-code-intel` architecture conventions.
