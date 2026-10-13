import { LangfuseClient } from "@langfuse/client";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { setLangfuseTracerProvider } from "@langfuse/tracing";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";

const isLangfuseEnabled = !!(
  process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY
);

// Kept on globalThis so dev hot reload does not register duplicate providers
const globalForLangfuse = globalThis as unknown as {
  langfuseSpanProcessor?: LangfuseSpanProcessor;
  langfuseClient?: LangfuseClient;
};

function initLangfuse(): LangfuseSpanProcessor | undefined {
  // Without keys, startObservation falls back to a no-op tracer, so tracing is skipped safely
  if (!isLangfuseEnabled) return undefined;

  if (!globalForLangfuse.langfuseSpanProcessor) {
    // "immediate" so spans are not held in a batch when the serverless function freezes
    const spanProcessor = new LangfuseSpanProcessor({ exportMode: "immediate" });
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
 * Records a user's thumbs up (1) / down (0) on a chat trace.
 * Uses a deterministic score id so changing the vote overwrites the previous one.
 */
export async function createFeedbackScore(traceId: string, value: 0 | 1): Promise<void> {
  const langfuseClient = getLangfuseClient();
  if (!langfuseClient) return;

  langfuseClient.score.create({
    id: `${traceId}-user-feedback`,
    traceId,
    name: "user-feedback",
    value,
    dataType: "BOOLEAN",
  });
  await langfuseClient.score.flush();
}
