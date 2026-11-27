import { NextRequest } from "next/server";
import { hasWriteAccess } from "@/lib/auth/write-access";
import { checkRateLimit } from "@/lib/rate-limit";
import { JsonObjectSchema } from "@/lib/roadmap/schemas";
import { trimTrailingChar } from "@/lib/utils";

export const dynamic = "force-dynamic";
// Streams the agent's answer (SSE); the Python service may also need a cold start
export const maxDuration = 60;

// Site is Owner-only (ADR-0019), with proxy actor defense-in-depth (ADR-0002): Python only
// accepts RAG_INTERNAL_KEY and only executes writes or Owner threads when x-actor=owner.
const MAX_MESSAGE_LENGTH = 2000;
const POST_PATHS = new Set([
  "chat/stream",
  "chat",
  "chat/plan",
  "chat/confirm",
  "chat/cancel",
  "chat/context",
  "memories/observations/refresh",
]);
// No LLM call behind it: opening the Context sheet must not use up a visitor's questions
const UNLIMITED_PATHS = new Set(["chat/context"]);
const OWNER_ONLY_PATHS = new Set(["memories/observations/refresh"]);
const GET_PATHS = new Set(["health"]);
const SYNC_TIMEOUT_PATHS = new Set([
  "chat",
  "chat/plan",
  "chat/confirm",
  "chat/cancel",
  "chat/context",
  "memories/observations/refresh",
]);
const HEADER_TIMEOUT_STREAM_MS = 5_000;
const HEADER_TIMEOUT_SYNC_MS = 25_000;

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

// A missing or "default" thread would be shared by every caller that sends none (their history, their
// pending preview), so it gets its own id; the service refuses "default" too. Returned in x-thread-id.
const ownThreadId = (id: unknown): string =>
  typeof id === "string" && id.trim() && id.trim().toLowerCase() !== "default" ? id : crypto.randomUUID();

type PreparedPostBody =
  | { ok: true; body: string; threadId: string }
  | { ok: false; response: Response };

async function preparePostBody(req: NextRequest, actor: Actor): Promise<PreparedPostBody> {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return { ok: false, response: jsonError("Invalid JSON body.", 400) };
  }
  const parsedPayload = JsonObjectSchema.safeParse(payload);
  if (!parsedPayload.success) {
    return { ok: false, response: jsonError("Invalid JSON body.", 400) };
  }
  // Same limit as the widget input and the service; refused here before any work is done
  const message = parsedPayload.data.message;
  if (typeof message === "string" && message.length > MAX_MESSAGE_LENGTH) {
    return { ok: false, response: jsonError("Câu hỏi quá dài. Bạn rút gọn giúp mình nhé.", 413) };
  }

  const scoped: Record<string, unknown> = { ...parsedPayload.data };
  if (actor !== "owner") {
    delete scoped.connectors;
  }
  const threadId = ownThreadId(scoped.thread_id);
  scoped.thread_id = scopeThreadId(threadId, actor);
  if (typeof scoped.action_id === "string") scoped.action_id = scopeThreadId(scoped.action_id, actor);
  return { ok: true, body: JSON.stringify(scoped), threadId };
}

function checkVisitorLimit(req: NextRequest, actor: Actor, path: string): Response | null {
  if (actor !== "visitor" || UNLIMITED_PATHS.has(path)) return null;
  const rateLimit = checkRateLimit(req, { key: "roadmap-assistant", limit: 30, windowMs: 5 * 60_000 });
  if (rateLimit.isAllowed) return null;
  return jsonError("Bạn hỏi hơi nhanh rồi, thử lại sau ít phút nhé!", 429, {
    "Retry-After": String(rateLimit.retryAfterSeconds),
  });
}

async function resolveProxyRequest(req: NextRequest, actor: Actor): Promise<PreparedPostBody | null> {
  if (req.method !== "POST") return null;
  return preparePostBody(req, actor);
}

async function forward(req: NextRequest, context: RouteContext, allowedPaths: Set<string>) {
  const path = (await context.params).path.join("/");
  if (!allowedPaths.has(path)) return jsonError("Not found", 404);

  const actor: Actor = (await hasWriteAccess(req)) ? "owner" : "visitor";
  if (OWNER_ONLY_PATHS.has(path) && actor !== "owner") {
    return jsonError("Chỉ chủ sở hữu mới có thể làm mới quan sát.", 403);
  }

  const baseUrl = process.env.RAG_SERVICE_URL;
  const internalKey = process.env.RAG_INTERNAL_KEY;
  if (!baseUrl || !internalKey) return jsonError("Roadmap Assistant is not configured.", 503);

  const rateLimited = checkVisitorLimit(req, actor, path);
  if (rateLimited) return rateLimited;

  const prepared = await resolveProxyRequest(req, actor);
  if (prepared && !prepared.ok) return prepared.response;
  const body = prepared?.body;
  const threadId = prepared?.threadId;

  const connectController = new AbortController();
  const headerTimeoutMs = SYNC_TIMEOUT_PATHS.has(path) ? HEADER_TIMEOUT_SYNC_MS : HEADER_TIMEOUT_STREAM_MS;
  const headerTimer = setTimeout(() => connectController.abort(), headerTimeoutMs);
  const upstreamSignal = req.signal
    ? AbortSignal.any([req.signal, connectController.signal])
    : connectController.signal;

  let upstream: Response;
  try {
    upstream = await fetch(`${trimTrailingChar(baseUrl, "/")}/${path}`, {
      method: req.method,
      headers: { "Content-Type": "application/json", "x-internal-key": internalKey, "x-actor": actor },
      body,
      // Fail fast when FastAPI stalls before sending headers; cleared once headers arrive so SSE streams keep flowing
      signal: upstreamSignal,
    });
  } catch (error) {
    console.error("Roadmap Assistant proxy error:", error);
    return jsonError("Roadmap Assistant is unavailable.", 502);
  } finally {
    clearTimeout(headerTimer);
  }

  // Passed through as-is so SSE events reach the widget as they are produced
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "application/json",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      // The thread this turn ran in (unscoped), so a client that sent none can continue it
      ...(threadId ? { "x-thread-id": threadId } : {}),
    },
  });
}

export async function POST(req: NextRequest, context: RouteContext) {
  return forward(req, context, POST_PATHS);
}

export async function GET(req: NextRequest, context: RouteContext) {
  return forward(req, context, GET_PATHS);
}
