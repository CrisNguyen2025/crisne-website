import { NextRequest } from "next/server";
import { createFeedbackScore } from "@/lib/ai/langfuse";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

interface FeedbackRequestPayload {
  traceId: string;
  value: 0 | 1;
}

// W3C trace id format used by Langfuse
const TRACE_ID_PATTERN = /^[0-9a-f]{32}$/;

export async function POST(req: NextRequest) {
  const rateLimit = checkRateLimit(req, { key: "chat-feedback", limit: 60, windowMs: 5 * 60_000 });
  if (!rateLimit.isAllowed) {
    return new Response(null, {
      status: 429,
      headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
    });
  }

  try {
    const { traceId, value } = (await req.json()) as FeedbackRequestPayload;

    if (typeof traceId !== "string" || !TRACE_ID_PATTERN.test(traceId) || (value !== 0 && value !== 1)) {
      return new Response(JSON.stringify({ error: "Invalid feedback payload." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    await createFeedbackScore(traceId, value);
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("Chat feedback error:", error);
    return new Response(JSON.stringify({ error: "Không thể gửi phản hồi." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
