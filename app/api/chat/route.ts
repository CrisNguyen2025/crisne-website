import { NextRequest } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  findRelevantChunks,
  buildRAGContext,
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

    // 1. Hybrid search (vector + keyword) to find top matching chunks
    const relevantChunks = findRelevantChunks(trimmedQuery, null, knowledgeBase, 4);
    const ragContext = buildRAGContext(relevantChunks);

    // Fallback if API key is not configured
    if (!isApiKeyConfigured) {
      const fallbackText = `Xin chào! Hiện tại chưa cấu hình \`GEMINI_API_KEY\`. Dưới đây là thông tin về Cris Nguyen liên quan đến câu hỏi của bạn:\n\n${ragContext}`;
      const fallbackStream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode(fallbackText));
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

    // 2. Ultra-refined Persona & System Prompt for Natural, Human-like Voice
    const systemPrompt = `
Bạn là **Cris AI** — Trợ lý ảo thông minh và là "Digital Twin" đại diện cho **Cris Nguyen** (Software Engineer / Frontend Developer FE Strong với hơn 5 năm kinh nghiệm).

### 🌟 NGUYÊN TẮC GIAO TIẾP (TONE OF VOICE):
1. **Tự nhiên & Thân thiện**: Nói chuyện như một kỹ sư công nghệ cởi mở, tự tin, nhiệt tình và khiêm tốn. Xưng "Cris" hoặc "mình" / "Cris AI" một cách tự nhiên.
2. **Tuyệt đối KHÔNG dùng văn phong máy móc**:
   - ❌ KHÔNG BAO GIỜ nói: *"Dựa vào tài liệu được cung cấp"*, *"Theo dữ liệu của tôi"*, *"Trong ngữ cảnh trên"*, *"Dưới đây là thông tin..."*.
   - ✅ HÃY NÓI TRỰC TIẾP: *"Chào bạn! Về mảng mobile thì Cris có kinh nghiệm phát triển..."*, *"Mình từng xây dựng ứng dụng mobile bằng React Native & Expo cho dự án..."*.
3. **Chính xác & Trực diện**:
   - Khi hỏi về **Mobile / App**: Hãy khẳng định ngay Cris có kỹ năng phát triển Mobile App bằng **React Native & Expo**, từng xây dựng ứng dụng di động cho dự án **Zelene Head Spa Booking** (Mỹ) và app hỗ trợ bán hàng **Kamala**.
   - Khi hỏi về **Web / Next.js**: Nêu bật kinh nghiệm Next.js App Router, tối ưu SEO, hệ thống SaaS Multi-tenant, CMS tại **Smartbit Technology** và **Kamala**.
   - In đậm các từ khóa công nghệ (**React 19**, **Next.js**, **TypeScript**, **React Native**, **Tailwind CSS**, **Zustand**, **Prisma**).
4. **Cởi mở & Hướng đến hành động**:
   - Gợi ý người dùng xem thêm chi tiết ở mục Projects trên trang web hoặc kết nối qua Zalo / LinkedIn / tải CV.
5. **Ngôn ngữ**: Trả lời bằng ngôn ngữ câu hỏi của người dùng (Tiếng Việt tự nhiên hoặc Tiếng Anh chuyên nghiệp).

---
### 📚 [THÔNG TIN & KINH NGHIỆM THỰC TẾ CỦA CRIS NGUYEN]:
${ragContext}
`.trim();

    // 3. Try Gemini streaming using @google/generative-ai
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: "gemini-1.5-flash",
        systemInstruction: systemPrompt,
        generationConfig: {
          temperature: 0.7,
          topP: 0.9,
          maxOutputTokens: 1000,
        },
      });

      // Filter and format conversation history for valid alternating turns
      const validHistory: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> = [];
      const recentHistory = history.slice(-6);

      for (const h of recentHistory) {
        if (h.content && h.content.trim()) {
          validHistory.push({
            role: h.role === "assistant" ? "model" : "user",
            parts: [{ text: h.content.trim() }],
          });
        }
      }

      let result;
      // If we have history, use startChat, otherwise call generateContentStream directly
      if (validHistory.length > 0 && validHistory[0].role === "user") {
        const chat = model.startChat({ history: validHistory });
        result = await chat.sendMessageStream(trimmedQuery);
      } else {
        result = await model.generateContentStream(trimmedQuery);
      }

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of result.stream) {
              const text = chunk.text();
              if (text) {
                controller.enqueue(encoder.encode(text));
              }
            }
          } catch (streamError) {
            console.error("Stream chunk error:", streamError);
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
    } catch (llmError: unknown) {
      const errorMsg = llmError instanceof Error ? llmError.message : String(llmError);
      console.error("Gemini LLM Call Error:", errorMsg);

      // Graceful natural fallback if Google API has issue
      const naturalFallback = `Chào bạn! Về câu hỏi "${trimmedQuery}":\n\nCris Nguyen có kinh nghiệm thực tế về lĩnh vực này. Dưới đây là thông tin chính:\n\n${ragContext}\n\nBạn có thể kết nối trực tiếp với Cris qua Zalo hoặc xem thêm chi tiết tại trang chủ nhé!`;

      const fallbackStream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode(naturalFallback));
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
