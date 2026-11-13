import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RoadmapChatClient } from "@/roadmap-rag-assistant/sdk/typescript/src/client";
import type { ConversationContext } from "@/roadmap-rag-assistant/sdk/typescript/src/types";
import { ContextUsageSheet } from "@/roadmap-rag-assistant/sdk/typescript/src/react/components/ContextUsageSheet";
import {
  formatPercent,
  formatTokenCount,
  formatTokenDelta,
} from "@/roadmap-rag-assistant/sdk/typescript/src/react/utils/formatters";

const context = (overrides: Partial<ConversationContext> = {}): ConversationContext => ({
  model: "openai/gpt-oss-120b",
  window: 131_072,
  budget: 10_000,
  used: 1_500,
  parts: [
    { key: "system", label: "System prompt", tokens: 1_000 },
    { key: "messages", label: "Tin nhắn", tokens: 500, count: 6, limit: 20 },
  ],
  reserved: [
    { key: "retrieved", label: "Tài liệu truy xuất", tokens: 1_200, count: 4 },
    { key: "message", label: "Câu hỏi kế tiếp", tokens: 500 },
    { key: "output", label: "Câu trả lời", tokens: 2_048 },
  ],
  omitted: [],
  last_turn: null,
  ...overrides,
});

const render = (data: ConversationContext | null, extra: { deltaTokens?: number; error?: string } = {}) =>
  renderToStaticMarkup(
    React.createElement(ContextUsageSheet, {
      context: { data, isLoading: !data && !extra.error, error: extra.error ?? null, deltaTokens: extra.deltaTokens },
      onRetry: () => {},
      onClose: () => {},
    })
  );

afterEach(() => vi.unstubAllGlobals());

describe("RoadmapChatClient.getConversationContext", () => {
  it("posts the thread and returns the context", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(context()), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const data = await new RoadmapChatClient({ baseUrl: "http://rag.test" }).getConversationContext("t1");

    expect(fetchMock).toHaveBeenCalledWith("http://rag.test/chat/context", expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ thread_id: "t1" });
    expect(data.budget).toBe(10_000);
  });

  it("throws with the status so the sheet can offer a retry", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 429 })));

    await expect(new RoadmapChatClient({ baseUrl: "http://rag.test" }).getConversationContext("t1")).rejects.toThrow("(429)");
  });
});

describe("ContextUsageSheet", () => {
  it("shows usage against Abot's budget, the window, reserved slots and free space", () => {
    const html = render(context());

    expect(html).toContain("15% đã dùng");
    expect(html).toContain("1.5k / 10k");
    expect(html).toContain("Tin nhắn · 6 / 20");
    expect(html).toContain("Giữ chỗ: Tài liệu truy xuất · tối đa 4");
    expect(html).toContain("Giữ chỗ: Câu trả lời");
    // 10000 - 1500 used - 3748 reserved
    expect(html).toContain("4.8k");
    expect(html).toContain("window 131.1k");
    expect(html).toContain("tin cũ nhất sẽ rơi ra");
  });

  it("says when the message window is full and lists what was left out without a share", () => {
    const html = render(
      context({
        parts: [
          { key: "system", label: "System prompt", tokens: 1_000 },
          { key: "messages", label: "Tin nhắn", tokens: 500, count: 20, limit: 20 },
        ],
        omitted: [{ key: "history_outside", label: "Tin nhắn ngoài cửa sổ", count: 3 }],
      })
    );

    expect(html).toContain("Cửa sổ tin nhắn đã đầy");
    expect(html).toContain("Tin nhắn ngoài cửa sổ");
    expect(html).toContain("—");
  });

  it("shows the change since the last look and the last answer", () => {
    const html = render(
      context({
        last_turn: {
          input_tokens: 2_400,
          output_tokens: 300,
          measured: true,
          retrieved_tokens: 800,
          documents: [{ label: "Docker", tokens: 800 }],
          dropped_documents: 0,
        },
      }),
      { deltaTokens: 266 }
    );

    expect(html).toContain("Thay đổi từ lần xem trước");
    expect(html).toContain("+266");
    expect(html).toContain("Lượt trả lời gần nhất");
    expect(html).toContain("Đầu vào (provider đo)");
    expect(html).toMatch(/Tài liệu truy xuất · (<!-- -->)?1/);
  });

  it("shows loading, then an error with a retry", () => {
    expect(render(null)).toContain("Đang tải context");
    expect(render(null, { error: "Chưa tải được context. Bạn thử lại nhé." })).toContain("Thử lại");
  });
});

describe("token formatters", () => {
  it("formats counts, shares and signed changes", () => {
    expect(formatTokenCount(842)).toBe("842");
    expect(formatTokenCount(12_400)).toBe("12.4k");
    expect(formatTokenCount(1_000_000)).toBe("1M");
    expect(formatPercent(0, 100)).toBe("0%");
    expect(formatPercent(1, 100_000)).toBe("<0.1%");
    expect(formatPercent(1_540, 131_072)).toBe("1.2%");
    expect(formatPercent(50, 100)).toBe("50%");
    expect(formatTokenDelta(320)).toBe("+320");
    expect(formatTokenDelta(-1_200)).toBe("−1.2k");
    expect(formatTokenDelta(0)).toBe("±0");
  });
});
