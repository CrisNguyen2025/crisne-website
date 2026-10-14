import { CHAT_MODEL_CHAIN } from "./gemini";
import { isCircuitOpen, recordLlmFailure } from "./llm-circuit-breaker";
import type { LlmErrorKind } from "./llm-errors";
import { getLlmProvider, type LlmGenerateParams } from "./llm-provider";

// Only these are worth retrying on another model; e.g. a bad request would fail everywhere
const FALLBACK_ON: LlmErrorKind[] = ["quota", "upstream", "timeout"];

export interface ResilientResult<T> {
  result: T;
  // Model that actually produced the result
  model: string;
  // Models tried or skipped before it (empty when the primary model answered)
  fallbackFrom: string[];
}

/**
 * Runs `call` on the first available model of the chain: skips models whose circuit is open,
 * moves to the next model on quota / upstream / timeout errors, rethrows anything else.
 */
async function runWithFallback<T>(
  params: Omit<LlmGenerateParams, "model">,
  call: (params: LlmGenerateParams) => Promise<T>
): Promise<ResilientResult<T>> {
  const fallbackFrom: string[] = [];
  let lastError: unknown;

  for (const model of CHAT_MODEL_CHAIN) {
    if (isCircuitOpen(model)) {
      fallbackFrom.push(model);
      continue;
    }

    try {
      return { result: await call({ ...params, model }), model, fallbackFrom };
    } catch (error) {
      const kind = recordLlmFailure(model, error);
      if (!FALLBACK_ON.includes(kind)) throw error;
      fallbackFrom.push(model);
      lastError = error;
    }
  }

  // Every model is out of quota or its circuit is open; classified as "quota" downstream
  throw lastError ?? Object.assign(new Error("All models unavailable: quota circuit open"), { status: 429 });
}

export function generateWithFallback(params: Omit<LlmGenerateParams, "model">) {
  return runWithFallback(params, (p) => getLlmProvider().generate(p));
}

/** Fallback only covers starting the stream; a mid-stream failure is reported by the caller. */
export function generateStreamWithFallback(params: Omit<LlmGenerateParams, "model">) {
  return runWithFallback(params, (p) => getLlmProvider().generateStream(p));
}
