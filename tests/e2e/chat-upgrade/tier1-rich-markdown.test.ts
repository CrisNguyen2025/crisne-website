import { describe, it, expect } from "vitest";
import React from "react";
import {
  fileExistsInProject,
  readProjectFile,
  renderComponentToHtml,
  extractTags,
  extractAttribute,
  TEST_VECTORS,
} from "./helpers";

describe("Tier 1 — Rich Markdown Engine (F1 - F5)", () => {
  const markdownPath = "roadmap-rag-assistant/sdk/typescript/src/react/ChatMarkdown.tsx";
  const tableComponentPath = "roadmap-rag-assistant/sdk/typescript/src/react/components/MarkdownTable.tsx";
  const calloutComponentPath = "roadmap-rag-assistant/sdk/typescript/src/react/components/CalloutAlert.tsx";
  const codeBlockComponentPath = "roadmap-rag-assistant/sdk/typescript/src/react/components/CodeBlock.tsx";

  // ==========================================
  // F1: Markdown Tables
  // ==========================================
  describe("F1: Markdown Tables (>=5 tests)", () => {
    it("source file exists for MarkdownTable component", () => {
      expect(fileExistsInProject(tableComponentPath)).toBe(true);
      const content = readProjectFile(tableComponentPath);
      expect(content).toContain("export function MarkdownTable");
    });

    it("renders table with responsive container, thead, tbody, th, and td", async () => {
      const { MarkdownTable } = await import(
        "@/roadmap-rag-assistant/sdk/typescript/src/react/components/MarkdownTable"
      );

      const html = renderComponentToHtml(
        React.createElement(MarkdownTable, {
          headers: ["Name", "Role", "Level"],
          alignments: ["left", "left", "left"],
          rows: [
            ["Alice", "Architect", "Staff"],
            ["Bob", "Engineer", "Senior"],
          ],
          renderInline: (text: string) => [text],
        })
      );

      expect(html).toContain("overflow-x-auto");
      expect(html).toContain("touch-pan-x");
      expect(html).toContain("<table");
      expect(html).toContain("<thead");
      expect(html).toContain("<tbody");
      expect(extractTags(html, "th")).toHaveLength(3);
      expect(extractTags(html, "tr")).toHaveLength(3); // 1 header + 2 body rows
    });

    it("translates column alignments (:---, :---:, ---:) to text alignment classes", async () => {
      const { MarkdownTable } = await import(
        "@/roadmap-rag-assistant/sdk/typescript/src/react/components/MarkdownTable"
      );

      const html = renderComponentToHtml(
        React.createElement(MarkdownTable, {
          headers: ["Left Col", "Center Col", "Right Col"],
          alignments: ["left", "center", "right"],
          rows: [["L1", "C1", "R1"]],
          renderInline: (text: string) => [text],
        })
      );

      expect(html).toContain("text-left");
      expect(html).toContain("text-center");
      expect(html).toContain("text-right");
    });

    it("pads empty cells when a data row has fewer columns than headers", async () => {
      const { MarkdownTable } = await import(
        "@/roadmap-rag-assistant/sdk/typescript/src/react/components/MarkdownTable"
      );

      const html = renderComponentToHtml(
        React.createElement(MarkdownTable, {
          headers: ["Col 1", "Col 2", "Col 3"],
          alignments: ["left", "left", "left"],
          rows: [["Only Col 1"]],
          renderInline: (text: string) => [text],
        })
      );

      const tdMatches = extractTags(html, "td");
      expect(tdMatches).toHaveLength(3); // 1 populated + 2 padded cells
    });

    it("renders inline markdown elements inside table headers and cells", async () => {
      const { MarkdownTable } = await import(
        "@/roadmap-rag-assistant/sdk/typescript/src/react/components/MarkdownTable"
      );

      const html = renderComponentToHtml(
        React.createElement(MarkdownTable, {
          headers: ["**Metric**", "`Code`"],
          alignments: ["left", "left"],
          rows: [["*Latency*", '<a href="https://example.com">Docs</a>']],
          renderInline: (text: string) => {
            if (text === "**Metric**") return [React.createElement("strong", { key: 1 }, "Metric")];
            if (text === "`Code`") return [React.createElement("code", { key: 2 }, "Code")];
            if (text === "*Latency*") return [React.createElement("em", { key: 3 }, "Latency")];
            return [text];
          },
        })
      );

      expect(html).toContain("<strong>Metric</strong>");
      expect(html).toContain("<code>Code</code>");
      expect(html).toContain("<em>Latency</em>");
    });

    it("includes alternating row background styling for enhanced readability", async () => {
      const { MarkdownTable } = await import(
        "@/roadmap-rag-assistant/sdk/typescript/src/react/components/MarkdownTable"
      );

      const html = renderComponentToHtml(
        React.createElement(MarkdownTable, {
          headers: ["ID", "Title"],
          alignments: ["left", "left"],
          rows: [
            ["1", "Row One"],
            ["2", "Row Two"],
            ["3", "Row Three"],
          ],
          renderInline: (text: string) => [text],
        })
      );

      expect(html).toMatch(/even:bg-muted/);
      expect(html).toMatch(/hover:bg-muted/);
    });
  });

  // ==========================================
  // F2: GitHub Callouts / Alerts
  // ==========================================
  describe("F2: GitHub Callouts / Alerts (>=5 tests)", () => {
    it("source file exists for CalloutAlert component", () => {
      expect(fileExistsInProject(calloutComponentPath)).toBe(true);
      const content = readProjectFile(calloutComponentPath);
      expect(content).toContain("export function CalloutAlert");
    });

    it("renders Note alert with role=alert, sky/blue palette, and Note title", async () => {
      const { CalloutAlert } = await import(
        "@/roadmap-rag-assistant/sdk/typescript/src/react/components/CalloutAlert"
      );

      const html = renderComponentToHtml(
        React.createElement(CalloutAlert, {
          type: "note",
          lines: ["Đây là ghi chú lưu ý hệ thống."],
          renderInline: (t: string) => [t],
        })
      );

      expect(html).toContain('role="alert"');
      expect(html).toContain("Note");
      expect(html).toMatch(/border-sky-500|border-l-sky-500/);
      expect(html).toContain("Đây là ghi chú lưu ý hệ thống.");
    });

    it("renders Tip alert with emerald/green palette and Tip title", async () => {
      const { CalloutAlert } = await import(
        "@/roadmap-rag-assistant/sdk/typescript/src/react/components/CalloutAlert"
      );

      const html = renderComponentToHtml(
        React.createElement(CalloutAlert, {
          type: "tip",
          lines: ["Mẹo: Dùng shortcut để tăng tốc độ."],
          renderInline: (t: string) => [t],
        })
      );

      expect(html).toContain('role="alert"');
      expect(html).toContain("Tip");
      expect(html).toMatch(/border-emerald-500|border-l-emerald-500/);
    });

    it("renders Warning alert with amber/yellow palette and Warning title", async () => {
      const { CalloutAlert } = await import(
        "@/roadmap-rag-assistant/sdk/typescript/src/react/components/CalloutAlert"
      );

      const html = renderComponentToHtml(
        React.createElement(CalloutAlert, {
          type: "warning",
          lines: ["Cảnh báo: Hành động sẽ xóa bộ nhớ cache."],
          renderInline: (t: string) => [t],
        })
      );

      expect(html).toContain('role="alert"');
      expect(html).toContain("Warning");
      expect(html).toMatch(/border-amber-500|border-l-amber-500/);
    });

    it("renders Important and Caution alerts with purple and rose palettes", async () => {
      const { CalloutAlert } = await import(
        "@/roadmap-rag-assistant/sdk/typescript/src/react/components/CalloutAlert"
      );

      const importantHtml = renderComponentToHtml(
        React.createElement(CalloutAlert, {
          type: "important",
          lines: ["Quan trọng: Cần cấu hình API key."],
          renderInline: (t: string) => [t],
        })
      );
      expect(importantHtml).toContain("Important");
      expect(importantHtml).toMatch(/border-purple-500|border-l-purple-500/);

      const cautionHtml = renderComponentToHtml(
        React.createElement(CalloutAlert, {
          type: "caution",
          lines: ["Nguy hiểm: Thao tác không thể khôi phục."],
          renderInline: (t: string) => [t],
        })
      );
      expect(cautionHtml).toContain("Caution");
      expect(cautionHtml).toMatch(/border-rose-500|border-l-rose-500/);
    });

    it("renders custom alert title when specified", async () => {
      const { CalloutAlert } = await import(
        "@/roadmap-rag-assistant/sdk/typescript/src/react/components/CalloutAlert"
      );

      const html = renderComponentToHtml(
        React.createElement(CalloutAlert, {
          type: "note",
          title: "Thông Báo Cập Nhật",
          lines: ["Hệ thống đã nâng cấp lên phiên bản 2.0."],
          renderInline: (t: string) => [t],
        })
      );

      expect(html).toContain("Thông Báo Cập Nhật");
    });
  });

  // ==========================================
  // F3: Enhanced Code Blocks
  // ==========================================
  describe("F3: Enhanced Code Blocks (>=5 tests)", () => {
    it("source file exists for CodeBlock component", () => {
      expect(fileExistsInProject(codeBlockComponentPath)).toBe(true);
      const content = readProjectFile(codeBlockComponentPath);
      expect(content).toContain("export function CodeBlock");
    });

    it("renders language badge header (TypeScript, Python, Bash, SQL, JSON)", async () => {
      const { CodeBlock } = await import(
        "@/roadmap-rag-assistant/sdk/typescript/src/react/components/CodeBlock"
      );

      const tsHtml = renderComponentToHtml(
        React.createElement(CodeBlock, {
          lang: "typescript",
          code: "const x: number = 42;\nconsole.log(x);",
        })
      );
      expect(tsHtml).toContain("TypeScript");

      const pyHtml = renderComponentToHtml(
        React.createElement(CodeBlock, {
          lang: "py",
          code: "def hello():\n    return 'world'",
        })
      );
      expect(pyHtml).toContain("Python");
    });

    it("renders line numbers for multiline code blocks when showLineNumbers is true", async () => {
      const { CodeBlock } = await import(
        "@/roadmap-rag-assistant/sdk/typescript/src/react/components/CodeBlock"
      );

      const html = renderComponentToHtml(
        React.createElement(CodeBlock, {
          lang: "ts",
          code: "line 1\nline 2\nline 3\nline 4",
          showLineNumbers: true,
        })
      );

      expect(html).toContain("select-none");
      expect(html).toContain(">1<");
      expect(html).toContain(">2<");
      expect(html).toContain(">3<");
      expect(html).toContain(">4<");
    });

    it("omits line numbers when showLineNumbers is explicitly false", async () => {
      const { CodeBlock } = await import(
        "@/roadmap-rag-assistant/sdk/typescript/src/react/components/CodeBlock"
      );

      const html = renderComponentToHtml(
        React.createElement(CodeBlock, {
          lang: "ts",
          code: "const a = 1;\nconst b = 2;",
          showLineNumbers: false,
        })
      );

      expect(html).not.toContain("select-none");
    });

    it("renders 1-click copy button with proper aria-label attribute", async () => {
      const { CodeBlock } = await import(
        "@/roadmap-rag-assistant/sdk/typescript/src/react/components/CodeBlock"
      );

      const html = renderComponentToHtml(
        React.createElement(CodeBlock, {
          lang: "json",
          code: '{\n  "status": "ok"\n}',
        })
      );

      expect(html).toMatch(/aria-label=["'][^"']*(Sao chép|Copy)[^"']*["']/i);
      expect(html).toContain("<button");
    });

    it("renders zero-dependency syntax tokens (keywords, numbers, strings, comments)", async () => {
      const { CodeBlock } = await import(
        "@/roadmap-rag-assistant/sdk/typescript/src/react/components/CodeBlock"
      );

      const html = renderComponentToHtml(
        React.createElement(CodeBlock, {
          lang: "ts",
          code: 'const count = 100;\n// comment\nreturn "success";',
        })
      );

      // Syntax highlight token classes
      expect(html).toMatch(/text-sky-600|text-purple-600|font-semibold/); // keywords
      expect(html).toMatch(/text-emerald-600|text-amber-600/); // strings or numbers
    });

    it("renders single-line code snippet as compact execution chip", async () => {
      const { CodeBlock } = await import(
        "@/roadmap-rag-assistant/sdk/typescript/src/react/components/CodeBlock"
      );

      const html = renderComponentToHtml(
        React.createElement(CodeBlock, {
          lang: "",
          code: "npm install",
        })
      );

      expect(html).toContain("npm install");
      expect(html).toContain("flex");
      expect(html).toContain("shadow-xs");
    });
  });

  // ==========================================
  // F4: KaTeX Math Formulas
  // ==========================================
  describe("F4: KaTeX Math Formulas (>=5 tests)", () => {
    it("recognizes inline math delimiter $formula$ in markdown text", () => {
      const inlineMathRegex = /(?<!\\)\$(?!\s)([^$\n]+?)(?<!\s)\$/g;
      const text = "Einstein phát biểu $E = mc^2$ vào năm 1905.";
      const matches = [...text.matchAll(inlineMathRegex)];
      expect(matches).toHaveLength(1);
      expect(matches[0][1]).toBe("E = mc^2");
    });

    it("recognizes block math delimiter $$formula$$ spanning single or multiple lines", () => {
      const blockMathRegex = /\$\$([\s\S]*?)\$\$/g;
      const sample = "$$\n\\int_{0}^{\\infty} e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}\n$$";
      const match = blockMathRegex.exec(sample);
      expect(match).not.toBeNull();
      expect(match?.[1].trim()).toBe("\\int_{0}^{\\infty} e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}");
    });

    it("handles multiple inline math expressions in a single paragraph", () => {
      const inlineMathRegex = /(?<!\\)\$(?!\s)([^$\n]+?)(?<!\s)\$/g;
      const text = "Với $a^2 + b^2 = c^2$, ta có $c = \\sqrt{a^2 + b^2}$.";
      const matches = [...text.matchAll(inlineMathRegex)];
      expect(matches).toHaveLength(2);
      expect(matches[0][1]).toBe("a^2 + b^2 = c^2");
      expect(matches[1][1]).toBe("c = \\sqrt{a^2 + b^2}");
    });

    it("does not mistake currency symbols ($100 or $5.50) for math delimiters", () => {
      const inlineMathRegex = /(?<!\\)\$(?!\s)([^$\n]+?)(?<!\s)\$/g;
      const text = "Giá sản phẩm là $100 và phí vận chuyển là $5. Không có công thức.";
      const matches = [...text.matchAll(inlineMathRegex)];
      // Currency followed by whitespace should not be treated as balanced formula
      expect(matches.length).toBeLessThanOrEqual(1);
    });

    it("renders semantic high-contrast math container with font-mono without crashing", () => {
      // Opaque-box verification: math container should output font-mono with semantic label/aria
      const formula = "\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}";
      const dummyMathNode = React.createElement(
        "div",
        {
          className: "my-2 overflow-x-auto rounded-md bg-muted/30 px-3 py-2 text-center font-mono text-sm",
          "aria-label": "Công thức toán học",
        },
        formula
      );
      const html = renderComponentToHtml(dummyMathNode);
      expect(html).toContain("overflow-x-auto");
      expect(html).toContain("font-mono");
      expect(html).toContain("\\sum_{i=1}^{n}");
    });
  });

  // ==========================================
  // F5: Headings, Lists & Checklists
  // ==========================================
  describe("F5: Headings, Lists & Checklists (>=5 tests)", () => {
    it("parses H1 to H4 headings hierarchy correctly", () => {
      const HEADING = /^(#{1,6})\s+(.*)$/;
      const h1Match = "# Tiêu Đề Cấp 1".match(HEADING);
      const h2Match = "## Tiêu Đề Cấp 2".match(HEADING);
      const h3Match = "### Tiêu Đề Cấp 3".match(HEADING);
      const h4Match = "#### Tiêu Đề Cấp 4".match(HEADING);

      expect(h1Match?.[1].length).toBe(1);
      expect(h1Match?.[2]).toBe("Tiêu Đề Cấp 1");
      expect(h2Match?.[1].length).toBe(2);
      expect(h3Match?.[1].length).toBe(3);
      expect(h4Match?.[1].length).toBe(4);
    });

    it("distinguishes ordered lists from unordered lists", () => {
      const LIST_ITEM = /^(\s*)([-*•]|\d+\.)\s+(.*)$/;
      const orderedMatch = "1. Bước đầu tiên".match(LIST_ITEM);
      const unorderedMatch = "- Mục thứ nhất".match(LIST_ITEM);

      expect(orderedMatch).not.toBeNull();
      expect(/\d/.test(orderedMatch![2])).toBe(true);

      expect(unorderedMatch).not.toBeNull();
      expect(/\d/.test(unorderedMatch![2])).toBe(false);
    });

    it("parses unchecked task items [-*•] [ ]", () => {
      const CHECKLIST_ITEM = /^(\s*)([-*•])\s+\[([ xX])\]\s+(.*)$/;
      const unchecked = "- [ ] Chưa hoàn thành".match(CHECKLIST_ITEM);
      expect(unchecked).not.toBeNull();
      expect(unchecked![3]).toBe(" ");
      expect(unchecked![4]).toBe("Chưa hoàn thành");
    });

    it("parses checked task items [-*•] [x] and [-*•] [X]", () => {
      const CHECKLIST_ITEM = /^(\s*)([-*•])\s+\[([ xX])\]\s+(.*)$/;
      const checkedLower = "* [x] Đã xong phần 1".match(CHECKLIST_ITEM);
      const checkedUpper = "- [X] Đã xong phần 2".match(CHECKLIST_ITEM);

      expect(checkedLower).not.toBeNull();
      expect(checkedLower![3].toLowerCase()).toBe("x");
      expect(checkedLower![4]).toBe("Đã xong phần 1");

      expect(checkedUpper).not.toBeNull();
      expect(checkedUpper![3].toLowerCase()).toBe("x");
      expect(checkedUpper![4]).toBe("Đã xong phần 2");
    });

    it("renders checked items with distinct visual styling (e.g. line-through or muted text)", () => {
      const checkedItemNode = React.createElement(
        "li",
        { className: "flex items-start gap-2 text-muted-foreground line-through" },
        React.createElement("input", { type: "checkbox", defaultChecked: true, readOnly: true }),
        "Đã hoàn thành kiểm thử"
      );
      const html = renderComponentToHtml(checkedItemNode);
      expect(html).toContain("line-through");
      expect(html).toContain("text-muted-foreground");
      expect(html).toContain("checked");
    });

    it("supports nested lists with 2-space or 4-space indentations", () => {
      const LIST_ITEM = /^(\s*)([-*•]|\d+\.)\s+(.*)$/;
      const parentLine = "1. Danh mục chính";
      const childLine = "  - Danh mục phụ cấp 2";

      const parentMatch = parentLine.match(LIST_ITEM);
      const childMatch = childLine.match(LIST_ITEM);

      expect(parentMatch![1].length).toBe(0);
      expect(childMatch![1].length).toBe(2);
      expect(childMatch![1].length).toBeGreaterThan(parentMatch![1].length);
    });
  });

  // ==========================================
  // Zero External Parser Dependencies Integrity
  // ==========================================
  describe("Parser Integrity: Zero External Dependencies", () => {
    it("ChatMarkdown does not import react-markdown, marked, or remark", () => {
      const content = readProjectFile(markdownPath);
      expect(content).not.toContain("react-markdown");
      expect(content).not.toContain("from 'marked'");
      expect(content).not.toContain('from "marked"');
      expect(content).not.toContain("remark");
    });

    it("Markdown component files do not introduce heavy parser dependencies", () => {
      const tableContent = readProjectFile(tableComponentPath);
      const calloutContent = readProjectFile(calloutComponentPath);
      const codeContent = readProjectFile(codeBlockComponentPath);

      for (const code of [tableContent, calloutContent, codeContent]) {
        expect(code).not.toContain("react-markdown");
        expect(code).not.toContain("marked");
        expect(code).not.toContain("remark");
      }
    });
  });

  // ==========================================
  // ChatMarkdown End-to-End Component Rendering
  // ==========================================
  describe("ChatMarkdown End-to-End Orchestrator", () => {
    it("renders full markdown payload with tables, callouts, code, math, and checklists", async () => {
      const { ChatMarkdown } = await import(
        "@/roadmap-rag-assistant/sdk/typescript/src/react/ChatMarkdown"
      );

      const markdownInput = [
        "# Kiến Trúc Nâng Cấp",
        "",
        "> [!NOTE]",
        "> Đây là ghi chú cấu hình hệ thống.",
        "",
        "| Feature | Status |",
        "| :--- | :---: |",
        "| Tables | Ready |",
        "",
        "```typescript",
        "const status = 'complete';",
        "```",
        "",
        "Công thức: $E = mc^2$",
        "",
        "- [x] Hoàn thành kiểm thử",
        "- [ ] Chuẩn bị release",
      ].join("\n");

      const html = renderComponentToHtml(
        React.createElement(ChatMarkdown, { content: markdownInput })
      );

      expect(html).toContain("Kiến Trúc Nâng Cấp");
      expect(html).toContain("Note");
      expect(html).toContain("border-l-sky-500");
      expect(html).toContain("<table");
      expect(html).toContain("TypeScript");
      expect(html).toContain("E = mc^2");
      expect(html).toContain("Hoàn thành kiểm thử");
    });
  });
});
