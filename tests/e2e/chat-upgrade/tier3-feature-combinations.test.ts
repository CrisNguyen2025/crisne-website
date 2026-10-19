import { describe, it, expect } from "vitest";
import React from "react";
import {
  renderComponentToHtml,
  extractTags,
  parseSseLines,
  formatSseChunk,
} from "./helpers";

describe("Tier 3 — Feature Combinations & Pairwise Interactions", () => {
  // ==========================================
  // Pairwise 1: Thinking Process + Markdown Table
  // ==========================================
  describe("Combination 1: Thinking Process Followed by Markdown Table", () => {
    it("renders both collapsible thought process and markdown table in single message container", async () => {
      const { MarkdownTable } = await import(
        "@/roadmap-rag-assistant/sdk/typescript/src/react/components/MarkdownTable"
      );

      const ThinkingAndTableMessage = () => {
        return React.createElement(
          "div",
          { className: "space-y-3" },
          // Thinking block
          React.createElement(
            "div",
            { className: "rounded-md bg-muted/20 border-l-2 border-border/60 p-2 text-xs text-muted-foreground" },
            React.createElement("span", { className: "font-medium" }, "Thought for 3 seconds"),
            React.createElement("p", { className: "italic mt-1" }, "Cần so sánh độ phức tạp thời gian và không gian của các giải thuật.")
          ),
          // Markdown Table
          React.createElement(MarkdownTable, {
            headers: ["Thuật toán", "Thời gian", "Không gian"],
            alignments: ["left", "center", "center"],
            rows: [
              ["Dijkstra", "O(E + V log V)", "O(V)"],
              ["Bellman-Ford", "O(V * E)", "O(V)"],
              ["Floyd-Warshall", "O(V^3)", "O(V^2)"],
            ],
            renderInline: (t: string) => [t],
          })
        );
      };

      const html = renderComponentToHtml(React.createElement(ThinkingAndTableMessage));
      expect(html).toContain("Thought for 3 seconds");
      expect(html).toContain("Dijkstra");
      expect(html).toContain("Floyd-Warshall");
      expect(html).toContain("<table");
      expect(extractTags(html, "tr")).toHaveLength(4); // 1 header + 3 rows
    });
  });

  // ==========================================
  // Pairwise 2: Tool Execution Card + Code Block
  // ==========================================
  describe("Combination 2: Tool Execution Card Inside Code Explanations", () => {
    it("renders tool step card alongside syntax-highlighted code block", async () => {
      const { ToolStepRow } = await import(
        "@/roadmap-rag-assistant/sdk/typescript/src/react/ToolStepRow"
      );
      const { CodeBlock } = await import(
        "@/roadmap-rag-assistant/sdk/typescript/src/react/components/CodeBlock"
      );

      const ToolAndCodeContainer = () => {
        return React.createElement(
          "div",
          { className: "space-y-3" },
          React.createElement(ToolStepRow, {
            label: "Xác thực syntax code",
            summary: "TypeScript 5.0 compilation: 0 errors",
            running: false,
            tone: "default",
            startedAt: Date.now() - 2500,
            endedAt: Date.now(),
          }),
          React.createElement(CodeBlock, {
            lang: "typescript",
            code: [
              "export function findShortestPath(graph: Graph, start: string): PathResult {",
              "  const distances = new Map<string, number>();",
              "  return { distances };",
              "}",
            ].join("\n"),
            showLineNumbers: true,
          })
        );
      };

      const html = renderComponentToHtml(React.createElement(ToolAndCodeContainer));
      expect(html).toContain("Xác thực syntax code");
      expect(html).toContain("TypeScript");
      expect(html).toContain("findShortestPath");
      expect(html).toContain("select-none"); // Line numbers
    });
  });

  // ==========================================
  // Pairwise 3: Math Formulas Inside GitHub Callout Alerts
  // ==========================================
  describe("Combination 3: Math Formulas Inside GitHub Alerts", () => {
    it("renders inline math formula within a Note alert", async () => {
      const { CalloutAlert } = await import(
        "@/roadmap-rag-assistant/sdk/typescript/src/react/components/CalloutAlert"
      );

      const html = renderComponentToHtml(
        React.createElement(CalloutAlert, {
          type: "note",
          title: "Định Lý Tối Ưu",
          lines: ["Theo định lý Bayes, ta có $P(A|B) = \\frac{P(B|A)P(A)}{P(B)}$ khi $P(B) > 0$."],
          renderInline: (text: string) => {
            // Render inline math as a monospace chip
            const parts = text.split(/(\$[^$]+\$)/g);
            return parts.map((part, idx) => {
              if (part.startsWith("$") && part.endsWith("$")) {
                return React.createElement(
                  "span",
                  { key: idx, className: "font-mono font-semibold px-1 rounded bg-muted/40" },
                  part.slice(1, -1)
                );
              }
              return part;
            });
          },
        })
      );

      expect(html).toContain("Định Lý Tối Ưu");
      expect(html).toContain("border-l-sky-500");
      expect(html).toContain("P(A|B) = \\frac{P(B|A)P(A)}{P(B)}");
      expect(html).toContain("font-mono");
    });

    it("renders Tip alert with block math formula embedded", async () => {
      const { CalloutAlert } = await import(
        "@/roadmap-rag-assistant/sdk/typescript/src/react/components/CalloutAlert"
      );

      const trailingMath = React.createElement(
        "div",
        { className: "my-2 p-2 rounded bg-background/60 font-mono text-center text-xs" },
        "\\lim_{n \\to \\infty} (1 + \\frac{1}{n})^n = e"
      );

      const html = renderComponentToHtml(
        React.createElement(CalloutAlert, {
          type: "tip",
          title: "Giới Hạn Cơ Bản",
          lines: ["Công thức tính hằng số Euler:"],
          trailing: trailingMath,
          renderInline: (t: string) => [t],
        })
      );

      expect(html).toContain("Giới Hạn Cơ Bản");
      expect(html).toContain("border-l-emerald-500");
      expect(html).toContain("(1 + \\frac{1}{n})^n = e");
    });
  });

  // ==========================================
  // Pairwise 4: Tables with Embedded Code and Math Symbols
  // ==========================================
  describe("Combination 4: Tables with Code Snippets & Math Expressions", () => {
    it("renders table containing code tokens and math formulas in table cells", async () => {
      const { MarkdownTable } = await import(
        "@/roadmap-rag-assistant/sdk/typescript/src/react/components/MarkdownTable"
      );

      const html = renderComponentToHtml(
        React.createElement(MarkdownTable, {
          headers: ["Thao tác", "Hàm SDK", "Độ phức tạp"],
          alignments: ["left", "left", "center"],
          rows: [
            ["Tra cứu vector", "`queryIndex()`", "$O(\\log N)$"],
            ["Chuyển đổi token", "`createSmoothStream()`", "$O(1)$"],
          ],
          renderInline: (text: string) => {
            if (text.startsWith("`") && text.endsWith("`")) {
              return [React.createElement("code", { key: 1, className: "font-mono text-xs bg-muted px-1 rounded" }, text.slice(1, -1))];
            }
            if (text.startsWith("$") && text.endsWith("$")) {
              return [React.createElement("span", { key: 2, className: "font-mono font-medium" }, text.slice(1, -1))];
            }
            return [text];
          },
        })
      );

      expect(html).toContain("queryIndex()");
      expect(html).toContain("createSmoothStream()");
      expect(html).toContain("O(\\log N)");
      expect(html).toContain("<code");
    });
  });

  // ==========================================
  // Pairwise 5: Checklists Inside Callout Alert Cards
  // ==========================================
  describe("Combination 5: Checklists Inside Warning/Important Alerts", () => {
    it("renders interactive checklist tasks inside Important alert container", async () => {
      const { CalloutAlert } = await import(
        "@/roadmap-rag-assistant/sdk/typescript/src/react/components/CalloutAlert"
      );

      const checklistBlock = React.createElement(
        "ul",
        { className: "mt-2 space-y-1.5" },
        React.createElement(
          "li",
          { className: "flex items-center gap-2 line-through text-muted-foreground" },
          React.createElement("input", { type: "checkbox", defaultChecked: true, readOnly: true }),
          "Kiểm tra biến môi trường NEXT_PUBLIC"
        ),
        React.createElement(
          "li",
          { className: "flex items-center gap-2 font-medium" },
          React.createElement("input", { type: "checkbox", defaultChecked: false, readOnly: true }),
          "Chạy migration cơ sở dữ liệu trên production"
        )
      );

      const html = renderComponentToHtml(
        React.createElement(CalloutAlert, {
          type: "important",
          title: "Danh Sách Kiểm Tra Triển Khai",
          lines: ["Vui lòng xác nhận toàn bộ các tiêu chí trước khi release:"],
          trailing: checklistBlock,
          renderInline: (t: string) => [t],
        })
      );

      expect(html).toContain("Danh Sách Kiểm Tra Triển Khai");
      expect(html).toContain("border-l-purple-500");
      expect(html).toContain("Kiểm tra biến môi trường");
      expect(html).toContain("Chạy migration");
      expect(html).toContain("line-through");
    });
  });

  // ==========================================
  // Pairwise 6: Full Streaming Lifecycle Transitions
  // ==========================================
  describe("Combination 6: Complete Streaming Lifecycle (Thinking -> Tools -> Markdown)", () => {
    it("simulates full multi-stage SSE stream transitioning seamlessly", () => {
      const fullSse = [
        formatSseChunk("thinking", { delta: "Đang kiểm tra schema...\n" }),
        formatSseChunk("thinking", { delta: "Khởi động truy vấn." }),
        formatSseChunk("tool_start", { name: "search_db", args: { table: "users" } }),
        formatSseChunk("tool_end", { name: "search_db", result: "2 rows found" }),
        formatSseChunk("token", { delta: "Dưới đây là kết quả:\n\n" }),
        formatSseChunk("token", { delta: "| ID | User |\n| :--- | :--- |\n| 1 | Alice |\n" }),
        formatSseChunk("done", { finishReason: "stop" }),
      ].join("");

      const events = parseSseLines(fullSse);
      expect(events).toHaveLength(7);

      const stages = events.map((e) => e.event);
      expect(stages).toEqual([
        "thinking",
        "thinking",
        "tool_start",
        "tool_end",
        "token",
        "token",
        "done",
      ]);
    });
  });
});
