import { NextRequest } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { DEFAULT_CHAT_MODEL } from "@/lib/ai/gemini";
import {
  findRelevantChunks,
  buildRAGContext,
  getQueryEmbedding,
} from "@/lib/ai/rag-engine";
import { PORTFOLIO_KNOWLEDGE_BASE, type KnowledgeChunk } from "@/lib/ai/portfolio-knowledge";
import cachedVectors from "@/lib/ai/data/knowledge-vectors.json";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface ChatRequestPayload {
  message: string;
  history?: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ChatRequestPayload;
    const { message, history = [] } = body;

    if (!message || typeof message !== "string" || !message.trim()) {
      return new Response(
        JSON.stringify({ error: "Vui lòng nhập nội dung câu hỏi." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const trimmedQuery = message.trim();
    const apiKey = (process.env.GEMINI_API_KEY || "").trim();
    const isApiKeyConfigured =
      apiKey.length > 10 && !apiKey.includes("your_google_gemini_api_key");

    // Use cached vectors if available, otherwise fall back to raw knowledge base
    const knowledgeBase = (
      Array.isArray(cachedVectors) && cachedVectors.length > 0
        ? cachedVectors
        : PORTFOLIO_KNOWLEDGE_BASE
    ) as KnowledgeChunk[];

    // 1. Generate query embedding (if API key is available)
    let queryEmbedding: number[] | null = null;
    if (isApiKeyConfigured) {
      try {
        queryEmbedding = await getQueryEmbedding(trimmedQuery);
      } catch (embErr) {
        console.warn("Embedding generation fallback to keyword matching:", embErr);
      }
    }

    // 2. Hybrid search (vector + keyword) to find top matching chunks
    const relevantChunks = findRelevantChunks(trimmedQuery, queryEmbedding, knowledgeBase, 3);
    const ragContext = buildRAGContext(relevantChunks);

    // Fallback if API key is not configured
    if (!isApiKeyConfigured) {
      const fallbackIntro = `Xin chào! Dưới đây là thông tin phù hợp nhất mà tôi tìm thấy về kinh nghiệm và dự án của Cris Nguyen:\n\n`;
      const fallbackStream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode(fallbackIntro + ragContext));
          controller.close();
        },
      });

      return new Response(fallbackStream, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-cache",
        },
      });
    }

    // 3. Construct System Prompt with RAG Context
    const systemPrompt = `
Bạn là AI Assistant đại diện cho **Cris Nguyen** (Software Engineer / Frontend Developer).
Nhiệm vụ của bạn là giải đáp thắc mắc của nhà tuyển dụng, đối tác và khách truy cập trang web cá nhân của Cris Nguyen.

### NGUYÊN TẮC TRẢ LỜI:
1. **Phong cách**: Thân thiện, chuyên nghiệp, tự tin, súc tích và khiêm tốn.
2. **Độ chính xác**: Ưu tiên cao nhất thông tin được cung cấp trong phần [TÀI LIỆU VỀ CRIS NGUYEN] dưới đây.
3. **Phạm vi**: Nếu người dùng hỏi các vấn đề ngoài phạm vi chuyên môn/thông tin của Cris, hãy lịch sự thông báo rằng bạn chỉ hỗ trợ thông tin liên quan đến kinh nghiệm, dự án và kỹ năng của Cris Nguyen, đồng thời gợi ý họ liên hệ trực tiếp với Cris qua Zalo, GitHub hoặc Email.
4. **Định dạng**: Trình bày rõ ràng, sử dụng bullet point (-) và in đậm (**key tech**) khi liệt kê công nghệ hoặc kinh nghiệm.
5. **Ngôn ngữ**: Trả lời bằng ngôn ngữ mà người dùng đặt câu hỏi (mặc định tiếng Việt nếu người dùng hỏi tiếng Việt, tiếng Anh nếu hỏi tiếng Anh).

[TÀI LIỆU VỀ CRIS NGUYEN]:
${ragContext}
`.trim();

    // 4. Try Gemini streaming, fallback to RAG documents if LLM request fails
    try {
      const ai = new GoogleGenAI({ apiKey });

      // Format conversation history for Gemini contents
      const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

      const recentHistory = history.slice(-6);
      for (const h of recentHistory) {
        contents.push({
          role: h.role === "assistant" ? "model" : "user",
          parts: [{ text: h.content }],
        });
      }

      // Add current user message
      contents.push({
        role: "user",
        parts: [{ text: trimmedQuery }],
      });

      const responseStream = await ai.models.generateContentStream({
        model: DEFAULT_CHAT_MODEL,
        contents,
        config: {
          systemInstruction: systemPrompt,
        },
      });

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of responseStream) {
              const text = chunk.text;
              if (text) {
                controller.enqueue(encoder.encode(text));
              }
            }
          } catch (streamError) {
            console.error("Stream chunk error:", streamError);
            controller.enqueue(
              encoder.encode("\n\n*(Đã xảy ra gián đoạn kết nối)*")
            );
          } finally {
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-cache",
        },
      });
    } catch (llmError) {
      console.error("Gemini LLM Call Error, falling back to direct RAG context:", llmError);

      // Graceful fallback: return RAG context directly so user always gets the answer!
      const fallbackStream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(
            encoder.encode(
              `Dưới đây là thông tin trích xuất từ tài liệu của Cris Nguyen:\n\n${ragContext}`
            )
          );
          controller.close();
        },
      });

      return new Response(fallbackStream, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-cache",
        },
      });
    }
  } catch (error) {
    console.error("Chat API Fatal Error:", error);
    return new Response(
      JSON.stringify({
        error: "Đã có lỗi xảy ra khi xử lý câu hỏi. Vui lòng thử lại sau.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
