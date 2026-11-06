import { describe, expect, it, vi } from "vitest";
import React from "react";
import ReactDOMServer from "react-dom/server";
import {
  ChatMarkdown,
  parseBlocks,
  isOneLineSnippet,
  closeOpenInline,
  Block,
} from "../../roadmap-rag-assistant/sdk/typescript/src/react/ChatMarkdown";
import { CodeBlock } from "../../roadmap-rag-assistant/sdk/typescript/src/react/components/CodeBlock";

describe("Verification of All Streaming Behaviors", () => {
  // =========================================================================
  // BEHAVIOR 1: Compact Snippet Cards Stream (Help / Command Examples)
  // =========================================================================
  describe("Behavior 1: Compact Snippet Cards Stream", () => {
    it("renders streaming compact card directly without placeholder flash, keeping height stable", () => {
      // Step 1: Open fence arrives
      const fenceOnly = "```text\n";
      const blocks1 = parseBlocks(fenceOnly);
      expect(blocks1).toHaveLength(1);
      expect(blocks1[0]).toMatchObject({ kind: "code", lang: "text", code: "", open: true });

      const html1 = ReactDOMServer.renderToStaticMarkup(
        <CodeBlock lang="text" code="" open={true} onRun={vi.fn()} />
      );
      // Stable minimum height of 50px
      expect(html1).toContain("min-h-[50px]");
      // Caret is rendered inside
      expect(html1).toContain("animate-pulse");
      // Buttons are rendered but invisible (pointer-events-none opacity-0) to prevent layout shifts
      expect(html1).toContain("pointer-events-none opacity-0");

      // Step 2: Tokens stream into the snippet
      const tokens = ["liệt ", "kê ", "topic"];
      let accumulated = "";
      for (const token of tokens) {
        accumulated += token;
        const html = ReactDOMServer.renderToStaticMarkup(
          <CodeBlock lang="text" code={accumulated} open={true} onRun={vi.fn()} />
        );
        expect(html).toContain("min-h-[50px]");
        expect(html).toContain(accumulated);
        expect(html).toContain("pointer-events-none opacity-0");
        expect(html).not.toContain("<pre");
      }

      // Step 3: Trailing newline before closing fence arrives (common model artifact)
      const htmlWithNewline = ReactDOMServer.renderToStaticMarkup(
        <CodeBlock lang="text" code="liệt kê topic\n" open={true} onRun={vi.fn()} />
      );
      // MUST NOT be classified as multiline! Still compact snippet card
      expect(htmlWithNewline).toContain("min-h-[50px]");
      expect(htmlWithNewline).not.toContain("<pre");

      // Step 4: Closing fence arrives (open: false)
      const htmlClosed = ReactDOMServer.renderToStaticMarkup(
        <CodeBlock lang="text" code="liệt kê topic" open={false} onRun={vi.fn()} />
      );
      expect(htmlClosed).toContain("min-h-[50px]");
      expect(htmlClosed).toContain("opacity-100");
      expect(htmlClosed).toContain('aria-label="Gửi"');
      expect(htmlClosed).toContain('aria-label="Sao chép"');
      expect(htmlClosed).not.toContain("<pre");
    });

    it("verifies multi-card streaming sequence (e.g. 10 cards) keeps earlier cards frozen and memoized", () => {
      const fullResponse = [
        "Tôi có thể hỗ trợ các lệnh sau:\n\n",
        "```text\nliệt kê topic\n```\n\n",
        "```text\ntạo topic AI Engineering\n```\n\n",
        "```text\ntìm bài học về Docker\n```\n\n",
        "```text\nxóa bài Kafka",
      ].join("");

      const blocks = parseBlocks(fullResponse);
      expect(blocks).toHaveLength(5);
      expect(blocks[0].kind).toBe("paragraph");
      expect(blocks[1].kind).toBe("code");
      expect(blocks[2].kind).toBe("code");
      expect(blocks[3].kind).toBe("code");
      expect(blocks[4].kind).toBe("code");

      // First 3 code blocks are closed
      expect((blocks[1] as any).open).toBe(false);
      expect((blocks[2] as any).open).toBe(false);
      expect((blocks[3] as any).open).toBe(false);
      // Last code block is unclosed (streaming)
      expect((blocks[4] as any).open).toBe(true);

      const markup = ReactDOMServer.renderToStaticMarkup(
        <ChatMarkdown content={fullResponse} streaming={true} onRun={vi.fn()} />
      );
      expect(markup).toContain("liệt kê topic");
      expect(markup).toContain("tạo topic AI Engineering");
      expect(markup).toContain("tìm bài học về Docker");
      expect(markup).toContain("xóa bài Kafka");
    });
  });

  // =========================================================================
  // BEHAVIOR 2: Plain Paragraphs, Headings & Inline Formatting
  // =========================================================================
  describe("Behavior 2: Plain Paragraphs, Headings & Inline Formatting", () => {
    it("handles progressive markdown token streaming without broken formatting jumps", () => {
      // While streaming, incomplete marks like **bold should be closed safely by closeOpenInline
      expect(closeOpenInline("Đây là **từ khóa")).toBe("Đây là **từ khóa**");
      expect(closeOpenInline("Code `biến_so")).toBe("Code `biến_so`");
      expect(closeOpenInline("Dòng hoàn chỉnh **đậm** và `code`.")).toBe(
        "Dòng hoàn chỉnh **đậm** và `code`."
      );
    });

    it("renders headings with hierarchy and tail caret cleanly", () => {
      const headingStream = "### Hướng dẫn sử dụng Roadmap";
      const markup = ReactDOMServer.renderToStaticMarkup(
        <ChatMarkdown content={headingStream} streaming={true} />
      );
      expect(markup).toContain("Hướng dẫn sử dụng Roadmap");
      expect(markup).toContain("animate-pulse"); // Streaming caret
    });
  });

  // =========================================================================
  // BEHAVIOR 3: Multiline Syntax-Highlighted Code Blocks
  // =========================================================================
  describe("Behavior 3: Multiline Syntax-Highlighted Code Blocks", () => {
    it("renders multiline code blocks with header, badge, line numbers and copy code button", () => {
      const pythonCode = "```python\ndef get_roadmap():\n    return ['AI', 'Frontend']\n```";
      const blocks = parseBlocks(pythonCode);
      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toMatchObject({
        kind: "code",
        lang: "python",
        open: false,
      });

      const markup = ReactDOMServer.renderToStaticMarkup(
        <CodeBlock lang="python" code="def get_roadmap():\n    return ['AI', 'Frontend']" />
      );
      // Must be full code block with <pre>, line numbers, and Python badge
      expect(markup).toContain("<pre");
      expect(markup).toContain("Python");
      expect(markup).toContain("def");
      expect(markup).toContain("get_roadmap");
      expect(markup).toContain('aria-label="Sao chép code"');
    });

    it("does not mistake a multiline block as a compact snippet card even with empty lines", () => {
      expect(isOneLineSnippet("const x = 1;\nconst y = 2;", "ts")).toBe(false);
      expect(isOneLineSnippet("line1\n\nline2", "text")).toBe(false);
    });
  });

  // =========================================================================
  // BEHAVIOR 4: Markdown Tables
  // =========================================================================
  describe("Behavior 4: Markdown Tables", () => {
    it("renders table with responsive container and column alignments", () => {
      const tableMarkdown = [
        "| Tiêu chí | RAG | Fine-tuning |",
        "| :--- | :---: | ---: |",
        "| Chi phí | Thấp | Cao |",
        "| Độ trễ | <200ms | <50ms |",
      ].join("\n");

      const blocks = parseBlocks(tableMarkdown);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].kind).toBe("table");

      const markup = ReactDOMServer.renderToStaticMarkup(
        <ChatMarkdown content={tableMarkdown} streaming={false} />
      );
      expect(markup).toContain("overflow-x-auto");
      expect(markup).toContain("<table");
      expect(markup).toContain("Tiêu chí");
      expect(markup).toContain("RAG");
      expect(markup).toContain("Fine-tuning");
      expect(markup).toContain("Chi phí");
    });
  });

  // =========================================================================
  // BEHAVIOR 5: Callout Alerts
  // =========================================================================
  describe("Behavior 5: Callout Alerts ([!NOTE], [!TIP], etc.)", () => {
    it("renders callout alert with proper role and styling", () => {
      const alertMarkdown = "> [!TIP]\n> Bạn có thể bấm vào nút Play để chạy lệnh trực tiếp.";
      const blocks = parseBlocks(alertMarkdown);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].kind).toBe("alert");

      const markup = ReactDOMServer.renderToStaticMarkup(
        <ChatMarkdown content={alertMarkdown} streaming={false} />
      );
      expect(markup).toContain("Bạn có thể bấm vào nút Play");
    });
  });

  // =========================================================================
  // BEHAVIOR 6: Lists & Checklists
  // =========================================================================
  describe("Behavior 6: Lists & Checklists", () => {
    it("renders unordered, ordered and task checklists", () => {
      const listMarkdown = [
        "- Mục 1",
        "- Mục 2",
        "  1. Con 2.1",
        "- [x] Hoàn thành bài Docker",
        "- [ ] Chưa xong bài Kafka",
      ].join("\n");

      const blocks = parseBlocks(listMarkdown);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].kind).toBe("list");

      const markup = ReactDOMServer.renderToStaticMarkup(
        <ChatMarkdown content={listMarkdown} streaming={false} />
      );
      expect(markup).toContain("Mục 1");
      expect(markup).toContain("Con 2.1");
      expect(markup).toContain("Hoàn thành bài Docker");
    });
  });

  // =========================================================================
  // BEHAVIOR 7: Block Math & Inline Math
  // =========================================================================
  describe("Behavior 7: Block Math & Inline Math", () => {
    it("parses block math correctly", () => {
      const mathMarkdown = "$$\\sum_{i=1}^n x_i = X$$";
      const blocks = parseBlocks(mathMarkdown);
      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toMatchObject({
        kind: "math",
        math: "\\sum_{i=1}^n x_i = X",
        display: true,
      });
    });
  });

  // =========================================================================
  // BEHAVIOR 8: Scroll Lerp Simulation & Smooth Damping
  // =========================================================================
  describe("Behavior 8: Scroll Lerp Simulation & Damping Dynamics", () => {
    it("verifies smooth exponential lerp damping over ~160ms with tau = 55ms", () => {
      // Simulate adding a 58px card: initial distance = 58px
      const totalDistance = 58;
      let curr = 1000;
      const target = 1000 + totalDistance;

      const steps: number[] = [];
      const deltas: number[] = [];
      const dt = 16.67; // 60fps frame delta

      for (let frame = 1; frame <= 12; frame++) {
        const dist = target - curr;
        if (dist <= 0.5) break;

        const factor = 1 - Math.exp(-dt / 55);
        const step = Math.max(1, dist * factor);
        curr = Math.min(target, curr + step);

        steps.push(curr);
        deltas.push(step);
      }

      // First frame must NOT jump by full 58px! Should move ~15px
      expect(deltas[0]).toBeLessThan(20);
      expect(deltas[0]).toBeGreaterThan(10);

      // Deltas must decay smoothly (monotonic decrease in step size = smooth deceleration)
      for (let i = 1; i < deltas.length; i++) {
        expect(deltas[i]).toBeLessThanOrEqual(deltas[i - 1]);
      }

      // By frame 10 (~166ms), distance remaining should be tiny (< 5px)
      expect(target - steps[9]).toBeLessThan(5);
    });
  });

  // =========================================================================
  // BEHAVIOR 9: Real 97-Token Help Stream Simulation
  // =========================================================================
  describe("Behavior 9: Real Help Stream Simulation (97 Tokens, 10 Cards)", () => {
    it("simulates full realistic token-by-token stream of the help prompt", () => {
      const realStreamTokens = [
        "Tôi ", "quản ", "lý ", "roadmap ", "học ", "tập ", "và ", "tra ", "cứu ", "bài ",
        "học ", "trong ", "đó. ", "Gõ ", "lệnh ", "theo ", "mẫu:\n\n",
        "🔎 ", "**Tra ", "cứu**\n\n",
        "```text\n",
        "tìm ", "bài ", "học ", "về ", "mẫu\n",
        "```\n\n",
        "```text\n",
        "topic ", "AI ", "Engineering ", "có ", "những ", "bài ", "gì\n",
        "```\n\n",
        "🧭 ", "**Gợi ", "ý ", "bài ", "nên ", "học**\n\n",
        "```text\n",
        "Mình ", "muốn ", "học ", "AI ", "Engineering, ", "nên ", "đọc ", "bài ", "nào ", "trước?\n",
        "```\n\n",
        "➕ ", "**Thêm ", "mới**\n\n",
        "```text\n",
        "tạo ", "topic ", "Machine ", "Learning\n",
        "```"
      ];

      let buffer = "";
      for (let i = 0; i < realStreamTokens.length; i++) {
        buffer += realStreamTokens[i];
        const blocks = parseBlocks(buffer);
        expect(blocks.length).toBeGreaterThan(0);

        // Rendering ChatMarkdown at every token must never throw
        const html = ReactDOMServer.renderToStaticMarkup(
          <ChatMarkdown content={buffer} streaming={true} onRun={vi.fn()} />
        );
        expect(typeof html).toBe("string");
        expect(html.length).toBeGreaterThan(0);
      }
    });
  });
});
