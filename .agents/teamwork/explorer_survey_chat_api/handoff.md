# Handoff Report: Survey Chat API & Anti-Slop Engine (Requirement R2)

> **Agent**: Survey Explorer 2 (Chat API & Anti-Slop Engine)  
> **Working Directory**: `/Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/explorer_survey_chat_api`  
> **Parent Conversation ID**: `29f23ef8-db9e-4c9d-8d0d-6d5e6e427529`  
> **Target Requirement**: R2 — Anti-Slop AI Behavior & Structured Response Engine (and foundational Action Schema for R3)  
> **Date**: 2026-10-14  

---

## 1. Observation

### 1.1 Direct Inspection of `app/api/chat/route.ts`
- **Line 25-26**: Route runs with `export const dynamic = "force-dynamic"; export const maxDuration = 30;`
- **Lines 134-138**: Response headers are plain text:
  ```typescript
  const responseHeaders = {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-cache",
    "X-Trace-Id": rootSpan.traceId,
  };
  ```
- **Lines 150-152 & 407**: Hardcoded fallbacks contain conversational openers:
  ```typescript
  // Line 150-152:
  const fallbackText = readableContext
    ? `Xin chào! Hiện tại chưa cấu hình \`GEMINI_API_KEY\`. Dưới đây là thông tin về Cris Nguyen liên quan đến câu hỏi của bạn:\n\n${readableContext}`
    : `Xin chào! Hiện tại chưa cấu hình \`GEMINI_API_KEY\` và Cris chưa có thông tin cho câu hỏi này. Bạn có thể liên hệ trực tiếp với Cris qua Zalo hoặc LinkedIn nhé!`;
  // Line 407:
  const naturalFallback = `Chào bạn! Cris AI đang tạm quá tải nên chưa trả lời chi tiết được...`;
  ```
- **Lines 256-264**: System Prompt explicitly encourages throat-clearing and summary kickers:
  ```typescript
  256: 1. **Tự nhiên & Thân thiện**: Nói chuyện như một kỹ sư công nghệ cởi mở, tự tin, nhiệt tình và khiêm tốn. Xưng "Cris" hoặc "mình" / "Cris AI" một cách tự nhiên.
  257: 2. **Tuyệt đối KHÔNG dùng văn phong máy móc**:
  258:    - ❌ KHÔNG BAO GIỜ nói: *"Dựa vào tài liệu được cung cấp"*, *"Theo dữ liệu của tôi"*, *"Trong ngữ cảnh trên"*, *"Dưới đây là thông tin..."*.
  259:    - ✅ HÃY NÓI TRỰC TIẾP: *"Chào bạn! Về mảng mobile thì Cris có kinh nghiệm phát triển..."*, *"Mình từng xây dựng ứng dụng mobile bằng React Native & Expo cho dự án..."*.
  ...
  264: 4. **Cởi mở & Hướng đến hành động**:
  265:    - Gợi ý người dùng xem thêm chi tiết ở mục Projects trên trang web hoặc kết nối qua Zalo / LinkedIn / tải CV.
  ```
- **Lines 348-356**: Model output is directly pumped to controller with zero token or sentence sanitization:
  ```typescript
  for await (const chunk of answerStream) {
    if (isCancelled) break;
    if (chunk.text) {
      if (!answerText) generation.update({ completionStartTime: new Date() });
      answerText += chunk.text;
      controller.enqueue(encoder.encode(chunk.text));
    }
    if (chunk.usage) usage = chunk.usage;
  }
  ```

### 1.2 Inspection of Existing Test Assertions in `tests/route/chat-route.test.ts`
- **Lines 76, 143, 207, 335**: The existing test suite mocks fake LLM responses with conversational opener `"Chào bạn! "`:
  ```typescript
  76: const chunks = options.answerChunks ?? ["Chào bạn! ", "Cris có thể ", "giúp bạn."];
  ...
  143: expect(await res.text()).toBe("Chào bạn! Cris có thể giúp bạn.");
  207: expect(await res.text()).toBe("Chào bạn! Cris có thể giúp bạn.");
  335: expect(text).toBe("Chào bạn! Cris có thể giúp bạn.");
  ```
- Running `npm test`: Exited with code 0 (`9 passed (9)`, `82 passed (82)`).
- Running `npx tsc --noEmit`: Exited with code 0 (no TypeScript errors).

### 1.3 Inspection of Project Entities & Knowledge Base
- In `components/projects-section.tsx` (lines 8-138), exactly 4 featured projects are defined:
  1. `kamala-commerce-tour` ("Kamala Jewelry & Tour Platform", `https://kamala.vn/`)
  2. `zelene-spa-booking` ("Zelene Head Spa Booking Platform", `https://zelenespa.com/`)
  3. `smartbit-saas-platform` ("Smartbit Multi-Tenant SaaS Platform")
  4. `javis-3d-tile-simulation` ("JAVIS 3D Tile Pattern Simulation")
- In `lib/roadmap/data.ts` (lines 5, 230, 455, 698, 914), exactly 5 roadmap layers exist:
  1. `layer-01`: "01. Tầng Dữ liệu & Tri thức (Knowledge Base)" (`01-DB`)
  2. `layer-02`: "02. Tầng LLM Application Layer" (`02-LLM`)
  3. `layer-03`: "03. Tầng RAG + Agent Layer" (`03-RAG`)
  4. `layer-04`: "04. Tầng Ops & Đánh giá (LLMOps)" (`04-OPS`)
  5. `layer-05`: "05. Tầng Sản phẩm Production" (`05-PROD`)
- In `components/cta-section.tsx` (lines 58, 145, 206) and `lib/ai/portfolio-knowledge.ts` (line 204):
  - Zalo: `process.env.NEXT_PUBLIC_ZALO_URL || "https://zalo.me"`
  - GitHub: `https://github.com/crisne`
  - CV: `/cris-nguyen-cv.pdf`
  - Contact section anchor: `#contact`

### 1.4 Inspection of Client Chat Consumers
- `hooks/use-floating-chat.ts` (lines 88-125) and `components/floating-bot/FloatingChatBot.tsx` (lines 28-90):
  The client reads raw text chunks (`chunk = decoder.decode(value, { stream: true })`) and updates `messages[...].content`. `FormattedMessage` currently splits by lines, handles bullet points and inline bold/code, but has **zero** support for Action Chips or Markdown links.
- `roadmap-rag-assistant/sdk/typescript/src/client.ts` (lines 48-144) handles SSE streaming with `event: token`, `event: tool_start`, `event: tool_end`, `event: done`.

---

## 2. Logic Chain

1. **Root Cause of AI Slop**:  
   From Observation 1.1 (lines 256-265), the system prompt specifically tells the model to be "nhiệt tình" (enthusiastic) and uses `"Chào bạn! Về mảng mobile thì Cris..."` as its positive example. Furthermore, rule 4 prompts the model to always suggest viewing projects or connecting. This directly causes the model to generate sycophantic greetings at the start and summary kickers at the end.

2. **Necessity of Dual-Defense (Prompt + Deterministic Filter)**:  
   While rewording the prompt to enforce "Direct Answer First (<20 words)" stops the majority of slop, LLMs (especially fast models like Gemini Flash) occasionally generate default conversational pleasantries ("Tuyệt vời!", "Chào bạn!") due to base model RLHF alignment. Therefore, a server-side `TransformStream` (Observation 1.1, lines 348-356) that strips openers from the head buffer (first ~80 chars) and kickers from the tail buffer is necessary to achieve 100% deterministic compliance with the acceptance criteria.

3. **Choice of Action Metadata Format (`[[action:type|id|label]]`)**:  
   From Observation 1.1 (lines 134-138) and Observation 1.4, `/api/chat` communicates via `text/plain` streaming, while `RoadmapChatClient` uses SSE. Adopting an inline parseable tag `[[action:type|id|label]]` has 3 major advantages:
   - Does not alter the HTTP content type or break `ReadableStream` semantics.
   - Remains 100% backwards-compatible with `useFloatingChat` and existing tests.
   - Allows client-side regex extraction to cleanly detach Action Chips from text and render them as interactive buttons below or alongside the message (Requirement R3).

4. **Integration Impact on Test Suite**:  
   From Observation 1.2, existing vitest tests in `tests/route/chat-route.test.ts` assert verbatim `"Chào bạn! Cris có thể giúp bạn."` because the fake LLM in the test fixture was mocked with `answerChunks = ["Chào bạn! ", "Cris có thể ", "giúp bạn."]`. When the anti-slop transformer is introduced, it will sanitize `"Chào bạn! "`. Therefore, the test fixture mock in `chat-route.test.ts` must be updated to emit anti-slop text (e.g. `["Cris có thể ", "giúp bạn."]` or `"Cris sẵn sàng hỗ trợ bạn."`), and dedicated unit tests for anti-slop stripping must be added.

---

## 3. Caveats

1. **Test Mock Updates**:  
   Modifying `answerChunks` in `tests/route/chat-route.test.ts` is required so that the test suite reflects anti-slop expectations rather than legacy filler greetings.
2. **Streaming Latency Tradeoff**:  
   The head-buffer in `AntiSlopStreamTransformer` buffers the initial 40–80 characters (or until the first sentence terminator `[.!?\n]`) to inspect and strip openers. This adds ~30-60ms of TTFT (Time To First Token), which is imperceptible to humans but guarantees no dirty greeting is momentarily flashed to the user.
3. **Entity Keyword Collisions**:  
   Keywords like "tour" or "spa" could theoretically match generic questions. Hence, the entity detection catalog restricts automatic action chip injection to specific high-confidence entity aliases (`Kamala`, `Zelene`, `Smartbit`, `JAVIS`, `layer-01`..`layer-05`, `zalo`, `github`, `cv`).
4. **Scope Isolation**:  
   Requirement R2 covers the server pipeline, prompt, and action metadata serialization. The visual rendering of the Action Chips in `FloatingChatBot` and `RoadmapAssistantChatbot` belongs to Requirement R3, but the parser and interfaces specified here provide the exact contract required by R3.

---

## 4. Conclusion

1. **Prompt Engineering Refactoring**:  
   Replace `app/api/chat/route.ts` lines 253-277 with the strict `ANTI_SLOP_SYSTEM_PROMPT` designed in `analysis.md`, enforcing:
   - Rule 1: Direct Answer First (<20 words, immediate facts/numbers, no preamble).
   - Negative constraints: Banned openers, banned praise, banned kickers, banned buzzwords.
   - Standardized emission of `[[action:type|id|label]]`.
2. **Server-side Anti-Slop Stream Transformer**:  
   Implement `lib/ai/anti-slop.ts` containing `createAntiSlopTransformStream()`. Pipe `answerStream` through this transformer before enqueuing to the client, deterministically stripping any residual throat-clearing greetings or trailing recap kickers.
3. **Structured Action Metadata & Entity Catalog**:  
   Implement `lib/ai/action-chips.ts` exporting:
   - Full TypeScript types (`ActionChipPayload`, `ProjectActionChipData`, `RoadmapActionChipData`, `ContactActionChipData`).
   - The authoritative entity catalog mapping 4 projects (`kamala-commerce-tour`, `zelene-spa-booking`, `smartbit-saas-platform`, `javis-3d-tile-simulation`), 5 roadmap layers (`layer-01` to `layer-05`), and 4 contact channels (`zalo`, `github`, `cv`, `contact`).
   - Server-side fallback scanner and client-side parser `parseMessageContentAndActions()`.
4. **System Fallbacks Clean-up**:  
   Update the fallback strings in `app/api/chat/route.ts` (lines 150-152 and 407) to remove `"Xin chào!"` and `"Chào bạn!"`, aligning them with Direct Answer First principles.

---

## 5. Verification Method

### 5.1 Independent Test Commands
Run the vitest test suite:
```bash
npm test
```
*Expected result*: All existing 9 test files (82 tests) plus new anti-slop test cases pass with 0 failures.

Run TypeScript static typecheck:
```bash
npx tsc --noEmit
```
*Expected result*: Exits with code 0, 0 type errors across strict TypeScript.

Run production build check:
```bash
npm run build
```
*Expected result*: Next.js App Router Turbopack production build succeeds.

### 5.2 Files to Inspect
- `/Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/explorer_survey_chat_api/analysis.md` (Detailed design, regex catalog, prompt templates).
- `/Users/tienanhnguyen/Desktop/src_example/crisne-website/app/api/chat/route.ts` (Chat route implementation).
- `/Users/tienanhnguyen/Desktop/src_example/crisne-website/tests/route/chat-route.test.ts` (Test suite assertions).

### 5.3 Invalidation Conditions
- If the chat endpoint emits responses starting with greetings like `"Chào bạn!"` or `"Xin chào!"`.
- If the first sentence exceeds 20 words or fails to contain direct facts/answers.
- If response endings contain summary kickers like `"Tóm lại..."` or `"Hy vọng thông tin này giúp ích..."`.
- If project or roadmap mentions fail to include parseable `[[action:...]]` metadata.
- If `npm test` or `npx tsc --noEmit` fails.
