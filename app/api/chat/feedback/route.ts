import { NextRequest } from "next/server";
import { createFeedbackScore } from "@/lib/ai/langfuse";
import { checkRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

interface FeedbackRequestPayload {
  traceId: string;
  value: 0 | 1;
  reason?: string;
  comment?: string;
  query?: string;
  assistantMsg?: string;
  roadmapSlug?: string;
}

// W3C trace id format used by Langfuse
const TRACE_ID_PATTERN = /^[0-9a-f]{32}$/;

// Public on purpose: portfolio visitors rate answers without signing in.
// Abuse is bounded by the rate limit and the trace id check below.
export async function POST(req: NextRequest) {
  const rateLimit = checkRateLimit(req, { key: "chat-feedback", limit: 60, windowMs: 5 * 60_000 });
  if (!rateLimit.isAllowed) {
    return new Response(null, {
      status: 429,
      headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
    });
  }

  try {
    const { traceId, value, reason, comment, query, assistantMsg, roadmapSlug } =
      (await req.json()) as FeedbackRequestPayload;

    if (typeof traceId !== "string" || !TRACE_ID_PATTERN.test(traceId) || (value !== 0 && value !== 1)) {
      return new Response(JSON.stringify({ error: "Invalid feedback payload." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (reason && (typeof reason !== "string" || reason.length > 100)) {
      return new Response(JSON.stringify({ error: "Invalid feedback reason." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (comment && (typeof comment !== "string" || comment.length > 500)) {
      return new Response(JSON.stringify({ error: "Feedback comment too long." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const fullComment = [reason?.trim(), comment?.trim()].filter(Boolean).join(" - ") || undefined;

    await createFeedbackScore(traceId, value, fullComment);

    if (value === 0 && (reason || comment || query)) {
      try {
        await prisma.knowledgeTriage.create({
          data: {
            traceId,
            query: query ? String(query).trim() : (reason || comment || "Câu hỏi cần cải thiện chất lượng"),
            assistantMsg: assistantMsg ? String(assistantMsg).trim() : null,
            reason: reason ? String(reason).trim() : null,
            comment: comment ? String(comment).trim() : null,
            roadmapSlug: roadmapSlug ? String(roadmapSlug).trim() : "ai-architecture",
            status: "PENDING",
          },
        });
      } catch (dbErr) {
        console.error("Knowledge triage db save error:", dbErr);
      }
    }

    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("Chat feedback error:", error);
    return new Response(JSON.stringify({ error: "Không thể gửi phản hồi." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
