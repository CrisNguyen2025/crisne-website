export type LlmErrorKind = "quota" | "timeout" | "upstream" | "unknown";

/**
 * Buckets LLM failures so traces and fallbacks can tell "out of quota" apart from an outage.
 */
export function classifyLlmError(error: unknown): LlmErrorKind {
  const { status, name } = (error ?? {}) as { status?: number; name?: string };
  const message = error instanceof Error ? error.message : String(error);

  if (status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(message)) return "quota";
  if (name === "AbortError" || name === "TimeoutError" || /timed? ?out|ETIMEDOUT/i.test(message)) {
    return "timeout";
  }
  if ((typeof status === "number" && status >= 500) || /UNAVAILABLE|INTERNAL/.test(message)) {
    return "upstream";
  }
  return "unknown";
}
