import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWriteAccess } from "@/lib/auth/write-access";
import { maskPII } from "@/lib/ai/pii-mask";

// Owner only: items hold visitors' questions, comments and the bot's answers
export async function GET(req: NextRequest) {
  const denied = await requireWriteAccess(req);
  if (denied) return denied;

  try {
    const items = await prisma.knowledgeTriage.findMany({
      where: {
        status: { not: "DISMISSED" },
      },
      orderBy: { createdAt: "desc" },
    });

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
        query: maskPII(String(query).trim()),
        assistantMsg: assistantMsg ? maskPII(String(assistantMsg).trim()) : null,
        reason: reason ? maskPII(String(reason).trim()) : null,
        comment: comment ? maskPII(String(comment).trim()) : null,
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
