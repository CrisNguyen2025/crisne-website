import { NextRequest } from "next/server";
import { hasWriteAccess } from "@/lib/auth/write-access";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
// Streams the agent's answer (SSE); the Python service may also need a cold start
export const maxDuration = 60;

// Public on purpose: visitors chat with the Roadmap Assistant without signing in. The Python
// service only accepts requests carrying RAG_INTERNAL_KEY and only runs writes for x-actor=owner.
const POST_PATHS = new Set(["chat/stream", "chat", "chat/plan", "chat/confirm", "chat/cancel"]);
const GET_PATHS = new Set(["health"]);

type Actor = "owner" | "visitor";

interface RouteContext {
  params: Promise<{ path: string[] }>;
}

const jsonError = (error: string, status: number, headers?: Record<string, string>) =>
  new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });

// Threads are namespaced by caller, so a visitor can never reach the owner's pending action.
// Ids the service already returned (e.g. an action_preview's action_id) keep their prefix.
const scopeThreadId = (id: string, actor: Actor) => (id.startsWith(`${actor}:`) ? id : `${actor}:${id}`);

async function forward(req: NextRequest, context: RouteContext, allowedPaths: Set<string>) {
  const path = (await context.params).path.join("/");
  if (!allowedPaths.has(path)) return jsonError("Not found", 404);

  const baseUrl = process.env.RAG_SERVICE_URL;
  const internalKey = process.env.RAG_INTERNAL_KEY;
  if (!baseUrl || !internalKey) return jsonError("Roadmap Assistant is not configured.", 503);

  const actor: Actor = (await hasWriteAccess(req)) ? "owner" : "visitor";

  if (actor === "visitor") {
    const rateLimit = checkRateLimit(req, { key: "roadmap-assistant", limit: 30, windowMs: 5 * 60_000 });
    if (!rateLimit.isAllowed) {
      return jsonError("Bạn hỏi hơi nhanh rồi, thử lại sau ít phút nhé!", 429, {
        "Retry-After": String(rateLimit.retryAfterSeconds),
      });
    }
  }

  let body: string | undefined;
  if (req.method === "POST") {
    let payload: unknown;
    try {
      payload = await req.json();
    } catch {
      return jsonError("Invalid JSON body.", 400);
    }
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
      return jsonError("Invalid JSON body.", 400);
    }

    const scoped: Record<string, unknown> = { ...payload };
    scoped.thread_id = scopeThreadId(typeof scoped.thread_id === "string" ? scoped.thread_id : "default", actor);
    if (typeof scoped.action_id === "string") scoped.action_id = scopeThreadId(scoped.action_id, actor);
    body = JSON.stringify(scoped);
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${baseUrl.replace(/\/+$/, "")}/${path}`, {
      method: req.method,
      headers: { "Content-Type": "application/json", "x-internal-key": internalKey, "x-actor": actor },
      body,
      // Stop the agent when the visitor closes the chat or presses stop
      signal: req.signal,
    });
  } catch (error) {
    console.error("Roadmap Assistant proxy error:", error);
    return jsonError("Roadmap Assistant is unavailable.", 502);
  }

  // Passed through as-is so SSE events reach the widget as they are produced
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "application/json",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function POST(req: NextRequest, context: RouteContext) {
  return forward(req, context, POST_PATHS);
}

export async function GET(req: NextRequest, context: RouteContext) {
  return forward(req, context, GET_PATHS);
}
