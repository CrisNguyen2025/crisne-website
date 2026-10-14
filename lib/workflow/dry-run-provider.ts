import type {
  LlmGenerateParams,
  LlmMessage,
  LlmProvider,
  LlmStreamChunk,
  LlmUsage,
} from "@/lib/ai/llm-provider";
import { EMBEDDING_DIMENSION } from "@/lib/ai/gemini";

export function extractPromptPreview(contents: string | LlmMessage[], maxChars = 80): string {
  const raw =
    typeof contents === "string"
      ? contents
      : contents
          .map((m) => m.parts.map((p) => p.text).join(" "))
          .join(" ");
  return raw.trim().slice(0, maxChars);
}

const ZERO_USAGE: LlmUsage = { input: 0, output: 0, total: 0 };

export function createDryRunProvider(): LlmProvider {
  return {
    async generate(params: LlmGenerateParams): Promise<{ text: string; usage?: LlmUsage }> {
      const preview = extractPromptPreview(params.contents);
      return {
        text: `[dry-run] ${preview}`,
        usage: ZERO_USAGE,
      };
    },

    async generateStream(params: LlmGenerateParams): Promise<AsyncIterable<LlmStreamChunk>> {
      const preview = extractPromptPreview(params.contents);
      async function* chunkStream(): AsyncIterable<LlmStreamChunk> {
        yield {
          text: `[dry-run] ${preview}`,
          usage: ZERO_USAGE,
        };
      }
      return chunkStream();
    },

    async embed(): Promise<number[] | null> {
      // Return a predictable synthetic embedding without network or quota
      return new Array(EMBEDDING_DIMENSION).fill(0.01);
    },
  };
}

export const dryRunProvider: LlmProvider = createDryRunProvider();
