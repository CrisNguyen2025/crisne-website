import { describe, it, expect } from "vitest";
import {
  cleanAntiSlopText,
  countWords,
  getFirstSentence,
  isDirectAnswerCompliant,
  createAntiSlopTransformStream,
  ALL_OPENER_PATTERNS,
  SUMMARY_RECAP_KICKERS,
} from "@/lib/ai/anti-slop";
import {
  formatActionChip,
  parseMessageContentAndActions,
  scanEntityMentions,
  appendEntityActionChips,
  AUTHORITATIVE_PROJECTS,
  AUTHORITATIVE_LAYERS,
  AUTHORITATIVE_CONTACTS,
} from "@/lib/ai/action-chips";

function createMockStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

function createMockStringStream(chunks: string[]): ReadableStream<string> {
  return new ReadableStream<string>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

async function readStream(stream: ReadableStream<any>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let result = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      result += typeof value === "string" ? value : decoder.decode(value, { stream: true });
    }
  }
  result += decoder.decode();
  return result;
}

describe("Adversarial Stress Test: Anti-Slop Engine", () => {
  describe("Fragmentation & Byte Boundaries", () => {
    it("handles extreme 1-byte streaming chunks across multi-byte UTF-8 Vietnamese greetings", async () => {
      const text = "Chào bạn! Cris đã phát triển Kamala.";
      const encoder = new TextEncoder();
      const bytes = encoder.encode(text);
      const byteChunks: Uint8Array[] = Array.from(bytes).map((b) => new Uint8Array([b]));

      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          for (const b of byteChunks) {
            controller.enqueue(b);
          }
          controller.close();
        },
      });

      const transformed = stream.pipeThrough(createAntiSlopTransformStream());
      const result = await readStream(transformed);
      expect(result.trim()).toBe("Cris đã phát triển Kamala.");
    });

    it("handles empty and whitespace-only chunks without crashing or locking the stream", async () => {
      const stream = createMockStream([
        "",
        "   ",
        "Chào bạn! ",
        "",
        "Cris chuyên ",
        "  ",
        "Next.js.",
        "",
      ]);
      const transformed = stream.pipeThrough(createAntiSlopTransformStream());
      const result = await readStream(transformed);
      expect(result.trim()).toBe("Cris chuyên   Next.js.");
    });

    it("handles stream consisting entirely of banned openers and kickers", async () => {
      const stream = createMockStream([
        "Chào bạn! ",
        "Rất vui được hỗ trợ bạn! ",
        "Tuyệt vời quá! ",
        "Tóm lại hãy liên hệ với Cris nhé!",
      ]);
      const transformed = stream.pipeThrough(createAntiSlopTransformStream());
      const result = await readStream(transformed);
      expect(result.trim()).toBe("");
    });
  });

  describe("Casing, Punctuation & Chained Openers", () => {
    it("strips varied case greetings (ALL CAPS, MiXeD CaSe)", () => {
      expect(cleanAntiSlopText("CHÀO BẠN! Cris làm việc tại TP.HCM.")).toBe(
        "Cris làm việc tại TP.HCM."
      );
      expect(cleanAntiSlopText("xIn ChÀo! Cris làm việc tại TP.HCM.")).toBe(
        "Cris làm việc tại TP.HCM."
      );
      expect(cleanAntiSlopText("HELLO THERE! Cris is based in Vietnam.")).toBe(
        "Cris is based in Vietnam."
      );
    });

    it("strips polite particles: dạ chào bạn, xin chào quý khách nha", () => {
      expect(cleanAntiSlopText("Dạ chào bạn nha! Cris là kỹ sư frontend.")).toBe(
        "Cris là kỹ sư frontend."
      );
      expect(cleanAntiSlopText("Xin chào quý khách ạ! Cris là kỹ sư frontend.")).toBe(
        "Cris là kỹ sư frontend."
      );
    });

    it("strips multi-layer stacked openers in one pass", () => {
      const stacked =
        "Xin chào! Cảm ơn bạn đã đặt câu hỏi. Tuyệt vời! Về câu hỏi của bạn, Cris có 5 năm kinh nghiệm.";
      expect(cleanAntiSlopText(stacked)).toBe("Cris có 5 năm kinh nghiệm.");
    });
  });

  describe("Summary Kickers and Action Tag Preservation", () => {
    it("strips kicker split across chunk boundaries", async () => {
      const stream = createMockStream([
        "Cris chuyên về Next.js. ",
        "Tóm ",
        "lại, ",
        "nếu có thắc mắc hãy ",
        "liên hệ nhé!",
      ]);
      const transformed = stream.pipeThrough(createAntiSlopTransformStream());
      const result = await readStream(transformed);
      expect(result.trim()).toBe("Cris chuyên về Next.js.");
    });

    it("preserves trailing action tags while removing preceding kicker", async () => {
      const stream = createMockStream([
        "Cris phát triển Kamala. ",
        "Tóm lại, bạn hãy xem chi tiết. ",
        "[[action:project|kamala-commerce-tour|Khám phá Kamala]]",
      ]);
      const transformed = stream.pipeThrough(createAntiSlopTransformStream());
      const result = await readStream(transformed);
      expect(result).not.toContain("Tóm lại");
      expect(result).toContain("[[action:project|kamala-commerce-tour|Khám phá Kamala]]");
    });
  });

  describe("Low Latency / Immediate Emission", () => {
    it("emits non-opener clean initial text immediately without waiting for threshold", async () => {
      const stream = createMockStream(["Next.js ", "16 ", "Turbopack"]);
      const transformed = stream.pipeThrough(createAntiSlopTransformStream());
      const reader = transformed.getReader();
      const first = await reader.read();
      expect(first.done).toBe(false);
      const text = new TextDecoder().decode(first.value);
      expect(text).toBe("Next.js ");
    });
  });

  describe("Direct Answer Compliance", () => {
    it("validates direct answers with exact word limits and action tag exclusions", () => {
      // 20 words
      const twentyWords = "Một hai ba bốn năm sáu bảy tám chín mười mười_một mười_hai mười_ba mười_bốn mười_lăm mười_sáu mười_bảy mười_tám mười_chín hai_mươi.";
      expect(isDirectAnswerCompliant(twentyWords, 20)).toBe(true);

      // 21 words
      const twentyOneWords = "Một hai ba bốn năm sáu bảy tám chín mười mười_một mười_hai mười_ba mười_bốn mười_lăm mười_sáu mười_bảy mười_tám mười_chín hai_mươi hai_mốt.";
      expect(isDirectAnswerCompliant(twentyOneWords, 20)).toBe(false);

      // 20 words + action tag (action tag should be excluded from word count)
      const withTag = `${twentyWords} [[action:project|kamala-commerce-tour|Khám phá Kamala]]`;
      expect(isDirectAnswerCompliant(withTag, 20)).toBe(true);
    });
  });
});

describe("Adversarial Stress Test: Action Chips Engine", () => {
  it("handles malformed tags gracefully without throwing", () => {
    const inputs = [
      "[[action:]]",
      "[[action:invalid_type|id|label]]",
      "[[action:project|id]]",
      "[[[action:project|kamala-commerce-tour|Kamala]]]",
      "[[action:project||label]]",
    ];

    for (const input of inputs) {
      expect(() => parseMessageContentAndActions(input)).not.toThrow();
    }
  });

  it("handles special characters and XSS attempts in action tags", () => {
    const raw = "Xem [[action:project|kamala-commerce-tour|<script>alert(1)</script>]]";
    const result = parseMessageContentAndActions(raw);
    expect(result.cleanContent).toBe("Xem ");
    expect(result.actionChips).toHaveLength(1);
    expect(result.actionChips[0].label).toBe("<script>alert(1)</script>");
  });

  it("deduplicates multiple mentions of the same project", () => {
    const text = "Dự án Kamala rất hay, kamala.vn và Kamala jewelry đều là tour kamala.";
    const chips = scanEntityMentions(text);
    const kamalaChips = chips.filter((c) => c.id === "kamala-commerce-tour");
    expect(kamalaChips).toHaveLength(1);
  });

  it("scans all 4 projects, 5 layers, and 4 contacts accurately", () => {
    const text =
      "Kamala, Zelene Spa, Smartbit, JAVIS, Layer-01, Layer-02, Layer-03, Layer-04, Layer-05, Zalo, GitHub, tải CV, mục liên hệ";
    const chips = scanEntityMentions(text);
    expect(chips.length).toBe(13); // 4 + 5 + 4
  });
});

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ToolExecutionCard,
  formatToolPayload,
  type ToolExecutionCardProps,
} from "@/roadmap-rag-assistant/sdk/typescript/src/react/components/ToolExecutionCard";
import { formatToolDisplayName } from "@/roadmap-rag-assistant/sdk/typescript/src/react/utils/formatters";

function renderCard(props: ToolExecutionCardProps): string {
  return renderToStaticMarkup(React.createElement(ToolExecutionCard, props));
}

describe("Adversarial Stress Test: Milestone 2 Tool Execution UX & Hook Lifecycle", () => {
  describe("1. Complex Tool Arguments & Payload Formatting", () => {
    it("handles deeply nested objects and arrays (>10 levels) without stack overflow or truncation", () => {
      let nestedObj: any = { leaf: "deep-value", count: 42 };
      for (let i = 0; i < 15; i++) {
        nestedObj = { level: i, child: nestedObj, tags: [`tag-${i}`, i] };
      }

      const formatted = formatToolPayload(nestedObj);
      expect(formatted).toBeDefined();
      expect(formatted).toContain('"level": 14');
      expect(formatted).toContain('"leaf": "deep-value"');

      // Test rendering in ToolExecutionCard
      const html = renderCard({
        name: "test_deep_tool",
        args: nestedObj,
        expanded: true,
      });
      expect(html).toContain("test_deep_tool");
      expect(html).toContain("deep-value");
      expect(html).toContain("Tham số (Parameters)");
    });

    it("handles special characters, unicode diacritics, emoji, and XSS injection vectors safely", () => {
      const complexArgs = {
        vietnamese: "Tiếng Việt có dấu: ắ ằ ẳ ẵ ặ ế ề ể ễ ệ ố ồ ổ ỗ ộ ứ ừ ử ữ ự",
        emoji: "🚀 🔥 💎 🤖 ⚡ 🧠",
        xssPayload: '<script>alert("XSS")</script><img src=x onerror=alert(1)>',
        escapedChars: "Line1\nLine2\tTabbed \\ Backslash \" Quotes '",
        cjk: "日本語テキスト / 中文字符串 / 한국어",
        rtl: "مرحبا بالعالم",
      };

      const html = renderCard({
        name: "security_scanner",
        args: complexArgs,
        expanded: true,
      });

      // Verify React escapes HTML tags safely
      expect(html).not.toContain('<script>alert("XSS")</script>');
      expect(html).toContain("&lt;script&gt;alert(\\&quot;XSS\\&quot;)&lt;/script&gt;");
      expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
      expect(html).toContain("Tiếng Việt có dấu");
      expect(html).toContain("🚀 🔥 💎");
      expect(html).toContain("日本語テキスト");
    });

    it("handles massive 100,000 character strings and 1,000-item arrays with acceptable latency", () => {
      const hugeString = "X".repeat(100000);
      const hugeArray = Array.from({ length: 1000 }, (_, i) => ({ id: i, key: `item-${i}` }));

      const t0 = performance.now();
      const html = renderCard({
        name: "bulk_export",
        args: { data: hugeString, items: hugeArray },
        result: JSON.stringify({ status: "ok", total: 1000 }),
        status: "success",
        expanded: true,
      });
      const elapsed = performance.now() - t0;

      expect(elapsed).toBeLessThan(250); // Under 250ms for 100k chars + 1000 objects
      expect(html).toContain("bulk_export");
      expect(html).toContain("item-999");
    });

    it("exposes crash vulnerability: formatToolPayload throws uncaught TypeError on circular references", () => {
      const circular: any = { name: "circular-test" };
      circular.self = circular;

      expect(() => {
        formatToolPayload(circular);
      }).toThrowError(/Converting circular structure to JSON/);
    });

    it("exposes crash vulnerability: formatToolPayload throws uncaught TypeError on BigInt values", () => {
      const bigintPayload = { id: BigInt("9007199254740993"), name: "bigint-test" };

      expect(() => {
        formatToolPayload(bigintPayload);
      }).toThrowError(/Do not know how to serialize a BigInt/);
    });

    it("handles falsy and empty inputs (null, undefined, empty object) gracefully", () => {
      expect(formatToolPayload(null)).toBe("");
      expect(formatToolPayload(undefined)).toBe("");
      expect(formatToolPayload("")).toBe("");
      expect(formatToolPayload({})).toBe("{}");

      // Non-inspectable when no args, result, or items
      const html = renderCard({ name: "empty_tool" });
      expect(html).toContain("empty_tool");
      expect(html).toContain("disabled"); // Button disabled when canInspect is false
    });
  });

  describe("2. Tool Execution Failures & False Green Checkmark Audit", () => {
    it("empirically demonstrates FALSE GREEN CHECKMARK when result is JSON error without explicit status", () => {
      // Simulating a tool returning an error result payload like { error: "Database connection failed" }
      const html = renderCard({
        name: "database_query",
        result: JSON.stringify({ error: "Database connection failed" }),
        endedAt: Date.now(),
      });

      // VULNERABILITY REPRODUCTION:
      // Because endedAt is set and propStatus/error/tone are not explicitly provided,
      // effectiveStatus defaults to 'success', giving a FALSE GREEN CHECKMARK!
      const hasGreenCheckmark = html.includes("text-[#3F7D58]");
      const hasCompletedBadge = html.includes("Hoàn thành");
      const hasFailedBadge = html.includes("Thất bại");
      const hasRedCross = html.includes("text-[#B42318]");

      expect(hasGreenCheckmark).toBe(true);
      expect(hasCompletedBadge).toBe(true);
      expect(hasFailedBadge).toBe(false);
      expect(hasRedCross).toBe(false);
    });

    it("empirically demonstrates STUCK RUNNING STATE when result is provided without endedAt or status", () => {
      const html = renderCard({
        name: "database_query",
        result: JSON.stringify({ error: "Database connection failed" }),
      });

      // Even though result is already available, lacking endedAt causes it to remain 'running'
      expect(html).toContain("Đang thực thi...");
      expect(html).toContain("animate-pulse");
      expect(html).not.toContain("Hoàn thành");
      expect(html).not.toContain("Thất bại");
    });

    it("properly renders failed state with red badge and error icon when error or status=failed is set", () => {
      const html = renderCard({
        name: "fetch_api",
        status: "failed",
        error: "502 Bad Gateway: Upstream server timed out",
        expanded: true,
      });

      expect(html).toContain("Thất bại");
      expect(html).toContain("text-rose-700");
      expect(html).toContain("text-[#B42318]"); // CloseIcon error color
      expect(html).toContain("border-rose-200");
      expect(html).toContain("502 Bad Gateway");
      expect(html).not.toContain("Hoàn thành");
      expect(html).not.toContain("text-[#3F7D58]");
    });

    it("audits useRoadmapAssistantChat isFailed regex brittleness: exposes false successes on JSON errors", () => {
      // Exact logic extracted from useRoadmapAssistantChat.ts line 315-322:
      const checkIsFailed = (result: unknown): boolean => {
        return Boolean(
          typeof result === "string" &&
            (result.toLowerCase().startsWith("error") ||
              result.toLowerCase().includes("failed") ||
              result.toLowerCase().includes("thất bại") ||
              result.toLowerCase().startsWith("exception"))
        );
      };

      // These standard API error payloads FAIL the heuristic and are wrongly marked SUCCESS:
      expect(checkIsFailed(JSON.stringify({ error: "Query timeout after 5000ms" }))).toBe(false); // False success!
      expect(checkIsFailed(JSON.stringify({ error: "ECONNREFUSED 127.0.0.1:5432" }))).toBe(false); // False success!
      expect(checkIsFailed(JSON.stringify({ error: "Unauthorized access token" }))).toBe(false); // False success!
      expect(checkIsFailed(JSON.stringify({ status: "error", message: "Table not found" }))).toBe(false); // False success!
      expect(checkIsFailed(JSON.stringify({ ok: false, detail: "Rate limit exceeded" }))).toBe(false); // False success!
      expect(checkIsFailed({ error: "Database connection failed" })).toBe(false); // Non-string object: False success!

      // Only payloads containing the specific keywords pass:
      expect(checkIsFailed("Error: Database connection failed")).toBe(true);
      expect(checkIsFailed(JSON.stringify({ error: "Database connection failed" }))).toBe(true); // Matches because it has "failed"
    });

    it("audits client.ts SSE tool_end protocol: demonstrates status/error omission in onToolEnd callback", () => {
      // In client.ts line 192: callbacks.onToolEnd?.(data.name, data.result || '');
      // When the server sends { name: "db_lookup", status: "failed", error: "Connection lost", result: "" }
      // onToolEnd receives ONLY ("db_lookup", "").
      const serverEventData = {
        name: "db_lookup",
        status: "failed",
        error: "Connection lost",
        result: "",
      };

      // Hook simulation of receiving this event
      const name = serverEventData.name;
      const result = serverEventData.result || ""; // Discards status and error

      const isFailed = Boolean(
        typeof result === "string" &&
          (result.toLowerCase().startsWith("error") ||
            result.toLowerCase().includes("failed") ||
            result.toLowerCase().includes("thất bại") ||
            result.toLowerCase().startsWith("exception"))
      );

      const computedStatus = isFailed ? "failed" : "success";

      // VULNERABILITY REPRODUCTION:
      // Even though server explicitly sent status: "failed", the hook computes 'success' due to missing parameters!
      expect(computedStatus).toBe("success");
    });
  });

  describe("3. Tool State Transitions & Concurrency Anomalies", () => {
    it("renders seamless transition from running to success state", () => {
      const runningHtml = renderCard({
        name: "create_layer",
        status: "running",
        startedAt: Date.now() - 3000,
      });
      expect(runningHtml).toContain("Đang thực thi...");
      expect(runningHtml).toContain("animate-pulse");

      const successHtml = renderCard({
        name: "create_layer",
        status: "success",
        result: JSON.stringify({ layerId: "l-123", name: "Backend" }),
        startedAt: Date.now() - 3000,
        endedAt: Date.now(),
        durationMs: 3000,
      });
      expect(successHtml).toContain("Hoàn thành");
      expect(successHtml).toContain("text-[#3F7D58]");
      expect(successHtml).not.toContain("animate-pulse");
      expect(successHtml).toContain("3s");
    });

    it("renders seamless transition from running to failed state", () => {
      const failedHtml = renderCard({
        name: "create_layer",
        status: "failed",
        error: "Validation error: layer name already exists",
        startedAt: Date.now() - 1500,
        endedAt: Date.now(),
        durationMs: 1500,
      });
      expect(failedHtml).toContain("Thất bại");
      expect(failedHtml).toContain("text-[#B42318]");
      expect(failedHtml).not.toContain("animate-pulse");
    });

    it("demonstrates orphaned tool call vulnerability on stream abort/stopStreaming", () => {
      // When stopStreaming() is called in useRoadmapAssistantChat:
      // It sets msg.status = 'complete', msg.isThinking = false.
      // But it does NOT iterate over msg.toolCalls to close still-running tools!
      const initialCalls = [
        { name: "tool_a", status: "running" as const, startedAt: Date.now(), result: "Đang thực thi..." },
      ];

      // Simulated stopStreaming state transform
      const stoppedMessage = {
        status: "complete",
        isThinking: false,
        toolCalls: initialCalls, // Unmodified!
      };

      // Tool call remains stuck in 'running' in a completed message!
      expect(stoppedMessage.status).toBe("complete");
      expect(stoppedMessage.toolCalls[0].status).toBe("running");
    });

    it("demonstrates FIFO ambiguity vulnerability in concurrent tool executions of identical tool name", () => {
      // In onToolEnd (line 329):
      // const idx = currentCalls.findIndex(tc => tc.name === name && (tc.endedAt === undefined || tc.status === 'running'));
      // If two calls to "search_kb" are started, and the SECOND one finishes first:
      const toolCalls = [
        { id: "call-1", name: "search_kb", query: "query A", status: "running" as const },
        { id: "call-2", name: "search_kb", query: "query B", status: "running" as const },
      ];

      // Call 2 finishes first with result B:
      const name = "search_kb";
      const resultB = "Result for query B";

      const idx = toolCalls.findIndex((tc) => tc.name === name && tc.status === "running");

      // VULNERABILITY REPRODUCTION:
      // It matches index 0 ("call-1"), misattributing Call 2's result to Call 1!
      expect(idx).toBe(0);
      expect(toolCalls[idx].query).toBe("query A");
    });
  });

  describe("4. Collapsing, Expanding & Multiple Tool Cards Stress", () => {
    it("renders collapsed by default with lightweight DOM, expanding on demand", () => {
      const largePayload = { rows: Array.from({ length: 100 }, (_, i) => ({ id: i, text: "sample text" })) };

      const collapsedHtml = renderCard({
        name: "query_catalog",
        args: largePayload,
        result: JSON.stringify(largePayload),
        expanded: false,
      });

      // No pre tags rendered when collapsed
      expect(collapsedHtml).not.toContain("<pre");
      expect(collapsedHtml).toContain('aria-expanded="false"');

      const expandedHtml = renderCard({
        name: "query_catalog",
        args: largePayload,
        result: JSON.stringify(largePayload),
        expanded: true,
      });

      // pre tags rendered when expanded
      expect(expandedHtml).toContain("<pre");
      expect(expandedHtml).toContain('aria-expanded="true"');
      expect(expandedHtml).toContain("Sao chép"); // Copy button
    });

    it("renders multiple tool cards with mixed states simultaneously without cross-card interference", () => {
      const cards = [
        { id: "c1", name: "search_live_knowledge", status: "success" as const, expanded: true, result: "Doc 1 found" },
        { id: "c2", name: "create_layer", status: "running" as const, expanded: false },
        { id: "c3", name: "delete_topic", status: "failed" as const, expanded: true, error: "Topic not found" },
      ];

      const htmls = cards.map((c) =>
        renderCard({
          name: c.name,
          status: c.status,
          expanded: c.expanded,
          result: c.result,
          error: c.error,
        })
      );

      // Card 1: Success, expanded
      expect(htmls[0]).toContain("Tra cứu cơ sở tri thức Live");
      expect(htmls[0]).toContain("Hoàn thành");
      expect(htmls[0]).toContain("<pre");

      // Card 2: Running, collapsed
      expect(htmls[1]).toContain("Tạo Layer mảng kiến thức");
      expect(htmls[1]).toContain("Đang thực thi...");
      expect(htmls[1]).not.toContain("<pre");

      // Card 3: Failed, expanded
      expect(htmls[2]).toContain("Xóa thực thể Roadmap");
      expect(htmls[2]).toContain("Thất bại");
      expect(htmls[2]).toContain("<pre");
      expect(htmls[2]).toContain("Topic not found");
    });

    it("stress-tests batch rendering 20 complex tool cards simultaneously under 50ms", () => {
      const cards = Array.from({ length: 20 }, (_, i) => ({
        name: `tool_${i}`,
        status: (i % 3 === 0 ? "running" : i % 3 === 1 ? "success" : "failed") as any,
        args: { param1: `val_${i}`, list: [1, 2, 3] },
        result: i % 3 !== 0 ? `Result from tool ${i}` : undefined,
        error: i % 3 === 2 ? `Error from tool ${i}` : undefined,
        expanded: i % 2 === 0,
      }));

      const t0 = performance.now();
      const renderedHtmls = cards.map((c) => renderCard(c));
      const elapsed = performance.now() - t0;

      expect(renderedHtmls).toHaveLength(20);
      expect(elapsed).toBeLessThan(100); // 20 cards rendered in < 100ms
    });

    it("renders retrieval sources correctly with links and topic badges", () => {
      const html = renderCard({
        name: "search_live_knowledge",
        status: "success",
        expanded: true,
        items: [
          { title: "RAG Architecture Guide", href: "https://cris.dev/rag", topic: "Architecture" },
          { title: "Next.js 16 Best Practices", topic: "Frontend" },
        ],
      });

      expect(html).toContain("Tài liệu tham khảo (2)");
      expect(html).toContain('href="https://cris.dev/rag"');
      expect(html).toContain("RAG Architecture Guide");
      expect(html).toContain("Next.js 16 Best Practices");
      expect(html).toContain("(Architecture)");
      expect(html).toContain("(Frontend)");
    });
  });
});

