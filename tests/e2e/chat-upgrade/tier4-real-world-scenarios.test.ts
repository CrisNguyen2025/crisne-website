import { describe, it, expect } from "vitest";
import React from "react";
import {
  renderComponentToHtml,
  extractTags,
  parseSseLines,
  formatSseChunk,
} from "./helpers";

describe("Tier 4 — Real-World Claude-Style Chat Scenarios", () => {
  // ==========================================
  // Scenario 1: Complex Algorithmic Analysis & Optimization (Multi-turn)
  // ==========================================
  describe("Scenario 1: Algorithmic Comparison & Binary Heap Optimization", () => {
    it("simulates Turn 1: User asks for Dijkstra vs A* comparison -> Thinking, Table, Math, and Code", async () => {
      const { MarkdownTable } = await import(
        "@/roadmap-rag-assistant/sdk/typescript/src/react/components/MarkdownTable"
      );
      const { CodeBlock } = await import(
        "@/roadmap-rag-assistant/sdk/typescript/src/react/components/CodeBlock"
      );

      // Turn 1 Assistant Message representation
      const AssistantTurn1 = () => {
        return React.createElement(
          "div",
          { className: "space-y-3" },
          // Claude-style thought container
          React.createElement(
            "div",
            { className: "rounded-md bg-muted/20 border-l-2 border-border/60 p-2 text-xs text-muted-foreground" },
            React.createElement("span", { className: "font-semibold" }, "Thought for 3.8 seconds"),
            React.createElement("p", { className: "italic mt-1" }, "So sánh tiêu chí: Heuristic, độ phức tạp thời gian/không gian, và tính tối ưu.")
          ),
          // Markdown Table
          React.createElement(MarkdownTable, {
            headers: ["Thuật toán", "Hàm đánh giá", "Thời gian", "Tối ưu"],
            alignments: ["left", "center", "center", "center"],
            rows: [
              ["Dijkstra", "g(n)", "O(E + V log V)", "Có"],
              ["A*", "f(n) = g(n) + h(n)", "O(E)", "Có (nếu h admissible)"],
            ],
            renderInline: (t: string) => [t],
          }),
          // Code block with copy action
          React.createElement(CodeBlock, {
            lang: "typescript",
            code: [
              "interface Node { id: string; g: number; h: number; f: number; }",
              "function aStarSearch(start: Node, goal: Node): Node[] {",
              "  const openSet = new PriorityQueue<Node>((a, b) => a.f - b.f);",
              "  openSet.push(start);",
              "  return [];",
              "}",
            ].join("\n"),
            showLineNumbers: true,
          })
        );
      };

      const html = renderComponentToHtml(React.createElement(AssistantTurn1));

      expect(html).toContain("Thought for 3.8 seconds");
      expect(html).toContain("Dijkstra");
      expect(html).toContain("aStarSearch");
      expect(html).toContain("TypeScript");
      expect(html).toContain("<table");
      expect(html).toContain("<button"); // Copy button
    });

    it("simulates Turn 2: Optimization query triggers tool execution card and benchmark metrics", async () => {
      const { ToolStepRow } = await import(
        "@/roadmap-rag-assistant/sdk/typescript/src/react/ToolStepRow"
      );
      const { CalloutAlert } = await import(
        "@/roadmap-rag-assistant/sdk/typescript/src/react/components/CalloutAlert"
      );

      const AssistantTurn2 = () => {
        return React.createElement(
          "div",
          { className: "space-y-3" },
          React.createElement(ToolStepRow, {
            label: "Chạy benchmark đồ thị 10,000 đỉnh",
            summary: "Giảm thời gian từ 145ms xuống 18ms",
            running: false,
            tone: "default",
            startedAt: Date.now() - 3200,
            endedAt: Date.now(),
            detail: "PriorityQueue: BinaryHeap, GraphSize: 10000, Edges: 45000",
            expanded: true,
            onToggle: () => {},
          }),
          React.createElement(CalloutAlert, {
            type: "tip",
            title: "Kết Quả Tối Ưu",
            lines: ["Việc sử dụng Binary Heap giúp giảm độ phức tạp tìm min từ O(V) xuống O(log V)."],
            renderInline: (t: string) => [t],
          })
        );
      };

      const html = renderComponentToHtml(React.createElement(AssistantTurn2));

      expect(html).toContain("Chạy benchmark đồ thị 10,000 đỉnh");
      expect(html).toContain("Giảm thời gian từ 145ms xuống 18ms");
      expect(html).toContain("BinaryHeap");
      expect(html).toContain("border-l-emerald-500");
    });
  });

  // ==========================================
  // Scenario 2: Data Pipeline & Machine Learning Troubleshooting
  // ==========================================
  describe("Scenario 2: Data Pipeline & Machine Learning Proof", () => {
    it("renders pipeline warning alert alongside mathematical normalization formula", async () => {
      const { CalloutAlert } = await import(
        "@/roadmap-rag-assistant/sdk/typescript/src/react/components/CalloutAlert"
      );

      const html = renderComponentToHtml(
        React.createElement(CalloutAlert, {
          type: "warning",
          title: "Cảnh Báo Chuẩn Hóa Vector",
          lines: [
            "Các vector embedding chưa được L2-normalize.",
            "Công thức chuẩn hóa: $\\hat{v} = \\frac{v}{\\|v\\|_2}$ với $\\|v\\|_2 = \\sqrt{\\sum_{i=1}^{d} v_i^2}$.",
          ],
          renderInline: (text: string) => {
            const parts = text.split(/(\$[^$]+\$)/g);
            return parts.map((part, idx) => {
              if (part.startsWith("$") && part.endsWith("$")) {
                return React.createElement("code", { key: idx, className: "font-mono font-bold" }, part.slice(1, -1));
              }
              return part;
            });
          },
        })
      );

      expect(html).toContain("Cảnh Báo Chuẩn Hóa Vector");
      expect(html).toContain("border-l-amber-500");
      expect(html).toContain("\\hat{v} = \\frac{v}{\\|v\\|_2}");
    });
  });

  // ==========================================
  // Scenario 3: Database Migration with Checklist & Caution Alert
  // ==========================================
  describe("Scenario 3: Production Database Migration Deployment", () => {
    it("renders Caution alert, interactive deployment checklist, and bash command chip", async () => {
      const { CalloutAlert } = await import(
        "@/roadmap-rag-assistant/sdk/typescript/src/react/components/CalloutAlert"
      );
      const { CodeBlock } = await import(
        "@/roadmap-rag-assistant/sdk/typescript/src/react/components/CodeBlock"
      );

      const DeploymentView = () => {
        return React.createElement(
          "div",
          { className: "space-y-3" },
          React.createElement(CalloutAlert, {
            type: "caution",
            title: "Thao Tác Tác Động Cơ Sở Dữ Liệu",
            lines: ["Thao tác `ALTER TABLE` có thể lock bảng tạm thời trên Production."],
            renderInline: (t: string) => [t],
          }),
          React.createElement(
            "ul",
            { className: "space-y-1 text-xs" },
            React.createElement(
              "li",
              { className: "flex items-center gap-2 line-through text-muted-foreground" },
              React.createElement("input", { type: "checkbox", defaultChecked: true, readOnly: true }),
              "Sao lưu snapshot Turso SQLite"
            ),
            React.createElement(
              "li",
              { className: "flex items-center gap-2 font-medium" },
              React.createElement("input", { type: "checkbox", defaultChecked: false, readOnly: true }),
              "Chạy npx prisma db push --accept-data-loss"
            )
          ),
          React.createElement(CodeBlock, {
            lang: "bash",
            code: "npx prisma migrate deploy",
          })
        );
      };

      const html = renderComponentToHtml(React.createElement(DeploymentView));

      expect(html).toContain("Thao Tác Tác Động Cơ Sở Dữ Liệu");
      expect(html).toContain("border-l-rose-500");
      expect(html).toContain("Sao lưu snapshot Turso");
      const textContent = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
      expect(textContent).toContain("npx prisma migrate deploy");
      expect(html).toContain("Bash");
    });
  });

  // ==========================================
  // Scenario 4: Tool Execution Failure & Graceful Degradation
  // ==========================================
  describe("Scenario 4: Tool Failure Handling & Fallback Circuit", () => {
    it("renders failed tool state and fallback advisory alert", async () => {
      const { ToolStepRow } = await import(
        "@/roadmap-rag-assistant/sdk/typescript/src/react/ToolStepRow"
      );
      const { CalloutAlert } = await import(
        "@/roadmap-rag-assistant/sdk/typescript/src/react/components/CalloutAlert"
      );

      const html = renderComponentToHtml(
        React.createElement(
          "div",
          { className: "space-y-3" },
          React.createElement(ToolStepRow, {
            label: "Kiểm tra cache Redis",
            summary: "Lỗi kết nối ECONNREFUSED",
            running: false,
            tone: "error",
            startedAt: Date.now() - 1000,
            endedAt: Date.now(),
            detail: "Failed to connect to redis://localhost:6379 after 3 retries",
            expanded: true,
            onToggle: () => {},
          }),
          React.createElement(CalloutAlert, {
            type: "warning",
            title: "Kích Hoạt Fallback",
            lines: ["Hệ thống đã tự động chuyển đổi sang bộ nhớ đệm In-Memory L1."],
            renderInline: (t: string) => [t],
          })
        )
      );

      expect(html).toContain("Kiểm tra cache Redis");
      expect(html).toContain("ECONNREFUSED");
      expect(html).toContain("text-[#B42318]"); // Error tone
      expect(html).toContain("Kích Hoạt Fallback");
      expect(html).toContain("border-l-amber-500");
    });
  });

  // ==========================================
  // Scenario 5: Multi-Turn Conversation History Integrity
  // ==========================================
  describe("Scenario 5: Multi-Turn Conversation History Structure", () => {
    it("maintains conversation turns with alternating roles and distinct identifiers", () => {
      interface ChatTurn {
        id: string;
        role: "user" | "assistant";
        content: string;
        thinking?: string;
        hasTable?: boolean;
        hasCode?: boolean;
      }

      const conversation: ChatTurn[] = [
        {
          id: "turn-1-u",
          role: "user",
          content: "Giải thích kiến trúc RAG của dự án.",
        },
        {
          id: "turn-1-a",
          role: "assistant",
          content: "Kiến trúc RAG gồm 3 tầng chính...",
          thinking: "Truy xuất tài liệu từ roadmap layers...",
          hasTable: true,
        },
        {
          id: "turn-2-u",
          role: "user",
          content: "Cung cấp mẫu code gọi SDK từ Next.js.",
        },
        {
          id: "turn-2-a",
          role: "assistant",
          content: "Dưới đây là mẫu hook:",
          hasCode: true,
        },
      ];

      expect(conversation).toHaveLength(4);
      expect(conversation[0].role).toBe("user");
      expect(conversation[1].role).toBe("assistant");
      expect(conversation[1].hasTable).toBe(true);
      expect(conversation[3].hasCode).toBe(true);

      const assistantTurns = conversation.filter((t) => t.role === "assistant");
      expect(assistantTurns).toHaveLength(2);
      expect(assistantTurns[0].thinking).toBeDefined();
    });
  });
});
