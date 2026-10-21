import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWriteAccess } from "@/lib/auth/write-access";
import { maskPII } from "@/lib/ai/pii-mask";
import { listDownvotedTraces } from "@/lib/ai/langfuse";

// Feedback source sent by the roadmap widget, and the name of its root span (rag_service/observability.py TRACE_NAME)
const ROADMAP_SOURCE = "roadmap-assistant";
const LOOKBACK_DAYS = 30;
// The Langfuse public API is rate limited: a bigger backlog is imported over several clicks
const MAX_IMPORT = 20;

/**
 * Owner only: creates a PENDING triage item for each recent 👎 on the roadmap assistant that is not
 * in the list yet. Langfuse holds the votes; a trace already imported (any status) is never added twice.
 */
export async function POST(req: NextRequest) {
  const denied = await requireWriteAccess(req);
  if (denied) return denied;

  try {
    const known = await prisma.knowledgeTriage.findMany({
      where: { traceId: { not: null } },
      select: { traceId: true },
    });
    const { traces, remaining } = await listDownvotedTraces({
      source: ROADMAP_SOURCE,
      days: LOOKBACK_DAYS,
      limit: MAX_IMPORT,
      skip: new Set(known.map((item) => item.traceId as string)),
    });

    let imported = 0;
    for (const trace of traces) {
      const input = (trace.input ?? {}) as { message?: unknown; page_context?: { roadmapSlug?: unknown } | null };
      if (typeof input.message !== "string" || !input.message.trim()) continue;
      const roadmapSlug = input.page_context?.roadmapSlug;

      await prisma.knowledgeTriage.create({
        data: {
          traceId: trace.traceId,
          // Already masked when traced; masked again because this text is shown and sent to the LLM
          query: maskPII(input.message.trim()),
          assistantMsg: typeof trace.output === "string" ? maskPII(trace.output) : null,
          reason: trace.reason ?? null,
          comment: trace.comment ?? null,
          roadmapSlug: typeof roadmapSlug === "string" ? roadmapSlug : "ai-architecture",
          status: "PENDING",
        },
      });
      imported++;
    }

    return NextResponse.json({ imported, remaining });
  } catch (error) {
    console.error("Triage import error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to import from Langfuse" },
      { status: 500 }
    );
  }
}
