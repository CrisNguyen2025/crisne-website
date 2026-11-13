# Dispatch Task: Fix Strategy for Progress Regex Blindspots & CUD Verb Lexicon (Explorer 2)

## Objective
Analyze challenger_2's empirical finding on word-order blindspots in `lesson_status.py` and missing `"đánh dấu"` in `CUD_VERB_WORDS`. Recommend concrete fix specifications for `knowledge-sub-intents-design.md`.

## Inputs & Evidence
- Challenger 2 Report: `/Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/challenger_2/report.md`
- Challenger 2 Handoff: `/Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/challenger_2/handoff.md`
- Current Design Doc: `/Users/tienanhnguyen/Desktop/src_example/crisne-website/roadmap-rag-assistant/docs/knowledge-sub-intents-design.md`
- Original Request: `/Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/ORIGINAL_REQUEST.md`

## Problem Statement
1. Progress queries with natural Vietnamese word order (e.g. `"Hôm nay tôi nên học bài gì tiếp theo?"`, `"Tôi đang học những bài nào trong topic RAG"`) miss current regexes in `lesson_status.py`, falling through to Vector RAG.
2. In Phase 3, when moving `handle_lesson_status` behind the router, status mutation commands (e.g. `"đánh dấu bài Docker là đã học"`) return `intent: None` because `"đánh dấu"` is missing from `CUD_VERB_WORDS`.

## Instructions
1. Formulate exact fix recommendations to update in the Design Doc:
   - Provide enhanced regexes / semantic matcher patterns for ADR-0010 progress queries covering flexible word orders.
   - Specify adding `"đánh dấu"` to `CUD_VERB_WORDS` in router vocabulary and policy for status mutations under `ROADMAP_CUD`.
2. Do NOT implement code. Investigation and recommendation only.
3. Write `report.md` and `handoff.md` in your working directory.

## 2026-11-10T10:11:52Z
From: 88cff40c-5d96-4718-b370-cc0b520b35d9
Message:
You are explorer_retry_regex_cud, a teamwork_explorer subagent.
Your working directory is: /Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/explorer_retry_regex_cud/
Original user request path: /Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/ORIGINAL_REQUEST.md
Your task dispatch instructions are located at: /Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/explorer_retry_regex_cud/DISPATCH.md

You MUST read /Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/ORIGINAL_REQUEST.md before starting work.
Analyze challenger_2's empirical finding on word-order blindspots in lesson_status.py and missing "đánh dấu" in CUD_VERB_WORDS.
Read challenger_2's report: /Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/challenger_2/report.md
Recommend concrete fix specifications for roadmap-rag-assistant/docs/knowledge-sub-intents-design.md:
1. Provide enhanced regexes / semantic matcher patterns for ADR-0010 progress queries covering flexible word orders.
2. Specify adding "đánh dấu" to CUD_VERB_WORDS in router vocabulary and policy for status mutations under ROADMAP_CUD.
Strictly read-only investigation. Write report.md and handoff.md in your working directory.
Communicate back via send_message when done.
