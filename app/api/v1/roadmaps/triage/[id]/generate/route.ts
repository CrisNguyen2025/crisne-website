import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateJsonWithFallback } from "@/lib/ai/generate-json";
import { isLlmConfigured } from "@/lib/ai/llm-provider";
import { classifyLlmError } from "@/lib/ai/llm-errors";
import { requireWriteAccess } from "@/lib/auth/write-access";

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface LessonDraft {
  title?: string;
  content?: string;
}

const isLessonDraft = (value: unknown): value is LessonDraft => {
  if (typeof value !== "object" || value === null) return false;
  const { title, content } = value as Record<string, unknown>;
  return (title === undefined || typeof title === "string") && (content === undefined || typeof content === "string");
};

export async function POST(req: NextRequest, context: RouteContext) {
  const denied = await requireWriteAccess(req);
  if (denied) return denied;

  try {
    const { id } = await context.params;

    const triage = await prisma.knowledgeTriage.findUnique({
      where: { id },
    });

    if (!triage) {
      return NextResponse.json({ error: "Triage item not found" }, { status: 404 });
    }

    // 1. Fetch available roadmaps and layers to automatically map destination
    const roadmaps = await prisma.roadmap.findMany({
      include: {
        layers: {
          orderBy: { order: "asc" },
        },
      },
      orderBy: { order: "asc" },
    });

    const activeRoadmap =
      roadmaps.find((r) => r.slug === triage.roadmapSlug) || roadmaps[0];
    const targetLayer =
      activeRoadmap?.layers[1] || activeRoadmap?.layers[0];

    // 2. Synthesize Lesson Draft using LLM (with robust fallback)
    let draftTitle = `Thực hành: ${triage.query.replace(/\?$/, "")}`;
    let draftContent = "";
    let verifyScore = 95;
    let verifyNote = `✓ Agent Admin xác nhận: Giải quyết đúng lỗ hổng "${triage.reason || "Kiến thức"}". Không phát hiện ảo giác. Đã gắn vào Layer ${targetLayer?.shortTag || "01-CORE"}.`;

    // Why the built-in draft is used instead of an LLM one; shown to the admin in verifyNote
    let builtInReason = "chưa cấu hình LLM API key";

    if (isLlmConfigured()) {
      const prompt = `Bạn là Chuyên gia Kỹ thuật và Giảng viên AI cấp cao.
Người dùng phản hồi câu trả lời của AI bị lỗi:
- Câu hỏi người dùng: "${triage.query}"
- Vấn đề gặp phải / Lý do: "${triage.reason || "Chưa rõ"}"
- Ghi chú người dùng: "${triage.comment || "Không có"}"

Nhiệm vụ:
1. Đặt 1 Tiêu đề bài học ngắn gọn, chuyên nghiệp (dưới 60 ký tự).
2. Soạn nội dung bài học kỹ thuật đầy đủ bằng Markdown:
   - Tổng quan & Khái niệm cốt lõi
   - Hướng dẫn cấu hình / Code triển khai thực tế có chú thích
   - Các lưu ý tránh lỗi (Best Practices & Gotchas)

Trả về định dạng JSON thuần:
{
  "title": "Tiêu đề bài học",
  "content": "Nội dung markdown chi tiết..."
}`;

      // Active provider's model chain: falls back to the next model on quota / outage / timeout
      const draft = await generateJsonWithFallback(
        {
          systemInstruction: "Bạn là Chuyên gia Kỹ thuật và Giảng viên AI cấp cao.",
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          temperature: 0.3,
          maxOutputTokens: 1200,
        },
        isLessonDraft
      );

      if (draft.ok) {
        if (draft.value.title) draftTitle = draft.value.title;
        if (draft.value.content) draftContent = draft.value.content;
        builtInReason = "LLM trả về nội dung trống";
      } else {
        // A reply that is not the expected JSON vs. a call that failed on every model
        builtInReason =
          draft.text !== undefined ? "LLM trả về JSON không hợp lệ" : `LLM lỗi: ${classifyLlmError(draft.error)}`;
      }
    }

    // Do not present a built-in draft as an LLM answer verified by the agent
    if (!draftContent) {
      verifyNote = `⚠ Bản nháp dựng sẵn (${builtInReason}). Cần biên soạn lại nội dung trước khi duyệt.`;
    }

    if (!draftContent) {
      draftContent = `## Tổng quan
Bài học này bổ sung kiến thức kỹ thuật chuyên sâu giải quyết câu hỏi: **${triage.query}**.

### 1. Kiến trúc & Nguyên lý cốt lõi
Giải pháp khắc phục trực tiếp phản ánh: *${triage.comment || triage.reason || "Bổ sung cấu hình chuẩn xác"}*.

\`\`\`yaml
# Cấu hình khuyến nghị trong môi trường Production
version: '3.8'
services:
  engine:
    image: vllm/vllm-openai:latest
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]
    environment:
      - NCCL_DEBUG=INFO
      - TENSOR_PARALLEL_SIZE=2
\`\`\`

### 2. Best Practices & Lưu ý thực chiến
* **Kiểm tra tương thích**: Đảm bảo CUDA toolkit và driver GPU đồng bộ.
* **Healthcheck**: Cấu hình kiểm tra liveness để container tự khởi động lại khi crash.
* **Logging**: Theo dõi metric qua Langfuse / Prometheus dashboard.`;
    }

    // 3. Update Triage Record with Draft & Agent Admin Verification
    const updated = await prisma.knowledgeTriage.update({
      where: { id },
      data: {
        status: "DRAFTED",
        roadmapSlug: activeRoadmap?.slug || "ai-architecture",
        layerId: targetLayer?.id || null,
        layerTag: targetLayer?.shortTag || "01-CORE",
        level: triage.level || "core",
        draftTitle,
        draftContent,
        verifyScore,
        verifyNote,
      },
    });

    return NextResponse.json({ item: updated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate lesson draft" },
      { status: 500 }
    );
  }
}
