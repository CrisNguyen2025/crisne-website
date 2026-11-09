import { LangfuseClient } from "@langfuse/client";
import { LangfuseSpanProcessor, type LangfuseSpanProcessorParams } from "@langfuse/otel";
import { setLangfuseTracerProvider } from "@langfuse/tracing";
import { context } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { maskPII } from "./pii-mask";
import { FEEDBACK_SCORE_NAME } from "./chat-config";

// propagateAttributes (traceName / sessionId on every observation) needs async context
// propagation. The isolated Langfuse provider does not register one, so do it here.
// No-op if another context manager (e.g. Next.js OTel) is already registered.
context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());

const isLangfuseEnabled = !!(
  process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY
);

// Kept on globalThis so dev hot reload does not register duplicate providers
const globalForLangfuse = globalThis as unknown as {
  langfuseSpanProcessor?: LangfuseSpanProcessor;
  langfuseClient?: LangfuseClient;
};

/**
 * Single source of the span processor config (PII masking, environment), shared by the
 * app and the contract tests, which only swap the exporter.
 */
export function createLangfuseSpanProcessor(
  overrides: Partial<LangfuseSpanProcessorParams> = {}
): LangfuseSpanProcessor {
  return new LangfuseSpanProcessor({
    // "immediate" so spans are not held in a batch when the serverless function freezes
    exportMode: "immediate",
    // Keeps local testing out of production dashboards (filter by environment in Langfuse)
    environment:
      process.env.LANGFUSE_TRACING_ENVIRONMENT ??
      (process.env.NODE_ENV === "production" ? "production" : "development"),
    // Compare metrics before/after a deploy; Vercel exposes the commit SHA automatically
    release: process.env.LANGFUSE_RELEASE ?? process.env.VERCEL_GIT_COMMIT_SHA,
    // Input/output/metadata arrive as serialized strings; strip visitor emails and phone numbers
    mask: ({ data }) => (typeof data === "string" ? maskPII(data) : data),
    ...overrides,
  });
}

function initLangfuse(): LangfuseSpanProcessor | undefined {
  // Without keys, startObservation falls back to a no-op tracer, so tracing is skipped safely
  if (!isLangfuseEnabled) return undefined;

  if (!globalForLangfuse.langfuseSpanProcessor) {
    const spanProcessor = createLangfuseSpanProcessor();
    // Isolated provider: does not interfere with Next.js' own OpenTelemetry setup
    setLangfuseTracerProvider(new NodeTracerProvider({ spanProcessors: [spanProcessor] }));
    globalForLangfuse.langfuseSpanProcessor = spanProcessor;
  }

  return globalForLangfuse.langfuseSpanProcessor;
}

const langfuseSpanProcessor = initLangfuse();

/**
 * Sends buffered spans to Langfuse. Call inside `after()` so it runs once the response has finished.
 */
export async function flushLangfuse(): Promise<void> {
  await langfuseSpanProcessor?.forceFlush();
}

function getLangfuseClient(): LangfuseClient | undefined {
  if (!isLangfuseEnabled) return undefined;
  globalForLangfuse.langfuseClient ??= new LangfuseClient();
  return globalForLangfuse.langfuseClient;
}

export interface FeedbackDetail {
  reason?: string;
  comment?: string;
  /** Which assistant the vote is about (e.g. "roadmap-assistant"): scores of every chat share one name */
  source?: string;
}

// One feedback score per trace: a repeated or changed vote overwrites it
const feedbackScoreId = (traceId: string) => `${traceId}-user-feedback`;

/**
 * Records a user's thumbs up (1) / down (0) on a chat trace, optionally with the reason and comment.
 * Reason, comment and source are also kept apart in metadata.
 */
export async function createFeedbackScore(
  traceId: string,
  value: 0 | 1,
  detail: FeedbackDetail = {}
): Promise<void> {
  const langfuseClient = getLangfuseClient();
  if (!langfuseClient) return;

  const { reason, comment, source } = detail;
  const metadata = Object.fromEntries(Object.entries({ source, reason, comment }).filter(([, v]) => v));
  langfuseClient.score.create({
    id: feedbackScoreId(traceId),
    traceId,
    name: FEEDBACK_SCORE_NAME,
    value,
    dataType: "BOOLEAN",
    comment: [reason, comment].filter(Boolean).join(" - ") || undefined,
    metadata: Object.keys(metadata).length ? metadata : undefined,
  });
  await langfuseClient.score.flush();
}

/**
 * Puts a 👎 trace in the review queue (LANGFUSE_ANNOTATION_QUEUE_ID, see scripts/setup-langfuse-review.ts),
 * where it is labeled and added to the golden set. Best effort: the vote is already saved as a score.
 */
export async function addToReviewQueue(traceId: string): Promise<void> {
  const queueId = process.env.LANGFUSE_ANNOTATION_QUEUE_ID;
  const langfuseClient = getLangfuseClient();
  if (!queueId || !langfuseClient) return;

  try {
    await langfuseClient.api.annotationQueues.createQueueItem(queueId, { objectId: traceId, objectType: "TRACE" });
  } catch (error) {
    console.error(`[Langfuse] could not add trace ${traceId} to the review queue:`, error);
  }
}

/** Removes the feedback score of a trace (the user took the vote back). Langfuse queues the deletion. */
export async function deleteFeedbackScore(traceId: string): Promise<void> {
  const langfuseClient = getLangfuseClient();
  if (!langfuseClient) return;

  try {
    await langfuseClient.api.legacy.scoreV1.delete(feedbackScoreId(traceId));
  } catch (error) {
    // Already gone: nothing to remove
    if ((error as { statusCode?: number }).statusCode !== 404) throw error;
  }
}
