# Dispatch Task: Empirical Adversarial Challenge — Boundary Collision & Ambiguity (Challenger 2)

## Objective
Empirically stress-test the boundary decision criteria, 18 typical query examples, and 5 ambiguity pairs documented in:
`/Users/tienanhnguyen/Desktop/src_example/crisne-website/roadmap-rag-assistant/docs/knowledge-sub-intents-design.md`

## Reference Inputs
- Original Request: `/Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/ORIGINAL_REQUEST.md`
- Scope Document: `/Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/orchestrator/PROJECT.md`
- Design Document: `/Users/tienanhnguyen/Desktop/src_example/crisne-website/roadmap-rag-assistant/docs/knowledge-sub-intents-design.md`

## Challenge Instructions
1. Inspect the decision boundaries, 18 query examples, and 5-pair ambiguity matrix in Sections 4.3 and 4.4 of the design document.
2. In your working directory (e.g. `/Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/challenger_2/`), write an empirical test harness:
   - Implement the disambiguation heuristic classifier logic described in the design doc.
   - Run the 18 typical query examples through the logic and check classification consistency.
   - Run adversarial / borderline queries (e.g. mixed queries, zero-hit queries, multi-intent sentences).
   - Check if any query produces unexpected collisions, unhandled edge cases, or leaks Owner-only data.
3. Verify that zero files in `rag_service/domains/roadmap/router/` or `evals/router/` are modified.
4. Output your verdict as **APPROVE** (boundaries empirically robust) or **REJECT / REQUEST_CHANGES** (boundary collisions found) in `handoff.md` and message.
5. Write `report.md` and `handoff.md` in your working directory. Notify orchestrator via `send_message`.
