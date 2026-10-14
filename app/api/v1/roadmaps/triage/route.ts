import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWriteAccess } from "@/lib/auth/write-access";

const SAMPLE_TRIAGE_ITEMS = [
  {
    query: "Cách cấu hình vLLM offline engine với tensor parallel trên multi-GPU?",
    assistantMsg: "Bạn chỉ cần chạy vllm serve với lệnh cơ bản...",
    reason: "Ảo giác / Sai kiến thức",
    comment: "Thiếu hướng dẫn tensor_parallel_size, NCCL environment variables và vLLM offline LLM class.",
    status: "PENDING",
    roadmapSlug: "ai-architecture",
    level: "advanced",
  },
  {
    query: "Làm thế nào để tích hợp Langfuse self-hosted vào Docker Compose cho Next.js?",
    assistantMsg: "Bạn cấu hình biến môi trường LANGFUSE_URL là xong.",
    reason: "Lỗi cú pháp / Lộ trình hỏng",
    comment: "Docker compose cần postgres, clickhouse, minio và web container nhưng bot không nói rõ port và healthcheck.",
    status: "PENDING",
    roadmapSlug: "ai-architecture",
    level: "intermediate",
  },
  {
    query: "Phân biệt RAG Graph vs Traditional Vector RAG khi nào nên dùng?",
    assistantMsg: "RAG Graph là dùng đồ thị, còn Vector RAG là dùng vector...",
    reason: "Khó hiểu / Quá dài dòng",
    comment: "Giải thích quá chung chung, không có bảng so sánh trade-off về cost, latency và retrieval accuracy.",
    status: "PENDING",
    roadmapSlug: "ai-architecture",
    level: "core",
  },
];

export async function GET() {
  try {
    let items = await prisma.knowledgeTriage.findMany({
      where: {
        status: { not: "DISMISSED" },
      },
      orderBy: { createdAt: "desc" },
    });

    // Auto-seed sample triage items if completely empty so the user can test immediately
    if (items.length === 0) {
      for (const sample of SAMPLE_TRIAGE_ITEMS) {
        await prisma.knowledgeTriage.create({
          data: sample,
        });
      }
      items = await prisma.knowledgeTriage.findMany({
        where: {
          status: { not: "DISMISSED" },
        },
        orderBy: { createdAt: "desc" },
      });
    }

    return NextResponse.json({ items });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch triage items" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const denied = await requireWriteAccess(req);
  if (denied) return denied;

  try {
    const body = await req.json();
    const { query, assistantMsg, reason, comment, traceId, roadmapSlug } = body;

    if (!query) {
      return NextResponse.json({ error: "Query is required" }, { status: 400 });
    }

    const item = await prisma.knowledgeTriage.create({
      data: {
        query: String(query).trim(),
        assistantMsg: assistantMsg ? String(assistantMsg).trim() : null,
        reason: reason ? String(reason).trim() : null,
        comment: comment ? String(comment).trim() : null,
        traceId: traceId ? String(traceId).trim() : null,
        roadmapSlug: roadmapSlug ? String(roadmapSlug).trim() : "ai-architecture",
        status: "PENDING",
      },
    });

    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create triage item" },
      { status: 500 }
    );
  }
}
