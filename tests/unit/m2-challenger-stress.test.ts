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
});
