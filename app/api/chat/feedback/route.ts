import { NextRequest } from "next/server";
import { addToReviewQueue, createFeedbackScore, deleteFeedbackScore } from "@/lib/ai/langfuse";
import { checkRateLimit } from "@/lib/rate-limit";
import { maskPII } from "@/lib/ai/pii-mask";

export const dynamic = "force-dynamic";

interface FeedbackRequestPayload {
  traceId: string;
  /** null removes the rating (the visitor un-clicked 👍/👎) */
  value: 0 | 1 | null;
  reason?: string;
  comment?: string;
  /** Which assistant answered, e.g. "roadmap-assistant"; lets triage import its 👎 only */
  source?: string;
}

// W3C trace id format used by Langfuse
const TRACE_ID_PATTERN = /^[0-9a-f]{32}$/;

// Public on purpose: portfolio visitors rate answers without signing in.
// Abuse is bounded by the rate limit and the trace id check below.
// Langfuse is the only store: the score id is derived from the trace, so a repeated vote overwrites
// the previous one. Knowledge triage items are imported from these scores by the owner.
export async function POST(req: NextRequest) {
  const rateLimit = checkRateLimit(req, { key: "chat-feedback", limit: 60, windowMs: 5 * 60_000 });
  if (!rateLimit.isAllowed) {
    return new Response(null, {
      status: 429,
      headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
    });
  }

  try {
    const { traceId, value, reason, comment, source } = (await req.json()) as FeedbackRequestPayload;

    if (typeof traceId !== "string" || !TRACE_ID_PATTERN.test(traceId) || (value !== 0 && value !== 1 && value !== null)) {
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

    if (source !== undefined && (typeof source !== "string" || !/^[a-z0-9-]{1,40}$/.test(source))) {
      return new Response(JSON.stringify({ error: "Invalid feedback source." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (value === null) {
      await deleteFeedbackScore(traceId);
      return new Response(null, { status: 204 });
    }

    // Visitor text is shown to the admin and fed to the LLM: strip emails / phone numbers first
    const detail = {
      reason: reason?.trim() ? maskPII(reason.trim()) : undefined,
      comment: comment?.trim() ? maskPII(comment.trim()) : undefined,
      source,
    };
    await createFeedbackScore(traceId, value, detail);
    // 👎 answers are reviewed in Langfuse and may become golden set samples
    if (value === 0) await addToReviewQueue(traceId);

    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("Chat feedback error:", error);
    return new Response(JSON.stringify({ error: "Không thể gửi phản hồi." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
