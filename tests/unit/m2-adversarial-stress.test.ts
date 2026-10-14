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
