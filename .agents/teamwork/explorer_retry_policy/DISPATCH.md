# Dispatch Task: Fix Strategy for Policy Rule Ordering & Roadmap Question Splitting (Explorer 1)

## Objective
Analyze challenger_2's empirical finding on the 86.5% `roadmap_question` lumping risk and `search_word` precedence inversion in `DECISION_TABLE`. Recommend concrete fix specifications for `knowledge-sub-intents-design.md`.

## Inputs & Evidence
- Challenger 2 Report: `/Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/challenger_2/report.md`
- Challenger 2 Handoff: `/Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/challenger_2/handoff.md`
- Current Design Doc: `/Users/tienanhnguyen/Desktop/src_example/crisne-website/roadmap-rag-assistant/docs/knowledge-sub-intents-design.md`
- Original Request: `/Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/ORIGINAL_REQUEST.md`

## Problem Statement
1. In `evals/router/decisions.jsonl`, 45 of 52 `roadmap_question` decisions (86.5%) are hypothetical CUD questions or content QA. Naively mapping `Row("roadmap_question")` to `sub_intent=CATALOG` causes 86.5% misrouting.
2. Words like `"danh sách"`, `"liệt kê"` are in `SEARCH_WORDS`, so catalog listing queries trigger `row=search_word` first and get mapped to Vector RAG instead of Catalog.

## Instructions
1. Formulate exact fix recommendations to update in the Design Doc:
   - Split `roadmap_question` into `roadmap_catalog_query` (structural position, count) vs `roadmap_content_query` (conceptual QA, hypothetical CUD questions) with precise conditions.
   - Specify rule precedence in `DECISION_TABLE` ensuring Catalog listing rules precede generic `search_word`.
2. Do NOT implement code. Investigation and recommendation only.
3. Write `report.md` and `handoff.md` in your working directory.
