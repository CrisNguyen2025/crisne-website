import { describe, expect, it } from "vitest";
import { createDryRunProvider, extractPromptPreview } from "@/lib/workflow/dry-run-provider";
import { EMBEDDING_DIMENSION } from "@/lib/ai/gemini";

// Baseline for the AI-layer refactor: dry-run must keep working for both prompt shapes
describe("extractPromptPreview", () => {
  it("trims a string prompt and caps it at maxChars", () => {
    expect(extractPromptPreview("  Tóm tắt tài liệu  ")).toBe("Tóm tắt tài liệu");
    expect(extractPromptPreview("a".repeat(200))).toHaveLength(80);
    expect(extractPromptPreview("abcdef", 3)).toBe("abc");
  });

  it("joins every part of every message with spaces", () => {
    expect(
      extractPromptPreview([
        { role: "user", parts: [{ text: "Kể về" }, { text: "Zelene" }] },
        { role: "model", parts: [{ text: "Zelene là app." }] },
      ])
    ).toBe("Kể về Zelene Zelene là app.");
  });

  it("reads neutral ChatMessage text the same way", () => {
    expect(
      extractPromptPreview([
        { role: "user", content: [{ type: "text", text: "Kể về" }, { type: "text", text: "Zelene" }] },
        { role: "assistant", content: [{ type: "text", text: "Zelene là app." }] },
      ])
    ).toBe("Kể về Zelene Zelene là app.");
  });
});

describe("createDryRunProvider", () => {
  const params = {
    model: "gemini-2.5-flash",
    systemInstruction: "",
    contents: "Tóm tắt tài liệu",
    temperature: 0.3,
    maxOutputTokens: 100,
  };

  it("echoes the prompt preview with zero usage, without network", async () => {
    const provider = createDryRunProvider();
    expect(await provider.generate(params)).toEqual({
      text: "[dry-run] Tóm tắt tài liệu",
      usage: { input: 0, output: 0, total: 0 },
    });

    const chunks = [];
    for await (const chunk of await provider.generateStream(params)) chunks.push(chunk);
    expect(chunks).toEqual([{ text: "[dry-run] Tóm tắt tài liệu", usage: { input: 0, output: 0, total: 0 } }]);
  });

  it("returns a constant embedding of the shared dimension", async () => {
    const vector = await createDryRunProvider().embed("x", "RETRIEVAL_QUERY");
    expect(vector).toHaveLength(EMBEDDING_DIMENSION);
    expect(new Set(vector)).toEqual(new Set([0.01]));
  });
});
