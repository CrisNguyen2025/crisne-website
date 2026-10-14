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

/**
 * Retry hint from the provider error, e.g. Gemini's `"retryDelay": "74291s"` or
 * "Please retry in 20h38m11.3s". Returns null when the error carries no hint.
 */
export function getRetryAfterMs(error: unknown): number | null {
  const message = error instanceof Error ? error.message : String(error);

  const retryDelay = message.match(/retryDelay\\?"\s*:\s*\\?"(\d+(?:\.\d+)?)s/);
  if (retryDelay) return Math.round(Number(retryDelay[1]) * 1000);

  const retryIn = message.match(/retry in (?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?/i);
  if (retryIn && (retryIn[1] || retryIn[2] || retryIn[3])) {
    const [hours, minutes, seconds] = [retryIn[1], retryIn[2], retryIn[3]].map((v) => Number(v ?? 0));
    return Math.round(((hours * 60 + minutes) * 60 + seconds) * 1000);
  }

  return null;
}
