import { classifyLlmError } from "./llm-errors";
import type { LlmGenerateParams, LlmProvider, LlmUsage, StreamPart } from "./llm-provider";

async function* fromChunks(provider: LlmProvider, params: LlmGenerateParams): AsyncGenerator<StreamPart> {
  let usage: LlmUsage | undefined;
  for await (const chunk of await provider.generateStream(params)) {
    if (chunk.text) yield { type: "text-delta", text: chunk.text };
    // Usually only the last chunk carries usage
    if (chunk.usage) usage = chunk.usage;
  }
  yield { type: "finish", usage };
}

/**
 * Typed stream for any provider: uses its native `streamParts` when present, otherwise wraps
 * `generateStream`. Never throws: a failure while opening or mid-stream ends the stream with
 * one `error` part (no `finish`). Stopping iteration early stops pulling from the model.
 */
export async function* streamParts(
  provider: LlmProvider,
  params: LlmGenerateParams
): AsyncGenerator<StreamPart> {
  try {
    yield* provider.streamParts?.(params) ?? fromChunks(provider, params);
  } catch (error) {
    yield { type: "error", error, kind: classifyLlmError(error) };
  }
}
