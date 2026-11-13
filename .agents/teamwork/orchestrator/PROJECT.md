# Project: Abot IntentType.KNOWLEDGE_QUERY Sub-Intent Evaluation and Architectural Design

## Architecture
- Router Component: `roadmap-rag-assistant/rag_service/domains/roadmap/router/` (`schemas.py`, `policy.py`, `intent_router.py`)
- Router Documentation: `roadmap-rag-assistant/docs/routing-phases.md`
- Downstream Execution Paths:
  - Vector RAG Search: `answer_from_sources`, `HybridVectorStore` (Gemini embeddings + FTS5 BM25, RRF, reranker, LLM streaming). Latency: 800ms–3,500ms.
  - In-Memory Catalog Lookup: `Catalog` in `target_grounding.py`, `list_topics` tool, pure RAM string lookup. Latency: 5ms–40ms.
  - User Learning Progress (ADR-0010): `known`, `learning`, `target` status, `statusUpdatedAt`, strictly Owner-only. Latency: 10ms–60ms.
- Evaluation Suite: `roadmap-rag-assistant/evals/router/` (`decisions.jsonl` with 158 knowledge_query decisions, `check.py` ratchet, `confuse.py`, `stress.jsonl`, `samples.jsonl`).
- Deliverable: `roadmap-rag-assistant/docs/knowledge-sub-intents-design.md` (989 lines, 80KB)

## Feature Inventory (Final Verification)
| # | Feature / Area | Description | Milestone | Source |
|---|----------------|-------------|-----------|--------|
| 1 | Router Current State Survey | Survey schemas.py, policy.py, intent_router.py, routing-phases.md | Phase 0: Survey | DONE |
| 2 | Downstream Execution Survey | Survey Vector RAG, catalog lookup, ADR-0010 learning state downstream flows | Phase 0: Survey | DONE |
| 3 | Eval CI & Dataset Survey | Survey evals/router/ dataset, test cases, accuracy metrics, runner | Phase 0: Survey | DONE |
| 4 | Downstream Differences Analysis | Resource, latency, context, side-effects analysis across 3 branches | M1: Design Doc | DONE |
| 5 | Sub-intent Design & Boundaries | Hierarchical Pydantic schema, boundaries, typical queries, confusion analysis | M1: Design Doc | DONE |
| 6 | Eval CI Impact & Phased Roadmap | Affected test cases, new test cases needed, regression risk, phased rollout | M1: Design Doc | DONE |
| 7 | Design Doc Delivery | Comprehensive markdown document committed to repository | M1: Design Doc | DONE |
| 8 | Multi-agent Review & Verification | Independent Reviewers (2) and Challengers (2) verification | M2: Review & Verification | DONE (PASS) |
| 9 | Forensic Integrity Audit | teamwork_auditor verify compliance with scope constraints & no cheat | M3: Integrity Audit | DONE (CLEAN) |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| Phase 0 | Comprehensive Survey | 3 parallel explorers investigating router, downstream execution, and eval CI | none | DONE |
| M1 | Architectural Design Doc Synthesis | Worker compiles comprehensive Design Document covering R1, R2, R3, R4 | Phase 0 | DONE |
| M2 | Multi-agent Review & Challenge | 2 Reviewers + 2 Challengers verify correctness, boundaries, schemas, CI safety | M1 | DONE (PASS) |
| M3 | Forensic Integrity Audit | teamwork_auditor verifies zero source code / eval data modification & authentic logic | M2 | DONE (CLEAN) |

## Scope Constraints & Rules Compliance
- Strictly Read-Only on router source code (`schemas.py`, `policy.py`, `intent_router.py`) and eval dataset (`evals/router/`) verified: 0 diffs.
- No source code or eval datasets were altered.
- Deliverable committed exclusively at `roadmap-rag-assistant/docs/knowledge-sub-intents-design.md`.
