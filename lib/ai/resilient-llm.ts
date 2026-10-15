import { isCircuitOpen, recordLlmFailure } from "./llm-circuit-breaker";
import type { LlmErrorKind } from "./llm-errors";
import {
  getChatModelRefs,
  getProviderFor,
  type LlmGenerateParams,
  type LlmProvider,
  type ModelRef,
  type ProviderName,
} from "./llm-provider";

// Only these are worth retrying on another model; e.g. a bad request would fail everywhere
const FALLBACK_ON: LlmErrorKind[] = ["quota", "upstream", "timeout"];

export interface ResilientResult<T> {
  result: T;
  // Model that actually produced the result
  model: string;
  // Provider serving that model
  provider: ProviderName;
  // Models tried or skipped before it (empty when the primary model answered)
  fallbackFrom: string[];
}

// Same model name on two providers has separate quota, so the circuit is per provider
const circuitKey = (ref: ModelRef) => `${ref.provider}:${ref.model}`;

/**
 * Runs `call` on the first available model of the chain: skips models whose circuit is open,
 * moves to the next model on quota / upstream / timeout errors, rethrows anything else.
 */
async function runWithFallback<T>(
  params: Omit<LlmGenerateParams, "model">,
  call: (provider: LlmProvider, params: LlmGenerateParams) => Promise<T>
): Promise<ResilientResult<T>> {
  const fallbackFrom: string[] = [];
  let lastError: unknown;

  for (const ref of getChatModelRefs()) {
    const key = circuitKey(ref);
    if (isCircuitOpen(key)) {
      fallbackFrom.push(ref.model);
      continue;
    }

    try {
      const result = await call(getProviderFor(ref), { ...params, model: ref.model });
      return { result, model: ref.model, provider: ref.provider, fallbackFrom };
    } catch (error) {
      const kind = recordLlmFailure(key, error);
      if (!FALLBACK_ON.includes(kind)) throw error;
      fallbackFrom.push(ref.model);
      lastError = error;
    }
  }

  // Every model is out of quota or its circuit is open; classified as "quota" downstream
  throw lastError ?? Object.assign(new Error("All models unavailable: quota circuit open"), { status: 429 });
}

export function generateWithFallback(params: Omit<LlmGenerateParams, "model">) {
  return runWithFallback(params, (provider, p) => provider.generate(p));
}

/** Fallback only covers starting the stream; a mid-stream failure is reported by the caller. */
export function generateStreamWithFallback(params: Omit<LlmGenerateParams, "model">) {
  return runWithFallback(params, (provider, p) => provider.generateStream(p));
}
