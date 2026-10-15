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
import { DEFAULT_EMBEDDING_MODEL } from "@/lib/ai/gemini";
import {
  getChatModelChain,
  getLlmProvider,
  isLlmConfigured,
  type ChatMessage,
  type LlmUsage,
} from "@/lib/ai/llm-provider";
import { classifyLlmError } from "@/lib/ai/llm-errors";
import { generateStreamWithFallback } from "@/lib/ai/resilient-llm";
import { getCachedAnswer, isCacheableQuery, setCachedAnswer } from "@/lib/ai/response-cache";
import { CHAT_OBSERVATION, CHAT_TRACE_NAME, RETRIEVAL_TOP_K } from "@/lib/ai/chat-config";
import { flushLangfuse } from "@/lib/ai/langfuse";
import { checkRateLimit } from "@/lib/rate-limit";
import { loadKnowledgeBase } from "@/lib/ai/knowledge-base";
import { createAntiSlopTransformStream } from "@/lib/ai/anti-slop";

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

export const ANTI_SLOP_SYSTEM_PROMPT = `
Bạn là **Cris AI** — đại diện kỹ thuật số (Digital Twin) của **Cris Nguyen** (Senior Frontend Engineer với hơn 5 năm kinh nghiệm chuyên sâu về Next.js, React, TypeScript).

### ⚡ QUY TẮC BẮT BUỘC SỐ 1: DIRECT ANSWER FIRST (< 20 TỪ)
- Câu đầu tiên PHẢI là câu trả lời trực tiếp vào trọng tâm, nêu ngay dữ kiện, con số hoặc câu trả lời có/không.
- Câu đầu tiên KHÔNG ĐƯỢC vượt quá 20 từ.
- TUYỆT ĐỐI KHÔNG mở đầu bằng lời chào ("Chào bạn", "Xin chào", "Hello"), lời cảm ơn, lời khen ("Tuyệt vời", "Câu hỏi hay") hoặc câu dẫn ("Về vấn đề này", "Để trả lời câu hỏi").

### 🚫 DANH SÁCH BỊ CẤM HOÀN TOÀN (ANTI-SLOP RULES):
1. **CẤM Throat-clearing openers**: "Chào bạn", "Xin chào", "Tuyệt vời", "Rất vui được hỗ trợ", "Cảm ơn câu hỏi", "Về câu hỏi của bạn", "Dưới đây là thông tin".
2. **CẤM Sycophantic praise**: "Tuyệt vời!", "Câu hỏi rất hay!", "Thật thú vị!", "Ý kiến rất sáng suốt!".
3. **CẤM Robotic meta-discourse**: "Dựa vào tài liệu được cung cấp", "Theo dữ liệu của tôi", "Trong ngữ cảnh trên", "Là một mô hình AI".
4. **CẤM Summary-recap kickers ở cuối bài**: "Tóm lại...", "Tổng kết lại...", "Nhìn chung...", "Hy vọng câu trả lời này giúp ích cho bạn!", "Nếu bạn có thắc mắc gì đừng ngần ngại hỏi nhé!", "Chúc bạn một ngày tốt lành!". Hãy dừng câu trả lời ngay khi hết ý kỹ thuật.
5. **CẤM Banned buzzwords**: "tận dụng tối đa", "đột phá", "tiên tiến nhất", "toàn diện", "đóng vai trò then chốt", "delve", "leverage", "streamline", "robust", "game-changer".

### 🎯 PHÁT SINH ACTION CHIPS CHO GIAO DIỆN:
Khi câu trả lời đề cập đến dự án, tầng kiến thức lộ trình, hoặc kênh liên hệ, BẮT BUỘC chèn thẻ Action theo cú pháp:
- Dự án:
  • Kamala: \`[[action:project|kamala-commerce-tour|Khám phá Kamala]]\`
  • Zelene Spa: \`[[action:project|zelene-spa-booking|Xem Zelene Spa]]\`
  • Smartbit: \`[[action:project|smartbit-saas-platform|Xem Smartbit SaaS]]\`
  • JAVIS: \`[[action:project|javis-3d-tile-simulation|Xem JAVIS 3D]]\`
- Tầng lộ trình (Roadmap Layers):
  • Tầng 1: \`[[action:roadmap|layer-01|Tầng 01: Knowledge Base]]\`
  • Tầng 2: \`[[action:roadmap|layer-02|Tầng 02: LLM Application]]\`
  • Tầng 3: \`[[action:roadmap|layer-03|Tầng 03: RAG + Agent]]\`
  • Tầng 4: \`[[action:roadmap|layer-04|Tầng 04: LLMOps]]\`
  • Tầng 5: \`[[action:roadmap|layer-05|Tầng 05: Production Deployment]]\`
- Kênh liên hệ:
  • Zalo: \`[[action:contact|zalo|Kết nối Zalo]]\`
  • GitHub: \`[[action:contact|github|GitHub @crisne]]\`
  • Tải CV: \`[[action:contact|cv|Tải CV Cris Nguyen]]\`
  • Mục liên hệ: \`[[action:contact|contact|Mục Liên hệ]]\`

### 🔒 NGUYÊN TẮC DỮ KIỆN (GROUNDING):
- Mọi dữ kiện chỉ lấy từ phần THÔNG TIN bên dưới. Không suy đoán, không bịa thêm.
- Nếu không có thông tin: Trả lời ngắn gọn ngay câu đầu rằng Cris chưa có thông tin về vấn đề này và gợi ý hỏi về dự án, kỹ năng của Cris.
- Với câu hỏi không liên quan đến Cris: lịch sự từ chối và quay về chủ đề năng lực của Cris.

---
### 📚 [THÔNG TIN THỰC TẾ]:
{RAG_CONTEXT}
`.trim();

export function buildAntiSlopSystemPrompt(ragContext: string): string {
  const context = ragContext || "(Không có thông tin liên quan đến câu hỏi này.)";
  return ANTI_SLOP_SYSTEM_PROMPT.replace("{RAG_CONTEXT}", () => context);
}

export async function POST(req: NextRequest) {
  // Root observation of the Langfuse trace; ended when the response (or stream) finishes
  let traceSpan: LangfuseSpan | undefined;
  // Runs after the response (including the stream) has finished
  after(flushLangfuse);

  // Public endpoint backed by LLM provider quota (Gemini or Groq)
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
        const isApiKeyConfigured = isLlmConfigured();

        const knowledgeBase = loadKnowledgeBase();

        // Fallback if API key is not configured (keyword-only retrieval)
        if (!isApiKeyConfigured) {
          const readableContext = toReadableContext(
            findRelevantChunks(trimmedQuery, null, knowledgeBase, RETRIEVAL_TOP_K)
          );
          const fallbackText = readableContext
            ? `Hiện tại chưa cấu hình \`GEMINI_API_KEY\`. Dưới đây là thông tin về Cris Nguyen liên quan đến câu hỏi của bạn:\n\n${readableContext}`
            : `Hiện tại chưa cấu hình \`GEMINI_API_KEY\` và Cris chưa có thông tin cho câu hỏi này. Bạn có thể liên hệ trực tiếp với Cris qua Zalo hoặc LinkedIn.`;
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

        // 0. Repeated standalone questions are served from cache: no embedding / generation quota
        const isCacheable = isCacheableQuery(trimmedQuery, history.length);
        const cached = isCacheable ? getCachedAnswer(trimmedQuery) : null;
        if (cached) {
          rootSpan
            .update({
              output: cached.answer,
              statusMessage: "cache-hit",
              metadata: { isCacheHit: true, model: cached.model },
            })
            .end();
          return new Response(textStream(cached.answer), { headers: responseHeaders });
        }

        const llm = getLlmProvider();

        // 1. Rewrite follow-up questions into standalone queries (only when there is history)
        let retrievalQuery = trimmedQuery;
        if (shouldRewriteQuery(history)) {
          const rewriteGeneration = rootSpan.startObservation(
            CHAT_OBSERVATION.rewrite,
            { model: getChatModelChain()[0], input: { query: trimmedQuery, history } },
            { asType: "generation" }
          );
          const rewrite = await rewriteQuery(trimmedQuery, history);
          retrievalQuery = rewrite.query;
          rewriteGeneration
            .update({
              output: rewrite.query,
              usageDetails: toUsageDetails(rewrite.usage),
              ...(rewrite.model ? { model: rewrite.model } : {}),
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

        const systemPrompt = buildAntiSlopSystemPrompt(ragContext);

        // 4. Stream the answer
        let answerGeneration: LangfuseGeneration | undefined;
        try {
          // Vendor rules (e.g. Gemini's alternating roles) are applied by the adapter
          const contents: ChatMessage[] = [
            ...history.map((h) => ({ role: h.role, content: [{ type: "text" as const, text: h.content }] })),
            { role: "user", content: [{ type: "text", text: trimmedQuery }] },
          ];

          const generationConfig = {
            temperature: 0.3,
            topP: 0.9,
            maxOutputTokens: 1000,
          };
          answerGeneration = rootSpan.startObservation(
            CHAT_OBSERVATION.answer,
            {
              model: getChatModelChain()[0],
              modelParameters: generationConfig,
              input: { systemPrompt, contents },
              metadata: { hasContext: !!ragContext },
            },
            { asType: "generation" }
          );

          const {
            result: answerStream,
            model: answerModel,
            provider: answerProvider,
            fallbackFrom,
          } = await generateStreamWithFallback({
            systemInstruction: systemPrompt,
            contents,
            ...generationConfig,
          });
          // Record the model that actually answers (fallback model when the primary is out of quota)
          answerGeneration.update({
            model: answerModel,
            metadata: { hasContext: !!ragContext, fallbackFrom, provider: answerProvider },
          });

          const generation = answerGeneration;
          const encoder = new TextEncoder();
          // Set when the client disconnects (stop button, closed tab): the controller can no
          // longer be written to, and we stop pulling tokens from the model
          let isCancelled = false;
          let usage: LlmUsage | undefined;
          let cancelUpstream: (() => void) | undefined;

          const rawStream = new ReadableStream<string>({
            async start(rawController) {
              try {
                for await (const chunk of answerStream) {
                  if (isCancelled) break;
                  if (chunk.text) {
                    rawController.enqueue(chunk.text);
                  }
                  if (chunk.usage) usage = chunk.usage;
                }
                rawController.close();
              } catch (err) {
                rawController.error(err);
              }
            },
            cancel() {
              isCancelled = true;
            },
          });

          const sanitizedStream = rawStream.pipeThrough(createAntiSlopTransformStream<string>());
          const sanitizedReader = sanitizedStream.getReader();
          cancelUpstream = () => {
            isCancelled = true;
            sanitizedReader.cancel().catch(() => {});
          };

          const stream = new ReadableStream({
            async start(controller) {
              let answerText = "";
              let streamErrorKind: string | undefined;
              try {
                while (true) {
                  if (isCancelled) break;
                  const { done, value } = await sanitizedReader.read();
                  if (done || isCancelled) break;
                  if (value) {
                    const text = typeof value === "string" ? value : new TextDecoder().decode(value);
                    if (text) {
                      if (!answerText) generation.update({ completionStartTime: new Date() });
                      answerText += text;
                      controller.enqueue(typeof value === "string" ? encoder.encode(value) : value);
                    }
                  }
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
                    metadata: {
                      hasContext: !!ragContext,
                      isCancelled,
                      model: answerModel,
                      provider: answerProvider,
                    },
                  })
                  .end();
                // Cache only complete AI answers (never fallbacks, broken or cancelled streams)
                if (isCacheable && answerText && !streamErrorKind && !isCancelled) {
                  setCachedAnswer(trimmedQuery, answerText, answerModel);
                }
                if (!isCancelled) controller.close();
              }
            },
            cancel() {
              isCancelled = true;
              cancelUpstream?.();
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
          const naturalFallback = `Cris AI đang tạm quá tải nên chưa trả lời chi tiết được. ${readableContext ? `Dưới đây là thông tin liên quan về Cris Nguyen:\n\n${readableContext}\n\n` : "Cris chưa có thông tin cho câu hỏi này. "}Bạn có thể kết nối trực tiếp với Cris qua Zalo hoặc thử lại sau ít phút.`;
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
