import { describe, expect, it } from "vitest";
import { contentsToText, isChatMessages, toAlternatingTurns } from "@/lib/ai/chat-messages";
import type { ChatMessage } from "@/lib/ai/llm-provider";

const text = (role: ChatMessage["role"], value: string): ChatMessage => ({
  role,
  content: [{ type: "text", text: value }],
});

describe("isChatMessages", () => {
  it("tells neutral messages apart from strings and legacy turns", () => {
    expect(isChatMessages([text("user", "hi")])).toBe(true);
    expect(isChatMessages("hi")).toBe(false);
    expect(isChatMessages([{ role: "user", parts: [{ text: "hi" }] }])).toBe(false);
    // Empty arrays are treated as legacy and passed through
    expect(isChatMessages([])).toBe(false);
  });
});

describe("toAlternatingTurns", () => {
  it("maps assistant to model and keeps alternating turns as they are", () => {
    expect(toAlternatingTurns([text("user", "Hỏi"), text("assistant", "Đáp"), text("user", "Hỏi tiếp")])).toEqual([
      { role: "user", parts: [{ text: "Hỏi" }] },
      { role: "model", parts: [{ text: "Đáp" }] },
      { role: "user", parts: [{ text: "Hỏi tiếp" }] },
    ]);
  });

  it("drops leading assistant turns, blank text and trims, merging same-role turns", () => {
    expect(
      toAlternatingTurns([
        text("assistant", "Xin chào"),
        text("user", "  Kể về Zelene "),
        text("user", "   "),
        text("user", "và Kamala"),
        text("assistant", "Hai dự án."),
        text("assistant", "Cả hai dùng Next.js."),
      ])
    ).toEqual([
      { role: "user", parts: [{ text: "Kể về Zelene" }, { text: "và Kamala" }] },
      { role: "model", parts: [{ text: "Hai dự án." }, { text: "Cả hai dùng Next.js." }] },
    ]);
  });

  it("skips tool messages and non-text parts until tool calling is supported", () => {
    expect(
      toAlternatingTurns([
        {
          role: "user",
          content: [
            { type: "text", text: "Tra cứu" },
            { type: "tool-result", toolCallId: "1", toolName: "search", output: {} },
          ],
        },
        { role: "tool", content: [{ type: "tool-result", toolCallId: "1", toolName: "search", output: {} }] },
        {
          role: "assistant",
          content: [{ type: "tool-call", toolCallId: "1", toolName: "search", input: {} }],
        },
      ])
    ).toEqual([{ role: "user", parts: [{ text: "Tra cứu" }] }]);
  });
});

describe("contentsToText", () => {
  it("joins the text of strings, legacy turns and neutral messages", () => {
    expect(contentsToText("hi")).toBe("hi");
    expect(contentsToText([{ role: "user", parts: [{ text: "a" }, { text: "b" }] }])).toBe("a b");
    expect(contentsToText([text("user", "a"), text("assistant", "b")])).toBe("a b");
  });
});
