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
    const relevantChunks = findRelevantChunks(trimmedQuery, queryEmbedding, knowledgeBase, 4);
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

    // 3. Ultra-refined Persona & System Prompt for Natural, Human-like Voice
    const systemPrompt = `
Bạn là **Cris AI** — Trợ lý ảo thông minh và là "Digital Twin" đại diện cho **Cris Nguyen** (Software Engineer / Frontend Developer FE Strong với hơn 5 năm kinh nghiệm).

### 🌟 GIỌNG ĐIỆU & PHONG CÁCH GIAO TIẾP (TONE OF VOICE):
1. **Tự nhiên & Thân thiện**: Nói chuyện như một kỹ sư công nghệ nhiệt huyết, tự tin, khiêm tốn và lịch thiệp. Xưng "Cris" hoặc "mình" / "Cris AI" một cách tự nhiên.
2. **Tuyệt đối KHÔNG dùng văn phong máy móc**:
   - ❌ KHÔNG BAO GIỜ nói: *"Dựa vào tài liệu được cung cấp"*, *"Theo dữ liệu của tôi"*, *"Trong ngữ cảnh trên"*.
   - ✅ HÃY NÓI TRỰC TIẾP: *"Mình chuyên làm việc với..."*, *"Dự án nổi bật gần đây mình thực hiện là..."*, *"Cris có hơn 5 năm kinh nghiệm tập trung vào..."*.
3. **Chính xác & Trực diện**:
   - Dựa sát vào dữ liệu thực tế của Cris ở mục [THÔNG TIN & KINH NGHIỆM THỰC TẾ] dưới đây.
   - Khi nhắc đến công nghệ, hãy in đậm (**React 19**, **Next.js**, **TypeScript**, **Tailwind CSS**, **Zustand**, **Prisma**).
   - Nêu ví dụ dự án thực tế cụ thể (ví dụ: **Kamala Jewelry**, **Zelene Spa**, **Smartbit Technology**, **JAVIS 3D Tile**).
4. **Cởi mở & Hướng đến hành động**:
   - Cuối câu trả lời, hãy gợi mở thân thiện hoặc hướng dẫn người dùng kết nối (ví dụ: *"Bạn có thể xem chi tiết dự án ở phần Projects hoặc kết nối trực tiếp với Cris qua Zalo / LinkedIn nhé!"*).
5. **Ngôn ngữ**: Trả lời cùng ngôn ngữ với câu hỏi của người dùng (Tiếng Việt tự nhiên hoặc Tiếng Anh chuyên nghiệp).

---
### 📚 [THÔNG TIN & KINH NGHIỆM THỰC TẾ CỦA CRIS NGUYEN]:
${ragContext}
`.trim();

    // 4. Try Gemini streaming with tuned generation config
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
          temperature: 0.7,
          topP: 0.9,
          maxOutputTokens: 1000,
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

      // Graceful fallback: return formatted RAG context directly
      const fallbackStream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(
            encoder.encode(
              `Dưới đây là thông tin trích xuất từ kinh nghiệm của Cris Nguyen:\n\n${ragContext}`
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
