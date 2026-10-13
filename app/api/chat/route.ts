import { NextRequest, after } from "next/server";
import {
  LangfuseOtelSpanAttributes,
  startObservation,
  type LangfuseGeneration,
  type LangfuseSpan,
} from "@langfuse/tracing";
import type { GenerateContentResponseUsageMetadata } from "@google/genai";
import {
  findRelevantChunks,
  buildRAGContext,
  rewriteQuery,
} from "@/lib/ai/rag-engine";
import {
  DEFAULT_CHAT_MODEL,
  DEFAULT_EMBEDDING_MODEL,
  embedText,
  getGenAI,
} from "@/lib/ai/gemini";
import { flushLangfuse } from "@/lib/ai/langfuse";
import { PORTFOLIO_KNOWLEDGE_BASE, type KnowledgeChunk } from "@/lib/ai/portfolio-knowledge";
import cachedVectors from "@/lib/ai/data/knowledge-vectors.json";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface ChatRequestPayload {
  message: string;
  // Client-generated id grouping all turns of one conversation in Langfuse
  sessionId?: string;
  history?: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
}

export async function POST(req: NextRequest) {
  // Root observation of the Langfuse trace; ended when the response (or stream) finishes
  let traceSpan: LangfuseSpan | undefined;
  // Runs after the response (including the stream) has finished
  after(flushLangfuse);

  try {
    const body = (await req.json()) as ChatRequestPayload;
    const { message, history = [], sessionId } = body;

    if (!message || typeof message !== "string" || !message.trim()) {
      return new Response(
        JSON.stringify({ error: "Vui lòng nhập nội dung câu hỏi." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const trimmedQuery = message.trim();
    traceSpan = startObservation("chat", {
      input: { message: trimmedQuery, historyLength: history.length },
    });
    if (typeof sessionId === "string" && sessionId.length > 0 && sessionId.length <= 200) {
      traceSpan.otelSpan.setAttribute(LangfuseOtelSpanAttributes.TRACE_SESSION_ID, sessionId);
    }
    // Lets the client attach 👍/👎 feedback to this trace
    const responseHeaders = {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Trace-Id": traceSpan.traceId,
    };
    const apiKey = (process.env.GEMINI_API_KEY || "").trim();
    const isApiKeyConfigured =
      apiKey.length > 10 && !apiKey.includes("your_google_gemini_api_key");

    // Use cached vectors if available, otherwise fall back to raw knowledge base
    const knowledgeBase = (
      Array.isArray(cachedVectors) && cachedVectors.length > 0
        ? cachedVectors
        : PORTFOLIO_KNOWLEDGE_BASE
    ) as KnowledgeChunk[];

    // Fallback if API key is not configured (keyword-only retrieval)
    if (!isApiKeyConfigured) {
      const ragContext = buildRAGContext(
        findRelevantChunks(trimmedQuery, null, knowledgeBase, 4)
      );
      const fallbackText = ragContext
        ? `Xin chào! Hiện tại chưa cấu hình \`GEMINI_API_KEY\`. Dưới đây là thông tin về Cris Nguyen liên quan đến câu hỏi của bạn:\n\n${ragContext}`
        : `Xin chào! Hiện tại chưa cấu hình \`GEMINI_API_KEY\` và Cris chưa có thông tin cho câu hỏi này. Bạn có thể liên hệ trực tiếp với Cris qua Zalo hoặc LinkedIn nhé!`;
      traceSpan
        .update({
          output: fallbackText,
          level: "WARNING",
          metadata: { fallback: "missing-api-key", hasContext: !!ragContext },
        })
        .end();
      const fallbackStream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode(fallbackText));
          controller.close();
        },
      });

      return new Response(fallbackStream, {
        headers: responseHeaders,
      });
    }

    // 1. Rewrite follow-up questions into standalone queries, then hybrid search (vector + keyword)
    const rewriteSpan = traceSpan.startObservation(
      "rewrite-query",
      { input: { query: trimmedQuery, historyLength: history.length } },
      { asType: "chain" }
    );
    const retrievalQuery = await rewriteQuery(trimmedQuery, history);
    rewriteSpan
      .update({
        output: retrievalQuery,
        metadata: { isRewritten: retrievalQuery !== trimmedQuery },
      })
      .end();

    const embedSpan = traceSpan.startObservation(
      "embed-query",
      { model: DEFAULT_EMBEDDING_MODEL, input: retrievalQuery },
      { asType: "embedding" }
    );
    let queryEmbedding: number[] | null = null;
    try {
      queryEmbedding = await embedText(retrievalQuery, "RETRIEVAL_QUERY");
      embedSpan.update({ output: { dimension: queryEmbedding?.length ?? 0 } });
    } catch (embedError) {
      console.error("Query embedding error:", embedError);
      embedSpan.update({ level: "ERROR", statusMessage: String(embedError) });
    }
    embedSpan.end();

    const retrieveSpan = traceSpan.startObservation(
      "retrieve",
      { input: retrievalQuery },
      { asType: "retriever" }
    );
    const relevantChunks = findRelevantChunks(retrievalQuery, queryEmbedding, knowledgeBase, 4);
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

    // 2. Ultra-refined Persona & System Prompt for Natural, Human-like Voice
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

    // 3. Try Gemini streaming using @google/genai
    let answerGeneration: LangfuseGeneration | undefined;
    try {
      // Gemini expects conversation to start with a user turn and alternate roles
      const contents: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> = [];
      for (const h of history.slice(-6)) {
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
      answerGeneration = traceSpan.startObservation(
        "answer",
        {
          model: DEFAULT_CHAT_MODEL,
          modelParameters: generationConfig,
          input: { systemPrompt, contents },
          metadata: { hasContext: !!ragContext },
        },
        { asType: "generation" }
      );

      const result = await getGenAI().models.generateContentStream({
        model: DEFAULT_CHAT_MODEL,
        contents,
        config: {
          systemInstruction: systemPrompt,
          ...generationConfig,
          thinkingConfig: { thinkingBudget: 0 },
        },
      });

      const generation = answerGeneration;
      const rootSpan = traceSpan;
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          let answerText = "";
          let usageMetadata: GenerateContentResponseUsageMetadata | undefined;
          let isStreamError = false;
          try {
            for await (const chunk of result) {
              const text = chunk.text;
              if (text) {
                if (!answerText) generation.update({ completionStartTime: new Date() });
                answerText += text;
                controller.enqueue(encoder.encode(text));
              }
              if (chunk.usageMetadata) usageMetadata = chunk.usageMetadata;
            }
          } catch (streamError) {
            console.error("Stream chunk error:", streamError);
            isStreamError = true;
            generation.update({ level: "ERROR", statusMessage: String(streamError) });
            controller.enqueue(
              encoder.encode("\n\n_(Kết nối bị gián đoạn, bạn thử hỏi lại giúp Cris nhé!)_")
            );
          } finally {
            controller.close();
            generation
              .update({
                output: answerText,
                usageDetails: {
                  input: usageMetadata?.promptTokenCount ?? 0,
                  output: usageMetadata?.candidatesTokenCount ?? 0,
                  total: usageMetadata?.totalTokenCount ?? 0,
                },
              })
              .end();
            rootSpan
              .update({
                output: answerText,
                level: isStreamError ? "ERROR" : "DEFAULT",
                metadata: { hasContext: !!ragContext, isStreamError },
              })
              .end();
          }
        },
      });

      return new Response(stream, {
        headers: responseHeaders,
      });
    } catch (llmError: unknown) {
      const errorMsg = llmError instanceof Error ? llmError.message : String(llmError);
      console.error("Gemini LLM Call Error:", errorMsg);
      answerGeneration?.update({ level: "ERROR", statusMessage: errorMsg }).end();

      // Graceful natural fallback if Google API has issue
      const naturalFallback = `Chào bạn! Về câu hỏi "${trimmedQuery}":\n\n${ragContext ? `Dưới đây là thông tin liên quan về Cris Nguyen:\n\n${ragContext}\n\n` : "Cris chưa có thông tin cho câu hỏi này. "}Bạn có thể kết nối trực tiếp với Cris qua Zalo hoặc xem thêm chi tiết tại trang chủ nhé!`;
      traceSpan
        .update({
          output: naturalFallback,
          level: "ERROR",
          metadata: { fallback: "llm-error", hasContext: !!ragContext },
        })
        .end();

      const fallbackStream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode(naturalFallback));
          controller.close();
        },
      });

      return new Response(fallbackStream, {
        headers: responseHeaders,
      });
    }
  } catch (error) {
    console.error("Chat API Fatal Error:", error);
    traceSpan?.update({ level: "ERROR", statusMessage: String(error) }).end();
    return new Response(
      JSON.stringify({
        error: "Đã có lỗi xảy ra khi xử lý câu hỏi. Vui lòng thử lại sau.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
