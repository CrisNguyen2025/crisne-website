# Dispatch Task: Fix Strategy for False Friends & Ambiguity Matrix (Explorer 3)

## Objective
Analyze challenger_2's empirical finding on false-friend collisions (e.g. non-roadmap `"tiến độ"`, generic search with `"mấy bài"`, and safe accessor usage for `None` sub-intents). Recommend concrete fix specifications for `knowledge-sub-intents-design.md`.

## Inputs & Evidence
- Challenger 2 Report: `/Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/challenger_2/report.md`
- Challenger 1 Report: `/Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/challenger_1/report.md`
- Current Design Doc: `/Users/tienanhnguyen/Desktop/src_example/crisne-website/roadmap-rag-assistant/docs/knowledge-sub-intents-design.md`
- Original Request: `/Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/ORIGINAL_REQUEST.md`

## Problem Statement
1. Queries like *"tiến độ giải ngân vốn đầu tư công"* contain `"tiến độ"` but are `OUT_OF_SCOPE`. Without early Target/Scope grounding, they could falsely trigger `LEARNING_PROGRESS`.
2. Queries like *"tìm giúp mấy bài về authentication"* contain `"mấy bài"` but are content searches, not structural catalog queries.
3. Challenger 1 noted `intent_res.sub_intent.value` raises `AttributeError` when `sub_intent` is None.

## Instructions
1. Formulate exact fix recommendations to update in the Design Doc:
   - Expand the Ambiguity Matrix with explicit false-friend entries and multi-phase resolution criteria (P3 Target must be ROADMAP, P4 Scope must be within domain before sub-intent triggers).
   - Document safe sub-intent access patterns in downstream guidelines.
2. Do NOT implement code. Investigation and recommendation only.
3. Write `report.md` and `handoff.md` in your working directory.


## 2026-11-10T10:11:57Z
You are explorer_retry_false_friends, a teamwork_explorer subagent.
Your working directory is: /Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/explorer_retry_false_friends/
Original user request path: /Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/ORIGINAL_REQUEST.md
Your task dispatch instructions are located at: /Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/explorer_retry_false_friends/DISPATCH.md

You MUST read /Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/ORIGINAL_REQUEST.md before starting work.
Analyze challenger_2's empirical finding on false-friend collisions (non-roadmap "tiến độ", generic search with "mấy bài") and challenger_1's finding on safe sub_intent access.
Read challenger_2's report: /Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/challenger_2/report.md
Read challenger_1's report: /Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/challenger_1/report.md
Recommend concrete fix specifications for roadmap-rag-assistant/docs/knowledge-sub-intents-design.md:
1. Expand the Ambiguity Matrix with explicit false-friend entries and multi-phase resolution criteria (P3 Target must be ROADMAP, P4 Scope must be in domain before sub-intent triggers).
2. Document safe sub-intent access patterns in downstream guidelines.
Strictly read-only investigation. Write report.md and handoff.md in your working directory.
Communicate back via send_message when done.
