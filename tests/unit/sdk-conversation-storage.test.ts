import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_STORED_MESSAGES,
  clearConversation,
  conversationKey,
  loadConversation,
  saveConversation,
} from "@/roadmap-rag-assistant/sdk/typescript/src/react/storage";
import type { ChatMessage } from "@/roadmap-rag-assistant/sdk/typescript/src/react/types";

const KEY = conversationKey("/api/roadmap-assistant");

// The suite runs in Node: stand in for the browser's sessionStorage
function fakeSessionStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => (data.has(k) ? (data.get(k) as string) : null),
    setItem: (k: string, v: string) => void data.set(k, String(v)),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
  };
}
const msg = (i: number): ChatMessage => ({
  id: `m-${i}`,
  role: i % 2 === 0 ? "user" : "assistant",
  content: `câu ${i}`,
  timestamp: new Date("2026-10-17T08:00:00Z"),
  status: "complete",
});

describe("conversation storage (P1-4)", () => {
  let store: ReturnType<typeof fakeSessionStorage>;
  beforeEach(() => {
    store = fakeSessionStorage();
    vi.stubGlobal("window", { sessionStorage: store });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("round-trips messages and the conversation id, reviving timestamps as Dates", () => {
    saveConversation(KEY, { conversationId: "conv-1", messages: [msg(0), msg(1)] });
    const loaded = loadConversation(KEY);
    expect(loaded?.conversationId).toBe("conv-1");
    expect(loaded?.messages.map((m) => m.content)).toEqual(["câu 0", "câu 1"]);
    expect(loaded?.messages[0].timestamp).toBeInstanceOf(Date);
  });

  it("keeps only the most recent messages", () => {
    const many = Array.from({ length: MAX_STORED_MESSAGES + 10 }, (_, i) => msg(i));
    saveConversation(KEY, { conversationId: "c", messages: many });
    const loaded = loadConversation(KEY);
    expect(loaded?.messages).toHaveLength(MAX_STORED_MESSAGES);
    expect(loaded?.messages.at(-1)?.content).toBe(`câu ${MAX_STORED_MESSAGES + 9}`);
  });

  it("ignores malformed or foreign data instead of crashing", () => {
    store.setItem(KEY, "{not json");
    expect(loadConversation(KEY)).toBeNull();
    store.setItem(KEY, JSON.stringify({ conversationId: 1, messages: [] }));
    expect(loadConversation(KEY)).toBeNull();
    store.setItem(KEY, JSON.stringify({ conversationId: "c", messages: [{ id: 1 }] }));
    expect(loadConversation(KEY)).toBeNull();
  });

  it("works without storage: blocked access reads as empty and writes are dropped quietly", () => {
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: () => {
          throw new Error("SecurityError");
        },
        setItem: () => {
          throw new Error("QuotaExceededError");
        },
        removeItem: () => {
          throw new Error("SecurityError");
        },
      },
    });
    expect(loadConversation(KEY)).toBeNull();
    expect(() => saveConversation(KEY, { conversationId: "c", messages: [msg(0)] })).not.toThrow();
  });

  it("clearConversation removes the saved history", () => {
    saveConversation(KEY, { conversationId: "c", messages: [msg(0)] });
    clearConversation(KEY);
    expect(loadConversation(KEY)).toBeNull();
  });
});
