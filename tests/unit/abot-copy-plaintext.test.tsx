// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  markdownToPlainText,
  stripInlineMarkdown,
} from "@/roadmap-rag-assistant/sdk/typescript/src/react/ChatMarkdown";
import { MessageList } from "@/roadmap-rag-assistant/sdk/typescript/src/react/components/MessageList";
import { RoadmapChatbotWidget } from "@/roadmap-rag-assistant/sdk/typescript/src/react/RoadmapChatbotWidget";

const TRACE_802_RESPONSE = `AI & LLM Architecture Roadmap gồm 117 bài học, được chia thành 5 tầng chính:

- **01. Tầng Dữ liệu & Tri thức (Knowledge Base)**
  - Core: 8 bài  
  - Trung cấp: 7 bài  
  - Nâng cao: 7 bài  

- **02. Tầng LLM Application Layer**
  - Core: 7 bài  
  - Context Engineering: 13 bài  
  - Trung cấp: 7 bài  
  - Nâng cao: 6 bài  

- **03. Tầng RAG + Agent Layer**
  - Core: 7 bài  
  - Trung cấp: 7 bài  
  - Nâng cao: 9 bài  

- **04. Tầng Ops & Đánh giá (LLMOps)**
  - Core: 6 bài  
  - Trung cấp: 8 bài  
  - Nâng cao: 7 bài  

- **05. Tầng Sản phẩm Production (Triển khai & Vận hành)**
  - Core: 5 bài  
  - Trung cấp: 6 bài  
  - Nâng cao: 7 bài

`;

describe("markdownToPlainText & stripInlineMarkdown", () => {
  it("converts trace 802bbbd443559974bc6158cb985b2dc0 response to clean plain text without markdown syntax", () => {
    const result = markdownToPlainText(TRACE_802_RESPONSE);
    expect(result).toBe(
      [
        "AI & LLM Architecture Roadmap gồm 117 bài học, được chia thành 5 tầng chính:",
        "",
        "• 01. Tầng Dữ liệu & Tri thức (Knowledge Base)",
        "  • Core: 8 bài",
        "  • Trung cấp: 7 bài",
        "  • Nâng cao: 7 bài",
        "",
        "• 02. Tầng LLM Application Layer",
        "  • Core: 7 bài",
        "  • Context Engineering: 13 bài",
        "  • Trung cấp: 7 bài",
        "  • Nâng cao: 6 bài",
        "",
        "• 03. Tầng RAG + Agent Layer",
        "  • Core: 7 bài",
        "  • Trung cấp: 7 bài",
        "  • Nâng cao: 9 bài",
        "",
        "• 04. Tầng Ops & Đánh giá (LLMOps)",
        "  • Core: 6 bài",
        "  • Trung cấp: 8 bài",
        "  • Nâng cao: 7 bài",
        "",
        "• 05. Tầng Sản phẩm Production (Triển khai & Vận hành)",
        "  • Core: 5 bài",
        "  • Trung cấp: 6 bài",
        "  • Nâng cao: 7 bài",
      ].join("\n")
    );
    expect(result).not.toContain("**");
    expect(result).not.toMatch(/^\s*- /m);
  });

  it("strips inline formatting while preserving code content, snake_case, currency, and placeholders", () => {
    expect(stripInlineMarkdown("**đậm** *nghiêng* _nghiêng2_ ***cả hai*** ==nổi bật== ~~gạch~~")).toBe(
      "đậm nghiêng nghiêng2 cả hai nổi bật gạch"
    );
    expect(stripInlineMarkdown("Dùng `**giữ nguyên**` trong code")).toBe("Dùng **giữ nguyên** trong code");
    expect(stripInlineMarkdown("Xem [**Docker**](/topic/docker) và ![Sơ đồ](https://example.com/a.png)")).toBe(
      "Xem Docker và Sơ đồ"
    );
    expect(stripInlineMarkdown("Công thức $E = mc^2$ và giá $50 và $100")).toBe(
      "Công thức E = mc^2 và giá $50 và $100"
    );
    expect(stripInlineMarkdown("Hàm search_live_knowledge và __init__")).toBe(
      "Hàm search_live_knowledge và __init__"
    );
    expect(stripInlineMarkdown("Ví dụ: tạo topic <tên topic> với \\*sao\\* và \\$50")).toBe(
      "Ví dụ: tạo topic <tên topic> với *sao* và $50"
    );
  });

  it("strips block-level markdown across headings, lists, checklists, code, quotes, alerts, tables, math, and rules", () => {
    const md = [
      "## **Tổng quan** [API](/api)",
      "",
      "1. Bước một",
      "   - Chi tiết A",
      "2. Bước hai",
      "",
      "- [x] Đã xong",
      "- [ ] Chưa xong",
      "",
      "```typescript",
      "const x = 1;",
      "```",
      "",
      "```text",
      "Xem lộ trình AI",
      "```",
      "",
      "> Trích dẫn **hay**",
      "",
      "> [!WARNING] Lưu ý",
      "> Không xóa dữ liệu",
      "",
      "| Tên | Trạng thái |",
      "| :--- | :---: |",
      "| **RAG** | `known` |",
      "",
      "$$",
      "a^2 + b^2 = c^2",
      "$$",
      "",
      "---",
    ].join("\n");

    expect(markdownToPlainText(md)).toBe(
      [
        "Tổng quan API",
        "",
        "1. Bước một",
        "  • Chi tiết A",
        "2. Bước hai",
        "",
        "☑ Đã xong",
        "☐ Chưa xong",
        "",
        "const x = 1;",
        "",
        "Xem lộ trình AI",
        "",
        "Trích dẫn hay",
        "",
        "Lưu ý:\nKhông xóa dữ liệu",
        "",
        "Tên\tTrạng thái\nRAG\tknown",
        "",
        "a^2 + b^2 = c^2",
      ].join("\n")
    );
  });

  it("handles empty inputs, horizontal rules only, and deep/large unclosed markdown safely", () => {
    expect(markdownToPlainText("")).toBe("");
    expect(markdownToPlainText("   \n\n  ")).toBe("");
    expect(markdownToPlainText("---")).toBe("");

    const deep = "**".repeat(100) + "ok" + "**".repeat(100);
    expect(() => markdownToPlainText(deep)).not.toThrow();

    const start = performance.now();
    const huge = "**" + "A".repeat(50000);
    expect(markdownToPlainText(huge)).toBe(huge);
    expect(performance.now() - start).toBeLessThan(100);
  });
});

describe("Message copy behavior", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("copies plain text for assistant replies while keeping user messages and trace IDs verbatim", () => {
    const copyMessage = vi.fn();
    const scrollRef = React.createRef<HTMLDivElement>();
    const bottomSentinelRef = React.createRef<HTMLDivElement>();
    const traceId = "802bbbd443559974bc6158cb985b2dc0";

    render(
      <MessageList
        messages={[
          {
            id: "u1",
            role: "user",
            content: "Hỏi **giữ nguyên** `code`",
            timestamp: new Date(),
          },
          {
            id: "a1",
            role: "assistant",
            content: "## Tiêu đề\n\n- **Mục 1**\n  - Con 1  ",
            traceId,
            timestamp: new Date(),
          },
        ]}
        isLoading={false}
        isStreaming={false}
        runningCode={null}
        expandedTools={{}}
        feedback={{}}
        copiedId={null}
        canWrite={true}
        sendMessage={vi.fn()}
        retry={vi.fn()}
        copyMessage={copyMessage}
        handleFeedback={vi.fn()}
        handleRunCode={vi.fn()}
        toggleToolExpand={vi.fn()}
        scrollRef={scrollRef}
        bottomSentinelRef={bottomSentinelRef}
        scrollToBottom={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Sao chép câu trả lời" }));
    expect(copyMessage).toHaveBeenNthCalledWith(1, "a1", "Tiêu đề\n\n• Mục 1\n  • Con 1");

    fireEvent.click(screen.getByRole("button", { name: "Sao chép câu hỏi" }));
    expect(copyMessage).toHaveBeenNthCalledWith(2, "u1", "Hỏi **giữ nguyên** `code`");

    fireEvent.click(screen.getByRole("button", { name: "Sao chép trace ID của câu trả lời" }));
    expect(copyMessage).toHaveBeenNthCalledWith(3, "a1:trace", traceId);
  });

  it("writes plain text to clipboard when user clicks copy on an Abot response in RoadmapChatbotWidget", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          new ReadableStream({
            start(c) {
              c.enqueue(
                new TextEncoder().encode(
                  `event: done\ndata: ${JSON.stringify({ message: TRACE_802_RESPONSE })}\n\n`
                )
              );
              c.close();
            },
          }),
          { status: 200 }
        )
      )
    );

    render(<RoadmapChatbotWidget baseUrl="/api/roadmap-assistant" initialOpen />);
    fireEvent.change(screen.getByPlaceholderText(/Hỏi Abot/), { target: { value: "hỏi lộ trình" } });
    fireEvent.click(screen.getByRole("button", { name: "Gửi tin nhắn" }));

    await screen.findByText(/01\. Tầng Dữ liệu & Tri thức/);

    fireEvent.click(screen.getByRole("button", { name: "Sao chép câu trả lời" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const copied = writeText.mock.calls[0][0] as string;
    expect(copied).toContain("• 01. Tầng Dữ liệu & Tri thức (Knowledge Base)");
    expect(copied).toContain("  • Core: 8 bài");
    expect(copied).not.toContain("**");
    expect(copied).not.toMatch(/^\s*- /m);
  });
});
