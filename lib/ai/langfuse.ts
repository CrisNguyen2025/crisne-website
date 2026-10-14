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

/**
 * Records a user's thumbs up (1) / down (0) on a chat trace, optionally with detail comments.
 * Uses a deterministic score id so changing the vote overwrites the previous one.
 */
export async function createFeedbackScore(
  traceId: string,
  value: 0 | 1,
  comment?: string
): Promise<void> {
  const langfuseClient = getLangfuseClient();
  if (!langfuseClient) return;

  langfuseClient.score.create({
    id: `${traceId}-user-feedback`,
    traceId,
    name: FEEDBACK_SCORE_NAME,
    value,
    dataType: "BOOLEAN",
    comment: comment?.trim() || undefined,
  });
  await langfuseClient.score.flush();
}
