import { describe, it, expect } from "vitest";
import React from "react";
import ReactDOMServer from "react-dom/server";
import {
  SparklesIcon,
  ArrowUpIcon,
  StopIcon,
  NewChatIcon,
  CloseIcon,
  CopyIcon,
  CheckIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ThumbsUpIcon,
  ThumbsDownIcon,
  ArrowDownIcon,
} from "../../roadmap-rag-assistant/sdk/typescript/src/react/icons";
import {
  formatMarkdownText,
  renderInlineStyles,
  formatTime,
  formatToolDisplayName,
} from "../../roadmap-rag-assistant/sdk/typescript/src/react/utils/formatters";
import {
  fileExistsInProject,
  readProjectFile,
} from "../e2e/test-helpers";

describe("Challenger 2 — Milestone 1 Stress & Adversarial Test Suite", () => {
  const allIcons = [
    { name: "SparklesIcon", component: SparklesIcon, defaultClass: "w-4 h-4" },
    { name: "ArrowUpIcon", component: ArrowUpIcon, defaultClass: "w-4 h-4" },
    { name: "StopIcon", component: StopIcon, defaultClass: "w-4 h-4" },
    { name: "NewChatIcon", component: NewChatIcon, defaultClass: "w-4 h-4" },
    { name: "CloseIcon", component: CloseIcon, defaultClass: "w-4 h-4" },
    { name: "CopyIcon", component: CopyIcon, defaultClass: "w-4 h-4" },
    { name: "CheckIcon", component: CheckIcon, defaultClass: "w-4 h-4" },
    { name: "CheckCircleIcon", component: CheckCircleIcon, defaultClass: "w-4 h-4" },
    { name: "ChevronDownIcon", component: ChevronDownIcon, defaultClass: "w-4 h-4" },
    { name: "ThumbsUpIcon", component: ThumbsUpIcon, defaultClass: "w-4 h-4" },
    { name: "ThumbsDownIcon", component: ThumbsDownIcon, defaultClass: "w-4 h-4" },
    { name: "ArrowDownIcon", component: ArrowDownIcon, defaultClass: "w-4 h-4" },
  ];

  describe("Mission Item 1: Icon Isolation & Rendering Verification (All 12 Icons)", () => {
    it("all 12 icons are exported as valid React function components", () => {
      expect(allIcons).toHaveLength(12);
      for (const { name, component } of allIcons) {
        expect(typeof component, `${name} should be a function`).toBe("function");
      }
    });

    it("renders each of the 12 icons to valid SVG markup with default className", () => {
      for (const { name, component, defaultClass } of allIcons) {
        const markup = ReactDOMServer.renderToStaticMarkup(React.createElement(component));
        expect(markup, `${name} markup should start with <svg`).toContain("<svg");
        expect(markup, `${name} markup should end with </svg>`).toContain("</svg>");
        expect(markup, `${name} markup should include default class ${defaultClass}`).toContain(defaultClass);
      }
    });

    it("renders each of the 12 icons with custom classNames applied directly to the svg", () => {
      const customClass = "test-custom-icon-class-xyz-987";
      for (const { name, component } of allIcons) {
        const markup = ReactDOMServer.renderToStaticMarkup(
          React.createElement(component, { className: customClass })
        );
        expect(markup, `${name} markup should contain custom className`).toContain(customClass);
      }
    });

    it("handles complex multi-token Tailwind classes without error", () => {
      const complexClass = "w-10 h-10 p-2 text-emerald-500 hover:text-emerald-700 transition-all duration-300";
      for (const { name, component } of allIcons) {
        const markup = ReactDOMServer.renderToStaticMarkup(
          React.createElement(component, { className: complexClass })
        );
        expect(markup).toContain("text-emerald-500");
        expect(markup).toContain("hover:text-emerald-700");
      }
    });

    it("every icon shares the outline frame: 1.5 stroke, currentColor, aria-hidden, no hex colors", () => {
      for (const { name, component } of allIcons) {
        const markup = ReactDOMServer.renderToStaticMarkup(React.createElement(component));
        expect(markup, `${name} stroke width`).toContain('stroke-width="1.5"');
        expect(markup, `${name} stroke color`).toContain('stroke="currentColor"');
        expect(markup, `${name} aria-hidden`).toContain('aria-hidden="true"');
        expect(markup, `${name} hex color`).not.toMatch(/#[0-9A-Fa-f]{6}/);
      }
    });

    it("handles empty string className gracefully", () => {
      for (const { name, component } of allIcons) {
        const markup = ReactDOMServer.renderToStaticMarkup(
          React.createElement(component, { className: "" })
        );
        expect(markup).toContain("<svg");
        expect(markup).toContain("</svg>");
      }
    });

    it("confirms RoadmapChatbotWidget has zero inline svg tags", () => {
      const widgetPath = "roadmap-rag-assistant/sdk/typescript/src/react/RoadmapChatbotWidget.tsx";
      const sdkDir = "roadmap-rag-assistant/sdk/typescript/src/react";
      const sdkFiles = [widgetPath, `${sdkDir}/ToolStepRow.tsx`, `${sdkDir}/ChatMarkdown.tsx`];
      for (const file of sdkFiles) {
        const content = readProjectFile(file);
        expect(content, file).not.toMatch(/<svg[\s>]/);
        expect(content, file).toContain('from "./icons"');
      }
      // Every shared icon is used by one of the two chatbots (no dead icons).
      const portfolio = readProjectFile("components/floating-bot/FloatingChatBot.tsx");
      expect(portfolio).not.toMatch(/<svg[\s>]/);
      const allUsage = sdkFiles.map(readProjectFile).join("\n") + portfolio;
      for (const { name } of allIcons) {
        expect(allUsage).toContain(name);
      }
    });
  });

  describe("Mission Item 2: Formatters Stress Testing & Edge Cases", () => {
    describe("formatMarkdownText", () => {
      it("handles empty strings and whitespace-only lines without throwing", () => {
        const emptyResult = ReactDOMServer.renderToStaticMarkup(
          React.createElement("div", null, formatMarkdownText(""))
        );
        // Blank input renders an empty container: no spacer divs, no stray text.
        expect(emptyResult).not.toMatch(/<(p|li|h\d)/);

        const multiNewlineResult = ReactDOMServer.renderToStaticMarkup(
          React.createElement("div", null, formatMarkdownText("\n\n\n"))
        );
        expect(multiNewlineResult).not.toMatch(/<(p|li|h\d)/);
      });

      it("handles all bullet point prefixes (- , * , • )", () => {
        const content = "- Item Dash\n* Item Asterisk\n• Item Bullet";
        const markup = ReactDOMServer.renderToStaticMarkup(
          React.createElement("div", null, formatMarkdownText(content))
        );
        expect(markup).toContain("Item Dash");
        expect(markup).toContain("Item Asterisk");
        expect(markup).toContain("Item Bullet");
        // One <ul> with three items, marker in the muted token colour
        expect(markup.match(/<ul/g)).toHaveLength(1);
        expect(markup.match(/<li/g)).toHaveLength(3);
        expect(markup).toContain("text-muted-foreground");
      });

      it("handles numbered lists with single, multiple digits, and zero", () => {
        const content = "1. First step\n2. Second step\n100. Hundredth step\n0. Zero step";
        const markup = ReactDOMServer.renderToStaticMarkup(
          React.createElement("div", null, formatMarkdownText(content))
        );
        expect(markup).toContain("1.");
        expect(markup).toContain("First step");
        expect(markup).toContain("100.");
        expect(markup).toContain("Hundredth step");
        expect(markup).toContain("0.");
        expect(markup).toContain("Zero step");
      });

      it("does not falsely treat decimal numbers or dates as numbered lists", () => {
        const content = "Version 3.14 is released today.\nOn 2026.10.14 an update landed.";
        const markup = ReactDOMServer.renderToStaticMarkup(
          React.createElement("div", null, formatMarkdownText(content))
        );
        // Should render as <p> paragraphs, not as list containers with font-semibold number badges
        expect(markup).toContain("<p");
        expect(markup).not.toContain("shrink-0");
        expect(markup).toContain("Version 3.14 is released today.");
      });

      it("handles # to #### headers without leaking '#' characters", () => {
        const content = "## Major Section\n### Minor Section\n#### Level 4";
        const markup = ReactDOMServer.renderToStaticMarkup(
          React.createElement("div", null, formatMarkdownText(content))
        );
        expect(markup).toContain("<h3");
        expect(markup).toContain("Major Section");
        expect(markup).toContain("<h4");
        expect(markup).toContain("Minor Section");
        expect(markup).toContain("<h5");
        expect(markup).toContain("Level 4");
        expect(markup).not.toContain("#");
      });

      it("uses design tokens only: no hard-coded hex colours or slate/white palette", () => {
        const sample = "## Header\n- Bullet point\n1. Numbered item\nParagraph **bold** and `code`\n> quote\n```ts\nconst x = 1;\n```";
        const markup = ReactDOMServer.renderToStaticMarkup(
          React.createElement("div", null, formatMarkdownText(sample))
        );
        expect(markup).not.toMatch(/#[0-9A-Fa-f]{6}/);
        expect(markup).not.toMatch(/text-slate-|bg-slate-|text-white/);
        expect(markup).toContain("text-foreground");
        expect(markup).toContain("bg-muted");
      });

      it("renders nested lists, code blocks, blockquotes and safe links", () => {
        const sample = [
          "1. Parent",
          "   - Child A",
          "   - Child B",
          "2. Next",
          "",
          "> Quoted line",
          "",
          "```bash",
          "npm test",
          "```",
          "",
          "[Docs](/roadmaps/fe) [Ext](https://example.com) [Bad](javascript:alert(1))",
        ].join("\n");
        const markup = ReactDOMServer.renderToStaticMarkup(
          React.createElement("div", null, formatMarkdownText(sample))
        );
        expect(markup.match(/<ol/g)).toHaveLength(1);
        expect(markup).toContain("Child A");
        expect(markup).toContain("Child B");
        expect(markup).toContain("<blockquote");
        expect(markup).toContain("<pre");
        expect(markup).toContain("npm test");
        expect(markup).toContain("Sao chép code");
        expect(markup).toContain('href="/roadmaps/fe"');
        expect(markup).toContain('href="https://example.com" target="_blank" rel="noopener noreferrer"');
        expect(markup).not.toContain("javascript:");
        expect(markup).toContain("Bad");
      });

      it("escapes raw HTML tags to prevent XSS injection attacks", () => {
        const malicious = "<script>alert('xss')</script>\n<img src=x onerror=alert(1)>\n<div style=\"color:red\">Evil</div>";
        const markup = ReactDOMServer.renderToStaticMarkup(
          React.createElement("div", null, formatMarkdownText(malicious))
        );
        expect(markup).not.toContain("<script>");
        expect(markup).toContain("&lt;script&gt;alert(&#x27;xss&#x27;)&lt;/script&gt;");
        expect(markup).not.toContain("<img src=x");
        expect(markup).toContain("&lt;img src=x onerror=alert(1)&gt;");
      });

      it("handles massive long text streams (50,000 characters) without stack overflow or performance degradation", () => {
        const longParagraph = "Roadmap AI knowledge streaming test. ".repeat(1500);
        const start = performance.now();
        const markup = ReactDOMServer.renderToStaticMarkup(
          React.createElement("div", null, formatMarkdownText(longParagraph))
        );
        const duration = performance.now() - start;
        expect(markup.length).toBeGreaterThan(50000);
        expect(duration).toBeLessThan(500); // Must render in under 500ms
      });

      it("correctly handles unicode and Vietnamese accents", () => {
        const vn = "Xin chào! Lộ trình học Next.js 16 và Trí tuệ nhân tạo (AI Assistant) ⚡🚀";
        const markup = ReactDOMServer.renderToStaticMarkup(
          React.createElement("div", null, formatMarkdownText(vn))
        );
        expect(markup).toContain("Xin chào! Lộ trình học Next.js 16 và Trí tuệ nhân tạo (AI Assistant) ⚡🚀");
      });
    });

    describe("renderInlineStyles", () => {
      it("renders bold **text** in <strong> tags", () => {
        const markup = ReactDOMServer.renderToStaticMarkup(
          React.createElement("span", null, renderInlineStyles("This is **bold** text"))
        );
        expect(markup).toContain("<strong class=\"font-semibold text-foreground\">bold</strong>");
      });

      it("renders code `text` in <code> tags", () => {
        const markup = ReactDOMServer.renderToStaticMarkup(
          React.createElement("span", null, renderInlineStyles("Run `npm test` here"))
        );
        expect(markup).toContain("<code class=\"rounded bg-muted px-1 py-0.5 font-mono text-[0.85em] text-foreground\">npm test</code>");
      });

      it("handles adjacent and mixed formatting", () => {
        const markup = ReactDOMServer.renderToStaticMarkup(
          React.createElement("span", null, renderInlineStyles("**First**`second`**third**"))
        );
        expect(markup).toContain("<strong");
        expect(markup).toContain("First");
        expect(markup).toContain("<code");
        expect(markup).toContain("second");
        expect(markup).toContain("third");
      });

      it("handles unclosed markdown tokens gracefully without crashing", () => {
        const unclosed = "Single `backtick and unclosed **bold text without end";
        const markup = ReactDOMServer.renderToStaticMarkup(
          React.createElement("span", null, renderInlineStyles(unclosed))
        );
        expect(markup).toContain("Single `backtick and unclosed **bold text without end");
      });

      it("renders _italic_ and *italic* but leaves snake_case identifiers untouched", () => {
        const markup = ReactDOMServer.renderToStaticMarkup(
          React.createElement("span", null, renderInlineStyles("_Hỗ trợ English._ *nhấn* create_topics_batch"))
        );
        expect(markup.match(/<em/g)).toHaveLength(2);
        expect(markup).toContain("Hỗ trợ English.");
        expect(markup).toContain("create_topics_batch");
        expect(markup).not.toContain("_Hỗ");
      });

      it("handles empty bold tags **** cleanly", () => {
        const markup = ReactDOMServer.renderToStaticMarkup(
          React.createElement("span", null, renderInlineStyles("Empty **** bold"))
        );
        expect(markup).toContain("<strong");
      });
    });

    describe("formatTime", () => {
      it("returns empty string for undefined and null", () => {
        expect(formatTime(undefined)).toBe("");
        expect(formatTime(null as unknown as undefined)).toBe("");
      });

      it("returns empty string for empty string and invalid date strings", () => {
        expect(formatTime("")).toBe("");
        expect(formatTime("not-a-date")).toBe("");
        expect(formatTime("2026-99-99T99:99:99")).toBe("");
      });

      it("returns empty string for NaN date", () => {
        expect(formatTime(new Date(NaN))).toBe("");
      });

      it("returns empty string for timestamp 0 (falsy timestamp edge case)", () => {
        expect(formatTime(0)).toBe("");
      });

      it("formats valid Date objects to HH:mm (24-hour format)", () => {
        const d = new Date("2026-10-14T14:35:00Z");
        const res = formatTime(d);
        expect(res).toMatch(/^\d{2}:\d{2}$/);
      });

      it("formats valid ISO timestamp strings to HH:mm", () => {
        const res = formatTime("2026-10-14T09:15:00.000Z");
        expect(res).toMatch(/^\d{2}:\d{2}$/);
      });

      it("formats valid numeric timestamps (Date.now()) to HH:mm", () => {
        const now = Date.now();
        const res = formatTime(now);
        expect(res).toMatch(/^\d{2}:\d{2}$/);
      });
    });

    describe("formatToolDisplayName", () => {
      it("maps all 14 roadmap & knowledge tool names to plain labels (no emoji)", () => {
        const mappings: Record<string, string> = {
          search_live_knowledge: "Tra cứu cơ sở tri thức Live",
          create_topic: "Tạo Topic Roadmap",
          create_topics_batch: "Tạo Topic Roadmap",
          create_layer: "Tạo Layer mảng kiến thức",
          create_layers_batch: "Tạo Layer mảng kiến thức",
          create_group: "Tạo Nhóm phân loại (Group)",
          create_item: "Thêm Bài học (Item)",
          create_items_batch: "Thêm Bài học (Item)",
          delete_topic: "Xóa thực thể Roadmap",
          delete_layer: "Xóa thực thể Roadmap",
          delete_group: "Xóa thực thể Roadmap",
          delete_item: "Xóa thực thể Roadmap",
          preview_roadmap_plan: "Phác thảo kế hoạch Roadmap (/plan)",
          generate_roadmap_from_template: "Sinh nhanh từ Blueprint (/goal)",
          list_topics: "Liệt kê danh sách Topic",
        };

        for (const [tool, expected] of Object.entries(mappings)) {
          expect(formatToolDisplayName(tool)).toBe(expected);
        }
      });

      it("falls back to the raw tool name for unmapped tools", () => {
        expect(formatToolDisplayName("unknown_tool_xyz")).toBe("unknown_tool_xyz");
        expect(formatToolDisplayName("custom_webmcp_handler")).toBe("custom_webmcp_handler");
        expect(formatToolDisplayName("")).toBe("");
      });
    });
  });

  describe("Mission Item 3: React 19 Compliance & SDK Clean Architecture", () => {
    it("ensures useRoadmapAssistantChat has zero render-phase ref mutations or reads", () => {
      const hookContent = readProjectFile(
        "roadmap-rag-assistant/sdk/typescript/src/react/useRoadmapAssistantChat.ts"
      );

      // Verify no ref.current assignments outside of useEffect
      const lines = hookContent.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes(".current =") && !line.includes("null")) {
          // Check if inside useEffect or a callback
          const prevContext = lines.slice(Math.max(0, i - 100), i + 1).join("\n");
          const isInEffect = prevContext.includes("useEffect");
          const isInCallback = prevContext.includes("useCallback") || prevContext.includes("client.streamChat");
          expect(
            isInEffect || isInCallback,
            `Ref mutation on line ${i + 1} (${line.trim()}) must be inside useEffect or callback`
          ).toBe(true);
        }
      }
    });

    it("verifies unmount abort cleanup is present in useRoadmapAssistantChat", () => {
      const hookContent = readProjectFile(
        "roadmap-rag-assistant/sdk/typescript/src/react/useRoadmapAssistantChat.ts"
      );
      expect(hookContent).toContain("abortControllerRef.current.abort()");
      expect(hookContent).toContain("return () => {");
    });

    it("verifies ChatActionChip type contracts in types.ts and react/types.ts", () => {
      const coreTypes = readProjectFile("roadmap-rag-assistant/sdk/typescript/src/types.ts");
      const reactTypes = readProjectFile("roadmap-rag-assistant/sdk/typescript/src/react/types.ts");

      expect(coreTypes).toContain("export interface ChatActionChip");
      expect(coreTypes).toContain("type: 'project' | 'roadmap' | 'contact' | 'link'");
      expect(coreTypes).toContain("actionChips?: ChatActionChip[]");

      expect(reactTypes).toContain("export type { ChatActionChip }");
      expect(reactTypes).toContain("actionChips?: ChatActionChip[]");
    });

    it("verifies SDK root exports include all public symbols", () => {
      const indexContent = readProjectFile("roadmap-rag-assistant/sdk/typescript/src/index.ts");
      expect(indexContent).toContain("useRoadmapAssistantChat");
      expect(indexContent).toContain("RoadmapChatbotWidget");
      expect(indexContent).toContain("ChatActionChip");
      expect(indexContent).toContain("export * from './react/icons'");
      expect(indexContent).toContain("export * from './react/utils/formatters'");
    });

    it("executes useRoadmapAssistantChat hook inside React 19 component rendering without error", async () => {
      const { useRoadmapAssistantChat } = await import(
        "../../roadmap-rag-assistant/sdk/typescript/src/react/useRoadmapAssistantChat"
      );

      function TestChatComponent() {
        const chat = useRoadmapAssistantChat({
          baseUrl: "http://localhost:8000",
          threadId: "challenger-test-session",
          initialMessages: [
            {
              id: "init-1",
              role: "user",
              content: "Hello AI Assistant",
              timestamp: new Date(),
            },
          ],
        });

        return React.createElement(
          "div",
          { id: "chat-test-container" },
          React.createElement("span", { id: "msg-count" }, String(chat.messages.length)),
          React.createElement("span", { id: "is-loading" }, String(chat.isLoading)),
          React.createElement("span", { id: "is-streaming" }, String(chat.isStreaming))
        );
      }

      const markup = ReactDOMServer.renderToStaticMarkup(React.createElement(TestChatComponent));
      expect(markup).toContain('id="chat-test-container"');
      expect(markup).toContain('<span id="msg-count">1</span>');
      expect(markup).toContain('<span id="is-loading">false</span>');
      expect(markup).toContain('<span id="is-streaming">false</span>');
    });
  });
});
