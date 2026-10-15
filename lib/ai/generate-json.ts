import { generateWithFallback } from "./resilient-llm";
import type { LlmGenerateParams, LlmProvider, LlmUsage, ProviderName } from "./llm-provider";

export type JsonResult<T> =
  | { ok: true; value: T; usage?: LlmUsage }
  // `text` is the raw answer when the model replied but it was not the expected JSON
  | { ok: false; error: unknown; text?: string };

// Models sometimes wrap JSON in a ```json fence even in JSON mode; inner fences are kept
const FENCED = /^```(?:json)?\s*([\s\S]*?)\s*```$/i;

export function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  return trimmed.match(FENCED)?.[1] ?? trimmed;
}

function parseJsonAnswer<T>(
  text: string,
  validate: (value: unknown) => value is T,
  usage?: LlmUsage
): JsonResult<T> {
  try {
    const value: unknown = JSON.parse(stripCodeFence(text));
    if (!validate(value)) return { ok: false, error: new Error("JSON answer has an unexpected shape"), text };
    return { ok: true, value, usage };
  } catch (error) {
    return { ok: false, error, text };
  }
}

/**
 * Asks for a JSON answer (native JSON mode), parses it and checks its shape with `validate`.
 * Never throws: a failed call, invalid JSON or a wrong shape all return `{ ok: false }`.
 */
export async function generateJson<T>(
  provider: LlmProvider,
  params: Omit<LlmGenerateParams, "responseFormat">,
  validate: (value: unknown) => value is T
): Promise<JsonResult<T>> {
  try {
    const response = await provider.generate({ ...params, responseFormat: "json" });
    return parseJsonAnswer(response.text, validate, response.usage);
  } catch (error) {
    return { ok: false, error };
  }
}

/**
 * Same as generateJson, on the active provider's model chain: quota / outage / timeout move to
 * the next model. Invalid JSON does not trigger a fallback (another model is not more likely
 * to fix the prompt). Never throws; reports the model that answered when there was one.
 */
export async function generateJsonWithFallback<T>(
  params: Omit<LlmGenerateParams, "model" | "responseFormat">,
  validate: (value: unknown) => value is T
): Promise<JsonResult<T> & { model?: string; provider?: ProviderName }> {
  try {
    const { result, model, provider } = await generateWithFallback({ ...params, responseFormat: "json" });
    return { ...parseJsonAnswer(result.text, validate, result.usage), model, provider };
  } catch (error) {
    return { ok: false, error };
  }
}
