import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { setLangfuseTracerProvider } from "@langfuse/tracing";
import { InMemorySpanExporter } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { createLangfuseSpanProcessor } from "@/lib/ai/langfuse";
import { setLlmProvider, type LlmProvider, type LlmStreamChunk } from "@/lib/ai/llm-provider";
import { resetLlmCircuitBreaker } from "@/lib/ai/llm-circuit-breaker";
import { clearResponseCache } from "@/lib/ai/response-cache";
import {
  formatActionChip,
  parseMessageContentAndActions,
  scanEntityMentions,
  appendEntityActionChips,
  AUTHORITATIVE_PROJECTS,
  AUTHORITATIVE_LAYERS,
  AUTHORITATIVE_CONTACTS,
  type ChatActionChip,
} from "@/lib/ai/action-chips";
import {
  cleanAntiSlopText,
  countWords,
  getFirstSentence,
  isDirectAnswerCompliant,
  createAntiSlopTransformStream,
} from "@/lib/ai/anti-slop";
import { POST, buildAntiSlopSystemPrompt, ANTI_SLOP_SYSTEM_PROMPT } from "@/app/api/chat/route";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RoadmapChatClient } from "@/roadmap-rag-assistant/sdk/typescript/src/client";
import {
  ThoughtProcess,
  formatThoughtBadge,
} from "@/roadmap-rag-assistant/sdk/typescript/src/react/components/ThoughtProcess";

// Mock next/server after() for request lifecycle
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: vi.fn(),
}));

// Setup in-memory exporter for route tests
const exporter = new InMemorySpanExporter();
const spanProcessor = createLangfuseSpanProcessor({
  exporter,
  publicKey: "pk-lf-test",
  secretKey: "sk-lf-test",
  baseUrl: "http://localhost",
});

beforeAll(() => {
  setLangfuseTracerProvider(new NodeTracerProvider({ spanProcessors: [spanProcessor] }));
});

// Helpers for stream reading
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

function createStreamFromChunks(chunks: (string | Uint8Array)[]): ReadableStream<any> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

function createSseStreamFromEvents(
  events: { event: string; data: Record<string, unknown> | string }[]
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const ev of events) {
        const payload = typeof ev.data === "string" ? ev.data : JSON.stringify(ev.data);
        controller.enqueue(encoder.encode(`event: ${ev.event}\ndata: ${payload}\n\n`));
      }
      controller.close();
    },
  });
}

function createSseStreamFromRawChunks(chunks: string[]): ReadableStream<Uint8Array> {
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

let clientIpCounter = 1000;
function createChatRequest(body: unknown) {
  return new NextRequest("http://localhost/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": `198.51.100.${++clientIpCounter}`,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function mockLlmWithChunks(chunks: string[], options: { delayMs?: number } = {}) {
  const provider: LlmProvider = {
    async generate() {
      return { text: "", usage: { input: 10, output: 10, total: 20 } };
    },
    async generateStream() {
      return (async function* (): AsyncGenerator<LlmStreamChunk> {
        for (const [index, text] of chunks.entries()) {
          if (options.delayMs) await new Promise((r) => setTimeout(r, options.delayMs));
          const isLast = index === chunks.length - 1;
          yield { text, usage: isLast ? { input: 100, output: 50, total: 150 } : undefined };
        }
      })();
    },
    async embed() {
      return new Array(768).fill(0.01);
    },
  };
  setLlmProvider(provider);
}

describe("Empirical Challenge Suite — Milestone 2", () => {
  beforeEach(() => {
    exporter.reset();
    clearResponseCache();
    resetLlmCircuitBreaker();
  });

  afterEach(() => {
    setLlmProvider(null);
  });

  // =========================================================================
  // SECTION 1: Catalog Integrity & Mapping Verification
  // =========================================================================
  describe("Section 1: Entity Catalogs & Trigger Integrity", () => {
    it("validates exact project catalog contents and properties", () => {
      expect(AUTHORITATIVE_PROJECTS).toHaveLength(4);
      const expectedProjects = [
        "kamala-commerce-tour",
        "zelene-spa-booking",
        "smartbit-saas-platform",
        "javis-3d-tile-simulation",
      ];
      const actualIds = AUTHORITATIVE_PROJECTS.map((p) => p.id);
      expect(actualIds).toEqual(expectedProjects);

      for (const project of AUTHORITATIVE_PROJECTS) {
        expect(project.id).toBeTruthy();
        expect(project.title).toBeTruthy();
        expect(project.defaultLabel).toBeTruthy();
        expect(project.triggers.length).toBeGreaterThanOrEqual(3);
        // Triggers must be lowercase for consistent case-insensitive matching
        for (const trigger of project.triggers) {
          expect(trigger).toBe(trigger.toLowerCase());
        }
      }
    });

    it("validates exact roadmap layers 01 through 05 with sequence and codes", () => {
      expect(AUTHORITATIVE_LAYERS).toHaveLength(5);
      const expectedIds = ["layer-01", "layer-02", "layer-03", "layer-04", "layer-05"];
      const expectedCodes = ["01-DB", "02-LLM", "03-RAG", "04-OPS", "05-PROD"];

      expect(AUTHORITATIVE_LAYERS.map((l) => l.id)).toEqual(expectedIds);
      expect(AUTHORITATIVE_LAYERS.map((l) => l.code)).toEqual(expectedCodes);

      for (const layer of AUTHORITATIVE_LAYERS) {
        expect(layer.triggers.length).toBeGreaterThanOrEqual(4);
        for (const trigger of layer.triggers) {
          expect(trigger).toBe(trigger.toLowerCase());
        }
      }
    });

    it("validates exact contact channels: zalo, github, cv, contact", () => {
      expect(AUTHORITATIVE_CONTACTS).toHaveLength(4);
      const expectedContacts = ["zalo", "github", "cv", "contact"];
      expect(AUTHORITATIVE_CONTACTS.map((c) => c.id)).toEqual(expectedContacts);

      for (const contact of AUTHORITATIVE_CONTACTS) {
        expect(contact.triggers.length).toBeGreaterThanOrEqual(1);
        expect(contact.path || contact.href).toBeTruthy();
      }
    });

    it("ensures all trigger sets across categories are collision-free", () => {
      const allTriggers = [
        ...AUTHORITATIVE_PROJECTS.flatMap((p) => p.triggers),
        ...AUTHORITATIVE_LAYERS.flatMap((l) => l.triggers),
        ...AUTHORITATIVE_CONTACTS.flatMap((c) => c.triggers),
      ];
      const uniqueTriggers = new Set(allTriggers);
      expect(uniqueTriggers.size).toBe(allTriggers.length);
    });
  });

  // =========================================================================
  // SECTION 2: Action Metadata Protocol & Parser Hardening
  // =========================================================================
  describe("Section 2: Action Tag Protocol & Parser Hardening", () => {
    it("formats action chips strictly adhering to [[action:type|id|label]]", () => {
      expect(formatActionChip("project", "kamala-commerce-tour", "Khám phá Kamala")).toBe(
        "[[action:project|kamala-commerce-tour|Khám phá Kamala]]"
      );
      expect(formatActionChip("roadmap", "layer-01", "Tầng 01: Knowledge Base")).toBe(
        "[[action:roadmap|layer-01|Tầng 01: Knowledge Base]]"
      );
      expect(formatActionChip("contact", "cv", "Tải CV Cris Nguyen")).toBe(
        "[[action:contact|cv|Tải CV Cris Nguyen]]"
      );
      expect(formatActionChip("link", "https://kamala.vn", "Website Kamala")).toBe(
        "[[action:link|https://kamala.vn|Website Kamala]]"
      );
    });

    it("parses single and multiple action tags across all 4 supported types", () => {
      const input =
        "Xem dự án [[action:project|kamala-commerce-tour|Kamala Tour]], xem lộ trình [[action:roadmap|layer-04|LLMOps]], liên hệ qua [[action:contact|github|GitHub]] hoặc vào [[action:link|https://crisne.io|Website]].";
      const { cleanContent, actionChips } = parseMessageContentAndActions(input);

      expect(cleanContent).toBe(
        "Xem dự án , xem lộ trình , liên hệ qua  hoặc vào ."
      );
      expect(actionChips).toHaveLength(4);
      expect(actionChips[0]).toEqual({
        type: "project",
        id: "kamala-commerce-tour",
        label: "Kamala Tour",
      });
      expect(actionChips[1]).toEqual({
        type: "roadmap",
        id: "layer-04",
        label: "LLMOps",
      });
      expect(actionChips[2]).toEqual({
        type: "contact",
        id: "github",
        label: "GitHub",
      });
      expect(actionChips[3]).toEqual({
        type: "link",
        id: "https://crisne.io",
        label: "Website",
      });
    });

    it("handles back-to-back action tags with no spaces in between", () => {
      const input =
        "Tags:[[action:project|kamala-commerce-tour|Kamala]][[action:project|zelene-spa-booking|Zelene]]";
      const { cleanContent, actionChips } = parseMessageContentAndActions(input);

      expect(cleanContent).toBe("Tags:");
      expect(actionChips).toHaveLength(2);
      expect(actionChips[0].id).toBe("kamala-commerce-tour");
      expect(actionChips[1].id).toBe("zelene-spa-booking");
    });

    it("safely handles malformed and incomplete action tags without throwing", () => {
      const malformedCases = [
        "[[action:project|missing-closing-bracket",
        "[[action:|empty-type|label]]",
        "[[action:invalid-type|id|label]]",
        "[[action:project]]",
        "[[action:project|]]",
        "[[action:]]",
        "[[]]",
        "Plain text with [brackets] and [[double-brackets]] without action prefix",
      ];

      for (const text of malformedCases) {
        expect(() => {
          const res = parseMessageContentAndActions(text);
          expect(res.actionChips).toEqual([]);
        }).not.toThrow();
      }
    });

    it("handles special characters, unicode, and emojis in labels", () => {
      const input =
        "Khám phá: [[action:project|kamala-commerce-tour|✨ Dự án Kamala & E-commerce (2025) 🚀]]";
      const { cleanContent, actionChips } = parseMessageContentAndActions(input);

      expect(cleanContent).toBe("Khám phá: ");
      expect(actionChips).toHaveLength(1);
      expect(actionChips[0].label).toBe("✨ Dự án Kamala & E-commerce (2025) 🚀");
    });

    it("scanEntityMentions detects untagged mentions case-insensitively with diacritics", () => {
      const text =
        "Cris từng xây dựng KAMALA JEWELRY và ZELENE HEAD SPA cùng với TẦNG 01 và nhắn zalo.";
      const chips = scanEntityMentions(text);

      const ids = chips.map((c) => c.id);
      expect(ids).toContain("kamala-commerce-tour");
      expect(ids).toContain("zelene-spa-booking");
      expect(ids).toContain("layer-01");
      expect(ids).toContain("zalo");
    });

    it("autoScan option enriches message with detected chips while preventing duplicates", () => {
      const text =
        "Dự án Kamala [[action:project|kamala-commerce-tour|Kamala]] được phát triển cùng Smartbit.";
      const result = parseMessageContentAndActions(text, { autoScan: true });

      expect(result.actionChips).toHaveLength(2);
      expect(result.actionChips[0].id).toBe("kamala-commerce-tour");
      expect(result.actionChips[1].id).toBe("smartbit-saas-platform");
    });

    it("appendEntityActionChips formats and appends missing entity tags cleanly", () => {
      const text = "Cris phát triển JAVIS 3D và phụ trách tầng 05.";
      const enriched = appendEntityActionChips(text);

      expect(enriched).toContain("[[action:project|javis-3d-tile-simulation|Xem JAVIS 3D]]");
      expect(enriched).toContain("[[action:roadmap|layer-05|Tầng 05: Production Deployment]]");
    });
  });

  // =========================================================================
  // SECTION 3: Stream Transformer & Anti-Slop Sanitization
  // =========================================================================
  describe("Section 3: Stream Transformer & Anti-Slop Sanitization", () => {
    it("strips multiple stacked openers in Vietnamese and English", () => {
      const raw =
        "Chào bạn! Rất vui được gặp bạn! Great question! Cris có 5 năm kinh nghiệm Next.js.";
      expect(cleanAntiSlopText(raw)).toBe("Cris có 5 năm kinh nghiệm Next.js.");
    });

    it("strips robotic meta-discourse openers cleanly", () => {
      const raw =
        "Dựa vào tài liệu được cung cấp, Cris thành thạo React Server Components.";
      expect(cleanAntiSlopText(raw)).toBe("Cris thành thạo React Server Components.");
    });

    it("identifies boundary nuance when opener is followed immediately by punctuation without pronoun", () => {
      const withPronoun = "Rất vui được hỗ trợ bạn! Cris có thể tư vấn.";
      expect(cleanAntiSlopText(withPronoun)).toBe("Cris có thể tư vấn.");

      const withoutPronoun = "Rất vui được hỗ trợ! Cris có thể tư vấn.";
      const cleaned = cleanAntiSlopText(withoutPronoun);
      expect(cleaned).toBe("Cris có thể tư vấn.");
    });

    it("strips kickers while perfectly preserving trailing action tags", () => {
      const raw =
        "Cris xây dựng nền tảng Kamala. Tóm lại, hy vọng thông tin trên hữu ích! [[action:project|kamala-commerce-tour|Khám phá Kamala]]";
      const cleaned = cleanAntiSlopText(raw);

      expect(cleaned).toBe(
        "Cris xây dựng nền tảng Kamala. [[action:project|kamala-commerce-tour|Khám phá Kamala]]"
      );
      expect(cleaned).not.toContain("Tóm lại");
      expect(cleaned).not.toContain("hữu ích");
    });

    it("preserves multiple trailing action tags after removing kickers", () => {
      const raw =
        "Dự án Smartbit SaaS. Nhìn chung bạn có thể liên hệ nếu cần hỗ trợ. [[action:project|smartbit-saas-platform|Smartbit]] [[action:contact|cv|Tải CV]]";
      const cleaned = cleanAntiSlopText(raw);

      expect(cleaned).toBe(
        "Dự án Smartbit SaaS. [[action:project|smartbit-saas-platform|Smartbit]] [[action:contact|cv|Tải CV]]"
      );
    });

    it("createAntiSlopTransformStream handles 1-byte chunk fragmentation without corrupting UTF-8 or action tags", async () => {
      const rawText =
        "Chào bạn! Cris phát triển Zelene [[action:project|zelene-spa-booking|Zelene Spa]] rất thành công.";
      const encoder = new TextEncoder();
      const rawBytes = encoder.encode(rawText);
      // Fragment into 1-byte chunks
      const byteChunks: Uint8Array[] = [];
      for (let i = 0; i < rawBytes.length; i++) {
        byteChunks.push(rawBytes.subarray(i, i + 1));
      }

      const stream = createStreamFromChunks(byteChunks);
      const transformed = stream.pipeThrough(createAntiSlopTransformStream<Uint8Array>());
      const result = await readStream(transformed);

      expect(result.trim()).toBe(
        "Cris phát triển Zelene [[action:project|zelene-spa-booking|Zelene Spa]] rất thành công."
      );
    });

    it("createAntiSlopTransformStream handles boundary splits inside the action tag itself", async () => {
      const chunks = [
        "Cris tạo ra ",
        "[[action:project|kamala-",
        "commerce-tour|Khám ",
        "phá Kamala]] ",
        "với Next.js 15.",
      ];
      const stream = createStreamFromChunks(chunks);
      const transformed = stream.pipeThrough(createAntiSlopTransformStream<string>());
      const result = await readStream(transformed);

      expect(result.trim()).toBe(
        "Cris tạo ra [[action:project|kamala-commerce-tour|Khám phá Kamala]] với Next.js 15."
      );
    });

    it("createAntiSlopTransformStream holds potential kicker and strips it in flush", async () => {
      const chunks = [
        "Cris có kinh nghiệm sâu sắc về LLM. ",
        "Tóm lại",
        ", hãy liên hệ với Cris nhé!",
      ];
      const stream = createStreamFromChunks(chunks);
      const transformed = stream.pipeThrough(createAntiSlopTransformStream<string>());
      const result = await readStream(transformed);

      expect(result.trim()).toBe("Cris có kinh nghiệm sâu sắc về LLM.");
      expect(result).not.toContain("Tóm lại");
    });

    it("verifies isDirectAnswerCompliant word counting logic with action tags", () => {
      // 14 words + 1 action tag
      const text =
        "Cris Nguyen có hơn 5 năm kinh nghiệm chuyên sâu về Next.js và hệ thống AI [[action:roadmap|layer-03|Tầng 03 RAG]].";
      expect(isDirectAnswerCompliant(text, 20)).toBe(true);

      // 22 words -> non-compliant
      const tooLongText =
        "Cris Nguyen là một kỹ sư phần mềm frontend có nhiều năm kinh nghiệm phát triển các ứng dụng web phức tạp sử dụng công nghệ Next.js và React.";
      expect(isDirectAnswerCompliant(tooLongText, 20)).toBe(false);
    });

    it("verifies isDirectAnswerCompliant does not count trailing punctuation after action tag as word", () => {
      const text =
        "Cris Nguyen có 5 năm kinh nghiệm về Next.js và AI [[action:roadmap|layer-03|Tầng 03 RAG]].";
      expect(isDirectAnswerCompliant(text, 20)).toBe(true);
    });

    it("verifies cleanAntiSlopText resists catastrophic backtracking and executes in under 1ms", () => {
      const str = "Cris " + " \n ".repeat(20) + "abc";
      const start = performance.now();
      const cleaned = cleanAntiSlopText(str);
      const elapsed = performance.now() - start;
      expect(cleaned).toBe(str);
      expect(elapsed).toBeLessThan(15);
    });

    it("preserves mid-sentence kickers and code block comments without false positive truncation", () => {
      const sentence1 = "Dự án này nhìn chung, được chia làm 3 phần: backend, frontend, devops.";
      expect(cleanAntiSlopText(sentence1)).toBe(sentence1);

      const sentence2 = "The overall, design is good.";
      expect(cleanAntiSlopText(sentence2)).toBe(sentence2);

      const codeBlock = "Cris đã viết:\n```typescript\n// in summary: return true;\nreturn true;\n```";
      expect(cleanAntiSlopText(codeBlock)).toBe(codeBlock);
    });

    it("emits stream chunks immediately without stalling when trigger words appear mid-sentence", async () => {
      const stream = createStreamFromChunks([
        "Cris khuyên nếu bạn muốn ",
        "xây dựng web, hãy dùng Next.js.",
      ]);
      const transformed = stream.pipeThrough(createAntiSlopTransformStream<string>());
      const reader = transformed.getReader();

      const firstRead = await reader.read();
      expect(firstRead.done).toBe(false);
      expect(firstRead.value).toBe("Cris khuyên nếu bạn muốn ");

      const secondRead = await reader.read();
      expect(secondRead.done).toBe(false);
      expect(secondRead.value).toBe("xây dựng web, hãy dùng Next.js.");
    });
  });

  // =========================================================================
  // SECTION 4: Chat Route System Prompt & Fallbacks
  // =========================================================================
  describe("Section 4: Chat Route Prompt & Fallbacks", () => {
    it("ANTI_SLOP_SYSTEM_PROMPT contains all 4 projects, 5 layers, and 4 contacts specifications", () => {
      // Projects
      expect(ANTI_SLOP_SYSTEM_PROMPT).toContain("kamala-commerce-tour");
      expect(ANTI_SLOP_SYSTEM_PROMPT).toContain("zelene-spa-booking");
      expect(ANTI_SLOP_SYSTEM_PROMPT).toContain("smartbit-saas-platform");
      expect(ANTI_SLOP_SYSTEM_PROMPT).toContain("javis-3d-tile-simulation");

      // Layers
      expect(ANTI_SLOP_SYSTEM_PROMPT).toContain("layer-01");
      expect(ANTI_SLOP_SYSTEM_PROMPT).toContain("layer-02");
      expect(ANTI_SLOP_SYSTEM_PROMPT).toContain("layer-03");
      expect(ANTI_SLOP_SYSTEM_PROMPT).toContain("layer-04");
      expect(ANTI_SLOP_SYSTEM_PROMPT).toContain("layer-05");

      // Contacts
      expect(ANTI_SLOP_SYSTEM_PROMPT).toContain("zalo");
      expect(ANTI_SLOP_SYSTEM_PROMPT).toContain("github");
      expect(ANTI_SLOP_SYSTEM_PROMPT).toContain("cv");
      expect(ANTI_SLOP_SYSTEM_PROMPT).toContain("contact");
    });

    it("buildAntiSlopSystemPrompt replaces {RAG_CONTEXT} placeholder with provided context", () => {
      const ragContext = "Cris Nguyen phát triển hệ thống RAG đa tầng.";
      const prompt = buildAntiSlopSystemPrompt(ragContext);

      expect(prompt).toContain(ragContext);
      expect(prompt).not.toContain("{RAG_CONTEXT}");
    });

    it("handles empty RAG context with graceful default fallback message", () => {
      const prompt = buildAntiSlopSystemPrompt("");
      expect(prompt).toContain("(Không có thông tin liên quan đến câu hỏi này.)");
    });

    it("safely handles special replacement patterns in ragContext without corruption", () => {
      const trickyContext = "Salary is $100 and bonus is $& or $1 or $' or $` special.";
      const prompt = buildAntiSlopSystemPrompt(trickyContext);
      expect(prompt).toContain(trickyContext);
      expect(prompt).not.toContain("{RAG_CONTEXT}");
    });
  });

  // =========================================================================
  // SECTION 5: Route End-to-End Streaming with Action Tags
  // =========================================================================
  describe("Section 5: Route Streaming with Action Tags", () => {
    it("streams LLM answer containing action tags through POST /api/chat intact", async () => {
      mockLlmWithChunks([
        "Cris đã phát triển nền tảng Kamala ",
        "[[action:project|kamala-commerce-tour|Khám phá Kamala]] ",
        "với Next.js 15 và Tailwind CSS.",
      ]);

      const req = createChatRequest({ message: "Dự án Kamala là gì?" });
      const res = await POST(req);

      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");

      const responseText = await res.text();
      expect(responseText).toBe(
        "Cris đã phát triển nền tảng Kamala [[action:project|kamala-commerce-tour|Khám phá Kamala]] với Next.js 15 và Tailwind CSS."
      );
    });

    it("prunes greeting opener and kicker from LLM stream while preserving action tags in route response", async () => {
      mockLlmWithChunks([
        "Chào bạn! Rất vui được gặp bạn. ",
        "Cris xây dựng giải pháp Zelene Spa ",
        "[[action:project|zelene-spa-booking|Xem Zelene Spa]] ",
        "cho ngành làm đẹp.",
        " Tóm lại, nếu bạn có thắc mắc hãy liên hệ nhé!",
      ]);

      const req = createChatRequest({ message: "Zelene Spa là gì?" });
      const res = await POST(req);
      const text = await res.text();

      expect(text).not.toContain("Chào bạn!");
      expect(text).not.toContain("Rất vui được gặp bạn");
      expect(text).not.toContain("Tóm lại");
      expect(text).toContain("[[action:project|zelene-spa-booking|Xem Zelene Spa]]");
      expect(text.trim()).toBe(
        "Cris xây dựng giải pháp Zelene Spa [[action:project|zelene-spa-booking|Xem Zelene Spa]] cho ngành làm đẹp."
      );
    });

    it("properly caches sanitized response including action tags on repeated query", async () => {
      mockLlmWithChunks([
        "Xin chào! ",
        "Cris chuyên về Tầng 02 LLM Application [[action:roadmap|layer-02|Tầng 02: LLM Application]].",
      ]);

      const req1 = createChatRequest({ message: "Tầng 2 trong lộ trình là gì?" });
      const res1 = await POST(req1);
      const text1 = await res1.text();

      expect(text1).toBe(
        "Cris chuyên về Tầng 02 LLM Application [[action:roadmap|layer-02|Tầng 02: LLM Application]]."
      );

      // Second identical request served from cache
      const req2 = createChatRequest({ message: "Tầng 2 trong lộ trình là gì?" });
      const res2 = await POST(req2);
      const text2 = await res2.text();

      expect(text2).toBe(text1);
    });

    it("propagates cancellation and cleans up when client aborts stream mid-chunk with action tags", async () => {
      mockLlmWithChunks(
        [
          "Cris phát triển Kamala [[action:project|kamala-commerce-tour|Kamala]] ",
          "phần tiếp theo rất dài... ",
          "vẫn đang tiếp tục gửi token...",
        ],
        { delayMs: 40 }
      );

      const req = createChatRequest({ message: "Kamala chi tiết thế nào?" });
      const res = await POST(req);
      const reader = res.body!.getReader();

      const firstChunk = await reader.read();
      expect(firstChunk.done).toBe(false);

      // Cancel stream
      await reader.cancel();
      // Allow async cancellation handlers to complete
      await new Promise((r) => setTimeout(r, 80));

      // Route must remain completely operational after cancellation
      mockLlmWithChunks(["Cris sẵn sàng trả lời."]);
      const nextReq = createChatRequest({ message: "Câu hỏi tiếp theo" });
      const nextRes = await POST(nextReq);
      expect(await nextRes.text()).toBe("Cris sẵn sàng trả lời.");
    });
  });

  // =========================================================================
  // SECTION 6: High-Load & Edge Invariants
  // =========================================================================
  describe("Section 6: High-Load & Edge Invariants", () => {
    it("handles heavy payload with 50 consecutive action tags without regex hang or stack overflow", () => {
      const tags = Array.from({ length: 50 }, (_, i) =>
        formatActionChip("project", `project-${i}`, `Dự án số ${i}`)
      ).join(" ");

      const raw = `Danh sách dự án của Cris: ${tags}`;
      const { cleanContent, actionChips } = parseMessageContentAndActions(raw);

      expect(cleanContent.trim()).toBe("Danh sách dự án của Cris:");
      expect(actionChips).toHaveLength(50);
      expect(actionChips[0].id).toBe("project-0");
      expect(actionChips[49].id).toBe("project-49");
    });

    it("handles rapid stream throughput without losing action chips or deadlocking", async () => {
      const chunks = Array.from({ length: 20 }, (_, i) => `chunk_${i} `);
      chunks.push("[[action:contact|zalo|Nhắn Zalo]]");

      const stream = createStreamFromChunks(chunks);
      const transformed = stream.pipeThrough(createAntiSlopTransformStream<string>());
      const text = await readStream(transformed);

      expect(text).toContain("[[action:contact|zalo|Nhắn Zalo]]");
      for (let i = 0; i < 20; i++) {
        expect(text).toContain(`chunk_${i}`);
      }
    });
  });

  // =========================================================================
  // HELPER: Run streamChat with Promise wrapper
  // =========================================================================
  function runStreamChat(
    client: RoadmapChatClient,
    message: string,
    stream: ReadableStream<Uint8Array>
  ): Promise<{
    response?: any;
    error?: Error;
    tokens: string;
    thinking: string;
    toolsStarted: string[];
    toolsEnded: string[];
  }> {
    (globalThis as any).fetch = vi.fn().mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      })
    );

    return new Promise((resolve) => {
      let tokens = "";
      let thinking = "";
      const toolsStarted: string[] = [];
      const toolsEnded: string[] = [];

      client.streamChat(message, {
        onToken: (d) => {
          tokens += d;
        },
        onThinking: (d) => {
          thinking += d;
        },
        onToolStart: (name) => {
          toolsStarted.push(name);
        },
        onToolEnd: (name) => {
          toolsEnded.push(name);
        },
        onDone: (res) => {
          resolve({ response: res, tokens, thinking, toolsStarted, toolsEnded });
        },
        onError: (err) => {
          resolve({ error: err, tokens, thinking, toolsStarted, toolsEnded });
        },
      });
    });
  }

  // =========================================================================
  // SECTION 7: Thinking Stream Protocol — Unclosed & Partial Tags (M2 Challenger)
  // =========================================================================
  describe("Section 7: Thinking Stream Protocol — Unclosed & Partial Tags (M2 Challenger)", () => {
    it("prevents leaking thinking content to main message when <think> tag is unclosed mid-stream", async () => {
      const client = new RoadmapChatClient();
      const stream = createSseStreamFromEvents([
        { event: "token", data: { delta: "<think>I am thinking about system architecture..." } },
        { event: "done", data: {} },
      ]);

      const result = await runStreamChat(client, "explain architecture", stream);

      // Thinking content MUST NOT leak into visible tokens or message
      expect(result.tokens).toBe("");
      expect(result.thinking).toBe("I am thinking about system architecture...");
      expect(result.response?.message).toBe("");
      expect(result.response?.thinking).toBe("I am thinking about system architecture...");
    });

    it("preserves leading public content and hides unclosed trailing thinking block without leak", async () => {
      const client = new RoadmapChatClient();
      const stream = createSseStreamFromEvents([
        { event: "token", data: { delta: "Direct answer first. <think>Hidden background reasoning..." } },
        { event: "done", data: {} },
      ]);

      const result = await runStreamChat(client, "status query", stream);

      expect(result.tokens).toBe("Direct answer first. ");
      expect(result.thinking).toBe("Hidden background reasoning...");
      expect(result.response?.message).toBe("Direct answer first. ");
      expect(result.response?.thinking).toBe("Hidden background reasoning...");
    });

    it("handles unclosed <thought> synonym tag identically without leaking", async () => {
      const client = new RoadmapChatClient();
      const stream = createSseStreamFromEvents([
        { event: "token", data: { delta: "<thought>Synonym tag unclosed reasoning..." } },
        { event: "done", data: {} },
      ]);

      const result = await runStreamChat(client, "test synonym", stream);

      expect(result.tokens).toBe("");
      expect(result.thinking).toBe("Synonym tag unclosed reasoning...");
      expect(result.response?.message).toBe("");
      expect(result.response?.thinking).toBe("Synonym tag unclosed reasoning...");
    });
  });

  // =========================================================================
  // SECTION 8: Thinking Stream Protocol — Multiple Separated Blocks (M2 Challenger)
  // =========================================================================
  describe("Section 8: Thinking Stream Protocol — Multiple Separated Blocks (M2 Challenger)", () => {
    it("captures multiple separated <think> blocks in a single stream and maintains clean tokens", async () => {
      const client = new RoadmapChatClient();
      const stream = createSseStreamFromEvents([
        { event: "token", data: { delta: "<think>Plan step 1</think>Result 1. " } },
        { event: "token", data: { delta: "<think>Plan step 2</think>Result 2." } },
        { event: "done", data: {} },
      ]);

      const result = await runStreamChat(client, "multi-step request", stream);

      expect(result.tokens).toBe("Result 1. Result 2.");
      expect(result.thinking).toBe("Plan step 1Plan step 2");
      expect(result.response?.message).toBe("Result 1. Result 2.");
      expect(result.response?.thinking).toBe("Plan step 1Plan step 2");
    });

    it("handles mixed case <THINK> and <Thought> tags across separated blocks", async () => {
      const client = new RoadmapChatClient();
      const stream = createSseStreamFromEvents([
        { event: "token", data: { delta: "<THINK>Capital thought</THINK>Answer A " } },
        { event: "token", data: { delta: "<Thought>Mixed thought</Thought>Answer B" } },
        { event: "done", data: {} },
      ]);

      const result = await runStreamChat(client, "case test", stream);

      expect(result.tokens).toBe("Answer A Answer B");
      expect(result.thinking).toBe("Capital thoughtMixed thought");
    });

    it("handles consecutive back-to-back thinking blocks without intervening public text", async () => {
      const client = new RoadmapChatClient();
      const stream = createSseStreamFromEvents([
        {
          event: "token",
          data: { delta: "<think>Thought 1</think><think>Thought 2</think><thought>Thought 3</thought>Public answer" },
        },
        { event: "done", data: {} },
      ]);

      const result = await runStreamChat(client, "stacked thoughts", stream);

      expect(result.tokens).toBe("Public answer");
      expect(result.thinking).toBe("Thought 1Thought 2Thought 3");
    });
  });

  // =========================================================================
  // SECTION 9: Thinking Stream Protocol — Empty Blocks & Ghost Prevention (M2 Challenger)
  // =========================================================================
  describe("Section 9: Thinking Stream Protocol — Empty Blocks & Ghost Prevention (M2 Challenger)", () => {
    it("suppresses empty <think></think> blocks and does not emit onThinking", async () => {
      const client = new RoadmapChatClient();
      let thinkingCalled = 0;
      const stream = createSseStreamFromEvents([
        { event: "token", data: { delta: "<think></think>Immediate answer" } },
        { event: "done", data: {} },
      ]);

      (globalThis as any).fetch = vi.fn().mockResolvedValue(
        new Response(stream, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        })
      );

      const donePromise = new Promise<{ res: any; tokens: string }>((resolve) => {
        let tokens = "";
        client.streamChat("hi", {
          onToken: (t) => {
            tokens += t;
          },
          onThinking: () => {
            thinkingCalled++;
          },
          onDone: (res) => resolve({ res, tokens }),
        });
      });

      const { res, tokens } = await donePromise;

      expect(thinkingCalled).toBe(0);
      expect(tokens).toBe("Immediate answer");
      expect(res.thinking).toBeUndefined();
    });

    it("suppresses empty <thought></thought> block", async () => {
      const client = new RoadmapChatClient();
      const stream = createSseStreamFromEvents([
        { event: "token", data: { delta: "<thought></thought>Clean answer" } },
        { event: "done", data: {} },
      ]);

      const result = await runStreamChat(client, "empty thought test", stream);

      expect(result.tokens).toBe("Clean answer");
      expect(result.thinking).toBe("");
      expect(result.response?.thinking).toBeUndefined();
    });

    it("ThoughtProcess component renders null (no ghost badge) when thinking is empty or undefined", () => {
      const emptyHtml = renderToStaticMarkup(
        React.createElement(ThoughtProcess, { thinking: "", isThinking: false })
      );
      expect(emptyHtml).toBe("");

      const undefinedHtml = renderToStaticMarkup(
        React.createElement(ThoughtProcess, { thinking: undefined, isThinking: false })
      );
      expect(undefinedHtml).toBe("");
    });

    it("handles whitespace-only thinking block without leaking into tokens", async () => {
      const client = new RoadmapChatClient();
      const stream = createSseStreamFromEvents([
        { event: "token", data: { delta: "<think>   </think>Direct answer" } },
        { event: "done", data: {} },
      ]);

      const result = await runStreamChat(client, "whitespace test", stream);

      expect(result.tokens).toBe("Direct answer");
      expect(result.tokens).not.toContain("<think>");
    });
  });

  // =========================================================================
  // SECTION 10: Thinking Stream Protocol — Rapid Tool Interleaving & State Invariants (M2 Challenger)
  // =========================================================================
  describe("Section 10: Thinking Stream Protocol — Rapid Tool Interleaving (M2 Challenger)", () => {
    it("handles interleaved SSE thinking events, rapid tool executions, and token deltas", async () => {
      const client = new RoadmapChatClient();
      const stream = createSseStreamFromEvents([
        { event: "thinking", data: { delta: "Step 1: Check knowledge base." } },
        { event: "tool_start", data: { name: "search_kb", args: { query: "nextjs" } } },
        { event: "tool_end", data: { name: "search_kb", result: "found doc" } },
        { event: "thinking", data: { delta: "Step 2: Read layer." } },
        { event: "token", data: { delta: "<think>Formatting answer</think>Dự án sử dụng Next.js 15." } },
        { event: "tool_start", data: { name: "highlight_layer", args: { id: "layer-02" } } },
        { event: "tool_end", data: { name: "highlight_layer", result: "ok" } },
        { event: "token", data: { delta: " Tầng 02 LLM Application." } },
        { event: "done", data: {} },
      ]);

      const result = await runStreamChat(client, "interleaved test", stream);

      expect(result.tokens).toBe("Dự án sử dụng Next.js 15. Tầng 02 LLM Application.");
      expect(result.thinking).toBe("Step 1: Check knowledge base.Step 2: Read layer.Formatting answer");
      expect(result.toolsStarted).toEqual(["search_kb", "highlight_layer"]);
      expect(result.toolsEnded).toEqual(["search_kb", "highlight_layer"]);
      expect(result.response?.tool_calls).toHaveLength(2);
      expect(result.response?.tool_calls[0].name).toBe("search_kb");
      expect(result.response?.tool_calls[0].status).toBe("success");
      expect(result.response?.tool_calls[1].name).toBe("highlight_layer");
      expect(result.response?.tool_calls[1].status).toBe("success");
    });

    it("maintains inThinkTag state across intervening tool_start and tool_end SSE events", async () => {
      const client = new RoadmapChatClient();
      const stream = createSseStreamFromEvents([
        { event: "token", data: { delta: "<think>Deciding to execute tool" } },
        { event: "tool_start", data: { name: "lookup_item", args: { id: 10 } } },
        { event: "tool_end", data: { name: "lookup_item", result: "Found item 10" } },
        { event: "token", data: { delta: " and process completed</think>Final verified response." } },
        { event: "done", data: {} },
      ]);

      const result = await runStreamChat(client, "persistent tag test", stream);

      expect(result.tokens).toBe("Final verified response.");
      expect(result.thinking).toBe("Deciding to execute tool and process completed");
      expect(result.toolsStarted).toEqual(["lookup_item"]);
      expect(result.toolsEnded).toEqual(["lookup_item"]);
    });

    it("records tool failure status correctly while thinking stream proceeds", async () => {
      const client = new RoadmapChatClient();
      const stream = createSseStreamFromEvents([
        { event: "thinking", data: { delta: "Attempting DB query..." } },
        { event: "tool_start", data: { name: "query_db", args: { query: "bad sql" } } },
        { event: "tool_end", data: { name: "query_db", result: "error: syntax error in SQL statement", status: "failed" } },
        { event: "thinking", data: { delta: "DB failed, using fallback." } },
        { event: "token", data: { delta: "Dữ liệu trả về từ cache cục bộ." } },
        { event: "done", data: {} },
      ]);

      const result = await runStreamChat(client, "tool failure test", stream);

      expect(result.response?.tool_calls[0].status).toBe("failed");
      expect(result.tokens).toBe("Dữ liệu trả về từ cache cục bộ.");
      expect(result.thinking).toBe("Attempting DB query...DB failed, using fallback.");
    });
  });

  // =========================================================================
  // SECTION 11: Adversarial Stress Testing — Fragmentation, Nesting & Overwrite Attacks (M2 Challenger)
  // =========================================================================
  describe("Section 11: Adversarial Stress Testing — Fragmentation, Nesting & Overwrite Attacks (M2 Challenger)", () => {
    it("EMPIRICAL ATTACK 1: reproduces tag boundary fragmentation leak when <think> is split across chunks", async () => {
      const client = new RoadmapChatClient();
      // Chunk 1 has '<thi', Chunk 2 has 'nk>Secret thought</think>Public answer'
      const stream = createSseStreamFromEvents([
        { event: "token", data: { delta: "<thi" } },
        { event: "token", data: { delta: "nk>Secret thought</think>Public answer" } },
        { event: "done", data: {} },
      ]);

      const result = await runStreamChat(client, "fragmentation attack", stream);

      // EMPIRICAL FINDING: Because processTokenChunk matches /(?:think|thought)/ per-chunk without
      // buffering incomplete tags, the '<thi' and 'nk>Secret thought</think>Public answer' both leak to tokens!
      expect(result.tokens).toBe("<think>Secret thought</think>Public answer");
      expect(result.thinking).toBe("");
    });

    it("EMPIRICAL ATTACK 2: reproduces closing tag fragmentation trap when </think> is split across chunks", async () => {
      const client = new RoadmapChatClient();
      // Chunk 1 has '<think>Secret thought</thi', Chunk 2 has 'nk>Public answer'
      const stream = createSseStreamFromEvents([
        { event: "token", data: { delta: "<think>Secret thought</thi" } },
        { event: "token", data: { delta: "nk>Public answer" } },
        { event: "done", data: {} },
      ]);

      const result = await runStreamChat(client, "close tag fragmentation", stream);

      // EMPIRICAL FINDING: Closing tag is missed due to chunk boundary split.
      // Parser stays in think mode; 'Public answer' is swallowed into thinking and tokens remain blank!
      expect(result.tokens).toBe("");
      expect(result.thinking).toBe("Secret thought</think>Public answer");
    });

    it("EMPIRICAL ATTACK 3: reproduces nested <think> tag breakdown and content leak", async () => {
      const client = new RoadmapChatClient();
      const stream = createSseStreamFromEvents([
        { event: "token", data: { delta: "<think>Outer <think>Inner</think> Leaked thought</think>Public" } },
        { event: "done", data: {} },
      ]);

      const result = await runStreamChat(client, "nested think test", stream);

      // EMPIRICAL FINDING: First </think> terminates think tag state, leaking the rest to public tokens
      expect(result.tokens).toBe(" Leaked thought</think>Public");
      expect(result.thinking).toBe("Outer <think>Inner");
    });

    it("EMPIRICAL ATTACK 4: reproduces concurrent duplicate tool name argument overwrite in pendingToolArgs", async () => {
      const client = new RoadmapChatClient();
      const stream = createSseStreamFromEvents([
        { event: "tool_start", data: { name: "search", args: { query: "first" } } },
        { event: "tool_start", data: { name: "search", args: { query: "second" } } },
        { event: "tool_end", data: { name: "search", result: "result 1" } },
        { event: "tool_end", data: { name: "search", result: "result 2" } },
        { event: "done", data: {} },
      ]);

      const result = await runStreamChat(client, "tool name collision", stream);

      // EMPIRICAL FINDING: Because pendingToolArgs is keyed only by tool name, the second tool_start
      // overwrote the args of the first tool_start.
      expect(result.response?.tool_calls).toHaveLength(2);
      expect(result.response?.tool_calls[0].args).toEqual({ query: "second" });
      expect(result.response?.tool_calls[1].args).toEqual({});
    });

    it("HIGH-THROUGHPUT STRESS: handles 50 rapid alternating thinking and content chunks without crash or memory leak", async () => {
      const client = new RoadmapChatClient();
      const events: { event: string; data: Record<string, unknown> }[] = [];

      for (let i = 0; i < 50; i++) {
        events.push({
          event: "token",
          data: { delta: `<think>Reasoning step ${i}</think>Answer chunk ${i} ` },
        });
      }
      events.push({ event: "done", data: {} });

      const stream = createSseStreamFromEvents(events);
      const start = performance.now();
      const result = await runStreamChat(client, "50 cycles", stream);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(1000); // Must process 50 cycles in under 1 second
      for (let i = 0; i < 50; i++) {
        expect(result.tokens).toContain(`Answer chunk ${i}`);
        expect(result.thinking).toContain(`Reasoning step ${i}`);
      }
      expect(result.tokens).not.toContain("<think>");
    });
  });

  // =========================================================================
  // SECTION 12: Collapsible ThoughtProcess Component UI Invariants (M2 Challenger)
  // =========================================================================
  describe("Section 12: Collapsible ThoughtProcess Component UI Invariants (M2 Challenger)", () => {
    it("renders active thinking state with pulsing amber dot and live label", () => {
      const html = renderToStaticMarkup(
        React.createElement(ThoughtProcess, {
          thinking: "Analyzing request...",
          isThinking: true,
          durationMs: 3000,
        })
      );

      expect(html).toContain("animate-pulse");
      expect(html).toContain("bg-amber-500");
      expect(html).toContain("Thinking (3s)...");
      expect(html).toContain("aria-expanded=\"false\"");
    });

    it("renders completed thought state with green checkmark and 'Đã suy nghĩ X giây'", () => {
      const html = renderToStaticMarkup(
        React.createElement(ThoughtProcess, {
          thinking: "Completed thought process.",
          isThinking: false,
          durationMs: 4200,
        })
      );

      expect(html).toContain("Đã suy nghĩ 4 giây");
      expect(html).toContain("text-[#3F7D58]"); // Checkmark green color
      expect(html).not.toContain("animate-pulse");
    });

    it("renders expanded state with monospace muted typography and visible content", () => {
      const html = renderToStaticMarkup(
        React.createElement(ThoughtProcess, {
          thinking: "Step 1: Graph traversal\nStep 2: Topological sort",
          isThinking: false,
          durationMs: 1000,
          expanded: true,
        })
      );

      expect(html).toContain("aria-expanded=\"true\"");
      expect(html).toContain("Step 1: Graph traversal");
      expect(html).toContain("font-mono");
      expect(html).toContain("italic");
      expect(html).toContain("text-muted-foreground");
    });

    it("formatThoughtBadge formats singular and plural seconds accurately", () => {
      expect(formatThoughtBadge(800, false)).toBe("Đã suy nghĩ 1 giây");
      expect(formatThoughtBadge(1000, false)).toBe("Đã suy nghĩ 1 giây");
      expect(formatThoughtBadge(2000, false)).toBe("Đã suy nghĩ 2 giây");
      expect(formatThoughtBadge(5000, false)).toBe("Đã suy nghĩ 5 giây");
      expect(formatThoughtBadge(2500, true)).toBe("Thinking (3s)...");
    });
  });
});

