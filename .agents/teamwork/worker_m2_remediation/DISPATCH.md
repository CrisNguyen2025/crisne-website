## 2026-10-14T10:10:06Z
You are the Remediation Worker for Milestone 2 (Anti-Slop AI Engine & Action Metadata Backend).
Your working directory is: /Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/worker_m2_remediation
Project root: /Users/tienanhnguyen/Desktop/src_example/crisne-website
Authoritative User Request: /Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/ORIGINAL_REQUEST.md
Project Blueprint: /Users/tienanhnguyen/Desktop/src_example/crisne-website/PROJECT.md
Challenger 1 Evidence: /Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/challenger_m2_1/handoff.md
Auditor Report: /Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/auditor_m2_1/handoff.md

You MUST read ORIGINAL_REQUEST.md, PROJECT.md, and Challenger 1's report before starting work.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

File Ownership:
You have exclusive write ownership of:
- `lib/ai/anti-slop.ts`
- `app/api/chat/route.ts`
- `tests/unit/anti-slop.test.ts`
- `tests/unit/m2-challenger-stress.test.ts`
Do NOT edit files outside this scope.

Objectives:
1. Fix Critical ReDoS Vulnerability in `SUMMARY_RECAP_KICKERS` (`lib/ai/anti-slop.ts`):
   - Replace the catastrophic backtracking quantifier `(?:\n\s*|\s+)*` with a non-backtracking sentence/line boundary: `(?:^|[\r\n]+|[.!?]\s+)\s*`.
   - Verify that arbitrary whitespace sequences (e.g. `"Cris " + " \n ".repeat(20) + "abc"`) execute in < 1 ms without exponential backtracking.
2. Fix False Positive Mid-Sentence Truncation (`lib/ai/anti-slop.ts`):
   - Ensure kickers like "nhìn chung," and "overall," are only treated as kickers when starting a line or following a sentence terminator (`.!?`).
   - Mid-sentence usages (e.g. `"Dự án này nhìn chung, được chia làm 3 phần..."`, `"The overall, design is good."`, or code block comments `// in summary: ...`) MUST NOT be truncated.
3. Refine `findKickerSplitIndex` in `lib/ai/anti-slop.ts`:
   - Only trigger kicker splitting if the trigger word is preceded by `^`, `\n`, or a sentence terminator `[.!?]`.
4. Fix `buildAntiSlopSystemPrompt` in `app/api/chat/route.ts`:
   - Use `replace("{RAG_CONTEXT}", () => ragContext)` to prevent `$` in RAG context from corrupting the prompt.
5. Minor polish:
   - Handle `"Rất vui được hỗ trợ!"` without mandatory trailing space in `lib/ai/anti-slop.ts`.
   - In `isDirectAnswerCompliant`, strip trailing punctuation before word counting.
6. Verification:
   - Run `npx vitest run tests/e2e/tier1-r2-anti-slop.test.ts`.
   - Run `npx vitest run tests/unit/anti-slop.test.ts tests/unit/m2-challenger-stress.test.ts`.
   - Run `npx vitest run tests/route/chat-route.test.ts`.
   - Run `npx tsc --noEmit`.
   - Run `npm test`.
7. Write `handoff.md` and `progress.md` in your working directory and notify the orchestrator.
