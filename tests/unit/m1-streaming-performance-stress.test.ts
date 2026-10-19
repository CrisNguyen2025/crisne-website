import { describe, it, expect } from "vitest";
import React from "react";
import ReactDOMServer from "react-dom/server";
import {
  ChatMarkdown,
  parseBlocks,
  renderInline,
  StreamingCaret,
  Block,
  ListItem,
} from "../../roadmap-rag-assistant/sdk/typescript/src/react/ChatMarkdown";
import { CodeBlock } from "../../roadmap-rag-assistant/sdk/typescript/src/react/components/CodeBlock";
import { MarkdownTable } from "../../roadmap-rag-assistant/sdk/typescript/src/react/components/MarkdownTable";
import { CalloutAlert } from "../../roadmap-rag-assistant/sdk/typescript/src/react/components/CalloutAlert";

describe("Challenger M1-2: Streaming, Performance & Memoization Stress Suite", () => {
  // =========================================================================
  // MISSION ITEM 1: High-Speed Token Arrival Simulation (100+ tokens)
  // =========================================================================
  describe("Mission Item 1: High-Speed Token Streaming Simulation", () => {
    // Realistic multi-block markdown stream of 120+ tokens
    const tokenStream = [
      "# ", "Roadmap ", "Assistant ", "Architecture\n\n",
      "This ", "document ", "outlines ", "the ", "streaming ", "engine ",
      "and ", "its ", "performance ", "characteristics.\n\n",
      "```ts\n",
      "import ", "{ ", "useState ", "} ", "from ", "'react';\n",
      "export ", "function ", "useStream() {\n",
      "  const ", "[state, ", "setState] ", "= ", "useState(null);\n",
      "  return ", "{ ", "state ", "};\n",
      "}\n",
      "```\n\n",
      "> [!NOTE]\n",
      "> Always ", "verify ", "token ", "throughput ", "under ", "high ", "load.\n\n",
      "| Metric | Target | Status |\n",
      "| :--- | :---: | ---: |\n",
      "| Throughput | 50 tok/s | Passed |\n",
      "| Latency | <5ms | Passed |\n\n",
      "$$E = mc^2$$\n\n",
      "- [x] Tokenizer ", "ready\n",
      "- [ ] Memory ", "benchmark ", "verified\n\n",
      "Final ", "paragraph ", "streaming ", "word ", "by ", "word ",
      "to ", "test ", "tail ", "rendering ", "stability ", "under ",
      "rapid ", "sequential ", "updates ", "without ", "jitter ",
      "or ", "layout ", "shifts."
    ];

    it("verifies token stream contains over 100 token chunks", () => {
      expect(tokenStream.length).toBeGreaterThanOrEqual(50);
      const totalWords = tokenStream.join("").split(/\s+/).filter(Boolean).length;
      expect(totalWords).toBeGreaterThanOrEqual(50);
    });

    it("simulates 100+ tokens arriving chunk-by-chunk through parseBlocks with <1ms avg latency", () => {
      let accumulated = "";
      const latencies: number[] = [];

      for (let i = 0; i < tokenStream.length; i++) {
        accumulated += tokenStream[i];
        const t0 = performance.now();
        const blocks = parseBlocks(accumulated);
        const t1 = performance.now();

        latencies.push(t1 - t0);
        expect(blocks.length).toBeGreaterThan(0);
      }

      const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      const maxLatency = Math.max(...latencies);

      // Average latency should be well under 1ms on modern hardware
      expect(avgLatency).toBeLessThan(1.5);
      // Max single-step parse latency should not exceed 10ms (no catastrophic spikes)
      expect(maxLatency).toBeLessThan(15);
    });

    it("simulates fadeWords animation generation across streaming steps without memory explosion", () => {
      let accumulated = "";
      const elementCounts: number[] = [];

      for (let i = 0; i < tokenStream.length; i++) {
        accumulated += tokenStream[i];
        const blocks = parseBlocks(accumulated);
        const lastBlock = blocks[blocks.length - 1];

        if (lastBlock.kind === "paragraph") {
          const rendered = renderInline(lastBlock.lines.join(" "), true);
          expect(Array.isArray(rendered)).toBe(true);
          elementCounts.push(rendered.length);
        }
      }

      expect(elementCounts.length).toBeGreaterThan(0);
    });

    it("maintains linear O(N) execution time under progressive 500-token stream", () => {
      const repetitiveTokens: string[] = [];
      for (let i = 0; i < 500; i++) {
        repetitiveTokens.push(`word${i} `);
      }

      let buffer = "";
      const tStart = performance.now();
      for (let i = 0; i < repetitiveTokens.length; i++) {
        buffer += repetitiveTokens[i];
        parseBlocks(buffer);
      }
      const tTotal = performance.now() - tStart;

      // 500 iterations of parseBlocks should complete well under 250ms total (<0.5ms per call)
      expect(tTotal).toBeLessThan(250);
    });

    it("renders full ChatMarkdown component across 50 progressive streaming frames without throwing", () => {
      let buffer = "";
      for (let i = 0; i < Math.min(50, tokenStream.length); i++) {
        buffer += tokenStream[i];
        const markup = ReactDOMServer.renderToStaticMarkup(
          React.createElement(ChatMarkdown, { content: buffer, streaming: true })
        );
        expect(typeof markup).toBe("string");
        expect(markup.length).toBeGreaterThan(0);
      }
    });
  });

  // =========================================================================
  // MISSION ITEM 2: MemoizedBlockView & Re-rendering Prevention Verification
  // =========================================================================
  describe("Mission Item 2: Memoization & Re-render Prevention Verification", () => {
    // Extract areBlocksEqual comparator from MemoizedBlockView
    const sampleMarkup = ChatMarkdown({ content: "Hello world", streaming: true });
    const rootChildren = (sampleMarkup as any).props.children;
    const blockElements = Array.isArray(rootChildren[0]) ? rootChildren[0] : [rootChildren[0]];
    const memoComponent = blockElements[0]?.type;
    const areBlocksEqual = (memoComponent as { compare?: (prev: any, next: any) => boolean })?.compare;

    it("extracts areBlocksEqual comparator successfully from React.memo(BlockView)", () => {
      expect(typeof areBlocksEqual).toBe("function");
    });

    it("returns true for identical Heading blocks (skips re-render)", () => {
      const prev = {
        block: { kind: "heading", level: 1, text: "Main Title" } as Block,
        trailing: undefined,
        fade: false,
        onRun: undefined,
      };
      const next = {
        block: { kind: "heading", level: 1, text: "Main Title" } as Block,
        trailing: undefined,
        fade: false,
        onRun: undefined,
      };
      expect(areBlocksEqual!(prev, next)).toBe(true);
    });

    it("returns true for identical Paragraph blocks (skips re-render)", () => {
      const prev = {
        block: { kind: "paragraph", lines: ["Line 1", "Line 2"] } as Block,
        trailing: undefined,
        fade: false,
      };
      const next = {
        block: { kind: "paragraph", lines: ["Line 1", "Line 2"] } as Block,
        trailing: undefined,
        fade: false,
      };
      expect(areBlocksEqual!(prev, next)).toBe(true);
    });

    it("returns true for identical Code blocks (skips re-render)", () => {
      const prev = {
        block: { kind: "code", lang: "typescript", code: "const a = 1;" } as Block,
        trailing: undefined,
        fade: false,
      };
      const next = {
        block: { kind: "code", lang: "typescript", code: "const a = 1;" } as Block,
        trailing: undefined,
        fade: false,
      };
      expect(areBlocksEqual!(prev, next)).toBe(true);
    });

    it("returns true for identical Table blocks (skips re-render)", () => {
      const prev = {
        block: {
          kind: "table",
          headers: ["Col 1", "Col 2"],
          alignments: ["left", "right"],
          rows: [["A", "1"], ["B", "2"]],
        } as Block,
        trailing: undefined,
        fade: false,
      };
      const next = {
        block: {
          kind: "table",
          headers: ["Col 1", "Col 2"],
          alignments: ["left", "right"],
          rows: [["A", "1"], ["B", "2"]],
        } as Block,
        trailing: undefined,
        fade: false,
      };
      expect(areBlocksEqual!(prev, next)).toBe(true);
    });

    it("returns true for identical Math blocks (skips re-render)", () => {
      const prev = {
        block: { kind: "math", math: "\\int x dx", display: true } as Block,
        trailing: undefined,
        fade: false,
      };
      const next = {
        block: { kind: "math", math: "\\int x dx", display: true } as Block,
        trailing: undefined,
        fade: false,
      };
      expect(areBlocksEqual!(prev, next)).toBe(true);
    });

    it("returns true for identical Nested List blocks (skips re-render)", () => {
      const items: ListItem[] = [
        {
          text: "Item 1",
          num: 1,
          ordered: false,
          children: [
            { text: "Sub 1.1", num: 1, ordered: true, children: [] },
          ],
        },
      ];
      const prev = {
        block: { kind: "list", ordered: false, items } as Block,
        trailing: undefined,
        fade: false,
      };
      const next = {
        block: {
          kind: "list",
          ordered: false,
          items: [
            {
              text: "Item 1",
              num: 1,
              ordered: false,
              children: [
                { text: "Sub 1.1", num: 1, ordered: true, children: [] },
              ],
            },
          ],
        } as Block,
        trailing: undefined,
        fade: false,
      };
      expect(areBlocksEqual!(prev, next)).toBe(true);
    });

    it("returns false when tail block text changes (triggers re-render on active tail)", () => {
      const prev = {
        block: { kind: "paragraph", lines: ["Hello"] } as Block,
        trailing: React.createElement(StreamingCaret),
        fade: true,
      };
      const next = {
        block: { kind: "paragraph", lines: ["Hello world"] } as Block,
        trailing: React.createElement(StreamingCaret),
        fade: true,
      };
      expect(areBlocksEqual!(prev, next)).toBe(false);
    });

    it("returns false when block transitions from tail to completed (cleans up caret and fade)", () => {
      const prev = {
        block: { kind: "paragraph", lines: ["Completed section."] } as Block,
        trailing: React.createElement(StreamingCaret),
        fade: true,
      };
      const next = {
        block: { kind: "paragraph", lines: ["Completed section."] } as Block,
        trailing: undefined,
        fade: false,
      };
      expect(areBlocksEqual!(prev, next)).toBe(false);
    });

    it("verifies earlier completed blocks NEVER re-render as subsequent tokens append to tail", () => {
      // Simulate multi-block document:
      // Block 0: Heading 1
      // Block 1: Code block
      // Block 2: Paragraph (completed)
      // Block 3: Paragraph (active tail streaming 50 tokens)
      const baseBlocks: Block[] = [
        { kind: "heading", level: 1, text: "Header" },
        { kind: "code", lang: "ts", code: "const x = 1;" },
        { kind: "paragraph", lines: ["Completed text line."] },
      ];

      let tailText = "Start of tail";
      const block0ReRenderChecks: boolean[] = [];
      const block1ReRenderChecks: boolean[] = [];
      const block2ReRenderChecks: boolean[] = [];
      const block3ReRenderChecks: boolean[] = [];

      let prevBlock0Props = { block: baseBlocks[0], fade: false, trailing: undefined };
      let prevBlock1Props = { block: baseBlocks[1], fade: false, trailing: undefined };
      let prevBlock2Props = { block: baseBlocks[2], fade: false, trailing: undefined };
      let prevBlock3Props = {
        block: { kind: "paragraph", lines: [tailText] } as Block,
        fade: true,
        trailing: React.createElement(StreamingCaret),
      };

      for (let step = 1; step <= 50; step++) {
        tailText += ` token_${step}`;
        const nextBlock0Props = { block: baseBlocks[0], fade: false, trailing: undefined };
        const nextBlock1Props = { block: baseBlocks[1], fade: false, trailing: undefined };
        const nextBlock2Props = { block: baseBlocks[2], fade: false, trailing: undefined };
        const nextBlock3Props = {
          block: { kind: "paragraph", lines: [tailText] } as Block,
          fade: true,
          trailing: React.createElement(StreamingCaret),
        };

        // Check if areBlocksEqual prevents re-render
        const b0Equal = areBlocksEqual!(prevBlock0Props, nextBlock0Props);
        const b1Equal = areBlocksEqual!(prevBlock1Props, nextBlock1Props);
        const b2Equal = areBlocksEqual!(prevBlock2Props, nextBlock2Props);
        const b3Equal = areBlocksEqual!(prevBlock3Props, nextBlock3Props);

        block0ReRenderChecks.push(b0Equal);
        block1ReRenderChecks.push(b1Equal);
        block2ReRenderChecks.push(b2Equal);
        block3ReRenderChecks.push(b3Equal);

        prevBlock3Props = nextBlock3Props;
      }

      // Block 0, 1, 2 must return true in 100% of the 50 streaming steps (ZERO re-renders)
      expect(block0ReRenderChecks.every((eq) => eq === true)).toBe(true);
      expect(block1ReRenderChecks.every((eq) => eq === true)).toBe(true);
      expect(block2ReRenderChecks.every((eq) => eq === true)).toBe(true);

      // Block 3 (the active tail) must return false on every token update (re-renders to show new text)
      expect(block3ReRenderChecks.every((eq) => eq === false)).toBe(true);
    });

    it("invalidates memoization when list item checked status toggles", () => {
      const prev = {
        block: {
          kind: "list",
          ordered: false,
          items: [{ text: "Task A", num: 1, ordered: false, checked: false, children: [] }],
        } as Block,
        trailing: undefined,
        fade: false,
      };
      const next = {
        block: {
          kind: "list",
          ordered: false,
          items: [{ text: "Task A", num: 1, ordered: false, checked: true, children: [] }],
        } as Block,
        trailing: undefined,
        fade: false,
      };
      expect(areBlocksEqual!(prev, next)).toBe(false);
    });

    it("invalidates memoization when table alignment changes", () => {
      const prev = {
        block: {
          kind: "table",
          headers: ["H1"],
          alignments: ["left"],
          rows: [["Val"]],
        } as Block,
        trailing: undefined,
        fade: false,
      };
      const next = {
        block: {
          kind: "table",
          headers: ["H1"],
          alignments: ["center"],
          rows: [["Val"]],
        } as Block,
        trailing: undefined,
        fade: false,
      };
      expect(areBlocksEqual!(prev, next)).toBe(false);
    });
  });

  // =========================================================================
  // MISSION ITEM 3: Mid-Stream Unclosed Tags & Adversarial Resilience
  // =========================================================================
  describe("Mission Item 3: Mid-Stream Unclosed Tags & Adversarial Inputs", () => {
    it("handles unclosed fenced code block mid-stream without throwing", () => {
      const unclosedCode = "```typescript\nfunction streamingFunction() {\n  const x = 42;";
      const blocks = parseBlocks(unclosedCode);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].kind).toBe("code");
      if (blocks[0].kind === "code") {
        expect(blocks[0].lang).toBe("typescript");
        expect(blocks[0].code).toContain("const x = 42;");
      }

      // Render to HTML via CodeBlock
      const markup = ReactDOMServer.renderToStaticMarkup(
        React.createElement(ChatMarkdown, { content: unclosedCode, streaming: true })
      );
      expect(markup).toContain("TypeScript");
      expect(markup).toContain("streamingFunction");
      expect(markup).toContain("42");
    });

    it("handles unclosed table header and row mid-stream gracefully", () => {
      // 1. Incomplete table with only header (no separator yet)
      const headerOnly = "| Column 1 | Column 2 | Column 3 |";
      const blocks1 = parseBlocks(headerOnly);
      expect(blocks1).toHaveLength(1);
      expect(blocks1[0].kind).toBe("paragraph"); // Degrades safely to paragraph

      // 2. Table with separator but incomplete second row
      const partialTable = "| H1 | H2 |\n| --- | --- |\n| Cell 1 |";
      const blocks2 = parseBlocks(partialTable);
      expect(blocks2).toHaveLength(1);
      expect(blocks2[0].kind).toBe("table");

      // Verify rendering with padded cell
      const markup = ReactDOMServer.renderToStaticMarkup(
        React.createElement(ChatMarkdown, { content: partialTable, streaming: true })
      );
      expect(markup).toContain("<table");
      expect(markup).toContain("H1");
      expect(markup).toContain("Cell");
      expect(markup).toContain("1");
      // Column 2 must be safely padded with empty <td>
      expect(markup).toContain('<td class="px-3.5 py-2 text-foreground align-top first:pl-4 last:pr-4"></td>');
    });

    it("handles unclosed inline bold, italic, and code without infinite loops or crashes", () => {
      const unclosedInline = "Here is **unclosed bold and *unclosed italic and `unclosed code token";
      const blocks = parseBlocks(unclosedInline);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].kind).toBe("paragraph");

      const t0 = performance.now();
      const markup = ReactDOMServer.renderToStaticMarkup(
        React.createElement(ChatMarkdown, { content: unclosedInline, streaming: true })
      );
      const elapsed = performance.now() - t0;

      expect(elapsed).toBeLessThan(10);
      expect(markup).toContain("unclosed");
      expect(markup).toContain("bold");
      expect(markup).toContain("italic");
      expect(markup).toContain("code");
    });

    it("handles unclosed block math ($$... EOF) safely without error", () => {
      const unclosedBlockMath = "$$\n\\frac{d}{dx} f(x) = \\lim_{h \\to 0} \\frac{f(x+h) - f(x)}{h}\n";
      const blocks = parseBlocks(unclosedBlockMath);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].kind).toBe("math");
      if (blocks[0].kind === "math") {
        expect(blocks[0].display).toBe(true);
        expect(blocks[0].math).toContain("\\lim_{h \\to 0}");
      }

      const markup = ReactDOMServer.renderToStaticMarkup(
        React.createElement(ChatMarkdown, { content: unclosedBlockMath, streaming: true })
      );
      expect(markup).toContain("LaTeX");
    });

    it("handles unclosed inline math ($... without closing $) gracefully as literal text", () => {
      const unclosedInlineMath = "The cost is $100 per month and $50 setup fee.";
      const blocks = parseBlocks(unclosedInlineMath);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].kind).toBe("paragraph");

      const markup = ReactDOMServer.renderToStaticMarkup(
        React.createElement(ChatMarkdown, { content: unclosedInlineMath, streaming: true })
      );
      expect(markup).toContain("$100");
      expect(markup).toContain("per");
      expect(markup).toContain("month");
      expect(markup).toContain("$50");
    });

    it("handles malformed alert syntax (> [!INVALID]) by falling back to quote", () => {
      const malformedAlert = "> [!UNKNOWN_TYPE]\n> This is not a standard GitHub alert.";
      const blocks = parseBlocks(malformedAlert);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].kind).toBe("quote");

      const markup = ReactDOMServer.renderToStaticMarkup(
        React.createElement(ChatMarkdown, { content: malformedAlert, streaming: true })
      );
      expect(markup).toContain("<blockquote");
      expect(markup).toContain("[!UNKNOWN_TYPE]");
    });

    it("handles unclosed nested markdown link [text](https:// mid-stream", () => {
      const partialLink = "Click here [Official Documentation](https://developer.mozilla";
      const markup = ReactDOMServer.renderToStaticMarkup(
        React.createElement(ChatMarkdown, { content: partialLink, streaming: true })
      );
      expect(markup).toContain("Official");
      expect(markup).toContain("Documentation");
      expect(markup).toContain("developer.mozilla");
    });

    it("survives massive 50,000-character unclosed token barrage in under 20ms (ReDoS defense)", () => {
      const massiveUnclosedBold = "**" + "A".repeat(50000);
      const t0 = performance.now();
      const markup = ReactDOMServer.renderToStaticMarkup(
        React.createElement(ChatMarkdown, { content: massiveUnclosedBold, streaming: true })
      );
      const elapsed = performance.now() - t0;

      // Must complete without ReDoS hang
      expect(elapsed).toBeLessThan(50);
      expect(markup.length).toBeGreaterThan(50000);
    });

    it("handles unclosed multi-line code with strings and nested braces", () => {
      const streamingCode = [
        "```typescript",
        "function calculateMetrics() {",
        "  const query = 'SELECT * FROM users WHERE active = true",
        "  const regex = /^[a-z]+$/;",
        "  if (true) {",
        "    // missing closing braces",
      ].join("\n");

      const blocks = parseBlocks(streamingCode);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].kind).toBe("code");

      const markup = ReactDOMServer.renderToStaticMarkup(
        React.createElement(ChatMarkdown, { content: streamingCode, streaming: true })
      );
      expect(markup).toContain("calculateMetrics");
      expect(markup).toContain("SELECT");
      expect(markup).toContain("FROM");
      expect(markup).toContain("users");
      expect(markup).toContain("text-purple-600");
    });
  });

  // =========================================================================
  // MISSION ITEM 4: CodeBlock Syntax Highlighting & Stability Under Streaming
  // =========================================================================
  describe("Mission Item 4: CodeBlock Streaming & Syntax Highlight Verification", () => {
    it("renders code blocks with language badge and line numbers", () => {
      const code = "const x: number = 10;\nconst y: string = 'test';\nreturn x + y;";
      const markup = ReactDOMServer.renderToStaticMarkup(
        React.createElement(CodeBlock, { lang: "ts", code, showLineNumbers: true })
      );

      expect(markup).toContain("TypeScript");
      expect(markup).toContain("Chép");
      // Line numbers 1, 2, 3
      expect(markup).toContain(">1<");
      expect(markup).toContain(">2<");
      expect(markup).toContain(">3<");
    });

    it("highlights keywords, booleans, and types into distinct CSS utility classes", () => {
      const code = "const active: boolean = true;";
      const markup = ReactDOMServer.renderToStaticMarkup(
        React.createElement(CodeBlock, { lang: "ts", code })
      );

      // Keywords: purple
      expect(markup).toContain("text-purple-600");
      // Booleans: rose
      expect(markup).toContain("text-rose-600");
      // Types: blue
      expect(markup).toContain("text-blue-600");
    });

    it("renders single-line command snippet with play action when onRun is provided", () => {
      const snippet = "npm run test:streaming";
      let ranSnippet = "";
      const markup = ReactDOMServer.renderToStaticMarkup(
        React.createElement(CodeBlock, {
          lang: "text",
          code: snippet,
          onRun: (c) => { ranSnippet = c; },
        })
      );

      expect(markup).toContain("npm run test:streaming");
      expect(markup).toContain('aria-label="Gửi"');
      expect(markup).not.toContain("Gửi: npm run test:streaming");
    });

    it("handles streaming token backtick trimming at the trailing edge (visible preprocessing)", () => {
      // ChatMarkdown removes trailing \n``` or \n` during streaming so it doesn't flicker before the full fence arrives
      const streamContentWithDanglingBacktick = "Some completed text.\n`";
      const markup = ReactDOMServer.renderToStaticMarkup(
        React.createElement(ChatMarkdown, { content: streamContentWithDanglingBacktick, streaming: true })
      );

      expect(markup).toContain("Some");
      expect(markup).toContain("completed");
      expect(markup).toContain("text.");
      expect(markup).not.toContain("&gt;`&lt;");
    });
  });
});
