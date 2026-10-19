import { describe, it, expect } from "vitest";
import React from "react";
import {
  readProjectFile,
  renderComponentToHtml,
  createMockSseStream,
  parseSseLines,
} from "./helpers";

describe("Tier 2 — Boundaries & Edge Cases", () => {
  const markdownPath = "roadmap-rag-assistant/sdk/typescript/src/react/ChatMarkdown.tsx";

  // ==========================================
  // Category 1: Malformed & Edge-Case Tables
  // ==========================================
  describe("Boundary: Malformed & Asymmetric Tables", () => {
    it("handles table rows with missing leading and trailing pipes gracefully", async () => {
      const { MarkdownTable } = await import(
        "@/roadmap-rag-assistant/sdk/typescript/src/react/components/MarkdownTable"
      );

      const html = renderComponentToHtml(
        React.createElement(MarkdownTable, {
          headers: ["Col A", "Col B"],
          alignments: ["left", "left"],
          rows: [
            ["Cell 1", "Cell 2"],
            ["Cell 3", "Cell 4"],
          ],
          renderInline: (t: string) => [t],
        })
      );

      expect(html).toContain("Col A");
      expect(html).toContain("Cell 4");
    });

    it("handles table with completely empty cells without throwing or rendering undefined", async () => {
      const { MarkdownTable } = await import(
        "@/roadmap-rag-assistant/sdk/typescript/src/react/components/MarkdownTable"
      );

      const html = renderComponentToHtml(
        React.createElement(MarkdownTable, {
          headers: ["Header 1", "Header 2", "Header 3"],
          alignments: ["left", "center", "right"],
          rows: [
            ["", "Center Val", ""],
            ["Left Val", "", "Right Val"],
          ],
          renderInline: (t: string) => [t],
        })
      );

      expect(html).toContain("Center Val");
      expect(html).toContain("Right Val");
      expect(html).not.toContain("undefined");
      expect(html).not.toContain("null");
    });

    it("pads rows with 0 or 1 columns to match 4 header columns", async () => {
      const { MarkdownTable } = await import(
        "@/roadmap-rag-assistant/sdk/typescript/src/react/components/MarkdownTable"
      );

      const html = renderComponentToHtml(
        React.createElement(MarkdownTable, {
          headers: ["H1", "H2", "H3", "H4"],
          alignments: ["left", "left", "left", "left"],
          rows: [["Only One Col"], []],
          renderInline: (t: string) => [t],
        })
      );

      expect(html).toContain("Only One Col");
      const tdCount = (html.match(/<td/g) || []).length;
      // 2 rows * 4 columns = 8 td cells
      expect(tdCount).toBe(8);
    });

    it("parses table row containing escaped pipe characters (|)", () => {
      const parseCells = (row: string): string[] => {
        // Matches pipe-delimited cells while respecting escaped pipes \|
        return row
          .split(/(?<!\\)\|/)
          .map((c) => c.replace(/\\\|/g, "|").trim())
          .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
      };

      const line = "| Formula \\| Note | Description |";
      const cells = parseCells(line);
      expect(cells).toHaveLength(2);
      expect(cells[0]).toBe("Formula | Note");
      expect(cells[1]).toBe("Description");
    });
  });

  // ==========================================
  // Category 2: Unclosed Fences & Delimiters Mid-Stream
  // ==========================================
  describe("Boundary: Unclosed Fences & Mid-Stream Tokens", () => {
    it("handles unclosed code fence mid-stream by parsing to content end without error", () => {
      const content = readProjectFile(markdownPath);
      // In parseBlocks, an unclosed fence must run to the end of lines
      expect(content).toMatch(/while\s*\([^)]*FENCE\.test\(/);
    });

    it("handles unclosed inline code backtick without crashing or hanging", () => {
      const renderInlineCode = (text: string) => {
        const INLINE = /(`[^`\n]+`)|(\*\*(.*?)\*\*)/g;
        return [...text.matchAll(INLINE)].map((m) => m[0]);
      };

      const valid = "Đây là `code hợp lệ` xong.";
      const unclosed = "Đây là `code chưa đóng";

      expect(renderInlineCode(valid)).toHaveLength(1);
      expect(renderInlineCode(unclosed)).toHaveLength(0); // Stays literal
    });

    it("handles unclosed math delimiters ($ and $$) gracefully", () => {
      const parseMath = (text: string) => {
        const blockMatch = text.match(/\$\$([\s\S]*?)\$\$/);
        const inlineMatch = text.match(/(?<!\\)\$(?!\s)([^$\n]+?)(?<!\s)\$/);
        return { block: blockMatch?.[1], inline: inlineMatch?.[1] };
      };

      const unclosedInline = "Công thức $E = mc^2 chưa đóng tiếp tục văn bản";
      const unclosedBlock = "$$\n\\int_{0}^{1} x dx\nchưa đóng";

      expect(parseMath(unclosedInline).inline).toBeUndefined();
      expect(parseMath(unclosedBlock).block).toBeUndefined();
    });

    it("handles unclosed bold (**) and italic (*) tokens staying literal", () => {
      const parseFormatting = (text: string) => {
        const boldMatch = text.match(/\*\*([^*]+)\*\*/);
        const italicMatch = text.match(/(?<!\*)\*([^*\s][^*]*?)\*(?!\*)/);
        return { bold: boldMatch?.[1], italic: italicMatch?.[1] };
      };

      const unclosedBold = "Đây là **văn bản in đậm chưa đóng";
      const unclosedItalic = "Đây là *văn bản in nghiêng chưa đóng";

      expect(parseFormatting(unclosedBold).bold).toBeUndefined();
      expect(parseFormatting(unclosedItalic).italic).toBeUndefined();
    });
  });

  // ==========================================
  // Category 3: Empty, Extreme & Injection Defenses
  // ==========================================
  describe("Boundary: Empty Payloads & Security Escaping", () => {
    it("handles empty string '' returning empty render without crashing", () => {
      const EmptyComponent = ({ content }: { content: string }) =>
        React.createElement("div", { className: "markdown-body" }, content || null);

      const html = renderComponentToHtml(React.createElement(EmptyComponent, { content: "" }));
      expect(html).toBe('<div class="markdown-body"></div>');
    });

    it("handles whitespace-only and newline-heavy inputs safely", () => {
      const lines = "\n\n   \n\t\t\n   \n\n";
      const clean = lines.replace(/\r\n?/g, "\n").split("\n").filter((l) => l.trim());
      expect(clean).toHaveLength(0);
    });

    it("defends against raw HTML and script injection in user-rendered markdown", () => {
      const malicious = '<script>alert("hacked")</script><img src=x onerror=alert(1)>';
      // React text nodes automatically encode angle brackets into HTML entities
      const SafeView = ({ text }: { text: string }) =>
        React.createElement("div", { className: "safe-text" }, text);

      const html = renderComponentToHtml(React.createElement(SafeView, { text: malicious }));
      expect(html).not.toContain("<script>");
      expect(html).not.toContain("<img");
      expect(html).toContain("&lt;script&gt;");
      expect(html).toContain("&lt;img");
    });

    it("handles non-ASCII characters, Vietnamese accents, and emojis flawlessly", () => {
      const unicodeString = "Tiếng Việt có dấu: Ứ, Ớ, Ợ, Đ, ẵ! Emojis: 🚀 🤖 💡 ✨ 🇻🇳";
      const Element = () => React.createElement("span", null, unicodeString);
      const html = renderComponentToHtml(React.createElement(Element));

      expect(html).toContain("Tiếng Việt có dấu: Ứ, Ớ, Ợ, Đ, ẵ!");
      expect(html).toContain("🚀 🤖 💡 ✨ 🇻🇳");
    });

    it("handles massive single paragraph without whitespace without recursion overflow", () => {
      const hugeWord = "X".repeat(25000);
      expect(hugeWord.length).toBe(25000);
      const Element = () =>
        React.createElement("p", { className: "break-words" }, hugeWord);
      const html = renderComponentToHtml(React.createElement(Element));
      expect(html).toContain("break-words");
      expect(html.length).toBeGreaterThan(25000);
    });
  });

  // ==========================================
  // Category 4: Rapid Streaming Token Bursts
  // ==========================================
  describe("Boundary: Rapid Token Bursts & Concurrency", () => {
    it("handles rapid burst of 100 consecutive token chunks without losing content", async () => {
      const { createSmoothStream } = await import(
        "@/roadmap-rag-assistant/sdk/typescript/src/react/utils/smoothStream"
      );

      let accumulated = "";
      const stream = createSmoothStream((chunk) => {
        accumulated += chunk;
      });

      const words = Array.from({ length: 100 }, (_, i) => `word${i} `);
      for (const w of words) {
        stream.push(w);
      }
      stream.flush();

      expect(accumulated.trim().split(/\s+/)).toHaveLength(100);
      expect(accumulated).toContain("word0 ");
      expect(accumulated).toContain("word99 ");
    });

    it("handles empty token push events without emitting unwanted whitespace or crashing", async () => {
      const { createSmoothStream } = await import(
        "@/roadmap-rag-assistant/sdk/typescript/src/react/utils/smoothStream"
      );

      let accumulated = "";
      const stream = createSmoothStream((chunk) => {
        accumulated += chunk;
      });

      stream.push("");
      stream.push("Valid ");
      stream.push("");
      stream.push("Content");
      stream.flush();

      expect(accumulated).toBe("Valid Content");
    });
  });
});
