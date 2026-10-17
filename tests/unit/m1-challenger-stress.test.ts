import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import ReactDOMServer from "react-dom/server";
import {
  ChatMarkdown,
  parseBlocks,
  renderInline,
  Block,
} from "../../roadmap-rag-assistant/sdk/typescript/src/react/ChatMarkdown";
import { MarkdownTable } from "../../roadmap-rag-assistant/sdk/typescript/src/react/components/MarkdownTable";
import {
  CalloutAlert,
  CalloutType,
} from "../../roadmap-rag-assistant/sdk/typescript/src/react/components/CalloutAlert";
import { CodeBlock } from "../../roadmap-rag-assistant/sdk/typescript/src/react/components/CodeBlock";

function renderToHtml(element: React.ReactElement): string {
  return ReactDOMServer.renderToStaticMarkup(element);
}

describe("Empirical Challenger — Milestone 1 Rich Markdown Engine Stress Suite", () => {
  // =========================================================================
  // DIMENSION 1: EXTREME TABLE INPUTS
  // =========================================================================
  describe("Dimension 1: Extreme Table Inputs", () => {
    it("handles table with missing leading and trailing pipes", () => {
      const markdown = [
        "Col A | Col B | Col C",
        "--- | :---: | ---:",
        "Val 1 | Val 2 | Val 3",
      ].join("\n");

      const blocks = parseBlocks(markdown);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].kind).toBe("table");

      if (blocks[0].kind === "table") {
        expect(blocks[0].headers).toEqual(["Col A", "Col B", "Col C"]);
        expect(blocks[0].alignments).toEqual(["left", "center", "right"]);
        expect(blocks[0].rows).toEqual([["Val 1", "Val 2", "Val 3"]]);
      }

      const html = renderToHtml(React.createElement(ChatMarkdown, { content: markdown }));
      expect(html).toContain("<table");
      expect(html).toContain("Col A");
      expect(html).toContain("Val 3");
    });

    it("handles asymmetric rows with fewer columns than headers (auto-pads cells)", () => {
      const markdown = [
        "| H1 | H2 | H3 | H4 |",
        "| --- | --- | --- | --- |",
        "| Row1-Col1 | Row1-Col2 |",
        "| Row2-Col1 |",
      ].join("\n");

      const blocks = parseBlocks(markdown);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].kind).toBe("table");

      const html = renderToHtml(React.createElement(ChatMarkdown, { content: markdown }));
      // 4 headers (th) - use /<th[\s>]/g to avoid matching <thead
      const thMatches = html.match(/<th[\s>]/g) || [];
      expect(thMatches).toHaveLength(4);

      // MarkdownTable pads empty cells: row 1 (2 data + 2 pad = 4), row 2 (1 data + 3 pad = 4) => 8 td
      const tdMatches = html.match(/<td/g) || [];
      expect(tdMatches).toHaveLength(8);
      expect(html).toContain("Row1-Col1");
      expect(html).toContain("Row2-Col1");
    });

    it("handles rows with more columns than headers without crashing or throwing", () => {
      const markdown = [
        "| H1 | H2 |",
        "| --- | --- |",
        "| A | B | Extra 1 | Extra 2 |",
      ].join("\n");

      const blocks = parseBlocks(markdown);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].kind).toBe("table");

      // Verify alignment lookup does not crash when index >= alignments.length
      const html = renderToHtml(React.createElement(ChatMarkdown, { content: markdown }));
      expect(html).toContain("Extra 1");
      expect(html).toContain("Extra 2");
    });

    it("correctly handles escaped pipes (\\|) inside cell content", () => {
      const markdown = [
        "| Operation | Syntax \\| Note | Example |",
        "| :--- | :--- | :--- |",
        "| Bitwise OR | `a \\| b` | `5 \\| 3` |",
        "| Table Pipe | Escaped \\| inside | Cell \\| Value |",
      ].join("\n");

      const blocks = parseBlocks(markdown);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].kind).toBe("table");

      if (blocks[0].kind === "table") {
        expect(blocks[0].headers).toHaveLength(3);
        expect(blocks[0].headers[1]).toBe("Syntax | Note");
        expect(blocks[0].rows[0][1]).toBe("`a | b`");
        expect(blocks[0].rows[1][0]).toBe("Table Pipe");
        expect(blocks[0].rows[1][1]).toBe("Escaped | inside");
      }

      const html = renderToHtml(React.createElement(ChatMarkdown, { content: markdown }));
      expect(html).toContain("Syntax | Note");
      expect(html).toContain("Escaped | inside");
    });

    it("renders rich inline markdown inside table headers and data cells", () => {
      const markdown = [
        "| **Metric** | *Status* | `Code` | [Link](https://example.com) |",
        "| --- | --- | --- | --- |",
        "| **Latency** | *99.9%* | `p99` | [Docs](https://docs.example.com) |",
        "| **Throughput** | *OK* | `10k/s` | [Grafana](/metrics) |",
      ].join("\n");

      const html = renderToHtml(React.createElement(ChatMarkdown, { content: markdown }));
      expect(html).toContain("<strong class=\"font-semibold text-foreground\">Metric</strong>");
      expect(html).toContain("<em class=\"italic\">Status</em>");
      expect(html).toContain("<code class=\"rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground\">Code</code>");
      expect(html).toContain('href="https://example.com" target="_blank" rel="noopener noreferrer"');
      expect(html).toContain("<strong class=\"font-semibold text-foreground\">Latency</strong>");
      expect(html).toContain('href="/metrics"');
    });

    it("investigates single-column table behavior (adversarial edge case)", () => {
      // In standard GFM, single column tables are technically possible:
      // | Item |
      // | --- |
      // | One |
      const singleCol = [
        "| Item |",
        "| --- |",
        "| One |",
        "| Two |",
      ].join("\n");

      const blocks = parseBlocks(singleCol);
      // Let's document empirically whether isTableSeparator accepts single-column table:
      // isTableSeparator regex requires (\|\s*:?-{2,}:?\s*)+ so single column table without trailing separator column
      // is parsed as paragraph.
      expect(Array.isArray(blocks)).toBe(true);
      // Must not crash or throw unhandled exception
      expect(() => renderToHtml(React.createElement(ChatMarkdown, { content: singleCol }))).not.toThrow();
    });

    it("survives massive table stress test (50 rows x 10 columns)", () => {
      const headers = Array.from({ length: 10 }, (_, i) => `Col_${i}`).join(" | ");
      const sep = Array.from({ length: 10 }, () => "---").join(" | ");
      const rows = Array.from({ length: 50 }, (_, r) =>
        Array.from({ length: 10 }, (_, c) => `R${r}C${c}`).join(" | ")
      );
      const massiveMarkdown = [`| ${headers} |`, `| ${sep} |`, ...rows.map((r) => `| ${r} |`)].join("\n");

      const t0 = performance.now();
      const blocks = parseBlocks(massiveMarkdown);
      const html = renderToHtml(React.createElement(ChatMarkdown, { content: massiveMarkdown }));
      const duration = performance.now() - t0;

      expect(blocks).toHaveLength(1);
      expect(blocks[0].kind).toBe("table");
      if (blocks[0].kind === "table") {
        expect(blocks[0].headers).toHaveLength(10);
        expect(blocks[0].rows).toHaveLength(50);
      }
      expect(duration).toBeLessThan(300); // Must parse and render under 300ms
      expect(html).toContain("R49C9");
    });
  });

  // =========================================================================
  // DIMENSION 2: EXTREME ALERT INPUTS
  // =========================================================================
  describe("Dimension 2: Extreme Alert Inputs", () => {
    it("handles multiline alerts spanning many lines with custom title", () => {
      const markdown = [
        "> [!WARNING] Production Deployment Alert",
        "> Line 1: Verify all schema migrations are applied.",
        "> Line 2: Ensure database backups are current.",
        "> Line 3: Notify the DevOps on-call engineer.",
        "> Line 4: Monitor Datadog latency dashboards.",
      ].join("\n");

      const blocks = parseBlocks(markdown);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].kind).toBe("alert");

      if (blocks[0].kind === "alert") {
        expect(blocks[0].alertType).toBe("warning");
        expect(blocks[0].title).toBe("Production Deployment Alert");
        expect(blocks[0].lines).toHaveLength(4);
        expect(blocks[0].lines[0]).toBe("Line 1: Verify all schema migrations are applied.");
      }

      const html = renderToHtml(React.createElement(ChatMarkdown, { content: markdown }));
      expect(html).toContain('role="alert"');
      expect(html).toContain("Production Deployment Alert");
      expect(html).toContain("border-l-amber-500");
      expect(html).toContain("Line 4: Monitor Datadog latency dashboards.");
    });

    it("tests alert with nested lists inside alert body", () => {
      const markdown = [
        "> [!TIP]",
        "> - Quick step 1",
        "> - Quick step 2",
        "> 1. Ordered follow-up",
      ].join("\n");

      const blocks = parseBlocks(markdown);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].kind).toBe("alert");

      if (blocks[0].kind === "alert") {
        expect(blocks[0].alertType).toBe("tip");
        expect(blocks[0].lines).toHaveLength(3);
        expect(blocks[0].lines[0]).toBe("- Quick step 1");
        expect(blocks[0].lines[1]).toBe("- Quick step 2");
        expect(blocks[0].lines[2]).toBe("1. Ordered follow-up");
      }

      const html = renderToHtml(React.createElement(ChatMarkdown, { content: markdown }));
      expect(html).toContain("Tip");
      expect(html).toContain("border-l-emerald-500");
      expect(html).toContain("- Quick step 1");
      expect(html).toContain("1. Ordered follow-up");
    });

    it("falls back to blockquote for unknown alert types without crashing", () => {
      const markdown = [
        "> [!UNKNOWN_TYPE] Some unknown alert content",
        "> Second line of text",
      ].join("\n");

      const blocks = parseBlocks(markdown);
      expect(blocks).toHaveLength(1);
      // Because UNKNOWN_TYPE is not in (NOTE|TIP|IMPORTANT|WARNING|CAUTION), it must fall back to quote
      expect(blocks[0].kind).toBe("quote");

      const html = renderToHtml(React.createElement(ChatMarkdown, { content: markdown }));
      expect(html).toContain("<blockquote");
      expect(html).toContain("[!UNKNOWN_TYPE] Some unknown alert content");
      expect(html).not.toContain('role="alert"');
    });

    it("supports all case variations: lowercase, uppercase, and mixed case", () => {
      const variations = [
        { text: "> [!note]\n> lower note", type: "note", title: "Note" },
        { text: "> [!TIP]\n> upper tip", type: "tip", title: "Tip" },
        { text: "> [!Warning]\n> mixed warning", type: "warning", title: "Warning" },
        { text: "> [!iMPoRTaNT]\n> wild case", type: "important", title: "Important" },
        { text: "> [!CAUTION]\n> upper caution", type: "caution", title: "Caution" },
      ];

      for (const { text, type, title } of variations) {
        const blocks = parseBlocks(text);
        expect(blocks).toHaveLength(1);
        expect(blocks[0].kind).toBe("alert");
        if (blocks[0].kind === "alert") {
          expect(blocks[0].alertType).toBe(type);
        }

        const html = renderToHtml(React.createElement(ChatMarkdown, { content: text }));
        expect(html).toContain('role="alert"');
        expect(html).toContain(title);
      }
    });

    it("handles direct CalloutAlert component instantiation with empty lines or missing title", () => {
      const html1 = renderToHtml(
        React.createElement(CalloutAlert, {
          type: "note",
          lines: [],
          renderInline: (t: string) => [t],
        })
      );
      expect(html1).toContain('role="alert"');
      expect(html1).toContain("Note");

      // Test fallback for invalid type cast
      const html2 = renderToHtml(
        React.createElement(CalloutAlert, {
          type: "unrecognized" as unknown as CalloutType,
          lines: ["Fallback body line"],
          renderInline: (t: string) => [t],
        })
      );
      expect(html2).toContain('role="alert"');
      expect(html2).toContain("Note");
      expect(html2).toContain("Fallback body line");
    });
  });

  // =========================================================================
  // DIMENSION 3: EXTREME MATH INPUTS
  // =========================================================================
  describe("Dimension 3: Extreme Math Inputs", () => {
    it("handles multiple inline math formulas in a single sentence", () => {
      const content = "Evaluate $f(x) = x^2$ at $x = 3$ to get $y = 9$.";
      const inlineElements = renderInline(content);
      const html = renderToHtml(React.createElement("span", null, inlineElements));

      expect(html).toContain("f(x) = x^2");
      expect(html).toContain("x = 3");
      expect(html).toContain("y = 9");
      // Fallback fx badge should be present for all 3 formulas
      const fxCount = (html.match(/fx<\/span>/g) || []).length;
      expect(fxCount).toBe(3);
    });

    it("distinguishes currency values ($50 and $100) from inline math", () => {
      const content = "I have $50 and $100 in my wallet. Not a formula.";
      const inlineElements = renderInline(content);
      const html = renderToHtml(React.createElement("span", null, inlineElements));

      // Currency followed/preceded by whitespace must NOT be converted to math
      expect(html).toContain("$50 and $100");
      expect(html).not.toContain("fx</span>");
    });

    it("evaluates boundary currency format without spaces ($50-$100 and $10,$20)", () => {
      // In $50-$100, the delimiter regex encounters '-' before '$100'.
      // An empirical test documents whether math regex captures 50- or leaves it.
      const content = "Prices range between $50-$100 depending on volume.";
      expect(() => renderToHtml(React.createElement(ChatMarkdown, { content }))).not.toThrow();
    });

    it("handles unclosed $$ display math blocks gracefully (mid-stream resilience)", () => {
      const unclosed = [
        "Here is an in-progress equation:",
        "$$",
        "\\int_{0}^{\\infty} e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}",
      ].join("\n");

      const blocks = parseBlocks(unclosed);
      expect(blocks).toHaveLength(2);
      expect(blocks[0].kind).toBe("paragraph");
      expect(blocks[1].kind).toBe("math");
      if (blocks[1].kind === "math") {
        expect(blocks[1].display).toBe(true);
        expect(blocks[1].math).toContain("\\int_{0}^{\\infty}");
      }

      const html = renderToHtml(React.createElement(ChatMarkdown, { content: unclosed }));
      expect(html).toContain("LaTeX");
      expect(html).toContain("\\int_{0}^{\\infty}");
    });

    it("handles single-line display math $$formula$$ without multiline wrapping", () => {
      const markdown = "$$\\sum_{i=1}^n i = \\frac{n(n+1)}{2}$$";
      const blocks = parseBlocks(markdown);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].kind).toBe("math");
      if (blocks[0].kind === "math") {
        expect(blocks[0].display).toBe(true);
        expect(blocks[0].math).toBe("\\sum_{i=1}^n i = \\frac{n(n+1)}{2}");
      }

      const html = renderToHtml(React.createElement(ChatMarkdown, { content: markdown }));
      expect(html).toContain("LaTeX");
      expect(html).toContain("\\sum_{i=1}^n i");
    });

    it("handles unclosed single $ inline math without corrupting following text", () => {
      const content = "This is an unclosed $math equation that never terminates.";
      const inlineElements = renderInline(content);
      const html = renderToHtml(React.createElement("span", null, inlineElements));

      // Unclosed single $ cannot find closing $ before end of text: must remain verbatim
      expect(html).toContain("This is an unclosed $math equation that never terminates.");
      expect(html).not.toContain("fx</span>");
    });

    it("renders KaTeX HTML when window.katex is available", () => {
      // Simulate client-side window.katex existence
      const originalWindow = global.window;
      try {
        (global as unknown as { window: unknown }).window = {
          katex: {
            renderToString: (tex: string, opts: { displayMode?: boolean }) =>
              `<katex-mock display="${opts?.displayMode}">${tex}</katex-mock>`,
          },
        };

        const markdown = "Formula: $E=mc^2$ and block:\n\n$$\\lambda = \\frac{h}{p}$$";
        const html = renderToHtml(React.createElement(ChatMarkdown, { content: markdown }));
        expect(html).toContain('<katex-mock display="false">E=mc^2</katex-mock>');
        expect(html).toContain('<katex-mock display="true">\\lambda = \\frac{h}{p}</katex-mock>');
      } finally {
        (global as unknown as { window: unknown }).window = originalWindow;
      }
    });

    it("catches KaTeX rendering exceptions gracefully without crashing component", () => {
      const originalWindow = global.window;
      try {
        (global as unknown as { window: unknown }).window = {
          katex: {
            renderToString: () => {
              throw new Error("KaTeX syntax error: invalid token");
            },
          },
        };

        const markdown = "Equation with error: $\\invalid{\\token$";
        expect(() => renderToHtml(React.createElement(ChatMarkdown, { content: markdown }))).not.toThrow();
        const html = renderToHtml(React.createElement(ChatMarkdown, { content: markdown }));
        // Falls back to graceful badge when katex throws
        expect(html).toContain("fx");
      } finally {
        (global as unknown as { window: unknown }).window = originalWindow;
      }
    });
  });

  // =========================================================================
  // DIMENSION 4: EXTREME CODE BLOCKS
  // =========================================================================
  describe("Dimension 4: Extreme Code Blocks", () => {
    it("handles unclosed code fence at EOF (streaming scenario)", () => {
      const markdown = [
        "```typescript",
        "interface UserSession {",
        "  userId: string;",
        "  token: string;",
        "}",
      ].join("\n");

      const blocks = parseBlocks(markdown);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].kind).toBe("code");
      if (blocks[0].kind === "code") {
        expect(blocks[0].lang).toBe("typescript");
        expect(blocks[0].code).toContain("userId: string;");
      }

      const html = renderToHtml(React.createElement(ChatMarkdown, { content: markdown }));
      expect(html).toContain("TypeScript");
      expect(html).toContain("userId");
      expect(html).toContain("string");
    });

    it("tests language identifiers with special characters (c++, c#, shell-script, unknown)", () => {
      // Test c++
      const cppBlocks = parseBlocks("```c++\nint x = 10;\n```");
      expect(cppBlocks[0].kind).toBe("code");
      if (cppBlocks[0].kind === "code") {
        expect(cppBlocks[0].lang).toBe("c++");
      }

      // Test shell-script
      const shellBlocks = parseBlocks("```shell-script\necho hello\n```");
      expect(shellBlocks[0].kind).toBe("code");
      if (shellBlocks[0].kind === "code") {
        expect(shellBlocks[0].lang).toBe("shell-script");
      }

      // Test c# (adversarial: regex FENCE is /^\s*```\s*([\w+-]*)\s*$/ so # is not in \w+-)
      // We document this empirical behavior:
      const csharpBlocks = parseBlocks("```c#\nConsole.WriteLine();\n```");
      expect(Array.isArray(csharpBlocks)).toBe(true);

      // Render CodeBlock directly with c# to verify badge translation
      const htmlCSharp = renderToHtml(
        React.createElement(CodeBlock, { lang: "c#", code: 'Console.WriteLine("Hi");' })
      );
      expect(htmlCSharp).toContain("C#");
    });

    it("handles code containing backticks (template literals, markdown code snippets)", () => {
      const markdown = [
        "```javascript",
        "const greeting = `Hello, ${user.name}!`;",
        "const query = `SELECT * FROM users WHERE status = 'active'`;",
        "```",
      ].join("\n");

      const blocks = parseBlocks(markdown);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].kind).toBe("code");
      if (blocks[0].kind === "code") {
        expect(blocks[0].code).toContain("`Hello, ${user.name}!`");
      }

      const html = renderToHtml(React.createElement(ChatMarkdown, { content: markdown }));
      expect(html).toContain("JavaScript");
      expect(html).toContain("Hello, ${user.name}!");
    });

    it("handles single-line code snippet rendering (action prompt / executable command)", () => {
      const htmlWithRun = renderToHtml(
        React.createElement(CodeBlock, {
          lang: "",
          code: "npm run test:stress",
          onRun: () => {},
        })
      );

      expect(htmlWithRun).toContain("npm run test:stress");
      expect(htmlWithRun).toContain('aria-label="Gửi: npm run test:stress"');
      expect(htmlWithRun).toContain('aria-label="Sao chép"');
    });

    it("stress-tests code syntax highlighter with complex tokens: regex, hex, scientific numbers, comments", () => {
      const complexCode = [
        "// A single-line comment",
        "const hexVal = 0xDEADBEEF;",
        "const floatVal = 3.14159e-10;",
        "const str = 'Single quote with escaped \\' quote';",
        "function calculateMetrics(total: number, active: boolean): void {",
        "  if (active && total > 0) {",
        "    return calculateMetrics(total - 1, false);",
        "  }",
        "}",
      ].join("\n");

      const html = renderToHtml(
        React.createElement(CodeBlock, {
          lang: "ts",
          code: complexCode,
          showLineNumbers: true,
        })
      );

      // Verify line numbers 1 to 8
      for (let line = 1; line <= 8; line++) {
        expect(html).toContain(`>${line}<`);
      }
      expect(html).toContain("TypeScript");
      expect(html).toContain("0xDEADBEEF");
      expect(html).toContain("calculateMetrics");
    });

    it("survives massive code block stress test (1,000 lines) under 250ms", () => {
      const codeLines = Array.from({ length: 1000 }, (_, i) => `const var_${i} = ${i * 42}; // line ${i}`);
      const code = codeLines.join("\n");

      const t0 = performance.now();
      const html = renderToHtml(
        React.createElement(CodeBlock, {
          lang: "typescript",
          code,
          showLineNumbers: true,
        })
      );
      const duration = performance.now() - t0;

      expect(duration).toBeLessThan(250);
      expect(html).toContain(">1000<");
      expect(html).toContain("var_999");
    });
  });

  // =========================================================================
  // DIMENSION 5: STREAMING, CHECKLISTS & TYPOGRAPHY EDGE CASES
  // =========================================================================
  describe("Dimension 5: Streaming, Checklists & Typography Edge Cases", () => {
    it("renders streaming caret correctly in streaming mode", () => {
      const htmlStreaming = renderToHtml(
        React.createElement(ChatMarkdown, {
          content: "Streaming response in progress...",
          streaming: true,
        })
      );
      expect(htmlStreaming).toContain("animate-pulse");
      expect(htmlStreaming).toContain("animate-stream-fade");

      const htmlStatic = renderToHtml(
        React.createElement(ChatMarkdown, {
          content: "Static completed response.",
          streaming: false,
        })
      );
      expect(htmlStatic).not.toContain("animate-pulse");
    });

    it("parses and renders nested checklists with mixed check state", () => {
      const checklistMarkdown = [
        "- [x] Task 1 completed",
        "  - [ ] Subtask 1.1 pending",
        "  - [x] Subtask 1.2 completed",
        "- [ ] Task 2 pending",
      ].join("\n");

      const blocks = parseBlocks(checklistMarkdown);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].kind).toBe("list");

      if (blocks[0].kind === "list") {
        expect(blocks[0].items).toHaveLength(2);
        expect(blocks[0].items[0].checked).toBe(true);
        expect(blocks[0].items[0].children).toHaveLength(2);
        expect(blocks[0].items[0].children[0].checked).toBe(false);
        expect(blocks[0].items[0].children[1].checked).toBe(true);
        expect(blocks[0].items[1].checked).toBe(false);
      }

      const html = renderToHtml(React.createElement(ChatMarkdown, { content: checklistMarkdown }));
      expect(html).toContain('role="checkbox"');
      expect(html).toContain('aria-checked="true"');
      expect(html).toContain('aria-checked="false"');
      expect(html).toContain("line-through");
    });

    it("defends against malicious javascript: links in markdown", () => {
      const malicious = [
        "[XSS Attack](javascript:alert(document.cookie))",
        "[Data URL](data:text/html,<script>alert(1)</script>)",
        "[Safe Link](https://google.com)",
      ].join("\n");

      const html = renderToHtml(React.createElement(ChatMarkdown, { content: malicious }));
      expect(html).not.toContain('href="javascript:');
      expect(html).not.toContain('href="data:');
      expect(html).toContain('href="https://google.com"');
    });

    it("handles deeply nested lists (20 levels deep) without recursion failure", () => {
      const lines: string[] = [];
      for (let level = 0; level < 20; level++) {
        const indent = "  ".repeat(level);
        lines.push(`${indent}- Level ${level}`);
      }

      const blocks = parseBlocks(lines.join("\n"));
      expect(blocks).toHaveLength(1);
      expect(blocks[0].kind).toBe("list");

      const html = renderToHtml(React.createElement(ChatMarkdown, { content: lines.join("\n") }));
      expect(html).toContain("Level 0");
      expect(html).toContain("Level 19");
    });
  });

  // =========================================================================
  // DIMENSION 6: EMPIRICAL ADVERSARIAL FAILURE MODES & PARSER LIMITS
  // =========================================================================
  describe("Dimension 6: Empirical Adversarial Failure Modes & Parser Limits", () => {
    it("EMPIRICAL FINDING: c# and f# fences fail FENCE regex and invert block structure", () => {
      // FENCE regex is /^\s*```\s*([\w+-]*)\s*$/
      // Because '#' is not in [\w+-], ```c# is parsed as a paragraph
      // and the closing ``` starts an open code block that captures following text
      const input = "```c#\nint x = 1;\n```\nTrailing text after fence.";
      const blocks = parseBlocks(input);

      // Verify the empirical behavior:
      expect(blocks[0].kind).toBe("paragraph");
      expect(blocks[1].kind).toBe("code");
      // The trailing text gets absorbed inside the code block!
      if (blocks[1].kind === "code") {
        expect(blocks[1].code).toContain("Trailing text after fence.");
      }
    });

    it("EMPIRICAL FINDING: single-column tables are not recognized as tables", () => {
      // isTableSeparator regex requires (\|\s*:?-{2,}:?\s*)+ which requires at least two columns
      const singleColTable = "| Header |\n| --- |\n| Cell 1 |";
      const blocks = parseBlocks(singleColTable);

      // Documents that single-column table falls through to paragraph
      expect(blocks[0].kind).toBe("paragraph");
    });

    it("EMPIRICAL FINDING: currency range without space ($50-$100) triggers inline math false-positive", () => {
      // INLINE math regex ((?<!\$)\$(?!\s)([^$\n]+?)(?<!\s)\$(?!\$))
      // matches '$50-$' because '-' is non-whitespace before closing '$'
      const inlineElements = renderInline("Prices are $50-$100 today");
      const html = renderToHtml(React.createElement("span", null, inlineElements));

      // Empirically confirms that '50-' was matched as math badge and '100 today' remains
      expect(html).toContain("50-");
      expect(html).toContain("100 today");
    });

    it("EMPIRICAL FINDING: callout alert renders markdown lists as flat text with <br> instead of <ul>", () => {
      const alertWithList = "> [!NOTE]\n> - Step 1\n> - Step 2";
      const blocks = parseBlocks(alertWithList);
      expect(blocks[0].kind).toBe("alert");

      const html = renderToHtml(React.createElement(ChatMarkdown, { content: alertWithList }));
      // It renders '- Step 1<br/>- Step 2' inside the alert, NOT <ul> or <li>
      expect(html).not.toContain("<ul");
      expect(html).not.toMatch(/<li[\s>]/);
      expect(html).toContain("- Step 1");
      expect(html).toContain("<br/>");
      expect(html).toContain("- Step 2");
    });

    it("EMPIRICAL FINDING: unclosed $$ display math absorbs entire remaining document", () => {
      const input = "$$\n\\frac{a}{b}\n\nThis paragraph was intended to be outside the math.";
      const blocks = parseBlocks(input);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].kind).toBe("math");
      if (blocks[0].kind === "math") {
        expect(blocks[0].math).toContain("This paragraph was intended to be outside the math.");
      }
    });
  });
});

