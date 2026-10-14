# Progress - Milestone 2 Remediation

Last visited: 2026-10-14T10:21:45Z

## Status: COMPLETE

### Completed Steps:
1. Fixed Critical ReDoS Vulnerability in `SUMMARY_RECAP_KICKERS` (`lib/ai/anti-slop.ts`) by replacing `(?:\n\s*|\s+)*` with sentence-boundary lookbehind `(?<=^|[\r\n]+|[.!?]\s*)\s*`. Verified arbitrary whitespace sequences execute in < 0.5 ms without exponential backtracking.
2. Fixed False Positive Mid-Sentence Truncation (`lib/ai/anti-slop.ts`): Ensured kickers like `"nhìn chung,"`, `"overall,"`, and code comments are only treated as kickers when starting a line or following a sentence terminator (`.!?`).
3. Refined `findKickerSplitIndex` in `lib/ai/anti-slop.ts`: Only trigger kicker splitting if the trigger word (or partial tail) is preceded by `^`, `\n`, or a sentence terminator `[.!?]`. Eliminates stream token stall.
4. Fixed `buildAntiSlopSystemPrompt` in `app/api/chat/route.ts`: Used `ANTI_SLOP_SYSTEM_PROMPT.replace("{RAG_CONTEXT}", () => context)` to prevent `$` in RAG context from corrupting the prompt.
5. Minor polish:
   - Handled `"Rất vui được hỗ trợ!"` without mandatory trailing space in `lib/ai/anti-slop.ts`.
   - Handled compound meta-discourse `"Dựa vào tài liệu được cung cấp ở trên"` and colons in delimiters.
   - In `isDirectAnswerCompliant`, stripped trailing and tag-orphaned punctuation before word counting.
6. Verification:
   - `npx vitest run tests/e2e/tier1-r2-anti-slop.test.ts`: 20/20 PASS
   - `npx vitest run tests/unit/anti-slop.test.ts tests/unit/m2-challenger-stress.test.ts`: 54/54 PASS
   - `npx vitest run tests/route/chat-route.test.ts`: 25/25 PASS
   - `npx tsc --noEmit`: 0 errors
   - `npm test`: 290/290 passed (8 skipped)
   - `npm run build`: Production Turbopack build succeeded with 42/42 static routes.
