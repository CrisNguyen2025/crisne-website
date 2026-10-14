import { NextRequest, after } from "next/server";
import {
  propagateAttributes,
  startObservation,
  type LangfuseGeneration,
  type LangfuseSpan,
} from "@langfuse/tracing";
import {
  findRelevantChunks,
  buildRAGContext,
  rewriteQuery,
  shouldRewriteQuery,
  type ScoredChunk,
} from "@/lib/ai/rag-engine";
import { DEFAULT_CHAT_MODEL, DEFAULT_EMBEDDING_MODEL } from "@/lib/ai/gemini";
import { getLlmProvider, type LlmMessage, type LlmUsage } from "@/lib/ai/llm-provider";
import { classifyLlmError } from "@/lib/ai/llm-errors";
import { CHAT_OBSERVATION, CHAT_TRACE_NAME, RETRIEVAL_TOP_K } from "@/lib/ai/chat-config";
import { flushLangfuse } from "@/lib/ai/langfuse";
import { checkRateLimit } from "@/lib/rate-limit";
import { loadKnowledgeBase } from "@/lib/ai/knowledge-base";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Input caps: bound prompt size (and Gemini cost) per request
const MAX_MESSAGE_LENGTH = 1000;
const MAX_HISTORY_TURNS = 6;
const MAX_HISTORY_CONTENT_LENGTH = 2000;
const MAX_SESSION_ID_LENGTH = 200;

interface ChatRequestPayload {
  message: string;
  // Client-generated id grouping all turns of one conversation in Langfuse
  sessionId?: string;
  history?: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
}

const jsonError = (error: string, status: number) =>
  new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const textStream = (text: string) =>
  new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });

// Shown to visitors, so present chunks as plain sections instead of the prompt format
const toReadableContext = (chunks: ScoredChunk[]) =>
  chunks.map((chunk) => `**${chunk.title}**\n${chunk.content}`).join("\n\n");

const toUsageDetails = (usage?: LlmUsage) =>
  usage ? { input: usage.input, output: usage.output, total: usage.total } : undefined;

export async function POST(req: NextRequest) {
  // Root observation of the Langfuse trace; ended when the response (or stream) finishes
  let traceSpan: LangfuseSpan | undefined;
  // Runs after the response (including the stream) has finished
  after(flushLangfuse);

  // Public endpoint backed by Gemini quota
  const rateLimit = checkRateLimit(req, { key: "chat", limit: 20, windowMs: 5 * 60_000 });
  if (!rateLimit.isAllowed) {
    return new Response(
      JSON.stringify({ error: "Bạn hỏi hơi nhanh rồi, thử lại sau ít phút nhé!" }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(rateLimit.retryAfterSeconds),
        },
      }
    );
  }

  let body: ChatRequestPayload;
  try {
    body = (await req.json()) as ChatRequestPayload;
  } catch {
    return jsonError("Yêu cầu không hợp lệ.", 400);
  }

  try {
    const { message, sessionId } = body;

    if (!message || typeof message !== "string" || !message.trim()) {
      return jsonError("Vui lòng nhập nội dung câu hỏi.", 400);
    }

    if (message.length > MAX_MESSAGE_LENGTH) {
      return jsonError(
        `Câu hỏi hơi dài, bạn rút gọn dưới ${MAX_MESSAGE_LENGTH} ký tự giúp Cris nhé!`,
        400
      );
    }

    // Keep only well-formed recent turns, truncated, so clients cannot inflate the prompt
    const history = (Array.isArray(body.history) ? body.history : [])
      .filter(
        (h) => (h?.role === "user" || h?.role === "assistant") && typeof h.content === "string"
      )
      .slice(-MAX_HISTORY_TURNS)
      .map((h) => ({ role: h.role, content: h.content.slice(0, MAX_HISTORY_CONTENT_LENGTH) }));

    const trimmedQuery = message.trim();
    const isValidSessionId =
      typeof sessionId === "string" &&
      sessionId.length > 0 &&
      sessionId.length <= MAX_SESSION_ID_LENGTH;

    // traceName / sessionId on every observation of the request, not only the root
    return await propagateAttributes(
      {
        traceName: CHAT_TRACE_NAME,
        ...(isValidSessionId ? { sessionId } : {}),
      },
      async () => {
        const rootSpan = startObservation(CHAT_TRACE_NAME, {
          input: { message: trimmedQuery, historyLength: history.length },
        });
        traceSpan = rootSpan;

        // Lets the client attach 👍/👎 feedback to this trace
        const responseHeaders = {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-cache",
          "X-Trace-Id": rootSpan.traceId,
        };
        const apiKey = (process.env.GEMINI_API_KEY || "").trim();
        const isApiKeyConfigured =
          apiKey.length > 10 && !apiKey.includes("your_google_gemini_api_key");

        const knowledgeBase = loadKnowledgeBase();

        // Fallback if API key is not configured (keyword-only retrieval)
        if (!isApiKeyConfigured) {
          const readableContext = toReadableContext(
            findRelevantChunks(trimmedQuery, null, knowledgeBase, RETRIEVAL_TOP_K)
          );
          const fallbackText = readableContext
            ? `Xin chào! Hiện tại chưa cấu hình \`GEMINI_API_KEY\`. Dưới đây là thông tin về Cris Nguyen liên quan đến câu hỏi của bạn:\n\n${readableContext}`
            : `Xin chào! Hiện tại chưa cấu hình \`GEMINI_API_KEY\` và Cris chưa có thông tin cho câu hỏi này. Bạn có thể liên hệ trực tiếp với Cris qua Zalo hoặc LinkedIn nhé!`;
          rootSpan
            .update({
              output: fallbackText,
              level: "WARNING",
              statusMessage: "missing-api-key",
              metadata: { fallback: "missing-api-key", hasContext: !!readableContext },
            })
            .end();

          return new Response(textStream(fallbackText), { headers: responseHeaders });
        }

        const llm = getLlmProvider();

        // 1. Rewrite follow-up questions into standalone queries (only when there is history)
        let retrievalQuery = trimmedQuery;
        if (shouldRewriteQuery(history)) {
          const rewriteGeneration = rootSpan.startObservation(
            CHAT_OBSERVATION.rewrite,
            { model: DEFAULT_CHAT_MODEL, input: { query: trimmedQuery, history } },
            { asType: "generation" }
          );
          const rewrite = await rewriteQuery(trimmedQuery, history);
          retrievalQuery = rewrite.query;
          rewriteGeneration
            .update({
              output: rewrite.query,
              usageDetails: toUsageDetails(rewrite.usage),
              metadata: { isRewritten: rewrite.query !== trimmedQuery },
              // Retrieval still runs with the original query, so this is degraded, not failed
              ...(rewrite.errorKind
                ? { level: "WARNING" as const, statusMessage: `rewrite-fallback-${rewrite.errorKind}` }
                : {}),
            })
            .end();
        }

        // 2. Hybrid search (vector + keyword)
        const embedSpan = rootSpan.startObservation(
          CHAT_OBSERVATION.embed,
          { model: DEFAULT_EMBEDDING_MODEL, input: retrievalQuery },
          { asType: "embedding" }
        );
        let queryEmbedding: number[] | null = null;
        try {
          queryEmbedding = await llm.embed(retrievalQuery, "RETRIEVAL_QUERY");
          embedSpan.update({ output: { dimension: queryEmbedding?.length ?? 0 } });
        } catch (embedError) {
          console.error("Query embedding error:", embedError);
          // Retrieval falls back to keyword-only scoring
          embedSpan.update({
            level: "WARNING",
            statusMessage: `embed-fallback-${classifyLlmError(embedError)}`,
          });
        }
        embedSpan.end();

        const retrieveSpan = rootSpan.startObservation(
          CHAT_OBSERVATION.retrieve,
          { input: retrievalQuery },
          { asType: "retriever" }
        );
        const relevantChunks = findRelevantChunks(
          retrievalQuery,
          queryEmbedding,
          knowledgeBase,
          RETRIEVAL_TOP_K
        );
        const ragContext = buildRAGContext(relevantChunks);
        retrieveSpan
          .update({
            output: relevantChunks.map(({ id, score, vectorScore, keywordScore }) => ({
              id,
              score,
              vectorScore,
              keywordScore,
            })),
            metadata: { mode: queryEmbedding ? "hybrid" : "keyword-only" },
            // Empty context = KB cannot answer; filter these to find missing knowledge
            level: relevantChunks.length === 0 ? "WARNING" : "DEFAULT",
            statusMessage: relevantChunks.length === 0 ? "no-context" : undefined,
          })
          .end();

        // 3. Ultra-refined Persona & System Prompt for Natural, Human-like Voice
        const systemPrompt = `
Bạn là **Cris AI** — Trợ lý ảo thông minh và là "Digital Twin" đại diện cho **Cris Nguyen** (Software Engineer / Frontend Developer FE Strong với hơn 5 năm kinh nghiệm).

### 🌟 NGUYÊN TẮC GIAO TIẾP (TONE OF VOICE):
1. **Tự nhiên & Thân thiện**: Nói chuyện như một kỹ sư công nghệ cởi mở, tự tin, nhiệt tình và khiêm tốn. Xưng "Cris" hoặc "mình" / "Cris AI" một cách tự nhiên.
2. **Tuyệt đối KHÔNG dùng văn phong máy móc**:
   - ❌ KHÔNG BAO GIỜ nói: *"Dựa vào tài liệu được cung cấp"*, *"Theo dữ liệu của tôi"*, *"Trong ngữ cảnh trên"*, *"Dưới đây là thông tin..."*.
   - ✅ HÃY NÓI TRỰC TIẾP: *"Chào bạn! Về mảng mobile thì Cris có kinh nghiệm phát triển..."*, *"Mình từng xây dựng ứng dụng mobile bằng React Native & Expo cho dự án..."*.
3. **Chính xác & Trực diện**:
   - Trả lời thẳng vào câu hỏi, nêu tên dự án / công ty / công nghệ cụ thể có trong phần THÔNG TIN bên dưới.
   - In đậm các từ khóa công nghệ (ví dụ **Next.js**, **TypeScript**, **React Native**).
4. **Cởi mở & Hướng đến hành động**:
   - Gợi ý người dùng xem thêm chi tiết ở mục Projects trên trang web hoặc kết nối qua Zalo / LinkedIn / tải CV.
5. **Ngôn ngữ**: Trả lời bằng ngôn ngữ câu hỏi của người dùng (Tiếng Việt tự nhiên hoặc Tiếng Anh chuyên nghiệp).

### 🔒 NGUYÊN TẮC DỮ KIỆN (BẮT BUỘC):
- Mọi dữ kiện về Cris (dự án, công ty, thời gian, công nghệ, con số, liên hệ) CHỈ được lấy từ phần THÔNG TIN bên dưới. Không suy đoán, không bịa thêm.
- Nếu phần THÔNG TIN trống hoặc không chứa câu trả lời: nói tự nhiên rằng Cris chưa có thông tin về vấn đề này, rồi gợi ý người dùng hỏi về kinh nghiệm / dự án / kỹ năng của Cris hoặc liên hệ trực tiếp.
- Không khẳng định phủ định (ví dụ "Cris chưa từng làm ở X") khi THÔNG TIN không nói rõ điều đó — hãy nói là chưa có thông tin.
- Với câu hỏi không liên quan đến Cris (nấu ăn, giá coin, kiến thức chung...): lịch sự từ chối và quay về chủ đề Cris.

---
### 📚 [THÔNG TIN & KINH NGHIỆM THỰC TẾ CỦA CRIS NGUYEN]:
${ragContext || "(Không có thông tin liên quan đến câu hỏi này.)"}
`.trim();

        // 4. Stream the answer
        let answerGeneration: LangfuseGeneration | undefined;
        try {
          // Gemini expects conversation to start with a user turn and alternate roles
          const contents: LlmMessage[] = [];
          for (const h of history) {
            const text = h.content?.trim();
            if (!text) continue;

            const role = h.role === "assistant" ? "model" : "user";
            if (contents.length === 0 && role === "model") continue;

            const last = contents[contents.length - 1];
            if (last && last.role === role) {
              last.parts.push({ text });
            } else {
              contents.push({ role, parts: [{ text }] });
            }
          }

          const lastTurn = contents[contents.length - 1];
          if (lastTurn && lastTurn.role === "user") {
            lastTurn.parts.push({ text: trimmedQuery });
          } else {
            contents.push({ role: "user", parts: [{ text: trimmedQuery }] });
          }

          const generationConfig = {
            temperature: 0.3,
            topP: 0.9,
            maxOutputTokens: 1000,
          };
          answerGeneration = rootSpan.startObservation(
            CHAT_OBSERVATION.answer,
            {
              model: DEFAULT_CHAT_MODEL,
              modelParameters: generationConfig,
              input: { systemPrompt, contents },
              metadata: { hasContext: !!ragContext },
            },
            { asType: "generation" }
          );

          const answerStream = await llm.generateStream({
            model: DEFAULT_CHAT_MODEL,
            systemInstruction: systemPrompt,
            contents,
            ...generationConfig,
          });

          const generation = answerGeneration;
          const encoder = new TextEncoder();
          // Set when the client disconnects (stop button, closed tab): the controller can no
          // longer be written to, and we stop pulling tokens from the model
          let isCancelled = false;
          const stream = new ReadableStream({
            async start(controller) {
              let answerText = "";
              let usage: LlmUsage | undefined;
              let streamErrorKind: string | undefined;
              try {
                for await (const chunk of answerStream) {
                  if (isCancelled) break;
                  if (chunk.text) {
                    if (!answerText) generation.update({ completionStartTime: new Date() });
                    answerText += chunk.text;
                    controller.enqueue(encoder.encode(chunk.text));
                  }
                  if (chunk.usage) usage = chunk.usage;
                }
              } catch (streamError) {
                if (!isCancelled) {
                  console.error("Stream chunk error:", streamError);
                  streamErrorKind = classifyLlmError(streamError);
                  generation.update({
                    level: "ERROR",
                    statusMessage: `stream-error-${streamErrorKind}`,
                  });
                  controller.enqueue(
                    encoder.encode("\n\n_(Kết nối bị gián đoạn, bạn thử hỏi lại giúp Cris nhé!)_")
                  );
                }
              } finally {
                // End spans before closing so a closed/cancelled controller can never skip them
                generation
                  .update({ output: answerText, usageDetails: toUsageDetails(usage) })
                  .end();
                let rootStatusMessage: string | undefined;
                if (streamErrorKind) rootStatusMessage = `stream-error-${streamErrorKind}`;
                else if (isCancelled) rootStatusMessage = "cancelled";
                rootSpan
                  .update({
                    output: answerText,
                    level: streamErrorKind ? "ERROR" : "DEFAULT",
                    statusMessage: rootStatusMessage,
                    metadata: { hasContext: !!ragContext, isCancelled },
                  })
                  .end();
                if (!isCancelled) controller.close();
              }
            },
            cancel() {
              isCancelled = true;
            },
          });

          return new Response(stream, { headers: responseHeaders });
        } catch (llmError: unknown) {
          const errorKind = classifyLlmError(llmError);
          console.error(`LLM call error (${errorKind}):`, llmError);
          answerGeneration
            ?.update({ level: "ERROR", statusMessage: `llm-error-${errorKind}` })
            .end();

          // Graceful natural fallback if the model is unavailable (quota, outage, ...)
          const readableContext = toReadableContext(relevantChunks);
          const naturalFallback = `Chào bạn! Cris AI đang tạm quá tải nên chưa trả lời chi tiết được. ${readableContext ? `Dưới đây là thông tin liên quan về Cris Nguyen:\n\n${readableContext}\n\n` : "Cris chưa có thông tin cho câu hỏi này. "}Bạn có thể kết nối trực tiếp với Cris qua Zalo hoặc thử hỏi lại sau ít phút nhé!`;
          rootSpan
            .update({
              output: naturalFallback,
              level: "ERROR",
              statusMessage: `llm-error-${errorKind}`,
              metadata: { fallback: `llm-error-${errorKind}`, hasContext: !!ragContext },
            })
            .end();

          return new Response(textStream(naturalFallback), { headers: responseHeaders });
        }
      }
    );
  } catch (error) {
    console.error("Chat API Fatal Error:", error);
    traceSpan?.update({ level: "ERROR", statusMessage: String(error) }).end();
    return jsonError("Đã có lỗi xảy ra khi xử lý câu hỏi. Vui lòng thử lại sau.", 500);
  }
}
