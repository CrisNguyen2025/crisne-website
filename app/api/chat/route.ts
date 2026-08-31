import { NextRequest } from "next/server";
import { genAI, DEFAULT_CHAT_MODEL } from "@/lib/ai/gemini";
import {
  findRelevantChunks,
  buildRAGContext,
  getQueryEmbedding,
} from "@/lib/ai/rag-engine";
import { PORTFOLIO_KNOWLEDGE_BASE, type KnowledgeChunk } from "@/lib/ai/portfolio-knowledge";
import cachedVectors from "@/lib/ai/data/knowledge-vectors.json";

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
    const apiKey = process.env.GEMINI_API_KEY;

    // Use cached vectors if available, otherwise fall back to raw knowledge base
    const knowledgeBase = (
      Array.isArray(cachedVectors) && cachedVectors.length > 0
        ? cachedVectors
        : PORTFOLIO_KNOWLEDGE_BASE
    ) as KnowledgeChunk[];

    // 1. Generate query embedding (if API key is available)
    const queryEmbedding = apiKey ? await getQueryEmbedding(trimmedQuery) : null;

    // 2. Hybrid search (vector + keyword) to find top matching chunks
    const relevantChunks = findRelevantChunks(trimmedQuery, queryEmbedding, knowledgeBase, 3);
    const ragContext = buildRAGContext(relevantChunks);

    // Fallback if API key is not configured
    if (!apiKey) {
      const fallbackIntro = `Xin chào! Hiện tại trang web chưa được cấu hình \`GEMINI_API_KEY\`. Dưới đây là thông tin phù hợp nhất mà tôi tìm thấy trong tài liệu của Cris Nguyen:\n\n`;
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

    // 4. Format conversation history for Gemini
    const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [
      {
        role: "user",
        parts: [{ text: systemPrompt }],
      },
      {
        role: "model",
        parts: [
          {
            text: "Chào bạn! Tôi là AI Assistant của Cris Nguyen. Tôi đã nắm rõ thông tin về kinh nghiệm, dự án và kỹ năng của Cris. Tôi sẵn sàng hỗ trợ bạn!",
          },
        ],
      },
    ];

    // Include recent history (up to last 6 messages)
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

    // 5. Call Gemini Streaming API
    const responseStream = await genAI.models.generateContentStream({
      model: DEFAULT_CHAT_MODEL,
      contents,
    });

    // 6. Return standard ReadableStream
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
          console.error("Error while streaming response:", streamError);
          controller.enqueue(
            encoder.encode("\n\n*(Đã xảy ra lỗi gián đoạn kết nối trong lúc phản hồi)*")
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
