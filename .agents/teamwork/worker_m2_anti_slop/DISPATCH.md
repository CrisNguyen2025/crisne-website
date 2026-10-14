## 2026-10-14T09:41:14Z
You are the Implementer Worker for Milestone 2: Anti-Slop AI Engine & Action Metadata Backend.
Your working directory is: /Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/worker_m2_anti_slop
Project root: /Users/tienanhnguyen/Desktop/src_example/crisne-website
Authoritative User Request: /Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/ORIGINAL_REQUEST.md
Project Blueprint: /Users/tienanhnguyen/Desktop/src_example/crisne-website/PROJECT.md
Survey Analysis: /Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/explorer_survey_chat_api/analysis.md
Survey Handoff: /Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/explorer_survey_chat_api/handoff.md

You MUST read ORIGINAL_REQUEST.md, PROJECT.md, and the Survey reports before starting work.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

File Ownership:
You have exclusive write ownership of:
- `lib/ai/anti-slop.ts`
- `lib/ai/action-chips.ts`
- `app/api/chat/route.ts`
- `tests/route/chat-route.test.ts`
- `tests/unit/anti-slop.test.ts`
- `tests/unit/action-chips.test.ts`
Do NOT edit files outside this scope.

Objectives:
1. Create `lib/ai/action-chips.ts`:
   - Export interfaces: `ChatActionChip`, `ParsedMessageResult`, `ActionChipType`.
   - Build authoritative entity catalog mapping 4 projects (`kamala-commerce-tour`, `zelene-spa-booking`, `smartbit-saas-platform`, `javis-3d-tile-simulation`), 5 roadmap layers (`layer-01` to `layer-05`), and 4 contact channels (`zalo`, `github`, `cv`, `contact`).
   - Implement `formatActionChip(type, id, label)` emitting `[[action:type|id|label]]`.
   - Implement `parseMessageContentAndActions(rawText)` parsing inline tags and returning `{ cleanContent, actionChips }`.
   - Implement entity recognition scanner to detect project/layer mentions and append action chips if not explicitly tagged.
2. Create `lib/ai/anti-slop.ts`:
   - Implement `createAntiSlopTransformStream()` using `TransformStream`.
   - Implement dual-defense streaming sanitization:
     - Head-buffer (~80 chars or first sentence) to detect and strip conversational filler/openers (e.g. 'Chào bạn!', 'Xin chào!', 'Tuyệt vời!', 'Chào mừng...', 'Rất vui...', 'Great question!', etc.).
     - Enforce "Direct Answer First": First sentence must give direct answer within 20 words.
     - Tail-buffer sanitization to strip summary/recap kickers (e.g. 'Tóm lại...', 'Hy vọng câu trả lời...', 'Hope this helps...', 'In conclusion...', etc.).
     - Strip sycophantic praise.
3. Update `app/api/chat/route.ts`:
   - Implement strict `ANTI_SLOP_SYSTEM_PROMPT` enforcing:
     - Direct Answer First rule (<20 words, immediate facts/numbers).
     - Strict prohibition of openers, praise, and summary kickers.
     - Structured action chip instructions (`[[action:type|id|label]]`).
   - Pipe the LLM answer stream through `createAntiSlopTransformStream()`.
   - Sanitize fallback strings (lines 150-152, 407) to remove legacy conversational greetings ('Xin chào!', 'Chào bạn!').
4. Update `tests/route/chat-route.test.ts`:
   - Update mock LLM chunks from legacy `"Chào bạn! Cris có thể giúp bạn."` to anti-slop text (`"Cris có thể giúp bạn."` or `"Cris hỗ trợ tư vấn kiến trúc phần mềm và AI RAG."`).
   - Ensure all 9 test cases in `chat-route.test.ts` pass cleanly with anti-slop expectations.
5. Verification:
   - Run `npx vitest run tests/e2e/tier1-r2-anti-slop.test.ts`.
   - Run `npx vitest run tests/route/chat-route.test.ts`.
   - Run `npx tsc --noEmit`.
   - Run `npm test`.
6. Write detailed `handoff.md` and `progress.md` in your working directory and notify the orchestrator via `send_message`.
